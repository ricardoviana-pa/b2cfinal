/**
 * Regras dos scripts de preços (auditoria 29 out 2026):
 * - scripts/meta-catalog.mjs (prices-availability-07): base_price = "desde"
 *   real do site, nunca o basePrice do Guesty; fora do feed as casas sem
 *   noites reserváveis e as páginas que não respondem 200.
 * - scripts/quote-health.mjs (prices-availability-02): "sem preço live" com o
 *   calendário fechado conta como indisponível; casas parceiras incluídas;
 *   o listing de teste fica de fora.
 */
import { describe, expect, it, vi } from 'vitest';
// @ts-ignore — módulo .mjs dos scripts, sem tipos
import { checkPages, fetchLowestNightly, median, metaPrice, priceBand, skipReason } from '../scripts/lib/meta-catalog-prices.mjs';
// @ts-ignore — módulo .mjs dos scripts, sem tipos
import { calendarClosesStay, classifyOwnQuote, classifyPartnerQuote, isPartnerHome, isPublicHome, isQuotableOwnHome, stayNights } from '../scripts/lib/quote-health.mjs';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('Meta catalog prices', () => {
  it('reads the real "From" from the public batch endpoint, one GET per 100 homes', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const ids = JSON.parse(decodeURIComponent(url.split('input=')[1]))[0].json.listingIds as string[];
      return json([{ result: { data: { json: Object.fromEntries(ids.map((id) => [id, id === 'geres' ? null : 222])) } } }]);
    });
    const ids = ['nature-hill', 'geres', ...Array.from({ length: 120 }, (_, i) => `h${i}`)];
    const prices = await fetchLowestNightly('https://www.portugalactive.com', ids, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[0][0])).toContain('/api/trpc/booking.lowestNightlyBatch?batch=1&input=');
    expect(prices.get('nature-hill')).toBe(222);
    expect(prices.get('geres')).toBeNull();
    expect(prices.size).toBe(122);
  });

  it('fails instead of falling back to a placeholder when the API does not answer', async () => {
    await expect(fetchLowestNightly('https://x.test', ['a'], { fetchImpl: async () => json({}, 502) })).rejects.toThrow('HTTP 502');
    await expect(fetchLowestNightly('https://x.test', ['a'], { fetchImpl: async () => json([{ error: {} }]) })).rejects.toThrow('resposta inesperada');
  });

  it('formats the Meta price and bands the real value', () => {
    expect(metaPrice(69.5)).toBe('69.50 EUR');
    expect(priceBand(69.5)).toBe('entry-under-150');
    expect(priceBand(222)).toBe('mid-150-300');
    expect(priceBand(411)).toBe('premium-300plus');
  });

  it('leaves out homes with no real "from", 404 pages and redirects', () => {
    expect(skipReason({ from: 222, page: { status: 200 } })).toBeNull();
    expect(skipReason({ from: 222, page: undefined })).toBeNull();
    expect(skipReason({ from: null, page: { status: 200 } })).toContain('sem "desde" real');
    expect(skipReason({ from: 82.5, page: { status: 404 } })).toBe('página 404');
    expect(skipReason({ from: 82.5, page: { status: 301, location: '/en/homes/new-slug' } })).toContain('/en/homes/new-slug');
    expect(skipReason({ from: 82.5, page: { status: 0, error: 'timeout' } })).toContain('timeout');
  });

  it('checks pages without following redirects, at most 3 at a time', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetchImpl = vi.fn(async (url: string, init: any) => {
      expect(init.redirect).toBe('manual');
      inFlight++; peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return url.endsWith('gone') ? new Response('', { status: 404 }) : new Response('', { status: 200 });
    });
    const urls = Array.from({ length: 9 }, (_, i) => `https://x.test/en/homes/h${i}`).concat('https://x.test/en/homes/gone');
    const out = await checkPages(urls, { fetchImpl, concurrency: 10, gapMs: 0 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(out.get('https://x.test/en/homes/gone')?.status).toBe(404);
    expect(out.get('https://x.test/en/homes/h1')?.status).toBe(200);
  });

  it('median of the placeholder/real ratios', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([180 / 70, 550 / 222, 400 / 164, 500 / 222])).toBeCloseTo(2.458, 3);
    expect(median([])).toBeNull();
  });
});

