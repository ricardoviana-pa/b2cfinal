import { describe, it, expect } from 'vitest';
import { __testing } from './_core/vite';

describe('PDP search descriptions', () => {
  it('uses the visible English tagline and current name on English routes', () => {
    const result = __testing.PROPERTY_DESCRIPTION.en({ name:'Gerês Gateway', tagline:'Seven suites with a private pool.', destination:'minho', bedrooms:7, maxGuests:14 });
    expect(result.startsWith('Gerês Gateway. Seven suites with a private pool.')).toBe(true);
  });
  it('does not leak untranslated taglines into translated search descriptions', () => {
    for (const [lang, description] of Object.entries(__testing.PROPERTY_DESCRIPTION)) {
      if (lang === 'en') continue;
      const result = description({ name:'Gerês Gateway', tagline:'Seven suites with a private pool.', destination:'minho', bedrooms:7, maxGuests:14 });
      expect(result.startsWith('Gerês Gateway.')).toBe(true);
      expect(result).not.toContain('Seven suites');
      expect(result).toContain('14');
    }
  });
  it('uses property facts when there is no tagline and makes no promise of included paid services', () => {
    const result = __testing.PROPERTY_DESCRIPTION.en({ name:'Test villa', destination:'minho', bedrooms:7, maxGuests:14 });
    expect(result).toContain('7-bedroom');
    expect(result).toContain('14 guests');
    expect(result).not.toMatch(/chef|included|Golden Valley/i);
  });
});
