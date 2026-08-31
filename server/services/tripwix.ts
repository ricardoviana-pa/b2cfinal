/**
 * TRIPWIX PARTNER API — live availability and pricing
 * =========================================================================
 * The Tripwix partnership gives us 35 homes in regions we do not yet operate
 * in. They are not Guesty listings, so none of the Guesty pricing path applies
 * to them; this is the equivalent for partner inventory.
 *
 * "From €X per night" here means the same thing it means everywhere else on
 * the site — the lowest nightly rate a guest could ACTUALLY book in the next
 * 90 days — but it is read straight off their calendar, which returns a price
 * and an availability status for every single day. No quoting round-trip is
 * needed, so one call per property covers the whole horizon.
 *
 * Rate limits are the reason for the aggressive caching. Our partner tier
 * allows 100 requests/hour and we have 35 properties, so an uncached PLP would
 * exhaust the budget on a single page view. Results are cached in memory for
 * 8h, matching the Guesty path's TTL.
 * ========================================================================= */

const BASE = process.env.TRIPWIX_API_BASE
  ?? "https://admin.worldeluxevillas.com/api/v1/partner";

const TTL_MS = 8 * 60 * 60 * 1000; // 8h, same as the Guesty lowest-nightly cache
const NULL_TTL_MS = 30 * 60 * 1000; // retry failures sooner than successes
const HORIZON_DAYS = 90;

type CalendarDay = {
  date: string;
  status: string;
  price: string | null;
};

type Cached = { value: number | null; at: number };

const cache = new Map<string, Cached>();

/** In-flight de-duplication, so a burst of PLP cards makes one request each. */
const inFlight = new Map<string, Promise<number | null>>();

function isFresh(entry: Cached | undefined): entry is Cached {
  if (!entry) return false;
  const ttl = entry.value === null ? NULL_TTL_MS : TTL_MS;
  return Date.now() - entry.at < ttl;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchCalendar(uid: string): Promise<CalendarDay[] | null> {
  const key = process.env.TRIPWIX_API_KEY;
  if (!key) {
    console.warn("[Tripwix] TRIPWIX_API_KEY is not set; cannot price partner inventory.");
    return null;
  }

  const start = new Date();
  const end = new Date(start.getTime() + HORIZON_DAYS * 86400_000);
  const url = `${BASE}/properties/${uid}/calendar/?start_date=${ymd(start)}&end_date=${ymd(end)}`;

  try {
    const res = await fetch(url, { headers: { "X-Partner-API-Key": key } });
    if (!res.ok) {
      // 429 included: we do not retry here. The null result is cached for a
      // short window and the caller falls back to the imported rate, so a
      // throttled request degrades to a slightly stale price, not a blank one.
      console.warn(`[Tripwix] calendar ${uid} returned ${res.status}`);
      return null;
    }
    const data = await res.json();
    return Array.isArray(data) ? data : null;
  } catch (err) {
    console.warn(`[Tripwix] calendar ${uid} failed:`, err);
    return null;
  }
}

/**
 * Lowest nightly rate that is genuinely available in the next 90 days.
 *
 * Their calendar marks each day `available`, `booked` or `blocked`; only
 * `available` days can be sold, so the others are ignored even though they
 * still carry a price. Returns null when we cannot tell, and the caller keeps
 * its own fallback rather than showing a number we cannot stand behind.
 */
export async function getTripwixLowestNightly(uid: string): Promise<number | null> {
  if (!uid) return null;

  const cached = cache.get(uid);
  if (isFresh(cached)) return cached.value;

  const existing = inFlight.get(uid);
  if (existing) return existing;

  const task = (async () => {
    const days = await fetchCalendar(uid);
    let value: number | null = null;

    if (days) {
      const prices = days
        .filter((d) => d.status === "available")
        .map((d) => Number(d.price))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (prices.length) value = Math.round(Math.min(...prices));
    }

    cache.set(uid, { value, at: Date.now() });
    inFlight.delete(uid);
    return value;
  })();

  inFlight.set(uid, task);
  return task;
}

/**
 * Batch variant for the PLP. Requests run sequentially with a small gap: 35
 * properties inside a 100/hour budget leaves no room for bursts, and a blocked
 * page of cards is worse than cards that fill in a moment later.
 */
export async function getTripwixLowestNightlyBatch(
  uids: string[],
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};

  const misses: string[] = [];
  for (const uid of uids) {
    const cached = cache.get(uid);
    if (isFresh(cached)) out[uid] = cached.value;
    else misses.push(uid);
  }

  for (const uid of misses) {
    out[uid] = await getTripwixLowestNightly(uid);
    if (misses.length > 1) await new Promise((r) => setTimeout(r, 250));
  }

  return out;
}
