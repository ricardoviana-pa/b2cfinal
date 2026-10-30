/**
 * Klarna no checkout: em que países e até que valor se oferece, e que país de
 * faturação se manda à Stripe. Decisão do Ricardo (29 out 2026): o país REAL
 * do hóspede, não "PT" fixo como até aqui (KlarnaCheckoutButton mandava
 * address.country = "PT" para toda a gente, e quem não era cliente Klarna em
 * Portugal era recusado em qualquer valor).
 *
 * Factos, lidos em docs.stripe.com/payments/klarna a 29 out 2026:
 * - negócio na EEA (Portugal) com cliente na EEA, Suíça ou Reino Unido: a
 *   moeda tem de ser a do país do cliente. O checkout cobra só em EUR, por
 *   isso só os países Klarna da zona euro: AT, BE, DE, ES, FI, FR, GR, IE,
 *   IT, NL, PT;
 * - o site promete "dividir o pagamento com Klarna" (Pay in 3). Na Bélgica e
 *   na Finlândia a Klarna só tem "pagar em 30 dias" e financiamento, por isso
 *   ficam fora (conservador);
 * - tectos publicados do Pay in 3 em EUR: Portugal e Grécia 1 000; Espanha,
 *   França, Itália e Irlanda 3 000; Alemanha, Áustria e Países Baixos 5 000.
 *   A Klarna decide cada compra; estes são os máximos em que vale a pena
 *   mostrá-la.
 *
 * País de faturação, por esta ordem: o país do telefone do hóspede (o
 * PhoneInput sabe-o; no servidor lê-se do indicativo), depois o país da língua
 * do site, por fim PT. Partilhado entre o browser (marca, separador e
 * confirmKlarnaPayment) e o servidor (validação ao criar o PaymentIntent,
 * email de recuperação): os dois têm de decidir o mesmo.
 */

/** Tecto do "Pay in 3" por país de faturação (cêntimos de EUR). Fora desta
 *  tabela a Klarna não se oferece. */
export const KLARNA_PAY_IN_3_MAX_CENTS: Readonly<Record<string, number>> = {
  PT: 100_000,
  GR: 100_000,
  ES: 300_000,
  FR: 300_000,
  IT: 300_000,
  IE: 300_000,
  DE: 500_000,
  AT: 500_000,
  NL: 500_000,
};

/** Países em que a Klarna se oferece (ISO 3166-1 alfa-2, maiúsculas). */
export const KLARNA_COUNTRIES: readonly string[] = Object.keys(KLARNA_PAY_IN_3_MAX_CENTS);

/** Sem telefone nem língua com país: Portugal, como até 29 out 2026. */
export const KLARNA_DEFAULT_COUNTRY = "PT";

/** Língua do site → país (o inglês não tem um país: cai no PT por omissão). */
const SITE_LANG_COUNTRY: Readonly<Record<string, string>> = {
  pt: "PT", es: "ES", fr: "FR", de: "DE", it: "IT", nl: "NL", sv: "SE", fi: "FI",
};

/**
 * Indicativo → país, para ler o país de um telefone em E.164 quando não há
 * PhoneInput (email de recuperação). Mais longo primeiro ("351" antes de
 * "35"). Indicativos partilhados ficam com o país maior (1 → US, 7 → RU, 39 →
 * IT, 44 → GB, 47 → NO, 358 → FI): nenhum deles muda a resposta da Klarna.
 */
const DIAL_CODE_COUNTRY: Readonly<Record<string, string>> = {
  "1": "US", "7": "RU",
  "20": "EG", "27": "ZA", "30": "GR", "31": "NL", "32": "BE", "33": "FR", "34": "ES", "36": "HU",
  "39": "IT", "40": "RO", "41": "CH", "43": "AT", "44": "GB", "45": "DK", "46": "SE", "47": "NO",
  "48": "PL", "49": "DE", "51": "PE", "52": "MX", "53": "CU", "54": "AR", "55": "BR", "56": "CL",
  "57": "CO", "58": "VE", "60": "MY", "61": "AU", "62": "ID", "63": "PH", "64": "NZ", "65": "SG",
  "66": "TH", "81": "JP", "82": "KR", "84": "VN", "86": "CN", "90": "TR", "91": "IN", "92": "PK",
  "94": "LK", "98": "IR",
  "212": "MA", "213": "DZ", "216": "TN", "218": "LY", "230": "MU", "234": "NG", "238": "CV",
  "239": "ST", "244": "AO", "245": "GW", "254": "KE", "258": "MZ", "260": "ZM", "263": "ZW",
  "264": "NA", "350": "GI", "351": "PT", "352": "LU", "353": "IE", "354": "IS", "355": "AL",
  "356": "MT", "357": "CY", "358": "FI", "359": "BG", "370": "LT", "371": "LV", "372": "EE",
  "373": "MD", "374": "AM", "375": "BY", "376": "AD", "377": "MC", "378": "SM", "380": "UA",
  "381": "RS", "382": "ME", "383": "XK", "385": "HR", "386": "SI", "387": "BA", "389": "MK",
  "420": "CZ", "421": "SK", "423": "LI", "852": "HK", "853": "MO", "886": "TW", "961": "LB",
  "962": "JO", "965": "KW", "966": "SA", "968": "OM", "971": "AE", "972": "IL", "973": "BH",
  "974": "QA", "994": "AZ", "995": "GE",
};

