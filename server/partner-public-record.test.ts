/**
 * Ricardo, 14 nov 2026 (auditoria): the supplier of the partner homes, their
 * reference for each home and the commission agreed with them were readable
 * by anyone — in the public API answer for a partner home and in the HTML of
 * its page ("source":"tripwix", "supplierReference":"PT0009",
 * "supplierCommission":"10%"). The exact street and coordinates of every home
 * were there too, beside a line that says "approximate area".
 *
 * Everything public is built from the property store, so the rule is tested
 * there: what getPropertiesForSite() returns is safe to publish as it is.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getPropertiesForSite, partnerSupplierReference, publicPartnerId, toPublicPartner, withPublicAddress } from './services/properties-store';
import { PARTNER_SOURCE, isPartnerHome } from '../shared/partnerHome';
import { vacationRentalSchema } from '../shared/vacationRentalSchema';
import { propertiesRouter } from './routers/properties';
import raw from '../client/src/data/tripwix-properties.json';

const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

describe('what the property store publishes', () => {
  it('names no supplier and carries no supplier reference or commission', async () => {
    const all = await getPropertiesForSite();
    const partners = all.filter(isPartnerHome);
    expect(partners.length).toBeGreaterThan(0);
    for (const p of partners) {
      expect(p.source).toBe(PARTNER_SOURCE);
      // The catalogue id is built from the slug, never from the import's own id.
      expect(p.id).toBe(`partner-${p.slug}`);
      expect(p).not.toHaveProperty('supplierReference');
      expect(p).not.toHaveProperty('supplierCommission');
      // The uid stays: the page needs it to ask for this home's calendar and price.
      expect(typeof p.supplierUid).toBe('string');
    }
    expect(JSON.stringify(all)).not.toMatch(/tripwix/i);
    expect(JSON.stringify(all)).not.toMatch(/supplierCommission|supplierReference/);
  });

  // Segunda ronda da auditoria de 14 nov 2026: the field was gone but the
  // value was not. The supplier's reference for a home was still in its id
  // ("partner-PT0009") and in the folder of every photo
  // ("/homes/photos/PT0009/00.webp").
  it('carries the supplier reference of no home anywhere: not in an id, not in a photo address', async () => {
    const references = (raw as any[]).map((p) => String(p.supplierReference));
    expect(references).toHaveLength(35);
    expect(references.every((r) => /^PT\d{4}$/.test(r))).toBe(true);
    const published = JSON.stringify(await getPropertiesForSite());
    expect(references.filter((r) => published.includes(r))).toEqual([]);
    // The same through the public API, for a list and for one home.
    const caller = propertiesRouter.createCaller({ req: {}, res: { setHeader() {} }, user: null } as any);
    const viaApi = JSON.stringify([await caller.listForSite(), await caller.getBySlugForSite({ slug: 'mirante-1' })]);
    expect(viaApi).toContain('/homes/photos/mirante-1/');
    expect(references.filter((r) => viaApi.includes(r))).toEqual([]);
  });

  it('gives every partner home a different id', async () => {
    const ids = (await getPropertiesForSite()).filter(isPartnerHome).map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the reference on the server, for the team', async () => {
    const mirante = (raw as any[]).find((p) => p.slug === 'mirante-1');
    expect(mirante.supplierReference).toBe('PT0009');
    expect(await partnerSupplierReference(mirante.supplierUid)).toBe('PT0009');
    expect(await partnerSupplierReference('not-a-partner-home')).toBe('');
    expect(await partnerSupplierReference(undefined)).toBe('');
  });

  it('turns an imported record into the public one without touching the rest', () => {
    const pub = toPublicPartner({ id: 'tripwix-PT0009', slug: 'mirante-1', source: 'tripwix', supplierUid: 'u-1', supplierReference: 'PT0009', supplierCommission: '10%', bedrooms: 6 });
    expect(pub).toEqual({ id: 'partner-mirante-1', slug: 'mirante-1', source: 'partner', supplierUid: 'u-1', bedrooms: 6 });
  });

  it('publishes the photos under the home’s own name and leaves every other address alone', () => {
    const pub = toPublicPartner({
      id: 'tripwix-PT0009', slug: 'mirante-1', supplierUid: 'u-1', supplierReference: 'PT0009',
      images: ['/homes/photos/PT0009/00.webp', '/homes/photos/PT0009/01.webp', 'https://cdn.example/x.jpg', '/hero/home.webp', '/homes/photos/PT0010/00.webp'],
    });
    expect(pub.images).toEqual(['/homes/photos/mirante-1/00.webp', '/homes/photos/mirante-1/01.webp', 'https://cdn.example/x.jpg', '/hero/home.webp', '/homes/photos/PT0010/00.webp']);
  });

  it('a record without a slug gets an id from its uid, never from the reference', () => {
    expect(publicPartnerId({ slug: 'mirante-1', supplierUid: '2ff3c27b-da80-49e7-9c59-53e99106de2e' })).toBe('partner-mirante-1');
    expect(publicPartnerId({ supplierUid: '2ff3c27b-da80-49e7-9c59-53e99106de2e' })).toBe('partner-2ff3c27bda80');
    expect(publicPartnerId({ slug: 'Not A Slug', supplierUid: '2ff3c27b-da80-49e7-9c59-53e99106de2e' })).toBe('partner-2ff3c27bda80');
    expect(publicPartnerId({})).toBe('partner-home');
    expect(toPublicPartner({ id: 'tripwix-PT0009', supplierUid: 'u-1', supplierReference: 'PT0009' }).id).toBe('partner-u1');
  });

  it('publishes an approximate location: town and rounded coordinates, never the street', async () => {
    expect(withPublicAddress({ slug: 'x', address: { full: 'Rua A 12', street: 'Rua A 12', zipcode: '4900-000', city: 'Carreço', state: 'Viana do Castelo', country: 'Portugal', lat: 41.754663894426, lng: -8.8600030232788 } }))
      .toEqual({ slug: 'x', address: { city: 'Carreço', state: 'Viana do Castelo', country: 'Portugal', lat: 41.755, lng: -8.86 } });
    expect(withPublicAddress({ slug: 'y' })).toEqual({ slug: 'y' });
    expect(withPublicAddress({ slug: 'z', address: { lat: null, lng: 2 } })).toEqual({ slug: 'z', address: {} });

    const all = await getPropertiesForSite();
    const located = all.filter((p) => p.address && typeof p.address.lat === 'number');
    expect(located.length).toBeGreaterThan(50);
    for (const p of all) {
      expect(p.address ?? {}, p.slug).not.toHaveProperty('street');
      expect(p.address ?? {}, p.slug).not.toHaveProperty('full');
      expect(p.address ?? {}, p.slug).not.toHaveProperty('zipcode');
    }
    for (const p of located) {
      expect(Number(p.address.lat.toFixed(3)), p.slug).toBe(p.address.lat);
      expect(Number(p.address.lng.toFixed(3)), p.slug).toBe(p.address.lng);
    }
  });

  it('identifies a partner home in the JSON-LD by its catalogue id', async () => {
    const partner = (await getPropertiesForSite()).find(isPartnerHome)!;
    const schema = vacationRentalSchema({ ...partner, latitude: partner.address?.lat, longitude: partner.address?.lng }, 'en');
    expect(schema.identifier).toBe(`pa:${partner.id}`);
    expect(JSON.stringify(schema)).not.toMatch(/tripwix/i);
  });
});

describe('code that reads the published record', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(p);
      return /\.(tsx?|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
  }

  it('never tells a partner home by the supplier name: the store publishes "partner"', () => {
    // scripts/brand-facts.ts did (`p.source !== "tripwix"`), and the build then
    // counted all 110 homes as our own: "110+" where the pages say "70+".
    const COMPARES = /source\s*(?:===|!==|==|!=)\s*['"]tripwix['"]/;
    const offenders = ['server', 'shared', 'client/src', 'scripts'].flatMap(sources).filter((f) => COMPARES.test(read(f)));
    expect(offenders).toEqual([]);
  });

  it('the home counts still tell our own homes from the partner ones', async () => {
    const all = await getPropertiesForSite();
    const partner = all.filter(isPartnerHome).length;
    expect(partner).toBe((raw as any[]).filter((p) => p.isActive !== false).length);
    expect(all.length - partner).toBeGreaterThan(70);
    expect(read('scripts/brand-facts.ts')).toMatch(/!isPartnerHome\(p\)/);
  });
});

describe('the photo the thank-you page asks for', () => {
  const caller = () => propertiesRouter.createCaller({ req: {}, res: { setHeader() {} }, user: null } as any);

  it('answers with the first photo of the home and nothing else', async () => {
    const home = (await getPropertiesForSite()).find((p) => p.guestyId && Array.isArray(p.images) && p.images.length)!;
    const first = home.images[0];
    const answer = await caller().coverForListing({ listingId: home.guestyId });
    expect(answer).toEqual({ image: typeof first === 'string' ? first : first.url });
  });

  it('answers with no photo for an id the site does not know', async () => {
    expect(await caller().coverForListing({ listingId: 'not-a-listing' })).toEqual({ image: null });
  });
});

describe('what the browser is sent', () => {
  function sources(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(p);
      return /\.(tsx?)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
  }
  /** Code only: comments are not shipped (the bundler strips them). */
  const code = (file: string) => read(file)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

  it('no client or shared module names the supplier in code', () => {
    const offenders = ['client/src', 'shared']
      .flatMap(sources)
      .filter((f) => /tripwix/i.test(code(f)));
    expect(offenders).toEqual([]);
  });

  it('no page bundles the catalogue files: they carry every street address and the supplier fields', () => {
    // The thank-you page imported properties.json for one photo, which put the
    // whole file (street, postcode, exact coordinates) in a public script.
    const offenders = ['client/src', 'shared']
      .flatMap(sources)
      .filter((f) => /data\/(?:properties|tripwix-properties)\.json/.test(code(f)));
    expect(offenders).toEqual([]);
    const page = read('client/src/pages/booking/PaymentThankYouPage.tsx');
    expect(page).toMatch(/trpc\.properties\.coverForListing\.useQuery/);
  });

  it('the public API takes the partner uid under a neutral name, and still accepts the old one', () => {
    const router = read('server/routers/booking.ts');
    expect(router).toMatch(/partnerUid: z\.string\(\)\.uuid\(\)\.optional\(\)/);
    expect(router).toMatch(/tripwixUid: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  });
});
