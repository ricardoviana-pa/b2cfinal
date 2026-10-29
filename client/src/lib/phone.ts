/**
 * Telefone do hóspede (auditoria do funil, 29 out 2026, n.º 7): país por
 * omissão e validação, sem biblioteca de telefones nenhuma — o PhoneInput
 * serve também o widget da página da casa, onde o telemóvel já é lento.
 *
 * País por omissão:
 *   1. a região do browser (en-GB → gb, en-US → us, en-IE → ie, pt-BR → br);
 *   2. a língua do site, para as línguas que não o inglês (pt → pt, sv → se);
 *   3. em inglês, a língua do browser (um holandês no site em inglês → nl);
 *   4. senão gb (o maior mercado de língua inglesa). Nunca pt para o inglês:
 *      70% dos checkouts são em inglês e viam a bandeira portuguesa.
 *
 * Validação: o número de algarismos depois do indicativo onde a regra é fixa
 * e fácil de dizer (PT 9, ES 9, FR 9, GB 9 ou 10, US 10...); nos outros
 * países só o comprimento E.164 (8 a 15 algarismos com o indicativo), para
 * nunca recusar um número raro mas válido. Cada erro explica-se junto ao
 * campo (phoneIssueMessage).
 *
 * Entrada: algarismos sem "+" nem "00" são um número nacional do país
 * escolhido (phoneEntry), nunca um indicativo adivinhado.
 */

/** Algarismos depois do indicativo, por indicativo. Só regras fixas e seguras. */
const NATIONAL_DIGITS: Record<string, readonly [number, number]> = {
  "1": [10, 10], // EUA, Canadá e o resto do plano norte-americano
  "7": [10, 10], // Rússia, Cazaquistão
  "27": [9, 9], // África do Sul
  "30": [10, 10], // Grécia
  "31": [9, 9], // Países Baixos
  "32": [8, 9], // Bélgica (fixo 8, móvel 9)
  "33": [9, 9], // França
  "34": [9, 9], // Espanha
  "36": [8, 9], // Hungria
  "40": [9, 9], // Roménia
  "41": [9, 9], // Suíça
  "44": [9, 10], // Reino Unido (móvel 10)
  "45": [8, 8], // Dinamarca
  "47": [8, 8], // Noruega
  "48": [9, 9], // Polónia
  "52": [10, 10], // México
  "54": [10, 11], // Argentina
  "55": [10, 11], // Brasil
  "61": [9, 9], // Austrália
  "64": [8, 10], // Nova Zelândia
  "65": [8, 8], // Singapura
  "81": [9, 10], // Japão
  "90": [10, 10], // Turquia
  "91": [10, 10], // Índia
  "238": [7, 7], // Cabo Verde
  "244": [9, 9], // Angola
  "351": [9, 9], // Portugal
  "353": [7, 9], // Irlanda (móvel 9)
  "354": [7, 9], // Islândia
  "356": [8, 8], // Malta
  "357": [8, 8], // Chipre
  "420": [9, 9], // Chéquia
  "421": [9, 9], // Eslováquia
  "971": [8, 9], // Emirados Árabes Unidos
  "972": [8, 9], // Israel
};
// Mais longo primeiro: "351" antes de um eventual "35".
const DIAL_CODES = Object.keys(NATIONAL_DIGITS).sort((a, b) => b.length - a.length);

/** E.164: no máximo 15 algarismos com o indicativo; abaixo de 8 não há números reais. */
const E164_MIN = 8;
const E164_MAX = 15;

export type PhoneIssue =
  | { kind: "empty" }
  /** "+0…": nenhum indicativo começa por 0 (apagou o indicativo e escreveu o número nacional). */
  | { kind: "country_code" }
  | { kind: "leading_zero"; dialCode: string }
  | { kind: "length"; dialCode: string; min: number; max: number }
  | { kind: "too_short" }
  | { kind: "too_long" };

/**
 * O que está mal no número, ou null se está certo. O valor vem do PhoneInput
 * em E.164 com espaços ("+351 912 345 678"); o indicativo sozinho conta como
 * vazio (é o que o campo mostra antes de o hóspede escrever).
 */
