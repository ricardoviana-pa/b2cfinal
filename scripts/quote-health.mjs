/**
 * Diagnóstico de saúde das quotes, casa a casa (auditoria set/2026: a Eben
 * Lodge não dava quote live em nenhum teste e ninguém sabia).
 *
 * Percorre o catálogo e pede uma quote real a cada listing, com throttle
 * (1 pedido / 1.5s) para não esgotar o rate limit do Guesty — foi exatamente
 * isso que uma sondagem sem throttle causou em produção a 23 set.
 *
 * Uso:
 *   node scripts/quote-health.mjs                        # produção
 *   HOST=https://dev.portugalactive.com node scripts/quote-health.mjs
 *   CHECKIN=2027-01-11 CHECKOUT=2027-01-16 node scripts/quote-health.mjs
 *
 * Casas em "BASE/FALLBACK" de forma consistente = provável configuração em
 * falta no Booking Engine (rate plan, listing inativo). Corrigir no Guesty.
 */
import fs from "node:fs";

const HOST = (process.env.HOST || "https://www.portugalactive.com").replace(/\/+$/, "");
// Janela a ~7 semanas, meio de semana: costuma estar aberta e sem mínimos de época alta
const future = new Date(Date.now() + 49 * 86400000);
const monday = new Date(future.getTime() + ((8 - future.getUTCDay()) % 7) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const CHECKIN = process.env.CHECKIN || iso(monday);
const CHECKOUT = process.env.CHECKOUT || iso(new Date(monday.getTime() + 5 * 86400000));
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 1500);

const raw = JSON.parse(fs.readFileSync(new URL("../client/src/data/properties.json", import.meta.url), "utf8"));
const props = (raw.properties || raw).filter((p) => p.guestyId || p.listingId);

const rows = { live: [], base: [], unavailable: [], error: [] };
console.log(`Quote health · ${HOST} · ${CHECKIN} → ${CHECKOUT} · ${props.length} casas · ${THROTTLE_MS}ms entre pedidos\n`);

for (const p of props) {
  const id = p.guestyId || p.listingId;
  const name = String(p.name || id).slice(0, 56);
  const input = encodeURIComponent(JSON.stringify({ 0: { json: { listingId: id, checkIn: CHECKIN, checkOut: CHECKOUT, guests: 2 } } }));
  try {
    const r = await fetch(`${HOST}/api/trpc/booking.getQuote?batch=1&input=${input}`);
    const q = (await r.json())?.[0]?.result?.data?.json;
    if (!q) rows.error.push({ name, detail: `HTTP ${r.status}` });
    else if (q.available === false) rows.unavailable.push({ name });
    else if (q.source === "live" || q.source === "cached") rows.live.push({ name, total: q.pricing?.total });
    else rows.base.push({ name, detail: q.fallbackMessage || q.source });
    process.stdout.write(q?.source === "live" || q?.source === "cached" ? "." : q?.available === false ? "u" : "F");
  } catch (e) {
    rows.error.push({ name, detail: e?.message });
    process.stdout.write("E");
  }
  await new Promise((res) => setTimeout(res, THROTTLE_MS));
}

console.log(`\n\nRESULTADO: live/cached ${rows.live.length} · fallback ${rows.base.length} · indisponíveis ${rows.unavailable.length} · erros ${rows.error.length}\n`);
const list = (title, arr) => {
  if (!arr.length) return;
  console.log(title);
  arr.forEach((r) => console.log(`  - ${r.name}${r.detail ? `  (${r.detail})` : ""}`));
  console.log("");
};
list("SEM QUOTE LIVE (corrigir no Guesty/BE):", rows.base);
list("INDISPONÍVEIS nas datas de teste (normal se ocupadas; testar outra janela):", rows.unavailable);
list("ERROS:", rows.error);
process.exit(rows.base.length || rows.error.length ? 1 : 0);
