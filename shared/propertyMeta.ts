/**
 * Title and description of a home's page — one builder for the server (the
 * <title>/meta it injects for every language) AND the client (usePageMeta on
 * the hydrated page and on client-side navigation).
 *
 * The client used to build its own English-only template ("— 4-Bed Luxury
 * Villa Minho"). usePageMeta keeps the server's meta on the first run only, so
 * when the locale overrides arrived and the template changed, every non-English
 * home page swapped its localized title and description for English, in the
 * browser and in Google's renderer (auditoria out/2026, seo-health / ux-pdp-04).
 * Same function, same inputs, same strings: there is nothing left to swap.
 *
 * Inputs are the raw record's facts (name, bedrooms, guests, type, region),
 * which the per-language overrides never touch — so the result is the same
 * before and after the overrides load. Translated taglines are not used: they
 * vary in quality (some are cut paragraphs ending in "…"), and the English
 * route keeps the curated English tagline it always had.
 *
 * The noun comes from the property type, so apartments, the boat and the
 * studios are no longer called "Luxury Villa"; one-bedroom homes get singular
 * forms in every language ("1 chambre", "1 dormitorio", "1 slaapkamer"); and
 * titles shed words (luxury, then the long form of the bedroom count, then
 * the count, then the place) until they fit ~65 characters
 * (seo-health-pdp-title-template). The compact count ("4-Bed", "Villa 4
 * dormitorios", "Villa con 4 camere") keeps the number in most EN, ES and IT
 * titles, which lost it otherwise (review of PR #177).
 */
import { getDisplayName } from './displayName';
import { placePhrases, type PlaceLang } from './regionPhrases';
import { getGroupByParentGuestyId } from '../client/src/config/propertyGroups';

/** Google shows ~600 px of a title; 65 characters is the practical budget. */
export const PROPERTY_TITLE_BUDGET = 65;
const BRAND = ' | Portugal Active';

/** Cut a snippet to `max` characters without leaving half a thought: end on
 *  the last whole sentence when one fills most of the budget, else at a word
 *  boundary with an ellipsis — never mid-word ("e as nossa", auditoria
 *  set/2026). */
export function truncateWords(s: string, max: number): string {
  const clean = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const window = clean.slice(0, max);
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('! '), window.lastIndexOf('? '));
  if (sentenceEnd > max * 0.6) return window.slice(0, sentenceEnd + 1);
  const cut = clean.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,;:–—-]+$/, '') + '…';
}

/** Close a free-text fragment (an imported tagline) with a full stop so the
 *  sentence that follows doesn't run into it ("beach close Book direct"). */
export function asSentence(s: string): string {
  const clean = String(s ?? '').replace(/\s+/g, ' ').trim();
  return !clean || /[.!?…]$/.test(clean) ? clean : `${clean}.`;
}

export type PropertyKind = 'villa' | 'house' | 'apartment' | 'studio' | 'boat' | 'home';

/** Guesty / partner property type → the noun the page may use for it. */
export function propertyKind(propertyType: string | null | undefined): PropertyKind {
  const t = String(propertyType ?? '').trim().toLowerCase();
  if (!t) return 'home';
  if (t === 'villa') return 'villa';
  if (/boat|yacht/.test(t)) return 'boat';
  if (t === 'studio') return 'studio';
  if (/apartment|condo|flat|loft|duplex|penthouse/.test(t)) return 'apartment';
  if (/house|cottage|chalet|cabin|bungalow|farm|lodge|townhouse|quinta|manor/.test(t)) return 'house';
  return 'home';
}

/** Studios and the boat have no bedroom to count in a title. */
const COUNTS_BEDROOMS: Record<PropertyKind, boolean> = {
  villa: true, house: true, apartment: true, home: true, studio: false, boat: false,
};

