import React from 'react';
import { describe, expect, it } from 'vitest';
import { publicPropertyTrip, propertyTripReplacement } from '../client/src/lib/propertyTrip';
import { propertyTripHref } from '../shared/editorialTripContext';
import { render } from '../client/src/entry-server';
import { PROPERTY_GROUPS } from '../client/src/config/propertyGroups';

(globalThis as any).React = React;

const current = publicPropertyTrip({ checkIn: '2027-05-10', checkOut: '2027-05-17', guests: 1 });
const location = (search = '') => ({ pathname: '/pt/homes/parent', search, hash: '#property-availability' });

describe('the current PDP stay follows the guest to another home or language', () => {
  it('replaces an older stay, preserving the language and anchor but no private query fields', () => {
    const url = propertyTripReplacement(location('?checkin=2027-04-01&checkout=2027-04-03&guests=6&email=guest@example.test&token=private&utm_campaign=old'), 'parent', current);
    expect(url).toBe('/pt/homes/parent?checkin=2027-05-10&checkout=2027-05-17&guests=1&utm_campaign=old#property-availability');
    expect(propertyTripHref('alternative', current)).toBe('/homes/alternative?checkin=2027-05-10&checkout=2027-05-17&guests=1');
  });

  it('retains supported campaign labels on the edited URL without carrying personal values', () => {
    const url = propertyTripReplacement(location('?utm_source=google&utm_medium=organic&utm_campaign=north-guide&utm_content=guest%40example.test&utm_term=351912345678&intentId=private&coupon=unknown'), 'parent', current)!;
    const query = new URL(url, 'https://example.test').searchParams;
    expect(Object.fromEntries(query)).toEqual({ checkin: '2027-05-10', checkout: '2027-05-17', guests: '1', utm_source: 'google', utm_medium: 'organic', utm_campaign: 'north-guide' });
    expect(propertyTripHref('alternative', current)).not.toContain('utm_');
  });

  it('keeps existing supported click identifiers without accepting arbitrary query content', () => {
    const query = new URL(propertyTripReplacement(location('?gclid=synthetic_click-123&msclkid=0123456789abcdef0123456789abcdef&fbclid=guest%40example.test&token=private'), 'parent', current)!, 'https://example.test').searchParams;
    expect(query.get('gclid')).toBe('synthetic_click-123');
    expect(query.get('msclkid')).toBe('0123456789abcdef0123456789abcdef');
    expect(query.has('fbclid')).toBe(false);
    expect(query.has('token')).toBe(false);
    expect(propertyTripHref('alternative', current)).not.toContain('clid');
  });

  it('does not rewrite a landing URL just because the widget defaults to two guests', () => {
    expect(propertyTripReplacement(location('?utm_source=google'), 'parent', publicPropertyTrip({ guests: 2 }))).toBeNull();
    expect(propertyTripReplacement(location('?checkin=2027-05-10&checkout=2027-05-17&guests=1'), 'parent', current)).toBeNull();
  });

  it('clears an old range when the next selection is unfinished, retaining a valid party', () => {
    const unfinished = publicPropertyTrip({ checkIn: '2027-06-01', checkOut: '', guests: 4 });
    expect(propertyTripReplacement(location('?checkin=2027-05-10&checkout=2027-05-17&guests=1'), 'parent', unfinished))
      .toBe('/pt/homes/parent?guests=4#property-availability');
    expect(propertyTripHref('alternative', unfinished)).toBe('/homes/alternative?guests=4');
  });

  it.each([
    { checkIn: '2027-02-30', checkOut: '2027-03-04', guests: 101 },
    { checkIn: '2027-05-17', checkOut: '2027-05-10', guests: -1 },
    { checkIn: '2027-05-10', checkOut: '2027-05-10', guests: 1.5 },
  ])('never puts invalid dates or a party count in outgoing links: %o', selection => {
    expect(propertyTripHref('alternative', publicPropertyTrip(selection))).toBe('/homes/alternative');
  });

  it('does not let an old page replace a different route after navigation', () => {
    expect(propertyTripReplacement({ ...location(), pathname: '/pt/homes/next-home' }, 'parent', current)).toBeNull();
    expect(propertyTripReplacement({ ...location(), pathname: '/pt/checkout/private-intent' }, 'parent', current)).toBeNull();
  });

  it.each(['pt', 'de'])('reloads the updated stay in %s with unit and related-home links intact', async lang => {
    const group = PROPERTY_GROUPS[0];
    const home = (guestyId: string, slug: string) => ({
      id: `guesty-${guestyId}`, guestyId, slug, name: `Synthetic ${slug}`, description: 'A synthetic home.',
      destination: 'minho', locality: 'Ponte de Lima', propertyType: 'House', isActive: true,
      maxGuests: 6, bedrooms: 3, bathrooms: 2, priceFrom: 200, images: [], amenities: {}, rooms: [], reviews: [],
    });
    const parent = home(group.parentGuestyId, 'parent');
    const unit = home(group.unitGuestyIds[1], 'unit');
    const related = home('synthetic-related-id', 'related');
    const replaced = propertyTripReplacement(location('?guests=6'), 'parent', current)!;
    // LanguageSwitcher preserves the query and hash while swapping the locale.
    const switched = replaced.replace('/pt/', `/${lang}/`);
    const { appHtml } = await render(switched.split('#')[0], { prefetch: {
      propertyBySlug: { slug: parent.slug, data: parent },
      groupUnits: { input: { parentGuestyId: group.parentGuestyId }, data: [parent, unit] },
      catalogForSite: [parent, related],
    } });
    for (const slug of ['unit', 'related']) {
      expect(appHtml).toContain(`href="/${lang}/homes/${slug}?checkin=2027-05-10&amp;checkout=2027-05-17&amp;guests=1"`);
    }
    expect(appHtml).not.toContain('guests=6');
  });
});
