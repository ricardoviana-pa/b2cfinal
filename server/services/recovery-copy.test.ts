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
import { EMAIL_LANGS, INTL_TAG, RECOVERY_I18N, formatLisbonDay, type EmailLang } from "./email-i18n";
import { FUNNEL_I18N } from "./recovery-copy";
import { describeCancellationPolicy } from "@shared/cancellationPolicy";
import { formatQuotedMoney } from "@shared/booking-money";

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
    expect(F.personal1Ask).toContain(WE_READ[lang]);
    for (const text of [F.personal1, F.personal1Pay, F.personal1Ask]) {
      expect(text).not.toMatch(PERSONALLY);
      expect(text).not.toMatch(I_READ);
    }
  });

  it.each(EMAIL_LANGS)("%s: o email do contacto 1 (as três variantes) não promete leitura pessoal", async (lang) => {
    for (const [paymentStep, paymentAttempted] of [[false, false], [true, false], [true, true]] as const) {
      await email.sendCheckoutRecovery({ ...base, locale: lang, stage: 1, paymentStep, paymentAttempted, quote: { nights: 5, totalNights: 1500, total: 1500 } });
      const html = lastHtml();
      expect(html).not.toMatch(PERSONALLY);
      expect(html).not.toMatch(I_READ);
      if (!paymentAttempted) expect(html).toContain(WE_READ[lang]);
    }
    expect(fake.send).toHaveBeenCalledTimes(3);
  });
});

