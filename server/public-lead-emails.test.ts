/**
 * Auditoria de 14 nov 2026. Three things a public form could do to our email:
 *
 *  1. leads.create is public, its fields were unbounded and the automatic
 *     reply pasted the name and the dates into the HTML as they came: anyone
 *     could send their own text, with links, from booking@ to any address.
 *  2. "Your dates just opened" went out when the calendar showed the days
 *     free even if the home's minimum stay still ruled the request out.
 *  3. That email closed with a fixed urgency line ("Good dates tend to
 *     disappear again quickly"), which is not a fact about those dates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  days: [] as any[],
  homes: [] as any[],
}));
vi.mock('./lib/guesty', () => ({ guestyBEClient: { getCalendar: async () => h.days } }));
vi.mock('./services/properties-store', () => ({
  getPropertiesForSite: async () => h.homes,
  catalogProperties: (list: any[]) => list,
}));

import { sendAvailabilityRequestConfirmation, sendAvailabilityRequestNotification, sendContactInquiryNotification, sendDatesOpenedEmail } from './services/transactional-email';
import { datesAreBookable } from './services/search-hint';
import { __leadTesting } from './routers/cms';

/** Without RESEND_API_KEY the service logs the email instead of sending it. */
function captureEmails() {
  const emails: { subject: string; html: string }[] = [];
  let buf: string[] | null = null;
  let subject = '';
  const spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    const s = String(args[0] ?? '');
    if (s.includes('[EMAIL SERVICE - DEV MODE] To:')) { subject = s.split('Subject: ')[1] ?? ''; buf = []; return; }
    if (s.includes('[EMAIL SERVICE - DEV MODE] End of email')) { emails.push({ subject: subject.trim(), html: (buf ?? []).join('\n') }); buf = null; return; }
    if (buf) buf.push(s);
  });
  return { emails, restore: () => spy.mockRestore() };
}

const EVIL = '<a href="https://evil.example/login">Confirm your card</a>';

describe('emails triggered by a public form', () => {
  let cap: ReturnType<typeof captureEmails>;
  beforeEach(() => { cap = captureEmails(); });
  afterEach(() => cap.restore());

  it('the automatic reply shows form text as text, never as markup', async () => {
    await sendAvailabilityRequestConfirmation({
      email: 'guest@example.com', name: `${EVIL} Ana`, checkIn: EVIL, checkOut: '2027-06-12', guests: '<b>9</b>', locale: 'en',
    });
    const [mail] = cap.emails;
    expect(mail.html).not.toContain('evil.example');
    expect(mail.html).not.toContain('<b>9</b>');
    expect(mail.subject).not.toContain('evil.example');
    // A date that is not a date becomes a dash; the real one is written out.
    expect(mail.html).toContain('<strong>— → 12 June 2027</strong>');
    expect(mail.html).toContain('(— guests)');
  });

  it('a real request reads naturally, in the guest language', async () => {
    await sendAvailabilityRequestConfirmation({ email: 'g@example.com', name: 'Marta Silva', checkIn: '2027-06-05', checkOut: '2027-06-12', guests: '10', locale: 'pt-PT' });
    const [mail] = cap.emails;
    expect(mail.subject).toBe('Recebemos o seu pedido: 5 de junho de 2027 → 12 de junho de 2027');
    expect(mail.html).toContain('Olá Marta,');
    expect(mail.html).toContain('(10 hóspedes)');
    // Brand voice: no "local team" (Ricardo, 29 out 2026).
    expect(mail.html).not.toMatch(/equipa local/i);
  });

  it('the team notifications escape what the form sent and keep the subject on one line', async () => {
    await sendAvailabilityRequestNotification({ email: 'g@example.com', name: EVIL, checkIn: '2027-06-05', checkOut: '2027-06-12', guests: '4', nights: '7' });
    await sendContactInquiryNotification({ name: `Ana\r\nBcc: x@example.com ${EVIL}`, email: 'g@example.com', phone: '+351 900 000 000', subject: 'general', message: `Hello ${EVIL}` });
    for (const mail of cap.emails) {
      expect(mail.html).not.toContain('<a href="https://evil.example');
      expect(mail.subject).not.toMatch(/[\r\n]/);
    }
    expect(cap.emails[1].html).toContain('&lt;a href=&quot;https://evil.example/login&quot;&gt;');
  });

  it('"your dates are available" states the fact, with no urgency line, and refuses dates that are not dates', async () => {
    await sendDatesOpenedEmail({ email: 'g@example.com', name: 'Emma', checkIn: '2027-06-05', checkOut: '2027-06-12', guests: '6', locale: 'en', homes: [{ name: 'Villa Aura', slug: 'villa-aura' }] });
    const [mail] = cap.emails;
    expect(mail.subject).toBe('Your dates are now available (5 June 2027 → 12 June 2027)');
    expect(mail.html).toContain('Those dates are now available at: <strong>Villa Aura</strong>');
    expect(mail.html).not.toMatch(/disappear|quickly|just opened|depressa/i);
    expect(mail.html).toContain('homes?checkin=2027-06-05&checkout=2027-06-12&guests=6');

    await sendDatesOpenedEmail({ email: 'g@example.com', checkIn: EVIL, checkOut: '2027-06-12', guests: '6', homes: [{ name: 'Villa Aura', slug: 'villa-aura' }] });
    expect(cap.emails).toHaveLength(1);
  });
});