interface Lexicon {
  /** Noun as it opens a title segment. */
  noun: Record<PropertyKind, string>;
  /** Noun with "luxury", as it opens a title segment. */
  luxury: Record<PropertyKind, string>;
  /** Title segment from its parts (any may be empty). `short` asks for the
   *  compact bedroom count where the language has one ("4-Bed", "4 camere"). */
  title: (p: { head: string; beds: number | null; place: string; short?: boolean }) => string;
  /** Description sentence (no tagline): facts + guests. */
  sentence: (p: { kind: PropertyKind; beds: number | null; place: string; guests: number | null }) => string;
  cta: string;
}

const join = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

const LEX: Record<PlaceLang, Lexicon> = {
  en: {
    noun: { villa: 'Villa', house: 'House', apartment: 'Apartment', studio: 'Studio', boat: 'Boat', home: 'Home' },
    luxury: { villa: 'Luxury Villa', house: 'Luxury House', apartment: 'Luxury Apartment', studio: 'Luxury Studio', boat: 'Luxury Boat', home: 'Luxury Home' },
    title: ({ head, beds, place, short }) => join(beds ? `${beds}-${short ? 'Bed' : 'Bedroom'}` : '', head, place),
    sentence: ({ kind, beds, place, guests }) => {
      const noun = LEX.en.luxury[kind].toLowerCase();
      const s = join(beds ? `${beds}-bedroom` : '', noun, place, guests ? `for up to ${guests} guests` : '');
      return `${s[0].toUpperCase()}${s.slice(1)}.`;
    },
    cta: 'Book direct with Portugal Active.',
  },
  pt: {
    noun: { villa: 'Casa', house: 'Casa', apartment: 'Apartamento', studio: 'Estúdio', boat: 'Barco', home: 'Casa' },
    luxury: { villa: 'Casa de luxo', house: 'Casa de luxo', apartment: 'Apartamento de luxo', studio: 'Estúdio de luxo', boat: 'Barco de luxo', home: 'Casa de luxo' },
    // Portuguese names the typology after the noun: "Casa T4", "Apartamento T1".
    title: ({ head, beds, place }) => join(head, beds ? `T${beds}` : '', place),
    sentence: ({ kind, beds, place, guests }) => `${join(LEX.pt.luxury[kind], beds ? `T${beds}` : '', place, guests ? `para até ${guests} hóspedes` : '')}.`,
    cta: 'Reserve diretamente com a Portugal Active.',
  },
  es: {
    noun: { villa: 'Villa', house: 'Casa', apartment: 'Apartamento', studio: 'Estudio', boat: 'Barco', home: 'Casa' },
    luxury: { villa: 'Villa de lujo', house: 'Casa de lujo', apartment: 'Apartamento de lujo', studio: 'Estudio de lujo', boat: 'Barco de lujo', home: 'Casa de lujo' },
    // Short form, as listings write it: "Villa 4 dormitorios en el Algarve".
    title: ({ head, beds, place, short }) => join(head, beds ? `${short ? '' : 'con '}${beds} ${beds === 1 ? 'dormitorio' : 'dormitorios'}` : '', place),
    sentence: ({ kind, beds, place, guests }) => `${join(LEX.es.luxury[kind], beds ? `con ${beds} ${beds === 1 ? 'dormitorio' : 'dormitorios'}` : '', place, guests ? `para hasta ${guests} huéspedes` : '')}.`,
    cta: 'Reserve directamente con Portugal Active.',
  },
  fr: {
    noun: { villa: 'Villa', house: 'Maison', apartment: 'Appartement', studio: 'Studio', boat: 'Bateau', home: 'Maison' },
    luxury: { villa: 'Villa de luxe', house: 'Maison de luxe', apartment: 'Appartement de luxe', studio: 'Studio de luxe', boat: 'Bateau de luxe', home: 'Maison de luxe' },
    title: ({ head, beds, place }) => join(head, beds ? `${beds} ${beds === 1 ? 'chambre' : 'chambres'}` : '', place),
    sentence: ({ kind, beds, place, guests }) => {
      const s = join(LEX.fr.luxury[kind], beds ? `${beds} ${beds === 1 ? 'chambre' : 'chambres'}` : '', place);
      return guests ? `${s}, jusqu'à ${guests} personnes.` : `${s}.`;
    },
    cta: 'Réservez en direct avec Portugal Active.',
  },
  de: {
    noun: { villa: 'Villa', house: 'Ferienhaus', apartment: 'Ferienwohnung', studio: 'Studio', boat: 'Boot', home: 'Ferienhaus' },
    luxury: { villa: 'Luxusvilla', house: 'Luxus-Ferienhaus', apartment: 'Luxus-Ferienwohnung', studio: 'Luxus-Studio', boat: 'Luxusboot', home: 'Luxus-Ferienhaus' },
    // German compounds the count onto the noun: "4-Schlafzimmer-Luxusvilla".
    title: ({ head, beds, place }) => join(beds && head ? `${beds}-Schlafzimmer-${head}` : head, place),
    sentence: ({ kind, beds, place, guests }) => `${join(LEX.de.luxury[kind], beds ? `mit ${beds} ${beds === 1 ? 'Schlafzimmer' : 'Schlafzimmern'}` : '', place, guests ? `für bis zu ${guests} Gäste` : '')}.`,
    cta: 'Buchen Sie direkt bei Portugal Active.',
  },
  it: {
    noun: { villa: 'Villa', house: 'Casa', apartment: 'Appartamento', studio: 'Monolocale', boat: 'Barca', home: 'Casa' },
    luxury: { villa: 'Villa di lusso', house: 'Casa di lusso', apartment: 'Appartamento di lusso', studio: 'Monolocale di lusso', boat: 'Barca di lusso', home: 'Casa di lusso' },
    // Short form: "Villa con 4 camere" ("camere" alone means bedrooms in a listing).
    title: ({ head, beds, place, short }) => join(head, beds ? `con ${beds} ${beds === 1 ? 'camera' : 'camere'}${short ? '' : ' da letto'}` : '', place),
    sentence: ({ kind, beds, place, guests }) => {
      const s = join(LEX.it.luxury[kind], beds ? `con ${beds} ${beds === 1 ? 'camera da letto' : 'camere da letto'}` : '', place);
      return guests ? `${s}, fino a ${guests} ospiti.` : `${s}.`;
    },
    cta: 'Prenoti direttamente con Portugal Active.',
  },
  nl: {
    noun: { villa: 'Villa', house: 'Vakantiehuis', apartment: 'Appartement', studio: 'Studio', boat: 'Boot', home: 'Vakantiehuis' },
    luxury: { villa: 'Luxevilla', house: 'Luxe vakantiehuis', apartment: 'Luxe appartement', studio: 'Luxe studio', boat: 'Luxe boot', home: 'Luxe vakantiehuis' },
    title: ({ head, beds, place }) => join(head, beds ? `met ${beds} ${beds === 1 ? 'slaapkamer' : 'slaapkamers'}` : '', place),
    sentence: ({ kind, beds, place, guests }) => `${join(LEX.nl.luxury[kind], beds ? `met ${beds} ${beds === 1 ? 'slaapkamer' : 'slaapkamers'}` : '', place, guests ? `voor maximaal ${guests} gasten` : '')}.`,
    cta: 'Boek direct bij Portugal Active.',
  },
  sv: {
    noun: { villa: 'Villa', house: 'Hus', apartment: 'Lägenhet', studio: 'Studio', boat: 'Båt', home: 'Hus' },
    luxury: { villa: 'Lyxvilla', house: 'Lyxhus', apartment: 'Lyxlägenhet', studio: 'Lyxstudio', boat: 'Lyxbåt', home: 'Lyxhus' },
    title: ({ head, beds, place }) => join(head, beds ? `med ${beds} sovrum` : '', place),
    sentence: ({ kind, beds, place, guests }) => `${join(LEX.sv.luxury[kind], beds ? `med ${beds} sovrum` : '', place, guests ? `för upp till ${guests} gäster` : '')}.`,
    cta: 'Boka direkt med Portugal Active.',
  },
  fi: {
    noun: { villa: 'Huvila', house: 'Talo', apartment: 'Huoneisto', studio: 'Studio', boat: 'Vene', home: 'Koti' },
    luxury: { villa: 'Luksushuvila', house: 'Luksustalo', apartment: 'Luksushuoneisto', studio: 'Luksusstudio', boat: 'Luksusvene', home: 'Luksuskoti' },
    // "4 makuuhuoneen luksushuvila Algarvessa" — the count leads, in genitive.
    title: ({ head, beds, place }) => join(beds && head ? `${beds} makuuhuoneen ${head.toLowerCase()}` : head, place),
    sentence: ({ kind, beds, place, guests }) => {
      const head = LEX.fi.luxury[kind];
      const s = join(beds ? `${beds} makuuhuoneen ${head.toLowerCase()}` : head, place);
      return guests ? `${s}, enintään ${guests} hengelle.` : `${s}.`;
    },
    cta: 'Varaa suoraan Portugal Activesta.',
  },
};

