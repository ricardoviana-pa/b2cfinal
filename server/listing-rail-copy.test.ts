import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createInstance, type TFunction } from 'i18next';

// Auditoria 29 out, ux-home-plp-09 / -05 / -04 / -07: the strings added for
// the listing rail, the destination picker, the destination strip, the
// reassurance line and the review label exist in all nine languages and get
// their plurals right ("1 homes" was on the listing).

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
const dir = new URL('../client/src/i18n/locales/', import.meta.url);
const bundles = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(fs.readFileSync(new URL(`${l}.json`, dir), 'utf8'))]));
const NAMESPACES = ['destinationSearch', 'listingRail', 'listingWhatsApp', 'listingReassurance', 'destinationStrip', 'reviewLanguage'];

async function tFor(lng: string): Promise<TFunction> {
  const i18n = createInstance();
  await i18n.init({ lng, fallbackLng: false as any, resources: { [lng]: { translation: bundles[lng] } }, interpolation: { escapeValue: false } });
  return i18n.t;
}

const flat = (o: any, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${p}${k}.`) : [`${p}${k}`]));

describe('new listing strings', () => {
  it('every key exists, non-empty, in every language (EN plural forms included)', () => {
    const enKeys = NAMESPACES.flatMap((ns) => flat(bundles.en[ns], `${ns}.`));
    for (const l of LANGS) {
      for (const key of enKeys) {
        const value = key.split('.').reduce((a: any, k) => a?.[k], bundles[l]);
        expect(typeof value === 'string' && value.trim().length > 0, `${l}: ${key}`).toBe(true);
      }
    }
  });

  it('keeps the placeholders of the English text', () => {
    const enKeys = NAMESPACES.flatMap((ns) => flat(bundles.en[ns], `${ns}.`));
    const vars = (s: string) => (s.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');
    for (const l of LANGS) {
      for (const key of enKeys) {
        const get = (b: any) => key.split('.').reduce((a: any, k) => a?.[k], b);
        expect(vars(get(bundles[l])), `${l}: ${key}`).toBe(vars(get(bundles.en)));
      }
    }
  });

  it('counts read right in the singular, the plural and (pt) zero', async () => {
    const en = await tFor('en');
    expect(en('listingRail.homes', { count: 1 })).toBe('1 home');
    expect(en('listingRail.homes', { count: 85 })).toBe('85 homes');
    expect(en('listingRail.showHomes', { count: 1 })).toBe('Show 1 home');
    const pt = await tFor('pt');
    expect(pt('listingRail.homes', { count: 0 })).toBe('0 casas');
    expect(pt('listingRail.homes', { count: 1 })).toBe('1 casa');
    expect(pt('listingRail.available', { count: 1 })).toBe('1 disponível');
    expect(pt('listingRail.available', { count: 63 })).toBe('63 disponíveis');
    expect(pt('listingRail.unavailable', { count: 12 })).toBe('12 indisponíveis');
    const de = await tFor('de');
    expect(de('listingRail.homes', { count: 1 })).toBe('1 Haus');
    expect(de('destinationStrip.kicker', { name: 'Algarve', count: 11 })).toBe('Algarve · 11 Häuser');
  });

  it('says "including" for the homes still to confirm: they are part of the available ones', async () => {
    const en = await tFor('en');
    expect(en('listingRail.toConfirm', { count: 27 })).toBe('including 27 to confirm');
    expect((await tFor('fr'))('listingRail.toConfirm', { count: 27 })).toBe('dont 27 à confirmer');
  });

  it('the rail keeps Filters and the Map switch whole and moves the detail off the row', () => {
    const rail = fs.readFileSync(new URL('../client/src/components/homes/HomesFilterRail.tsx', import.meta.url), 'utf8');
    const homes = fs.readFileSync(new URL('../client/src/pages/Homes.tsx', import.meta.url), 'utf8');
    // phone/tablet row: Filters never shrinks, the count truncates, the view switch never shrinks
    expect(rail).toMatch(/className="inline-flex shrink-0 items-center gap-2 h-full font-body text-\[13px\] text-pa-dark"/);
    expect(rail).toMatch(/status\('flex min-w-0 flex-1 justify-end'\)/);
    expect(rail).toMatch(/<span aria-hidden className="truncate">\{resultLabel\}<\/span>/);
    expect(rail).toMatch(/role="group" aria-label=\{t\('homes\.filters\.view', 'View'\)\} className="inline-flex shrink-0/);
    expect(rail).toMatch(/detail\('plp-status-detail', /);
    // the one-line desktop rule only where it fits
    expect(rail).toMatch(/className="hidden xl:block border-y border-pa-sand"/);
    expect(rail).toMatch(/<div className="xl:hidden">/);
    // the listing feeds it the short head, the detail and the full sentence
    expect(homes).toMatch(/t\('listingRail\.available', \{ count: availableProperties\.length \}\)/);
    expect(homes).toMatch(/t\('listingRail\.homes', \{ count: filtered\.length \}\)/);
    expect(homes).not.toMatch(/searchUx\.results/);
  });

  it('the cancellation line speaks of refundable rates paid online, in every language (revisão R3)', () => {
    // Partner homes take no payment on the site and follow the supplier's
    // terms: the promise is scoped to the rates a guest pays here.
    const online: Record<(typeof LANGS)[number], RegExp> = {
      en: /refundable rates paid online/, pt: /tarifas reembolsáveis pagas online/, fr: /tarifs remboursables payés en ligne/,
      es: /tarifas reembolsables pagadas en línea/, it: /tariffe rimborsabili pagate online/, de: /online bezahlten erstattbaren Tarifen/,
      nl: /online betaalde restitueerbare tarieven/, sv: /återbetalningsbara prisalternativ som betalas online/, fi: /verkossa maksetuissa palautettavissa/,
    };
    for (const l of LANGS) expect(bundles[l].listingReassurance.cancellation, l).toMatch(online[l]);
  });

  it('never calls Flex insurance, a home a hotel, or promises a reply time', () => {
    for (const l of LANGS) {
      const text = NAMESPACES.map((ns) => JSON.stringify(bundles[l][ns])).join(' ');
      expect(text, l).not.toMatch(/insurance|seguro|assurance|Versicherung|assicurazione|verzekering|försäkring|vakuutus|hotel/i);
      expect(text, l).not.toMatch(/\b(2|two|duas|deux|dos|due|zwei|twee|två|kaksi)\s*(h|hours|horas|heures|ore|Stunden|uur|timmar|tuntia)\b/i);
    }
  });
});
