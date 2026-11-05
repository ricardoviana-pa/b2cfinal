import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROPERTY_EDITORIAL_META, propertyEditorialMeta } from '../shared/propertyEditorialMeta';
import { propertyPageMeta, propertyPageName, PROPERTY_TITLE_BUDGET } from '../shared/propertyMeta';
import { mergePropertyOverrides } from '../shared/propertyLocalization';
import { catalogProperties, filterPublicProperties } from './services/properties-store';

const homes = JSON.parse(fs.readFileSync('client/src/data/properties.json', 'utf8')) as any[];
const pt = JSON.parse(fs.readFileSync('client/src/data/properties.i18n/pt.json', 'utf8'));
const selected = Object.keys(PROPERTY_EDITORIAL_META).map(id => homes.find(home => home.guestyId === id));

describe('persistent EN/PT home search snippets', () => {
  it('the ten reviewed homes exist and remain in the active direct catalogue', () => {
    expect(selected).toHaveLength(10);
    const publicIds = new Set(catalogProperties(filterPublicProperties(homes)).map(home => home.guestyId));
    for (const home of selected) {
      expect(home).toBeDefined();
      expect(home.isActive).toBe(true);
      expect(home.guestyId).toBeTruthy();
      expect(home.source).not.toBe('tripwix');
      expect(home.supplierUid).toBeFalsy();
      expect(publicIds.has(home.guestyId)).toBe(true);
    }
  });

  it('uses a precise place and current facts in both editions, preserving image, URL and localized parity', () => {
    const titles: Record<string, Set<string>> = { en: new Set(), pt: new Set() };
    for (const home of selected) {
      for (const lang of ['en', 'pt']) {
        const meta = propertyPageMeta(home, lang);
        expect(meta.title).toContain(home.locality);
        expect(meta.description).toContain(home.locality);
        expect(meta.description).toContain(`${home.bedrooms} ${lang === 'pt' ? 'quartos' : 'bedrooms'}`);
        expect(meta.description).toContain(`${home.maxGuests} ${lang === 'pt' ? 'hóspedes' : 'guests'}`);
        expect(meta.title.length).toBeLessThanOrEqual(PROPERTY_TITLE_BUDGET);
        expect(meta.description.length).toBeLessThanOrEqual(155);
        expect(meta.description).not.toMatch(/…|heated|aquecid|24\/7|concierge|€|guaranteed|garantid/i);
        expect(meta.path).toBe(`/homes/${home.slug}`);
        expect(meta.image).toBe(home.images[0]);
        titles[lang].add(meta.title);
        if (lang === 'pt') expect(propertyPageMeta(mergePropertyOverrides(home, pt), lang)).toEqual(meta);
      }
    }
    // Proper names and locality can legitimately yield the same EN/PT title;
    // distinct homes must still have distinct titles within each edition.
    expect(titles.en.size).toBe(10);
    expect(titles.pt.size).toBe(10);
  });

  it('keeps group names and describes their capacity without calling the whole estate a single villa', () => {
    const group = selected.find(home => home.guestyId === '6965339dbf04fe0013743e2d');
    expect(propertyPageMeta(group, 'en')).toMatchObject({
      title: 'Fountain Retreat | 12-Bed, Viana do Castelo | Portugal Active',
      description: 'Fountain Retreat in Viana do Castelo: 12 bedrooms for up to 28 guests, with an outdoor pool and a garden.',
    });
    const oliveira = selected.find(home => home.guestyId === '696533494b9b64001401b62e');
    expect(propertyPageMeta(oliveira, 'pt').description).toBe("Oliveira's Farm em Viana do Castelo: 5 quartos para até 10 hóspedes, com piscina privada e jardim.");
  });

  it('a catalogue sync changes factual copy and removes features it no longer supports, without restoring imported snippets', () => {
    const original = selected[0];
    const synced = { ...original, slug: 'renamed-after-sync', name: original.name,
      bedrooms: 3, maxGuests: 6, locality: 'Ponte de Lima', amenities: { property: [] },
      seoTitle: 'Imported title', seoDescription: 'Imported description', tagline: 'Heated pool included for free' };
    const meta = propertyPageMeta(synced, 'en');
    expect(meta.title).toContain('3-Bed, Ponte de Lima');
    expect(meta.description).toBe("Oliveira's Farm in Ponte de Lima: 3 bedrooms for up to 6 guests.");
    expect(meta.path).toBe('/homes/renamed-after-sync');
    expect(JSON.stringify(meta)).not.toMatch(/Imported|Heated|pool|garden|10 guests|Viana do Castelo/);
  });

  it('leaves other languages, unknown listings, inactive listings and partner records outside this pilot', () => {
    const home = selected[0];
    const name = propertyPageName(home);
    expect(propertyEditorialMeta(home, name, 'pt-PT')).toEqual(propertyEditorialMeta(home, name, 'pt'));
    for (const lang of ['fr', 'de', 'es', 'it', 'fi', 'sv', 'nl', 'unknown']) {
      expect(propertyEditorialMeta(home, name, lang)).toBeNull();
    }
    for (const changes of [{ guestyId: 'unreviewed' }, { source: 'tripwix' }, { supplierUid: 'supplier' }, { isActive: false }, { locality: '' }]) {
      expect(propertyEditorialMeta({ ...home, ...changes }, name, 'en')).toBeNull();
    }
  });
});
