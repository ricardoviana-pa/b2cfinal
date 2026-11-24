import { describe, expect, it } from "vitest";
import { blackFridayPublicCoupon, blackFridayPublicCodeValid, blackFridayVipActive, blockedBlackFridayCoupon, BLACK_FRIDAY_2026_GENERAL_CODE } from "./black-friday-2026";

describe("Black Friday 2026: validade do cupão geral", () => {
  const enabled = { BLACK_FRIDAY_2026_AUTO_COUPON: "true" } as NodeJS.ProcessEnv;
  const disabled = { BLACK_FRIDAY_2026_AUTO_COUPON: "false" } as NodeJS.ProcessEnv;

  it("fica desligado por omissão e respeita o kill switch", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-25T12:00:00Z"), disabled)).toBeNull();
    expect(blackFridayPublicCoupon(new Date("2026-11-25T12:00:00Z"), {})).toBeNull();
  });

  it("nunca se aplica sozinho, mesmo com BLACK_FRIDAY_2026_AUTO_COUPON=true", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-25T12:00:00Z"), enabled)).toBeNull();
    expect(blackFridayPublicCoupon(new Date("2026-11-30T23:59:59Z"), enabled)).toBeNull();
  });

  it("código geral escrito à mão vale de 24 a 30 mesmo com a aplicação automática desligada", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-25T12:00:00Z"), disabled)).toBeNull();
    expect(blackFridayPublicCodeValid(new Date("2026-11-23T23:59:59Z"))).toBe(false);
    expect(blackFridayPublicCodeValid(new Date("2026-11-24T00:00:00Z"))).toBe(true);
    expect(blackFridayPublicCodeValid(new Date("2026-11-30T23:59:59Z"))).toBe(true);
    expect(blackFridayPublicCodeValid(new Date("2026-12-01T00:00:00Z"))).toBe(false);
  });

  it("permite o código VIP só de 23 a 30, independentemente do flag geral", () => {
    expect(blackFridayVipActive(new Date("2026-11-22T23:59:59Z"))).toBe(false);
    expect(blackFridayVipActive(new Date("2026-11-22T00:00:00Z"))).toBe(false);
    expect(blackFridayVipActive(new Date("2026-11-23T00:00:00Z"))).toBe(true);
    expect(blackFridayVipActive(new Date("2026-11-30T23:59:59Z"))).toBe(true);
    expect(blackFridayVipActive(new Date("2026-12-01T00:00:00Z"))).toBe(false);
  });

  it("rejeita cotações antigas com código geral ou nome interno antes da estreia", () => {
    const nov19 = new Date("2026-11-19T16:00:00Z");
    expect(blockedBlackFridayCoupon(["PABF15GERAL26"], nov19)).toBe(true);
    expect(blockedBlackFridayCoupon(["Black Friday Geral 2026"], nov19)).toBe(true);
    expect(blockedBlackFridayCoupon(["Black Friday VIP 2026"], nov19)).toBe(true);
    expect(blockedBlackFridayCoupon(["RECUPERA5"], nov19)).toBe(false);
    expect(blockedBlackFridayCoupon([], nov19)).toBe(false);
  });

  it("VIP passa no dia 23, geral só no dia 24; nenhum passa depois do prazo", () => {
    const nov22 = new Date("2026-11-22T12:00:00Z");
    const nov23Vip = new Date("2026-11-23T12:00:00Z");
    const nov23 = new Date("2026-11-23T00:00:00Z");
    const nov24 = new Date("2026-11-24T00:00:00Z");
    const nov30 = new Date("2026-11-30T23:59:59Z");
    const dec1 = new Date("2026-12-01T00:00:00Z");
    expect(blockedBlackFridayCoupon(["PABF15VIP26"], nov22)).toBe(true);
    expect(blockedBlackFridayCoupon(["PABF15VIP26"], nov23Vip)).toBe(false);
    expect(blockedBlackFridayCoupon(["PABF15GERAL26"], nov22)).toBe(true);
    expect(blockedBlackFridayCoupon(["PABF15GERAL26"], nov23)).toBe(true);
    expect(blockedBlackFridayCoupon(["PABF15GERAL26"], nov24)).toBe(false);
    expect(blockedBlackFridayCoupon(["PABF15GERAL26"], nov30)).toBe(false);
    expect(blockedBlackFridayCoupon(["PABF15VIP26"], dec1)).toBe(true);
  });

  // Aplicação automática desligada a 24 nov 2026 (o hóspede escreve o código).
  it.skip("não inicia no dia VIP, só no dia 24 em Lisboa", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-23T23:59:59Z"), enabled)).toBeNull();
    expect(blackFridayPublicCoupon(new Date("2026-11-24T00:00:00Z"), enabled))
      .toBe(BLACK_FRIDAY_2026_GENERAL_CODE);
  });

  it.skip("aplica-se a qualquer data de estadia, mas só a reservas até 30 de novembro", () => {
    expect(blackFridayPublicCoupon(new Date("2026-11-30T23:59:59Z"), enabled))
      .toBe(BLACK_FRIDAY_2026_GENERAL_CODE);
    expect(blackFridayPublicCoupon(new Date("2026-12-01T00:00:00Z"), enabled)).toBeNull();
    expect(blackFridayPublicCoupon(new Date("2026-11-19T00:00:00Z"), enabled)).toBeNull();
  });
});