describe('the public lead schema', () => {
  const { leadInput, formDay, formCount } = __leadTesting;
  it('accepts what the site sends', () => {
    expect(leadInput.safeParse({ email: 'g@example.com', source: 'newsletter-footer' }).success).toBe(true);
    expect(leadInput.safeParse({
      email: 'g@example.com', name: 'Ana Silva', phone: '+351 900 000 000', message: 'x'.repeat(4000), source: 'search-no-availability',
      metadata: { checkin: '2027-06-05', checkout: '2027-06-12', guests: '6', nights: '7', locale: 'pt' },
    }).success).toBe(true);
  });
  it('refuses oversized fields', () => {
    const base = { email: 'g@example.com', source: 'contact-form' };
    expect(leadInput.safeParse({ ...base, name: 'x'.repeat(201) }).success).toBe(false);
    expect(leadInput.safeParse({ ...base, message: 'x'.repeat(8001) }).success).toBe(false);
    expect(leadInput.safeParse({ ...base, source: 'x'.repeat(81) }).success).toBe(false);
    expect(leadInput.safeParse({ ...base, metadata: { note: 'x'.repeat(2001) } }).success).toBe(false);
    expect(leadInput.safeParse({ ...base, metadata: Object.fromEntries(Array.from({ length: 41 }, (_, i) => [`k${i}`, 'v'])) }).success).toBe(false);
  });
  it('turns anything that is not a day or a count into a dash', () => {
    expect(formDay('2027-06-05')).toBe('2027-06-05');
    expect(formDay(EVIL)).toBe('—');
    expect(formDay(undefined)).toBe('—');
    expect(formCount('12')).toBe('12');
    expect(formCount('12 <b>')).toBe('—');
  });
});

describe('datesAreBookable: the alert only fires for a stay that can be booked', () => {
  const day = (date: string, over: Record<string, unknown> = {}) => ({ date, status: 'available', minNights: 2, cta: false, ctd: false, ...over });
  const span = (from: string, n: number, over: (d: string) => Record<string, unknown> = () => ({})) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(new Date(`${from}T00:00:00Z`).getTime() + i * 86400000).toISOString().slice(0, 10);
      return day(d, over(d));
    });
  beforeEach(() => {
    h.homes = [{ guestyId: `g-${Math.random()}`, slug: 'villa', name: 'Villa', maxGuests: 10 }];
  });

  it('free days and an open arrival: bookable', async () => {
    h.days = span('2027-06-04', 12);
    expect(await datesAreBookable('2027-06-05', '2027-06-10', 4)).toMatchObject({ available: true, homes: [{ slug: 'villa' }] });
  });
  it('free days but a seven-night minimum on that arrival: not bookable', async () => {
    h.days = span('2027-06-04', 12, () => ({ minNights: 7 }));
    expect(await datesAreBookable('2027-06-05', '2027-06-10', 4)).toEqual({ available: false, homes: [] });
  });
  it('a departure day closed to check-out: not bookable', async () => {
    h.days = span('2027-06-04', 12, (d) => (d === '2027-06-10' ? { ctd: true } : {}));
    expect(await datesAreBookable('2027-06-05', '2027-06-10', 4)).toEqual({ available: false, homes: [] });
  });
  it('a taken night in the middle: not bookable', async () => {
    h.days = span('2027-06-04', 12, (d) => (d === '2027-06-07' ? { status: 'booked' } : {}));
    expect(await datesAreBookable('2027-06-05', '2027-06-10', 4)).toEqual({ available: false, homes: [] });
  });
});
