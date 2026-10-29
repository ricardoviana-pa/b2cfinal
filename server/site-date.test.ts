import { afterEach, describe, expect, it } from 'vitest';
import { formatSiteDate, SITE_TIME_ZONE } from '../shared/siteDate';

/* Auditoria 29 out 2026, Regression:P1: the server renders in UTC and the
   browser hydrates in the visitor's zone. Dates formatted in the browser's
   zone came out a day early on /en/blog for the Americas (and the Azores in
   winter) and React threw #418. formatSiteDate must print the same text in
   every zone; the tests run the formatter under each zone for real (Node
   honours a runtime change of process.env.TZ, the control test proves it). */

const ZONES = [
  'UTC', 'Europe/Lisbon', 'Atlantic/Azores', 'Europe/Helsinki', 'America/New_York', 'America/Los_Angeles',
  'America/Sao_Paulo', 'Pacific/Honolulu', 'Asia/Tokyo', 'Pacific/Auckland', 'Pacific/Kiritimati',
];
const ORIGINAL_TZ = process.env.TZ;

function inZone<T>(tz: string, run: () => T): T {
  process.env.TZ = tz;
  return run();
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

const DAY = { day: 'numeric', month: 'short', year: 'numeric' } as const;
const MONTH = { month: 'short', year: 'numeric' } as const;

describe('formatSiteDate: the same text on the server and in every browser zone', () => {
  it('control: the old browser-zone formatting really moves the day (the bug)', () => {
    const naive = () => new Date('2026-10-14').toLocaleDateString('en', DAY);
    expect(inZone('UTC', naive)).toBe('Oct 14, 2026');
    expect(inZone('America/New_York', naive)).toBe('Oct 13, 2026');
    // Portuguese visitors in the Azores (UTC-1 in winter) saw the winter posts a day early.
    expect(inZone('Atlantic/Azores', () => new Date('2023-03-17').toLocaleDateString('pt', DAY))).toBe('16 de mar. de 2023');
  });

  it.each(ZONES)('a publish date prints as written in %s', (tz) => {
    inZone(tz, () => {
      expect(formatSiteDate('2026-10-14', 'en', DAY)).toBe('Oct 14, 2026');
      expect(formatSiteDate('2026-10-14', 'pt', DAY)).toBe('14 de out. de 2026');
      expect(formatSiteDate('2023-03-17', 'pt', DAY)).toBe('17 de mar. de 2023');
      expect(formatSiteDate('2026-03-30', 'de', { day: 'numeric', month: 'long', year: 'numeric' })).toBe('30. März 2026');
    });
  });

  it.each(ZONES)('a review month never slides into the previous one in %s', (tz) => {
    inZone(tz, () => {
      // reviews.json stores "YYYY-MM"; ExperienceDetail's legacy reviews "2023-01-01".
      expect(formatSiteDate('2025-08', 'en', MONTH)).toBe('Aug 2025');
      expect(formatSiteDate('2023-01-01', 'en', MONTH)).toBe('Jan 2023');
      // Any language: the month of the 1st is the month written, never the one before.
      const june = new Intl.DateTimeFormat('fi', { ...MONTH, timeZone: 'UTC' }).format(Date.UTC(2025, 5, 15));
      expect(formatSiteDate('2025-06-01', 'fi', MONTH)).toBe(june);
    });
  });

  it.each(ZONES)('an instant (a Guesty review timestamp) is read in Lisbon time in %s', (tz) => {
    inZone(tz, () => {
      // 21:27 UTC on 31 July is still July in Lisbon; Helsinki and Tokyo browsers printed August.
      expect(formatSiteDate('2026-07-31T21:27:33.174Z', 'en', MONTH)).toBe('Jul 2026');
      // 23:30 UTC on 31 July is already 1 August in Lisbon (summer time).
      expect(formatSiteDate('2026-07-31T23:30:00.000Z', 'en', MONTH)).toBe('Aug 2026');
    });
    expect(SITE_TIME_ZONE).toBe('Europe/Lisbon');
  });

  it('prints nothing for a missing or impossible date, and survives a bad language tag', () => {
    expect(formatSiteDate('', 'en', DAY)).toBe('');
    expect(formatSiteDate(null, 'en', DAY)).toBe('');
    expect(formatSiteDate(undefined, 'en', DAY)).toBe('');
    expect(formatSiteDate('not a date', 'en', DAY)).toBe('');
    expect(formatSiteDate('2026-02-31', 'en', DAY)).toBe('');
    expect(formatSiteDate('2026-13', 'en', MONTH)).toBe('');
    expect(formatSiteDate('2026-10-14', 'en_US', DAY)).toBe('Oct 14, 2026');
    expect(formatSiteDate('2026-10-14', null, DAY)).toBe('Oct 14, 2026');
  });
});
