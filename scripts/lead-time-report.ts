/**
 * Antecedência das reservas diretas: que parte das reservas do site teria
 * podido pagar em duas partes, com as regras decididas a 25 out 2026?
 * (docs/pagamento_duas_partes.md, secções 2.1 e 2.3; Fase 0.)
 *
 * Corre onde houver DATABASE_URL de produção (Render → Shell):
 *   npm run report:leadtime            # reservas pagas dos últimos 365 dias
 *   DAYS=90 npm run report:leadtime
 *
 * Só vê o checkout 2.0 (booking_intents pagos). Reservas do widget antigo e
 * dos portais não estão nesta tabela e ficam de fora. A antecedência conta
 * do dia do pagamento até ao check-in.
 */
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../server/db";
import { bookingIntents } from "../drizzle/schema";
import { lisbonToday, planPolicyCode, type PolicyCode } from "../shared/cancellationPolicy";
import {
  daysBetween,
  minLeadDaysForTwoParts,
  twoPartsEligibility,
  TWO_PARTS_RULES,
  type TwoPartsIneligibleReason,
} from "../server/services/payment-plan";

const DAYS = Number(process.env.DAYS || 365);

type Row = {
  id: string;
  checkIn: string;
  createdAt: Date;
  updatedAt: Date;
  ratePlanId: string | null;
  ratePlanType: string | null;
  quote: any;
};

/** A política da tarifa que o hóspede pagou, pela mesma regra que o site usa para a mostrar. */
function policyOf(r: Row): PolicyCode | null {
  const opts = Array.isArray(r.quote?.ratePlanOptions) ? r.quote.ratePlanOptions : [];
  const plan = r.ratePlanId ? opts.find((o: any) => o?.ratePlanId === r.ratePlanId) : null;
  const code = planPolicyCode(plan ?? null);
  if (code) return code;
  return r.ratePlanType === "non_refundable" ? "non_refundable" : null;
}

const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(1)}%` : "n/a");
const eur = (cents: number) => `${Math.round(cents / 100).toLocaleString("pt-PT")} €`;
function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Sem base de dados (DATABASE_URL em falta ou ambiente de preview)");
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const rows = (await db
    .select({
      id: bookingIntents.id,
      checkIn: bookingIntents.checkIn,
      createdAt: bookingIntents.createdAt,
      updatedAt: bookingIntents.updatedAt,
      ratePlanId: bookingIntents.ratePlanId,
      ratePlanType: bookingIntents.ratePlanType,
      quote: bookingIntents.quote,
    })
    .from(bookingIntents)
    .where(and(eq(bookingIntents.status, "paid"), gt(bookingIntents.createdAt, since)))) as Row[];

  const items = rows.map((r) => {
    // O dia que conta é o do PAGAMENTO, não o da criação do checkout: um
    // hóspede que volta pelo email de recuperação dos 7 dias decidiu com
    // menos antecedência. Um intent pago é imutável, por isso o updatedAt é
    // o momento em que passou a pago; createdAt só se o updatedAt faltar.
    const paidAt = r.updatedAt && r.updatedAt.getTime() >= r.createdAt.getTime() ? r.updatedAt : r.createdAt;
    const bookingDate = lisbonToday(paidAt);
    const stayCents = Math.round(Number(r.quote?.total ?? NaN) * 100);
    const policy = policyOf(r);
    return {
      bookingDate,
      month: bookingDate.slice(0, 7),
      lead: daysBetween(bookingDate, r.checkIn),
      policy,
      stayCents,
      verdict: twoPartsEligibility({ policy, checkIn: r.checkIn, bookingDate, stayCents }),
    };
  });

  console.log(`\nAntecedência das reservas diretas (checkout 2.0) · últimos ${DAYS} dias · ${items.length} reservas pagas\n`);
  if (!items.length) {
    console.log("Sem reservas pagas no período.");
    process.exit(0);
  }

  const leads = items.map((i) => i.lead).filter(Number.isFinite);
  const mean = leads.reduce((a, b) => a + b, 0) / (leads.length || 1);
  console.log(`Dias entre a reserva e o check-in: mediana ${median(leads)} · média ${mean.toFixed(1)}`);
  const buckets: Array<[string, (d: number) => boolean]> = [
    ["menos de 14", (d) => d < 14],
    ["14 a 26", (d) => d >= 14 && d <= 26],
    ["27 a 33", (d) => d >= 27 && d <= 33],
    ["34 a 49", (d) => d >= 34 && d <= 49],
    ["50 a 79", (d) => d >= 50 && d <= 79],
    ["80 ou mais", (d) => d >= 80],
  ];
  for (const [label, test] of buckets) {
    const n = leads.filter(test).length;
    console.log(`  ${label.padEnd(12)} ${String(n).padStart(4)} (${pct(n, leads.length)})`);
  }

  console.log("\nPor política de cancelamento da tarifa paga:");
  const policies: Array<PolicyCode | null> = ["moderate", "firm", "strict", "strict_60", "non_refundable", null];
  for (const p of policies) {
    const xs = items.filter((i) => i.policy === p);
    if (!xs.length) continue;
    const label = p ?? "desconhecida";
    if (p && p !== "non_refundable") {
      const min = minLeadDaysForTwoParts(p);
      const enough = xs.filter((i) => i.lead >= min).length;
      console.log(
        `  ${label.padEnd(15)} ${String(xs.length).padStart(4)} reservas · mediana ${median(xs.map((i) => i.lead))} dias · ` +
          `com antecedência ≥ ${min} dias: ${enough} (${pct(enough, xs.length)})`,
      );
    } else {
      console.log(`  ${label.padEnd(15)} ${String(xs.length).padStart(4)} reservas · sempre pagas por inteiro`);
    }
  }

  const bigEnough = items.filter((i) => i.stayCents >= TWO_PARTS_RULES.minStayCents).length;
  console.log(`\nEstadia ≥ ${eur(TWO_PARTS_RULES.minStayCents)}: ${bigEnough} (${pct(bigEnough, items.length)})`);

  const eligible = items.filter((i) => i.verdict.eligible);
  const eligibleValue = eligible.reduce((a, i) => a + i.stayCents, 0);
  console.log(
    `\nElegíveis para duas partes com as regras de 25 out 2026: ${eligible.length} de ${items.length} (${pct(eligible.length, items.length)})` +
      ` · valor de estadia ${eur(eligibleValue)} · metade a cobrar mais tarde ${eur(Math.floor(eligibleValue / 2))}`,
  );
  const reasons: Record<TwoPartsIneligibleReason, number> = { policy: 0, lead_time: 0, min_stay: 0, invalid: 0 };
  for (const i of items) if (!i.verdict.eligible) reasons[i.verdict.reason] += 1;
  console.log(
    `  fora por tarifa ${reasons.policy} · por antecedência ${reasons.lead_time} · por valor ${reasons.min_stay}` +
      (reasons.invalid ? ` · datas ilegíveis ${reasons.invalid}` : ""),
  );

  console.log("\nPor mês da reserva (reservas · elegíveis):");
  const months = Array.from(new Set(items.map((i) => i.month))).sort();
  for (const mo of months) {
    const xs = items.filter((i) => i.month === mo);
    const el = xs.filter((i) => i.verdict.eligible).length;
    console.log(`  ${mo}  ${String(xs.length).padStart(4)} · ${String(el).padStart(4)} (${pct(el, xs.length)})`);
  }
  if (items.length < 30) console.log("\nAtenção: menos de 30 reservas, as percentagens ainda não são fiáveis.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e?.message ?? e);
  process.exit(1);
});