describe('quote-health rules', () => {
  it('skips the Guesty test listing and the manual exclusions, keeps partner homes', () => {
    expect(isPublicHome({ name: 'Test_Guesty Test', slug: 'test-guesty-test-1a2b3c', guestyId: 'g1' })).toBe(false);
    expect(isPublicHome({ name: 'Villa Luzia', slug: 'villa-luzia-by-portugal-active-9f9f9f', guestyId: 'g2' })).toBe(false);
    expect(isPublicHome({ name: 'Off', slug: 'off', guestyId: 'g3', isActive: false })).toBe(false);
    const partner = { name: 'Casa na Areia', slug: 'casa-na-areia', source: 'tripwix', supplierUid: 'u1', isActive: true };
    expect(isPartnerHome(partner)).toBe(true);
    expect(isQuotableOwnHome(partner)).toBe(false);
    expect(isQuotableOwnHome({ name: 'Eben Lodge', slug: 'eben', guestyId: 'g4', isPortfolio: true })).toBe(false);
    expect(isQuotableOwnHome({ name: 'Lima River Houses', slug: 'lima', guestyId: 'g5' })).toBe(true);
  });

  it('classifies own-home quotes: live, closed dates, request-only and "no live price"', () => {
    expect(classifyOwnQuote({ source: 'live', available: true, pricing: { total: 1185.9 } })).toEqual({ bucket: 'live', total: 1185.9 });
    expect(classifyOwnQuote({ source: 'request', available: false, unavailable: true, unavailableReason: 'min_stay' }).bucket).toBe('unavailable');
    expect(classifyOwnQuote({ source: 'request', available: false, requestOnly: true }).bucket).toBe('request');
    expect(classifyOwnQuote({ source: 'base', available: true, estimate: true, fallbackMessage: 'Live pricing is temporarily unavailable.' }).bucket).toBe('fallback');
    // O servidor antigo: basePrice com available:true.
    expect(classifyOwnQuote({ source: 'base', available: true, pricing: { total: 3188.72 } }).bucket).toBe('fallback');
    expect(classifyOwnQuote(null).bucket).toBe('error');
  });

  it('a "no live price" answer is "unavailable" when the calendar closes the nights (Lima River Houses, 11–16 Jan)', () => {
    const lima = [8, 9, 10, 11, 12, 13, 14, 15, 16].map((d) => ({ date: `2027-01-${String(d).padStart(2, '0')}`, status: d >= 12 ? 'unavailable' : 'available', minNights: 2 }));
    expect(calendarClosesStay(lima, '2027-01-11', '2027-01-16')).toContain('4 noite(s) fechada(s)');
    expect(calendarClosesStay(lima, '2027-01-08', '2027-01-12')).toBeNull(); // só o dia da saída fechado
    const open = lima.map((d) => ({ ...d, status: 'available' }));
    expect(calendarClosesStay(open, '2027-01-11', '2027-01-16')).toBeNull();
    expect(calendarClosesStay(open.map((d) => ({ ...d, minNights: 7 })), '2027-01-11', '2027-01-16')).toContain('estadia mínima de 7');
    expect(calendarClosesStay(open.map((d) => (d.date === '2027-01-11' ? { ...d, cta: true } : d)), '2027-01-11', '2027-01-16')).toContain('chegada');
    expect(stayNights('2027-01-11', '2027-01-16')).toEqual(['2027-01-11', '2027-01-12', '2027-01-13', '2027-01-14', '2027-01-15']);
  });

  it('classifies partner quotes, including a missing supplier calendar', () => {
    expect(classifyPartnerQuote(null, 2).bucket).toBe('no-calendar');
    expect(classifyPartnerQuote({ available: true, total: 15654.08, nights: 5 }, 4)).toEqual({ bucket: 'live', total: 15654.08 });
    expect(classifyPartnerQuote({ available: false, unavailable: ['2027-01-12'], nights: 5 }, 2).detail).toContain('1 noite(s) ocupada(s)');
    expect(classifyPartnerQuote({ available: false, unavailable: [], nights: 5 }, 7).detail).toContain('estadia mínima de 7');
  });
});
