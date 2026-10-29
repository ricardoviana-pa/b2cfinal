/**
 * Relatório do funil do checkout: onde é que as pessoas desistem de facto.
 *
 * Lê booking_intents (um intent = alguém carregou em "Reservar" numa casa,
 * depois de ver o preço total no widget) e conta quantos chegaram a cada
 * passo, a partir dos campos gravados, não do pixel:
 *   1. intent criado            (carregou em Reservar)
 *   2. email deixado            (fim do passo 1)
 *   3. receção escolhida        (fim do passo 2, escolha obrigatória)
 *   4. pagamento tentado        (PaymentIntent criado ou status payment_pending)
 *   5. pago
 *
 * Cada segmento sai duas vezes, lado a lado: em bruto e sem os rascunhos
 * repetidos (sem email e com outro checkout da mesma casa nos 60 minutos
 * seguintes: a mesma pessoa a carregar outra vez em "Reservar"). A janela
 * nunca começa antes de 17 set 2026, porque até 16 set o DEV escrevia nesta
 * tabela. Regras em server/services/checkout-funnel.ts (com testes).
 *
 * Corre onde houver DATABASE_URL de produção (Render → Shell):
 *   npm run report:funnel
 *   DAYS=90 npm run report:funnel
 *   DAYS=60 LIST=1 npm run report:funnel   # + lista para ligar
 *   SINCE=2026-10-01 npm run report:funnel # a partir de uma data (também antes de 17 set, de propósito)
 *
 * Só lê. Não escreve nada na base de dados.
 */
import { gt } from "drizzle-orm";
import { getDb } from "../server/db";
import { bookingIntents } from "../drizzle/schema";
import {
  DUPLICATE_DRAFT_WINDOW_MS,
  FUNNEL_CLEAN_SINCE,
  FUNNEL_STEPS,
  funnelPair,
  funnelRowSets,
  funnelWindowStart,
} from "../server/services/checkout-funnel";

const DAYS = Number(process.env.DAYS || 60);
const SINCE = process.env.SINCE || "";
const LIST = process.env.LIST === "1";

type Row = typeof bookingIntents.$inferSelect;

const total = (r: Row) => Number((r.quote as any)?.total ?? 0);
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "-");
const eur = (n: number) => `${Math.round(n).toLocaleString("pt-PT")} €`;
const day = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Sem base de dados (DATABASE_URL em falta ou ambiente de preview)");
  const span = funnelWindowStart({ days: DAYS, since: SINCE });
  const all = await db.select().from(bookingIntents).where(gt(bookingIntents.createdAt, span.start));
  const { raw, clean, internal, duplicates } = funnelRowSets(all);

  const from = span.explicit
    ? `desde ${day(span.start)} (SINCE)`
    : span.clamped
      ? `desde ${FUNNEL_CLEAN_SINCE} (DAYS=${DAYS} começava antes; até 16 set o DEV escrevia nesta tabela)`
      : `últimos ${DAYS} dias`;
  console.log(`\nFunil do checkout · ${from} · ${raw.length} intents com mais de 24 h (${internal} internos excluídos)`);
  if (span.explicit && day(span.start) < FUNNEL_CLEAN_SINCE) {
    console.log(`Atenção: antes de ${FUNNEL_CLEAN_SINCE} há intents do DEV misturados com os de produção.`);
  }
  console.log(`Rascunhos repetidos (sem email, com outro checkout da mesma casa nos ${DUPLICATE_DRAFT_WINDOW_MS / 60_000} min seguintes): ${duplicates}\n`);
  const print = (lines: string[]) => console.log(lines.join("\n"));
  print(funnelPair("Todos", raw, clean));

  console.log("\nPor valor da estadia:");
  const buckets: Array<[string, number, number]> = [["< 1.500 €", 0, 1500], ["1.500 a 3.000 €", 1500, 3000], ["3.000 a 6.000 €", 3000, 6000], ["> 6.000 €", 6000, Infinity]];
  for (const [l, lo, hi] of buckets) print(funnelPair(l, raw, clean, (r) => total(r) >= lo && total(r) < hi));

  console.log("\nPor antecedência (dias até ao check-in):");
  const lead = (r: Row) => (new Date(r.checkIn).getTime() - r.createdAt.getTime()) / 86_400_000;
  const leads: Array<[string, number, number]> = [["0 a 14 dias", -1, 14], ["15 a 60 dias", 14, 60], ["61 a 180 dias", 60, 180], ["> 180 dias", 180, Infinity]];
  for (const [l, lo, hi] of leads) print(funnelPair(l, raw, clean, (r) => lead(r) > lo && lead(r) <= hi));

  console.log("\nPor língua:");
  const locales = Array.from(new Set(raw.map((r) => r.locale || "?")));
  for (const loc of locales) print(funnelPair(loc, raw, clean, (r) => (r.locale || "?") === loc));

  console.log("\nPor tarifa:");
  for (const t of ["flexible", "non_refundable", "other"]) print(funnelPair(t, raw, clean, (r) => r.ratePlanType === t));

  // Curiosos ou compradores? Pessoas (email) com vários intents e se alguma
  // acabou por pagar. Os repetidos não têm email: estas contas não mudam.
  const byEmail = new Map<string, Row[]>();
  for (const r of clean) if (r.email) byEmail.set(r.email.toLowerCase(), [...(byEmail.get(r.email.toLowerCase()) ?? []), r]);
  const people = Array.from(byEmail.values());
  const multi = people.filter((xs) => xs.length > 1);
  const paidPeople = people.filter((xs) => xs.some(FUNNEL_STEPS.paid));
  console.log(`\nPessoas com email: ${people.length} · com 2 ou mais intents: ${multi.length} · que acabaram por pagar: ${paidPeople.length} (${pct(paidPeople.length, people.length)})`);
  const anonRaw = raw.filter((r) => !r.email).length;
  const anonClean = clean.filter((r) => !r.email).length;
  console.log(`Intents sem email (saíram no passo 1, impossíveis de recuperar): ${anonClean} sem repetidos (${pct(anonClean, clean.length)}) · ${anonRaw} em bruto (${pct(anonRaw, raw.length)})`);

  const failedPay = clean.filter((r) => FUNNEL_STEPS.payment(r) && !FUNNEL_STEPS.paid(r));
  const value = failedPay.reduce((s, r) => s + total(r), 0);
  console.log(`\nTentaram pagar e não pagaram: ${failedPay.length} intents · ${eur(value)} em estadias`);
  console.log("→ cruzar os payment_intent_id abaixo com o Stripe (motivo da recusa, 3DS, limite do cartão)");

  if (LIST) {
    console.log("\nLista para ligar (tentaram pagar ou deixaram telefone, não pagaram, check-in futuro):");
    const today = new Date().toISOString().slice(0, 10);
    const toCall = clean
      .filter((r) => !FUNNEL_STEPS.paid(r) && r.checkIn > today && (FUNNEL_STEPS.payment(r) || r.guestPhone))
      .sort((a, b) => total(b) - total(a));
    for (const r of toCall) {
      console.log(
        [r.createdAt.toISOString().slice(0, 10), r.propertyName, `${r.checkIn}→${r.checkOut}`, `${r.guests}p`, eur(total(r)),
          r.status, r.guestFirstName ?? "", r.guestPhone ?? "", r.email ?? "", r.paymentIntentId ?? ""].join(" | "),
      );
    }
  }
  process.exit(0);
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
