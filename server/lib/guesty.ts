/**
 * Centralized Guesty client.
 * - Single fetch-based request layer
 * - Structured logs (method, endpoint, status, duration)
 * - Structured errors
 * - Money normalized to integer cents
 */

import fs from "node:fs";
import path from "node:path";

type GuestyMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type TokenCache = {
  token: string;
  expiresAt: number;
  refreshAt: number;
};

export type MoneyBreakdownCents = {
  currency: string;
  baseRentCents: number;
  cleaningFeeCents: number;
  serviceFeeCents: number;
  touristTaxCents: number;
  vatCents: number;
  totalBeforeTaxCents: number;
  totalAfterTaxCents: number;
};

export class GuestyClientError extends Error {
  status: number;
  method: GuestyMethod;
  endpoint: string;
  details: unknown;

  constructor(input: {
    message: string;
    status: number;
    method: GuestyMethod;
    endpoint: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "GuestyClientError";
    this.status = input.status;
    this.method = input.method;
    this.endpoint = input.endpoint;
    this.details = input.details ?? null;
  }
}

const GUESTY_BASE_URL = (process.env.GUESTY_BASE_URL || "https://open-api.guesty.com").replace(/\/$/, "");
const GUESTY_CLIENT_ID = process.env.GUESTY_CLIENT_ID || "";
const GUESTY_CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET || "";
const GUESTY_BE_BASE_URL = "https://booking.guesty.com";
const GUESTY_BE_CLIENT_ID = process.env.GUESTY_BE_CLIENT_ID || "";
const GUESTY_BE_CLIENT_SECRET = process.env.GUESTY_BE_CLIENT_SECRET || "";
const GUESTY_TIMEOUT_MS = 8_000;
/** Never block OAuth longer than this after a 429 (Guesty recovers fast; long self-blocks cascade across PDP+PLP). */
const MAX_GUESTY_OAUTH_COOLDOWN_MS = Number(process.env.GUESTY_MAX_OAUTH_COOLDOWN_MS || 60_000); // 60s default (was 5min — too aggressive)
const MAX_GUESTY_BE_OAUTH_COOLDOWN_MS = Number(process.env.GUESTY_MAX_BE_OAUTH_COOLDOWN_MS || 60_000);
const TOKEN_CACHE_DIR = path.resolve(process.cwd(), ".cache");
const OPEN_TOKEN_CACHE_FILE = path.join(TOKEN_CACHE_DIR, "guesty-open-token.json");
const BE_TOKEN_CACHE_FILE = path.join(TOKEN_CACHE_DIR, "guesty-be-token.json");

let oauthCache: TokenCache | null = null;
let oauthRefreshPromise: Promise<string> | null = null;
let beOauthCache: TokenCache | null = null;
let beOauthRefreshPromise: Promise<string> | null = null;
let guestyAuthCooldownUntil = 0;
let guestyBeAuthCooldownUntil = 0;
/** Exponential backoff: consecutive 429s multiply the cooldown duration. Resets on success. */
let guestyAuthConsecutive429s = 0;

function parseRetryAfterMs(headers: Headers, fallbackMs: number): number {
  const retryAfterSec = Number(headers.get("Retry-After") || "0");
  if (Number.isFinite(retryAfterSec) && retryAfterSec > 0) {
    return retryAfterSec * 1000;
  }
  return fallbackMs;
}

function capOAuthCooldownMs(rawMs: number, maxMs: number): number {
  if (!Number.isFinite(rawMs) || rawMs <= 0) return maxMs;
  return Math.min(rawMs, maxMs);
}

/**
 * Paced request limiter — implements the Guesty API Traffic Management recipe.
 * Combines concurrency limiting WITH time-based pacing (min delay between requests).
 *
 * Guesty rate limits: 5 req/sec, 275 req/min, 16500 req/hr, max 15 concurrent.
 * Recipe pattern: queue requests, process one every INTERVAL_MS (200ms = 5/sec).
 *
 * @param maxConcurrent - Maximum parallel in-flight requests
 * @param intervalMs    - Minimum milliseconds between dispatching consecutive requests
 */
function createPacedLimiter(maxConcurrent: number, intervalMs: number = 0) {
  let active = 0;
  let lastDispatchedAt = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active -= 1;
    const run = queue.shift();
    if (run) run();
  };

