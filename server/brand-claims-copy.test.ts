import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import i18next from 'i18next';
import { __testing } from './_core/vite';
import { HOME_COUNT_LABEL, HOME_COUNT, OWN_HOME_COUNT, PARTNER_HOME_COUNT } from '../shared/brandFacts';

/* 3 November 2026: approved public brand figure is 70. Catalogue inventory
   remains accurate internally; guest copy does not expose a supplier/owner split. */

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
const locale = (lng: string) => JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lng}.json`, 'utf8'));
const get = (o: any, k: string) => k.split('.').reduce((a, x) => (a == null ? undefined : a[x]), o);

describe('public brand presentation', () => {
  it('keeps the approved figure separate from actual catalogue inventory', () => {
    expect(HOME_COUNT_LABEL).toBe('70');
    expect(HOME_COUNT).toBe(OWN_HOME_COUNT + PARTNER_HOME_COUNT);
    expect(HOME_COUNT).toBeGreaterThanOrEqual(Number(HOME_COUNT_LABEL));
  });

  it.each(LANGS)('%s uses one count without an operator or ownership split', async (lng) => {
    const l = locale(lng);
    const i18n = i18next.createInstance();
    await i18n.init({ lng, resources: { [lng]: { translation: l } } });
    for (const key of ['about.heroSubtitle', 'about.storyP3']) {
      const text = i18n.t(key, { count: HOME_COUNT_LABEL });
      expect(text).toContain('70');
      expect(text).not.toContain('{{');
      expect(get(l, key)).not.toContain('{{own}}');
    }
    expect(l.home.proofManaged).toBeUndefined();
  });

  it.each(LANGS)('%s editorial CTA labels use sentence case consistently', (lng) => {
    const l = locale(lng);
    for (const text of [l.home.heroCta, l.siteUx.exploreServices, l.about.storyCta]) {
      expect(text).not.toBe(text.toLocaleUpperCase(lng));
    }
  });

  it('the homepage no longer renders a second portfolio figure', () => {
    const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
    expect(home).not.toContain('proofManaged');
    expect(home).not.toContain('OWN_HOME_COUNT');
  });

  it.each(LANGS)('%s metadata and client navigation agree on the public figure and language', async (lng) => {
    const l = locale(lng);
    const i18n = i18next.createInstance();
    await i18n.init({ lng, resources: { [lng]: { translation: l } } });
    for (const [route, key] of [['/', 'home'], ['/homes', 'homes']] as const) {
      const meta = __testing.getPageMeta(route, lng)!;
      expect(meta.title).toBe(`${i18n.t(`${key}.metaTitle`)} | Portugal Active`);
      expect(meta.description).toBe(i18n.t(`${key}.metaDescription`, { homes: HOME_COUNT_LABEL }));
    }
    expect(__testing.getPageMeta('/about', lng)!.description)
      .toBe(i18n.t('about.heroSubtitle', { count: HOME_COUNT_LABEL }));
  });

  it('default metadata and AI manifests do not expose a supplier split', () => {
    for (const file of ['client/index.html', 'client/public/llms.txt', 'client/public/.well-known/llms.txt']) {
      const copy = fs.readFileSync(file, 'utf8');
      expect(copy).toContain('70');
      expect(copy).not.toMatch(/100\+|most of them|partner properties|partner enquiry|directly managed homes/);
    }
  });
});

describe('"hotel privado" só como comparação (i18n-copy-12)', () => {
  const PRIVATE_HOTEL = /private[- ]hotel|privates? hotel|hotel privado|hoteles privados|hotéis privados|hôtels? privés?|hotel privat[oi]|privéhotel|privathotell|privata hotell|yksityishotell|yksityinen hotelli/i;

  it('no blog title, H1, excerpt or meta uses it as the product, in any language', () => {
    const blog = JSON.parse(fs.readFileSync('client/src/data/blog.json', 'utf8'));
    const entries: [string, any][] = blog.articles.map((a: any) => [`en/${a.slug}`, a]);
    for (const lng of LANGS.filter((l) => l !== 'en')) {
      const overrides = JSON.parse(fs.readFileSync(`client/src/data/blog.i18n/${lng}.json`, 'utf8'));
      for (const [slug, o] of Object.entries(overrides)) entries.push([`${lng}/${slug}`, o]);
    }
    for (const [id, a] of entries) {
      for (const field of ['title', 'seoTitle', 'seoDescription', 'excerpt']) {
        if (a[field]) expect(a[field], `${id} ${field}`).not.toMatch(PRIVATE_HOTEL);
      }
    }
  });

  it('keeps the URL of the retitled post and its translations in step', () => {
    const blog = JSON.parse(fs.readFileSync('client/src/data/blog.json', 'utf8'));
    const post = blog.articles.find((a: any) => a.slug === 'private-hotel-model');
    expect(post?.status).toBe('published');
    expect(post.content).not.toMatch(PRIVATE_HOTEL);
    // scripts/refresh-translations.mjs: the manifest holds the hash of the EN
    // source last translated; equal means the 8 translations are current.
    const manifest = JSON.parse(fs.readFileSync('client/src/data/blog.i18n/.manifest.json', 'utf8'));
    const pick = Object.fromEntries(['title', 'excerpt', 'content', 'seoTitle', 'seoDescription'].map((f) => [f, post[f] ?? null]));
    expect(manifest['private-hotel-model']).toBe(crypto.createHash('sha256').update(JSON.stringify(pick)).digest('hex').slice(0, 16));
    for (const lng of LANGS.filter((l) => l !== 'en')) {
      const o = JSON.parse(fs.readFileSync(`client/src/data/blog.i18n/${lng}.json`, 'utf8'))['private-hotel-model'];
      expect(o.content, lng).not.toMatch(PRIVATE_HOTEL);
    }
  });

  it.each(LANGS)('%s: the About story and the home concept no longer name the product a private hotel', (lng) => {
    const l = locale(lng);
    expect(l.about.storyP2).not.toMatch(PRIVATE_HOTEL);
    expect(l.home.conceptBody).not.toMatch(PRIVATE_HOTEL);
  });
});
