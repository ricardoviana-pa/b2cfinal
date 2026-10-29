/**
 * GUESTY API SERVICE
 * Uses centralized server/lib/guesty client.
 * When Open API OAuth is rate-limited, falls through to Booking Engine API
 * (which uses separate credentials and is typically not rate-limited).
 */

import { guestyClient } from "../lib/guesty";
import { BoundedMap } from "../lib/boundedMap";
import { isBEApiConfigured, createBEQuote, beQuotesUnderPressure, type BERatePlanOption } from "./guesty-booking";
import { getPropertiesForSite } from "./properties-store";

type QuoteSource = "live" | "cached" | "base" | "request";

const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 min for live quotes
const QUOTE_CACHE_FALLBACK_TTL_MS = 3 * 60 * 1000; // 3 min for base-price fallbacks (retry sooner)
// Chave = casa + datas + hóspedes: sem teto crescia com cada pesquisa.
const quoteCache = new BoundedMap<string, { expiresAt: number; value: QuoteResult }>(2000);
/** In-flight dedup: concurrent getQuote calls for same params share one promise. */
const inFlightGetQuotes = new Map<string, Promise<QuoteResult>>();

function getQuoteCacheKey(listingId: string, checkIn: string, checkOut: string, guests: number): string {
  return `${listingId}:${checkIn}:${checkOut}:${guests}`;
}

function getCachedQuote(key: string): QuoteResult | null {
  const item = quoteCache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    quoteCache.delete(key);
    return null;
  }
  return item.value;
}

/** Mensagem legível de um erro do Guesty. O GuestyClientError às vezes traz
 *  um objeto em `message` e os logs mostravam "[object Object]" (Eben Lodge). */
export function describeGuestyError(err: any): string {
  const pick = (v: unknown): string =>
    typeof v === "string" ? v : v == null ? "" : (() => { try { return JSON.stringify(v); } catch { return String(v); } })();
  const msg = pick(err?.message);
  const details = err?.details != null ? pick(err.details) : "";
  const status = err?.status != null ? `HTTP ${err.status}` : "";
  const out = [status, msg && msg !== "[object Object]" ? msg : "", details].filter(Boolean).join(" · ");
  return (out || pick(err) || "unknown error").slice(0, 500);
}

/** O Guesty responde assim quando a casa está em "reserva por pedido" nas datas. */
export function isRequestOnlyError(reason: string): boolean {
  return /only available by request/i.test(reason);
}

/** Porque é que umas datas não se podem reservar (para a mensagem do cliente). */
export type UnavailableReason = "dates" | "min_stay" | "advance_notice";

/**
 * O BE recusou ESTAS datas (noites fechadas, estadia mínima, antecedência):
 * é uma resposta definitiva, não uma avaria — não melhora com retry e não se
 * mostra como "não conseguimos confirmar o preço". As frases vêm de
 * parseBEError (guesty-booking.ts) e do 422 do BE.
 */
export function datesUnavailableReason(reason: string): UnavailableReason | null {
  if (/minimum stay rule/i.test(reason)) return "min_stay";
  if (/advance notice rule/i.test(reason)) return "advance_notice";
  if (/not available for the selected dates/i.test(reason)) return "dates";
  return null;
}

type StayVerdict = { status: "unavailable"; reason: UnavailableReason } | { status: "open" } | { status: "unknown" };

/**
 * O que o calendário do BE diz das NOITES de uma estadia (o dia da saída não
 * é uma noite). Auditoria 29 out 2026 (prices-availability-02): só
 * booked/blocked/maintenance contavam como fechadas, e as noites
 * "unavailable" (Lima River Houses, 12–18 jan) passavam, devolvendo o
 * basePrice do Guesty com available:true. Agora qualquer estado que não seja
 * "available" fecha a estadia, tal como a chegada fechada (cta), a saída
 * fechada (ctd) e a estadia mínima do dia de chegada.
 */
