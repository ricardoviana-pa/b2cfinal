import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildHomeSearchPath, DEFAULT_QUOTE_GUESTS, listingQuoteGuests, listingQuotesKey } from '@/lib/homeSearch';

// Revisão do PR #175, R1. A homepage search now leaves guests out of the URL
// until the guest picks a number. The listing then took the party for its
// quotes from the picker (bookingGuests), so every tap on the stepper re-ran
// the Guesty search (getBatchQuotes), the dated partner quotes and the search
// hint before Search was pressed — measured 1 → 4 requests each for three
// taps, with the URL and the chips unchanged. Extra Guesty searches are a
// rate-limit risk (ux-home-plp-10; a 429 quote storm is on record).

/** The listing's reading of the URL (Homes.tsx, searchGuestsCount). */
function urlGuests(path: string): number {
  const parsed = Number(new URL(path, 'https://x.test').searchParams.get('guests') || '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

const homes = fs.readFileSync(new URL('../client/src/pages/Homes.tsx', import.meta.url), 'utf8');

describe('the party a listing search is quoted for', () => {
  it('a homepage search with no party chosen quotes for 2', () => {
    const path = buildHomeSearchPath({ destination: 'region:douro', checkin: '2027-07-10', checkout: '2027-07-17', guests: 0 });
    expect(path).toBe('/homes?destination=douro&checkin=2027-07-10&checkout=2027-07-17');
    expect(urlGuests(path)).toBe(0);
    expect(listingQuoteGuests(urlGuests(path))).toBe(DEFAULT_QUOTE_GUESTS);
    expect(listingQuotesKey('2027-07-10', '2027-07-17', urlGuests(path))).toBe('2027-07-10|2027-07-17|2');
  });

  it('the party in the URL (a submitted search) is the one quoted', () => {
    const path = buildHomeSearchPath({ destination: '', checkin: '2027-07-10', checkout: '2027-07-17', guests: 6 });
    expect(listingQuoteGuests(urlGuests(path))).toBe(6);
    expect(listingQuotesKey('2027-07-10', '2027-07-17', urlGuests(path))).toBe('2027-07-10|2027-07-17|6');
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) expect(listingQuoteGuests(bad), String(bad)).toBe(2);
  });

  it('no guests and guests=2 are the same search: choosing 2 does not search again', () => {
    expect(listingQuotesKey('2027-07-10', '2027-07-17', 0)).toBe(listingQuotesKey('2027-07-10', '2027-07-17', 2));
  });
});

describe('the stepper is picker state until Search', () => {
  it('the quoted party comes from the URL, never from the picker', () => {
    expect(homes).toMatch(/const effectiveGuests = listingQuoteGuests\(searchGuestsCount\);/);
    expect(homes).not.toMatch(/searchGuestsCount > 0 \? searchGuestsCount : bookingGuests/);
  });

  it('the Guesty search, the partner quotes and the search hint all use it', () => {
    const start = homes.indexOf('utils.booking.getBatchQuotes');
    const effect = homes.slice(homes.lastIndexOf('useEffect(() => {', start), homes.indexOf('const applyBookingSearch'));
    expect(effect).toMatch(/guests: effectiveGuests \}/);
    expect(effect).toMatch(/listingQuotesKey\(searchCheckin, searchCheckout, effectiveGuests\)/);
    expect(effect).toMatch(/\}, \[searchCheckin, searchCheckout, searchNights, allProperties, effectiveGuests, utils\]\);/);
    expect(effect).not.toMatch(/bookingGuests/);
    expect(homes).toMatch(/usePartnerPrices\(candidateProperties, \{ checkIn: searchCheckin, checkOut: searchCheckout, guests: effectiveGuests \}\)/);
    expect(homes).toMatch(/trpc\.booking\.searchHint\.useQuery\(\s*\{ checkIn: searchCheckin, checkOut: searchCheckout, guests: effectiveGuests \}/);
    expect(homes).toMatch(/const quotesKey = listingQuotesKey\(searchCheckin, searchCheckout, effectiveGuests\);/);
  });

  it('the picker value only reaches the URL written when Search is pressed', () => {
    const lines = homes.split('\n').filter((line) => /\bbookingGuests\b/.test(line));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line, line.trim()).not.toMatch(/effectiveGuests|getBatchQuotes|searchHint|usePartnerPrices|quotesKey|listingQuote/);
    }
    expect(homes).toMatch(/if \(guestsChosen && bookingGuests > 1\) params\.set\('guests', String\(bookingGuests\)\);/);
  });
});
