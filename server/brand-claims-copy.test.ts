import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import crypto from 'node:crypto';
import i18next from 'i18next';
import { __testing } from './_core/vite';
import { HOME_COUNT_LABEL, OWN_HOME_COUNT, OWN_HOME_COUNT_LABEL, PARTNER_HOME_COUNT, homeCountLabel } from '../shared/brandFacts';

/* Auditoria 29 out 2026:
   - ux-home-plp-02: "100+ casas, cada uma gerida pela nossa equipa" não é
     verdade para as 35 casas de parceiros; quem gere, prepara ou verifica as
     casas fala só das casas que a equipa gere ({{own}});
   - i18n-copy-12 / seo-health-private-hotel-blog-post: "hotel privado" só
     como comparação, nunca como o produto. */

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
const locale = (lng: string) => JSON.parse(fs.readFileSync(`client/src/i18n/locales/${lng}.json`, 'utf8'));
const get = (o: any, k: string) => k.split('.').reduce((a, x) => (a == null ? undefined : a[x]), o);

describe('quem gere as casas: só as que a equipa gere (ux-home-plp-02)', () => {
  it('counts our own homes with the same rounding as the catalogue', () => {
    expect(OWN_HOME_COUNT_LABEL).toBe(homeCountLabel(OWN_HOME_COUNT));
    expect(OWN_HOME_COUNT_LABEL).not.toBe(HOME_COUNT_LABEL);
  });

  const CLAIMS = ['about.heroSubtitle', 'about.storyP3', 'home.proofManaged'];
  it.each(LANGS)('%s states the own-team claim with {{own}}, never as a figure for every home', (lng) => {
    const l = locale(lng);
    for (const key of CLAIMS) expect(get(l, key), `${lng} ${key}`).toContain('{{own}}');
    for (const key of ['about.heroSubtitle', 'about.storyP3']) expect(get(l, key), `${lng} ${key}`).toContain('{{count}}');
    // The old hard-coded "fifty" (fr/es/it/de/nl/sv/fi) is gone.
    for (const key of CLAIMS) expect(get(l, key), `${lng} ${key}`).not.toMatch(/cinquante|cincuenta|cinquanta|fünfzig|vijftig|femtio|viisikymmen/i);
  });

  it('reads true with the real numbers', async () => {
    const en = locale('en');
    const i18n = i18next.createInstance();
    await i18n.init({ lng: 'en', resources: { en: { translation: en } } });
    expect(i18n.t('about.heroSubtitle', { count: HOME_COUNT_LABEL, own: OWN_HOME_COUNT_LABEL }))
      .toBe(`${HOME_COUNT_LABEL} homes across Portugal, ${OWN_HOME_COUNT_LABEL} of them run end-to-end by our own people.`);
    expect(i18n.t('home.proofManaged', { own: OWN_HOME_COUNT_LABEL })).toBe(`${OWN_HOME_COUNT_LABEL} run by our own team`);
  });

  it('pages pass the own count where the copy asks for it', () => {
    const about = fs.readFileSync('client/src/pages/About.tsx', 'utf8');
    const home = fs.readFileSync('client/src/pages/Home.tsx', 'utf8');
    expect(about.match(/t\('about\.heroSubtitle', \{ count: HOME_COUNT, own: OWN_HOME_COUNT \}\)/g)).toHaveLength(2);
    expect(about).toContain("t('about.storyP3', { count: HOME_COUNT, own: OWN_HOME_COUNT })");
    expect(about).not.toMatch(/\$\{HOME_COUNT\} operated/);
    expect(home).toContain("t('home.proofManaged', { own: OWN_HOME_COUNT_LABEL");
  });

  it('no universal "every home is managed/prepared/checked by us" left in the rendered copy', () => {
    const qualified: Record<string, RegExp> = {
      en: /we manage/, pt: /que gerimos/, fr: /que nous gérons/, es: /que gestionamos/, it: /che gestiamo/,
      de: /das wir betreuen|die wir betreuen|in einem Haus, das wir betreuen/, nl: /dat wij beheren|die wij beheren/, sv: /vi förvaltar/, fi: /hallinnoima/,
    };
    for (const lng of LANGS) {
      const l = locale(lng);
      for (const key of ['about.standard2Body', 'about.standard5Body', 'about.behindScenesP1', 'about.behindScenesP2', 'home.conceptBody', 'home.step1Body', 'home.destBody']) {
        expect(get(l, key), `${lng} ${key}`).toMatch(qualified[lng]);
      }
    }
  });

  it('the About H1 no longer says we run "each one" of the villas we rent', () => {
    const each: Record<string, RegExp> = {
      en: /each one/i, pt: /cada uma/i, fr: /chacune/i, es: /cada una/i, it: /ciascuna/i,
      de: /\bjede\b/i, nl: /elke villa/i, sv: /var och en/i, fi: /jokaista/i,
    };
    for (const lng of LANGS) expect(locale(lng).about.heroTitle, lng).not.toMatch(each[lng]);
  });

  it('the /about meta says how many homes we run, not how many we list', () => {
    const { getPageMeta } = __testing;
    expect(getPageMeta('/about', 'en')!.description).toMatch(new RegExp(`^We run ${OWN_HOME_COUNT_LABEL.replace('+', '\\+')} `));
    for (const lng of LANGS) {
      const d = getPageMeta('/about', lng)!.description;
      expect(d, lng).toContain(OWN_HOME_COUNT_LABEL);
      expect(d, lng).not.toContain('{{');
    }
  });

  it('the default description says "most of them" only while our own homes are the majority', () => {
    const html = fs.readFileSync('client/index.html', 'utf8');
    expect(html).not.toContain('run end to end by our own in-house team');
    expect(html.match(/most of them run end to end by our own team/g)).toHaveLength(4);
    expect(OWN_HOME_COUNT).toBeGreaterThan(PARTNER_HOME_COUNT);
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
