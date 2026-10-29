import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { createInstance } from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { formatSiteDate } from '../shared/siteDate';
import en from '../client/src/i18n/locales/en.json';
import fr from '../client/src/i18n/locales/fr.json';
import pt from '../client/src/i18n/locales/pt.json';
import nl from '../client/src/i18n/locales/nl.json';

/* Revisão do PR #182 (B1/F1), 29 out 2026. Since #175 the homepage shows the
   reviews in the page language first, and /fr, /pt and /nl now carry Guesty
   timestamps on the turn of a month. GuestFeedback formatted them in the
   browser's zone: for the review of 2026-07-31T21:27Z the server (UTC) wrote
   "juil. 2026" and a browser in Tokyo or Helsinki "août 2026", so React threw
   #418 on production and the homepage and the property page disagreed on the
   month. The real component is rendered here under each zone (Node honours a
   runtime change of process.env.TZ: see the control test). */

const feedback = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock('@/lib/trpc', () => ({
  trpc: { properties: { guestFeedback: { useQuery: () => ({ data: feedback.data }) } } },
}));
import GuestFeedback from '@/components/property/GuestFeedback';

// The app compiles JSX with the automatic runtime; vitest uses tsconfig's
// classic transform, which expects a React global.
(globalThis as any).React = React;

const ORIGINAL_TZ = process.env.TZ;
afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const MONTH = { month: 'short', year: 'numeric' } as const;
// UTC is the server (Render); the others are where a month moved on 29 Oct,
// plus the four zones the fix was checked in with a browser.
const ZONES = [
  'UTC', 'Europe/Lisbon', 'Europe/Helsinki', 'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney',
  'Pacific/Auckland', 'Pacific/Kiritimati', 'America/New_York', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Pacific/Honolulu',
];
// The homepage reviews whose month differed by zone on 29 Oct (window.__RQ_STATE__ of
// production /fr, /pt and /nl), with the month the server wrote.
const CASES = [
  { lang: 'fr', guest: 'Clémence', slug: 'shoreline-escape-by-portugal-active-5cfb02', date: '2026-07-31T21:27:33.174Z', month: 'juil. 2026' },
  { lang: 'fr', guest: 'Tony', slug: 'dunes-beach-house-with-ocean-views-cb71c9', date: '2026-09-01T07:34:58.244Z', month: 'sept. 2026' },
  { lang: 'pt', guest: 'Luciana', slug: 'portugal-active-sunset-beach-lodge-heated-pool-5ceb91', date: '2026-07-01T09:44:06.682Z', month: 'jul. de 2026' },
  { lang: 'nl', guest: 'Sanne', slug: 'lighthouse-view-by-portugal-active-ed2d6c', date: '2026-05-01T09:16:35.363Z', month: 'mei 2026' },
] as const;

const resources = { en: { translation: en }, fr: { translation: fr }, pt: { translation: pt }, nl: { translation: nl } };

async function captions(lang: string, tz: string, reviews: ReadonlyArray<{ guest: string; slug: string; date: string }>) {
  const i18n = createInstance();
  await i18n.use(initReactI18next).init({
    lng: lang, fallbackLng: 'en', resources, interpolation: { escapeValue: false }, showSupportNotice: false,
  } as any);
  feedback.data = reviews.map((r) => ({
    property: { slug: r.slug, name: r.slug }, rating: 5, language: lang, guestName: r.guest, date: r.date,
    text: 'Une maison magnifique, très bien située et parfaitement équipée.',
  }));
  process.env.TZ = tz;
  const html = renderToStaticMarkup(
    React.createElement(I18nextProvider, { i18n },
      React.createElement(Router, { ssrPath: `/${lang}` }, React.createElement(GuestFeedback))),
  );
  return [...html.matchAll(/<p class="caption[^"]*">([^<]*)<\/p>/g)].map((m) => m[1]);
}

describe('homepage reviews: the same month on the server and in every browser zone', () => {
  it('control: the zone really changes in this process (the old formatting moves the month)', () => {
    const naive = () => new Date(CASES[0].date).toLocaleDateString('fr', MONTH);
    process.env.TZ = 'UTC';
    expect(naive()).toBe('juil. 2026');
    process.env.TZ = 'Asia/Tokyo';
    expect(naive()).toBe('août 2026');
  });

  it.each(ZONES)('every caption is the one the server wrote, in %s', async (tz) => {
    for (const lang of ['fr', 'pt', 'nl']) {
      const reviews = CASES.filter((c) => c.lang === lang);
      expect(await captions(lang, tz, reviews), `${lang} ${tz}`).toEqual(reviews.map((r) => `${r.guest} · ${r.month}`));
    }
  });

  it("the month is the property page's month for the same review (Lisbon time, formatSiteDate)", () => {
    for (const c of CASES) expect(formatSiteDate(c.date, c.lang, MONTH), c.slug).toBe(c.month);
  });

  it('a review without a usable date shows the name only, never "Invalid Date"', async () => {
    expect(await captions('fr', 'UTC', [{ guest: 'Anne', slug: 'x', date: '' }, { guest: 'Marc', slug: 'y', date: 'n/a' }]))
      .toEqual(['Anne', 'Marc']);
  });
});
