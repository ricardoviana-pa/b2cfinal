/**
 * Regras puras do diagnóstico de quotes (scripts/quote-health.mjs), testáveis.
 *
 * Auditoria 29 out 2026 (prices-availability-02): datas simplesmente
 * fechadas apareciam em "SEM QUOTE LIVE (corrigir no Guesty/BE)", o
 * listing de teste do Guesty era cotado e as 35 casas parceiras não.
 */

/** As mesmas exclusões do site (properties-store.ts: EXCLUDED_SLUG_PATTERNS + filterPublicProperties). */
const EXCLUDED_SLUG_PATTERNS = ['villa-luzia', 'test-guesty-test'];

export function isPublicHome(p) {
  if (!p || p.isActive === false) return false;
  const slug = String(p.slug || '').toLowerCase();
  if (EXCLUDED_SLUG_PATTERNS.some((s) => slug.includes(s))) return false;
  if (/test/i.test(String(p.title || p.name || ''))) return false;
  const base = Number(p.basePrice || p.pricePerNight || p.priceFrom || 0);
  if (base > 0 && base < 20) return false;
  return true;
}

/** Casas nossas (Guesty) a cotar: as de montra (isPortfolio) nunca têm preço online. */
export function isQuotableOwnHome(p) {
  return isPublicHome(p) && p.source !== 'tripwix' && !!(p.guestyId || p.listingId) && !p.isPortfolio;
}

export function isPartnerHome(p) {
  return isPublicHome(p) && p.source === 'tripwix' && typeof p.supplierUid === 'string' && !!p.supplierUid;
}

/** Noites de uma estadia (o dia da saída não conta). */
export function stayNights(checkIn, checkOut) {
  const out = [];
  const start = Date.parse(`${checkIn}T00:00:00Z`);
  const end = Date.parse(`${checkOut}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return out;
  for (let t = start; t < end; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * O que o calendário (booking.getCalendar) diz da estadia. A mesma regra do
 * servidor (calendarStayVerdict em server/services/guesty.ts):
 *   unavailable  uma noite que não está "available", chegada fechada, saída
 *                fechada, ou estadia mínima do dia de chegada maior do que a estadia
 *   open         todas as noites da estadia vieram e estão abertas
 *   unknown      faltam noites (ou o calendário veio vazio): não se sabe.
 *                O booking.getCalendar responde {days: []} a qualquer falha
 *                do BE, por isso "vazio" é quase sempre o BE em baixo, não
 *                datas abertas (revisão do PR #173).
 */
export function calendarStayVerdict(days, checkIn, checkOut) {
  const byDate = new Map((Array.isArray(days) ? days : []).filter((d) => d && typeof d.date === 'string').map((d) => [d.date, d]));
  const nights = stayNights(checkIn, checkOut);
  if (!nights.length) return { status: 'unknown', detail: 'datas inválidas' };
  const closed = nights.filter((date) => byDate.has(date) && byDate.get(date).status !== 'available');
  if (closed.length) return { status: 'unavailable', detail: `${closed.length} noite(s) fechada(s) no calendário` };
  const arrival = byDate.get(checkIn);
  if (arrival?.cta === true) return { status: 'unavailable', detail: 'chegada fechada nesse dia' };
  if (byDate.get(checkOut)?.ctd === true) return { status: 'unavailable', detail: 'saída fechada nesse dia' };
  const min = Number(arrival?.minNights);
  if (Number.isFinite(min) && min > nights.length) return { status: 'unavailable', detail: `estadia mínima de ${min} noites` };
  const missing = nights.filter((date) => !byDate.has(date)).length;
  if (missing) {
    return { status: 'unknown', detail: byDate.size ? `${missing} de ${nights.length} noites sem dados no calendário` : 'calendário vazio (BE em baixo?)' };
  }
  return { status: 'open' };
}

/**
 * Onde cai uma quote das nossas casas:
 *   live         preço live (ou em cache) do BE
 *   unavailable  datas fechadas (o servidor diz `unavailable`, ou available:false sem ser por pedido)
 *   request      casa em "reserva por pedido" nessas datas (config do Guesty)
 *   fallback     sem preço live (estimate/base): precisa do calendário para se saber se é avaria
 */
export function classifyOwnQuote(q) {
  if (!q || typeof q !== 'object') return { bucket: 'error', detail: 'sem resposta' };
  if (q.source === 'live' || q.source === 'cached') return { bucket: 'live', total: q.pricing?.total };
  if (q.requestOnly) return { bucket: 'request', detail: 'reserva por pedido nestas datas' };
  if (q.unavailable || q.available === false) {
    const why = { min_stay: 'estadia mínima', advance_notice: 'antecedência' }[q.unavailableReason];
    return { bucket: 'unavailable', detail: why || q.fallbackMessage || 'datas fechadas' };
  }
  return { bucket: 'fallback', detail: q.fallbackMessage || q.source || 'sem preço live' };
}

/** Quote de uma casa parceira (booking.partnerQuote, calendário guardado pelo job). */
export function classifyPartnerQuote(q, minNights) {
  if (q === null || q === undefined) return { bucket: 'no-calendar', detail: 'sem calendário da Tripwix (ver logs [Tripwix])' };
  if (q.available) return { bucket: 'live', total: q.total };
  if (q.unavailable?.length) return { bucket: 'unavailable', detail: `${q.unavailable.length} noite(s) ocupada(s)` };
  if (minNights && q.nights < minNights) return { bucket: 'unavailable', detail: `estadia mínima de ${minNights} noites` };
  return { bucket: 'unavailable', detail: 'regras da casa (estadia mínima / hóspedes)' };
}
