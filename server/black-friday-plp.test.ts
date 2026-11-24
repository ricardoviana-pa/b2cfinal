import { describe, expect, it } from 'vitest';
import { isBlackFridayListingEligible } from '../client/src/lib/blackFridayListing';

const directHome = {
  guestyId: '6965331fec80690013738c68',
  isActive: true,
  isPortfolio: false,
};

describe('Black Friday announcement on direct-booking listing cards', () => {
  it('includes an active direct Guesty home without partner or request metadata', () => {
    expect(isBlackFridayListingEligible(directHome)).toBe(true);
  });

  it('includes other direct Guesty homes without a hand-picked campaign list', () => {
    expect(isBlackFridayListingEligible({
      ...directHome,
      guestyId: 'ffffffffffffffffffffffff',
    })).toBe(true);
  });

  it('allows omitted optional flags, as the existing direct-inventory predicate does', () => {
    expect(isBlackFridayListingEligible({ guestyId: directHome.guestyId })).toBe(true);
  });

  it('allows null source and booking mode on an otherwise direct home', () => {
    expect(isBlackFridayListingEligible({
      ...directHome,
      source: null,
      bookingMode: null,
    })).toBe(true);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('does not announce the campaign with a %s Guesty identifier', (_case, guestyId) => {
    expect(isBlackFridayListingEligible({ ...directHome, guestyId })).toBe(false);
  });

  it.each([
    ['inactive homes', { isActive: false }],
    ['portfolio-only homes', { isPortfolio: true }],
    ['partner homes even when a Guesty identifier is present', { source: 'partner' }],
    ['request-only homes even when a Guesty identifier is present', { bookingMode: 'request' }],
  ])('excludes %s', (_case, exclusion) => {
    expect(isBlackFridayListingEligible({ ...directHome, ...exclusion })).toBe(false);
  });
});
