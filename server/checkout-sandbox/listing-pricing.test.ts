import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestyBEClient } from '../lib/guesty';
import { bookingRouter } from '../routers/booking';

const search = { checkIn: '2099-11-10', checkOut: '2099-11-18', guests: 2 };
const home = (id: string) => ({ _id: id, totalPrice: 1200, prices: { cleaningFee: 100, currency: 'EUR' } });
const page = (ids: string[], total = ids.length, next: string | null = null) => ({ results: ids.map(home), pagination: { total, cursor: { next } } });
const input = { ...search, listings: [{ listingId: 'featured-home', slug: 'featured' }] };
const caller = () => bookingRouter.createCaller({ user: null, req: {} as any, res: {} as any });
afterEach(() => vi.restoreAllMocks());

describe('listing search completeness', () => {
  it('finds a featured home outside the first six supplier results', async () => {
    const request = vi.spyOn(guestyBEClient, 'request').mockImplementation(async (_m, _p, options: any) => {
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'featured-home'];
      return page(ids.slice(0, options.query.limit), ids.length) as any;
    });
    const result = await caller().getBatchQuotes(input);
    expect(result.featured).toMatchObject({ available: true, pricing: { total: 1200 } });
    expect(request).toHaveBeenCalledWith('GET', '/api/listings', expect.objectContaining({ query: expect.objectContaining({ limit: 50, minOccupancy: 2 }) }));
  });
  it('follows the supplier cursor and preserves search dates', async () => {
    const request = vi.spyOn(guestyBEClient, 'request')
      .mockResolvedValueOnce(page(Array.from({ length: 50 }, (_, i) => `other-${i}`), 51, 'next-page') as any)
      .mockResolvedValueOnce(page(['featured-home'], 51) as any);
    expect((await caller().getBatchQuotes(input)).featured.available).toBe(true);
    expect(request.mock.calls[1][2]?.query).toMatchObject({ cursor: 'next-page', checkIn: search.checkIn, checkOut: search.checkOut, minOccupancy: 2 });
  });
  it('marks a missing home unavailable only after a complete result', async () => {
    vi.spyOn(guestyBEClient, 'request').mockResolvedValue(page(['other']) as any);
    expect((await caller().getBatchQuotes(input)).featured.available).toBe(false);
  });
  it('does not call a home unavailable when the supplier omits a required cursor', async () => {
    vi.spyOn(guestyBEClient, 'request').mockResolvedValue({ results: [home('other')], pagination: { total: 30 } } as any);
    expect((await caller().getBatchQuotes(input)).featured).toBeUndefined();
  });
  it('does not assume an unpaginated full page is the entire catalogue', async () => {
    vi.spyOn(guestyBEClient, 'request').mockResolvedValue(Array.from({ length: 50 }, (_, i) => home(`other-${i}`)) as any);
    expect((await caller().getBatchQuotes(input)).featured).toBeUndefined();
  });
  it('stops repeated cursors without converting absence to unavailability', async () => {
    const request = vi.spyOn(guestyBEClient, 'request').mockResolvedValue(page(['other'], 30, 'repeated') as any);
    expect((await caller().getBatchQuotes(input)).featured).toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed supplier results', async () => {
    vi.spyOn(guestyBEClient, 'request').mockResolvedValue({ error: 'unavailable' } as any);
    expect(await caller().getBatchQuotes(input)).toEqual({});
  });
});
