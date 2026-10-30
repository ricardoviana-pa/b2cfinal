import { describe, expect, it } from "vitest";
import fs from "node:fs";

/**
 * O campo do NIF do checkout nos telemóveis (verificação em produção, 29 out
 * 2026, CK-NIF-390). O campo não tem etiqueta visível: o placeholder era a
 * frase inteira ("Tax ID or VAT number, optional, for your invoice") e, a
 * 16 px DM Sans 300, saía dos 290 px de texto que o campo tem a 390 px nas 9
 * línguas (en +50 px, de +128 px, nl +141 px); o "para quê" nunca se via.
 *
 * Agora o placeholder é só o nome do campo e "(opcional)", medido para caber
 * a 360 px (260 px de texto), e o "para quê" é uma nota por baixo do campo,
 * ligada ao input por aria-describedby.
 */

const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
const locale = (lang: string) => JSON.parse(read(`client/src/i18n/locales/${lang}.json`));
const BANNED = /insurance|seguro|assurance|versicherung|assicurazion|verzekering|försäkring|vakuutus|\bhotel|sinal|dep[oó]sito|presta[cç][oõ]es/i;

/**
 * Largura (px) de cada placeholder a 16 px DM Sans 300, a letra e o tamanho
 * do campo nos telemóveis (`input { font-size: 16px !important }` até
 * 1024 px). Medida a 29 out 2026 com a folha do Google Fonts que o site
 * carrega, num span com white-space: pre; a mesma medição no checkout real
 * dá o mesmo valor a 0,1 px. Um texto que não esteja aqui nunca foi medido:
 * medir antes de o pôr no locale (scratch: copyfit.mjs do PR).
 */
const PLACEHOLDER_WIDTH_PX: Record<string, number> = {
  // O que estava em produção até 29 out 2026 (cortado nas 9 línguas a 390 px).
  "Tax ID or VAT number, optional, for your invoice": 340.1,
  "NIF ou nº de IVA, opcional, para a sua fatura": 315.9,
  "Numéro fiscal ou TVA, facultatif, pour votre facture": 365.6,
  "NIF o número de IVA, opcional, para su factura": 334.2,
  "Codice fiscale o partita IVA, facoltativo, per la tua fattura": 410.4,
  "Steuernummer oder USt-IdNr., optional, für Ihre Rechnung": 418.2,
  "Fiscaal nummer of btw-nummer, optioneel, voor uw factuur": 431,
  "Skattenummer eller momsnummer, valfritt, för din faktura": 416,
  "Veronumero tai ALV-tunnus, valinnainen, laskuasi varten": 402.5,
  // O nome do campo e "(opcional)".
  "Tax ID or VAT no. (optional)": 194.1,
  "NIF ou nº de IVA (opcional)": 195,
  "N° fiscal ou TVA (facultatif)": 194.2,
  "NIF o nº de IVA (opcional)": 186,
  "C.F. o partita IVA (facoltativo)": 211.3,
  "Steuer- oder USt-IdNr. (optional)": 239,
  "Fiscaal of btw-nummer (optioneel)": 253.3,
  "Skatte- eller momsnr (valfritt)": 216.2,
  "Vero- tai ALV-tunnus (valinnainen)": 249.5,
};

/** Espaço de texto do campo: viewport − 100 px (main px-4, borda e p-5 do cartão, borda e px-3 do input). */
const TEXT_SPACE_PX = { 360: 260, 390: 290 } as const;

/** A palavra "opcional" de cada língua, entre parênteses, como está no placeholder. */
const OPTIONAL: Record<(typeof LANGS)[number], string> = {
  en: "(optional)", pt: "(opcional)", fr: "(facultatif)", es: "(opcional)", it: "(facoltativo)",
  de: "(optional)", nl: "(optioneel)", sv: "(valfritt)", fi: "(valinnainen)",
};

