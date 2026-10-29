/**
 * Diagnóstico de saúde das quotes, casa a casa (auditoria set/2026: a Eben
 * Lodge não dava quote live em nenhum teste e ninguém sabia).
 *
 * Percorre as casas que o site publica e pede uma quote real a cada uma, com
 * throttle (1 pedido / 1.5s) para não esgotar o rate limit do Guesty — foi
 * exatamente isso que uma sondagem sem throttle causou em produção a 23 set.
 *
 * Auditoria 29 out 2026 (prices-availability-02):
 * - As casas vêm de properties.listForSite do HOST (o que o site publica): o
 *   listing de teste do Guesty fica de fora e entram as casas parceiras.
 * - Um "sem preço live" (base/estimate) com o calendário fechado nessas
 *   noites conta como INDISPONÍVEL, não como avaria a corrigir no Guesty.
 *   Com o calendário vazio ou incompleto (o BE em baixo responde {days: []})
 *   fica em "calendário ilegível", à parte: não se sabe se as noites estão
 *   abertas, por isso não é para corrigir no Guesty sem repetir.
 * - As casas parceiras (Tripwix) são cotadas pelo caminho delas
 *   (booking.partnerQuote): servem o calendário que o job guardou, sem
 *   chamadas à Tripwix.
 * - Verificação de 29 out 2026 (Tripwix P1): para cada parceira, também até
 *   onde chega o calendário (booking.partnerCalendar, o ano). Nove casas
 *   paravam a 2027-03-04 e a quote de teste, a ~7 semanas, não o via.
 *
 * Uso:
 *   node scripts/quote-health.mjs                        # produção
 *   HOST=https://dev.portugalactive.com node scripts/quote-health.mjs
 *   CHECKIN=2027-01-11 CHECKOUT=2027-01-16 node scripts/quote-health.mjs
 *   PARTNERS=0 node scripts/quote-health.mjs             # só as nossas casas
 *   PARTNER_CALENDARS=0 node scripts/quote-health.mjs    # sem ver até onde vai o calendário das parceiras
 *
 * Casas em "SEM QUOTE LIVE" de forma consistente = provável configuração em
 * falta no Booking Engine (rate plan, listing inativo). Corrigir no Guesty.
 */
import fs from "node:fs";
import {
  calendarStayVerdict,
  classifyOwnQuote,
  classifyPartnerQuote,
  isPartnerHome,
  isQuotableOwnHome,
  isPublicHome,
  partnerCalendarHorizon,
  stayNights,
} from "./lib/quote-health.mjs";

const HOST = (process.env.HOST || "https://www.portugalactive.com").replace(/\/+$/, "");
// Janela a ~7 semanas, meio de semana: costuma estar aberta e sem mínimos de época alta
const future = new Date(Date.now() + 49 * 86400000);
const monday = new Date(future.getTime() + ((8 - future.getUTCDay()) % 7) * 86400000);
const iso = (d) => d.toISOString().slice(0, 10);
const CHECKIN = process.env.CHECKIN || iso(monday);
const CHECKOUT = process.env.CHECKOUT || iso(new Date(monday.getTime() + 5 * 86400000));
const THROTTLE_MS = Number(process.env.THROTTLE_MS || 1500);
const WITH_PARTNERS = process.env.PARTNERS !== "0";
// Até onde chega o calendário de cada parceira (um GET a mais por casa).
const WITH_PARTNER_CALENDARS = WITH_PARTNERS && process.env.PARTNER_CALENDARS !== "0";
const TODAY = iso(new Date());
const YEAR_END = iso(new Date(Date.now() + 365 * 86400000));

async function trpc(path, input) {
  const payload = input === undefined ? { 0: { json: null, meta: { values: ["undefined"] } } } : { 0: { json: input } };
  const r = await fetch(`${HOST}/api/trpc/${path}?batch=1&input=${encodeURIComponent(JSON.stringify(payload))}`);
  const body = await r.json().catch(() => null);
  return { status: r.status, data: body?.[0]?.result?.data?.json };
}

