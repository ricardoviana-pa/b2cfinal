/**
 * Copy do funil de recuperação (contactos 1 e 4) nas 9 línguas do email.
 *
 * 1. O contacto 1 sai de "Portugal Active <booking@...>" e as respostas são
 *    lidas pela equipa: nenhuma língua pode prometer que uma pessoa lê
 *    "pessoalmente".
 * 2. O cartão das casas alternativas do contacto 4 não mostra preço: o
 *    priceFrom do catálogo não é o preço daquelas datas e a unidade (noite ou
 *    pessoa) não está confirmada.
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
  email = await import("./transactional-email");
});
beforeEach(() => fake.send.mockClear());
afterAll(() => vi.unstubAllEnvs());

const lastHtml = (): string => (fake.send.mock.calls.at(-1) as any)[0].html;

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
