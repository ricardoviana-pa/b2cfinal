/**
 * Quote das nossas casas quando o BE do Guesty não dá preço live (auditoria
 * 29 out 2026, prices-availability-02). Antes: noites "unavailable" passavam
 * o tier 3 e o tier 4 devolvia o basePrice do Guesty (placeholder) com
 * available:true — a PDP da Lima River Houses mostrava "From €550" (o "desde"
 * real era €342) e um erro vermelho de preço para datas que estão fechadas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  createBEQuote: vi.fn(),
  calendar: vi.fn(),
  getListing: vi.fn(),
  alert: vi.fn(),
  props: vi.fn(),
}));
vi.mock('./lib/guesty', () => ({ guestyClient: { getListingCalendar: h.calendar, getListing: h.getListing } }));
vi.mock('./services/guesty-booking', () => ({ isBEApiConfigured: () => true, createBEQuote: h.createBEQuote, beQuotesUnderPressure: () => false }));
vi.mock('./services/properties-store', () => ({ getPropertiesForSite: h.props }));
vi.mock('./services/transactional-email', () => ({ sendOpsAlert: h.alert }));

/** Calendário do BE da Lima River Houses, 8–18 jan 2027 (captura da auditoria). */
const lima = Array.from({ length: 11 }, (_, i) => {
  const date = `2027-01-${String(8 + i).padStart(2, '0')}`;
  return { date, status: 8 + i >= 12 ? 'unavailable' : 'available', minNights: 2, cta: false, ctd: false };
});
const open = (from: string, n: number, extra: Record<string, unknown> = {}) => Array.from({ length: n }, (_, i) => ({
  date: new Date(Date.parse(from) + i * 86400_000).toISOString().slice(0, 10), status: 'available', minNights: 2, cta: false, ctd: false, ...extra,
}));