/** O que o HOST publica; sem resposta, os ficheiros locais com as mesmas exclusões do site. */
async function loadHomes() {
  try {
    const { status, data } = await trpc("properties.listForSite");
    if (Array.isArray(data) && data.length) return { homes: data.filter(isPublicHome), origin: `${HOST} (listForSite)` };
    throw new Error(`HTTP ${status}`);
  } catch (e) {
    const read = (rel) => {
      const url = new URL(rel, import.meta.url);
      return fs.existsSync(url) ? JSON.parse(fs.readFileSync(url, "utf8")) : [];
    };
    const own = read("../client/src/data/properties.json");
    const partner = read("../client/src/data/tripwix-properties.json");
    console.warn(`listForSite indisponível (${e?.message ?? e}); a usar os ficheiros locais`);
    return { homes: [...(own.properties || own), ...partner].filter(isPublicHome), origin: "ficheiros locais" };
  }
}

const { homes, origin } = await loadHomes();
const own = homes.filter(isQuotableOwnHome);
const partners = WITH_PARTNERS ? homes.filter(isPartnerHome) : [];
const lastNight = stayNights(CHECKIN, CHECKOUT).at(-1) || CHECKIN;

const rows = { live: [], base: [], unreadable: [], unavailable: [], request: [], noCalendar: [], shortCalendar: [], error: [] };
const mark = { live: ".", unavailable: "u", request: "p", fallback: "F", unreadable: "?", "no-calendar": "T", error: "E" };
console.log(`Quote health · ${HOST} · ${CHECKIN} → ${CHECKOUT} · ${own.length} casas nossas + ${partners.length} parceiras (${origin}) · ${THROTTLE_MS}ms entre pedidos\n`);

for (const p of own) {
  const id = p.guestyId || p.listingId;
  const name = String(p.name || id).slice(0, 56);
  let bucket = "error";
  try {
    const { status, data: q } = await trpc("booking.getQuote", { listingId: id, checkIn: CHECKIN, checkOut: CHECKOUT, guests: 2 });
    const c = q ? classifyOwnQuote(q) : { bucket: "error", detail: `HTTP ${status}` };
    bucket = c.bucket;
    if (c.bucket === "fallback") {
      // Sem preço live: é avaria do Guesty só se o calendário tiver as noites
      // abertas. Um calendário vazio ou com noites em falta não prova nada (o
      // getCalendar responde {days: []} quando o BE falha): lista à parte.
      await new Promise((res) => setTimeout(res, THROTTLE_MS));
      const cal = await trpc("booking.getCalendar", { listingId: id, from: CHECKIN, to: CHECKOUT }).catch((e) => ({ status: 0, data: null, error: e }));
      const verdict = cal.status === 200
        ? calendarStayVerdict(cal.data?.days, CHECKIN, CHECKOUT)
        : { status: "unknown", detail: `getCalendar respondeu ${cal.status || cal.error?.message || "sem resposta"}` };
      if (verdict.status === "unavailable") {
        bucket = "unavailable";
        rows.unavailable.push({ name, detail: `${verdict.detail}; o servidor respondeu "sem preço live"` });
      } else if (verdict.status === "unknown") {
        bucket = "unreadable";
        rows.unreadable.push({ name, detail: `${verdict.detail}; ${c.detail}` });
      } else rows.base.push({ name, detail: c.detail });
    } else if (c.bucket === "live") rows.live.push({ name, total: c.total });
    else if (c.bucket === "unavailable") rows.unavailable.push({ name, detail: c.detail });
    else if (c.bucket === "request") rows.request.push({ name, detail: c.detail });
    else rows.error.push({ name, detail: c.detail });
  } catch (e) {
    rows.error.push({ name, detail: e?.message });
  }
  process.stdout.write(mark[bucket] ?? "?");
  await new Promise((res) => setTimeout(res, THROTTLE_MS));
}

