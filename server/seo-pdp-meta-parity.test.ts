/* ==========================================================================
   Home pages: the server's <head> and the hydrated page's must be the same.

   Non-English home pages switched to an English title and a mixed-language
   description after hydration — in the browser and in Google's renderer —
   because the client rebuilt them from its own English template when the
   translations loaded (auditoria out/2026, seo-health-pdp-hydration-english-
   meta / i18n-copy-03 / ux-pdp-04). These tests run the server's injection on
   the real HTML shell and the client's usePageMeta resolution on the same
   record, in the three states the page goes through (server-seeded override,
   full translation file loaded, nothing loaded yet), and require equality.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { __testing } from './_core/vite';
import { resolvePageMeta } from '@/lib/pageMeta';
import { propertyPageMetaOpts } from '@/lib/propertyPageMeta';
import { mergePropertyOverrides, propertyOverrideKey } from '@shared/propertyLocalization';
import { buildPdpFaq, faqPageNode } from '@shared/pdpFaq';
import { propertyPageName } from '@shared/propertyMeta';

const ROOT = path.resolve(import.meta.dirname, '..');
const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'];
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const OWN: any[] = readJson('client/src/data/properties.json');
const PARTNER: any[] = readJson('client/src/data/tripwix-properties.json');
const HOMES = [...OWN, ...PARTNER].filter((p) => p.slug && p.isActive !== false);
const OVERRIDES: Record<string, Record<string, any>> = Object.fromEntries(
  LANGS.filter((l) => l !== 'en').map((l) => [l, readJson(`client/src/data/properties.i18n/${l}.json`)]),
);
const SHELL = fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8');
const SAO_JULIAO = 's-o-juli-o-retreat-pool-jacuzzi-garden-escape-743511';
const home = (slug: string) => {
  const p = HOMES.find((h) => h.slug === slug);
  if (!p) throw new Error(`fixture home missing: ${slug}`);
  return p;
};

const decode = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const pick = (html: string, re: RegExp) => {
  const m = html.match(re);
  return m ? decode(m[1]) : undefined;
};

/** What the server writes into the document for /{lang}/homes/{slug}. */
function serverHead(prop: any, lang: string) {
  const meta = __testing.buildPropertyDynamicMeta(prop, lang);
  const html = __testing.injectMeta(SHELL, meta);
  return {
    title: pick(html, /<title>([^<]*)<\/title>/),
    description: pick(html, /<meta name="description" content="([^"]*)"/),
    ogTitle: pick(html, /<meta property="og:title" content="([^"]*)"/),
    ogDescription: pick(html, /<meta property="og:description" content="([^"]*)"/),
    ogImage: pick(html, /<meta property="og:image" content="([^"]*)"/),
    ogUrl: pick(html, /<meta property="og:url" content="([^"]*)"/),
    canonical: pick(html, /<link rel="canonical" href="([^"]*)"/),
    twitterTitle: pick(html, /<meta name="twitter:title" content="([^"]*)"/),
    twitterDescription: pick(html, /<meta name="twitter:description" content="([^"]*)"/),
    marker: /<meta name="pa-ssr-meta" content="1" \/>/.test(html),
  };
}

/** What usePageMeta would write on the hydrated PropertyDetail. */
function clientHead(property: any, lang: string) {
  const r = resolvePageMeta(propertyPageMetaOpts(property, lang), lang);
  return {
    title: r.title,
    description: r.description,
    ogTitle: r.title,
    ogDescription: r.description,
    ogImage: r.image,
    ogUrl: r.url,
    canonical: r.url,
    twitterTitle: r.title,
    twitterDescription: r.description,
  };
}

/** The three versions of the record the page renders, in order. */
function clientStates(raw: any, lang: string) {
  const prefetch = __testing.buildPropertyPrefetch(raw.slug, raw, lang) as any;
  const seeded = prefetch.propertyOverrides?.data ?? {};
  return {
    seeded: mergePropertyOverrides(raw, seeded),
    loaded: mergePropertyOverrides(raw, OVERRIDES[lang] ?? {}),
    none: raw,
  };
}

describe('home page <head>: server injection == client usePageMeta', () => {
  it('/fr/homes/<São Julião>: the hydrated page keeps the French title, description and Open Graph', () => {
    const raw = home(SAO_JULIAO);
    const server = serverHead(raw, 'fr');
    expect(server.marker).toBe(true);
    for (const state of Object.values(clientStates(raw, 'fr'))) {
      const { marker: _m, ...head } = server;
      expect(clientHead(state, 'fr')).toEqual(head);
    }
    // And it is French — not the old English client template ("— 4-Bed
    // Luxury Villa Minho"); the title sheds words to stay within 65.
    expect(server.title).toBe('São Julião Retreat | Villa dans le Minho | Portugal Active');
    expect(server.description).toBe('São Julião Retreat. Villa de luxe 4 chambres dans le Minho, jusqu\'à 10 personnes. Réservez en direct avec Portugal Active.'.replace('10', String(raw.maxGuests)));
    expect(server.description).toMatch(/Réservez en direct avec Portugal Active\.$/);
    expect(server.description).not.toMatch(/Book direct|luxury villa/i);
    expect(server.ogUrl).toBe(`https://www.portugalactive.com/fr/homes/${SAO_JULIAO}`);
  });

  it.each(LANGS)('every home in %s: identical in every state of the page', (lang) => {
    for (const raw of HOMES) {
      const { marker, ...server } = serverHead(raw, lang);
      expect(marker).toBe(true);
      const states = clientStates(raw, lang);
      expect(clientHead(states.seeded, lang)).toEqual(server);
      expect(clientHead(states.loaded, lang)).toEqual(server);
      expect(clientHead(states.none, lang)).toEqual(server);
    }
  });

  it('non-English titles and descriptions carry no English template words', () => {
    for (const lang of LANGS.filter((l) => l !== 'en')) {
      for (const raw of HOMES) {
        const { title, description } = serverHead(raw, lang);
        // The segment the template writes (names may say "Luxury").
        const segment = String(title).slice(propertyPageName(raw).length);
        expect(segment).not.toMatch(/Luxury|Bedroom|Book direct/);
        expect(description).not.toMatch(/Book direct with Portugal Active/);
      }
    }
  });
});