  return async function runLimited<T>(task: () => Promise<T>): Promise<T> {
    // Concurrency gate
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    // Time-based pacing: enforce minimum interval between request dispatches
    if (intervalMs > 0) {
      const elapsed = Date.now() - lastDispatchedAt;
      if (elapsed < intervalMs) {
        await sleep(intervalMs - elapsed);
      }
    }
    active += 1;
    lastDispatchedAt = Date.now();
    try {
      return await task();
    } finally {
      next();
    }
  };
}

/** Open API: 3 concurrent, 250ms pacing (4/sec — conservative, rarely used now) */
const runOpenQuoteLimited = createPacedLimiter(3, 250);
/**
 * BE API: 5 concurrent, 200ms pacing (5/sec — matches Guesty recipe).
 * PLP uses single GET /api/listings call so this only applies to PDP quotes,
 * calendar checks, and payment provider lookups.
 */
const runBeQuoteLimited = createPacedLimiter(5, 200);

function ensureTokenCacheDir(): void {
  if (!fs.existsSync(TOKEN_CACHE_DIR)) {
    fs.mkdirSync(TOKEN_CACHE_DIR, { recursive: true });
  }
}

function readTokenCacheFromDisk(filePath: string): TokenCache | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.expiresAt || !parsed?.refreshAt) return null;
    return parsed as TokenCache;
  } catch {
    return null;
  }
}

function writeTokenCacheToDisk(filePath: string, value: TokenCache): void {
  try {
    ensureTokenCacheDir();
    fs.writeFileSync(filePath, JSON.stringify(value), "utf8");
  } catch {
    /* ignore token cache write errors */
  }
}

function toCents(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function daysBetween(checkIn: string, checkOut: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
  );
}