export function phoneIssue(raw: string | null | undefined): PhoneIssue | null {
  const value = String(raw ?? "").trim();
  const digits = value.replace(/\D/g, "");
  if (!digits) return { kind: "empty" };
  const international = value.startsWith("+") || value.startsWith("00");
  const e164 = value.startsWith("00") ? digits.slice(2) : digits;
  if (international) {
    if (e164.startsWith("0")) return { kind: "country_code" };
    const code = DIAL_CODES.find((c) => e164.startsWith(c));
    if (code) {
      const national = e164.slice(code.length);
      if (!national) return { kind: "empty" };
      // Nenhum destes países tem números começados por 0 depois do indicativo
      // (o 0 é o prefixo nacional: "+44 07700…" é o erro mais comum do Reino Unido)
      if (national.startsWith("0")) return { kind: "leading_zero", dialCode: `+${code}` };
      const [min, max] = NATIONAL_DIGITS[code];
      if (national.length < min || national.length > max) {
        return { kind: "length", dialCode: `+${code}`, min, max };
      }
      return null;
    }
    // Indicativo sem regra conhecida: só o indicativo (até 3 algarismos) é vazio
    if (e164.length <= 3) return { kind: "empty" };
  }
  if (e164.length < E164_MIN) return { kind: "too_short" };
  if (e164.length > E164_MAX) return { kind: "too_long" };
  return null;
}

export function isPlausiblePhone(raw: string | null | undefined): boolean {
  return phoneIssue(raw) == null;
}

/* ------------------------------------------------------------------ */
/* O que entra no campo                                                 */
/* ------------------------------------------------------------------ */

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** O que o PhoneInput entrega ao react-international-phone. */
export interface PhoneEntry {
  value: string;
  inputType?: string;
}

/**
 * Como ler o que o hóspede escreveu, colou ou o browser preencheu, ANTES de o
 * react-international-phone o formatar (revisão do PR #176). A biblioteca lê
 * todos os algarismos como número internacional: sem o forceDialCode,
 * "927161771" escrito num campo apagado (ou colado, ou preenchido pelo
 * browser por cima do "+351 ") virava +92 716-1771, Paquistão, e passava a
 * validação. Aqui:
 *  - algarismos sem "+" nem "00" são um número nacional do país escolhido:
 *    "927161771" com +351 → "+351 927161771" (salvo quando só fazem sentido
 *    com o indicativo à frente, num país com regra fixa: "351912345678");
 *  - "00…" é o prefixo internacional: "0044 7700 900123" → "+44 7700 900123";
 *  - um "+" escrito ou colado depois do indicativo pré-preenchido, antes de
 *    qualquer algarismo do número, recomeça o número: "+351 +44 7700…" →
 *    "+44 7700…" (a bandeira passa a seguir o novo indicativo);
 *  - "00" logo a seguir ao indicativo também: "+351 0044…" → "+44…".
 * Apagar, desfazer e refazer passam como estão.
 *
 * Um texto inteiro inserido de uma vez como "insertText" (preenchimento por
 * sugestão do teclado) passa como colagem: a biblioteca recusava qualquer
 * "insertText" com um espaço ou um "+".
 */
export function phoneEntry(input: {
  /** O valor do <input> depois da edição (e.target.value). */
  raw: string;
  /** Indicativo do país escolhido, sem "+" ("351"). */
  dialCode: string;
  /** InputEvent.inputType; undefined no preenchimento automático do browser. */
  inputType?: string | null;
  /** InputEvent.data: o que foi escrito. */
  data?: string | null;
}): PhoneEntry {
  const type = input.inputType || undefined;
  if (type && /^(delete|history)/.test(type)) return { value: input.raw, inputType: type };
  const bulk = type === "insertText" && (input.data?.length ?? 0) > 1;
  return { value: normalizePhoneEntry(input.raw, input.dialCode), inputType: bulk ? "insertFromPaste" : type };
}

