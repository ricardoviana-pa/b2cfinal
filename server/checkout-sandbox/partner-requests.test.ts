import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ save: vi.fn(), update: vi.fn(), get: vi.fn(), send: vi.fn() }));
vi.mock('../db', () => ({ createLead: fake.save, updateLead: fake.update, getLeadById: fake.get }));
vi.mock('../services/transactional-email', () => ({ sendPartnerRequestEmail: fake.send }));
vi.mock('../services/properties-store', () => ({ getPropertiesForSite: async () => [
  { slug: 'synthetic-partner', name: 'Synthetic partner home', bookingMode: 'request', maxGuests: 8 },
  { slug: 'synthetic-own', name: 'Own home', bookingMode: 'instant' },
] }));
import { leadsRouter } from '../routers/cms';
const caller = (admin = false) => leadsRouter.createCaller({ req: {}, res: {}, user: admin ? { role: 'admin' } : null } as any);
const input = () => ({ name: 'Synthetic Guest', email: 'guest@checkout.invalid', source: 'partner-home-request',
  metadata: { property: 'synthetic-partner', propertyName: 'Forged name', checkin: '2099-10-01', checkout: '2099-10-05',
    guests: '4', total: '1234.50', locale: 'pt', quoteStatus: 'partial', teamNotification: 'accepted' } });

beforeEach(() => {
  vi.resetAllMocks();
  fake.save.mockResolvedValue({ id: 123 });
  fake.update.mockResolvedValue(undefined);
  fake.send.mockResolvedValue('synthetic-email-id');
});
afterEach(() => vi.unstubAllEnvs());

describe('partner request recovery', () => {
  it('persists canonical request before notifying both recipients and records provider acceptance', async () => {
    fake.send.mockImplementation(async () => {
      expect(fake.save).toHaveBeenCalledOnce();
      return 'synthetic-email-id';
    });
    expect(await caller().create(input())).toEqual({ id: 123 });
    expect(fake.save.mock.calls[0][0].metadata).toMatchObject({ propertyName: 'Synthetic partner home', nights: '4', teamNotification: 'pending' });
    expect(fake.send.mock.calls.map(c => c[1])).toEqual(['team', 'guest']);
    expect(fake.update.mock.calls[0][1].metadata).toMatchObject({ teamNotification: 'accepted', guestNotification: 'accepted', teamNotificationId: 'synthetic-email-id' });
  });
  it('keeps the request successful if internal email fails and still acknowledges the guest', async () => {
    fake.send.mockRejectedValueOnce(new Error('synthetic provider failure'));
    await expect(caller().create(input())).resolves.toEqual({ id: 123 });
    expect(fake.update.mock.calls[0][1].metadata).toMatchObject({ teamNotification: 'failed', guestNotification: 'accepted' });
  });
  it('does not send or acknowledge an unsaved request', async () => {
    fake.save.mockRejectedValue(new Error('synthetic database unavailable'));
    await expect(caller().create(input())).rejects.toThrow();
    expect(fake.send).not.toHaveBeenCalled();
  });
  it('does not invite duplicate submission when saving notification status fails', async () => {
    fake.update.mockRejectedValue(new Error('synthetic status failure'));
    await expect(caller().create(input())).resolves.toEqual({ id: 123 });
  });
  it('accepts an enquiry without dates or supplier quote', async () => {
    const request = input(); request.metadata.checkin = '—'; request.metadata.checkout = '—'; request.metadata.total = '—';
    await caller().create(request);
    expect(fake.save.mock.calls[0][0].metadata).toMatchObject({ nights: '—', total: '—' });
  });
  it.each([
    { property: 'synthetic-own' }, { property: 'missing-home' }, { guests: '9' },
    { checkin: '2099-02-30' }, { checkout: '2099-09-30' }, { checkout: '—' },
  ])('rejects invalid home/date/occupancy before storing: %s', async (metadata) => {
    const request = input(); Object.assign(request.metadata, metadata);
    await expect(caller().create(request)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(fake.save).not.toHaveBeenCalled(); expect(fake.send).not.toHaveBeenCalled();
  });
  it('requires admin for retry', async () => {
    await expect(caller().retryPartnerNotification({ id: 123 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fake.get).not.toHaveBeenCalled();
  });
  it('recovers a historical internal alert without contacting the guest', async () => {
    fake.get.mockResolvedValue({ ...input(), id: 123, metadata: { propertyName: 'Historical synthetic home' } });
    await caller(true).retryPartnerNotification({ id: 123 });
    expect(fake.send).toHaveBeenCalledOnce(); expect(fake.send.mock.calls[0][1]).toBe('team');
  });
  it('does not resend an already accepted alert', async () => {
    fake.get.mockResolvedValue({ ...input(), id: 123, metadata: { teamNotification: 'accepted' } });
    await caller(true).retryPartnerNotification({ id: 123 });
    expect(fake.send).not.toHaveBeenCalled();
  });
  it('blocks requests and retries in DEV', async () => {
    vi.stubEnv('APP_ENV', 'preview');
    await expect(caller().create(input())).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(caller(true).retryPartnerNotification({ id: 123 })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(fake.save).not.toHaveBeenCalled(); expect(fake.send).not.toHaveBeenCalled();
  });
});
