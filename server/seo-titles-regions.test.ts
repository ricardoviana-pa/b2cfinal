/* ==========================================================================
   Home-page titles (type noun, singular for one bedroom, ~65 characters) and
   region phrases ("no Algarve", not "em Algarve") — auditoria out/2026,
   seo-health-pdp-title-template and i18n-copy-08 / ux-home-plp-14.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import {
  PROPERTY_TITLE_BUDGET, propertyDescription, propertyKind, propertyKindInline, propertyPageMeta, propertyTitle,
} from '@shared/propertyMeta';
import { placePhrases, placeVars } from '@shared/regionPhrases';
import { __testing } from './_core/vite';

const ROOT = path.resolve(import.meta.dirname, '..');
const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'];
const readJson = (rel: string) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const HOMES: any[] = [...readJson('client/src/data/properties.json'), ...readJson('client/src/data/tripwix-properties.json')];
const DESTINATIONS: any[] = readJson('client/src/data/destinations.json');
const home = (slug: string) => HOMES.find((h) => h.slug === slug)!;

describe('property type → the noun in the title', () => {
  it('maps the Guesty and partner types', () => {
    expect(propertyKind('Villa')).toBe('villa');
    expect(propertyKind('House')).toBe('house');
    expect(propertyKind('Townhouse')).toBe('house');
    expect(propertyKind('Apartment')).toBe('apartment');
    expect(propertyKind('Studio')).toBe('studio');
    expect(propertyKind('Boat')).toBe('boat');
    expect(propertyKind(undefined)).toBe('home');
  });

  it('apartments, the boat and studios are never called a villa', () => {
    const notVilla = HOMES.filter((h) => ['Apartment', 'Boat', 'Studio'].includes(h.propertyType));
    expect(notVilla.length).toBeGreaterThan(10);
    for (const h of notVilla) {
      for (const lang of LANGS) {
        const { title, description } = propertyPageMeta(h, lang);
        const segment = title.slice(String(propertyPageMeta(h, 'en').title.split(' | ')[0]).length);
        expect(segment, `${lang} ${h.slug}`).not.toMatch(/villa|huvila/i);
        expect(description.slice(description.indexOf('. ') + 2), `${lang} ${h.slug}`).not.toMatch(/villa|huvila/i);
      }
    }
  });

  it('the boat reads as a boat in every language', () => {
    const boat = home('ros-dream-boat-by-portugal-active-bb2b42');
    expect(propertyPageMeta(boat, 'en').title).toBe('Rose Dream Boat | Luxury Boat in the Minho | Portugal Active');
    expect(propertyPageMeta(boat, 'pt').title).toBe('Rose Dream Boat | Barco de luxo no Minho | Portugal Active');
    expect(propertyPageMeta(boat, 'de').title).toBe('Rose Dream Boat | Luxusboot im Minho | Portugal Active');
  });
});

describe('one bedroom is singular in every language', () => {
  const one = { name: 'Filigree Plaza', bedrooms: 1, maxGuests: 2, destination: 'minho', propertyType: 'Apartment' };
  it('descriptions', () => {
    expect(propertyDescription('fr', one)).toContain('1 chambre ');
    expect(propertyDescription('es', one)).toContain('con 1 dormitorio ');
    expect(propertyDescription('it', one)).toContain('con 1 camera da letto ');
    expect(propertyDescription('nl', one)).toContain('met 1 slaapkamer ');
    expect(propertyDescription('de', one)).toContain('mit 1 Schlafzimmer ');
    expect(propertyDescription('pt', one)).toContain('Apartamento de luxo T1 no Minho');
    expect(propertyDescription('en', { ...one, tagline: null })).toContain('1-bedroom luxury apartment in the Minho');
    for (const lang of LANGS) {
      expect(propertyDescription(lang, one)).not.toMatch(/\b1 (chambres|dormitorios|camere|slaapkamers|Schlafzimmern)\b/);
    }
  });

  it('titles, when the count fits', () => {
    const short = { ...one, name: 'Plaza' };
    expect(propertyTitle('fr', short)).toBe('Plaza | Appartement 1 chambre dans le Minho | Portugal Active');
    expect(propertyTitle('es', short)).toMatch(/con 1 dormitorio\b/);
    expect(propertyTitle('nl', short)).toMatch(/met 1 slaapkamer\b/);
    expect(propertyTitle('it', short)).not.toMatch(/1 camere/);
    expect(propertyTitle('de', short)).toMatch(/1-Schlafzimmer-/);
  });

  it('plural above one', () => {
    const four = { ...one, bedrooms: 4, propertyType: 'Villa' };
    expect(propertyDescription('fr', four)).toContain('Villa de luxe 4 chambres dans le Minho');
    expect(propertyDescription('de', four)).toContain('Luxusvilla mit 4 Schlafzimmern im Minho');
  });
});

describe('title length', () => {
  it(`every home in every language fits ${PROPERTY_TITLE_BUDGET} characters`, () => {
    for (const h of HOMES) {
      for (const lang of LANGS) {
        const { title } = propertyPageMeta(h, lang);
        expect(title.length, `${lang} ${title}`).toBeLessThanOrEqual(PROPERTY_TITLE_BUDGET);
        expect(title.endsWith(' | Portugal Active')).toBe(true);
      }
    }
  });

  it('keeps the full form when it fits, sheds "luxury" first', () => {
    expect(propertyTitle('en', { name: 'U2 Loft', bedrooms: 2, destination: 'minho', propertyType: 'Villa' }))
      .toBe('U2 Loft | 2-Bedroom Luxury Villa in the Minho | Portugal Active');
    expect(propertyTitle('en', { name: 'Mirante 1', bedrooms: 6, destination: 'algarve', propertyType: 'Villa' }))
      .toBe('Mirante 1 | 6-Bedroom Villa in the Algarve | Portugal Active');
  });

  it('a very long name keeps only the brand', () => {
    const name = 'Estuary View Duplex w/ Garage, 10min Walk to Beach and Town';
    expect(propertyTitle('en', { name, bedrooms: 2, destination: 'minho', propertyType: 'Apartment' })).toBe(`${name} | Portugal Active`);
  });
});

describe('region phrases', () => {
  it.each([
    ['pt', 'algarve', 'no Algarve', 'ao Algarve', 'o Algarve'],
    ['pt', 'lisbon', 'em Lisboa', 'a Lisboa', 'Lisboa'],
    ['pt', 'porto', 'no Porto', 'ao Porto', 'o Porto'],
    ['pt', 'minho', 'no Minho', 'ao Minho', 'o Minho'],
    ['pt', 'viana-do-castelo', 'em Viana do Castelo', 'a Viana do Castelo', 'Viana do Castelo'],
    ['pt', 'silver-coast', 'na Costa de Prata', 'à Costa de Prata', 'a Costa de Prata'],
    ['fr', 'algarve', 'en Algarve', 'en Algarve', "l'Algarve"],
    ['fr', 'minho', 'dans le Minho', 'dans le Minho', 'le Minho'],
    ['fr', 'lisbon', 'à Lisbonne', 'à Lisbonne', 'Lisbonne'],
    ['fr', 'porto', 'à Porto', 'à Porto', 'Porto'],
    ['de', 'algarve', 'an der Algarve', 'an die Algarve', 'die Algarve'],
    ['de', 'minho', 'im Minho', 'in den Minho', 'den Minho'],
    ['de', 'douro', 'im Douro-Tal', 'ins Douro-Tal', 'das Douro-Tal'],
    ['de', 'lisbon', 'in Lissabon', 'nach Lissabon', 'Lissabon'],
    ['es', 'algarve', 'en el Algarve', 'al Algarve', 'el Algarve'],
    ['es', 'minho', 'en el Miño', 'al Miño', 'el Miño'],
    ['it', 'porto', 'a Porto', 'a Porto', 'Porto'],
    ['it', 'minho', 'nel Minho', 'nel Minho', 'il Minho'],
    ['it', 'algarve', 'in Algarve', 'in Algarve', "l'Algarve"],
    ['nl', 'algarve', 'in de Algarve', 'naar de Algarve', 'de Algarve'],
    ['en', 'algarve', 'in the Algarve', 'to the Algarve', 'the Algarve'],
    ['en', 'lisbon', 'in Lisbon', 'to Lisbon', 'Lisbon'],
    ['fi', 'algarve', 'Algarvessa', 'Algarveen', 'Algarve'],
  ])('%s %s → %s / %s / %s', (lang, slug, inn, to, the) => {
    expect(placePhrases(slug, lang)).toMatchObject({ in: inn, to, the });
  });

  it('keeps the name the page shows inside the phrase', () => {
    expect(placePhrases('douro', 'fr', 'Vallée du Douro').in).toBe('dans la Vallée du Douro');
    expect(placePhrases('lisbon', 'de', 'Lisboa').in).toBe('in Lisboa');
  });

  it('resolves the concierge bases by name, and unknown places safely', () => {
    expect(placePhrases('Comporta', 'pt').in).toBe('na Comporta');
    expect(placePhrases('Lisboa', 'en').in).toBe('in Lisbon');
    expect(placePhrases('Atlantis', 'pt').in).toBe('em Atlantis');
    expect(placePhrases('atlantis', 'xx').in).toBe('in Atlantis');
  });

  it('photo alt text: the noun and place mid-sentence', () => {
    expect(propertyKindInline('en', { propertyType: 'Apartment', destination: 'minho' })).toBe('luxury apartment in the Minho');
    expect(propertyKindInline('pt', { propertyType: 'Villa', destination: 'algarve' })).toBe('casa de luxo no Algarve');
    expect(propertyKindInline('de', { propertyType: 'Villa', destination: 'algarve' })).toBe('Luxusvilla an der Algarve');
  });
});

describe('locale strings that place a destination render grammatically', () => {
  const KEYS = [
    'destinationDetail.whyTitle',
    'destinationDetail.homesIn', 'destinationDetail.newHomesComingSoon', 'destinationDetail.newHomesComingSoonSubtitle',
    'destinationDetail.guide.seeAndDoTitleNamed', 'destinationDetail.guide.conciergePicks',
    'destinationDetail.guide.whenToVisitTitleNamed', 'destinationDetail.guide.getHereTitleNamed',
    'destinationGrowth.journalTitle', 'propertyDetail.moreIn', 'propertyDetail.allDestHomes',
    'propertyDetail.adventuresSubtitle', 'host.basedInCity',
  ];
  async function t(lang: string) {
    const i18n = createInstance();
    await i18n.init({
      lng: lang, fallbackLng: 'en', interpolation: { escapeValue: false },
      resources: { [lang]: { translation: readJson(`client/src/i18n/locales/${lang}.json`) }, en: { translation: readJson('client/src/i18n/locales/en.json') } },
    });
    return i18n.t.bind(i18n);
  }

  it.each(LANGS)('%s: no placeholder left, for every destination', async (lang) => {
    const tr = await t(lang);
    for (const d of DESTINATIONS) {
      const vars = { name: d.name, destination: d.name, city: d.name, ...placeVars(d.slug, lang, d.name) };
      for (const key of KEYS) {
        const out = tr(key, vars) as string;
        expect(out, `${lang} ${key} ${d.slug}`).not.toMatch(/\{\{|\}\}/);
        expect(out).not.toBe(key);
      }
    }
  });

  it('reads right where the audit found it wrong', async () => {
    const vars = (slug: string, lang: string, name: string) => ({ name, destination: name, ...placeVars(slug, lang, name) });
    expect((await t('pt'))('destinationDetail.homesIn', vars('algarve', 'pt', 'Algarve'))).toBe('Casas no Algarve');
    expect((await t('pt'))('destinationGrowth.journalTitle', vars('algarve', 'pt', 'Algarve'))).toBe('Prepare a sua estadia no Algarve');
    expect((await t('pt'))('destinationDetail.guide.seeAndDoTitleNamed', vars('minho', 'pt', 'Minho'))).toBe('O que ver e fazer no Minho');
    expect((await t('pt'))('destinationDetail.guide.getHereTitleNamed', vars('porto', 'pt', 'Porto'))).toBe('Como chegar ao Porto');
    expect((await t('pt'))('propertyDetail.moreIn', vars('minho', 'pt', 'Minho'))).toBe('Mais no Minho');
    expect((await t('fr'))('destinationDetail.homesIn', vars('minho', 'fr', 'Minho'))).toBe('Maisons dans le Minho');
    expect((await t('fr'))('destinationDetail.homesIn', vars('algarve', 'fr', 'Algarve'))).toBe('Maisons en Algarve');
    expect((await t('fr'))('destinationDetail.guide.getHereTitleNamed', vars('minho', 'fr', 'Minho'))).toBe('Comment se rendre dans le Minho');
    expect((await t('de'))('destinationDetail.homesIn', vars('algarve', 'de', 'Algarve'))).toBe('Häuser an der Algarve');
    expect((await t('de'))('destinationDetail.guide.whenToVisitTitleNamed', vars('algarve', 'de', 'Algarve'))).toBe('Die beste Reisezeit für die Algarve');
    expect((await t('de'))('propertyDetail.moreIn', vars('minho', 'de', 'Minho'))).toBe('Mehr im Minho');
    expect((await t('es'))('destinationDetail.homesIn', vars('algarve', 'es', 'Algarve'))).toBe('Casas en el Algarve');
    expect((await t('it'))('destinationDetail.homesIn', vars('porto', 'it', 'Porto'))).toBe('Case a Porto');
    expect((await t('en'))('destinationDetail.guide.whenToVisitTitleNamed', vars('algarve', 'en', 'Algarve'))).toBe('When to visit the Algarve');
    expect((await t('pt'))('destinationDetail.whyTitle', vars('algarve', 'pt', 'Algarve'))).toBe('Porquê o Algarve');
    expect((await t('fr'))('destinationDetail.whyTitle', vars('minho', 'fr', 'Minho'))).toBe('Pourquoi le Minho');
    expect((await t('de'))('destinationDetail.whyTitle', vars('algarve', 'de', 'Algarve'))).toBe('Warum Algarve');
  });
});

describe('experience meta uses the region phrases too', () => {
  it('descriptions without a tagline', () => {
    const d = __testing.EXPERIENCE_DESCRIPTION;
    expect(d.pt({ name: 'Canyoning', destination: 'minho' })).toContain('Canyoning no Minho.');
    expect(d.fr({ name: 'Canyoning', destination: 'minho' })).toContain('Canyoning dans le Minho.');
    expect(d.de({ name: 'Canyoning', destination: 'algarve' })).toContain('Canyoning an der Algarve.');
  });
});
