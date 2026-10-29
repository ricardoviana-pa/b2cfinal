/**
 * Region names inside sentences — one table for the client AND the server.
 *
 * Interpolating a bare region name after a fixed preposition produced
 * "Casas em Algarve", "Maisons à Minho", "Häuser in Algarve" and
 * "Die beste Reisezeit für Algarve" (auditoria out/2026, i18n-copy-08). Each
 * language attaches its own article and preposition to each place, so the
 * phrase is stored whole, per place and per language:
 *
 *   - `the` — the name as a noun phrase, with the article the language uses
 *     ("o Algarve", "l'Algarve", "die Algarve", "the Algarve"). German holds
 *     the accusative here ("für den Minho"), the only case our strings need.
 *   - `in`  — where something is ("no Algarve", "en Algarve", "an der Algarve").
 *   - `to`  — where someone goes ("ao Algarve", "en Algarve", "an die Algarve").
 *
 * Phrases are templates on {name}, so a page can pass the name it shows (the
 * destination's localized display name, e.g. "Vallée du Douro") and keep the
 * article/preposition right. Finnish inflects the noun itself, so its phrases
 * are written out whole and ignore the passed name; our Finnish strings use
 * "kohteessa {{name}}" constructions and stay as they are.
 */

export const PLACE_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
export type PlaceLang = (typeof PLACE_LANGS)[number];

interface PlaceForms {
  /** Default name for titles and meta, when the caller has none. */
  name: string;
  the: string;
  in: string;
  to: string;
}

type PlaceTable = Record<string, Partial<Record<PlaceLang, PlaceForms>>>;

const f = (name: string, the: string, inn: string, to: string): PlaceForms => ({ name, the, in: inn, to });
/** A town or city: no article, plain prepositions. */
const town = (lang: PlaceLang, name: string): PlaceForms => {
  switch (lang) {
    case 'en': return f(name, '{name}', 'in {name}', 'to {name}');
    case 'pt': return f(name, '{name}', 'em {name}', 'a {name}');
    case 'fr': return f(name, '{name}', 'à {name}', 'à {name}');
    case 'es': return f(name, '{name}', 'en {name}', 'a {name}');
    case 'it': return f(name, '{name}', 'a {name}', 'a {name}');
    case 'de': return f(name, '{name}', 'in {name}', 'nach {name}');
    case 'nl': return f(name, '{name}', 'in {name}', 'naar {name}');
    case 'sv': return f(name, '{name}', 'i {name}', 'till {name}');
    case 'fi': return f(name, '{name}', `kohteessa {name}`, `kohteeseen {name}`);
  }
};
const towns = (name: string, fi?: { in: string; to: string }): Partial<Record<PlaceLang, PlaceForms>> => {
  const out: Partial<Record<PlaceLang, PlaceForms>> = {};
  for (const l of PLACE_LANGS) out[l] = town(l, name);
  if (fi) out.fi = f(name, name, fi.in, fi.to);
  return out;
};