function lexFor(lang: string | undefined): { lang: PlaceLang; lex: Lexicon } {
  const l = (lang || 'en').toLowerCase().split('-')[0] as PlaceLang;
  return LEX[l] ? { lang: l, lex: LEX[l] } : { lang: 'en', lex: LEX.en };
}

export interface PropertyMetaInput {
  name: string;
  bedrooms?: number | null;
  maxGuests?: number | null;
  /** Destination slug ("minho", "algarve"…) or, failing that, a place name. */
  destination?: string | null;
  propertyType?: string | null;
  /** English only: the curated tagline leads the description. */
  tagline?: string | null;
}

const positive = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null);

/** Which words a title segment keeps: "luxury", the bedroom count (in full
 *  or, where the language has one, compact) and the place. */
export interface TitleVariant { luxury?: boolean; beds?: boolean; shortBeds?: boolean; place?: boolean }

/** "4-Bedroom Luxury Villa in the Algarve" — the segment between name and brand. */
export function propertyKindPhrase(lang: string | undefined, input: Omit<PropertyMetaInput, 'name' | 'tagline'>, opts: TitleVariant = {}): string {
  const { lang: l, lex } = lexFor(lang);
  const kind = propertyKind(input.propertyType);
  const beds = opts.beds === false || !COUNTS_BEDROOMS[kind] ? null : positive(input.bedrooms);
  const place = opts.place === false || !input.destination ? '' : placePhrases(input.destination, l).in;
  const head = opts.luxury === false ? lex.noun[kind] : lex.luxury[kind];
  return lex.title({ head, beds, place, short: opts.shortBeds === true });
}

