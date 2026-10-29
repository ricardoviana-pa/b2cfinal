import { describe, expect, it } from 'vitest';
import { lowestPartnerNightly, pricePartnerStay } from './services/tripwix';

const days = [12, 13, 14, 15, 16].map(n => ({ date: `2026-10-${n}`, status: 'available', price: '1226.00' }));
describe('Tripwix dated prices', () => {
  it('excludes checkout and preserves the existing supplier VAT treatment', () => {
    const q = pricePartnerStay(days, '2026-10-12', '2026-10-16');
    expect(q).toMatchObject({ available: true, nights: 4, accommodation: 5198.24, total: 5198.24, feesKnown: false });
    expect(q?.perNight).toHaveLength(4);
  });
  it('adds known cleaning but keeps the refundable deposit outside the total', () => {
    expect(pricePartnerStay(days, '2026-10-12', '2026-10-16', { cleaningFee: 350, securityDeposit: 844 }))
      .toMatchObject({ total: 5548.24, cleaningFee: 350, securityDeposit: 844, feesKnown: true });
  });
  it('does not claim imported zero means no cleaning fee', () => {
    expect(pricePartnerStay(days, '2026-10-12', '2026-10-16', { cleaningFee: 0 })?.feesKnown).toBe(false);
  });
  it('rejects missing nights, duplicates and invalid nightly prices', () => {
    expect(pricePartnerStay(days.slice(1), '2026-10-12', '2026-10-16')).toBeNull();
    expect(pricePartnerStay([...days, days[0]], '2026-10-12', '2026-10-16')).toBeNull();
    for (const price of [null, '0', '-3', 'NaN', '']) {
      expect(pricePartnerStay([{ ...days[0], price }, ...days.slice(1)], '2026-10-12', '2026-10-16')).toBeNull();
    }
  });
  it('marks unavailable nights, minimum stays and excessive party size as unavailable', () => {
    expect(pricePartnerStay([{ ...days[0], status: 'booked' }, ...days.slice(1)], '2026-10-12', '2026-10-16'))
      .toMatchObject({ available: false, unavailable: ['2026-10-12'] });
    expect(pricePartnerStay(days, '2026-10-12', '2026-10-16', { minNights: 5 })?.available).toBe(false);
    expect(pricePartnerStay(days, '2026-10-12', '2026-10-16', { guests: 13, maxGuests: 12 })?.available).toBe(false);
  });
  it('rejects impossible dates and reversed or excessive ranges', () => {
    expect(pricePartnerStay(days, '2026-02-30', '2026-03-04')).toBeNull();
    expect(pricePartnerStay(days, '2026-10-16', '2026-10-12')).toBeNull();
    expect(pricePartnerStay(days, '2026-10-12', '2027-10-12')).toBeNull();
  });
});

/** Um ano a partir de `start`: estado e preço líquido por dia. */
function year(start: string, rule: (i: number) => { status: string; price: number | null }) {
  return Array.from({ length: 366 }, (_, i) => ({ date: new Date(Date.parse(start) + i * 86400_000).toISOString().slice(0, 10), ...rule(i) }));
}

describe("Tripwix 'from' price (prices-availability-04)", () => {
  it('does not advertise an isolated cheap night as an available minimum stay', () => {
    const calendar = [
      { date: '2026-09-16', status: 'available', price: '10' },
      { date: '2026-09-17', status: 'booked', price: '10' },
      { date: '2026-09-18', status: 'available', price: '100' },
      { date: '2026-09-19', status: 'available', price: '100' },
    ];
    expect(lowestPartnerNightly(calendar, '2026-09-15', 2)).toBe(106);
  });

  it('looks 12 months ahead when nothing is open in 90 days (Casa na Areia: first open night 27 Feb)', () => {
    // 29 out: fechada até 26 fev (dia 120), depois aberta a 1 550 € líquidos.
    const calendar = year('2026-10-29', (i) => ({ status: i >= 121 ? 'available' : 'unavailable', price: 1550 }));
    expect(lowestPartnerNightly(calendar, '2026-10-29', 5)).toBe(1643);
  });

  it('keeps the 90-day rule when a stay is open in 90 days (a cheaper spring does not change its meaning)', () => {
    const calendar = year('2026-10-29', (i) => ({
      status: i === 10 || i === 11 || i > 200 ? 'available' : 'unavailable',
      price: i > 200 ? 500 : 900,
    }));
    expect(lowestPartnerNightly(calendar, '2026-10-29', 2)).toBe(954);
  });

  it('has no price when no minimum stay is open in 12 months', () => {
    const closed = year('2026-10-29', () => ({ status: 'unavailable', price: 1700 }));
    expect(lowestPartnerNightly(closed, '2026-10-29', 3)).toBeNull();
    // Noites soltas mais curtas do que a estadia mínima também não contam.
    const sparse = year('2026-10-29', (i) => ({ status: i % 3 === 0 ? 'available' : 'booked', price: 300 }));
    expect(lowestPartnerNightly(sparse, '2026-10-29', 2)).toBeNull();
  });

  it('ignores nights without a valid price and repeated dates', () => {
    const calendar = [
      { date: '2026-11-01', status: 'available', price: null },
      { date: '2026-11-02', status: 'available', price: 200 },
      { date: '2026-11-03', status: 'available', price: 200 },
      { date: '2026-11-03', status: 'available', price: 1 },
      { date: '2026-11-04', status: 'available', price: 300 },
      { date: '2026-11-05', status: 'available', price: 300 },
    ];
    expect(lowestPartnerNightly(calendar, '2026-10-29', 2)).toBe(318);
  });
});