/**
 * Locales que a Stripe aceita em payment_method_options.klarna.preferred_locale
 * (tipos do SDK stripe@22, PaymentIntents.d.ts). Um par fora desta lista faz a
 * Stripe recusar a criação do PaymentIntent, por isso só se manda o que cá está.
 */
const KLARNA_LOCALES: ReadonlySet<string> = new Set([
  "cs-CZ", "da-DK", "de-AT", "de-CH", "de-DE", "de-LU", "el-GR", "en-AT", "en-AU", "en-BE", "en-CA",
  "en-CH", "en-CZ", "en-DE", "en-DK", "en-ES", "en-FI", "en-FR", "en-GB", "en-GR", "en-IE", "en-IT",
  "en-NL", "en-NO", "en-NZ", "en-PL", "en-PT", "en-RO", "en-SE", "en-US", "es-ES", "es-US", "fi-FI",
  "fr-BE", "fr-CA", "fr-CH", "fr-FR", "fr-LU", "hu-HU", "it-CH", "it-IT", "nb-NO", "nl-BE", "nl-NL",
  "pl-PL", "pt-PT", "ro-RO", "sk-SK", "sv-FI", "sv-SE",
]);

/** "pt" → "PT"; qualquer coisa que não sejam duas letras → null. */
export function normalizeCountry(value: unknown): string | null {
  const s = String(value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(s) ? s : null;
}

/** "pt-PT" → "pt"; vazio → "". */
function languageOf(locale: unknown): string {
  return String(locale ?? "").trim().toLowerCase().split(/[-_]/)[0] || "";
}

/** País de um telefone em E.164 ("+351 912 345 678", "0044…"), ou null se o indicativo não for conhecido. */
export function countryFromPhone(phone: unknown): string | null {
  const raw = String(phone ?? "").trim();
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  else if (!raw.startsWith("+")) return null; // número nacional: o país é o do campo, não o do número
  if (!digits) return null;
  for (const len of [3, 2, 1]) {
    const code = digits.slice(0, len);
    const country = DIAL_CODE_COUNTRY[code];
    if (country) return country;
  }
  return null;
}

/** País de uma língua do site ("fr" → "FR"); o inglês e línguas desconhecidas não têm (null). */
export function countryFromSiteLanguage(locale: unknown): string | null {
  return SITE_LANG_COUNTRY[languageOf(locale)] ?? null;
}

/**
 * País de faturação a mandar à Klarna: o país escolhido no PhoneInput, senão
 * o indicativo do telefone, senão o país da língua do site, senão PT.
 */
export function klarnaBillingCountry(input: {
  /** ISO2 do PhoneInput (react-international-phone dá-o em minúsculas). */
  phoneCountry?: string | null;
  /** Telefone em E.164, quando não há PhoneInput montado (retoma, servidor). */
  phone?: string | null;
  /** Língua do site (i18n.language ou locale do intent). */
  siteLang?: string | null;
}): string {
  return (
    normalizeCountry(input.phoneCountry) ??
    countryFromPhone(input.phone) ??
    countryFromSiteLanguage(input.siteLang) ??
    KLARNA_DEFAULT_COUNTRY
  );
}

export function isKlarnaCountry(country: unknown): boolean {
  const c = normalizeCountry(country);
  return c != null && Object.prototype.hasOwnProperty.call(KLARNA_PAY_IN_3_MAX_CENTS, c);
}

/** Tecto do país em cêntimos, ou null fora da tabela. */
export function klarnaMaxCents(country: unknown): number | null {
  const c = normalizeCountry(country);
  return c != null && isKlarnaCountry(c) ? KLARNA_PAY_IN_3_MAX_CENTS[c] : null;
}

/** A Klarna oferece-se para este país e este total (cêntimos)? Sem país ou total conhecidos, não. */
export function klarnaAvailable(country: unknown, amountCents: number | null | undefined): boolean {
  const max = klarnaMaxCents(country);
  return (
    max != null &&
    typeof amountCents === "number" &&
    Number.isSafeInteger(amountCents) &&
    amountCents > 0 &&
    amountCents <= max
  );
}

/**
 * Língua da página da Klarna: a língua do hóspede no país de faturação quando
 * a Stripe aceita esse par (pt-PT, es-ES, de-AT, nl-BE…), senão o inglês
 * nesse país (en-GR), senão nada (a Klarna escolhe pelo país).
 */
export function klarnaPreferredLocale(locale: unknown, country: unknown): string | undefined {
  const c = normalizeCountry(country);
  if (!c) return undefined;
  const lang = languageOf(locale);
  if (lang && KLARNA_LOCALES.has(`${lang}-${c}`)) return `${lang}-${c}`;
  if (KLARNA_LOCALES.has(`en-${c}`)) return `en-${c}`;
  return undefined;
}
