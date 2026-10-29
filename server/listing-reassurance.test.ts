import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { canPromiseFreeCancellation, daysUntilArrival, isBookableOnline, LONGEST_FREE_CANCELLATION_DAYS } from '@/lib/listingReassurance';
import { FREE_CANCELLATION_DAYS, freeCancellationDeadline, POLICY_CODES } from '@shared/cancellationPolicy';
import { matchesSearchRegion, SEARCH_REGIONS } from '@/lib/destinationSearch';
import { filterProperties } from '@/lib/utils';
import { isChildUnit } from '@/config/propertyGroups';
import type { Property } from '@/lib/types';
import { catalogProperties, getPropertiesForSite } from './services/properties-store';

// Revisão do PR #175, R3 and R5. The listing said "Free cancellation on
// refundable rates, until the date shown before you pay" above every result
// set: above lists of partner (Tripwix) homes only — request-only, no rate,
// no payment, the supplier's terms — and above dated searches inside the
// free-cancellation period, where no refundable rate is free to cancel any
// more. On a phone it also took two stacked items (114–124 px) above the
// first home, one of them repeating the WhatsApp button.

const direct = { guestyId: 'g1', source: undefined, isPortfolio: false };
const partner = { guestyId: undefined, source: 'tripwix', isPortfolio: false };
const portfolio = { guestyId: 'g2', source: undefined, isPortfolio: true };
const today = '2026-10-29';
const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('which homes the line speaks for', () => {
  it('a home booked and paid here: a Guesty home, not portfolio-only, not a partner home', () => {
    expect(isBookableOnline(direct)).toBe(true);
    expect(isBookableOnline(partner)).toBe(false);
    expect(isBookableOnline(portfolio)).toBe(false);
    expect(isBookableOnline({ guestyId: 'g3', source: 'tripwix' })).toBe(false);
  });

  it('never above partner homes only', () => {
    expect(canPromiseFreeCancellation({ homes: [partner, partner, portfolio], today })).toBe(false);
    expect(canPromiseFreeCancellation({ homes: [], today })).toBe(false);
    expect(canPromiseFreeCancellation({ homes: [partner, direct], today })).toBe(true);
  });
});

describe('dates: only while every refundable rate is still free to cancel', () => {
  it('the longest period decides (60 days, STRICT_60)', () => {
    expect(LONGEST_FREE_CANCELLATION_DAYS).toBe(Math.max(...Object.values(FREE_CANCELLATION_DAYS)));
    expect(LONGEST_FREE_CANCELLATION_DAYS).toBe(60);
  });

  it('no date in the search: the rule, shown', () => {
    expect(canPromiseFreeCancellation({ homes: [direct], checkin: '', today })).toBe(true);
    expect(canPromiseFreeCancellation({ homes: [direct], checkin: null, today })).toBe(true);
    // A malformed date is not a dated search on the listing either.
    expect(canPromiseFreeCancellation({ homes: [direct], checkin: '2027-02-30', today })).toBe(true);
  });

  it('arrival 60+ days away: shown; inside any period, or in the past: hidden', () => {
    expect(canPromiseFreeCancellation({ homes: [direct], checkin: addDays(today, 60), today })).toBe(true);
    expect(canPromiseFreeCancellation({ homes: [direct], checkin: '2027-07-10', today })).toBe(true);
    for (const days of [59, 30, 14, 7, 5, 0, -1]) {
      expect(canPromiseFreeCancellation({ homes: [direct], checkin: addDays(today, days), today }), `${days} days`).toBe(false);
    }
  });

  it('says exactly what checkout says: shown ⇔ every refundable rate still has its free-cancellation date', () => {
    const refundable = POLICY_CODES.filter((c) => c !== 'non_refundable');
    for (let days = -2; days <= 75; days++) {
      const checkin = addDays(today, days);
      const everyRateStillFree = refundable.every((code) => freeCancellationDeadline(code, checkin, today) !== null);
      expect(canPromiseFreeCancellation({ homes: [direct], checkin, today }), `${days} days`).toBe(everyRateStillFree);
    }
    expect(daysUntilArrival('2027-07-10', today)).toBe(254);
    expect(daysUntilArrival('2026-10-29', today)).toBe(0);
    expect(daysUntilArrival('soon', today)).toBeNull();
  });
});

describe('the repository catalogue', () => {
  it('a region whose homes are all partner homes gets no cancellation line; the full listing does', async () => {
    const homes = (catalogProperties(await getPropertiesForSite()) as Property[]).filter((p) => p.isActive !== false && !isChildUnit(p.guestyId));
    expect(canPromiseFreeCancellation({ homes, today })).toBe(true);
    let partnerOnly = 0;
    for (const region of SEARCH_REGIONS) {
      const results = filterProperties(homes, 'all', 'all', undefined, undefined, undefined, 'all', 'all')
        .filter((p) => matchesSearchRegion(p.destination, region));
      if (results.length && !results.some(isBookableOnline)) {
        partnerOnly++;
        expect(canPromiseFreeCancellation({ homes: results, today }), region).toBe(false);
      }
    }
    // The audit's case: today at least one region lists partner homes only.
    expect(partnerOnly).toBeGreaterThan(0);
  });
});

describe('on the page', () => {
  const homesPage = fs.readFileSync(new URL('../client/src/pages/Homes.tsx', import.meta.url), 'utf8');
  const line = fs.readFileSync(new URL('../client/src/components/homes/ListingReassurance.tsx', import.meta.url), 'utf8');

  it('the listing decides from the homes it lists and the arrival date in the URL', () => {
    expect(homesPage).toMatch(/showCancellation=\{canPromiseFreeCancellation\(\{ homes: filtered, checkin: searchCheckin \}\)\}/);
  });

  it('on a phone: one line or nothing; WhatsApp only from 1024 px (the button covers it below)', () => {
    expect(line).toMatch(/\$\{showCancellation \? 'flex mb-3' : 'hidden'\} lg:flex lg:mb-5/);
    expect(line).toMatch(/\{showCancellation && \(\s*<li>\s*<Link href="\/legal\/cancellation-policy"/);
    expect(line).toMatch(/<li className="hidden lg:block">\s*<a href=\{whatsappHref\}/);
    // The floating button it would repeat is the phone/tablet one.
    expect(fs.readFileSync(new URL('../client/src/components/homes/ListingWhatsApp.tsx', import.meta.url), 'utf8')).toMatch(/className=\{`lg:hidden fixed/);
  });
});