const PLACES: PlaceTable = {
  minho: {
    en: f('Minho', 'the {name}', 'in the {name}', 'to the {name}'),
    pt: f('Minho', 'o {name}', 'no {name}', 'ao {name}'),
    fr: f('Minho', 'le {name}', 'dans le {name}', 'dans le {name}'),
    es: f('Miño', 'el {name}', 'en el {name}', 'al {name}'),
    it: f('Minho', 'il {name}', 'nel {name}', 'nel {name}'),
    de: f('Minho', 'den {name}', 'im {name}', 'in den {name}'),
    nl: f('Minho', '{name}', 'in {name}', 'naar {name}'),
    sv: f('Minho', '{name}', 'i {name}', 'till {name}'),
    fi: f('Minho', 'Minho', 'Minhossa', 'Minhoon'),
  },
  'viana-do-castelo': towns('Viana do Castelo', { in: 'Viana do Castelossa', to: 'Viana do Casteloon' }),
  caminha: towns('Caminha', { in: 'Caminhassa', to: 'Caminhaan' }),
  esposende: towns('Esposende', { in: 'Esposendessa', to: 'Esposendeen' }),
  porto: {
    ...towns('Porto', { in: 'Portossa', to: 'Portoon' }),
    // The city and the district: "no Porto", like "o Porto" in speech.
    pt: f('Porto', 'o {name}', 'no {name}', 'ao {name}'),
  },
  douro: {
    en: f('Douro', 'the {name}', 'in the {name}', 'to the {name}'),
    pt: f('Douro', 'o {name}', 'no {name}', 'ao {name}'),
    fr: f('Vallée du Douro', 'la {name}', 'dans la {name}', 'dans la {name}'),
    es: f('Valle del Douro', 'el {name}', 'en el {name}', 'al {name}'),
    it: f('Valle del Douro', 'la {name}', 'nella {name}', 'nella {name}'),
    de: f('Douro-Tal', 'das {name}', 'im {name}', 'ins {name}'),
    nl: f('Dourodal', 'het {name}', 'in het {name}', 'naar het {name}'),
    sv: f('Dourodalen', '{name}', 'i {name}', 'till {name}'),
    fi: f('Douron laakso', 'Douron laakso', 'Douron laaksossa', 'Douron laaksoon'),
  },
  lisbon: {
    en: town('en', 'Lisbon'),
    pt: town('pt', 'Lisboa'),
    fr: town('fr', 'Lisbonne'),
    es: town('es', 'Lisboa'),
    it: town('it', 'Lisbona'),
    de: town('de', 'Lissabon'),
    nl: town('nl', 'Lissabon'),
    sv: town('sv', 'Lissabon'),
    fi: f('Lissabon', 'Lissabon', 'Lissabonissa', 'Lissaboniin'),
  },
  alentejo: {
    en: f('Alentejo', 'the {name}', 'in the {name}', 'to the {name}'),
    pt: f('Alentejo', 'o {name}', 'no {name}', 'ao {name}'),
    fr: f('Alentejo', "l'{name}", 'en {name}', 'en {name}'),
    es: f('Alentejo', 'el {name}', 'en el {name}', 'al {name}'),
    it: f('Alentejo', "l'{name}", 'in {name}', 'in {name}'),
    de: f('Alentejo', 'den {name}', 'im {name}', 'in den {name}'),
    nl: f('Alentejo', 'de {name}', 'in de {name}', 'naar de {name}'),
    sv: f('Alentejo', '{name}', 'i {name}', 'till {name}'),
    fi: f('Alentejo', 'Alentejo', 'Alentejossa', 'Alentejoon'),
  },
  algarve: {
    en: f('Algarve', 'the {name}', 'in the {name}', 'to the {name}'),
    pt: f('Algarve', 'o {name}', 'no {name}', 'ao {name}'),
    fr: f('Algarve', "l'{name}", 'en {name}', 'en {name}'),
    es: f('Algarve', 'el {name}', 'en el {name}', 'al {name}'),
    it: f('Algarve', "l'{name}", 'in {name}', 'in {name}'),
    de: f('Algarve', 'die {name}', 'an der {name}', 'an die {name}'),
    nl: f('Algarve', 'de {name}', 'in de {name}', 'naar de {name}'),
    sv: f('Algarve', '{name}', 'i {name}', 'till {name}'),
    fi: f('Algarve', 'Algarve', 'Algarvessa', 'Algarveen'),
  },
  'silver-coast': {
    en: f('Silver Coast', 'the {name}', 'on the {name}', 'to the {name}'),
    pt: f('Costa de Prata', 'a {name}', 'na {name}', 'à {name}'),
    fr: f('Costa de Prata', 'la {name}', 'sur la {name}', 'sur la {name}'),
    es: f('Costa de Plata', 'la {name}', 'en la {name}', 'a la {name}'),
    it: f("Costa d'Argento", 'la {name}', 'sulla {name}', 'sulla {name}'),
    de: f('Silberküste', 'die {name}', 'an der {name}', 'an die {name}'),
    nl: f('Zilverkust', 'de {name}', 'aan de {name}', 'naar de {name}'),
    sv: f('Silverkusten', '{name}', 'vid {name}', 'till {name}'),
    fi: f('Hopearannikko', 'Hopearannikko', 'Hopearannikolla', 'Hopearannikolle'),
  },
  comporta: {
    ...towns('Comporta', { in: 'Comportassa', to: 'Comportaan' }),
    pt: f('Comporta', 'a {name}', 'na {name}', 'à {name}'),
  },
  brazil: {
    en: town('en', 'Brazil'),
    pt: f('Brasil', 'o {name}', 'no {name}', 'ao {name}'),
    fr: f('Brésil', 'le {name}', 'au {name}', 'au {name}'),
    es: town('es', 'Brasil'),
    it: f('Brasile', 'il {name}', 'in {name}', 'in {name}'),
    de: town('de', 'Brasilien'),
    nl: town('nl', 'Brazilië'),
    sv: town('sv', 'Brasilien'),
    fi: f('Brasilia', 'Brasilia', 'Brasiliassa', 'Brasiliaan'),
  },
};

