/**
 * Field Core Web Vitals report, from the anonymous rows client/src/lib/vitals.ts
 * sends to /api/vitals. Google's pass mark is the 75th percentile: LCP ≤ 2500 ms,
 * INP ≤ 200 ms, CLS ≤ 0.1.
 *
 * Runs where the production DATABASE_URL is (Render → Shell):
 *   npm run report:vitals                 # last 7 days, mobile
 *   DAYS=28 DEVICE=desktop npm run report:vitals
 */
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../server/db";
import { webVitals } from "../drizzle/schema";

const DAYS = Number(process.env.DAYS || 7);
const DEVICE = process.env.DEVICE || "mobile";
const PASS: Record<string, number> = { LCP: 2500, INP: 200, CLS: 0.1, FCP: 1800, TTFB: 800 };

type Row = { metric: string; value: number; page: string; target: string | null; detail: string | null };

const pct = (xs: number[], p: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const fmt = (metric: string, v: number) => (Number.isNaN(v) ? "-" : metric === "CLS" ? v.toFixed(3) : `${Math.round(v)} ms`);
const detailOf = (r: Row): Record<string, any> => { try { return r.detail ? JSON.parse(r.detail) : {}; } catch { return {}; } };

function table(rows: Row[], metric: string, groupBy: (r: Row) => string, limit = 12) {
  const groups = new Map<string, Row[]>();
  for (const r of rows.filter(r => r.metric === metric)) {
    const k = groupBy(r);
    groups.set(k, [...(groups.get(k) || []), r]);
  }
  return [...groups.entries()]
    .map(([k, rs]) => ({ k, n: rs.length, p75: pct(rs.map(r => r.value), 0.75), rs }))
    .sort((a, b) => b.n * b.p75 - a.n * a.p75)
    .slice(0, limit);
}

async function main() {
  const db = await getDb();
  if (!db) throw new Error("No database (DATABASE_URL missing, or a preview deployment)");
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const rows: Row[] = await db
    .select({ metric: webVitals.metric, value: webVitals.value, page: webVitals.page, target: webVitals.target, detail: webVitals.detail })
    .from(webVitals)
    .where(and(eq(webVitals.device, DEVICE), gt(webVitals.createdAt, since)));

  console.log(`\nField Core Web Vitals · ${DEVICE} · last ${DAYS} days · ${rows.length} measurements\n`);
  for (const metric of ["LCP", "INP", "CLS", "FCP", "TTFB"]) {
    const vs = rows.filter(r => r.metric === metric).map(r => r.value);
    const p75 = pct(vs, 0.75);
    console.log(`${metric.padEnd(5)} p75 ${fmt(metric, p75).padStart(9)}  ${p75 <= PASS[metric] ? "pass" : "FAIL"}  (n=${vs.length})`);
  }

  console.log("\nLCP by page (p75; median TTFB / load delay / load time / render delay)");
  for (const g of table(rows, "LCP", r => r.page)) {
    const d = g.rs.map(detailOf);
    const med = (k: string) => Math.round(pct(d.map(x => x[k]).filter((x: unknown) => typeof x === "number"), 0.5) || 0);
    console.log(`  ${g.k.padEnd(28)} ${fmt("LCP", g.p75).padStart(9)} n=${String(g.n).padEnd(5)} ${med("ttfb")}/${med("rld")}/${med("rlt")}/${med("erd")} ms`);
  }

  console.log("\nSlowest interactions (INP p75 by page + element)");
  for (const g of table(rows, "INP", r => `${r.page}  ${r.target || "?"}`, 15)) {
    const d = g.rs.map(detailOf);
    const med = (k: string) => Math.round(pct(d.map(x => x[k]).filter((x: unknown) => typeof x === "number"), 0.5) || 0);
    console.log(`  ${fmt("INP", g.p75).padStart(8)} n=${String(g.n).padEnd(4)} delay/processing/paint ${med("id")}/${med("pd")}/${med("pr")} ms  ${g.k.slice(0, 110)}`);
  }

  const scripts = new Map<string, number[]>();
  for (const r of rows.filter(r => r.metric === "INP" && r.value > PASS.INP)) {
    const d = detailOf(r);
    if (d.ss) scripts.set(d.ss, [...(scripts.get(d.ss) || []), d.sd || 0]);
  }
  console.log("\nScripts behind slow interactions (INP > 200 ms)");
  for (const [src, ds] of [...scripts.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
    console.log(`  ${String(ds.length).padStart(4)}×  median ${Math.round(pct(ds, 0.5))} ms  ${src}`);
  }

  console.log("\nLayout shifts (CLS p75 by page + element)");
  for (const g of table(rows, "CLS", r => `${r.page}  ${r.target || "?"}`, 8)) {
    console.log(`  ${fmt("CLS", g.p75).padStart(6)} n=${String(g.n).padEnd(4)} ${g.k.slice(0, 110)}`);
  }
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });
