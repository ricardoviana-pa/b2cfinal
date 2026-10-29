/**
 * NIF da fatura: o que o hóspede escreve no passo 3 chega limpo à nota do
 * Guesty e ao email do CS, sem nunca ser recusado nem corrigido.
 */
import { describe, expect, it } from "vitest";
import { invoiceNif, invoiceNifNoteLine } from "./invoice-nif";

describe("invoiceNif", () => {
  it("guarda o que o hóspede escreveu, aparado e em maiúsculas", () => {
    expect(invoiceNif("123456789")).toBe("123456789");
    expect(invoiceNif("  pt 123 456 789 ")).toBe("PT 123 456 789");
    expect(invoiceNif("esb12345678")).toBe("ESB12345678");
    expect(invoiceNif("NL123456789B01")).toBe("NL123456789B01");
    expect(invoiceNif("123.456.789")).toBe("123.456.789");
    expect(invoiceNif("FR-12/345")).toBe("FR-12/345");
  });

  it("quebras de linha e sinais não partem a nota nem o email", () => {
    expect(invoiceNif("123\n456\t789")).toBe("123 456 789");
    expect(invoiceNif("<b>123</b>")).toBe("B 123 /B");
    expect(invoiceNif('123"; NAO cobrar')).toBe("123 NAO COBRAR");
  });

  it("sem algarismos não é um pedido de fatura com NIF", () => {
    for (const raw of [null, undefined, "", "   ", "-", "n/a", "não", "NIF"]) {
      expect(invoiceNif(raw)).toBe("");
      expect(invoiceNifNoteLine(raw)).toBe("");
    }
  });

  it("nunca passa dos 20 caracteres da coluna", () => {
    expect(invoiceNif("1".repeat(40))).toHaveLength(20);
  });
});

describe("invoiceNifNoteLine", () => {
  it("é a ação que a equipa procura no topo da nota", () => {
    expect(invoiceNifNoteLine(" 123 456 789 ")).toBe("FATURA COM NIF 123 456 789 (pedido pelo hospede no checkout do site)");
  });
});
