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
 *   tsx scripts/checkout2-backfill.ts                 → só relatório (não escreve nada)
 *   tsx scripts/checkout2-backfill.ts --only=GY-XXXX  → limita a uma reserva
 *   tsx scripts/checkout2-backfill.ts --apply         → põe os cartões em carteira
 *
 * O modo --apply só faz uma coisa: pendurar no Guesty o cartão que o hóspede
 * já usou. Não cobra ninguém, não altera folios, não mexe em preços. Qualquer
 * correção de saldo é decisão comercial e fica listada no relatório para o
 * Ricardo decidir — nunca aplicada por este script.
 *
 * CORRER SEMPRE NO SERVIÇO DE PRODUÇÃO. O dev usa Stripe em modo de teste mas
 * escreve no Guesty real: ali este script não encontra os pagamentos certos e
 * o que encontrasse não teria cartão válido do lado do Guesty.
 */
import Stripe from "stripe";
import {
  fetchPaymentProviderId,
  fetchReservationGuestId,
  attachGuestPaymentMethod,
  getReservationBalanceDue,
} from "../server/services/guesty-openapi-paypal";

const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).trim();

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
  /** Resultado depois de --apply: true posto, false falhou, undefined não tentado. */
  cardDone?: boolean;
  /** Porque é que esta linha não tem (ou não conseguiu ter) cartão em carteira. */
  motivo?: string;
  balanceDue: number | null;
  created: string;
};

/** Um cartão só é pendurável se soubermos QUAL cartão e em que alojamento. */
function porqueNaoDaParaPor(r: Row): string | null {
  if (r.cardAlready) return null;
  if (!r.paymentMethodId) return "PI sem payment_method";
  if (!r.listingId) return "PI sem listingId";
  return null;
}

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY em falta");
  const stripe = new Stripe(key);

  const modo = APPLY ? "APLICAR" : "RELATORIO";
  console.log(`\n=== BACKFILL CHECKOUT 2.0 — modo ${modo}${ONLY ? ` — só ${ONLY}` : ""} ===`);
  console.log(`Stripe: ${key.startsWith("sk_live") ? "LIVE" : "TESTE (atenção: não é produção)"}\n`);

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

  // --only serve para aplicar a UMA reserva e confirmar no Guesty antes de
  // mexer nas restantes. Aceita o código (GY-...) ou o id interno.
  const alvo = ONLY
    ? rows.filter((r) => r.code === ONLY || r.reservationId === ONLY)
    : rows;
  if (ONLY && !alvo.length) {
    console.log(`Nenhuma reserva do checkout 2.0 com "${ONLY}". Códigos encontrados:`);
    for (const r of rows) console.log(`  ${r.code}  (${r.reservationId})`);
    return;
  }

  console.log(
    `Reservas do checkout 2.0 encontradas: ${rows.length}${ONLY ? ` — a tratar 1` : ""}\n`,
  );

  for (const r of alvo) {
    r.balanceDue = await getReservationBalanceDue(r.reservationId);

    const bloqueio = porqueNaoDaParaPor(r);
    if (bloqueio) {
      r.motivo = bloqueio;
      continue;
    }
    if (!APPLY || r.cardAlready) continue;

    const [providerId, guestId] = await Promise.all([
      fetchPaymentProviderId(r.listingId!),
      fetchReservationGuestId(r.reservationId),
    ]);
    if (!providerId || !guestId) {
      r.cardDone = false;
      r.motivo = !providerId ? "Guesty sem payment provider no alojamento" : "Guesty sem guestId";
      continue;
    }
    const att = await attachGuestPaymentMethod({
      guestId,
      paymentMethodId: r.paymentMethodId!,
      paymentProviderId: providerId,
      reservationId: r.reservationId,
    });
    r.cardDone = att.ok;
    if (att.ok) {
      // Marca no Stripe para o settle e uma segunda corrida não repetirem.
      await stripe.paymentIntents.update(r.pi, { metadata: { cardOnFile: "1" } });
    } else {
      r.motivo = att.error;
    }
  }

  // ── Relatório ────────────────────────────────────────────────────────────
  console.log("DATA              CODIGO           COBRADO   SALDO GUESTY   CARTAO");
  console.log("-".repeat(96));
  const comSaldo: Row[] = [];
  for (const r of alvo) {
    const saldo = r.balanceDue == null ? "     (n/d)" : r.balanceDue.toFixed(2).padStart(10);
    const cartao = r.cardAlready
      ? "ja tinha"
      : r.cardDone === true
        ? "POSTO"
        : r.cardDone === false
          ? "FALHOU"
          : "em falta";
    const obs = r.motivo ? `  <- ${r.motivo}` : "";
    console.log(
      `${r.created}  ${r.code.padEnd(14)} ${eur(r.chargedCents)}  ${saldo}   ${cartao}${obs}`,
    );
    if (r.balanceDue != null && r.balanceDue > 0.5) comSaldo.push(r);
  }

  console.log("\n" + "=".repeat(96));
  const jaTinham = alvo.filter((r) => r.cardAlready || r.cardDone === true).length;
  const semCartao = alvo.filter((r) => !r.cardAlready && r.cardDone !== true);
  const recuperaveis = semCartao.filter((r) => !porqueNaoDaParaPor(r));
  console.log(`Total de reservas .................. ${alvo.length}`);
  console.log(`Com cartao em carteira ............ ${jaTinham}`);
  console.log(`AINDA sem cartao .................. ${semCartao.length}`);
  if (!APPLY) {
    console.log(`  destas, recuperaveis ............ ${recuperaveis.length}`);
    console.log(`  destas, sem hipotese ............ ${semCartao.length - recuperaveis.length}`);
  }
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
    console.log("\n(relatorio apenas — nada foi escrito)");
    if (recuperaveis.length) {
      console.log(`Para pôr o cartao de UMA so, e confirmar no Guesty antes das outras:`);
      console.log(`  tsx scripts/checkout2-backfill.ts --apply --only=${recuperaveis[0].code}`);
    }
  }
  console.log("");
}

main().catch((e) => {
  console.error("\nBACKFILL FALHOU:", e?.message || e);
  process.exit(1);
});
