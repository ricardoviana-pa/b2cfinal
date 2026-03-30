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

function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    active -= 1;
    const run = queue.shift();
    if (run) run();
  };

  return async function runLimited<T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      next();
    }
  };
}

const runOpenQuoteLimited = createLimiter(2);
const runBeQuoteLimited = createLimiter(2);

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
  const skewMs = Math.min(120_000, Math.max(15_000, Math.floor(ttlMs * 0.2)));
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
        await sleep(1000 + attempt * 1000);
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
      const retryAfterSec = Number(response.headers.get("Retry-After") || "2");
      await sleep(Math.max(1000, retryAfterSec * 1000 + attempt * 1000));
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

  async getListingCalendar(id: string, from: string, to: string): Promise<any> {
    return request<any>("GET", `/v1/availability-pricing/api/calendar/listings/${id}`, {
      query: { startDate: from, endDate: to },
    });
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

  async createReservation(payload: Record<string, unknown>): Promise<any> {
    if ((payload as any).quoteId) {
      return request<any>("POST", "/v1/reservations-v3/quote", { body: payload });
    }
    return request<any>("POST", "/v1/reservations", { body: payload });
  },

  async getReservation(id: string): Promise<any> {
    return request<any>("GET", `/v1/reservations/${id}`);
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
            await sleep(1000 + attempt * 1000);
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
          const retryAfterSec = Number(response.headers.get("Retry-After") || "2");
          await sleep(Math.max(1000, retryAfterSec * 1000 + attempt * 1000));
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
};

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
