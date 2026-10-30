import { describe, expect, it } from "vitest";
import {
  nextRecoveryStage, isRecoveryHoldout, flexGiftActive, calendarScarcity, hasEnoughLeadTime, RECOVERY_TIMING,
  flexExtraDays, klarnaCanPay, KLARNA_MAX_CENTS, KLARNA_BILLING_COUNTRY_FORCED_PT, klarnaBillingCountryForcedPt,
  CONCIERGE_ALERT_MIN_TOTAL,
} from "./recovery-funnel";
import { computeChargeBreakdown } from "./checkout-pricing";
import { FLEX_CONFIG } from "../config/checkout-extras";

const H = 3_600_000;

describe("regras do funil de recuperação", () => {
  it("contactos 1 e 2 só com a cotação viva, para todos", () => {
    expect(nextRecoveryStage({ stage: 0, ageMs: 0.5 * H, quoteValid: true, consent: false })).toBeNull();
    expect(nextRecoveryStage({ stage: 0, ageMs: 2 * H, quoteValid: true, consent: false })).toBe(1);
    expect(nextRecoveryStage({ stage: 1, ageMs: 21 * H, quoteValid: true, consent: false })).toBe(2);
    expect(nextRecoveryStage({ stage: 0, ageMs: 21 * H, quoteValid: true, consent: false })).toBe(2); // nunca dois seguidos
  });
  it("contactos 3 e 4 só com consentimento", () => {
    expect(nextRecoveryStage({ stage: 2, ageMs: 80 * H, quoteValid: false, consent: false })).toBeNull();
    expect(nextRecoveryStage({ stage: 2, ageMs: 80 * H, quoteValid: false, consent: true })).toBe(3);
    expect(nextRecoveryStage({ stage: 3, ageMs: 170 * H, quoteValid: false, consent: true })).toBe(4);
  });
  it("nunca repete e sai do funil depois do último", () => {
    expect(nextRecoveryStage({ stage: 4, ageMs: 170 * H, quoteValid: false, consent: true })).toBeNull();
    expect(nextRecoveryStage({ stage: 0, ageMs: RECOVERY_TIMING.maxAgeMs + H, quoteValid: true, consent: true })).toBeNull();
  });
  it("grupo de controlo determinístico e perto de 10%", () => {
    const id = "b1f0cbcd-6881-4459-ae49-edf3b0c3cd19";
    expect(isRecoveryHoldout(id)).toBe(isRecoveryHoldout(id));
    let n = 0;
    for (let i = 0; i < 5000; i++) if (isRecoveryHoldout(`intent-${i}`)) n++;
    expect(n / 5000).toBeGreaterThan(0.07);
    expect(n / 5000).toBeLessThan(0.13);
  });
  it("Flex oferecido só enquanto for válido", () => {
    expect(flexGiftActive({ flexGiftUntil: new Date(Date.now() + H) })).toBe(true);
    expect(flexGiftActive({ flexGiftUntil: new Date(Date.now() - H) })).toBe(false);
    expect(flexGiftActive({ flexGiftUntil: null })).toBe(false);
  });
  it("Flex oferecido conta 0 na cobrança; sem oferta é cobrado", () => {
    const base = { quoteTotal: 3000, totalNights: 2800, nights: 5, flex: true };
    expect(computeChargeBreakdown(base).flexCents).toBeGreaterThan(0);
    const gifted = computeChargeBreakdown({ ...base, flexGift: true });
    expect(gifted.flexCents).toBe(0);
    expect(gifted.totalCents).toBe(300000);
  });
  it("escassez só quando é verdade", () => {
    const days = (u: number, t: number) => Array.from({ length: t }, (_, i) => ({ status: i < u ? "booked" : "available" }));
    expect(calendarScarcity(days(29, 47))).toEqual({ unavailable: 29, total: 47 });
    expect(calendarScarcity(days(10, 47))).toBeNull();
    expect(calendarScarcity(days(5, 7))).toBeNull();
  });
  it("sem contactos com check-in a menos de 2 dias", () => {
    const day = 86_400_000;
    expect(hasEnoughLeadTime(new Date(Date.now() + 10 * day).toISOString().slice(0, 10))).toBe(true);
    expect(hasEnoughLeadTime(new Date(Date.now() + day).toISOString().slice(0, 10))).toBe(false);
  });
});

