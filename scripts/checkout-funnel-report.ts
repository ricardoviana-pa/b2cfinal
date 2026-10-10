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
 * Corre onde houver DATABASE_URL de produção (Render → Shell):
 *   npm run report:funnel
 *   DAYS=90 npm run report:funnel
 *   DAYS=60 LIST=1 npm run report:funnel   # + lista para ligar
 *
 * Só lê. Não escreve nada na base de dados.
 */
import { gt } from "drizzle-orm";
import { getDb } from "../server/db";
import { bookingIntents } from "../drizzle/schema";

const DAYS = Number(process.env.DAYS || 60);
const LIST = process.env.LIST === "1";
// DEV e produção partilharam a tabela (incidente de 16/09): tirar testes internos
const INTERNAL = /@portugalactive\.com$|test|teste|example\.|mailinator/i;

type Row = typeof bookingIntents.$inferSelect;

const total = (r: Row) => Number((r.quote as any)?.total ?? 0);
const reached = {
  intent: (_: Row) => true,
  email: (r: Row) => !!r.email,
  reception: (r: Row) => !!r.reception || !!r.paymentIntentId || r.status === "payment_pending" || r.status === "paid",
  payment: (r: Row) => !!r.paymentIntentId || r.status === "payment_pending" || r.status === "paid",
  paid: (r: Row) => r.status === "paid",
};
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "-");
const eur = (n: number) => `${Math.round(n).toLocaleString("pt-PT")} €`;

function funnel(label: string, rows: Row[]) {
  const n = (k: keyof typeof reached) => rows.filter(reached[k]).length;
  const [a, b, c, d, e] = [n("intent"), n("email"), n("reception"), n("payment"), n("paid")];
  console.log(
    `${label.padEnd(26)} ${String(a).padStart(4)} → email ${String(b).padStart(4)} (${pct(b, a)}) → receção ${String(c).padStart(4)} (${pct(c, b)})` +
      ` → pagamento ${String(d).padStart(4)} (${pct(d, c)}) → pago ${String(e).padStart(3)} (${pct(e, d)})  | total ${pct(e, a)}`,
  );
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Sem base de dados (DATABASE_URL em falta ou ambiente de preview)");
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const all = await db.select().from(bookingIntents).where(gt(bookingIntents.createdAt, since));
  const rows = all.filter((r) => !(r.email && INTERNAL.test(r.email)));
  // Intents com menos de 24h ainda podem fechar: ficam fora das taxas
  const settled = rows.filter((r) => Date.now() - r.createdAt.getTime() > 86_400_000);

  console.log(`\nFunil do checkout · últimos ${DAYS} dias · ${settled.length} intents (${all.length - rows.length} internos excluídos)\n`);
  funnel("Todos", settled);

  console.log("\nPor valor da estadia:");
  const buckets: Array<[string, number, number]> = [["< 1.500 €", 0, 1500], ["1.500 a 3.000 €", 1500, 3000], ["3.000 a 6.000 €", 3000, 6000], ["> 6.000 €", 6000, Infinity]];
  for (const [l, lo, hi] of buckets) funnel(l, settled.filter((r) => total(r) >= lo && total(r) < hi));

  console.log("\nPor antecedência (dias até ao check-in):");
  const lead = (r: Row) => (new Date(r.checkIn).getTime() - r.createdAt.getTime()) / 86_400_000;
  const leads: Array<[string, number, number]> = [["0 a 14 dias", -1, 14], ["15 a 60 dias", 14, 60], ["61 a 180 dias", 60, 180], ["> 180 dias", 180, Infinity]];
  for (const [l, lo, hi] of leads) funnel(l, settled.filter((r) => lead(r) > lo && lead(r) <= hi));

  console.log("\nPor língua:");
  const locales = Array.from(new Set(settled.map((r) => r.locale || "?")));
  for (const loc of locales) funnel(loc, settled.filter((r) => (r.locale || "?") === loc));

  console.log("\nPor tarifa:");
  for (const t of ["flexible", "non_refundable", "other"]) funnel(t, settled.filter((r) => r.ratePlanType === t));

  // Curiosos ou compradores? Pessoas (email) com vários intents e se alguma acabou por pagar
  const byEmail = new Map<string, Row[]>();
  for (const r of settled) if (r.email) byEmail.set(r.email.toLowerCase(), [...(byEmail.get(r.email.toLowerCase()) ?? []), r]);
  const people = Array.from(byEmail.values());
  const multi = people.filter((xs) => xs.length > 1);
  const paidPeople = people.filter((xs) => xs.some(reached.paid));
  console.log(`\nPessoas com email: ${people.length} · com 2 ou mais intents: ${multi.length} · que acabaram por pagar: ${paidPeople.length} (${pct(paidPeople.length, people.length)})`);
  const anon = settled.filter((r) => !r.email).length;
  console.log(`Intents sem email (saíram no passo 1, impossíveis de recuperar): ${anon} (${pct(anon, settled.length)})`);

  const failedPay = settled.filter((r) => reached.payment(r) && !reached.paid(r));
  const value = failedPay.reduce((s, r) => s + total(r), 0);
  console.log(`\nTentaram pagar e não pagaram: ${failedPay.length} intents · ${eur(value)} em estadias`);
  console.log("→ cruzar os payment_intent_id abaixo com o Stripe (motivo da recusa, 3DS, limite do cartão)");

  if (LIST) {
    console.log("\nLista para ligar (tentaram pagar ou deixaram telefone, não pagaram, check-in futuro):");
    const today = new Date().toISOString().slice(0, 10);
    const toCall = settled
      .filter((r) => !reached.paid(r) && r.checkIn > today && (reached.payment(r) || r.guestPhone))
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
