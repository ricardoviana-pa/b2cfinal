/**
 * "From €X" prices for the server-rendered page (auditoria out/2026,
 * performance-09-from-price-latency). The client side is
 * client/src/lib/ssrFromPrices.ts.
 *
 * Reads what the server already has — services/lowest-nightly.ts answers from
 * memory, or with ONE database read for the whole list (no Guesty quote on the
 * request path) — and never holds the page up: if the answer takes longer than
 * the budget, the page renders without prices and the browser asks for them
 * as before. The read is the same one the browser used to make after
 * hydration, and its result stays in lowest-nightly's memory either way.
 */
export const SSR_FROM_PRICES_BUDGET_MS = 250;
/** booking.lowestNightlyBatch accepts at most 120 ids. */
const MAX_IDS = 120;

export interface SsrFromPricesSeed {
  prices: Record<string, number | null>;
  at: number;
}

type Loader = (ids: string[]) => Promise<Record<string, number | null>>;

const defaultLoader: Loader = async (ids) => {
  const { getLowestNightlyBatch } = await import("../services/lowest-nightly");
  return getLowestNightlyBatch(ids);
};

export async function readFromPricesForSsr(
  listingIds: ReadonlyArray<string | null | undefined>,
  load: Loader = defaultLoader,
  budgetMs = SSR_FROM_PRICES_BUDGET_MS,
): Promise<SsrFromPricesSeed | undefined> {
  const ids = Array.from(new Set(listingIds.filter((x): x is string => typeof x === "string" && x.length > 0))).slice(0, MAX_IDS);
  if (ids.length === 0) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      load(ids),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), budgetMs);
        (timer as any)?.unref?.();
      }),
    ]);
    if (!result) return undefined;
    const prices: Record<string, number | null> = {};
    for (const id of ids) {
      const v = result[id];
      prices[id] = typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
    }
    return { prices, at: Date.now() };
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** The partner "from" (services/tripwix.ts getTripwixLowestNightly): the
 *  cheapest minimum stay in the calendar the job stored — memory, or one DB
 *  read; never a Tripwix call on the request path. */
export type PartnerFromLoader = (uid: string, minNights?: number) => Promise<number | null>;

const defaultPartnerLoader: PartnerFromLoader = async (uid, minNights) => {
  const { getTripwixLowestNightly } = await import("../services/tripwix");
  return getTripwixLowestNightly(uid, minNights);
};

export interface PdpPriceProp {
  source?: unknown;
  guestyId?: unknown;
  supplierUid?: unknown;
  minNights?: unknown;
  isActive?: unknown;
}

/** What a property page prices by, and which store answers: our homes by
 *  Guesty listing id (lowest-nightly.ts), partner homes by supplier uid
 *  (their stored calendar) — the listingId the page's lowestNightly query
 *  sends, so the seed is found under the same key. */
export function pdpPriceListing(prop: PdpPriceProp | null | undefined): { id: string; partner: boolean; minNights?: number } | undefined {
  if (!prop) return undefined;
  if (prop.source === "tripwix") {
    // booking.lowestNightly answers null for a partner home that is switched off.
    if (prop.isActive === false || typeof prop.supplierUid !== "string" || !prop.supplierUid) return undefined;
    const minNights = typeof prop.minNights === "number" && Number.isFinite(prop.minNights) && prop.minNights > 0 ? prop.minNights : undefined;
    return { id: prop.supplierUid, partner: true, minNights };
  }
  return typeof prop.guestyId === "string" && prop.guestyId ? { id: prop.guestyId, partner: false } : undefined;
}

/**
 * The "From €X" of ONE property page, for the server HTML. Partner homes
 * were left out (verificação em produção de 29 out 2026, Property PP-3): a
 * home with a price said "Price on request · Pick your dates for the exact
 * total" until the browser's query came back, 0.4–0.7 s after paint. Same
 * budget as the lists; a null is seeded too, so a home with no price says
 * "on request" at once instead of promising a total.
 */
export async function readPdpFromPriceForSsr(
  prop: PdpPriceProp | null | undefined,
  loaders: { guesty?: Loader; partner?: PartnerFromLoader } = {},
  budgetMs = SSR_FROM_PRICES_BUDGET_MS,
): Promise<SsrFromPricesSeed | undefined> {
  const listing = pdpPriceListing(prop);
  if (!listing) return undefined;
  if (!listing.partner) return readFromPricesForSsr([listing.id], loaders.guesty ?? defaultLoader, budgetMs);
  const partner = loaders.partner ?? defaultPartnerLoader;
  return readFromPricesForSsr([listing.id], async ([uid]) => ({ [uid]: await partner(uid, listing.minNights) }), budgetMs);
}

/** The Guesty listing ids of a list of property cards — the same filter the
 *  pages use for their lowestNightlyBatch input (partner homes have none). */
export function guestyIdsOf(properties: ReadonlyArray<{ guestyId?: unknown }> | null | undefined): string[] {
  return (properties ?? [])
    .filter((p) => p && typeof p.guestyId === "string" && p.guestyId)
    .map((p) => p.guestyId as string);
}
