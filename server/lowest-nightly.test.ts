import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ calendar: vi.fn(), quote: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock('./lib/guesty', () => ({ guestyBEClient: { getCalendar: mocks.calendar } }));
vi.mock('./services/guesty', () => ({ getQuoteWithDeadline: mocks.quote }));
vi.mock('./db', () => ({ getSetting: mocks.get, upsertSetting: mocks.save }));
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); mocks.save.mockResolvedValue(undefined); });
describe('visible from prices during provider latency', () => {
  it('returns the persisted price without waiting for calendar requests', async () => {
    mocks.get.mockResolvedValue('368@1');
    mocks.calendar.mockReturnValue(new Promise(() => {}));
    const { getDisplayedLowestNightly } = await import('./services/lowest-nightly');
    expect(await getDisplayedLowestNightly('synthetic-home')).toMatchObject({ from: 368, currency: 'EUR' });
  });
  it('shares one refresh across simultaneous PDP and catalogue requests', async () => {
    mocks.get.mockResolvedValue('368@1');
    mocks.calendar.mockReturnValue(new Promise(() => {}));
    const { getDisplayedLowestNightly, getLowestNightlyBatch } = await import('./services/lowest-nightly');
    await Promise.all([getDisplayedLowestNightly('synthetic-home'), getLowestNightlyBatch(['synthetic-home']), getDisplayedLowestNightly('synthetic-home')]);
    expect(mocks.calendar).toHaveBeenCalledTimes(1);
  });
  it('does not invent a price when no confirmed value exists', async () => {
    mocks.get.mockResolvedValue(null);
    mocks.calendar.mockReturnValue(new Promise(() => {}));
    const { getDisplayedLowestNightly } = await import('./services/lowest-nightly');
    expect(await getDisplayedLowestNightly('synthetic-home')).toMatchObject({ from: null, source: 'none' });
  });
  it('keeps a freshly persisted value without expensive provider calls', async () => {
    mocks.get.mockResolvedValue(`368@${Date.now()}`);
    const { getDisplayedLowestNightly } = await import('./services/lowest-nightly');
    expect((await getDisplayedLowestNightly('synthetic-home')).from).toBe(368);
    expect(mocks.calendar).not.toHaveBeenCalled();
  });
});
