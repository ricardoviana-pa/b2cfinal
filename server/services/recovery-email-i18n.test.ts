/**
 * Email de recuperação do checkout: nada em inglês fora do inglês.
 *
 * Três textos saíam em inglês nas 9 línguas: o rótulo "Total" do cartão da
 * estadia (contactos 1 a 3), a linha "Service fee" e a frase do rodapé "The
 * privacy of a home. The service of a hotel.". O teste gera o email em cada
 * língua e em cada contacto e falha se alguma destas frases voltar a aparecer
 * numa língua que não seja o inglês.
 *
 * "Total" é também a palavra nativa em PT, ES e FR; por isso o rótulo da linha
 * do total compara-se com a palavra certa de cada língua, em vez de se
 * procurar a palavra inglesa no HTML.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_LANGS, RECOVERY_I18N, type EmailLang } from "./email-i18n";

const fake = vi.hoisted(() => ({ send: vi.fn(async () => ({ error: null })) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: fake.send }; } }));

let email: typeof import("./transactional-email");
beforeAll(async () => {
  // Resend está simulado acima: nada sai para a rede.
  vi.stubEnv("RESEND_API_KEY", "synthetic-mocked-email-only");
  vi.stubEnv("BOOKING_NOTIFICATION_EMAIL", "");
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
  guests: 4,
  imageUrl: "https://assets.example.test/casa.jpg",
  expiresAt: new Date("2099-11-01T18:00:00Z"),
  resumeUrl: "https://www.portugalactive.com/checkout/synthetic",
  optoutUrl: "https://www.portugalactive.com/api/recovery/optout/synthetic",
  propertyUrl: "https://www.portugalactive.com/homes/synthetic",
  // Todas as linhas do cartão presentes, para todos os rótulos aparecerem.
  quote: { nights: 5, totalNights: 1500, cleaningFee: 150, taxesAndFees: 40, total: 1690 },
};

/** Os três textos em inglês que saíam em todas as línguas. */
const ENGLISH_LEFTOVERS = [
  /Service fee/i,
  /privacy of a home/i,
  /service of a hotel/i,
];

/** Rótulo da linha do total, na palavra de cada língua. */
const TOTAL: Record<EmailLang, string> = {
  pt: "Total",
  en: "Total",
  es: "Total",
  fr: "Total",
  it: "Totale",
  de: "Gesamt",
  nl: "Totaal",
  sv: "Totalt",
  fi: "Yhteensä",
};

/** Rótulo da taxa de preparação, igual ao resumo do checkout (property.cleaningFee). */
const CLEANING: Record<EmailLang, string> = {
  pt: "Preparação da casa",
  en: "Home preparation",
  es: "Preparación de la casa",
  fr: "Préparation de la maison",
  it: "Preparazione della casa",
  de: "Vorbereitung des Hauses",
  nl: "Voorbereiding van de woning",
  sv: "Förberedelse av huset",
  fi: "Talon valmistelu",
};

/** Texto da célula à esquerda do valor final (o total) do cartão. */
function totalRowLabel(html: string): string | undefined {
  return html.match(/font-weight:500;[^"]*">([^<]+)<\/td>\s*<td[^>]*font-size:21px/)?.[1];
}

const STAGES = [1, 2, 3, 4] as const;
const cases = EMAIL_LANGS.flatMap((lang) => STAGES.map((stage) => [lang, stage] as const));

async function render(lang: EmailLang, stage: (typeof STAGES)[number]): Promise<string> {
  await email.sendCheckoutRecovery({
    ...base,
    locale: lang,
    stage,
    scarcity: stage === 2 ? { unavailable: 3, total: 5 } : null,
    flexGift: stage === 3 ? { until: new Date("2099-11-02T18:00:00Z"), value: 120, days: 30 } : null,
    alternatives: stage === 4
      ? [{ name: "Casa Alternativa", locality: "Caminha", url: "https://www.portugalactive.com/homes/alt" }]
      : undefined,
  });
  return lastHtml();
}

describe("email de recuperação: sem texto em inglês nas outras 8 línguas", () => {
  it("as tabelas do teste cobrem as 9 línguas do email", () => {
    expect(Object.keys(TOTAL).sort()).toEqual([...EMAIL_LANGS].sort());
    expect(Object.keys(CLEANING).sort()).toEqual([...EMAIL_LANGS].sort());
  });

  it.each(cases)("%s, contacto %s: nem 'Service fee' nem a frase do rodapé em inglês", async (lang, stage) => {
    const html = await render(lang, stage);
    if (lang !== "en") {
      for (const leftover of ENGLISH_LEFTOVERS) expect(html).not.toMatch(leftover);
    }
    // Rodapé: a frase da marca da própria língua.
    expect(html).toContain(RECOVERY_I18N[lang].footerTagline);
  });

  it.each(cases)("%s, contacto %s: cartão da estadia com os rótulos da língua", async (lang, stage) => {
    const html = await render(lang, stage);
    if (stage === 4) {
      // O contacto 4 não tem cartão da estadia nem total.
      expect(totalRowLabel(html)).toBeUndefined();
      return;
    }
    expect(html).toContain(`>${CLEANING[lang]}</td>`);
    expect(totalRowLabel(html)).toBe(TOTAL[lang]);
  });

  it("inglês: rótulos e rodapé em inglês, com o rótulo do checkout para a preparação", async () => {
    const html = await render("en", 1);
    expect(totalRowLabel(html)).toBe("Total");
    expect(html).toContain(">Home preparation</td>");
    expect(html).not.toContain("Service fee");
    expect(html).toContain("Private hotels in Portugal. The privacy of a home, the service of a hotel.");
  });
});