/** Names a page may show for a place, in any language → its key above. The
 *  concierge table names its bases ("Lisboa", "Comporta"), not slugs. */
const NAME_TO_SLUG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [slug, langs] of Object.entries(PLACES)) {
    out[slug] = slug;
    for (const forms of Object.values(langs)) if (forms) out[forms.name.toLowerCase()] = slug;
  }
  Object.assign(out, {
    lisboa: 'lisbon', lisbonne: 'lisbon', lisbona: 'lisbon', lissabon: 'lisbon',
    'miño': 'minho', 'minho coast': 'minho', 'costa do minho': 'minho',
    'douro valley': 'douro', 'vale do douro': 'douro', 'vallée du douro': 'douro',
    'valle del douro': 'douro', 'douro-tal': 'douro', dourodal: 'douro', dourodalen: 'douro',
    'costa de prata': 'silver-coast',
  });
  return out;
})();

function langOf(lang: string | undefined): PlaceLang {
  const l = (lang || 'en').toLowerCase().split('-')[0];
  return (PLACE_LANGS as readonly string[]).includes(l) ? (l as PlaceLang) : 'en';
}

/** Resolve a destination slug or a shown place name to its table key. */
export function placeKey(slugOrName: string | null | undefined): string | null {
  if (!slugOrName) return null;
  return NAME_TO_SLUG[String(slugOrName).trim().toLowerCase()] ?? null;
}

/** Title-cased fallback for an unknown slug ("silver-coast" → "Silver Coast"). */
function humanize(s: string): string {
  return s.includes('-') || s === s.toLowerCase()
    ? s.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
    : s;
}

export interface PlacePhrases {
  /** The name, as passed or the table default. */
  name: string;
  /** With article ("o Algarve", "the Algarve"). */
  the: string;
  /** Locative ("no Algarve", "in the Algarve"). */
  in: string;
  /** Directional ("ao Algarve", "to the Algarve"). */
  to: string;
}

/**
 * Phrases for a place in a language.
 *
 * @param slugOrName destination slug ("algarve") or a known name ("Lisboa")
 * @param lang       page language; anything else falls back to English
 * @param shownName  the name the page displays, kept inside the phrase
 */
export function placePhrases(slugOrName: string | null | undefined, lang: string | undefined, shownName?: string | null): PlacePhrases {
  const l = langOf(lang);
  const key = placeKey(slugOrName);
  const forms = key ? (PLACES[key]?.[l] ?? PLACES[key]?.en) : undefined;
  const raw = String(slugOrName ?? '').trim();
  const name = (shownName && shownName.trim()) || forms?.name || humanize(raw);
  const tpl = forms ?? town(l, name);
  // Finnish phrases are whole words (inflected); they only take a passed
  // name when there is no table entry.
  const fill = (s: string) => s.replace(/\{name\}/g, name);
  return { name, the: fill(tpl.the), in: fill(tpl.in), to: fill(tpl.to) };
}

/** i18next interpolation values for strings that place a region in a
 *  sentence: {{inPlace}}, {{toPlace}}, {{thePlace}}. */
export function placeVars(slugOrName: string | null | undefined, lang: string | undefined, shownName?: string | null): { inPlace: string; toPlace: string; thePlace: string } {
  const p = placePhrases(slugOrName, lang, shownName);
  return { inPlace: p.in, toPlace: p.to, thePlace: p.the };
}

/** Upper-case the first letter (for a phrase opening a sentence or title). */
export function capitalizeFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