function buildUrl(path: string, query?: Record<string, string | number | boolean | undefined>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${GUESTY_BASE_URL}${normalizedPath}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function sleep(ms: number): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function parseJsonSafe(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function firstPositiveNumber(values: unknown[], fallback = 0): number {
  for (const value of values) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function computeRefreshAt(expiresInSec: number): { expiresAt: number; refreshAt: number } {
  const now = Date.now();
  const ttlMs = Math.max(30_000, expiresInSec * 1000);
  // Guesty tokens last 24h (86400s). Max 3 renewals per 24h.
  // Refresh 5 minutes before expiry (per Guesty docs recommendation).
  // For shorter tokens (<10min), refresh at 80% of TTL.
  const skewMs = ttlMs >= 600_000
    ? 5 * 60 * 1000  // 5 minutes for normal tokens (24h)
    : Math.max(15_000, Math.floor(ttlMs * 0.2)); // 20% for short-lived tokens
  const expiresAt = now + ttlMs;
  return {
    expiresAt,
    refreshAt: expiresAt - skewMs,
  };
}

function logRequest(input: {
  method: GuestyMethod;
  endpoint: string;
  status: number;
  durationMs: number;
}): void {
  console.info(`[Guesty] ${input.method} ${input.endpoint} — ${input.status} OK — ${input.durationMs}ms`);
}

function logError(input: {
  method: GuestyMethod;
  endpoint: string;
  status: number;
  durationMs: number;
  details: unknown;
}): void {
  const detailText =
    typeof input.details === "string" ? input.details : JSON.stringify(input.details);
  console.error(`[Guesty] ${input.method} ${input.endpoint} — ERROR ${input.status} — ${input.durationMs}ms — ${detailText}`);
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = GUESTY_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOAuthToken(): Promise<string> {
  if (!GUESTY_CLIENT_ID || !GUESTY_CLIENT_SECRET) {
    throw new Error("Guesty auth not configured. Set GUESTY_CLIENT_ID and GUESTY_CLIENT_SECRET.");
  }
  if (Date.now() < guestyAuthCooldownUntil) {
    const remaining = guestyAuthCooldownUntil - Date.now();
    // Recover from stale/overlong cooldown (e.g. bad Retry-After)
    if (remaining > MAX_GUESTY_OAUTH_COOLDOWN_MS) {
      guestyAuthCooldownUntil = 0;
    } else {
      throw new GuestyClientError({
        message: "Guesty authentication temporarily cooled down after rate limiting",
        status: 429,
        method: "POST",
        endpoint: "/oauth2/token",
        details: { retryAfterMs: remaining },
      });
    }
  }

  console.warn("[Guesty] Requesting new OAuth token at", new Date().toISOString());

  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = Date.now();
    const endpoint = "/oauth2/token";
    let response: Response;
    try {
      response = await fetchWithTimeout(`${GUESTY_BASE_URL}${endpoint}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "open-api",
          client_id: GUESTY_CLIENT_ID,
          client_secret: GUESTY_CLIENT_SECRET,
        }),
      });
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        await sleep(1000 + attempt * 1000);
        continue;
      }
      throw new GuestyClientError({
        message: "Guesty authentication failed",
        status: 503,
        method: "POST",
        endpoint,
        details: String(error),
      });
    }

    const durationMs = Date.now() - startedAt;
    if (response.ok) {
      logRequest({ method: "POST", endpoint, status: response.status, durationMs });
      const data = (await response.json()) as { access_token: string; expires_in?: number };
      const { expiresAt, refreshAt } = computeRefreshAt(data.expires_in ?? 3600);
      oauthCache = {
        token: data.access_token,
        expiresAt,
        refreshAt,
      };
      guestyAuthConsecutive429s = 0; // Reset backoff on success
      writeTokenCacheToDisk(OPEN_TOKEN_CACHE_FILE, oauthCache);
      console.info("[Guesty] OAuth token acquired successfully, expires in", Math.round((expiresAt - Date.now()) / 1000), "s");
      return oauthCache.token;
    }

    const detailsRaw = await response.text();
    const details = parseJsonSafe(detailsRaw);
    logError({
      method: "POST",
      endpoint,
      status: response.status,
      durationMs,
      details,
    });

    if (response.status === 429) {
      guestyAuthConsecutive429s += 1;
      // Capped exponential backoff: 30s → 60s → max 60s (never block longer than MAX_GUESTY_OAUTH_COOLDOWN_MS)
      // The BE API handles pricing while Open API recovers, so long self-blocks are unnecessary.
      const retryAfterFromHeader = parseRetryAfterMs(response.headers, 0);
      const backoffMs = Math.min(30_000 * Math.pow(2, Math.min(guestyAuthConsecutive429s - 1, 1)), MAX_GUESTY_OAUTH_COOLDOWN_MS);
      const retryMs = retryAfterFromHeader > 0
        ? Math.min(retryAfterFromHeader, MAX_GUESTY_OAUTH_COOLDOWN_MS)
        : backoffMs;
      guestyAuthCooldownUntil = Date.now() + retryMs;
      console.warn(`[Guesty] OAuth 429 #${guestyAuthConsecutive429s} — cooldown ${Math.round(retryMs / 1000)}s (until ${new Date(guestyAuthCooldownUntil).toISOString()}). BE API will handle pricing.`);
      // Do NOT retry — every 429 response counts against the rate limit window.
      throw new GuestyClientError({
        message: "Guesty authentication temporarily cooled down after rate limiting",
        status: 429,
        method: "POST",
        endpoint,
        details,
      });
    }

    if (response.status >= 500 && attempt < maxAttempts - 1) {
      await sleep(3000 + attempt * 2000);
      continue;
    }

    throw new GuestyClientError({
      message: "Guesty authentication failed",
      status: response.status,
      method: "POST",
      endpoint,
      details,
    });
  }

  throw new GuestyClientError({
    message: "Guesty authentication failed",
    status: 429,
    method: "POST",
    endpoint: "/oauth2/token",
  });
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!oauthCache) {
    oauthCache = readTokenCacheFromDisk(OPEN_TOKEN_CACHE_FILE);
  }
  if (oauthCache && Date.now() < oauthCache.refreshAt) {
    return { Authorization: `Bearer ${oauthCache.token}` };
  }

  if (!oauthRefreshPromise) {
    oauthRefreshPromise = fetchOAuthToken().finally(() => {
      oauthRefreshPromise = null;
    });
  }
  const token = await oauthRefreshPromise;
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(
  method: GuestyMethod,
  endpoint: string,
  options?: { body?: unknown; query?: Record<string, string | number | boolean | undefined> }
): Promise<T> {
  const url = buildUrl(endpoint, options?.query);
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = Date.now();
    const authHeaders = await getAuthHeaders();
    let response: Response;
    try {
      response = await fetchWithTimeout(url, {
        method,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        const backoffMs = 500 * Math.pow(2, attempt); // 500ms, 1000ms
        console.warn(`[Guesty] Network error on ${method} ${endpoint} — retry #${attempt + 1} in ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
      throw new GuestyClientError({
        message: "Guesty request failed (network error)",
        status: 503,
        method,
        endpoint,
        details: String(error),
      });
    }
    const durationMs = Date.now() - startedAt;

    if (response.ok) {
      logRequest({ method, endpoint, status: response.status, durationMs });
      return (await response.json()) as T;
    }

    const detailsRaw = await response.text();
    const details = parseJsonSafe(detailsRaw);
    logError({ method, endpoint, status: response.status, durationMs, details });

    if (response.status === 401 && attempt < maxAttempts - 1) {
      oauthCache = null;
      oauthRefreshPromise = null;
      try {
        if (fs.existsSync(OPEN_TOKEN_CACHE_FILE)) fs.unlinkSync(OPEN_TOKEN_CACHE_FILE);
      } catch {
        /* ignore */
      }
      await sleep(250 + attempt * 250);
      continue;
    }

    if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts - 1) {
      // Exponential backoff per Guesty API Traffic Management recipe:
      // BASE_BACKOFF_MS * 2^attempt → 500ms, 1000ms, 2000ms
      // Respect Retry-After header if present (capped at 30s)
      const retryAfterMs = parseRetryAfterMs(response.headers, 0);
      const exponentialMs = 500 * Math.pow(2, attempt); // 500, 1000, 2000
      const backoffMs = retryAfterMs > 0
        ? Math.min(retryAfterMs, 30_000)
        : exponentialMs;
      console.warn(`[Guesty] ${response.status} on ${method} ${endpoint} — retry #${attempt + 1} in ${backoffMs}ms`);
      await sleep(backoffMs);
      continue;
    }

    throw new GuestyClientError({
      message: `Guesty request failed (${response.status})`,
      status: response.status,
      method,
      endpoint,
      details,
    });
  }

  throw new GuestyClientError({
    message: "Guesty request failed (rate limited)",
    status: 429,
    method,
    endpoint,
  });
}

function extractTaxes(invoiceItems: any[]): { touristTaxCents: number; vatCents: number } {
  let touristTaxCents = 0;
  let vatCents = 0;

  for (const item of invoiceItems) {
    const title = String(item?.title || item?.normalType || "").toLowerCase();
    const amount = toCents(item?.amount);

    if (title.includes("tourist") || title.includes("city tax")) {
      touristTaxCents += amount;
    } else if (title.includes("vat") || title.includes("iva")) {
      vatCents += amount;
    }
  }

  return { touristTaxCents, vatCents };
}

function quoteMoneyToCents(quote: any, checkIn: string, checkOut: string): MoneyBreakdownCents {
  const defaultPlan = quote?.rates?.ratePlan ?? quote?.rates?.ratePlans?.[0] ?? null;
  const planMoneyWrapper = defaultPlan?.money || quote?.money || {};
  const nestedMoney = planMoneyWrapper?.money || planMoneyWrapper;
  const invoiceItems = Array.isArray(nestedMoney.invoiceItems) ? nestedMoney.invoiceItems : [];
  const { touristTaxCents, vatCents } = extractTaxes(invoiceItems);
  const nights = daysBetween(checkIn, checkOut);

  const accommodationItem = invoiceItems.find((item: any) => String(item?.normalType || item?.type || "").toUpperCase() === "AF");
  const cleaningItem = invoiceItems.find((item: any) => String(item?.normalType || item?.type || "").toUpperCase() === "CF");
  const baseRent = firstPositiveNumber(
    [accommodationItem?.amount, nestedMoney.fareAccommodation, nestedMoney.accommodationFare, nestedMoney.baseFare],
    0
  );
  const cleaningFee = firstPositiveNumber(
    [cleaningItem?.amount, nestedMoney.fareCleaning, nestedMoney.cleaningFee, nestedMoney.cleaning],
    0
  );
  const serviceFee = firstPositiveNumber([nestedMoney.totalFees, nestedMoney.serviceFee], 0);
  const subtotal = firstPositiveNumber(
    [nestedMoney.subTotalPrice, nestedMoney.subtotalPrice, nestedMoney.subtotal, baseRent + cleaningFee + serviceFee],
    baseRent + cleaningFee + serviceFee
  );
  const total = firstPositiveNumber(
    [nestedMoney.totalPrice, nestedMoney.total, nestedMoney.totalAmount, nestedMoney.hostPayout, subtotal + touristTaxCents / 100 + vatCents / 100],
    subtotal + touristTaxCents / 100 + vatCents / 100
  );

  const baseRentCents = toCents(baseRent);
  const cleaningFeeCents = toCents(cleaningFee);
  const serviceFeeCents = toCents(serviceFee);
  const totalBeforeTaxCents = toCents(subtotal);
  const totalAfterTaxCents = toCents(total);

  const safeBase = nights > 0 ? baseRentCents : 0;
  return {
    currency: nestedMoney.currency || "EUR",
    baseRentCents: safeBase,
    cleaningFeeCents,
    serviceFeeCents,
    touristTaxCents,
    vatCents,
    totalBeforeTaxCents,
    totalAfterTaxCents,
  };
}

export const guestyClient = {
  request,

  async getListings(input?: {
    limit?: number;
    skip?: number;
    active?: boolean;
    listed?: boolean;
    fields?: string;
  }): Promise<any> {
    return request<any>("GET", "/v1/listings", {
      query: {
        limit: input?.limit ?? 50,
        skip: input?.skip ?? 0,
        active: input?.active ?? true,
        listed: input?.listed ?? true,
        fields: input?.fields,
      },
    });
  },

  async getListing(id: string, fields?: string): Promise<any> {
    return request<any>("GET", `/v1/listings/${id}`, {
      query: fields ? { fields } : undefined,
    });
  },

  /**
   * @deprecated Use guestyBEClient.getCalendar() instead — this calls the v1 Open API
   * endpoint which was permanently removed on 2026-03-31.
   */
  async getListingCalendar(id: string, from: string, to: string): Promise<any> {
    // Delegate to BE API (correct endpoint) instead of deprecated Open API
    return guestyBEClient.getCalendar(id, from, to);
  },

  async getListingRatePlans(id: string): Promise<any> {
    return request<any>("GET", `/v1/listings/${id}/ratePlans`);
  },

  async createQuote(
    listingId: string,
    checkIn: string,
    checkOut: string,
    guestsCount: number,
    ratePlanId?: string
  ): Promise<{
    raw: any;
    nights: number;
    pricingCents: MoneyBreakdownCents;
    ratePlanId: string | null;
  }> {
    const raw = await runOpenQuoteLimited(() =>
      request<any>("POST", "/v1/quotes", {
        body: {
          listingId,
          checkInDateLocalized: checkIn,
          checkOutDateLocalized: checkOut,
          guestsCount,
          numberOfGuests: {
            numberOfAdults: guestsCount,
            numberOfChildren: 0,
            numberOfInfants: 0,
          },
          source: "OAPI",
          ignoreTerms: false,
          ignoreCalendar: false,
          ignoreBlocks: false,
          ...(ratePlanId ? { ratePlanId } : {}),
        },
      })
    );

    const nights = daysBetween(checkIn, checkOut);
    const pricingCents = quoteMoneyToCents(raw, checkIn, checkOut);
    const selectedPlanId =
      raw?.rates?.ratePlan?._id ||
      raw?.rates?.ratePlans?.[0]?._id ||
      ratePlanId ||
      null;

    return {
      raw,
      nights,
      pricingCents,
      ratePlanId: selectedPlanId,
    };
  },

  /**
   * @deprecated All bookings MUST go through Booking Engine with Stripe payment.
   * Use createBEInstantReservation() in guesty-booking.ts instead.
   * The v1 endpoints were permanently removed on 2026-03-31.
   */
  async createReservation(_payload: Record<string, unknown>): Promise<any> {
    throw new Error(
      "createReservation via Open API is deprecated. Use Booking Engine API (createBEInstantReservation) with Stripe payment."
    );
  },

  /**
   * Fetch reservation details via Booking Engine API.
   * Migrated from deprecated GET /v1/reservations/{id} to BE API.
   */
  async getReservation(id: string): Promise<any> {
    return guestyBEClient.request<any>("GET", `/api/reservations/${id}/summary`);
  },

  /** Fetch guest reviews (paginated). */
  async getReviews(input?: { limit?: number; skip?: number }): Promise<any> {
    return request<any>("GET", "/v1/reviews", {
      query: {
        limit: input?.limit ?? 100,
        skip: input?.skip ?? 0,
      },
    });
  },
};

async function fetchBEOAuthToken(): Promise<string> {
  if (!GUESTY_BE_CLIENT_ID || !GUESTY_BE_CLIENT_SECRET) {
    throw new Error("Guesty Booking Engine auth not configured.");
  }
  if (Date.now() < guestyBeAuthCooldownUntil) {
    const remaining = guestyBeAuthCooldownUntil - Date.now();
    if (remaining > MAX_GUESTY_BE_OAUTH_COOLDOWN_MS) {
      guestyBeAuthCooldownUntil = 0;
    } else {
      throw new GuestyClientError({
        message: "Guesty BE authentication temporarily cooled down after rate limiting",
        status: 429,
        method: "POST",
        endpoint: "/oauth2/token",
        details: { retryAfterMs: remaining },
      });
    }
  }

  const maxAttempts = 2;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const startedAt = Date.now();
    const response = await fetchWithTimeout(`${GUESTY_BE_BASE_URL}/oauth2/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: "booking_engine:api",
        client_id: GUESTY_BE_CLIENT_ID,
        client_secret: GUESTY_BE_CLIENT_SECRET,
      }),
    });

    if (response.ok) {
      logRequest({ method: "POST", endpoint: "/oauth2/token", status: response.status, durationMs: Date.now() - startedAt });
      const data = (await response.json()) as { access_token: string; expires_in?: number };
      const { expiresAt, refreshAt } = computeRefreshAt(data.expires_in ?? 3600);
      beOauthCache = {
        token: data.access_token,
        expiresAt,
        refreshAt,
      };
      writeTokenCacheToDisk(BE_TOKEN_CACHE_FILE, beOauthCache);
      return beOauthCache.token;
    }

    if (response.status === 429) {
      guestyBeAuthCooldownUntil =
        Date.now() + capOAuthCooldownMs(parseRetryAfterMs(response.headers, 60_000), MAX_GUESTY_BE_OAUTH_COOLDOWN_MS);
      const details = parseJsonSafe(await response.text());
      logError({
        method: "POST",
        endpoint: "/oauth2/token (BE)",
        status: response.status,
        durationMs: Date.now() - startedAt,
        details,
      });
      // Do NOT retry 429 — stop poking the API to let the rate limit expire.
      throw new GuestyClientError({
        message: "Guesty BE authentication temporarily cooled down after rate limiting",
        status: 429,
        method: "POST",
        endpoint: "/oauth2/token",
        details,
      });
    }

    if (response.status >= 500 && attempt < maxAttempts - 1) {
      logError({
        method: "POST",
        endpoint: "/oauth2/token (BE)",
        status: response.status,
        durationMs: Date.now() - startedAt,
        details: parseJsonSafe(await response.text()),
      });
      const retryAfterSec = Number(response.headers.get("Retry-After") || "2");
      await sleep(Math.max(1000, retryAfterSec * 1000 + attempt * 1000));
      continue;
    }

    const details = parseJsonSafe(await response.text());
    logError({
      method: "POST",
      endpoint: "/oauth2/token",
      status: response.status,
      durationMs: Date.now() - startedAt,
      details,
    });
    throw new GuestyClientError({
      message: "Guesty BE authentication failed",
      status: response.status,
      method: "POST",
      endpoint: "/oauth2/token",
      details,
    });
  }

  throw new GuestyClientError({
    message: "Guesty BE authentication failed",
    status: 429,
    method: "POST",
    endpoint: "/oauth2/token",
  });
}

async function getBEAuthHeaders(): Promise<Record<string, string>> {
  if (!beOauthCache) {
    beOauthCache = readTokenCacheFromDisk(BE_TOKEN_CACHE_FILE);
  }
  if (beOauthCache && Date.now() < beOauthCache.refreshAt) {
    return { Authorization: `Bearer ${beOauthCache.token}` };
  }
  if (!beOauthRefreshPromise) {
    beOauthRefreshPromise = fetchBEOAuthToken().finally(() => {
      beOauthRefreshPromise = null;
    });
  }
  const token = await beOauthRefreshPromise;
  return { Authorization: `Bearer ${token}` };
}

export const guestyBEClient = {
  isConfigured(): boolean {
    return !!(GUESTY_BE_CLIENT_ID && GUESTY_BE_CLIENT_SECRET);
  },

  async request<T>(
    method: GuestyMethod,
    endpoint: string,
    options?: { body?: unknown; query?: Record<string, string | number | boolean | undefined> }
  ): Promise<T> {
    const normalizedPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = new URL(`${GUESTY_BE_BASE_URL}${normalizedPath}`);
    if (options?.query) {
      for (const [key, value] of Object.entries(options.query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }

    const execute = async (): Promise<T> => {
      const maxAttempts = 3;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const startedAt = Date.now();
        const authHeaders = await getBEAuthHeaders();
        let response: Response;
        try {
          response = await fetchWithTimeout(url.toString(), {
            method,
            headers: {
              Accept: "application/json; charset=utf-8",
              "Content-Type": "application/json",
              ...authHeaders,
            },
            body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
          });
        } catch (error) {
          if (attempt < maxAttempts - 1) {
            const backoffMs = 500 * Math.pow(2, attempt); // 500ms, 1000ms
            console.warn(`[Guesty BE] Network error on ${method} ${normalizedPath} — retry #${attempt + 1} in ${backoffMs}ms`);
            await sleep(backoffMs);
            continue;
          }
          throw new GuestyClientError({
            message: "Guesty BE request failed (network error)",
            status: 503,
            method,
            endpoint: normalizedPath,
            details: String(error),
          });
        }

        if (response.ok) {
          logRequest({ method, endpoint: normalizedPath, status: response.status, durationMs: Date.now() - startedAt });
          return (await response.json()) as T;
        }

        if (response.status === 401 && attempt < maxAttempts - 1) {
          beOauthCache = null;
          beOauthRefreshPromise = null;
          try {
            if (fs.existsSync(BE_TOKEN_CACHE_FILE)) fs.unlinkSync(BE_TOKEN_CACHE_FILE);
          } catch {
            /* ignore */
          }
          await sleep(250 + attempt * 250);
          continue;
        }

        if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts - 1) {
          const errBody = await response.text();
          logError({
            method,
            endpoint: normalizedPath,
            status: response.status,
            durationMs: Date.now() - startedAt,
            details: parseJsonSafe(errBody),
          });
          // Exponential backoff per Guesty API Traffic Management recipe:
          // BASE_BACKOFF_MS * 2^attempt → 500ms, 1000ms, 2000ms
          const retryAfterMs = parseRetryAfterMs(response.headers, 0);
          const exponentialMs = 500 * Math.pow(2, attempt);
          const backoffMs = retryAfterMs > 0
            ? Math.min(retryAfterMs, 30_000)
            : exponentialMs;
          console.warn(`[Guesty BE] ${response.status} on ${method} ${normalizedPath} — retry #${attempt + 1} in ${backoffMs}ms`);
          await sleep(backoffMs);
          continue;
        }

        const details = parseJsonSafe(await response.text());
        logError({
          method,
          endpoint: normalizedPath,
          status: response.status,
          durationMs: Date.now() - startedAt,
          details,
        });
        throw new GuestyClientError({
          message: `Guesty BE request failed (${response.status})`,
          status: response.status,
          method,
          endpoint: normalizedPath,
          details,
        });
      }

      throw new GuestyClientError({
        message: "Guesty BE request failed (rate limited)",
        status: 429,
        method,
        endpoint: normalizedPath,
      });
    };

    const isQuoteRequest =
      method === "POST" &&
      (normalizedPath === "/api/reservations/quotes" || normalizedPath.includes("/api/reservations/quotes/"));

    return isQuoteRequest ? runBeQuoteLimited(execute) : execute();
  },

  /**
   * PLP pricing: single API call returns ALL available listings with accurate totalPrice.
   * GET /api/listings?checkIn=...&checkOut=...&fields=totalPrice _id title accommodates prices
   *
   * Key behavior (from Guesty docs):
   * - totalPrice = base rate + cleaning + service fees + taxes + all mandatory charges
   * - Internally invokes reservation quote for each rate plan, returns minimum
   * - Only AVAILABLE listings for the given dates are returned
   * - Max 50 results per request (no cursor pagination for totalPrice queries)
   * - Prices guaranteed for 24h after quote creation
   *
   * Rate limits: 5/sec, 275/min, 16500/hr — this is a SINGLE call, well within limits.
   */
  async getListingsWithPricing(input: {
    checkIn: string;
    checkOut: string;
    minOccupancy?: number;
    limit?: number;
  }): Promise<BEListingsResponse> {
    const fields = "totalPrice _id title accommodates prices address reviews picture";
    const result = await this.request<any>("GET", "/api/listings", {
      query: {
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        fields,
        limit: input.limit ?? 50,
        ...(input.minOccupancy ? { minOccupancy: input.minOccupancy } : {}),
      },
    });
    // Normalize response shape
    const results = Array.isArray(result?.results) ? result.results : (Array.isArray(result) ? result : []);
    const pagination = result?.pagination ?? { total: results.length, cursor: { next: null } };
    return { results, pagination };
  },

  /**
   * Fetch day-by-day calendar for a listing via the Booking Engine API.
   * GET https://booking.guesty.com/api/listings/{id}/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
   * Returns flat array: [{ date, status, minNights, isBaseMinNights, cta, ctd }]
   */
  async getCalendar(listingId: string, from: string, to: string): Promise<any[]> {
    const result = await this.request<any>("GET", `/api/listings/${listingId}/calendar`, {
      query: { from, to },
    });
    // BE API returns a flat array directly; guard against unexpected wrapping
    if (Array.isArray(result)) return result;
    if (result?.days && Array.isArray(result.days)) return result.days;
    if (result?.data && Array.isArray(result.data)) return result.data;
    console.warn(`[guestyBEClient.getCalendar] Unexpected response shape:`, Object.keys(result || {}).slice(0, 5));
    return [];
  },
};

/**
 * PLP pricing result from GET /api/listings?checkIn=...&checkOut=...&fields=totalPrice
 * The BE API internally creates quotes for each rate plan and returns the minimum totalPrice.
 * Only AVAILABLE listings for the given dates are returned.
 * Docs: https://booking-api-docs.guesty.com/docs/retrieve-accurate-stay-pricing
 */
export interface BEListingWithPrice {
  _id: string;
  title?: string;
  accommodates?: number;
  totalPrice?: number;
  address?: { city?: string; country?: string };
  reviews?: { avg?: number; total?: number };
  picture?: { thumbnail?: string };
  prices?: { basePrice?: number; cleaningFee?: number; currency?: string };
}

export interface BEListingsResponse {
  results: BEListingWithPrice[];
  pagination: { total: number; cursor: { next: string | null } };
}

export function isGuestyConfigured(): boolean {
  return !!(GUESTY_CLIENT_ID && GUESTY_CLIENT_SECRET);
}

/** Clears in-memory OAuth cooldowns after Guesty 429s / rate limits (Render keeps process alive). */
export function resetGuestyRateLimitCooldowns(): void {
  guestyAuthCooldownUntil = 0;
  guestyBeAuthCooldownUntil = 0;
  guestyAuthConsecutive429s = 0;
}

/** Check if the Open API OAuth is currently in 429 cooldown (skip live quotes, use fallback). */
export function isGuestyOAuthCoolingDown(): boolean {
  return Date.now() < guestyAuthCooldownUntil;
}

/**
 * Pre-fetch OAuth tokens on server start so the first PDP visitor
 * doesn't wait for token negotiation. Non-blocking — failures are logged
 * but never prevent the server from starting.
 */
export async function warmUpOAuthTokens(): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (GUESTY_CLIENT_ID && GUESTY_CLIENT_SECRET) {
    tasks.push(
      getAuthHeaders()
        .then(() => console.info("[Guesty] Open API token warmed up ✓"))
        .catch((err) => console.warn("[Guesty] Open API warm-up skipped:", err?.message || err))
    );
  }

  if (GUESTY_BE_CLIENT_ID && GUESTY_BE_CLIENT_SECRET) {
    tasks.push(
      getBEAuthHeaders()
        .then(() => console.info("[Guesty] BE API token warmed up ✓"))
        .catch((err) => console.warn("[Guesty] BE API warm-up skipped:", err?.message || err))
    );
  }

  await Promise.allSettled(tasks);
}
