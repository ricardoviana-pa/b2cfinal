import { describe, expect, it } from "vitest";
import { blackFridayPublicCoupon, blackFridayVipActive, BLACK_FRIDAY_2026_GENERAL_CODE } from "./black-friday-2026";

describe("Black Friday 2026: validade do cupão geral", () => {
  const enabled = { BLACK_FRIDAY_2026_AUTO_COUPON: "true" } as NodeJS.ProcessEnv;
  const disabled = { BLACK_FRIDAY_2026_AUTO_COUPON: "false" } as NodeJS.ProcessEnv;

  it("fica desligado por omissão e respeita o kill switch", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-25T12:00:00Z"), disabled)).toBeNull();
    expect(blackFridayPublicCoupon(new Date("2026-11-25T12:00:00Z"), {})).toBeNull();
  });

  it("permite o código VIP só de 22 a 30, independentemente do flag geral", () => {
    expect(blackFridayVipActive(new Date("2026-11-21T23:59:59Z"))).toBe(false);
    expect(blackFridayVipActive(new Date("2026-11-22T00:00:00Z"))).toBe(true);
    expect(blackFridayVipActive(new Date("2026-11-30T23:59:59Z"))).toBe(true);
    expect(blackFridayVipActive(new Date("2026-12-01T00:00:00Z"))).toBe(false);
  });

  it("não inicia no dia VIP, só no dia 23 em Lisboa", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-22T23:59:59Z"), enabled)).toBeNull();
    expect(blackFridayPublicCoupon(new Date("2026-11-23T00:00:00Z"), enabled))
      .toBe(BLACK_FRIDAY_2026_GENERAL_CODE);
  });

  it("aplica-se a qualquer data de estadia, mas só a reservas até 30 de novembro", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-30T23:59:59Z"), enabled))
      .toBe(BLACK_FRIDAY_2026_GENERAL_CODE);
    expect(blackFridayPublicCoupon(new Date("2026-12-01T00:00:00Z"), enabled)).toBeNull();
    expect(blackFridayPublicCoupon(new Date("2026-11-19T00:00:00Z"), enabled)).toBeNull();
  });
});
