import { describe, expect, it } from "vitest";
import { nextRecoveryStage, isRecoveryHoldout, flexGiftActive, calendarScarcity, hasEnoughLeadTime, RECOVERY_TIMING } from "./recovery-funnel";
import { computeChargeBreakdown } from "./checkout-pricing";

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
