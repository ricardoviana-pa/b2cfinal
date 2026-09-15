import { describe, expect, it } from 'vitest';
import { vacationRentalSchema } from '../shared/vacationRentalSchema';
import { buildDestinationGraph } from '../shared/destinationSchema';
import { destinationHomesHref } from '../shared/destinationNavigation';
import { __testing } from './_core/vite';
import { getPropertiesForDestination } from './services/properties-store';
import destinations from '../client/src/data/destinations.json';
import journalLinks from '../client/src/data/destination-journal.json';
import articles from '../client/src/data/blog.json';

const rental = {
  id: 25, guestyId: 'listing-25', slug: 'villa', name: 'Villa', maxGuests: 8,
  bedrooms: 4, bathrooms: 3, propertyType: 'Villa', priceFrom: 123,
  licenseNumber: '123/AL', images: Array.from({length:12}, (_,i)=>`https://example.com/${i}.jpg`),
  address: { lat: 41.693239, lng: -8.832321 },
};

describe('Google rental fields survive SSR and client navigation', () => {
  it('uses the same required facts on the server and in the browser builder', () => {
    const server = (__testing.buildPropertyGraph(rental, 'pt')['@graph'] as any[])[0];
    const client = vacationRentalSchema({ ...rental, latitude: rental.address.lat, longitude: rental.address.lng }, 'pt');
    for (const key of ['identifier','containsPlace','geo','image','additionalType','url']) expect(server[key]).toEqual(client[key]);
    expect(server.identifier).toBe('guesty:listing-25');
    expect(server.additionalType).toBe('Villa');
    expect(server.containsPlace).toMatchObject({ '@type':'Accommodation', occupancy: { value:8 } });
    expect(server.containsPlace).not.toHaveProperty('additionalType');
    expect(server.image).toHaveLength(12);
    expect(server.additionalProperty.value).toBe('123/AL');
  });
  it('keeps an identifier across languages and slug changes, including partner homes', () => {
    const a = vacationRentalSchema({...rental, guestyId:null, supplierUid:'PT-A-SUD'},'en');
    const b = vacationRentalSchema({...rental, slug:'renamed', guestyId:null, supplierUid:'PT-A-SUD'},'pt');
    expect(a.identifier).toBe(b.identifier);
    expect(a.identifier).toBe('tripwix:PT-A-SUD');
  });
  it('never asserts an imported rate is bookable for a year', () => {
    const schema = vacationRentalSchema(rental);
    expect(schema).not.toHaveProperty('offers');
    expect(schema).not.toHaveProperty('priceRange');
  });
  it('does not manufacture missing occupancy, photos or coordinates', () => {
    const schema = vacationRentalSchema({...rental, maxGuests:NaN, images:['one','one'], latitude:999, longitude:0});
    expect(schema.containsPlace).not.toHaveProperty('occupancy');
    expect(schema.image).toHaveLength(1);
    expect(schema).not.toHaveProperty('geo');
  });
});

describe('destinations connect useful content to the right homes', () => {
  it('does not emit incomplete rentals or invented publication dates on region pages', () => {
    const d = destinations.find(d=>d.slug==='minho')!;
    const graph = buildDestinationGraph(d as any,[rental as any],undefined,'pt');
    const json = JSON.stringify(graph);
    expect(json).not.toContain('VacationRental');
    expect(json).not.toContain('dateModified');
    expect(json).toContain('/pt/homes/villa');
    expect(json).toContain('/pt/destinations/minho');
  });
  it('links every curated article to a published entry and only promotes active destinations', () => {
    for (const [destination, slugs] of Object.entries(journalLinks)) {
      expect(destinations.find(d=>d.slug===destination)?.status).toBe('active');
      for (const slug of slugs) expect(articles.articles.find(a=>a.slug===slug)?.status).toBe('published');
    }
  });
  it('uses Viana locality consistently in destination inventory and search navigation', async () => {
    expect(destinationHomesHref({slug:'viana-do-castelo',region:'minho'})).toBe('/homes?location=viana-do-castelo');
    const homes = await getPropertiesForDestination('viana-do-castelo');
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.every(p=>p.locality==='Viana do Castelo')).toBe(true);
  });
  it('keeps the supplier UID needed to show live partner prices on destination cards', async () => {
    const homes = await getPropertiesForDestination('alentejo');
    const partner = homes.find(p=>p.source==='tripwix');
    expect(partner?.supplierUid).toBeTruthy();
  });
});


describe('corporate demand page', () => {
  it('has dedicated commercial metadata in all nine locales', () => {
    for (const lang of ['en','pt','es','fr','de','it','nl','sv','fi']) {
      const meta = __testing.getPageMeta('/corporate-retreats', lang);
      expect(meta?.title).toContain('Portugal Active');
      expect(meta?.description.length).toBeGreaterThan(60);
    }
  });
});