export function calendarStayVerdict(days: any[], checkIn: string, checkOut: string): StayVerdict {
  const byDate = new Map<string, any>();
  for (const d of Array.isArray(days) ? days : []) if (d && typeof d.date === "string") byDate.set(d.date, d);
  const start = Date.parse(checkIn + "T00:00:00Z");
  const end = Date.parse(checkOut + "T00:00:00Z");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { status: "unknown" };
  const nights: string[] = [];
  for (let t = start; t < end; t += 86_400_000) nights.push(new Date(t).toISOString().slice(0, 10));
  let missing = false;
  for (const date of nights) {
    const day = byDate.get(date);
    if (!day) { missing = true; continue; }
    if (day.status !== "available") return { status: "unavailable", reason: "dates" };
  }
  const arrival = byDate.get(checkIn);
  if (arrival?.cta === true) return { status: "unavailable", reason: "dates" };
  if (byDate.get(checkOut)?.ctd === true) return { status: "unavailable", reason: "dates" };
  const minNights = Number(arrival?.minNights);
  if (Number.isFinite(minNights) && minNights > nights.length) return { status: "unavailable", reason: "min_stay" };
  return missing ? { status: "unknown" } : { status: "open" };
}

function setCachedQuote(key: string, value: QuoteResult): void {
  // Never cache "price on request" (failed) results — allow immediate retry
  if (value.source === "request") return;
  // Base-price fallbacks get a shorter TTL so we retry live quotes sooner
  const ttl = value.source === "base" ? QUOTE_CACHE_FALLBACK_TTL_MS : QUOTE_CACHE_TTL_MS;
  quoteCache.set(key, { expiresAt: Date.now() + ttl, value });
}

/* ================================================================
   FALLBACK-RATE ALERT (auditoria set/2026)
   Quando o BE deixa de dar quotes live, o site inteiro degrada para
   "contact a concierge" em silêncio. Janela deslizante de resultados;
   acima do limiar dispara UM email de ops por hora. Fail-soft.
   ================================================================ */
const OUTCOME_WINDOW_MS = 10 * 60 * 1000;
const ALERT_MIN_SAMPLES = 8;
const ALERT_FALLBACK_RATIO = 0.7;
const ALERT_THROTTLE_MS = 60 * 60 * 1000;
const quoteOutcomes: Array<{ at: number; ok: boolean }> = [];
let lastFallbackAlertAt = 0;

function recordQuoteOutcome(ok: boolean, listingId: string): void {
  const now = Date.now();
  quoteOutcomes.push({ at: now, ok });
  while (quoteOutcomes.length && quoteOutcomes[0].at < now - OUTCOME_WINDOW_MS) quoteOutcomes.shift();
  if (quoteOutcomes.length > 500) quoteOutcomes.splice(0, quoteOutcomes.length - 500);

  const total = quoteOutcomes.length;
  const fallbacks = quoteOutcomes.filter((o) => !o.ok).length;
  if (
    total >= ALERT_MIN_SAMPLES &&
    fallbacks / total >= ALERT_FALLBACK_RATIO &&
    now - lastFallbackAlertAt > ALERT_THROTTLE_MS
  ) {
    lastFallbackAlertAt = now;
    import("./transactional-email")
      .then(({ sendOpsAlert }) =>
        sendOpsAlert(
          `QUOTES EM FALLBACK — ${fallbacks}/${total} nos últimos 10 min`,
          [
            `O Booking Engine não está a devolver quotes live: ${fallbacks} de ${total} pedidos caíram para preço estimado ou "price on request" nos últimos 10 minutos.`,
            `Último listing afetado: ${listingId}.`,
            `Impacto: os hóspedes veem "contact a Concierge" em vez do preço — o site não vende enquanto isto durar.`,
            `Causas típicas: rate limit da API Guesty, credenciais BE, ou avaria do lado deles.`,
          ],
        ),
      )
      .catch(() => {/* alerta nunca pode partir o funil */});
    console.warn(`[getQuote] ALERTA: ${fallbacks}/${total} quotes em fallback nos últimos 10 min`);
  }
}

