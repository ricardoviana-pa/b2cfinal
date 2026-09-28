import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePublicPropertyGeography } from './services/property-geography';
import { catalogProperties, filterPublicProperties, getPropertiesForDestination, getSiteLocalities, CATALOG_HIDDEN_GUESTY_IDS } from './services/properties-store';
import { adventureMatchesDestination } from '../client/src/lib/destinationAdventures';
import { filterProperties } from '../client/src/lib/utils';
import type { Property } from '../client/src/lib/types';

const home = {
  slug: 'synthetic-pataias-home', name: 'Synthetic coast home', destination: 'lisbon',
  locality: 'Pataias', isActive: true, priceFrom: 200, maxGuests: 6,
};

describe('Pataias geography without removing a home from the catalogue', () => {
  it('corrects old public data without changing the source record or commercial fields', () => {
    const [corrected] = filterPublicProperties([home]);
    expect(corrected).toEqual({ ...home, destination: 'silver-coast', region: 'Silver Coast' });
    expect(home.destination).toBe('lisbon');
    expect(catalogProperties([corrected])).toHaveLength(1);
  });

  it('keeps global and Pataias searches while excluding the Lisbon selection', () => {
    const homes = filterPublicProperties([home]) as Property[];
    expect(filterProperties(homes, 'all', 'all')).toHaveLength(1);
    expect(filterProperties(homes, 'all', 'lisbon')).toHaveLength(0);
    expect(filterProperties(homes, 'all', 'all', undefined, undefined, undefined, undefined, 'pataias')).toHaveLength(1);
  });

  it('uses the public address city when locality is absent and leaves other locations alone', () => {
    expect(normalizePublicPropertyGeography({ destination: 'lisbon', address: { city: ' Pataias e Martingança ' } }).destination).toBe('silver-coast');
    const sintra = { ...home, locality: 'Sintra' };
    expect(normalizePublicPropertyGeography(sintra)).toBe(sintra);
  });

  it('corrects the actual repository destination response and search picker without provider calls', async () => {
    const homes = await getPropertiesForDestination('lisbon');
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.some(p => /pataias/i.test(p.locality))).toBe(false);
    const locality = (await getSiteLocalities()).find(p => p.value === 'pataias');
    expect(locality).toEqual({ label: 'Pataias', value: 'pataias' });
  });

  it('preserves all catalogue exclusions through the geographic correction', () => {
    const hidden = [...CATALOG_HIDDEN_GUESTY_IDS].map(guestyId => ({ ...home, guestyId }));
    expect(hidden.length).toBe(18);
    expect(catalogProperties(filterPublicProperties(hidden))).toEqual([]);
  });
});

describe('destination activities use geographic context', () => {
  const paddle = { slug: 'stand-up-paddle', type: 'adventure', isActive: true, destinations: ['minho', 'porto', 'algarve'] };
  const surf = { slug: 'surf-lessons', type: 'adventure', isActive: true, destinations: ['minho', 'porto', 'algarve'] };

  it('does not promote a Lima product as local to Porto or Algarve', () => {
    expect(adventureMatchesDestination(paddle, { slug: 'viana-do-castelo', region: 'minho' })).toBe(true);
    expect(adventureMatchesDestination(paddle, { slug: 'porto', region: 'porto' })).toBe(false);
    expect(adventureMatchesDestination(paddle, { slug: 'algarve', region: 'algarve' })).toBe(false);
  });

  it('requires explicit Douro coverage instead of inheriting Porto coastal activities', () => {
    expect(adventureMatchesDestination(surf, { slug: 'douro', region: 'porto' })).toBe(false);
    expect(adventureMatchesDestination(surf, { slug: 'porto', region: 'porto' })).toBe(true);
    expect(adventureMatchesDestination({ ...surf, slug: 'synthetic-douro-walk', destinations: ['douro'] }, { slug: 'douro', region: 'porto' })).toBe(true);
  });
});

describe('active destination descriptions in every published language', () => {
  it('does not retain coming-soon metadata for existing Lisbon or Alentejo inventory', () => {
    const base = join(process.cwd(), 'client/src/data');
    const english = JSON.parse(readFileSync(join(base, 'destinations.json'), 'utf8'));
    const translations = readdirSync(join(base, 'destinations.i18n')).filter(f => f.endsWith('.json'));
    const languages = [Object.fromEntries(english.map((d: any) => [d.slug, d])),
      ...translations.map(file => JSON.parse(readFileSync(join(base, 'destinations.i18n', file), 'utf8')))];
    expect(languages).toHaveLength(9);
    for (const language of languages) {
      expect(language.porto.name).toBe('Porto');
      expect(language.porto.seoTitle).toMatch(/^(Porto|Oporto)/);
      expect(language.porto.seoDescription).toMatch(/Porto|Oporto/);
      for (const slug of ['lisbon', 'alentejo']) {
        expect(language[slug].seoDescription).not.toMatch(/coming soon|em breve|próximamente|bientôt|demnächst|in Kürze|prossimamente|binnenkort|tulossa|kommer snart/i);
      }
    }
  });
});
