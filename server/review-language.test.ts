import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createInstance, type TFunction } from 'i18next';
import { detectReviewLanguage } from './services/review-language';
import { recentGuestFeedback } from './services/property-catalog';
import { languageName, reviewLanguageLabel } from '@/lib/reviewLanguage';
import en from '../client/src/i18n/locales/en.json';
import pt from '../client/src/i18n/locales/pt.json';
import de from '../client/src/i18n/locales/de.json';
import fi from '../client/src/i18n/locales/fi.json';

// Auditoria 29 out, ux-home-plp-07: homepage reviews in the page language
// first; a review in another language says which.

describe('review language', () => {
  // The 20 reviews production served on the homepage on 29 Oct.
  const served: Array<[string, string | null]> = [
    ['Appartement propre et très bien situé pour visiter Porto à pied.', 'fr'],
    ['Beautiful place, host were very helpful and responsive. Definitely recommend Portugal active.', 'en'],
    ['Everything went very well during our stay. We had a great experience and left happy. Thank you!', 'en'],
    ['Disfrutamos de unos días muy agradables. El apartamento está muy bien situado. Ahí aparcamos.', 'es'],
    ['Lugar tranquilo y con zonas cercanas para disfrutar, la casa con todas las comodidades', 'es'],
    ['O espaço era exatamente o que o anúncio descrevia, numa zona ótima para ir a pé até à praia.', 'pt'],
    ['Muito boa localização, perto da praia e de restaurantes. A casa é bem confortável e equipada.', 'pt'],
    ['Estadia perfeita', 'pt'],
    ['Das Wohnzimmer war etwas kleiner als erwartet. Jedoch passen und funktional.', 'de'],
    ['Ein sehr sauberes schönes Haus mit Aussicht auf das Meer.', 'de'],
    ['Logement très agréable et bien équipé. La literie est très confortable.', 'fr'],
    ['We loved the house! Will be back again.', 'en'],
    ['Zeer mooi appartement, heel mooi ingericht. Het appartement was heel proper.', 'nl'],
    ['Otroligt, stort fint hus med fantastiskt läge. Vi kommer gärna tillbaka!', 'sv'],
  ];

  it('recognises the languages of real guest reviews', () => {
    for (const [text, lang] of served) expect(detectReviewLanguage(text), text).toBe(lang);
  });

  it('says nothing rather than something wrong: other languages, emoji, one word', () => {
    expect(detectReviewLanguage('Było świetnie- miejsce jest piękne i bardzo wygodne.')).toBeNull(); // Polish, not Italian
    expect(detectReviewLanguage('Vidunderligt sted! Vi havde den dejligste uge med vores børn.')).toBeNull(); // Danish, not Swedish
    expect(detectReviewLanguage('прекрасное тихое место')).toBeNull();
    expect(detectReviewLanguage('👍🏼')).toBeNull();
    expect(detectReviewLanguage('Excelente!')).toBeNull();
    expect(detectReviewLanguage(undefined)).toBeNull();
  });
});

describe('homepage review order', () => {
  const home = (slug: string, reviews: Array<{ text: string; date: string }>) => ({
    slug, reviews: reviews.map((r) => ({ ...r, rating: 5, guestName: 'Ana Silva' })),
  });
  const homes = [
    home('fr-newest', [{ text: 'Logement très agréable et bien équipé. La literie est très confortable.', date: '2026-10-20' }]),
    home('en-home', [{ text: 'We loved the house and the pool, everything was perfect for our family.', date: '2026-10-10' }]),
    home('pt-short', [{ text: 'Estadia perfeita', date: '2026-10-18' }]),
    home('pt-long', [{ text: 'A casa é muito bonita e confortável, recomendo a todos os amigos que procuram sossego.', date: '2026-09-01' }]),
    home('mixed', [
      { text: 'Great stay, the hosts were very helpful and the house was spotless.', date: '2026-10-15' },
      { text: 'Gostámos muito da casa e da piscina, voltaremos com a família no próximo verão.', date: '2026-08-01' },
    ]),
  ];

  it('puts the page language first, then English, then the rest; longer before two-word reviews', () => {
    const pt = recentGuestFeedback(homes, 'pt');
    expect(pt.map((r) => `${r.property.slug}:${r.language}`)).toEqual([
      'pt-long:pt', 'mixed:pt', 'pt-short:pt', 'en-home:en', 'fr-newest:fr',
    ]);
    const en = recentGuestFeedback(homes, 'en');
    expect(en.slice(0, 2).map((r) => r.property.slug)).toEqual(['mixed', 'en-home']);
    expect(en.find((r) => r.property.slug === 'mixed')?.language).toBe('en');
  });

  it('without a page language keeps the newest review per home, as before', () => {
    expect(recentGuestFeedback(homes).map((r) => r.property.slug)).toEqual(['fr-newest', 'pt-short', 'mixed', 'en-home', 'pt-long']);
  });

  it('never leaks the sort keys', () => {
    expect(Object.keys(recentGuestFeedback(homes, 'de')[0]).sort()).toEqual(['date', 'guestName', 'language', 'property', 'rating', 'text']);
  });
});

describe('"Written in …" label', () => {
  async function tFor(lng: string): Promise<TFunction> {
    const i18n = createInstance();
    await i18n.init({ lng, fallbackLng: 'en', resources: { en: { translation: en }, pt: { translation: pt }, de: { translation: de }, fi: { translation: fi } }, interpolation: { escapeValue: false } });
    return i18n.t;
  }

  it('names the language in the page language', async () => {
    expect(reviewLanguageLabel(await tFor('en'), 'en', 'fr')).toBe('Written in French');
    expect(reviewLanguageLabel(await tFor('pt'), 'pt', 'en')).toBe('Escrito em inglês');
    expect(reviewLanguageLabel(await tFor('de'), 'de', 'pt')).toBe('Auf Portugiesisch verfasst');
    expect(reviewLanguageLabel(await tFor('fi'), 'fi', 'en')).toBe('Kieli: englanti');
    expect(languageName('xx-invalid-!', 'en')).toBe('XX-INVALID-!');
  });

  it('the homepage asks for its own language and marks the quote with lang', () => {
    const src = fs.readFileSync(new URL('../client/src/components/property/GuestFeedback.tsx', import.meta.url), 'utf8');
    expect(src).toMatch(/guestFeedback\.useQuery\(\{ locale: pageLang \}/);
    expect(src).toMatch(/r\.language && r\.language !== pageLang/);
    expect(src).toMatch(/<blockquote lang=\{r\.language \?\? undefined\}/);
  });

  it('the server render seeds the same query key (page language) so the reviews hydrate without a refetch', () => {
    const vite = fs.readFileSync(new URL('./_core/vite.ts', import.meta.url), 'utf8');
    const entry = fs.readFileSync(new URL('../client/src/entry-server.tsx', import.meta.url), 'utf8');
    expect(vite).toMatch(/guestFeedback: \{ input: \{ locale: lang \}, data: recentGuestFeedback\(properties, lang\) \}/);
    expect(entry).toMatch(/getQueryKey\(trpc\.properties\.guestFeedback, pf\.guestFeedback\.input, 'query'\)/);
  });
});
