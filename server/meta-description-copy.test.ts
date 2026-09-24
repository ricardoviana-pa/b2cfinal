import { describe, expect, it } from 'vitest';
import { __testing } from './_core/vite';
import collections from '../client/src/data/collections.json';
import experiences from '../client/src/data/experienceDetails.json';

const { getPageMeta, getBlogArticleBySlugCached, localizeExperienceForMeta } = __testing;

// The PT and ES pages whose description Google cut at 155 characters
// (production sample, 24 set 2026). Each source text now fits whole.
const BLOG: Record<string, string[]> = {
  pt: ['peneda-geres-national-park-autumn-2026-guide', 'porto-douro-valley-guide', 'private-villa-vs-luxury-hotel-portugal', 'wine-guide-douro-vinho-verde', 'hotel-standards-behind-the-scenes', 'video-showcasing-viana-do-castelo-cmvc', 'guest-diary-family-time-in-paradise'],
  es: ['peneda-geres-national-park-autumn-2026-guide', 'complete-guide-north-portugal', 'porto-douro-valley-guide', 'private-villa-vs-luxury-hotel-portugal', 'minho-vs-algarve', 'surfing-minho-coast', 'video-showcasing-viana-do-castelo-cmvc', 'hotel-standards-behind-the-scenes', 'the-guardian-hidden-portugal', 'guest-diary-family-time-in-paradise', 'mens-health-kitesurf-higher-education'],
};
const PAGES: Record<string, string[]> = { pt: ['/', '/corporate-retreats'], es: ['/', '/corporate-retreats', '/best-rate-guarantee'] };
const COLLECTIONS = ['sea-view-villas', 'villas-with-private-pool', 'pet-friendly-villas'];

const fits = (s: string | undefined) => {
  expect(s).toBeTruthy();
  expect(s!.length).toBeLessThanOrEqual(155);
  expect(s).toMatch(/[.!?]$/);
};

describe('PT and ES meta descriptions fit Google whole', () => {
  for (const lang of ['pt', 'es']) {
    it.each(PAGES[lang])(`${lang} static page %s`, (p) => fits(getPageMeta(p, lang)?.description));
    it.each(BLOG[lang])(`${lang} blog %s`, async (slug) => fits((await getBlogArticleBySlugCached(slug, lang))?.seoDescription));
  }
  it.each(COLLECTIONS)('pt collection %s', (slug) => fits((collections as any[]).find((c) => c.slug === slug).pt.metaDescription));

  it.each(['pt', 'es'])('%s experience page reads its own language, not English', (lang) => {
    const base = (experiences as any).experiences.find((e: any) => e.slug === 'hike-dive-dine');
    const exp = localizeExperienceForMeta(base, lang);
    expect(exp.name).not.toBe(base.name);
    fits(exp.seoDescription);
    expect(exp.seoDescription).toContain("Serra d'Arga");
  });
});
