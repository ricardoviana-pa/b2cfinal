/* ==========================================================================
   "From €X" prices in the server HTML (auditoria out/2026,
   performance-09-from-price-latency).

   The server already holds the lowest bookable nightly of every Guesty home
   (server/services/lowest-nightly.ts: memory, then one DB read). It puts the
   prices for the page's homes into the react-query cache under
   SSR_FROM_PRICES_KEY (server/_core/vite.ts → entry-server.tsx), and the
   price queries start from them (hooks/useFromPrices.ts, PropertyDetail).
   So the cards and the PDP show the price in the server HTML and on
   hydration, instead of "select dates" until a query that only starts after
   hydration came back (2–6 s later on a phone). The queries still refresh
   when the seed is older than their staleTime.
   ========================================================================== */

export const SSR_FROM_PRICES_KEY = ['pa', 'ssrFromPrices'] as const;

export interface SsrFromPrices {
  /** guestyId → lowest bookable nightly (null = none known yet). */
  prices: Record<string, number | null>;
  /** When the server read them (ms since epoch). */
  at: number;
}

/**
 * The seed for exactly `ids`, as booking.lowestNightlyBatch returns it, or
 * undefined when the server did not price one of them (the query then fetches
 * as before). When a home has no price yet, the seed is marked stale
 * (updatedAt 0) so the query refreshes it right after hydration — the
 * background warm-up may have found one since — while the known prices show.
 */
export function pickFromPrices(
  seed: SsrFromPrices | undefined,
  ids: readonly string[],
): { data: Record<string, number | null>; updatedAt: number } | undefined {
  if (!seed || !seed.prices || ids.length === 0) return undefined;
  const data: Record<string, number | null> = {};
  let incomplete = false;
  for (const id of ids) {
    if (!Object.prototype.hasOwnProperty.call(seed.prices, id)) return undefined;
    const v = seed.prices[id];
    data[id] = typeof v === 'number' && v > 0 ? v : null;
    if (data[id] === null) incomplete = true;
  }
  return { data, updatedAt: incomplete ? 0 : seed.at };
}

export interface SeededLowestNightly {
  data: { from: number | null; source: 'fallback' | 'calendar' | 'none'; currency: 'EUR' };
  updatedAt: number;
}

/** The same seed in the shape of booking.lowestNightly (one PDP): for our
 *  homes as getDisplayedLowestNightly() answers, for a partner home as the
 *  procedure's tripwix branch does (source 'calendar'). */
export function pickLowestNightly(
  seed: SsrFromPrices | undefined,
  listingId: string | undefined,
  partner = false,
): SeededLowestNightly | undefined {
  if (!listingId) return undefined;
  const picked = pickFromPrices(seed, [listingId]);
  if (!picked) return undefined;
  const from = picked.data[listingId];
  return { data: { from, source: from === null ? 'none' : partner ? 'calendar' : 'fallback', currency: 'EUR' }, updatedAt: picked.updatedAt };
}

/**
 * The property page's seed, under the listing its lowestNightly query sends:
 * a partner (Tripwix) home by its supplier uid, our homes by Guesty id. The
 * page used to read partner homes by Guesty id, which they do not have, so
 * their card said "Price on request" in the server HTML and until the query
 * came back (verificação em produção de 29 out 2026, Property PP-3).
 */
export function pickPdpLowestNightly(
  seed: SsrFromPrices | undefined,
  home: { guestyId?: string | null; tripwixUid?: string | null },
): SeededLowestNightly | undefined {
  return home.tripwixUid
    ? pickLowestNightly(seed, home.tripwixUid, true)
    : pickLowestNightly(seed, home.guestyId ?? undefined);
}
