/**
 * Ricardo, 29 out 2026: the homepage strip mixes our homes with the partner
 * homes that have a real "from" price and a full calendar, Eben Lodge in
 * slot 2. HOME_FEATURED_ORDER is the list; selectFeaturedHomes applies it to
 * the catalogue the page receives (lib/featuredHomes.ts).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import { HOME_FEATURED_ORDER, HOME_FEATURED_COUNT, catalogKey } from '@/config/propertyOrder';
import { isChildUnit } from '@/config/propertyGroups';
import { selectFeaturedHomes } from '@/lib/featuredHomes';
import PropertyCard from '@/components/property/PropertyCard';
import own from '../client/src/data/properties.json';
import partners from '../client/src/data/tripwix-properties.json';
import { CATALOG_HIDDEN_GUESTY_IDS, catalogProperties } from './services/properties-store';

(globalThis as any).React = React;
const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');

const EBEN = '696533466d209c001510ecfe';
type Home = { id: string; guestyId?: string | null; slug: string; name: string; destination?: string; isActive?: boolean; source?: string; priceFrom?: number };
const catalogue = catalogProperties([...(own as Home[]), ...(partners as Home[])]).filter((p) => p.isActive !== false);
const byKey = new Map(catalogue.map((p) => [catalogKey(p), p]));

describe('HOME_FEATURED_ORDER', () => {
  it('has one entry per card, without duplicates', () => {
    expect(HOME_FEATURED_ORDER).toHaveLength(HOME_FEATURED_COUNT);
    expect(new Set(HOME_FEATURED_ORDER).size).toBe(HOME_FEATURED_ORDER.length);
  });
  it('references homes that exist, are published and may be listed', () => {
    const missing = HOME_FEATURED_ORDER.filter((key) => !byKey.has(key));
    expect(missing).toEqual([]);
    for (const key of HOME_FEATURED_ORDER) {
      expect(CATALOG_HIDDEN_GUESTY_IDS.has(key), key).toBe(false);
      expect(isChildUnit(key), key).toBe(false);
    }
  });
  it('puts Eben Lodge in slot 2 and mixes at least three partner homes and four regions in', () => {
    expect(HOME_FEATURED_ORDER[1]).toBe(EBEN);
    expect(byKey.get(EBEN)?.name).toMatch(/Eben Lodge/);
    const partnerKeys = HOME_FEATURED_ORDER.filter((key) => key.startsWith('tripwix-'));
    expect(partnerKeys.length).toBeGreaterThanOrEqual(3);
    for (const key of partnerKeys) expect(byKey.get(key)?.source, key).toBe('tripwix');
    const regions = new Set(HOME_FEATURED_ORDER.map((key) => byKey.get(key)?.destination));
    expect(regions.size).toBeGreaterThanOrEqual(4);
  });
});

describe('selectFeaturedHomes', () => {
  it('returns the twelve homes of the list in order, from the real catalogue', () => {
    const picked = selectFeaturedHomes(catalogue);
    expect(picked.map(catalogKey)).toEqual(HOME_FEATURED_ORDER);
    expect(picked[1].guestyId).toBe(EBEN);
    expect(picked.filter((p) => p.source === 'tripwix').length).toBeGreaterThanOrEqual(3);
    expect(new Set(picked.map((p) => p.id)).size).toBe(HOME_FEATURED_COUNT);
  });
  it('still fills twelve cards from our own homes when partner inventory is off, without a child unit or a repeat', () => {
    const picked = selectFeaturedHomes(catalogue.filter((p) => p.source !== 'tripwix'));
    expect(picked).toHaveLength(HOME_FEATURED_COUNT);
    expect(picked.every((p) => p.guestyId && !isChildUnit(p.guestyId))).toBe(true);
    expect(new Set(picked.map((p) => p.id)).size).toBe(HOME_FEATURED_COUNT);
    expect(picked.map(catalogKey)).toContain(EBEN);
  });
  it('skips unpublished homes and group children even when the list names them', () => {
    const unit = (own as Home[]).find((p) => p.guestyId && isChildUnit(p.guestyId))!;
    const picked = selectFeaturedHomes([...catalogue, { ...unit, id: 'unit-copy' }].map((p) => p.guestyId === EBEN ? { ...p, isActive: false } : p));
    expect(picked.map(catalogKey)).not.toContain(EBEN);
    expect(picked.map(catalogKey)).not.toContain(unit.guestyId);
    expect(picked).toHaveLength(HOME_FEATURED_COUNT);
  });
});

describe('the homepage renders partner cards exactly like the listing', () => {
  const home = read('client/src/pages/Home.tsx');
  it('picks the strip with the shared selector and prices partner homes off their calendar', () => {
    expect(home).toMatch(/selectFeaturedHomes\(properties\)/);
    expect(home).toMatch(/usePartnerPrices\(\s*featured,/);
    expect(home).toMatch(/fromPrice=\{property\.supplierUid \? partner\.prices\[property\.supplierUid\] : property\.guestyId \? featuredFromPrices\?\.\[property\.guestyId\] : undefined\}/);
    expect(home).toMatch(/liveQuote=\{\(property\.source === 'tripwix' \? partner\.quotes\[property\.slug\] : homeQuotes\[property\.slug\]\) \|\| undefined\}/);
    expect(home).toMatch(/item_id: `PROP-\$\{propertyCatalogId\(property\)\}`/);
  });
  it('a partner card is the same markup on the homepage and on the listing: price label, no VAT claim, PDP link', () => {
    const caiz = { ...(partners as Home[]).find((p) => p.id === 'tripwix-PT0277')!, source: 'tripwix' } as any;
    const card = (listId: string, listName: string) => renderToStaticMarkup(
      React.createElement(Router, { ssrPath: '/en' },
        React.createElement(PropertyCard, { property: caiz, fromPrice: 795, listId, listName, itemIndex: 3 })),
    );
    const onHome = card('featured_homes', "Editor's Picks");
    expect(onHome).toBe(card('search_results', 'Search Results'));
    expect(onHome).toMatch(/href="\/homes\/casa-de-caiz"/);
    expect(onHome).toMatch(/795/);
    expect(onHome).toContain('partnerBooking.feesPendingShort');
    expect(onHome).not.toMatch(/VAT included|IVA inclu/i);
  });
});