export interface AvailabilityResult {
  available: boolean;
  listingId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
}

export interface QuoteResult {
  available: boolean;
  listingId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  currency: string;
  pricing: {
    nightlyRate: number;
    totalNights: number;
    cleaningFee: number;
    subtotal: number;
    total: number;
    /** Taxes, service fees, and other mandatory charges included in total */
    taxesAndFees?: number;
  };
  source?: QuoteSource;
  fallbackMessage?: string;
  /** A casa é reservada por pedido nestas datas (config do Guesty) — não é falha */
  requestOnly?: boolean;
  /** Datas fechadas (o calendário ou o BE disseram-no): available é false e não é falha de preço. */
  unavailable?: boolean;
  unavailableReason?: UnavailableReason;
  /**
   * Sem cotação live (o BE falhou e nada prova que as datas estão fechadas).
   * O bloco `pricing` vem a zeros DE PROPÓSITO: o basePrice do Guesty é um
   * valor de referência, não um preço, e nunca se mostra como tal.
   */
  estimate?: boolean;
  /** Present when source is "live" or "cached" — the BE quote ID for payment processing. */
  quoteId?: string;
  ratePlanId?: string;
  ratePlanOptions?: BERatePlanOption[];
}

export interface ReservationResult {
  confirmationCode: string;
  reservationId: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
}

export async function checkAvailability(
  listingId: string,
  checkIn: string,
  checkOut: string
): Promise<AvailabilityResult> {
  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );

  try {
    // Check calendar availability via BE API (returns flat array)
    const days = await guestyClient.getListingCalendar(listingId, checkIn, checkOut);
    const dayList = Array.isArray(days) ? days : (days?.days || []);
    const allAvailable = dayList.length > 0 && dayList.every((d: any) => d.status === 'available');

    return { available: allAvailable, listingId, checkIn, checkOut, nights };
  } catch {
    // Calendar is the primary availability source; if it fails, report unavailable
    throw new Error("Unable to verify availability right now.");
  }
}

/* Casas de portfolio (isPortfolio no Guesty): só montra, sem reserva online.
   Não se pede preço ao Guesty por elas: falha sempre, gasta quota da API e
   contava como falha no alarme de fallback. Lista refrescada a cada 10 min. */
let portfolioCache: { at: number; ids: Set<string> } | null = null;
export async function isPortfolioListing(listingId: string): Promise<boolean> {
  if (!portfolioCache || Date.now() - portfolioCache.at > 10 * 60 * 1000) {
    try {
      const props = await getPropertiesForSite();
      portfolioCache = {
        at: Date.now(),
        ids: new Set(props.filter((p: any) => p.isPortfolio).map((p: any) => String(p.guestyId || p.listingId || ""))),
      };
    } catch {
      return portfolioCache?.ids.has(listingId) ?? false;
    }
  }
  return portfolioCache.ids.has(listingId);
}

export async function getQuote(
  listingId: string,
  checkIn: string,
  checkOut: string,
  guests: number = 2
): Promise<QuoteResult> {
  if (await isPortfolioListing(listingId)) {
    return { ...buildPriceOnRequestResult(listingId, checkIn, checkOut, guests), requestOnly: true };
  }
  const cacheKey = getQuoteCacheKey(listingId, checkIn, checkOut, guests);

  // ── Cache-first: return live/cached results immediately (no BE API call needed) ──
  const existingCache = getCachedQuote(cacheKey);
  if (existingCache && (existingCache.source === "live" || existingCache.source === "cached")) {
    console.info(`[getQuote] ✓ CACHE HIT for ${listingId}: €${existingCache.pricing.total} (${existingCache.source})`);
    return { ...existingCache, source: "cached" as QuoteSource };
  }

  // ── In-flight dedup: share one pending promise for concurrent identical requests ──
  const inflight = inFlightGetQuotes.get(cacheKey);
  if (inflight) return inflight;

  const promise = _getQuoteImpl(listingId, checkIn, checkOut, guests, cacheKey)
    .then((r) => {
      // Saúde do BE: só resultados frescos contam (cache hits saem acima).
      // Datas fechadas e "por pedido" são respostas certas, não falhas.
      recordQuoteOutcome(r.source === "live" || !!r.requestOnly || !!r.unavailable, listingId);
      return r;
    })
    .finally(() => {
    inFlightGetQuotes.delete(cacheKey);
  });
  inFlightGetQuotes.set(cacheKey, promise);
  return promise;
}