describe("contacto 1 no pagamento: sem tentativa, a pergunta; com tentativa, o texto das falhas", () => {
  /** A frase das falhas de pagamento, em cada língua: só para quem tentou pagar. */
  const CARD_TROUBLE: Record<EmailLang, string> = {
    pt: "cartão recusado", en: "declined card", fr: "carte refusée", es: "tarjeta rechazada", it: "carta rifiutata",
    de: "abgelehnte Karte", nl: "geweigerde kaart", sv: "nekat kort", fi: "hylätty kortti",
  };
  // Estadia de 1 500 €, tarifa moderate: cancelamento gratuito até 7 dias antes de 10 nov 2099.
  const stay = { nights: 5, totalNights: 1350, cleaningFee: 150, taxesAndFees: 0, total: 1500 };
  const chargeAt = new Date("2099-10-24T09:00:00Z");
  const twoParts = { todayCents: 75_000, laterCents: 75_000, chargeAt };
  const ask = (lang: EmailLang, over: Record<string, unknown> = {}) => email.sendCheckoutRecovery({
    ...base, locale: lang, stage: 1, paymentStep: true, paymentAttempted: false, quote: stay,
    expiresAt: new Date("2099-11-01T18:00:00Z"), cancellation: { policy: "moderate" }, twoParts, ...over,
  });
  const money = (cents: number, lang: EmailLang) => formatQuotedMoney(cents / 100, INTL_TAG[lang]);
  const twoPartsText = (lang: EmailLang) =>
    FUNNEL_I18N[lang].twoPartsLine(money(75_000, lang), money(75_000, lang), formatLisbonDay(chargeAt, lang));

  it("as tabelas do teste cobrem as 9 línguas", () => {
    expect(Object.keys(CARD_TROUBLE).sort()).toEqual([...EMAIL_LANGS].sort());
  });

  it.each(EMAIL_LANGS)("%s, sem tentativa: a pergunta, o cancelamento gratuito, as duas partes e o concierge, sem falar de falhas", async (lang) => {
    const F = FUNNEL_I18N[lang];
    await ask(lang);
    const { subject, html } = lastSend();
    expect(subject).toBe(F.subject1Ask("Casa Sintética"));
    expect(html).toContain(F.headline1Ask);
    expect(html).toContain(F.body1Ask(RECOVERY_I18N[lang].greetingNamed("Ana"), "Casa Sintética"));
    expect(html).toContain(F.whatsapp1Ask);
    expect(html).toContain(F.personal1Ask);
    // O cancelamento gratuito com a data, pela frase única da política.
    const policy = describeCancellationPolicy("moderate", { lang, checkIn: base.checkIn });
    expect(policy.deadline).toBe("2099-11-03");
    expect(html).toContain(policy.text);
    // As duas partes, com os valores e a data do checkout.
    expect(html).toContain(twoPartsText(lang));
    // Nada de falhas nem de Klarna para quem não tentou pagar.
    expect(html).not.toContain(CARD_TROUBLE[lang]);
    expect(html).not.toContain(F.headline1Pay);
    expect(html).not.toMatch(/Klarna/);
  });

  it.each(EMAIL_LANGS)("%s, sem tentativa: nunca 'sinal', 'depósito' ou 'prestações' (nem equivalentes)", (lang) => {
    const F = FUNNEL_I18N[lang];
    const text = [F.subject1Ask("‹h›"), F.preheader1Ask, F.headline1Ask, F.body1Ask("‹g›", "‹h›"), F.personal1Ask, F.whatsapp1Ask, F.twoPartsLine("‹a›", "‹b›", "‹d›")].join(" ");
    expect(text).not.toMatch(/\b(sinal|dep[oó]sit|prestaç|instal+ment|deposit|acompte|arrhes|versement|plazos|cuota|anticipo|rata|rate\b|caparra|acconto|Anzahlung|Rate[n]?\b|aanbetaling|termijn|avbetalning|handpenning|osamaksu|erä)/i);
    expect(text).not.toMatch(/insurance|assurance|seguro|assicurazione|Versicherung|verzekering|försäkring|vakuutus/i);
    expect(text).not.toMatch(/hotel/i);
  });

  it("sem tentativa, tarifa não reembolsável ou prazo já passado: sem linha de cancelamento", async () => {
    for (const cancellation of [{ policy: "non_refundable" }, { policy: null }, null]) {
      await ask("pt", { cancellation });
      const html = lastHtml();
      expect(html).not.toContain("Cancelamento gratuito");
      expect(html).not.toContain("não reembolsável");
      expect(html).not.toContain("condições de cancelamento da sua tarifa");
    }
    // Check-in a 3 dias: o prazo de 7 dias da moderate já passou.
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
    await ask("pt", { checkIn: soon });
    expect(lastHtml()).not.toContain("Cancelamento gratuito");
  });

  it("sem tentativa: sem oferta, ou com valores que não somam o total do cartão (extras), sem linha das duas partes", async () => {
    await ask("pt", { twoParts: null });
    expect(lastHtml()).not.toContain("Ou em duas partes");
    // 800 € hoje (metade da estadia mais 50 € de extras) e 750 € depois: 1 550 € contra os 1 500 € do cartão.
    await ask("pt", { twoParts: { todayCents: 80_000, laterCents: 75_000, chargeAt } });
    expect(lastHtml()).not.toContain("Ou em duas partes");
    await ask("pt", { twoParts: { todayCents: 75_000, laterCents: 75_000, chargeAt: new Date("invalid") } });
    expect(lastHtml()).not.toContain("Ou em duas partes");
    await ask("pt");
    expect(lastHtml()).toContain("Ou em duas partes, no mesmo cartão: ");
  });

  it("italiano: a data das duas partes leva o artigo certo (l'8, l'11)", () => {
    expect(FUNNEL_I18N.it.twoPartsLine("750 €", "750 €", "8 marzo 2100")).toBe("Oppure in due parti, con la stessa carta: 750 € oggi e 750 € l'8 marzo 2100.");
    expect(FUNNEL_I18N.it.twoPartsLine("750 €", "750 €", "15 marzo 2100")).toBe("Oppure in due parti, con la stessa carta: 750 € oggi e 750 € il 15 marzo 2100.");
  });

  it.each(EMAIL_LANGS)("%s, com tentativa: o texto de sempre; o Klarna só quando o total cabe no limite", async (lang) => {
    const F = FUNNEL_I18N[lang];
    await ask(lang, { paymentAttempted: true, klarna: false, quote: { ...stay, total: 3000 } });
    let { subject, html } = lastSend();
    expect(subject).toBe(F.subject1Pay("Casa Sintética"));
    expect(html).toContain(F.headline1Pay);
    expect(html).toContain(CARD_TROUBLE[lang]);
    expect(html).not.toMatch(/Klarna/);
    // Nada das linhas da variante sem tentativa.
    expect(html).not.toContain(F.headline1Ask);
    expect(html).not.toContain(F.whatsapp1Ask);
    expect(html).not.toContain(F.twoPartsLine(money(75_000, lang), money(75_000, lang), formatLisbonDay(chargeAt, lang)));
    await ask(lang, { paymentAttempted: true, klarna: true });
    ({ html } = lastSend());
    expect(html).toContain(F.preheader1Pay(true));
    expect(html).toContain(F.body1Pay(RECOVERY_I18N[lang].greetingNamed("Ana"), "Casa Sintética", true));
    expect(html).toMatch(/Klarna/);
  });

  it("com tentativa e Klarna: exatamente o texto que estava em produção", () => {
    expect(FUNNEL_I18N.pt.preheader1Pay(true)).toBe("O preço mantém-se. Pode concluir com cartão, Apple Pay, Google Pay, PayPal ou Klarna.");
    expect(FUNNEL_I18N.pt.body1Pay("Olá Ana,", "Casa Sintética", true)).toBe(
      "Olá Ana, chegou ao pagamento da sua estadia em Casa Sintética, mas a reserva não ficou concluída. Acontece a muitos hóspedes: um cartão recusado, um limite do banco, uma dúvida de última hora. O seu preço mantém-se e pode pagar como preferir: cartão, Apple Pay ou Google Pay, PayPal, ou dividir o pagamento com Klarna.",
    );
    expect(FUNNEL_I18N.en.body1Pay("Hello Ana,", "Casa Sintética", false)).toBe(
      "Hello Ana, you reached the payment step for your stay at Casa Sintética, but the booking wasn't completed. It happens to many guests: a declined card, a bank limit, a last-minute question. Your price still stands and you can pay however suits you: card, Apple Pay, Google Pay or PayPal.",
    );
  });

  it("fora do passo de pagamento: o contacto 1 de sempre, sem as linhas novas", async () => {
    await email.sendCheckoutRecovery({ ...base, locale: "pt", stage: 1, quote: stay, cancellation: { policy: "moderate" }, twoParts });
    const html = lastHtml();
    expect(html).toContain(FUNNEL_I18N.pt.headline1);
    expect(html).not.toContain("Ou em duas partes");
    expect(html).not.toContain("Cancelamento gratuito");
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
    ["1, pagamento sem tentativa", { stage: 1, paymentStep: true, cancellation: { policy: "moderate" },
      twoParts: { todayCents: 75_000, laterCents: 75_000, chargeAt: new Date("2099-10-08T09:00:00Z") } }],
    ["1, pagamento tentado", { stage: 1, paymentStep: true, paymentAttempted: true, klarna: true }],
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