beforeEach(() => {
  vi.resetModules();
  for (const fn of Object.values(h)) fn.mockReset();
  h.alert.mockResolvedValue(undefined);
  h.props.mockResolvedValue([]);
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('calendarStayVerdict', () => {
  it("treats any status other than 'available' as closed (Lima River Houses, 11–16 Jan)", async () => {
    const { calendarStayVerdict } = await import('./services/guesty');
    expect(calendarStayVerdict(lima, '2027-01-11', '2027-01-16')).toEqual({ status: 'unavailable', reason: 'dates' });
    for (const status of ['booked', 'blocked', 'maintenance', 'reserved']) {
      const days = open('2027-02-01', 6).map((d, i) => (i === 2 ? { ...d, status } : d));
      expect(calendarStayVerdict(days, '2027-02-01', '2027-02-05').status).toBe('unavailable');
    }
  });

  it('only the nights count: a stay that ends on a closed day is open', async () => {
    const { calendarStayVerdict } = await import('./services/guesty');
    expect(calendarStayVerdict(lima, '2027-01-08', '2027-01-12')).toEqual({ status: 'open' });
  });

  it('closes on arrival/departure rules and on the minimum stay of the arrival day', async () => {
    const { calendarStayVerdict } = await import('./services/guesty');
    const days = open('2027-02-01', 8);
    expect(calendarStayVerdict(days.map((d, i) => (i === 0 ? { ...d, cta: true } : d)), '2027-02-01', '2027-02-04').status).toBe('unavailable');
    expect(calendarStayVerdict(days.map((d, i) => (i === 3 ? { ...d, ctd: true } : d)), '2027-02-01', '2027-02-04').status).toBe('unavailable');
    expect(calendarStayVerdict(days.map((d) => ({ ...d, minNights: 7 })), '2027-02-01', '2027-02-06')).toEqual({ status: 'unavailable', reason: 'min_stay' });
  });

  it('a missing night or a bad range is "unknown", never "open"', async () => {
    const { calendarStayVerdict } = await import('./services/guesty');
    expect(calendarStayVerdict(open('2027-02-01', 8).filter((_, i) => i !== 2), '2027-02-01', '2027-02-05').status).toBe('unknown');
    expect(calendarStayVerdict([], '2027-02-01', '2027-02-05').status).toBe('unknown');
    expect(calendarStayVerdict(open('2027-02-01', 8), '2027-02-05', '2027-02-01').status).toBe('unknown');
  });
});

describe('getQuote without a live price', () => {
  it('dates the booking engine rejects are unavailable: no retry, no calendar, no placeholder', async () => {
    h.createBEQuote.mockRejectedValue(new Error('This property is not available for the selected dates.'));
    const { getQuote } = await import('./services/guesty');
    const q = await getQuote('lima', '2027-01-11', '2027-01-16', 2);
    expect(q).toMatchObject({ available: false, unavailable: true, unavailableReason: 'dates', fallbackMessage: 'Not available for selected dates' });
    expect(q.pricing.total).toBe(0);
    expect(q.pricing.nightlyRate).toBe(0);
    expect(h.createBEQuote).toHaveBeenCalledTimes(1);
    expect(h.calendar).not.toHaveBeenCalled();
    expect(h.getListing).not.toHaveBeenCalled();
  });

  it('minimum-stay and advance-notice rejections say why', async () => {
    const { getQuote } = await import('./services/guesty');
    h.createBEQuote.mockRejectedValueOnce(new Error('These dates do not meet the minimum stay rule for this property.'));
    expect(await getQuote('a', '2027-07-10', '2027-07-12', 2)).toMatchObject({ available: false, unavailable: true, unavailableReason: 'min_stay' });
    h.createBEQuote.mockRejectedValueOnce(new Error('These dates cannot be booked online because the advance notice rule is not met.'));
    expect(await getQuote('a', '2026-10-30', '2026-11-01', 2)).toMatchObject({ available: false, unavailable: true, unavailableReason: 'advance_notice' });
  });

  it("an engine failure on 'unavailable' nights returns available:false, not the Guesty base price", async () => {
    h.createBEQuote.mockRejectedValue(new Error('be_quote_timeout'));
    h.calendar.mockResolvedValue(lima);
    h.getListing.mockResolvedValue({ prices: { basePrice: 550, cleaningFee: 120, currency: 'EUR' } });
    const { getQuote } = await import('./services/guesty');
    const q = await getQuote('lima', '2027-01-11', '2027-01-16', 2);
    expect(q).toMatchObject({ available: false, unavailable: true, source: 'request' });
    expect(q.pricing.nightlyRate).toBe(0);
    expect(h.getListing).not.toHaveBeenCalled();
  });

  it('an engine failure on open nights is marked estimate with no number to show, never the placeholder', async () => {
    h.createBEQuote.mockRejectedValue(new Error('be_quote_timeout'));
    h.calendar.mockResolvedValue(open('2027-01-11', 6));
    h.getListing.mockResolvedValue({ prices: { basePrice: 90, cleaningFee: 40, currency: 'EUR' } });
    const { getQuote } = await import('./services/guesty');
    const q = await getQuote('garden', '2027-01-11', '2027-01-16', 2);
    expect(q).toMatchObject({ available: true, source: 'base', estimate: true });
    expect(q.pricing).toEqual({ nightlyRate: 0, totalNights: 0, cleaningFee: 0, subtotal: 0, total: 0 });
    expect(q.unavailable).toBeUndefined();
    expect(h.getListing).not.toHaveBeenCalled();
    // A seguir (3 min), o mesmo resultado sem voltar ao calendário.
    expect(await getQuote('garden', '2027-01-11', '2027-01-16', 2)).toMatchObject({ estimate: true });
    expect(h.calendar).toHaveBeenCalledTimes(1);
  });

  it('an unreadable calendar is not proof the dates are closed', async () => {
    h.createBEQuote.mockRejectedValue(new Error('Unable to get live quote from Guesty.'));
    h.calendar.mockRejectedValue(new Error('calendar down'));
    const { getQuote } = await import('./services/guesty');
    expect(await getQuote('x', '2027-01-11', '2027-01-16', 2)).toMatchObject({ available: true, estimate: true, source: 'base' });
  });

  it('closed dates do not count as engine failures in the fallback alert (real failures still do)', async () => {
    h.createBEQuote.mockRejectedValue(new Error('This property is not available for the selected dates.'));
    let mod = await import('./services/guesty');
    for (let d = 10; d < 20; d++) await mod.getQuote(`home-${d}`, `2027-01-${d}`, `2027-01-${d + 2}`, 2);
    await new Promise((r) => setTimeout(r, 10));
    expect(h.alert).not.toHaveBeenCalled();

    vi.resetModules();
    h.createBEQuote.mockRejectedValue(new Error('Unable to get live quote from Guesty.'));
    h.calendar.mockResolvedValue([]);
    mod = await import('./services/guesty');
    // Em paralelo: cada falha não definitiva espera 1,2 s pelo retry.
    await Promise.all(Array.from({ length: 8 }, (_, i) => mod.getQuote(`home-${i}`, `2027-01-${10 + i}`, `2027-01-${12 + i}`, 2)));
    await vi.waitFor(() => expect(h.alert).toHaveBeenCalledTimes(1));
  });

  it('the 20 s deadline answers "no live price", not "unavailable"', async () => {
    vi.useFakeTimers();
    h.props.mockReturnValue(new Promise(() => {})); // getQuote pendurado
    const { getQuoteWithDeadline } = await import('./services/guesty');
    const pending = getQuoteWithDeadline('slow', '2027-01-11', '2027-01-16', 2, 20_000);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await pending).toMatchObject({ available: true, estimate: true, source: 'base', pricing: { total: 0 } });
  });

  it('a live quote is unchanged', async () => {
    h.createBEQuote.mockResolvedValue({
      quoteId: 'q1', ratePlanId: 'rp', currency: 'EUR', total: 1185.9, ratePlanOptions: [],
      pricing: { nightlyRate: 181.4, totalNights: 907, cleaningFee: 278.9, taxesAndFees: 0 },
    });
    const { getQuote } = await import('./services/guesty');
    expect(await getQuote('ok', '2027-01-11', '2027-01-16', 2)).toMatchObject({ available: true, source: 'live', quoteId: 'q1', pricing: { total: 1185.9 } });
    expect(h.calendar).not.toHaveBeenCalled();
  });
});