async function _getQuoteImpl(
  listingId: string,
  checkIn: string,
  checkOut: string,
  guests: number,
  cacheKey: string
): Promise<QuoteResult> {
  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );

  // ── TIER 1: Booking Engine API (primary source — same API used for checkout) ──
  // Duas tentativas: a maioria das falhas é transitória (rate limit, timeout)
  // e sem retry cada uma degradava logo para preço estimado, que o widget
  // mostra como "contact a concierge" — uma venda perdida (auditoria set/2026).
  if (isBEApiConfigured()) {
    try {
      let beQuote: Awaited<ReturnType<typeof createBEQuote>> | null = null;
      // Orçamento de tempo partilhado pelas tentativas: o router corta a quote
      // aos 20s, e um retry cego (12s + 12s) passava esse prazo — a casa caía
      // em "price on request" precisamente quando o Guesty estava lento.
      const budgetEnd = Date.now() + 17_000;
      for (let attempt = 1; attempt <= 2; attempt++) {
        const timeoutMs = Math.min(12_000, budgetEnd - Date.now());
        try {
          beQuote = await Promise.race([
            createBEQuote({ listingId, checkIn, checkOut, guests }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("be_quote_timeout")), timeoutMs)),
          ]);
          break;
        } catch (attemptErr: any) {
          const reason = describeGuestyError(attemptErr);
          // Respostas definitivas do Guesty não melhoram com retry
          if (isRequestOnlyError(reason) || datesUnavailableReason(reason)) throw attemptErr;
          const remaining = budgetEnd - Date.now() - 1_200;
          if (attempt === 2 || remaining < 5_000) throw attemptErr;
          console.warn(`[getQuote] BE tentativa ${attempt} falhou para ${listingId} (${reason}); retry em 1.2s`);
          await new Promise((r) => setTimeout(r, 1_200));
        }
      }
      if (beQuote && beQuote.total > 0) {
        const result: QuoteResult = {
          available: true,
          listingId,
          checkIn,
          checkOut,
          nights,
          currency: beQuote.currency || "EUR",
          pricing: {
            nightlyRate: beQuote.pricing.nightlyRate,
            totalNights: beQuote.pricing.totalNights,
            cleaningFee: beQuote.pricing.cleaningFee,
            taxesAndFees: beQuote.pricing.taxesAndFees,
            subtotal: beQuote.pricing.totalNights + beQuote.pricing.cleaningFee + beQuote.pricing.taxesAndFees,
            total: beQuote.total,
          },
          source: "live",
          quoteId: beQuote.quoteId,
          ratePlanId: beQuote.ratePlanId,
          ratePlanOptions: beQuote.ratePlanOptions,
        };
        setCachedQuote(cacheKey, result);
        console.info(`[getQuote] ✓ BE API quote for ${listingId}: €${beQuote.total} (${nights}n)`);
        return result;
      }
    } catch (beErr: any) {
      const reason = describeGuestyError(beErr);
      console.warn(`[getQuote] BE API FAILED for ${listingId}: ${reason}`);
      // Casa configurada no Guesty como "reserva por pedido" nestas datas:
      // não é avaria nem ausência de preço — o widget mostra o pedido ao
      // concierge como caminho normal, em vez de "não conseguimos confirmar".
      if (isRequestOnlyError(reason)) {
        return { ...buildPriceOnRequestResult(listingId, checkIn, checkOut, guests), requestOnly: true };
      }
      // O BE recusou estas datas (fechadas, estadia mínima, antecedência):
      // indisponível, sem descer aos tiers seguintes.
      const closed = datesUnavailableReason(reason);
      if (closed) return buildUnavailableResult(listingId, checkIn, checkOut, closed);
    }
  }

  // ── TIER 2 (removed): Open API /v1/quotes permanently removed 2026-03-31 ──
  // The v1 endpoint is dead. Only the BE API (Tier 1) produces live quotes now.

  // ── Resultado "sem preço live" recente (3 min): poupa o calendário ──
  const cached = getCachedQuote(cacheKey);
  if (cached) {
    console.info(`[getQuote] sem preço live (em cache) para ${listingId}`);
    return cached;
  }

  // ── TIER 3: o calendário decide se as datas estão fechadas ──
  let verdict: StayVerdict = { status: "unknown" };
  try {
    const calendar = await Promise.race([
      guestyClient.getListingCalendar(listingId, checkIn, checkOut),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("calendar_timeout")), 5_000)),
    ]);
    // BE API returns flat array; guard against wrapped response
    const days = Array.isArray(calendar) ? calendar : (calendar?.days || []);
    verdict = calendarStayVerdict(days, checkIn, checkOut);
  } catch {
    verdict = { status: "unknown" };
  }
  if (verdict.status === "unavailable") {
    return buildUnavailableResult(listingId, checkIn, checkOut, verdict.reason);
  }

  // ── TIER 4: sem preço live ──
  // Antes devolvia o basePrice do Guesty (ou o pricePerNight do catálogo) com
  // available:true, e a página mostrava esse valor de referência como "From
  // €X" (Lima River Houses: €550 contra um "desde" real de €342). Agora:
  // estimate:true e pricing a zeros — nenhum consumidor tem número para
  // mostrar; o widget cai no "desde" calculado e no estado "tente de novo /
  // concierge".
  const result = buildNoLivePriceResult(listingId, checkIn, checkOut);
  setCachedQuote(cacheKey, result);
  console.info(`[getQuote] sem preço live para ${listingId} (${nights}n; calendário: ${verdict.status})`);
  return result;
}

