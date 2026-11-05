export interface UnitQuote {
  total: number;
  nightlyRate: number;
  cleaningFee: number;
  nights: number;
  available?: boolean;
  source?: string;
}

type Quotes = Record<string, UnitQuote | null>;
export type UnitQuoteSnapshot = { key: string; loading: boolean; quotes: Quotes };

export function unitQuoteSelectionKey(input: {
  groupId: string; checkIn: string; checkOut: string; guests: number;
  listings: Array<{ listingId: string; slug: string }>;
}): string {
  return JSON.stringify([input.groupId, input.checkIn, input.checkOut, input.guests,
    input.listings.map(p => [p.listingId, p.slug])]);
}

/** Used during render, before an effect for a newly chosen stay can run. */
export function unitQuotesForSelection(key: string | null, snapshot: UnitQuoteSnapshot | null) {
  if (!key) return { loading: false, quotes: {} as Quotes };
  if (snapshot?.key !== key || snapshot.loading) return { loading: true, quotes: {} as Quotes };
  return { loading: false, quotes: snapshot.quotes };
}

/** A replaced/unmounted request cannot publish a late success or error. */
export function loadUnitQuotes(
  key: string,
  load: () => Promise<Quotes>,
  publish: (snapshot: UnitQuoteSnapshot) => void,
) {
  let cancelled = false;
  publish({ key, loading: true, quotes: {} });
  const settled = Promise.resolve().then(load).then(
    quotes => { if (!cancelled) publish({ key, loading: false, quotes }); },
    () => { if (!cancelled) publish({ key, loading: false, quotes: {} }); },
  );
  return { cancel: () => { cancelled = true; }, settled };
}
