/**
 * Ricardo, 29 out 2026: the property page shows the real average of ALL the
 * reviews of a home and lists every rating, not only 5★. Until then the sync
 * dropped anything below 5★ at the door, so every home read "5.0".
 *
 * Pure helpers (shared/reviewStats.ts), the Guesty funnel, the curated merge,
 * the JSON-LD and the rendered section, plus a source check that nothing in
 * the site filters reviews by a 5★ bar again.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import {
  MIN_REVIEWS_FOR_AVERAGE, displayedAggregate, formatRating, normaliseRating, publishableReviews,
  reviewAggregate, sortReviewsForDisplay,
} from '../shared/reviewStats';
import { detectReviewLanguage } from '../shared/reviewLanguage';
import { vacationRentalSchema } from '../shared/vacationRentalSchema';
import { __testing, mergeManualReviews } from './services/guesty-sync';
import { recentGuestFeedback } from './services/property-catalog';
import ReviewsSection from '@/components/property/ReviewsSection';
import en from '../client/src/i18n/locales/en.json';
import pt from '../client/src/i18n/locales/pt.json';

(globalThis as any).React = React;
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

describe('rating normalisation', () => {
  it('keeps five-point ratings in tenths and halves ten-point ones', () => {
    expect(normaliseRating(5, false)).toBe(5);
    expect(normaliseRating(4, false)).toBe(4);
    expect(normaliseRating(3.46, false)).toBe(3.5);
    expect(normaliseRating(10, true)).toBe(5);
    expect(normaliseRating(8, true)).toBe(4);
    expect(normaliseRating(7, true)).toBe(3.5);
  });
  it('maps the floor of a ten-point scale to 1 and rejects what is not a rating', () => {
    expect(normaliseRating(1, true)).toBe(1);
    expect(normaliseRating(0, false)).toBeNull();
    expect(normaliseRating('n/a', false)).toBeNull();
    expect(normaliseRating(6, false)).toBeNull();
    expect(normaliseRating(11, true)).toBeNull();
  });
});

describe('average and count', () => {
  const r = (rating: number, text = 'A lovely week by the sea with the family') => ({ rating, text, date: '2026-01-01' });
  it('averages every valid rating to two decimals', () => {
    expect(reviewAggregate([r(5), r(4), r(4)])).toEqual({ count: 3, average: 4.33 });
    expect(reviewAggregate([r(5), r(2), r(0), { rating: NaN, text: 'x' }, r(9)])).toEqual({ count: 2, average: 3.5 });
    expect(reviewAggregate([])).toEqual({ count: 0, average: null });
    expect(reviewAggregate(undefined)).toEqual({ count: 0, average: null });
  });
  it(`shows an average only from ${MIN_REVIEWS_FOR_AVERAGE} reviews, rounded to one decimal`, () => {
    expect(displayedAggregate({ averageRating: 4.67, reviewCount: 12 })).toEqual({ count: 12, average: 4.7 });
    expect(displayedAggregate({ averageRating: 5, reviewCount: 2 })).toEqual({ count: 2, average: null });
    expect(displayedAggregate({ averageRating: 5, reviewCount: 1 })).toEqual({ count: 1, average: null });
    expect(displayedAggregate({ averageRating: 4.85, reviewCount: 3 })).toEqual({ count: 3, average: 4.9 });
    expect(displayedAggregate({ reviewCount: 0, averageRating: null })).toEqual({ count: 0, average: null });
    expect(displayedAggregate(null)).toEqual({ count: 0, average: null });
  });
  it('falls back to the cards when the sync wrote no aggregate, and the stored count wins over the capped cards', () => {
    expect(displayedAggregate({ reviews: [r(5), r(4), r(3)] })).toEqual({ count: 3, average: 4 });
    expect(displayedAggregate({ reviews: [r(5), r(5)] })).toEqual({ count: 2, average: null });
    expect(displayedAggregate({ reviews: Array.from({ length: 40 }, () => r(5)), reviewCount: 57, averageRating: 4.91 })).toEqual({ count: 57, average: 4.9 });
  });
  it('formats with the language’s decimal mark', () => {
    expect(formatRating(4.7, 'en')).toBe('4.7');
    expect(formatRating(4.7, 'pt')).toBe('4,7');
    expect(formatRating(5, 'de')).toBe('5,0');
  });
});

describe('card order and eligibility', () => {
  const texts = {
    pt: 'Casa impecável, muito bem localizada e com tudo o que precisávamos para a estadia.',
    en: 'The house was spotless and the hosts answered every question within minutes.',
    de: 'Das Haus war sehr sauber und die Lage einfach wunderschön, wir kommen gerne wieder.',
  };
  const review = (rating: number, lang: keyof typeof texts, date: string) => ({ rating, text: texts[lang], date });
  it('page language first, then English, then the rest; newest first within each', () => {
    const list = [
      review(5, 'de', '2026-09-01'), review(4, 'en', '2026-08-01'), review(3, 'pt', '2024-01-01'),
      review(5, 'pt', '2025-06-01'), review(5, 'en', '2026-10-01'),
    ];
    const sorted = sortReviewsForDisplay(list, r => detectReviewLanguage(r.text), 'pt');
    expect(sorted.map(r => `${detectReviewLanguage(r.text)}:${r.date}`)).toEqual([
      'pt:2025-06-01', 'pt:2024-01-01', 'en:2026-10-01', 'en:2026-08-01', 'de:2026-09-01',
    ]);
    // Ratings never move a card: a 3★ in the page language stays above a 5★ in another.
    expect(sorted[1].rating).toBe(3);
  });
  it('is newest first without a page language, and stable for equal dates', () => {
    const list = [review(5, 'en', '2026-01-01'), review(4, 'pt', '2026-03-01'), review(2, 'de', '2026-03-01')];
    expect(sortReviewsForDisplay(list).map(r => r.rating)).toEqual([4, 2, 5]);
    expect(sortReviewsForDisplay(list, undefined, 'fr').map(r => r.rating)).toEqual([4, 2, 5]);
  });
  it('keeps every rating with real text and drops channel names and empty bodies', () => {
    const kept = publishableReviews([
      { rating: 2, text: 'Disappointing: the pool was cold and the heating broke.' },
      { rating: 5, text: 'Ok' },
      { rating: 5, text: '👍👍' },
      { rating: 4, text: 'Booked through Airbnb, all good.' },
      { rating: 0, text: 'No rating at all on this one.' },
      { rating: 3.5, text: 'Fine for a weekend.' },
    ]);
    expect(kept.map(r => r.rating)).toEqual([2, 3.5]);
  });
  it('reads the channel name however the guest spelt it, without catching "airy"', () => {
    // "our original air bnb booking cancelled" reached a property page's
    // featured quote (30 out 2026): the space is not a loophole.
    const kept = publishableReviews([
      { rating: 5, text: 'Portugal Active came to our rescue after our original air bnb booking cancelled with 5 days notice!' },
      { rating: 5, text: 'Found it on Air-BnB, then booked direct; spotless house.' },
      { rating: 5, text: 'AIRBNB superhost quality, honestly.' },
      { rating: 4, text: 'Airy bedrooms and a quiet garden, a lovely stay.' },
    ]);
    expect(kept.map(r => r.text)).toEqual(['Airy bedrooms and a quiet garden, a lovely stay.']);
    // The homepage rail applies the same rule.
    const rail = recentGuestFeedback([{
      id: 'x', slug: 'x', name: 'X', isActive: true,
      reviews: [
        { rating: 5, text: 'Our original air bnb booking was cancelled; this house saved the holiday week.', date: '2026-09-01' },
        { rating: 4, text: 'Airy bedrooms and a quiet garden, a lovely stay for the whole family.', date: '2026-08-01' },
      ],
    }], 'en');
    expect(rail.map(r => r.text)).toEqual(['Airy bedrooms and a quiet garden, a lovely stay for the whole family.']);
  });
});

describe('the Guesty funnel', () => {
  const raw = (over: Record<string, unknown>) => ({
    listingId: 'L1', guestId: null, createdAt: '2026-05-01T10:00:00.000Z',
    rawReview: { reviewer_role: 'guest', public_review: 'A thoughtful review of a good stay in the north.', overall_rating: 5 },
    ...over,
  });
  it('keeps every guest rating, normalised, and drops only what is not a public guest review', () => {
    const byListing = __testing.buildReviewsByListing([
      raw({}),
      raw({ createdAt: '2026-06-01T10:00:00.000Z', rawReview: { reviewer_role: 'guest', public_review: 'Good but the wifi dropped twice a day.', overall_rating: 4 } }),
      raw({ createdAt: '2026-07-01T10:00:00.000Z', rawReview: { reviewer_role: 'guest', public_review: 'Average. Nice views, tired furniture.', overall_rating: 3 } }),
      raw({ createdAt: '2026-04-01T10:00:00.000Z', channel: 'booking.com', rawReview: { reviewer_role: 'guest', public_review: 'Great location, very clean, friendly team.', overall_rating: 8 } }),
      raw({ rawReview: { reviewer_role: 'host', public_review: 'Lovely guests.', overall_rating: 5 } }),
      raw({ rawReview: { reviewer_role: 'guest', public_review: '', overall_rating: 2 } }),
      raw({ rawReview: { reviewer_role: 'guest', public_review: 'No score was given.', overall_rating: 0 } }),
      raw({ rawReview: { reviewer_role: 'guest', public_review: 'Hidden one.', overall_rating: 1 }, private: true }),
    ]);
    const kept = byListing.get('L1') ?? [];
    expect(kept.map(r => r.rating)).toEqual([3, 4, 5, 4]); // newest first
    expect(reviewAggregate(kept)).toEqual({ count: 4, average: 4 });
  });
  it('the curated merge accepts every real rating, not only 5★', () => {
    const merged = mergeManualReviews([], [
      { rating: 3, text: 'Was ok, the road up is steep.', date: '2024-02-01' },
      { rating: 4, text: 'Good, but the pool was cold', date: '2024-03-01' },
      { rating: 5, text: '   ' },
      { rating: 10, text: 'Ten point scale' },
      { rating: 5, text: 'Keeper', date: '2024-01-01' },
    ]);
    expect(merged.map(r => [r.rating, r.text])).toEqual([[4, 'Good, but the pool was cold'], [3, 'Was ok, the road up is steep.'], [5, 'Keeper']]);
  });
});

describe('JSON-LD', () => {
  const base = { name: 'Villa', slug: 'villa', reviews: [{ rating: 4, text: 'Fine stay overall.', guestName: 'Ana', date: '2026-01-01' }] };
  it('declares the displayed average, and nothing under three reviews', () => {
    const two = vacationRentalSchema({ ...base, aggregateRating: displayedAggregate({ averageRating: 5, reviewCount: 2 }).average === null ? null : { ratingValue: 5, reviewCount: 2 } });
    expect(two).not.toHaveProperty('aggregateRating');
    const agg = displayedAggregate({ averageRating: 4.67, reviewCount: 12 });
    const twelve = vacationRentalSchema({ ...base, aggregateRating: { ratingValue: agg.average!, reviewCount: agg.count } });
    expect(twelve.aggregateRating).toEqual({ '@type': 'AggregateRating', ratingValue: 4.7, reviewCount: 12, bestRating: 5, worstRating: 1 });
    expect((twelve.review as any[])[0].reviewRating.ratingValue).toBe(4);
  });
  it('keeps a review that names the booking channel out of the review nodes, count untouched', () => {
    const schema = vacationRentalSchema({
      ...base,
      aggregateRating: { ratingValue: 4.5, reviewCount: 3 },
      reviews: [
        { rating: 5, text: 'Portugal Active came to our rescue after our original air bnb booking cancelled.', guestName: 'Kristina', date: '2026-08-10' },
        { rating: 4, text: 'Fine stay overall.', guestName: 'Ana', date: '2026-01-01' },
      ],
    });
    expect((schema.review as any[]).map(r => r.author.name)).toEqual(['Ana']);
    expect((schema.aggregateRating as any).reviewCount).toBe(3);
  });
  it('the page and the server build it from the same helper', () => {
    expect(read('client/src/pages/PropertyDetail.tsx')).toMatch(/displayedAggregate\(/);
    expect(read('server/_core/vite.ts')).toMatch(/displayedAggregate\(/);
    expect(read('client/src/pages/PropertyDetail.tsx')).not.toMatch(/averageRating && \(property as any\)\.reviewCount/);
    expect(read('server/_core/vite.ts')).not.toMatch(/prop\.averageRating && prop\.reviewCount/);
  });
});

describe('the reviews section', () => {
  const resources = { en: { translation: en }, pt: { translation: pt } };
  async function render(lang: string, props: Record<string, unknown>) {
    const i18n = createInstance();
    await i18n.use(initReactI18next).init({ lng: lang, fallbackLng: 'en', resources, interpolation: { escapeValue: false } } as any);
    return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n },
      React.createElement(ReviewsSection as any, { propertyName: 'Villa', propertySlug: 'villa', ...props })));
  }
  const review = (rating: number, text: string, date: string) => ({ rating, text, guestName: 'Ana', guestDisplayName: 'Ana', date });
  const reviews = [
    review(5, 'Casa impecável, muito bem localizada e com tudo o que precisávamos para a estadia.', '2025-06-01'),
    review(3, 'Average. Nice views, tired furniture, and the pool heating was off for two days.', '2026-07-01'),
    review(4, 'Das Haus war sehr sauber und die Lage einfach wunderschön, wir kommen gerne wieder.', '2026-09-01'),
  ];

  it('shows the real average with every rating listed, the page language first', async () => {
    const html = await render('pt', { reviews, averageRating: 4, reviewCount: 3 });
    expect(html).toContain('4,0/5');
    expect(html).toContain('3 avaliações');
    const cards = [...html.matchAll(/aria-label="(\d(?:[.,]\d)?)\/5"/g)].map(m => m[1]);
    expect(cards).toEqual(['5', '3', '4']); // pt first, then en, then de
    expect(html).toContain('Escrito em');
  });

  it('with fewer than three reviews, the count and no average', async () => {
    const html = await render('en', { reviews: reviews.slice(1), averageRating: 3.5, reviewCount: 2 });
    expect(html).toContain('2 reviews');
    expect(html).not.toMatch(/\d[.,]\d\/5/);
    expect([...html.matchAll(/aria-label="(\d(?:[.,]\d)?)\/5"/g)].map(m => m[1])).toEqual(['3', '4']);
  });

  it('renders nothing without reviews', async () => {
    expect(await render('en', { reviews: [], averageRating: null, reviewCount: 0 })).toBe('');
  });
});

describe('no 5★ bar anywhere', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' || e.name === 'checkout-sandbox' ? [] : sources(p);
      return /\.(tsx?|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
  }
  // `rating !== 5`, `r.rating < 5`, `Math.round(Number(r.rating)) === 5`, and the old bar constants.
  const BAR = /\brating\)*\s*(?:>=|===|==|!==|!=|<)\s*5\b(?!\.\d)|MIN_FIVE_POINT|MIN_TEN_POINT/;
  it('no component, service or script keeps or drops a review by a 5★ test', () => {
    const offenders = ['client/src', 'server/services', 'server/_core', 'server/routers', 'shared', 'scripts']
      .flatMap(sources)
      .filter((f) => BAR.test(read(f)));
    expect(offenders).toEqual([]);
  });
  it('the sync stores the aggregate of every review and the curated file no longer says 5★ only', () => {
    expect(read('server/services/guesty-sync.ts')).toMatch(/reviewAggregate\(/);
    const readme = (JSON.parse(read('client/src/data/reviews.manual.json'))._README as string[]).join(' ');
    expect(readme).not.toMatch(/only 5-star|5★ only|must be 4 or 5/i);
  });
});
