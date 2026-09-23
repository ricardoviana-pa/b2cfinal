/**
 * GUESTY API SERVICE
 * Uses centralized server/lib/guesty client.
 * When Open API OAuth is rate-limited, falls through to Booking Engine API
 * (which uses separate credentials and is typically not rate-limited).
 */

import { guestyClient } from "../lib/guesty";
import { isBEApiConfigured, createBEQuote, type BERatePlanOption } from "./guesty-booking";
import { getPropertiesForSite } from "./properties-store";

type QuoteSource = "live" | "cached" | "base" | "request";

const QUOTE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 min for live quotes
const QUOTE_CACHE_FALLBACK_TTL_MS = 3 * 60 * 1000; // 3 min for base-price fallbacks (retry sooner)
const quoteCache = new Map<string, { expiresAt: number; value: QuoteResult }>();
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

export async function getQuote(
  listingId: string,
  checkIn: string,
  checkOut: string,
  guests: number = 2
): Promise<QuoteResult> {
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
      // Saúde do BE: só resultados frescos contam (cache hits saem acima)
      recordQuoteOutcome(r.source === "live" || !!r.requestOnly, listingId);
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
          if (isRequestOnlyError(reason) || /not available for the selected dates/i.test(reason)) throw attemptErr;
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
    }
  }

  // ── TIER 2 (removed): Open API /v1/quotes permanently removed 2026-03-31 ──
  // The v1 endpoint is dead. Only the BE API (Tier 1) produces live quotes now.

  // ── Return base-price cache if we have one ──
  const cached = getCachedQuote(cacheKey);
  if (cached) {
    console.info(`[getQuote] ✓ CACHED quote for ${listingId}: €${cached.pricing.total}`);
    return {
      ...cached,
      source: "base" as QuoteSource,
      fallbackMessage: "Estimated price based on property's base rate.",
    };
  }

  // ── TIER 3: Calendar check for definitive unavailability ──
  let calendarHasBookedDays = false;
  try {
    const calendar = await Promise.race([
      guestyClient.getListingCalendar(listingId, checkIn, checkOut),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("calendar_timeout")), 5_000)),
    ]);
    // BE API returns flat array; guard against wrapped response
    const days = Array.isArray(calendar) ? calendar : (calendar?.days || []);
    if (days.length > 0) {
      calendarHasBookedDays = days.some((d: any) =>
        d.status === "booked" || d.status === "blocked" || d.status === "maintenance"
      );
    }
  } catch {
    calendarHasBookedDays = false;
  }
  if (calendarHasBookedDays) {
    return buildPriceOnRequestResult(listingId, checkIn, checkOut, guests);
  }

  // ── TIER 4: Listing base price from Open API ──
  try {
    const listing = await Promise.race([
      guestyClient.getListing(listingId, "prices"),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("listing_fetch_timeout")), 6_000)),
    ]);
    const basePrice = Number(listing?.prices?.basePrice || 0);
    const cleaningFee = Number(listing?.prices?.cleaningFee || 0);
    if (basePrice > 0 && nights > 0) {
      const baseResult: QuoteResult = {
        available: true, listingId, checkIn, checkOut, nights,
        currency: listing?.prices?.currency || "EUR",
        pricing: {
          nightlyRate: basePrice,
          totalNights: basePrice * nights,
          cleaningFee,
          subtotal: basePrice * nights + cleaningFee,
          total: basePrice * nights + cleaningFee,
        },
        source: "base",
        fallbackMessage: "Live pricing is temporarily unavailable. Showing an estimated base rate.",
      };
      setCachedQuote(cacheKey, baseResult);
      console.info(`[getQuote] ✓ BASE price for ${listingId}: €${baseResult.pricing.total}/night`);
      return baseResult;
    }
  } catch { /* ignore */ }

  // ── TIER 5: Synced property catalogue data ──
  try {
    const allProps = await getPropertiesForSite();
    const prop = allProps.find((p: any) => p.guestyId === listingId);
    const syncedPrice = Number(prop?.pricePerNight || prop?.priceFrom || 0);
    const syncedCleaning = Number(prop?.cleaningFee || 0);
    if (syncedPrice > 0 && nights > 0) {
      const syncResult: QuoteResult = {
        available: true, listingId, checkIn, checkOut, nights,
        currency: prop?.currency || "EUR",
        pricing: {
          nightlyRate: syncedPrice,
          totalNights: syncedPrice * nights,
          cleaningFee: syncedCleaning,
          subtotal: syncedPrice * nights + syncedCleaning,
          total: syncedPrice * nights + syncedCleaning,
        },
        source: "base",
        fallbackMessage: "Estimated price based on property's base rate.",
      };
      setCachedQuote(cacheKey, syncResult);
      return syncResult;
    }
  } catch { /* ignore */ }

  return buildPriceOnRequestResult(listingId, checkIn, checkOut, guests);
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

/**
 * Hard cap so PLP batch quotes never hang if Guesty or fallbacks stall.
 * First resolution wins (live quote or deadline fallback).
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
        () => resolve(buildPriceOnRequestResult(listingId, checkIn, checkOut, guests)),
        deadlineMs
      );
    }),
  ]);
}

// DEPRECATED: createReservation (inquiry) removed.
// All bookings must go through Booking Engine with Stripe payment.
// Guests without live pricing should contact concierge via WhatsApp/email.
// See createBEInstantReservation in guesty-booking.ts for the active booking flow.
