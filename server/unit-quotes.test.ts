import { describe, expect, it } from 'vitest';
import { loadUnitQuotes, unitQuoteSelectionKey, unitQuotesForSelection, type UnitQuoteSnapshot } from '../client/src/lib/unitQuotes';

const selection = { groupId: 'group', checkIn: '2027-05-10', checkOut: '2027-05-17', guests: 2, listings: [{ listingId: 'unit-id', slug: 'unit' }] };
const key = unitQuoteSelectionKey(selection);
const price = { total: 700, nightlyRate: 100, cleaningFee: 0, nights: 7, available: true, source: 'live' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('unit prices belong only to their current stay and group', () => {
  it.each([
    { checkIn: '2027-06-10' }, { checkOut: '2027-05-18' }, { guests: 4 },
    { groupId: 'another-group' }, { listings: [{ listingId: 'different-id', slug: 'unit' }] },
    { listings: [{ listingId: 'unit-id', slug: 'renamed-unit' }] },
  ])('hides the old price/status on the first render after selection changes: %o', change => {
    const nextKey = unitQuoteSelectionKey({ ...selection, ...change });
    const previous = { key, loading: false, quotes: { unit: price, unavailable: { ...price, available: false } } };
    expect(unitQuotesForSelection(nextKey, previous)).toEqual({ loading: true, quotes: {} });
  });

  it('shows no previous quote when the date pair is cleared', () => {
    expect(unitQuotesForSelection(null, { key, loading: false, quotes: { unit: price } })).toEqual({ loading: false, quotes: {} });
  });

  it('keeps only the newest response when an earlier request finishes later', async () => {
    let state: UnitQuoteSnapshot | null = { key, loading: false, quotes: { unit: price } };
    const publish = (next: UnitQuoteSnapshot) => { state = next; };
    const first = deferred<{ unit: typeof price }>();
    const second = deferred<{ unit: typeof price }>();
    const a = loadUnitQuotes(key, () => first.promise, publish);
    expect(unitQuotesForSelection(key, state)).toEqual({ loading: true, quotes: {} });
    a.cancel();
    const nextKey = unitQuoteSelectionKey({ ...selection, guests: 4 });
    const b = loadUnitQuotes(nextKey, () => second.promise, publish);
    second.resolve({ unit: { ...price, total: 900 } });
    await b.settled;
    first.resolve({ unit: { ...price, available: false } });
    await a.settled;
    expect(unitQuotesForSelection(nextKey, state)).toEqual({ loading: false, quotes: { unit: { ...price, total: 900 } } });
  });

  it('drops stale prices on failure and ignores errors from a cancelled request', async () => {
    let state: UnitQuoteSnapshot | null = { key, loading: false, quotes: { unit: price } };
    const publish = (next: UnitQuoteSnapshot) => { state = next; };
    const old = deferred<{ unit: typeof price }>();
    const a = loadUnitQuotes(key, () => old.promise, publish);
    a.cancel();
    const nextKey = unitQuoteSelectionKey({ ...selection, guests: 4 });
    const b = loadUnitQuotes(nextKey, () => Promise.reject(new Error('synthetic network failure')), publish);
    await b.settled;
    expect(unitQuotesForSelection(nextKey, state)).toEqual({ loading: false, quotes: {} });
    old.reject(new Error('old request failure'));
    await a.settled;
    expect(state?.key).toBe(nextKey);
    expect(unitQuotesForSelection(nextKey, state)).toEqual({ loading: false, quotes: {} });
  });
});