/**
 * Quote LIVE para trabalho de fundo (o "Desde €X" do PLP/PDP). Não é o
 * getQuote: esse, quando o BE falha, desce aos tiers 3–4 (calendário BE +
 * listing Open API) para dar ao hóspede uma estimativa — e o warm-up ignora
 * estimativas. Em 24 set 2026 isso multiplicava cada quote falhada por 3
 * chamadas, e um só visitante no PLP punha o Guesty em 429: o cooldown global
 * deixava TODOS os hóspedes sem preço live (alertas "QUOTES EM FALLBACK").
 * Aqui: uma tentativa, nada de fallbacks, nada de contar para o alerta de
 * saúde, e desiste logo se o BE estiver sob rate limit. Resultado live fica em
 * cache para o hóspede que vier a seguir.
 */
export async function getBackgroundLiveQuote(
  listingId: string,
  checkIn: string,
  checkOut: string,
  guests = 2,
  timeoutMs = 12_000,
): Promise<QuoteResult | null> {
  const cacheKey = getQuoteCacheKey(listingId, checkIn, checkOut, guests);
  const cached = getCachedQuote(cacheKey);
  if (cached && (cached.source === "live" || cached.source === "cached")) return { ...cached, source: "cached" };
  if (!isBEApiConfigured() || beQuotesUnderPressure()) return null;
  const nights = Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  try {
    const beQuote = await Promise.race([
      createBEQuote({ listingId, checkIn, checkOut, guests }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("be_quote_timeout")), timeoutMs)),
    ]);
    if (!beQuote || !(beQuote.total > 0)) return null;
    const result: QuoteResult = {
      available: true,
      listingId,
      checkIn,
      checkOut,
      nights,
      currency: beQuote.currency || "EUR",
      pricing: {
        nightlyRate: beQuote.pricing.nightlyRate,
        totalNights: beQuote.pricing.totalNights,
        cleaningFee: beQuote.pricing.cleaningFee,
        taxesAndFees: beQuote.pricing.taxesAndFees,
        subtotal: beQuote.pricing.totalNights + beQuote.pricing.cleaningFee + beQuote.pricing.taxesAndFees,
        total: beQuote.total,
      },
      source: "live",
      quoteId: beQuote.quoteId,
      ratePlanId: beQuote.ratePlanId,
      ratePlanOptions: beQuote.ratePlanOptions,
    };
    setCachedQuote(cacheKey, result);
    return result;
  } catch {
    return null;
  }
}

