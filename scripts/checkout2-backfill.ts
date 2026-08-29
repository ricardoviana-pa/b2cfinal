/**
 * Backfill do checkout 2.0 — cartão em carteira + auditoria de saldos.
 *
 * Porquê: o fluxo antigo (BE instant) mandava o cartão tokenizado para o
 * Guesty, que ficava dono dele e cobrava caução, danos e qualquer saldo. O
 * checkout 2.0 cobra no nosso Stripe e só REGISTA o valor — o Guesty ficou sem
 * cartão nenhum. Duas consequências, ambas tratadas aqui:
 *
 *   1. Perdemos a capacidade de cobrar o hóspede depois do check-in.
 *   2. Divergências de preço entre o site e o Guesty, que antes o Guesty
 *      resolvia sozinho cobrando o cartão, passaram a ficar como saldo aberto.
 *
 * Modos:
 *   tsx scripts/checkout2-backfill.ts            → só relatório (não escreve nada)
 *   tsx scripts/checkout2-backfill.ts --apply    → põe os cartões em carteira
 *
 * O modo --apply só faz uma coisa: pendurar no Guesty o cartão que o hóspede
 * já usou. Não cobra ninguém, não altera folios, não mexe em preços. Qualquer
 * correção de saldo é decisão comercial e fica listada no relatório para o
 * Ricardo decidir — nunca aplicada por este script.
 */
import Stripe from "stripe";
import {
  fetchPaymentProviderId,
  fetchReservationGuestId,
  attachGuestPaymentMethod,
  getReservationBalanceDue,
} from "../server/services/guesty-openapi-paypal";

const APPLY = process.argv.includes("--apply");

function eur(cents: number): string {
  return (cents / 100).toFixed(2).padStart(9) + " EUR";
}

type Row = {
  pi: string;
  reservationId: string;
  code: string;
  chargedCents: number;
  listingId?: string;
  paymentMethodId?: string;
  cardAlready: boolean;
  cardDone?: boolean;
  balanceDue: number | null;
  created: string;
};

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY em falta");
  const stripe = new Stripe(key);

  console.log(`\n=== BACKFILL CHECKOUT 2.0 — modo ${APPLY ? "APLICAR" : "RELATORIO"} ===\n`);

  // Todos os pagamentos do checkout 2.0 que já geraram reserva no Guesty.
  const rows: Row[] = [];
  let page: string | undefined;
  do {
    const res = await stripe.paymentIntents.search({
      query: `status:'succeeded' AND metadata['flow']:'card_v2'`,
      limit: 100,
      ...(page ? { page } : {}),
    });
    for (const pi of res.data) {
      const md = pi.metadata || {};
      if (!md.guestyReservationId) continue; // pagou mas nunca chegou a reserva — caso à parte
      const pm = pi.payment_method;
      rows.push({
        pi: pi.id,
        reservationId: md.guestyReservationId,
        code: md.guestyConfirmationCode || "?",
        chargedCents: pi.amount,
        listingId: md.listingId,
        paymentMethodId: typeof pm === "string" ? pm : (pm as any)?.id,
        cardAlready: md.cardOnFile === "1",
        balanceDue: null,
        created: new Date(pi.created * 1000).toISOString().slice(0, 16).replace("T", " "),
      });
    }
    page = res.has_more ? (res.next_page ?? undefined) : undefined;
  } while (page);

  rows.sort((a, b) => a.created.localeCompare(b.created));
  console.log(`Reservas do checkout 2.0 encontradas: ${rows.length}\n`);

  for (const r of rows) {
    r.balanceDue = await getReservationBalanceDue(r.reservationId);

    if (APPLY && !r.cardAlready && r.paymentMethodId && r.listingId) {
      const [providerId, guestId] = await Promise.all([
        fetchPaymentProviderId(r.listingId),
        fetchReservationGuestId(r.reservationId),
      ]);
      if (providerId && guestId) {
        r.cardDone = await attachGuestPaymentMethod({
          guestId,
          paymentMethodId: r.paymentMethodId,
          paymentProviderId: providerId,
          reservationId: r.reservationId,
        });
        if (r.cardDone) {
          await stripe.paymentIntents.update(r.pi, { metadata: { cardOnFile: "1" } });
        }
      } else {
        r.cardDone = false;
      }
    }
  }

  // ── Relatório ────────────────────────────────────────────────────────────
  console.log(
    "DATA             CODIGO         COBRADO      SALDO GUESTY   CARTAO",
  );
  console.log("-".repeat(78));
  const comSaldo: Row[] = [];
  for (const r of rows) {
    const saldo = r.balanceDue == null ? "     (n/d)" : r.balanceDue.toFixed(2).padStart(10);
    const cartao = r.cardAlready
      ? "ja tinha"
      : r.cardDone === true
        ? "POSTO"
        : r.cardDone === false
          ? "FALHOU"
          : "em falta";
    console.log(
      `${r.created}  ${r.code.padEnd(14)} ${eur(r.chargedCents)}  ${saldo}   ${cartao}`,
    );
    if (r.balanceDue != null && r.balanceDue > 0.5) comSaldo.push(r);
  }

  console.log("\n" + "=".repeat(78));
  const semCartao = rows.filter((r) => !r.cardAlready && r.cardDone !== true).length;
  console.log(`Total de reservas .................. ${rows.length}`);
  console.log(`Com cartao em carteira ............ ${rows.length - semCartao}`);
  console.log(`AINDA sem cartao .................. ${semCartao}`);
  console.log(`Com saldo aberto no Guesty ........ ${comSaldo.length}`);

  if (comSaldo.length) {
    const totalGap = comSaldo.reduce((s, r) => s + (r.balanceDue ?? 0), 0);
    console.log(`\nSALDOS ABERTOS — total ${totalGap.toFixed(2)} EUR`);
    console.log("Estes hospedes pagaram o preco que o site lhes mostrou. O saldo e a");
    console.log("diferenca entre esse preco e o que o Guesty atribuiu a mesma estadia.");
    console.log("NAO foi corrigido por este script: mexer no folio altera a receita do");
    console.log("proprietario, e isso e decisao do Ricardo.\n");
    for (const r of comSaldo) {
      console.log(
        `  ${r.code.padEnd(14)} cobrado ${(r.chargedCents / 100).toFixed(2)} | saldo Guesty ${r.balanceDue!.toFixed(2)} | reserva ${r.reservationId}`,
      );
    }
  }

  if (!APPLY) {
    console.log("\n(relatorio apenas — corre com --apply para pôr os cartoes em carteira)");
  }
  console.log("");
}

main().catch((e) => {
  console.error("\nBACKFILL FALHOU:", e?.message || e);
  process.exit(1);
});
