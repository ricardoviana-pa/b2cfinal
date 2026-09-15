import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pricePartnerStay } from './services/tripwix';

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

describe('Tripwix API request sharing', () => {
  beforeEach(() => { vi.resetModules(); vi.stubEnv('TRIPWIX_API_KEY', 'test-only'); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-15T12:00:00Z')); });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  it('coalesces concurrent reads and reuses a covering calendar for other dates', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(days), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const { readTripwixCalendar } = await import('./services/tripwix-calendar');
    const result = await Promise.all([readTripwixCalendar('one', '2026-10-12', '2026-10-16'), readTripwixCalendar('one', '2026-10-12', '2026-10-14')]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result[0]?.source).toBe('live');
    expect(result[1]?.source).toBe('cached');
    expect(result[1]?.days).toHaveLength(3);
    vi.setSystemTime(new Date('2026-09-15T12:16:00Z'));
    await readTripwixCalendar('one', '2026-10-12', '2026-10-16');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('honours supplier throttling across properties without retry storms', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ detail: 'throttled' }), { status: 429, headers: { 'Retry-After': '120' } }));
    vi.stubGlobal('fetch', fetcher);
    const { readTripwixCalendar } = await import('./services/tripwix-calendar');
    expect(await readTripwixCalendar('one', '2026-10-12', '2026-10-16')).toBeNull();
    expect(await readTripwixCalendar('two', '2026-10-12', '2026-10-16')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps far-future requests within the supplier calendar range limit', async () => {
    const fetcher = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetcher);
    const { readTripwixCalendar } = await import('./services/tripwix-calendar');
    await readTripwixCalendar('one', '2028-10-12', '2028-10-16');
    expect(String(fetcher.mock.calls[0][0])).toContain('start_date=2028-10-12&end_date=2028-10-16');
  });
  it('does not call the API when credentials are absent or dates invalid', async () => {
    vi.stubEnv('TRIPWIX_API_KEY', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const { readTripwixCalendar } = await import('./services/tripwix-calendar');
    expect(await readTripwixCalendar('one', '2026-10-12', '2026-10-16')).toBeNull();
    expect(await readTripwixCalendar('one', '2026-02-30', '2026-03-01')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not advertise an isolated cheap night as an available minimum stay', async () => {
    const calendar = [
      { date: '2026-09-16', status: 'available', price: '10' },
      { date: '2026-09-17', status: 'booked', price: '10' },
      { date: '2026-09-18', status: 'available', price: '100' },
      { date: '2026-09-19', status: 'available', price: '100' },
    ];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(calendar))));
    const { getTripwixLowestNightly } = await import('./services/tripwix');
    expect(await getTripwixLowestNightly('one', 2)).toBe(106);
  });
});
