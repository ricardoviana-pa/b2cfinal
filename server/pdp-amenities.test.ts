/**
 * The home's page turns Guesty's raw amenity strings into the key features
 * (icons + translated labels) and a categorised full list (lib/amenities.ts).
 * Fixture: Lima River Houses as the sync exported it on 29 Oct 2026.
 */
import { describe, expect, it } from 'vitest';
import {
  amenityCategory, bedLine, categorizeAmenities, countBeds, deduplicateAmenities, pickKeyAmenities,
} from '@/lib/amenities';

const LIMA_RIVER = [
  'Air conditioning', 'BBQ grill', 'Baking sheet', 'Barbeque utensils', 'Beach essentials', 'Bed linens',
  'Carbon monoxide detector', 'Cleaning Disinfection', 'Cleaning products', 'Clothing storage', 'Coffee',
  'Coffee maker', 'Coin Laundry', 'Communal pool', 'Cookware', 'Crib', 'Cycling', 'Desk', 'Dining table',
  'Disabled parking spot', 'Dishes and silverware', 'Dishwasher', 'Enhanced cleaning practices', 'Essentials',
  'Extra pillows and blankets', 'Fire extinguisher', 'First aid kit', 'Fishing', 'Free parking on premises',
  'Free parking on street', 'Freezer', 'Garage', 'Garden View', 'Garden or backyard', 'Hair dryer', 'Hangers',
  'Heating', 'High chair', 'High touch surfaces disinfected', 'Horseback Riding', 'Hot water', 'Internet',
  'Iron', 'Kettle', 'Kitchen', 'Laptop friendly workspace', 'Long term stays allowed', 'Microwave', 'Mountain',
  'Mountain view', 'Museums', 'Near Ocean', 'Outdoor kitchen', 'Outdoor pool', 'Outdoor seating (furniture)',
  'Oven', 'Patio or balcony', 'Private entrance', 'Refrigerator', 'Room-darkening shades', 'Rural', 'Shampoo',
  'Shopping', 'Shower gel', 'Smoke detector', 'Sound system', 'Stereo system', 'Stove',
  'Suitable for children (2-12 years)', 'Suitable for infants (under 2 years)', 'Swimming pool', 'TV',
  'Toaster', 'Towels provided', 'Village', 'Washer', 'Washer in common space', 'Water Parks', 'Water Sports',
  'Window guards', 'Wine glasses', 'Wireless Internet', 'Family/kid friendly', 'Pool table', 'Indoor fireplace',
  'Fireplace guards', 'Wheelchair accessible', 'Wide doorway', 'Single level home',
];

const t = (key: string, opts?: Record<string, unknown>) =>
  opts && 'count' in opts ? `${opts.count} ${key.replace('beds.', '')} bed(s)` : key;

describe('amenities: the full list', () => {
  const items = deduplicateAmenities(LIMA_RIVER);
  const groups = categorizeAmenities(LIMA_RIVER);
  const groupOf = (item: string) => groups.find((g) => g.items.includes(item))?.category;

  it('hides the junk and the duplicates the guest never reads', () => {
    for (const gone of ['Essentials', 'Hot water', 'Hangers', 'Bed linens', 'Cleaning products', 'Coin Laundry',
      'Washer in common space', 'Extra pillows and blankets', 'Beach essentials', 'Cleaning Disinfection',
      'High touch surfaces disinfected', 'Long term stays allowed', 'Wine glasses', 'Shampoo']) {
      expect(items, gone).not.toContain(gone);
    }
  });

  it('folds the near-synonyms: a qualified pool beats the generic ones, the longest of the rest wins', () => {
    expect(items).toContain('Communal pool');
    expect(items).not.toContain('Swimming pool');
    expect(items).not.toContain('Outdoor pool');
    expect(items).toContain('Pool table'); // a games-room item, not a pool
    expect(items).toContain('Free parking on premises');
    expect(items).not.toContain('Free parking on street');
    expect(items).toContain('Disabled parking spot'); // accessibility, never folded into parking
    expect(items).toContain('Garage');
    expect(items).toContain('Wireless Internet');
    expect(items).not.toContain('Internet');
    expect(items).toContain('Coffee maker');
    expect(items).not.toContain('Coffee');
    expect(items).toContain('Garden View'); // a view, not the garden
    expect(items).toContain('Garden or backyard');
    expect(items).toContain('Kitchen');
    expect(items).toContain('Outdoor kitchen');
    expect(items.filter((i) => /sound system|stereo/i.test(i))).toHaveLength(1);
  });

  it('files each amenity under the most specific category', () => {
    expect(groupOf('Kitchen')).toBe('kitchen'); // not "outdoor" via "outdoor kitchen"
    expect(groupOf('Outdoor kitchen')).toBe('outdoor');
    expect(groupOf('Garden View')).toBe('views');
    expect(groupOf('Mountain view')).toBe('views');
    expect(groupOf('Mountain')).toBe('views');
    expect(groupOf('Near Ocean')).toBe('views');
    expect(groupOf('Village')).toBe('views');
    expect(groupOf('Disabled parking spot')).toBe('accessibility');
    expect(groupOf('Wheelchair accessible')).toBe('accessibility');
    expect(groupOf('Single level home')).toBe('accessibility');
    expect(amenityCategory('Grab-rails for shower and toilet')).toBe('accessibility'); // not bathroom via "shower"
    expect(amenityCategory('Roll-in shower with shower bench or chair')).toBe('accessibility');
    expect(groupOf('Hair dryer')).toBe('bathroom');
    expect(groupOf('Pool table')).toBe('outdoor');
    expect(groupOf('Indoor fireplace')).toBe('comfort');
    expect(groupOf('Room-darkening shades')).toBe('comfort');
    expect(groupOf('Window guards')).toBe('family');
    expect(groupOf('Family/kid friendly')).toBe('family');
    expect(groupOf('Laptop friendly workspace')).toBe('connectivity');
    expect(groupOf('Carbon monoxide detector')).toBe('safety');
    for (const nearby of ['Cycling', 'Fishing', 'Museums', 'Shopping', 'Water Parks', 'Water Sports', 'Horseback Riding']) {
      expect(groupOf(nearby), nearby).toBe('nearby');
    }
    expect(amenityCategory('Mountain biking')).toBe('nearby');
    expect(amenityCategory('Beach chairs')).toBe('outdoor');
    expect(groups.find((g) => g.category === 'other')).toBeUndefined();
  });

  it('shows the groups in reading order: the home first, the surroundings last', () => {
    const order = groups.map((g) => g.category);
    expect(order[0]).toBe('outdoor');
    expect(order.indexOf('accessibility')).toBeGreaterThan(order.indexOf('safety'));
    expect(order[order.length - 1]).toBe('nearby');
  });
});

