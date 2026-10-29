/**
 * Which of the site's languages a guest review is written in — good enough to
 * put reviews in the page language first and label the others (auditoria 29
 * out, ux-home-plp-07). Reviews arrive from Guesty/Airbnb with no language.
 *
 * Function words decide (they carry the language even in a ten-word review),
 * with a few letters only one or two of these languages use as a tie-breaker.
 * When the text doesn't clearly lean one way the answer is null and nothing is
 * labelled: a wrong label is worse than none.
 */
export const REVIEW_LANGUAGES = ['en', 'pt', 'fr', 'es', 'it', 'de', 'nl', 'sv', 'fi'] as const;
export type ReviewLanguage = (typeof REVIEW_LANGUAGES)[number];

const WORDS: Record<ReviewLanguage, string> = {
  en: 'the and was were is are to of we our us very with for it this that you they had have has great lovely stay place house home highly recommend everything beautiful nice amazing perfect would again definitely clean host hosts thank thanks really just like loved enjoyed',
  pt: 'o os as e é foi de do da dos das em no na nos nas um uma muito muita com para que não casa tudo estadia recomendo lugar excelente ótimo ótima bem mais nós também sem mas espaço perfeita perfeito incrível agradável voltar limpo limpa localização ficámos ficamos gostámos adorámos simpático equipa',
  fr: 'le la les et est était de des du en un une très avec pour que pas maison tout séjour recommande lieu bien plus nous aussi sans mais logement appartement au aux à il elle ont avons été propre agréable merci vraiment situé',
  es: 'el la los las y es fue de del en un una muy con para que no casa todo estancia recomiendo lugar excelente bien más nos nosotros también sin pero está estaba apartamento ubicación limpio limpia gracias disfrutamos hemos fuimos',
  it: 'il lo la i gli le e è era di del della dei in un una molto con per che non casa tutto soggiorno consiglio posto bene più ci anche senza ma abbiamo siamo stato stata pulito pulita grazie accogliente bellissima ottimo ottima',
  de: 'der die das und ist war zu den dem des ein eine einen sehr mit für nicht haus alles aufenthalt wir uns auch ohne aber schön sauber gut es auf im an wohnung gerne wieder toll war waren hatten haben vielen dank lage',
  nl: 'de het een en is was van in op met voor niet huis alles verblijf wij we ons ook zeer heel mooi schoon goed er te maar zijn hebben waren genoten bedankt prachtig fijn',
  sv: 'och är var att det den en ett med för inte huset allt vistelse vi oss också mycket fint rent bra på av som men har hade tack trevligt underbart',
  fi: 'ja on oli että se talo kaikki oleskelu me meidän myös erittäin hyvin kaunis siisti hyvä todella kiitos paikka mukava ihana',
};

const LEXICON = new Map<string, ReviewLanguage[]>();
for (const lang of REVIEW_LANGUAGES) {
  for (const w of WORDS[lang].split(/\s+/)) {
    const list = LEXICON.get(w) ?? [];
    if (!list.includes(lang)) list.push(lang);
    LEXICON.set(w, list);
  }
}

/** Letters that point to one or two of the languages. */
const LETTERS: Array<[RegExp, ReviewLanguage[]]> = [
  [/[ãõ]/, ['pt']],
  [/ç/, ['pt', 'fr']],
  [/[ñ¿¡]/, ['es']],
  [/ß/, ['de']],
  [/ü/, ['de']],
  [/å/, ['sv']],
  [/[äö]/, ['de', 'sv', 'fi']],
  [/[èêëîïôûœ]/, ['fr']],
  [/[ìò]/, ['it']],
];

/** Every letter the nine languages write with. A review using any other
 *  (Polish ł, Danish ø, Romanian ș, Cyrillic, Hebrew…) is in a language the
 *  site doesn't speak, and must not be labelled as one it does. */
const SITE_LETTER = /^[a-zàáâãäåçèéêëìíîïñòóôõöùúûüýÿßœ]$/u;

export function detectReviewLanguage(text: unknown): ReviewLanguage | null {
  if (typeof text !== 'string') return null;
  const lower = text.toLowerCase().normalize('NFC');
  const letters = lower.match(/\p{L}/gu) ?? [];
  if (letters.some((ch) => !SITE_LETTER.test(ch))) return null;
  const tokens = lower.match(/\p{L}+(?:['’]\p{L}+)?/gu) ?? [];
  if (!tokens.length) return null;
  const score = Object.fromEntries(REVIEW_LANGUAGES.map((l) => [l, 0])) as Record<ReviewLanguage, number>;
  for (const token of tokens) {
    const langs = LEXICON.get(token);
    // A word shared by several languages says less than one only a single language uses.
    if (langs) for (const l of langs) score[l] += 1 / langs.length;
  }
  for (const [re, langs] of LETTERS) {
    if (re.test(lower)) for (const l of langs) score[l] += 0.75 / langs.length;
  }
  const ranked = [...REVIEW_LANGUAGES].sort((a, b) => score[b] - score[a]);
  const [best, second] = ranked;
  if (score[best] < 1.5) return null;
  if (score[best] - score[second] < 0.75) return null;
  return best;
}
