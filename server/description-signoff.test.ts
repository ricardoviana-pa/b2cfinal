import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { hasBrandSignoff, stripBrandSignoff } from '../shared/descriptionSignoff';
import { filterPublicProperties } from './services/properties-store';

/* 14 Nov 2026 (auditoria): the old listings ended with "Book your stay.
   Portugal Active, your private hotel." and the translations carried it into
   eight languages, where the page showed it. The product is a villa or a home
   (Ricardo, 22 Oct 2026), so no description may end with that sign-off. */

const LANGS = ['pt', 'es', 'fr', 'de', 'it', 'nl', 'sv', 'fi'] as const;

const SIGNOFFS: Array<[string, string]> = [
  ['en', 'Book your stay. Portugal Active, your private hotel.'],
  ['en caps', 'Book Your Stay.\nPortugal Active, Your Private Hotel'],
  ['pt', 'Reserve a Sua Estadia.\nPortugal Active, o Seu Hotel Privado.'],
  ['pt já', 'Reserve já a sua estadia. Portugal Active – o seu hotel privado.'],
  ['es', 'Reserve su estancia hoy mismo.\r\nPortugal Active, su hotel privado.'],
  ['fr', "Réservez votre séjour dès aujourd'hui. Portugal Active, votre hôtel privé."],
  ['de', 'Buchen Sie noch heute Ihren Aufenthalt. Portugal Active, Ihr privates Hotel.'],
  ['it', 'Prenotate il vostro soggiorno oggi stesso. Portugal Active, il vostro hotel privato.'],
  ['nl', 'Boek vandaag nog uw verblijf. Portugal Active, uw privéhotel.'],
  ['sv', 'Boka din vistelse idag. Portugal Active, ditt privata hotell.'],
  ['fi', 'Varaa oleskelusi tänään. Portugal Active, yksityinen hotellisi.'],
];

describe('description sign-off', () => {
  it.each(SIGNOFFS)('%s: the closing call and slogan leave, the text stays', (_lang, signoff) => {
    const body = 'A stone house above the river.\n\nRide to Viana do Castelo on an e-bike.';
    expect(stripBrandSignoff(`${body}\n\n${signoff}`)).toBe(body);
  });

  it('removes a slogan that sits between two paragraphs and keeps both', () => {
    const text = 'Sea views from the terrace.\n\nPortugal Active – your private hotel.\n\nSet in the village of Moledo.';
    expect(stripBrandSignoff(text)).toBe('Sea views from the terrace.\n\nSet in the village of Moledo.');
  });

  it('leaves a description without the slogan exactly as written', () => {
    const text = 'Book your stay at the house.  \n\n\nPortugal Active looks after the home, with the service of a hotel.';
    expect(stripBrandSignoff(text)).toBe(text);
    expect(hasBrandSignoff(text)).toBe(false);
  });

  it.each(LANGS)('%s: no translated home text carries the slogan', (lang) => {
    const data = JSON.parse(fs.readFileSync(`client/src/data/properties.i18n/${lang}.json`, 'utf8'));
    const hits: string[] = [];
    const walk = (o: unknown, path: string) => {
      if (typeof o === 'string') { if (hasBrandSignoff(o)) hits.push(path); }
      else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    walk(data, lang);
    expect(hits).toEqual([]);
  });

  it('the store publishes every English description without it', () => {
    const raw = JSON.parse(fs.readFileSync('client/src/data/properties.json', 'utf8'));
    const published = filterPublicProperties(raw);
    expect(published.length).toBeGreaterThan(20);
    expect(published.filter((p: any) => hasBrandSignoff(p.description)).map((p: any) => p.slug)).toEqual([]);
    for (const p of published) expect(String(p.description ?? '')).not.toMatch(/private hotel/i);
  });
});
