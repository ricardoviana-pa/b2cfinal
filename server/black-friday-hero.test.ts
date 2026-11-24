import { describe, expect, it } from 'vitest';
import {
  BLACK_FRIDAY_HERO_CODE,
  BLACK_FRIDAY_HERO_START,
  BLACK_FRIDAY_HERO_END,
  isBlackFridayHeroActive,
} from '../client/src/hooks/useBlackFriday2026';
import {
  BLACK_FRIDAY_2026_GENERAL_CODE,
  blackFridayPublicCodeValid,
  blackFridayPublicCoupon,
} from './services/black-friday-2026';

describe('Black Friday homepage announcement', () => {
  it('advertises the public manual code and the exact Lisbon campaign window', () => {
    expect(BLACK_FRIDAY_HERO_CODE).toBe('PABF15GERAL26');
    expect(BLACK_FRIDAY_HERO_CODE).toBe(BLACK_FRIDAY_2026_GENERAL_CODE);
    expect(BLACK_FRIDAY_HERO_START).toBe(Date.parse('2026-11-24T00:00:00+00:00'));
    expect(BLACK_FRIDAY_HERO_END).toBe(Date.parse('2026-12-01T00:00:00+00:00'));
  });

  it.each([
    ['VIP launch is not the public launch', '2026-11-23T00:00:00Z', false],
    ['last millisecond before launch', '2026-11-23T23:59:59.999Z', false],
    ['public launch is inclusive', '2026-11-24T00:00:00Z', true],
    ['inside the campaign', '2026-11-26T12:00:00Z', true],
    ['last millisecond of 30 November', '2026-11-30T23:59:59.999Z', true],
    ['1 December is exclusive', '2026-12-01T00:00:00Z', false],
    ['after the campaign', '2026-12-02T12:00:00Z', false],
    ['visitor ahead of Lisbon before launch', '2026-11-24T00:30:00+01:00', false],
    ['visitor behind Lisbon at launch', '2026-11-23T21:00:00-03:00', true],
    ['visitor behind Lisbon just before expiry', '2026-11-30T20:59:59.999-03:00', true],
    ['visitor behind Lisbon at expiry', '2026-11-30T21:00:00-03:00', false],
  ])('%s matches manual coupon validity', (_case, timestamp, expected) => {
    const at = new Date(timestamp);
    expect(isBlackFridayHeroActive(at.getTime())).toBe(expected);
    expect(isBlackFridayHeroActive(at.getTime())).toBe(blackFridayPublicCodeValid(at));
  });

  it.each([NaN, Infinity, -Infinity])('does not advertise the campaign with an invalid timestamp (%s)', now => {
    expect(isBlackFridayHeroActive(now)).toBe(false);
    expect(blackFridayPublicCodeValid(new Date(now))).toBe(false);
  });

  it('can show the notice while automatic coupon application remains disabled', () => {
    const at = new Date('2026-11-25T12:00:00Z');
    expect(isBlackFridayHeroActive(at.getTime())).toBe(true);
    expect(blackFridayPublicCoupon(at, { BLACK_FRIDAY_2026_AUTO_COUPON: 'true' })).toBeNull();
  });
});
