/**
 * Copy do funil de recuperação (contactos 1 e 4) nas 9 línguas do email.
 *
 * 1. O contacto 1 sai de "Portugal Active <booking@...>" e as respostas são
 *    lidas pela equipa: nenhuma língua pode prometer que uma pessoa lê
 *    "pessoalmente".
 * 2. O cartão das casas alternativas do contacto 4 não mostra preço: o
 *    priceFrom do catálogo não é o preço daquelas datas e a unidade (noite ou
 *    pessoa) não está confirmada.
 * 3. As respostas aos emails de recuperação vão sempre para a caixa de
 *    reservas (Reply-To explícito), mesmo que o remetente mude.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_LANGS, type EmailLang } from "./email-i18n";
import { FUNNEL_I18N } from "./recovery-copy";

const fake = vi.hoisted(() => ({ send: vi.fn(async () => ({ error: null })) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: fake.send }; } }));

let email: typeof import("./transactional-email");
beforeAll(async () => {
  // Resend está simulado acima: nada sai para a rede.
  vi.stubEnv("RESEND_API_KEY", "synthetic-mocked-email-only");
  // Remetente de envio que não é a caixa lida pela equipa: o Reply-To tem de
  // continuar a apontar para booking@.
  vi.stubEnv("EMAIL_FROM", "Portugal Active <noreply@send.example.test>");
  vi.stubEnv("BOOKING_NOTIFICATION_EMAIL", "");
  email = await import("./transactional-email");
});
beforeEach(() => fake.send.mockClear());
afterAll(() => vi.unstubAllEnvs());

const lastSend = (): any => (fake.send.mock.calls.at(-1) as any)[0];
const lastHtml = (): string => lastSend().html;

const base = {
  guestEmail: "guest@example.test",
  guestFirstName: "Ana",
  propertyName: "Casa Sintética",
  destination: "minho",
  checkIn: "2099-11-10",
  checkOut: "2099-11-15",
  guests: 2,
  resumeUrl: "https://www.portugalactive.com/pt/checkout/synthetic",
};

/** "Pessoalmente" e equivalentes, em todas as línguas do email. */
const PERSONALLY = /pessoalmente|personally|personnellement|personalmente|persönlich|persoonlijk|personligen|henkilökohtaisesti/i;
/** Primeira pessoa do singular a ler as respostas (o texto antigo). */
const I_READ = /\b(Leio|I read|Je lis|Leo todas|Leggo|Ich lese|Ik lees|Jag läser|Luen)\b/;

const WE_READ: Record<EmailLang, string> = {
  pt: "Lemos todas as respostas.",
  en: "We read every reply.",
  fr: "Nous lisons toutes les réponses.",
  es: "Leemos todas las respuestas.",
  it: "Leggiamo tutte le risposte.",
  de: "Wir lesen jede Antwort.",
  nl: "We lezen elk antwoord.",
  sv: "Vi läser varje svar.",
  fi: "Luemme jokaisen vastauksen.",
};

describe("contacto 1: as respostas são lidas pela equipa", () => {
  it("cobre as 9 línguas do email", () => {
    expect(Object.keys(FUNNEL_I18N).sort()).toEqual([...EMAIL_LANGS].sort());
    expect(Object.keys(WE_READ).sort()).toEqual([...EMAIL_LANGS].sort());
  });

  it.each(EMAIL_LANGS)("%s: o texto diz que a equipa lê, sem 'pessoalmente'", (lang) => {
    const F = FUNNEL_I18N[lang];
    expect(F.personal1).toContain(WE_READ[lang]);
    for (const text of [F.personal1, F.personal1Pay]) {
      expect(text).not.toMatch(PERSONALLY);
      expect(text).not.toMatch(I_READ);
    }
  });

  it.each(EMAIL_LANGS)("%s: o email do contacto 1 (as duas variantes) não promete leitura pessoal", async (lang) => {
    for (const paymentStep of [false, true]) {
      await email.sendCheckoutRecovery({ ...base, locale: lang, stage: 1, paymentStep, quote: { nights: 5, totalNights: 1500, total: 1500 } });
      const html = lastHtml();
      expect(html).not.toMatch(PERSONALLY);
      expect(html).not.toMatch(I_READ);
      if (!paymentStep) expect(html).toContain(WE_READ[lang]);
    }
    expect(fake.send).toHaveBeenCalledTimes(2);
  });
});

