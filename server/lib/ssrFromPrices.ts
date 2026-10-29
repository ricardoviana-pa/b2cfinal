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

/** The Guesty listing ids of a list of property cards — the same filter the
 *  pages use for their lowestNightlyBatch input (partner homes have none). */
export function guestyIdsOf(properties: ReadonlyArray<{ guestyId?: unknown }> | null | undefined): string[] {
  return (properties ?? [])
    .filter((p) => p && typeof p.guestyId === "string" && p.guestyId)
    .map((p) => p.guestyId as string);
}