/** O registo formal onde a língua o tem (sv e fi tratam por "du"/"sinä" em todo o site). */
const FORMAL: Partial<Record<(typeof LANGS)[number], RegExp>> = {
  pt: /\bquiser\b/,
  fr: /\bvous\b/,
  es: /\bdesea\b/,
  it: /\bdesidera\b/,
  de: /\bIhrer\b/,
  nl: /\bu\b/,
};
// Italiano: pronomes e verbos do "tu" (revisão do PR #176).
const IT_TU = /\b(ti|tuo|tua|tuoi|tue)\b|\b(controlla|inizia|togli|cambia|usa|indica|riprova)\b|\bnon ti\b/i;

describe("campo do NIF: o placeholder cabe nos telemóveis nas 9 línguas", () => {
  it.each(LANGS)("%s: só o nome do campo e «(opcional)», medido e a caber a 360 e 390 px", (lang) => {
    const ph: string = locale(lang).checkout.nifPh;
    expect(ph, lang).toBeTruthy();
    expect(ph, lang).toContain(OPTIONAL[lang]);
    expect(ph, lang).not.toMatch(/,/); // a frase inteira ("…, opcional, para a sua fatura") voltou?
    const w = PLACEHOLDER_WIDTH_PX[ph];
    expect(w, `${lang}: "${ph}" nunca foi medido a 16 px DM Sans 300`).toBeDefined();
    expect(w, `${lang} a 360 px`).toBeLessThanOrEqual(TEXT_SPACE_PX[360]);
    expect(w, `${lang} a 390 px`).toBeLessThanOrEqual(TEXT_SPACE_PX[390]);
  });

  it("o texto antigo não cabia em nenhuma língua a 390 px (o orçamento é real)", () => {
    const old = Object.entries(PLACEHOLDER_WIDTH_PX).filter(([t]) => /,/.test(t));
    expect(old).toHaveLength(9);
    for (const [, w] of old) expect(w).toBeGreaterThan(TEXT_SPACE_PX[390]);
  });
});

describe("campo do NIF: o «para quê» é uma nota por baixo do campo", () => {
  it.each(LANGS)("%s: nota curta, formal, sem vocabulário proibido", (lang) => {
    const note: string = locale(lang).checkout.nifNote;
    expect(note, lang).toBeTruthy();
    expect(note, lang).toMatch(/\.$/);
    expect(note.length, lang).toBeLessThanOrEqual(60);
    expect(note, lang).not.toMatch(BANNED);
    if (FORMAL[lang]) expect(note, lang).toMatch(FORMAL[lang]!);
    if (lang === "it") expect(note).not.toMatch(IT_TU);
  });

  const page = read("client/src/pages/checkout/CheckoutPage.tsx");
  const nifBlock = page.slice(page.indexOf('id="checkout-nif"'), page.indexOf('id="checkout-nif-hint"'));

  it("a nota existe, com o id que o input descreve, na cor de legenda (pa-stone-aa)", () => {
    expect(nifBlock).toMatch(/<p id="checkout-nif-note" className="caption text-pa-stone-aa[^"]*">\{t\("checkout\.nifNote"/);
  });

  it("o input é descrito pela nota sempre, e pela nota e pelo aviso quando o NIF não parece certo", () => {
    expect(nifBlock).toMatch(/aria-describedby=\{nifIssue \? "checkout-nif-note checkout-nif-hint" : "checkout-nif-note"\}/);
  });

  it("os textos de recurso do CheckoutPage são os do en.json (nunca ficam para trás)", () => {
    const en = locale("en").checkout;
    expect(nifBlock).toContain(`placeholder={t("checkout.nifPh", ${JSON.stringify(en.nifPh)})}`);
    expect(nifBlock).toContain(`aria-label={t("checkout.nifPh", ${JSON.stringify(en.nifPh)})}`);
    expect(nifBlock).toContain(`{t("checkout.nifNote", ${JSON.stringify(en.nifNote)})}`);
    expect(page).not.toContain("NIF — optional, for a Portuguese invoice");
  });
});