describe("contacto 4: o cartão das alternativas não tem preço", () => {
  const alternatives = [
    { name: "Casa Alternativa Um", locality: "Caminha", imageUrl: "https://assets.example.test/alt-1.jpg", url: "https://www.portugalactive.com/pt/homes/alt-um" },
    { name: "Casa Alternativa Dois", locality: "Ponte de Lima", imageUrl: "https://assets.example.test/alt-2.jpg", url: "https://www.portugalactive.com/pt/homes/alt-dois" },
  ];
  /** "por noite" e equivalentes do texto antigo do cartão. */
  const PER_NIGHT = /por noite|per night|par nuit|por noche|a notte|pro Nacht|per nacht|per natt|\/ yö/i;

  it("o texto do funil já não tem a frase de preço das alternativas", () => {
    for (const lang of EMAIL_LANGS) expect(FUNNEL_I18N[lang]).not.toHaveProperty("altFrom");
  });

  it.each(EMAIL_LANGS)("%s: mostra foto, nome, lugar e ligação, sem preço", async (lang) => {
    // Mesmo que chegue um priceFrom antigo ao renderer, não pode aparecer.
    const withStalePrice = alternatives.map((a) => ({ ...a, priceFrom: 1234 })) as any;
    await email.sendCheckoutRecovery({
      ...base, locale: lang, stage: 4, alternatives: withStalePrice,
      propertyUrl: "https://www.portugalactive.com/pt/homes/original",
    });
    const html = lastHtml();
    for (const a of alternatives) {
      expect(html).toContain(a.name);
      expect(html).toContain(a.locality);
      expect(html).toContain(`src="${a.imageUrl}"`);
      expect(html).toContain(`href="${a.url}"`);
    }
    expect(html).toContain(FUNNEL_I18N[lang].headline4);
    expect(html).not.toContain("€");
    expect(html).not.toMatch(/1[\s.,  ]?234/);
    expect(html).not.toMatch(PER_NIGHT);
  });
});

describe("contacto 4: texto PT à volta do cartão", () => {
  it("usa a regência certa (agradar a alguém), sem 'que achamos que vai gostar'", () => {
    const body = FUNNEL_I18N.pt.body4("Olá Ana,", "Casa Sintética");
    expect(body).toContain("que achamos que lhe vão agradar.");
    expect(body).not.toMatch(/que achamos que vai gostar/);
  });
});

