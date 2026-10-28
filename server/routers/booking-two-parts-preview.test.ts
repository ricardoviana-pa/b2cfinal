/**
 * booking.twoPartsPreview: a página da casa e o passo 1 dizem antes do
 * checkout se a estadia pode ir em duas partes (spec 4.1, pontos 1 e 2), com
 * as mesmas regras do checkout.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingRouter } from "./booking";

const caller = () => bookingRouter.createCaller({ req: { headers: {} }, res: { setHeader: () => {} }, user: null } as any);
const ymd = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

afterEach(() => vi.unstubAllEnvs());

describe("booking.twoPartsPreview", () => {
  it("flag ligada (modo teste da Stripe): estadia elegível → metade hoje, o resto a C, com o incentivo", async () => {
    vi.stubEnv("CHECKOUT_TWO_PARTS", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    const r = await caller().twoPartsPreview({ checkIn: ymd(90), policyCode: "moderate", stayCents: 300_000 });
    expect(r).toMatchObject({ available: true, amountNowCents: 150_000, amountLaterCents: 150_000 });
    if (!r.available) throw new Error("unreachable");
    expect(new Date(r.chargeAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("nada a mostrar: flag desligada, tarifa NR, estadia abaixo do mínimo ou em cima da data", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_x");
    expect(await caller().twoPartsPreview({ checkIn: ymd(90), policyCode: "moderate", stayCents: 300_000 })).toEqual({ available: false });
    vi.stubEnv("CHECKOUT_TWO_PARTS", "true");
    expect(await caller().twoPartsPreview({ checkIn: ymd(90), policyCode: "non_refundable", stayCents: 300_000 })).toEqual({ available: false });
    expect(await caller().twoPartsPreview({ checkIn: ymd(90), policyCode: "moderate", stayCents: 50_000 })).toEqual({ available: false });
    expect(await caller().twoPartsPreview({ checkIn: ymd(10), policyCode: "moderate", stayCents: 300_000 })).toEqual({ available: false });
  });

  it("modo live sem o motor pronto: nunca promete duas partes", async () => {
    vi.stubEnv("CHECKOUT_TWO_PARTS", "true");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_x");
    expect(await caller().twoPartsPreview({ checkIn: ymd(90), policyCode: "moderate", stayCents: 300_000 })).toEqual({ available: false });
  });
});