function normalizePhoneEntry(raw: string, dialCode: string): string {
  const value = raw.trim();
  if (!value) return raw;
  if (value.startsWith("00")) return `+${value.slice(2)}`;
  const plus = value.lastIndexOf("+");
  if (plus > 0) {
    // Um "+" depois do que já lá estava: só recomeça se antes dele havia
    // apenas o indicativo (nenhum algarismo do número).
    const head = digitsOf(value.slice(0, plus));
    return head.length <= dialCode.length ? normalizePhoneEntry(value.slice(plus), dialCode) : raw;
  }
  const digits = digitsOf(value);
  if (plus === 0) {
    if (digits.startsWith("00")) return `+${digits.slice(2)}`;
    if (dialCode && digits.startsWith(dialCode) && digits.slice(dialCode.length).startsWith("00")) {
      return `+${digits.slice(dialCode.length + 2)}`;
    }
    return raw;
  }
  if (!digits || !dialCode) return raw;
  // Algarismos sem "+": número nacional do país escolhido. Num país com regra
  // fixa, quando só o número com o indicativo à frente está certo
  // ("351912345678" com +351), lê-se como internacional sem o "+".
  if (NATIONAL_DIGITS[dialCode] && digits.startsWith(dialCode)) {
    const asNational = `+${dialCode} ${digits}`;
    const asInternational = `+${digits}`;
    if (phoneIssue(asNational) != null && phoneIssue(asInternational) == null) return asInternational;
  }
  return `+${dialCode} ${value}`;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** A frase que explica o erro junto ao campo, na língua do site. */
export function phoneIssueMessage(issue: PhoneIssue | null, t: Translate): string {
  if (!issue) return "";
  switch (issue.kind) {
    case "country_code":
      return t("bookingWidget.phoneErrors.countryCode");
    case "leading_zero":
      return t("bookingWidget.phoneErrors.leadingZero", { dialCode: issue.dialCode });
    case "length":
      return issue.min === issue.max
        ? t("bookingWidget.phoneErrors.digits", { dialCode: issue.dialCode, digits: issue.min })
        : t("bookingWidget.phoneErrors.digitsRange", { dialCode: issue.dialCode, min: issue.min, max: issue.max });
    case "too_short":
      return t("bookingWidget.phoneErrors.tooShort");
    case "too_long":
      return t("bookingWidget.phoneErrors.tooLong");
    default:
      return t("bookingWidget.invalidPhone", { defaultValue: "Please enter a valid phone number" });
  }
}

/* ------------------------------------------------------------------ */
/* País por omissão                                                     */
/* ------------------------------------------------------------------ */

/** Língua do site → país, para as línguas que não o inglês. */
const LANG_TO_COUNTRY: Record<string, string> = {
  pt: "pt", es: "es", fr: "fr", de: "de", it: "it", nl: "nl", sv: "se", fi: "fi",
};
/** Língua do browser sem região → país (só quando o site está em inglês). */
const BROWSER_LANG_TO_COUNTRY: Record<string, string> = {
  ...LANG_TO_COUNTRY,
  da: "dk", nb: "no", nn: "no", no: "no", pl: "pl", cs: "cz", el: "gr", hu: "hu", ro: "ro",
  ja: "jp", he: "il", tr: "tr",
};
const ENGLISH_FALLBACK = "gb";

function languageOf(tag: string): string {
  return tag.trim().toLowerCase().split(/[-_]/)[0] || "";
}

/** "en-GB" → "gb", "zh-Hans-CN" → "cn", "es-419" → null (não é um país). */
export function regionOf(tag: string | null | undefined): string | null {
  const s = String(tag || "").trim().replace(/_/g, "-");
  if (!s) return null;
  try {
    const region = new Intl.Locale(s).region;
    if (region) return /^[A-Za-z]{2}$/.test(region) ? region.toLowerCase() : null;
  } catch {
    /* etiqueta inválida: tenta à mão */
  }
  const m = /^[a-z]{2,3}(?:-[a-z]{4})?-([a-z]{2})(?:-|$)/i.exec(s);
  return m ? m[1].toLowerCase() : null;
}

export function defaultPhoneCountry(input: {
  /** navigator.languages (por ordem de preferência); vazio no servidor. */
  languages?: readonly string[] | null;
  /** Língua do site (i18n). */
  siteLang?: string | null;
  /** Países que o campo conhece (a lista do react-international-phone). */
  supported?: (iso2: string) => boolean;
}): string {
  const ok = (c: string | null | undefined): c is string =>
    !!c && /^[a-z]{2}$/.test(c) && (!input.supported || input.supported(c));
  const tags = (input.languages ?? []).map((l) => String(l || "")).filter(Boolean);
  const primary = tags[0];
  if (primary) {
    const own = regionOf(primary);
    if (ok(own)) return own;
    // ["en", "en-GB"]: a mesma língua com região, mais abaixo na lista
    const lang = languageOf(primary);
    const sameLang = tags.slice(1).find((tag) => languageOf(tag) === lang && ok(regionOf(tag)));
    if (sameLang) return regionOf(sameLang)!;
  }
  const site = languageOf(String(input.siteLang || ""));
  const fromSite = LANG_TO_COUNTRY[site];
  if (ok(fromSite)) return fromSite;
  if (primary) {
    const fromBrowser = BROWSER_LANG_TO_COUNTRY[languageOf(primary)];
    if (ok(fromBrowser)) return fromBrowser;
  }
  return ENGLISH_FALLBACK;
}