describe("italiano: o funil trata o hóspede por Lei, como o resto do site", () => {
  /** Todas as strings do funil em italiano, com as funções chamadas com marcadores neutros. */
  const itStrings = (): Array<[string, string]> =>
    Object.entries(FUNNEL_I18N.it).map(([key, value]) => {
      if (typeof value === "string") return [key, value];
      const fn = value as (...args: unknown[]) => string;
      return [key, fn(...Array.from({ length: fn.length }, (_, i) => `‹${i}›`))];
    });

  /** Marcas de "tu" como palavras inteiras (possessivos, pronomes, verbos na 2.ª pessoa). */
  const TU = /(?<![\p{L}'’])(tu|tua|tuo|tue|tuoi|ti|te|hai|vuoi|puoi|preferisci|rispondi|scegli|cerchi|scrivici|dicci)(?![\p{L}'’])/iu;
  /**
   * Imperativos na 2.ª pessoa no início de frase ou de botão. Fora desta posição
   * "prenota", "completa" e "torna" também são 3.ª pessoa ("finché qualcuno non
   * prenota"), por isso só se procuram aqui.
   */
  const TU_IMPERATIVE = /(^|[.!?:]\s+)(Prenota|Completa|Vedi|Torna|Scopri|Continua|Riprendi|Scrivi|Rispondi|Scegli)(?![\p{L}'’])/u;
  /** Cortesia em maiúscula a meio da frase: os outros emails italianos escrevem-na em minúscula. */
  const CAPITAL_COURTESY = /[\p{L},]\s+(Lei|La|Le|Suo|Sua|Suoi|Sue|Gli|Glielo)(?![\p{L}'’])/u;

  it.each(itStrings())("it.%s não usa 'tu'", (_key, text) => {
    expect(text).not.toMatch(TU);
    expect(text).not.toMatch(TU_IMPERATIVE);
    expect(text).not.toMatch(CAPITAL_COURTESY);
  });

  it("usa as formas de Lei nos quatro contactos e na variante de pagamento", () => {
    const F = FUNNEL_I18N.it;
    expect(F.body1("Buongiorno Ana,", "Casa Sintetica")).toContain("il suo soggiorno a Casa Sintetica esattamente come l'ha lasciato");
    expect(F.personal1).toContain("risponda a questa email");
    expect(F.body1Pay("Buongiorno Ana,", "Casa Sintetica")).toContain("può pagare come preferisce");
    expect(F.personal1Pay).toContain("Risponda a questa email o ci scriva su WhatsApp");
    expect(F.headline2).toBe("Il suo prezzo resta valido ancora per qualche ora.");
    expect(F.giftBody("‹u›", 7, "‹v›")).toMatch(/^Prenoti entro ‹u› e le offriamo Flex/);
    expect(F.body4None("Buongiorno Ana,", "Casa Sintetica")).toContain("ci dica cosa ha in mente");
    expect(F.lastNote).toContain("che le inviamo");
  });

  it("os botões ficam no infinitivo, como os outros emails italianos", () => {
    const F = FUNNEL_I18N.it;
    expect([F.cta3Gift, F.cta3, F.ownLink("Casa Sintetica")]).toEqual([
      "Prenotare con Flex incluso",
      "Vedere il prezzo di oggi",
      "Tornare a Casa Sintetica",
    ]);
  });

  const alternatives = [
    { name: "Casa Alternativa Uno", locality: "Caminha", imageUrl: "https://assets.example.test/alt-1.jpg", url: "https://www.portugalactive.com/it/homes/alt-uno" },
  ];
  it.each([
    ["1", { stage: 1, paymentStep: false }],
    ["1, pagamento", { stage: 1, paymentStep: true }],
    ["2", { stage: 2 }],
    ["3, com Flex oferecido", { stage: 3, flexGift: { until: new Date("2099-11-02T18:00:00Z"), days: 7, value: 120 } }],
    ["3, sem oferta", { stage: 3 }],
    ["4, com alternativas", { stage: 4, alternatives }],
    ["4, sem alternativas", { stage: 4 }],
  ] as const)("o email italiano do contacto %s sai sem 'tu'", async (_label, variant) => {
    for (const guestFirstName of ["Ana", ""]) {
      for (const propertyName of ["Casa Sintetica", ""]) {
        await email.sendCheckoutRecovery({
          ...base, guestFirstName, propertyName, locale: "it", ...variant,
          quote: { nights: 5, totalNights: 1500, total: 1500 },
          expiresAt: new Date("2099-11-01T18:00:00Z"),
          scarcity: { unavailable: 3, total: 10 },
          propertyUrl: "https://www.portugalactive.com/it/homes/original",
        });
        const sent = lastSend();
        const text = `${sent.subject}\n${sent.html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ")}`;
        expect(text).not.toMatch(TU);
        expect(text).not.toMatch(TU_IMPERATIVE);
      }
    }
  });
});

describe("respostas: Reply-To explícito para a caixa de reservas", () => {
  it.each([1, 2, 3, 4] as const)("contacto %s responde para booking@, mesmo com outro remetente", async (stage) => {
    await email.sendCheckoutRecovery({
      ...base, locale: "pt", stage,
      expiresAt: new Date("2099-11-01T18:00:00Z"),
      propertyUrl: "https://www.portugalactive.com/pt/homes/original",
    });
    const sent = lastSend();
    expect(sent.from).toBe("Portugal Active <noreply@send.example.test>");
    expect(sent.replyTo).toBe("booking@portugalactive.com");
  });
});
