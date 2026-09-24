import { describe, expect, it } from "vitest";
import { couponNoteLine } from "./coupon-note";

describe("couponNoteLine — código promocional na nota da reserva", () => {
  it("escreve o código que o hóspede usou, em maiúsculas", () => {
    expect(couponNoteLine({ couponCode: "pa2027" })).toBe("Cupao: PA2027 (codigo promocional usado no site)");
  });

  it("vazio sem código", () => {
    expect(couponNoteLine({})).toBe("");
    expect(couponNoteLine(null)).toBe("");
    expect(couponNoteLine({ couponCode: "   " })).toBe("");
  });

  it("limpa quebras de linha e caracteres estranhos, e corta no tamanho", () => {
    expect(couponNoteLine({ couponCode: "VOLTAR27\n<b>x</b>" })).toBe("Cupao: VOLTAR27BXB (codigo promocional usado no site)");
    expect(couponNoteLine({ couponCode: "A".repeat(100) })).toBe(`Cupao: ${"A".repeat(60)} (codigo promocional usado no site)`);
  });
});
