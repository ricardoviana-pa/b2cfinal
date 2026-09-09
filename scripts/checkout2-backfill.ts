/**
 * Auditoria do checkout 2.0 — valor da reserva, payout a proprietários, cartão.
 *
 * PORQUÊ ISTO EXISTE
 *
 * As reservas do checkout 2.0 foram criadas sem `ratePlanId` (o settle lia-o do
 * sítio errado — ver resolveRatePlanId em checkout-card-charge.ts). Sem plano,
 * o Guesty preçou cada reserva no plano POR OMISSÃO da listagem, não no plano
 * que o hóspede comprou. O PriceLabs manda na tarifa por noite e essa está
 * correcta dos dois lados; o que diverge é o plano.
 *
 * A consequência cara não é o saldo aberto — é o payout ao proprietário. O que
 * pagamos ao dono da casa sai do VALOR DA RESERVA no Guesty (fareAccommodation),
 * não do que entrou em caixa. Se essa fare foi calculada no plano errado, então:
 *
 *   fare ACIMA do vendido  → pagamos ao proprietário sobre dinheiro que nunca
 *                            recebemos. Prejuízo directo da empresa.
 *   fare ABAIXO do vendido → o proprietário recebeu a menos do que lhe é devido.
 *
 * Ambos os sentidos aparecem no relatório, com totais. Isto NÃO se limita às
 * reservas com saldo aberto: essas são só as visíveis. A fare está errada em
 * todas as que foram vendidas num plano diferente do plano por omissão.
 *
 * MODOS
 *   tsx scripts/checkout2-backfill.ts                 → só relatório (não escreve)
 *   tsx scripts/checkout2-backfill.ts --only=GY-XXXX  → limita a uma reserva
 *   tsx scripts/checkout2-backfill.ts --apply         → põe os cartões em carteira
 *
 * O --apply só pendura no Guesty o cartão que o hóspede já usou. Não cobra
 * ninguém, não altera fares, não mexe em folios nem em payouts. Corrigir o
 * valor de uma reserva mexe na receita do proprietário e é decisão comercial —
 * fica listado para o Ricardo decidir, nunca aplicado por este script.
 *
 * CORRER SEMPRE NO SERVIÇO DE PRODUÇÃO. O dev usa Stripe em modo de teste mas
 * escreve no Guesty real.
 */
import Stripe from "stripe";
import {
  fetchPaymentProviderId,
  fetchReservationGuestId,
  attachGuestPaymentMethod,
  fetchReservationMoney,
} from "../server/services/guesty-openapi-paypal";
import { getBookingIntent } from "../server/db";

const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").slice(7).trim();

const eur = (n: number | null, w = 10) => (n == null ? "(n/d)".padStart(w) : n.toFixed(2).padStart(w));

type Row = {
  pi: string;
  reservationId: string;
  code: string;
  created: string;
  /** Total cobrado ao hóspede no Stripe (estadia + extras + Flex). */
  chargedCents: number;
  /** Só a parte da estadia — é esta que tem correspondência no Guesty. */
  stayCents: number;
  listingId?: string;
  paymentMethodId?: string;
  intentId?: string;
  /** Plano que o hóspede escolheu; vazio = a reserva nasceu sem plano. */
  ratePlanId: string;
  /** Estadia vendida, do snapshot da cotação: alojamento + limpeza. */
  soldAccommodation: number | null;
  soldCleaning: number | null;
  /** O que o Guesty registou — a base do payout ao proprietário. */
  guestyAccommodation: number | null;
  guestyCleaning: number | null;
  guestyBalanceDue: number | null;
  guestyTotalPaid: number | null;
  cardAlready: boolean;
  cardDone?: boolean;
  motivo?: string;
};

