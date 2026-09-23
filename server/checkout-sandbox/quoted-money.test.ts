import './setup';
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { accommodationSubtotal, formatQuotedMoney } from '../../shared/booking-money';
import { formatEur, formatEurCents, formatQuotedEur, intlLocale } from '../../client/src/lib/format';

const fake = vi.hoisted(() => ({ send: vi.fn(async () => ({ error: null })) }));
vi.mock('resend', () => ({ Resend: class { emails = { send: fake.send }; } }));
let email: typeof import('../services/transactional-email');
beforeAll(async () => {
  vi.stubEnv('RESEND_API_KEY', 'synthetic-mocked-email-only');
  email = await import('../services/transactional-email');
});
beforeEach(() => vi.clearAllMocks());
afterAll(() => vi.unstubAllEnvs());

describe('quoted prices preserve the payable cents', () => {
  it.each(['pt', 'en', 'fr', 'es', 'it', 'de', 'nl', 'fi', 'sv'])('keeps quote, receipt and email amounts aligned in %s', lang => {
    const expected = new Intl.NumberFormat(intlLocale(lang), { style: 'currency', currency: 'EUR' }).format(2888.87);
    expect(formatQuotedEur(2888.87, lang)).toBe(expected);
    expect(formatEurCents(288887, lang)).toBe(expected);
    expect(formatQuotedMoney(2888.87, intlLocale(lang))).toBe(expected);
  });
  it('keeps indicative whole-euro formatting separate and handles missing receipt amounts', () => {
    expect(formatEur(2888.87, 'en')).toBe('€2,889');
    expect(formatQuotedEur(2888, 'en')).toBe('€2,888');
    expect(formatEurCents(null, 'en')).toBe('—');
    expect(formatEurCents(0, 'en')).toBe('€0');
    expect(formatQuotedEur(0.1 + 0.2, 'en')).toBe('€0.30');
  });
  it('reconciles a quote with fees even when its nightly average is rounded', () => {
    const lodging = accommodationSubtotal(2888.87, 347.20, 0);
    expect(lodging).toBe(2541.67);
    expect(Math.round(lodging * 100) + 34720).toBe(288887);
    expect(lodging).not.toBe(Math.round(lodging / 8) * 8);
    expect(accommodationSubtotal(2147, 120, 25)).toBe(2002);
    expect(accommodationSubtotal(0.3, 0.1, 0.1)).toBe(0.1);
  });
  it('renders a recovery email with exact totals and no false nightly multiplication', async () => {
    await email.sendCheckoutRecovery({ guestEmail: 'guest@checkout.invalid', propertyName: 'Synthetic home',
      checkIn: '2099-11-10', checkOut: '2099-11-18', guests: 2, locale: 'en', stage: 1,
      resumeUrl: 'https://www.portugalactive.com/en/checkout/synthetic',
      quote: { nightlyRate: 317.71, nights: 8, totalNights: 2541.67, cleaningFee: 347.2, total: 2888.87 } });
    expect(fake.send).toHaveBeenCalledOnce();
    const html = (fake.send.mock.calls.at(-1) as any)[0].html;
    expect(html).toContain('€2,888.87');
    expect(html).toContain('€2,541.67');
    expect(html).toContain('€347.20');
    expect(html).toContain('8 nights');
    expect(html).not.toContain('×');
  });
  it('renders the confirmed charge with cents in the receipt', async () => {
    await email.sendCheckoutGuestConfirmation({ email: 'guest@checkout.invalid', intentId: 'synthetic', locale: 'en',
      propertyName: 'Synthetic home', confirmationCode: 'SYNTHETIC',
      quote: { nightlyRate: 317.71, nights: 8, totalNights: 2541.67, cleaningFee: 347.2, total: 2888.87 },
      canonical: { lines: [], receptionCents: 0, flexCents: 0, totalCents: 288887 } });
    expect(fake.send).toHaveBeenCalledOnce();
    const html = (fake.send.mock.calls.at(-1) as any)[0].html;
    expect(html).toContain('€2,888.87');
    expect(html).toContain('€2,541.67');
    expect(html).not.toContain('×');
  });
});