/** The luxury noun and place as they read mid-sentence — "luxury villa in
 *  the Minho", "casa de luxo no Minho", "Luxusvilla an der Algarve" (German
 *  keeps its capital). Photo alt text uses it. */
export function propertyKindInline(lang: string | undefined, input: Pick<PropertyMetaInput, 'propertyType' | 'destination'>): string {
  const { lang: l, lex } = lexFor(lang);
  const lux = lex.luxury[propertyKind(input.propertyType)];
  const noun = l === 'de' ? lux : l === 'en' ? lux.toLowerCase() : `${lux[0].toLowerCase()}${lux.slice(1)}`;
  const place = input.destination ? placePhrases(input.destination, l).in : '';
  return join(noun, place);
}

/**
 * <title> of a home's page: "{name} | {segment} | Portugal Active", with the
 * segment shortened until the whole fits PROPERTY_TITLE_BUDGET (or as short
 * as it gets when the name alone is long).
 */
export function propertyTitle(lang: string | undefined, input: PropertyMetaInput): string {
  // The compact count ("4-Bed", "4 dormitorios", "con 4 camere") is tried
  // before the count is given up; languages without one repeat the full form.
  const variants: Array<TitleVariant | null> = [
    {},
    { luxury: false },
    { luxury: false, shortBeds: true },
    { luxury: false, beds: false },
    { luxury: false, place: false },
    { luxury: false, shortBeds: true, place: false },
    { luxury: false, beds: false, place: false },
    null,
  ];
  const name = input.name.trim();
  let last = `${name}${BRAND}`;
  for (const v of variants) {
    const segment = v ? propertyKindPhrase(lang, input, v) : '';
    const title = segment ? `${name} | ${segment}${BRAND}` : `${name}${BRAND}`;
    last = title;
    if (title.length <= PROPERTY_TITLE_BUDGET) return title;
  }
  return last;
}