/** Desvio na fare de alojamento: positivo = o Guesty tem MAIS do que vendemos. */
function fareGap(r: Row): number | null {
  if (r.guestyAccommodation == null || r.soldAccommodation == null) return null;
  return Math.round((r.guestyAccommodation - r.soldAccommodation) * 100) / 100;
}

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

  console.log(`\n=== AUDITORIA CHECKOUT 2.0 — modo ${APPLY ? "APLICAR" : "RELATORIO"}${ONLY ? ` — so ${ONLY}` : ""} ===`);
  console.log(`Stripe: ${key.startsWith("sk_live") ? "LIVE" : "TESTE (atencao: nao e producao)"}\n`);

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
      if (!md.guestyReservationId) continue; // pagou mas nunca chegou a reserva
      const pm = pi.payment_method;
      rows.push({
        pi: pi.id,
        reservationId: md.guestyReservationId,
        code: md.guestyConfirmationCode || "?",
        created: new Date(pi.created * 1000).toISOString().slice(0, 10),
        chargedCents: pi.amount,
        stayCents: Number(md.stayCents || 0),
        listingId: md.listingId,
        paymentMethodId: typeof pm === "string" ? pm : (pm as any)?.id,
        intentId: md.intentId,
        ratePlanId: "",
        soldAccommodation: null,
        soldCleaning: null,
        guestyAccommodation: null,
        guestyCleaning: null,
        guestyBalanceDue: null,
        guestyTotalPaid: null,
        cardAlready: md.cardOnFile === "1",
      });
    }
    page = res.has_more ? (res.next_page ?? undefined) : undefined;
  } while (page);

  rows.sort((a, b) => a.created.localeCompare(b.created));

  const alvo = ONLY ? rows.filter((r) => r.code === ONLY || r.reservationId === ONLY) : rows;
  if (ONLY && !alvo.length) {
    console.log(`Nenhuma reserva com "${ONLY}". Codigos encontrados:`);
    for (const r of rows) console.log(`  ${r.code}  (${r.reservationId})`);
    return;
  }
  console.log(`Reservas do checkout 2.0: ${rows.length}${ONLY ? " — a tratar 1" : ""}\n`);

  for (const r of alvo) {
    // O que foi VENDIDO: snapshot da cotação que o hóspede viu, e o plano que
    // escolheu. Sem isto não há termo de comparação para a fare do Guesty.
    if (r.intentId) {
      const intent: any = await getBookingIntent(r.intentId);
      if (intent) {
        r.ratePlanId = String(intent.ratePlanId ?? "").trim();
        const q = intent.quote ?? {};
        r.soldAccommodation = typeof q.totalNights === "number" ? q.totalNights : null;
        r.soldCleaning = typeof q.cleaningFee === "number" ? q.cleaningFee : null;
      }
    }
    // O que o GUESTY registou — a base do payout ao proprietário.
    const money = await fetchReservationMoney(r.reservationId);
    if (money) {
      r.guestyAccommodation = money.fareAccommodation;
      r.guestyCleaning = money.fareCleaning;
      r.guestyBalanceDue = money.balanceDue;
      r.guestyTotalPaid = money.totalPaid;
    }

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
      r.motivo = !providerId ? "Guesty sem payment provider" : "Guesty sem guestId";
      continue;
    }
    const att = await attachGuestPaymentMethod({
      guestId,
      paymentMethodId: r.paymentMethodId!,
      paymentProviderId: providerId,
      reservationId: r.reservationId,
    });
    r.cardDone = att.ok;
    if (att.ok) await stripe.paymentIntents.update(r.pi, { metadata: { cardOnFile: "1" } });
    else r.motivo = att.error;
  }

  // ── 1. Payout a proprietários — o dinheiro a sério ────────────────────────
  console.log("=".repeat(100));
  console.log("VALOR DA RESERVA: o que vendemos  vs  o que o Guesty registou (base do payout)");
  console.log("=".repeat(100));
  console.log("DATA        CODIGO          ALOJ.VENDIDO  ALOJ.GUESTY      DESVIO  PLANO");
  console.log("-".repeat(100));
  const aMais: Row[] = [];
  const aMenos: Row[] = [];
  const semDados: Row[] = [];
  for (const r of alvo) {
    const gap = fareGap(r);
    if (gap == null) semDados.push(r);
    else if (gap > 0.5) aMais.push(r);
    else if (gap < -0.5) aMenos.push(r);
    const marca = gap == null ? "" : gap > 0.5 ? "  <<< PAGAMOS A MAIS" : gap < -0.5 ? "  <<< proprietario a menos" : "";
    console.log(
      `${r.created}  ${r.code.padEnd(14)} ${eur(r.soldAccommodation, 12)} ${eur(r.guestyAccommodation, 12)} ${eur(gap, 11)}  ${(r.ratePlanId || "SEM PLANO").slice(0, 12).padEnd(12)}${marca}`,
    );
  }

  const somaMais = aMais.reduce((s, r) => s + (fareGap(r) ?? 0), 0);
  const somaMenos = aMenos.reduce((s, r) => s + (fareGap(r) ?? 0), 0);
  console.log("\n" + "-".repeat(100));
  console.log(`Reservas analisadas ................................. ${alvo.length}`);
  console.log(`Guesty ACIMA do vendido (pagamos a mais ao dono) .... ${aMais.length}   ${somaMais.toFixed(2)} EUR`);
  console.log(`Guesty ABAIXO do vendido (dono recebeu a menos) ..... ${aMenos.length}   ${Math.abs(somaMenos).toFixed(2)} EUR`);
  console.log(`Sem dados para comparar ............................. ${semDados.length}`);
  if (aMais.length) {
    console.log(
      `\nEXPOSICAO: ${somaMais.toFixed(2)} EUR de receita que o Guesty atribuiu a estas reservas e que\n` +
        `nunca entrou em caixa. O payout ao proprietario assenta nesse numero, nao no cobrado.\n` +
        `Estas sao as reservas a rever primeiro:\n`,
    );
    for (const r of aMais) {
      console.log(
        `  ${r.code.padEnd(14)} vendido ${eur(r.soldAccommodation, 9)} | Guesty ${eur(r.guestyAccommodation, 9)} | a mais ${eur(fareGap(r), 8)} | ${r.reservationId}`,
      );
    }
  }

  // ── 2. Saldos que o hóspede aparenta dever, e não deve ────────────────────
  const comSaldo = alvo.filter((r) => (r.guestyBalanceDue ?? 0) > 0.5);
  if (comSaldo.length) {
    const total = comSaldo.reduce((s, r) => s + (r.guestyBalanceDue ?? 0), 0);
    console.log("\n" + "=".repeat(100));
    console.log(`SALDOS ABERTOS — ${comSaldo.length} reservas, ${total.toFixed(2)} EUR`);
    console.log("=".repeat(100));
    console.log("O Guesty mostra isto como 'pending payment collection'. NAO e divida do hospede:");
    console.log("ele pagou por inteiro o preco que o site lhe apresentou. NAO lhe pedir pagamento");
    console.log("nem dados de cartao.\n");
    for (const r of comSaldo) {
      console.log(
        `  ${r.code.padEnd(14)} cobrado ${eur(r.stayCents / 100, 9)} | Guesty registou ${eur((r.guestyTotalPaid ?? 0) + (r.guestyBalanceDue ?? 0), 9)} | em aberto ${eur(r.guestyBalanceDue, 8)}`,
      );
    }
  }

  // ── 3. Cartão em carteira ─────────────────────────────────────────────────
  const jaTinham = alvo.filter((r) => r.cardAlready || r.cardDone === true).length;
  const semCartao = alvo.filter((r) => !r.cardAlready && r.cardDone !== true);
  const recuperaveis = semCartao.filter((r) => !porqueNaoDaParaPor(r));
  console.log("\n" + "=".repeat(100));
  console.log("CARTAO EM CARTEIRA");
  console.log("=".repeat(100));
  console.log(`Com cartao ......................................... ${jaTinham}`);
  console.log(`Sem cartao ......................................... ${semCartao.length}`);
  if (!APPLY) {
    console.log(`  recuperaveis ..................................... ${recuperaveis.length}`);
    console.log(`  sem hipotese ..................................... ${semCartao.length - recuperaveis.length}`);
  }
  for (const r of semCartao.filter((x) => x.motivo)) {
    console.log(`  ${r.code.padEnd(14)} ${r.motivo}`);
  }

  if (!APPLY) {
    console.log("\n(relatorio apenas — nada foi escrito)");
    if (recuperaveis.length) {
      console.log(`Para pôr o cartao de UMA so e confirmar no Guesty antes das outras:`);
      console.log(`  tsx scripts/checkout2-backfill.ts --apply --only=${recuperaveis[0].code}`);
    }
  }
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nAUDITORIA FALHOU:", e?.message || e);
    process.exit(1);
  });