describe('SSR prefetch carries the translated record (server HTML body)', () => {
  it('seeds the page\'s own override for non-English routes, nothing for English', () => {
    const raw = home(SAO_JULIAO);
    const fr = __testing.buildPropertyPrefetch(raw.slug, raw, 'fr') as any;
    const key = propertyOverrideKey(raw)!;
    expect(fr.propertyBySlug).toEqual({ slug: raw.slug, data: raw });
    expect(fr.propertyOverrides.lang).toBe('fr');
    expect(fr.propertyOverrides.slug).toBe(raw.slug);
    expect(Object.keys(fr.propertyOverrides.data)).toEqual([key]);
    expect(fr.propertyOverrides.data[key]).toEqual(OVERRIDES.fr[key]);
    const en = __testing.buildPropertyPrefetch(raw.slug, raw, 'en') as any;
    expect(en.propertyOverrides).toBeUndefined();
  });

  it('the seeded override renders the same record as the full translation file', () => {
    for (const lang of LANGS.filter((l) => l !== 'en')) {
      for (const raw of HOMES) {
        const states = clientStates(raw, lang);
        expect(states.seeded).toEqual(states.loaded);
      }
    }
  });

  it('partner homes (keyed by slug) get their override too', () => {
    const partner = PARTNER.find((p) => OVERRIDES.de[p.slug]);
    expect(partner).toBeTruthy();
    const pf = __testing.buildPropertyPrefetch(partner.slug, partner, 'de') as any;
    expect(pf.propertyOverrides.data[partner.slug].tagline).toBe(OVERRIDES.de[partner.slug].tagline);
  });

  it('the crawlable fallback body is in the page language', () => {
    const raw = home(SAO_JULIAO);
    const key = propertyOverrideKey(raw)!;
    const body = __testing.buildPropertySeoBody(__testing.localizePropertyForLang(raw, 'fr'), 'fr');
    const frTagline = String(OVERRIDES.fr[key].tagline);
    expect(body).toContain(frTagline.slice(0, 40).replace(/&/g, '&amp;').replace(/</g, '&lt;'));
    expect(body).not.toContain(String(raw.tagline).slice(0, 40));
  });
});

describe('home page FAQPage JSON-LD == the visible "Good to know"', () => {
  async function i18nFor(lang: string) {
    const instance = createInstance();
    await instance.init({
      lng: lang,
      fallbackLng: 'en',
      interpolation: { escapeValue: false },
      resources: {
        [lang]: { translation: readJson(`client/src/i18n/locales/${lang}.json`) },
        ...(lang !== 'en' ? { en: { translation: readJson('client/src/i18n/locales/en.json') } } : {}),
      },
    });
    return instance;
  }

  it.each(LANGS)('%s: the server FAQPage is the client FAQ, for own and partner homes', async (lang) => {
    const i18n = await i18nFor(lang);
    for (const raw of [home(SAO_JULIAO), PARTNER[0], OWN.find((p) => p.petsAllowed) ?? OWN[1]]) {
      const prop = __testing.localizePropertyForLang(raw, lang);
      const graph = __testing.buildPropertyGraph(prop, lang) as any;
      const serverFaq = graph['@graph'].find((n: any) => n['@type'] === 'FAQPage');
      const clientFaq = buildPdpFaq(
        { name: propertyPageName(prop), checkInTime: prop.checkInTime, checkOutTime: prop.checkOutTime, petsAllowed: prop.petsAllowed },
        lang,
        (key, fallback, vars) => i18n.t(key, fallback, vars as any) as string,
      );
      expect(serverFaq).toEqual(faqPageNode(clientFaq));
    }
  });

  it('makes no "best rate" claim and no July/August minimum-stay rule, in any language', () => {
    const banned = /best rate|melhor preço|meilleur (tarif|prix)|mejor (precio|tarifa)|miglior prezzo|Bestpreis|beste prijs|bästa pris|paras hinta|(?<!\p{L})(July|August|julho|agosto|juillet|août|julio|luglio|Juli|augustus|juli|heinäkuu)(?!\p{L})/iu;
    for (const lang of LANGS) {
      for (const raw of [home(SAO_JULIAO), ...PARTNER.slice(0, 3)]) {
        const graph = __testing.buildPropertyGraph(__testing.localizePropertyForLang(raw, lang), lang) as any;
        const faq = graph['@graph'].find((n: any) => n['@type'] === 'FAQPage');
        expect(JSON.stringify(faq)).not.toMatch(banned);
      }
    }
  });

  it('is written in the page language (German questions on /de/)', () => {
    const graph = __testing.buildPropertyGraph(home(SAO_JULIAO), 'de') as any;
    const faq = graph['@graph'].find((n: any) => n['@type'] === 'FAQPage');
    expect(faq.mainEntity.map((q: any) => q.name)).toContain('Wie lang ist der Mindestaufenthalt?');
    expect(JSON.stringify(faq)).not.toMatch(/What is the minimum stay/);
  });
});
