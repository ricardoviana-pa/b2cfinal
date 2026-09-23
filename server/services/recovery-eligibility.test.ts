import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ siblings: vi.fn(), guesty: vi.fn() }));
vi.mock('../db', () => ({ listIntentsForRecoveryStay: fake.siblings }));
vi.mock('../lib/guesty', () => ({ guestyClient: { request: fake.guesty } }));
import { canRemindRecoveryStay, isLatestUnbookedIntent } from './recovery-eligibility';

const older = { id: 'older', status: 'payment_pending', reservationId: null, recoveryOptout: false, createdAt: new Date('2026-09-01T10:00:00Z') } as any;
const latest = { ...older, id: 'latest', createdAt: new Date('2026-09-01T11:00:00Z') };
const intent = { ...latest, email: 'synthetic@example.test', listingId: 'synthetic-listing', checkIn: '2026-11-10', checkOut: '2026-11-18' } as any;
beforeEach(() => { vi.clearAllMocks(); fake.siblings.mockResolvedValue([older, latest]); fake.guesty.mockResolvedValue({ results: [] }); });

describe('one reminder per unbooked stay', () => {
  it('only considers the latest checkout for the same stay', () => {
    expect(isLatestUnbookedIntent(older.id, [latest, older])).toBe(false);
    expect(isLatestUnbookedIntent(latest.id, [older, latest])).toBe(true);
  });
  it.each([{ status: 'paid' }, { reservationId: 'confirmed-reservation' }, { recoveryOptout: true }])('suppresses the stay when another attempt has %j', (patch) => {
    expect(isLatestUnbookedIntent(latest.id, [{ ...older, ...patch }, latest])).toBe(false);
  });
  it('fails closed if no persisted stay exists', () => {
    expect(isLatestUnbookedIntent(latest.id, [])).toBe(false);
  });
  it('does not query Guesty for an old or already booked checkout', async () => {
    fake.siblings.mockResolvedValue([{ ...latest, status: 'paid' }]);
    expect(await canRemindRecoveryStay(intent)).toBe(false);
    expect(fake.guesty).not.toHaveBeenCalled();
  });
  it('checks the actual dates and listing before an eligible reminder', async () => {
    expect(await canRemindRecoveryStay(intent)).toBe(true);
    const query = fake.guesty.mock.calls[0][2].query;
    expect(JSON.parse(query.filters)).toEqual([
      { field: 'listingId', operator: '$eq', value: intent.listingId },
      { field: 'checkInDateLocalized', operator: '$lt', value: intent.checkOut },
      { field: 'checkOutDateLocalized', operator: '$gt', value: intent.checkIn },
      { field: 'status', operator: '$in', value: ['confirmed', 'reserved'] },
    ]);
  });
  it('suppresses reminders when another channel booked the dates', async () => {
    fake.guesty.mockResolvedValue({ results: [{ _id: 'manual-reservation' }] });
    expect(await canRemindRecoveryStay(intent)).toBe(false);
  });
  it.each([{}, { results: null }])('rejects unverified supplier responses', async result => {
    fake.guesty.mockResolvedValue(result);
    await expect(canRemindRecoveryStay(intent)).rejects.toThrow('Unable to verify');
  });
});