if (partners.length) process.stdout.write(" | parceiras: ");
for (const p of partners) {
  const name = `${String(p.name || p.supplierUid).slice(0, 48)} (parceira)`;
  let bucket = "error";
  try {
    const { status, data: q } = await trpc("booking.partnerQuote", { tripwixUid: p.supplierUid, checkIn: CHECKIN, checkOut: CHECKOUT, guests: 2 });
    if (status !== 200) throw new Error(`HTTP ${status}`);
    const c = classifyPartnerQuote(q, p.minNights);
    bucket = c.bucket;
    if (c.bucket === "live") rows.live.push({ name, total: c.total });
    else if (c.bucket === "unavailable") rows.unavailable.push({ name, detail: c.detail });
    else rows.noCalendar.push({ name, detail: c.detail });
  } catch (e) {
    rows.error.push({ name, detail: e?.message });
  }
  process.stdout.write(mark[bucket] ?? "?");
  await new Promise((res) => setTimeout(res, THROTTLE_MS));
  // A quote de teste é daqui a ~7 semanas: um calendário que pára a meio do
  // ano (nove casas a 2027-03-04, verificação de 29 out 2026) passava por bom.
  if (!WITH_PARTNER_CALENDARS) continue;
  try {
    const cal = await trpc("booking.partnerCalendar", { tripwixUid: p.supplierUid, startDate: TODAY, endDate: YEAR_END });
    if (cal.status === 200) {
      const h = partnerCalendarHorizon(cal.data, TODAY);
      if (h.status === "short") rows.shortCalendar.push({ name, detail: h.detail });
      else if (h.status === "none" && bucket !== "no-calendar") rows.noCalendar.push({ name, detail: h.detail });
    }
  } catch (e) {
    rows.error.push({ name: `${name} (calendário)`, detail: e?.message });
  }
  await new Promise((res) => setTimeout(res, THROTTLE_MS));
}

console.log(
  `\n\nRESULTADO: live/cached ${rows.live.length} · fallback ${rows.base.length} · calendário ilegível ${rows.unreadable.length}` +
  ` · indisponíveis ${rows.unavailable.length} · por pedido ${rows.request.length} · parceiras sem calendário ${rows.noCalendar.length}` +
  (WITH_PARTNER_CALENDARS ? ` · parceiras com calendário curto ${rows.shortCalendar.length}` : "") +
  ` · erros ${rows.error.length} (noites ${CHECKIN} → ${lastNight})\n`,
);
const list = (title, arr) => {
  if (!arr.length) return;
  console.log(title);
  arr.forEach((r) => console.log(`  - ${r.name}${r.detail ? `  (${r.detail})` : ""}`));
  console.log("");
};
list("SEM QUOTE LIVE com as noites abertas (corrigir no Guesty/BE):", rows.base);
list("SEM QUOTE LIVE e CALENDÁRIO ILEGÍVEL (o BE pode estar em baixo: ver logs [Booking] getCalendar FAILED e repetir antes de mexer no Guesty):", rows.unreadable);
list("PARCEIRAS SEM CALENDÁRIO (ver logs [Tripwix] no Render; perguntar à Tripwix se persistir):", rows.noCalendar);
list("PARCEIRAS COM CALENDÁRIO CURTO (o site mostra os dias seguintes \"a pedido\", sem preço; perguntar à Tripwix):", rows.shortCalendar);
list("INDISPONÍVEIS nas datas de teste (normal se ocupadas; testar outra janela):", rows.unavailable);
list("POR PEDIDO nas datas de teste (configuração do Guesty):", rows.request);
list("ERROS:", rows.error);
process.exit(rows.base.length || rows.unreadable.length || rows.noCalendar.length || rows.error.length ? 1 : 0);
