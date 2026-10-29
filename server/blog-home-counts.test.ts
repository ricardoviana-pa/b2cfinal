import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { OWN_HOME_COUNT, OWN_HOME_COUNT_LABEL } from '../shared/brandFacts';

/* Auditoria 29 out 2026, #174:P1: the body of /{lang}/blog/private-hotel-model
   still said "we do it across fifty private homes" in all 9 languages, next
   to "100+ homes, 70+ run end to end by our own team" on About and Home.
   The paragraph describes what our own team does (housekeeping, maintenance,
   concierge, check-in), so the true figure is the own-team count
   (OWN_HOME_COUNT_LABEL, "70+"), and "we operate every home" is not true of
   the partner homes either. */

const LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
type Lang = (typeof LANGS)[number];
const blog = JSON.parse(fs.readFileSync('client/src/data/blog.json', 'utf8'));
const translations = Object.fromEntries(
  LANGS.filter((l) => l !== 'en').map((l) => [l, JSON.parse(fs.readFileSync(`client/src/data/blog.i18n/${l}.json`, 'utf8'))]),
) as Record<Exclude<Lang, 'en'>, Record<string, any>>;
const post = (lng: Lang, slug = 'private-hotel-model') =>
  lng === 'en' ? blog.articles.find((a: any) => a.slug === slug) : translations[lng][slug];

/** "fifty homes" and friends: a count of fifty homes in any of the 9 languages. */
const FIFTY_HOMES: Record<Lang, RegExp> = {
  en: /\bfifty\s+(?:private\s+)?(?:homes|villas|properties|houses)\b/i,
  pt: /\bcinquenta\s+(?:casas|moradias|propriedades|alojamentos)\b/i,
  fr: /\bcinquante\s+(?:maisons|propriétés|villas|logements)\b|\bune cinquantaine\b/i,
  es: /\bcincuenta\s+(?:casas|villas|propiedades)\b|\bunas cincuenta\b/i,
  it: /\bcinquanta\s+(?:case|ville|proprietà)\b|\buna cinquantina\b/i,
  de: /\bfünfzig\s+(?:private[n]?\s+)?(?:Unterkünfte|Häuser|Villen|Ferienhäuser)\b|\brund fünfzig\b/i,
  nl: /\bvijftig\s+(?:privéwoningen|woningen|huizen|villa's)\b|\bzo'n vijftig\b/i,
  sv: /\bfemtio\s+(?:privata\s+)?(?:hem|villor|hus|bostäder)\b|\bett femtiotal\b/i,
  fi: /viisikymmentä\s+(?:kotia|huvilaa)|viidessäkymmenessä\s+(?:yksityis)?kodissa/i,
};

/** The corrected sentence: more than seventy homes, in each language. */
const MORE_THAN_SEVENTY: Record<Lang, string> = {
  en: 'we do it across more than seventy private homes instead of two hundred rooms',
  pt: 'o fazemos em mais de setenta casas privadas em vez de duzentos quartos',
  fr: 'nous le faisons pour plus de soixante-dix maisons privées au lieu de deux cents chambres',
  es: 'lo hacemos en más de setenta casas privadas en lugar de en doscientas habitaciones',
  it: 'lo facciamo su oltre settanta case private anziché su duecento camere',
  de: 'wir es in mehr als siebzig privaten Unterkünften tun statt in zweihundert Zimmern',
  nl: 'verspreid over meer dan zeventig privéwoningen in plaats van tweehonderd kamers',
  sv: 'vi gör det i fler än sjuttio privata hem i stället för i tvåhundra rum',
  fi: 'teemme sen yli seitsemässäkymmenessä yksityiskodissa kahdensadan huoneen sijaan',
};

/** "When we say we operate EVERY home" — the universal claim, per language. */
const EVERY_HOME: Record<Lang, RegExp> = {
  en: /we operate every home/i,
  pt: /operamos cada casa/i,
  fr: /exploitons chaque maison/i,
  es: /operamos cada casa/i,
  it: /gestiamo ogni casa/i,
  de: /jede Unterkunft betreiben/i,
  nl: /elke woning exploiteren/i,
  sv: /driver varje hem/i,
  fi: /operoivamme jokaista kotia/i,
};

describe('private-hotel-model tells the true number of homes we run (#174:P1)', () => {
  it.each(LANGS)('%s: no "fifty homes", the own-team figure instead', (lng) => {
    const content = post(lng).content as string;
    expect(content).not.toMatch(FIFTY_HOMES[lng]);
    expect(content).toContain(MORE_THAN_SEVENTY[lng]);
  });

  it.each(LANGS)('%s: "we operate a home", not "every home"', (lng) => {
    expect(post(lng).content).not.toMatch(EVERY_HOME[lng]);
  });

  it('"more than seventy" is true of the homes our own team runs', () => {
    // brandFacts rounds down to the ten: "70+". If the own count ever falls to
    // 70 or below, this sentence must change in the 9 languages.
    expect(OWN_HOME_COUNT_LABEL).toBe('70+');
    expect(OWN_HOME_COUNT).toBeGreaterThan(70);
  });

  it('no journal article, in any language, still counts fifty homes', () => {
    const offenders: string[] = [];
    for (const a of blog.articles) {
      for (const f of ['title', 'excerpt', 'content', 'seoTitle', 'seoDescription']) {
        if (FIFTY_HOMES.en.test(a[f] || '')) offenders.push(`en/${a.slug}.${f}`);
      }
    }
    for (const lng of LANGS.filter((l) => l !== 'en') as Exclude<Lang, 'en'>[]) {
      for (const [slug, o] of Object.entries(translations[lng])) {
        for (const f of ['title', 'excerpt', 'content', 'seoTitle', 'seoDescription']) {
          if (FIFTY_HOMES[lng].test((o as any)[f] || '')) offenders.push(`${lng}/${slug}.${f}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
