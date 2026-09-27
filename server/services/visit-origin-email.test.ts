/**
 * Email interno [Venda direta]: cada venda direta diz o cupão e de onde veio a
 * visita. O email [CS] para o balcão fica igual (não precisa da origem).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ send: vi.fn(async () => ({ error: null })) }));
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
  confirmationCode: "GY-SYNTH01",
  reservationId: "synthetic-reservation",
  propertyName: "Casa Sintética",
  checkIn: "2099-12-23",
  checkOut: "2099-12-26",
  guests: 4,
  reception: { type: "self" },
};

describe("[Venda direta] com cupão e origem da visita", () => {
  it("mostra o cupão e a origem só na cópia de vendas", async () => {
    await email.sendCheckoutOpsManifest({
      ...base,
      couponCode: "voltar27",
      origin: {
        v: 1, consent: true, stored: true,
        first: { utm_source: "email", utm_medium: "email", utm_campaign: "2026-09_o1_base_antigos", at: "2026-09-25T09:00:00Z" },
        last: { utm_source: "email", utm_medium: "email", utm_campaign: "2026-09_o1_base_antigos", utm_content: "codigo_voltar27", landing: "/pt/homes/casa", at: "2026-09-27T16:42:10Z" },
      },
    });
    const sales = sent("sales@checkout.invalid");
    const cs = sent("cs@checkout.invalid");
    expect(sales.subject).toBe("[Venda direta] Casa Sintética · GY-SYNTH01");
    expect(sales.html).toContain(">Cupao</td>");
    expect(sales.html).toContain(">VOLTAR27</td>");
    expect(sales.html).toContain(">Origem da visita</td>");
    expect(sales.html).toContain("fonte email, meio email, campanha 2026-09_o1_base_antigos, conteudo codigo_voltar27");
    expect(sales.html).toContain("entrada /pt/homes/casa");
    expect(cs.html).not.toContain("Origem da visita");
    expect(cs.html).not.toContain("Cupao");
  });

  it("sem código e sem consentimento diz isso mesmo", async () => {
    await email.sendCheckoutOpsManifest({ ...base, couponCode: null, origin: { v: 1, consent: false } });
    const html = sent("sales@checkout.invalid").html;
    expect(html).toContain(">sem codigo</td>");
    expect(html).toContain("sem consentimento de cookies de analise (nada guardado)");
  });

  it("intent sem origem registada", async () => {
    await email.sendCheckoutOpsManifest({ ...base });
    expect(sent("sales@checkout.invalid").html).toContain(">sem registo no site</td>");
  });
});
