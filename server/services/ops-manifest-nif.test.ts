/**
 * Email do CS ([CS] para o balcão e cópia [Venda direta]): o NIF que o
 * hóspede pediu na fatura é a 1.ª ação, em todos os métodos de pagamento
 * (o manifesto é o mesmo para cartão, wallets, PayPal e Klarna). Sem NIF, o
 * email fica exatamente como antes.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ send: vi.fn(async (_mail: any) => ({ error: null })) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: fake.send }; } }));

let email: typeof import("./transactional-email");
beforeAll(async () => {
  // Resend está simulado acima: nada sai para a rede.
  vi.stubEnv("RESEND_API_KEY", "synthetic-mocked-email-only");
  vi.stubEnv("BOOKING_ALERT_EMAIL", "cs@checkout.invalid");
  vi.stubEnv("SALES_COPY_EMAIL", "sales@checkout.invalid");
  email = await import("./transactional-email");
});
beforeEach(() => fake.send.mockClear());
afterAll(() => vi.unstubAllEnvs());

const sent = (to: string) => (fake.send.mock.calls as any[]).map((c) => c[0]).find((m) => m.to === to);
const base = {
  intentId: "3f1c2a9e-8b7d-4c6e-9f00-1234567890ab",
  confirmationCode: "GY-SYNTHNIF",
  reservationId: "synthetic-reservation",
  propertyName: "Casa Sintética",
  checkIn: "2099-12-23",
  checkOut: "2099-12-26",
  guests: 4,
  guestName: "Ana Teste",
  email: "guest@checkout.invalid",
  reception: { type: "hosted" },
  extras: [{ sku: "private-chef", amount: 250, people: 4 }],
};
const ACTION = "FATURA COM NIF PT 123 456 789: o hospede pediu a fatura com este NIF.";

describe("manifesto do CS com NIF", () => {
  it("o NIF é a 1.ª ação, no [CS] e no [Venda direta], e o assunto do [CS] avisa", async () => {
    await email.sendCheckoutOpsManifest({ ...base, nif: "  pt 123 456 789 " });
    const cs = sent("cs@checkout.invalid");
    const sales = sent("sales@checkout.invalid");
    expect(cs.subject).toBe("[CS] Reserva GY-SYNTHNIF · Casa Sintética · FATURA COM NIF");
    expect(sales.subject).toBe("[Venda direta] Casa Sintética · GY-SYNTHNIF");
    for (const html of [cs.html, sales.html]) {
      expect(html).toContain(ACTION);
      expect(html).toContain("a fatura da estadia (Hostkit) e a dos servicos, se houver, saem com ele");
      // Antes de todas as outras ações (receção presencial, serviços).
      expect(html.indexOf(ACTION)).toBeLessThan(html.indexOf("AGENDAR ANFITRIAO"));
      expect(html.indexOf(ACTION)).toBeLessThan(html.indexOf("PREPARAR"));
    }
  });

  it("nas duas partes o destaque NÃO cobrar continua por cima e o NIF abre as ações", async () => {
    await email.sendCheckoutOpsManifest({
      ...base,
      nif: "123456789",
      plan: {
        amountTodayCents: 148_000, amountLaterCents: 125_000,
        chargeAt: new Date("2099-06-28T09:00:00Z"), freeCancelDeadlineAt: new Date("2099-07-08T22:59:00Z"),
        cardLast4: "4242", manageUrl: null,
      },
    });
    const cs = sent("cs@checkout.invalid");
    expect(cs.subject).toBe("[CS] Reserva GY-SYNTHNIF · Casa Sintética · DUAS PARTES, NAO COBRAR · FATURA COM NIF");
    const html = cs.html as string;
    expect(html.indexOf("PAGAMENTO EM DUAS PARTES")).toBeLessThan(html.indexOf("FATURA COM NIF 123456789"));
    expect(html.indexOf("FATURA COM NIF 123456789")).toBeLessThan(html.indexOf("AGENDAR ANFITRIAO"));
  });

  it("um NIF com HTML não entra cru no email", async () => {
    await email.sendCheckoutOpsManifest({ ...base, nif: "<b>123</b>" });
    const html = sent("cs@checkout.invalid").html as string;
    expect(html).not.toContain("<b>123");
    expect(html).toContain("FATURA COM NIF B 123 /B:");
  });

  it("sem NIF (ou com um '-' no campo) o email fica como antes", async () => {
    for (const nif of [undefined, null, "", "-", "n/a"]) {
      fake.send.mockClear();
      await email.sendCheckoutOpsManifest({ ...base, nif });
      const cs = sent("cs@checkout.invalid");
      expect(cs.subject).toBe("[CS] Reserva GY-SYNTHNIF · Casa Sintética");
      expect(cs.html).not.toContain("FATURA COM NIF");
      expect(sent("sales@checkout.invalid").html).not.toContain("FATURA COM NIF");
    }
  });
});