describe("Flex: dias que acrescenta ao cancelamento gratuito da tarifa", () => {
  const days = FLEX_CONFIG.rescheduleDaysBefore;
  it("o Flex remarca até 7 dias antes da chegada (a regra que estes testes assumem)", () => {
    expect(days).toBe(7);
  });
  it("moderate (cancela de graça até 7 dias antes): o Flex não acrescenta nada", () => {
    expect(flexExtraDays("moderate", days)).toBe(0);
  });
  it("tarifas que deixam de cancelar de graça mais cedo: os dias entre o prazo delas e o do Flex", () => {
    expect(flexExtraDays("firm", days)).toBe(7);
    expect(flexExtraDays("strict", days)).toBe(23);
    expect(flexExtraDays("strict_60", days)).toBe(53);
  });
  it("não reembolsável: o Flex é a única proteção", () => {
    expect(flexExtraDays("non_refundable", days)).toBe(Infinity);
  });
  it("política desconhecida: não se sabe (null)", () => {
    expect(flexExtraDays(null, days)).toBeNull();
    expect(flexExtraDays(undefined, days)).toBeNull();
  });
});

describe("Klarna: tecto do Paga em 3 por país de faturação", () => {
  it("Portugal (por omissão): até 1 000 € inclusive, sim; acima, não", () => {
    expect(KLARNA_MAX_CENTS).toBe(100_000);
    expect(klarnaCanPay(99_900)).toBe(true);
    expect(klarnaCanPay(100_000)).toBe(true);
    expect(klarnaCanPay(100_001)).toBe(false);
    expect(klarnaCanPay(250_000)).toBe(false);
    expect(klarnaCanPay(250_000, "PT")).toBe(false);
  });
  it("outros países: o tecto publicado de cada um; fora da tabela da Klarna em euros, nunca", () => {
    expect(klarnaCanPay(250_000, "DE")).toBe(true);
    expect(klarnaCanPay(500_000, "de")).toBe(true);
    expect(klarnaCanPay(500_001, "DE")).toBe(false);
    expect(klarnaCanPay(300_000, "FR")).toBe(true);
    expect(klarnaCanPay(300_001, "FR")).toBe(false);
    expect(klarnaCanPay(100_000, "GR")).toBe(true);
    expect(klarnaCanPay(100_001, "GR")).toBe(false);
    for (const country of ["GB", "SE", "DK", "BE", "FI", "US", "CH", "", null]) {
      expect(klarnaCanPay(50_000, country), String(country)).toBe(false);
    }
  });
  it("sem total conhecido (ou inválido), não se sugere", () => {
    expect(klarnaCanPay(null)).toBe(false);
    expect(klarnaCanPay(undefined)).toBe(false);
    expect(klarnaCanPay(0)).toBe(false);
    expect(klarnaCanPay(Number.NaN)).toBe(false);
    expect(klarnaCanPay(500.5)).toBe(false);
    expect(klarnaCanPay(500.5, "DE")).toBe(false);
  });
  it("interruptor de emergência: por omissão desligado (país real do hóspede); só o ambiente o liga", () => {
    expect(KLARNA_BILLING_COUNTRY_FORCED_PT).toBe(false);
    expect(klarnaBillingCountryForcedPt({})).toBe(false);
    expect(klarnaBillingCountryForcedPt({ KLARNA_BILLING_COUNTRY_FORCED_PT: "" })).toBe(false);
    expect(klarnaBillingCountryForcedPt({ KLARNA_BILLING_COUNTRY_FORCED_PT: "false" })).toBe(false);
    expect(klarnaBillingCountryForcedPt({ KLARNA_BILLING_COUNTRY_FORCED_PT: "0" })).toBe(false);
    expect(klarnaBillingCountryForcedPt({ KLARNA_BILLING_COUNTRY_FORCED_PT: "true" })).toBe(true);
    expect(klarnaBillingCountryForcedPt({ KLARNA_BILLING_COUNTRY_FORCED_PT: " TRUE " })).toBe(true);
    expect(klarnaBillingCountryForcedPt({ KLARNA_BILLING_COUNTRY_FORCED_PT: "1" })).toBe(true);
  });
});

describe("alerta ao concierge: para todos os que param no pagamento (29 out 2026)", () => {
  it("sem mínimo de valor", () => {
    expect(CONCIERGE_ALERT_MIN_TOTAL).toBe(0);
  });
});