describe('amenities: the key features', () => {
  it('leads with what sells the home, translated, never over-claiming', () => {
    const groups = categorizeAmenities(LIMA_RIVER);
    const keys = pickKeyAmenities(LIMA_RIVER, groups, t).map((a) => a.key);
    expect(keys[0]).toBe('swimmingPool'); // "Communal pool": not "Private pool"
    expect(keys).not.toContain('privatePool');
    expect(keys).toContain('mountainView');
    expect(keys).toContain('nearOcean');
    expect(keys).toContain('fireplace');
    expect(keys).toContain('bbq');
    expect(keys).toContain('airConditioning');
    expect(keys.length).toBeLessThanOrEqual(10);
    expect(pickKeyAmenities(LIMA_RIVER, groups, t)[0].label).toBe('amenityHighlight.swimmingPool');
  });

  it('says "Private pool" only when Guesty does, and never for a pool table', () => {
    const priv = pickKeyAmenities(['Private pool', 'Wifi'], [], t).map((a) => a.key);
    expect(priv[0]).toBe('privatePool');
    expect(priv).not.toContain('swimmingPool');
    const table = pickKeyAmenities(['Pool table', 'Wifi'], [], t).map((a) => a.key);
    expect(table).not.toContain('privatePool');
    expect(table).not.toContain('swimmingPool');
  });

  it('pads a thin home with its own raw features, skipping the surroundings', () => {
    const raw = ['Wireless Internet', 'Cycling', 'Museums', 'Oven', 'Toaster', 'Kettle', 'Smoke detector'];
    const keys = pickKeyAmenities(raw, categorizeAmenities(raw), t);
    // "Wireless Internet" is the wifi line already: never repeated as a raw item
    expect(keys.map((a) => a.key)).toEqual(['wifi', 'raw:Oven', 'raw:Toaster', 'raw:Kettle']);
  });
});

describe('bedrooms', () => {
  it('writes each bed in the guest\'s language, plural-aware, and counts them all', () => {
    expect(bedLine({ type: 'QUEEN_BED', quantity: 1 }, t)).toBe('1 queen bed(s)');
    expect(bedLine({ type: 'SINGLE_BED', quantity: 2 }, t)).toBe('2 single bed(s)');
    expect(bedLine({ type: 'FLOOR_MATTRESS', quantity: 1 }, t)).toBe('1 floor bed(s)');
    expect(bedLine({ type: 'WATER_BED', quantity: 2 }, t)).toBe('2 × WATER_BED');
    expect(countBeds([{ beds: [{ type: 'QUEEN_BED', quantity: 1 }] }, { beds: [{ type: 'SINGLE_BED', quantity: 2 }] }, { beds: [] }])).toBe(3);
    expect(countBeds(null)).toBe(0);
  });
});