/** Meta description: "{name}. {facts or English tagline} {call to action}",
 *  cut by words at 155 characters. */
export function propertyDescription(lang: string | undefined, input: PropertyMetaInput): string {
  const { lang: l, lex } = lexFor(lang);
  const kind = propertyKind(input.propertyType);
  const beds = COUNTS_BEDROOMS[kind] ? positive(input.bedrooms) : null;
  const place = input.destination ? placePhrases(input.destination, l).in : '';
  const facts = lex.sentence({ kind, beds, place, guests: positive(input.maxGuests) });
  // Imported taglines are English; only the English route may lead with one.
  const base = (l === 'en' && input.tagline && asSentence(input.tagline)) || facts;
  return `${input.name.trim()}. ${base} ${lex.cta}`;
}

/** Per-language builders, keyed like the old server tables (tests use them). */
export const PROPERTY_TITLE: Record<PlaceLang, (p: PropertyMetaInput) => string> =
  Object.fromEntries((Object.keys(LEX) as PlaceLang[]).map(l => [l, (p: PropertyMetaInput) => propertyTitle(l, p)])) as Record<PlaceLang, (p: PropertyMetaInput) => string>;
export const PROPERTY_DESCRIPTION: Record<PlaceLang, (p: PropertyMetaInput) => string> =
  Object.fromEntries((Object.keys(LEX) as PlaceLang[]).map(l => [l, (p: PropertyMetaInput) => propertyDescription(l, p)])) as Record<PlaceLang, (p: PropertyMetaInput) => string>;

/** The name a home's page shows: the group name on a multi-unit parent
 *  ("Quinta de Parada do Vez"), else the curated display name. */
export function propertyPageName(prop: { name?: string | null; slug?: string | null; id?: unknown; guestyId?: string | null }): string {
  const group = prop.guestyId ? getGroupByParentGuestyId(prop.guestyId) : null;
  return group?.name ?? getDisplayName(prop as any);
}

export interface PropertyPageMeta {
  title: string;
  description: string;
  image?: string;
  /** Path without the locale prefix: "/homes/<slug>". */
  path: string;
}

/** Everything usePageMeta and the server's injectMeta need for a home. */
export function propertyPageMeta(prop: any, lang: string | undefined): PropertyPageMeta {
  const name = propertyPageName(prop);
  const input: PropertyMetaInput = {
    name,
    bedrooms: prop?.bedrooms,
    maxGuests: prop?.maxGuests,
    destination: prop?.destination || prop?.locality || prop?.region || null,
    propertyType: prop?.propertyType,
    tagline: prop?.tagline,
  };
  const image = Array.isArray(prop?.images) && prop.images.length > 0 ? prop.images[0] : undefined;
  return {
    title: propertyTitle(lang, input),
    description: truncateWords(propertyDescription(lang, input), 155),
    image,
    path: `/homes/${prop?.slug}`,
  };
}
