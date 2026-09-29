import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  save: vi.fn(), contactAck: vi.fn(), crm: vi.fn(), contactTeam: vi.fn(),
  availabilityTeam: vi.fn(), availabilityAck: vi.fn(), newsletter: vi.fn(),
}));
vi.mock('../db', () => ({ createLead: fake.save }));
vi.mock('../services/email', () => ({ sendContactConfirmation: fake.contactAck, sendContactNotification: fake.crm, sendNewsletterWelcome: fake.newsletter }));
vi.mock('../services/transactional-email', () => ({ sendContactInquiryNotification: fake.contactTeam, sendAvailabilityRequestNotification: fake.availabilityTeam, sendAvailabilityRequestConfirmation: fake.availabilityAck }));
import { leadsRouter } from '../routers/cms';
const caller = () => leadsRouter.createCaller({ req: {}, res: {}, user: null } as any);
const input = (source: string) => ({ source, email: 'synthetic@checkout.invalid', name: 'Synthetic Guest' });

beforeEach(() => {
  vi.resetAllMocks();
  for (const fn of Object.values(fake)) fn.mockResolvedValue(undefined);
  fake.save.mockResolvedValue({ id: 321 });
});
afterEach(() => vi.unstubAllEnvs());

describe('public conversion routing without network access', () => {
  it('saves contact then routes the edited message and trip to both booking team and CRM', async () => {
    fake.contactTeam.mockImplementation(async () => { expect(fake.save).toHaveBeenCalledOnce(); });
    await expect(caller().create({ ...input('contact-form'), message: '[services-enquiry] Pickup please', metadata: {
      subject: 'services-enquiry', service: 'airport-shuttle', destination: 'minho', checkin: '2099-10-01', checkout: '2099-10-05', guests: '4',
    } })).resolves.toEqual({ id: 321 });
    expect(fake.contactTeam).toHaveBeenCalledWith(expect.objectContaining({ subject: 'services-enquiry', message: expect.stringContaining('Check-in: 2099-10-01') }));
    expect(fake.crm).toHaveBeenCalledWith(fake.contactTeam.mock.calls[0][0]);
    expect(fake.contactAck).toHaveBeenCalledOnce();
  });
  it('routes a no-availability request to the team and acknowledgment with dates and locale', async () => {
    await caller().create({ ...input('search-no-availability'), metadata: { checkin: '2099-10-01', checkout: '2099-10-05', guests: '4', nights: '4', locale: 'pt' } });
    expect(fake.availabilityTeam).toHaveBeenCalledWith(expect.objectContaining({ checkIn: '2099-10-01', guests: '4', nights: '4' }));
    expect(fake.availabilityAck).toHaveBeenCalledWith(expect.objectContaining({ locale: 'pt', checkOut: '2099-10-05' }));
  });
  it('routes footer newsletter signups to the subscription integration', async () => {
    await caller().create(input('newsletter-footer'));
    expect(fake.newsletter).toHaveBeenCalledWith('synthetic@checkout.invalid');
    expect(fake.contactTeam).not.toHaveBeenCalled();
  });
  it.each(['contact-form', 'search-no-availability', 'newsletter-footer'])('does not acknowledge an unsaved %s', async (source) => {
    fake.save.mockRejectedValue(new Error('synthetic storage failure'));
    await expect(caller().create(input(source))).rejects.toThrow();
    for (const [key, fn] of Object.entries(fake)) if (key !== 'save') expect(fn).not.toHaveBeenCalled();
  });
  it('keeps a saved contact available when its team notification fails', async () => {
    fake.contactTeam.mockRejectedValue(new Error('synthetic mail provider failure'));
    await expect(caller().create(input('contact-form'))).resolves.toEqual({ id: 321 });
    expect(fake.save).toHaveBeenCalledOnce();
    expect(fake.crm).toHaveBeenCalledOnce();
  });
  it.each(['contact-form', 'search-no-availability', 'newsletter-footer'])('blocks external side effects for %s in preview', async (source) => {
    vi.stubEnv('APP_ENV', 'preview');
    await expect(caller().create(input(source))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    for (const fn of Object.values(fake)) expect(fn).not.toHaveBeenCalled();
  });
});
