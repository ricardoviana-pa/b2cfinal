import { describe, expect, it } from 'vitest';
import { __testing } from './_core/vite';

const { truncateWords, asSentence, PROPERTY_DESCRIPTION } = __testing;

describe('meta descriptions end on a whole thought', () => {
  it('never cuts mid-word (the /pt/destinations/minho "e as nossa" case)', () => {
    const long = 'O Minho é o canto verde do norte de Portugal, com praias atlânticas, vinho verde, aldeias de granito e as nossas casas privadas com serviço de hotel e concierge dedicado.';
    const out = truncateWords(long, 155);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out).not.toMatch(/nossa$/);
    expect(out).toMatch(/[.…]$/);
    expect(long.startsWith(out.replace(/…$/, ''))).toBe(true);
  });

  it('prefers ending on the last full sentence when it fills most of the budget', () => {
    const text = 'Casa de luxo T4 em Viana do Castelo para até 10 hóspedes, com piscina aquecida e vista para o rio Lima. Reserve diretamente com a Portugal Active hoje mesmo.';
    expect(text.length).toBeGreaterThan(155);
    expect(truncateWords(text, 155)).toBe('Casa de luxo T4 em Viana do Castelo para até 10 hóspedes, com piscina aquecida e vista para o rio Lima.');
  });

  it('leaves short text alone', () => {
    expect(truncateWords('  Villas  in Porto. ', 155)).toBe('Villas in Porto.');
  });

  it('closes an unpunctuated tagline before the call to action (the "beach close Book direct" case)', () => {
    expect(asSentence('Sea views, beach close')).toBe('Sea views, beach close.');
    expect(asSentence('Already done!')).toBe('Already done!');
    const en = PROPERTY_DESCRIPTION.en({ name: '4 Serras', tagline: 'Mountain retreat, beach close', bedrooms: 4, maxGuests: 8, destination: 'minho' });
    expect(en).toContain('beach close. Book direct');
  });
});