/** Used when live quote + fallbacks cannot complete in time (PLP batch safety). */
export function buildPriceOnRequestResult(
  listingId: string,
  checkIn: string,
  checkOut: string,
  _guests: number
): QuoteResult {
  const nights = Math.ceil(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  );
  return {
    available: false,
    listingId,
    checkIn,
    checkOut,
    nights,
    currency: "EUR",
    pricing: {
      nightlyRate: 0,
      totalNights: 0,
      cleaningFee: 0,
      subtotal: 0,
      total: 0,
    },
    source: "request",
    fallbackMessage: "Price on request",
  };
}

/** Datas fechadas: a mesma forma que o getBatchQuotes usa para "indisponível". */
export function buildUnavailableResult(
  listingId: string,
  checkIn: string,
  checkOut: string,
  reason: UnavailableReason = "dates",
): QuoteResult {
  return {
    ...buildPriceOnRequestResult(listingId, checkIn, checkOut, 0),
    fallbackMessage: "Not available for selected dates",
    unavailable: true,
    unavailableReason: reason,
  };
}

/**
 * Sem preço live e sem prova de que as datas estão fechadas (o BE falhou ou
 * demorou). Nunca leva o basePrice do Guesty: pricing a zeros, estimate:true.
 * available fica true = "nada indica que está fechada" — quem mostra
 * "indisponível" olha para `unavailable`, não para isto.
 */
export function buildNoLivePriceResult(listingId: string, checkIn: string, checkOut: string): QuoteResult {
  const nights = Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000);
  return {
    available: true,
    listingId,
    checkIn,
    checkOut,
    nights,
    currency: "EUR",
    pricing: { nightlyRate: 0, totalNights: 0, cleaningFee: 0, subtotal: 0, total: 0 },
    source: "base",
    estimate: true,
    fallbackMessage: "Live pricing is temporarily unavailable.",
  };
}

/**
 * Hard cap so a quote never hangs if Guesty or fallbacks stall.
 * First resolution wins (live quote or deadline fallback). Passado o prazo
 * não se sabe nada das datas: "sem preço live", não "indisponível".
 */
export async function getQuoteWithDeadline(
  listingId: string,
  checkIn: string,
  checkOut: string,
  guests: number = 2,
  deadlineMs = 12_000
): Promise<QuoteResult> {
  return Promise.race([
    getQuote(listingId, checkIn, checkOut, guests),
    new Promise<QuoteResult>((resolve) => {
      setTimeout(
        () => resolve(buildNoLivePriceResult(listingId, checkIn, checkOut)),
        deadlineMs
      );
    }),
  ]);
}

// DEPRECATED: createReservation (inquiry) removed.
// All bookings must go through Booking Engine with Stripe payment.
// Guests without live pricing should contact concierge via WhatsApp/email.
// See createBEInstantReservation in guesty-booking.ts for the active booking flow.
