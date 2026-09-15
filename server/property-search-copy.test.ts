import { describe, it, expect } from 'vitest';
import { __testing } from './_core/vite';

describe('PDP search descriptions', () => {
  it('leads with the current name and visible tagline in every supported language', () => {
    for (const description of Object.values(__testing.PROPERTY_DESCRIPTION)) {
      const result = description({ name:'Gerês Gateway', tagline:'Seven suites with a private pool.', destination:'minho', bedrooms:7, maxGuests:14 });
      expect(result.startsWith('Gerês Gateway. Seven suites with a private pool.')).toBe(true);
    }
  });
  it('uses property facts when there is no tagline and makes no promise of included paid services', () => {
    const result = __testing.PROPERTY_DESCRIPTION.en({ name:'Test villa', destination:'minho', bedrooms:7, maxGuests:14 });
    expect(result).toContain('7-bedroom');
    expect(result).toContain('14 guests');
    expect(result).not.toMatch(/chef|included|Golden Valley/i);
  });
});
