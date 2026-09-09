import { describe, it, expect } from "vitest";
import { resolveRatePlanId } from "./checkout-card-charge";

/**
 * O plano tarifário é o que decide o preço que o Guesty atribui à reserva e a
 * política de cancelamento que o hóspede fica a ter. Enquanto o settle o leu de
 * dentro do snapshot `quote` — onde o Zod o apaga — foi sempre undefined, e
 * todas as reservas do checkout 2.0 nasceram no plano por omissão da listagem.
 */
describe("resolveRatePlanId", () => {
  it("lê a coluna do intent, que é onde o hóspede grava a escolha", () => {
    expect(resolveRatePlanId({ ratePlanId: "rp-flex" }, { total: 900 })).toBe("rp-flex");
  });

  it("regressão: o snapshot da quote não tem ratePlanId — não pode ser a única fonte", () => {
    // Exactamente a forma que o quoteSnapshotSchema deixa passar: ratePlanId
    // apenas dentro das opções, nunca no topo.
    const quote = {
      total: 1282.1,
      ratePlanOptions: [
        { ratePlanId: "rp-nr", name: "Non-refundable", total: 1153.89, nightlyRate: 0, cleaningFee: 0 },
        { ratePlanId: "rp-flex", name: "Flexible", total: 1282.1, nightlyRate: 0, cleaningFee: 0 },
      ],
    };
    // Sem a coluna preenchida, o plano certo é o que bate certo com o cobrado.
    expect(resolveRatePlanId({}, quote)).toBe("rp-flex");
    // E a coluna, quando existe, manda sempre.
    expect(resolveRatePlanId({ ratePlanId: "rp-nr" }, quote)).toBe("rp-nr");
  });

  it("não adivinha quando nenhuma opção bate com o total cobrado", () => {
    const quote = {
      total: 999,
      ratePlanOptions: [{ ratePlanId: "rp-flex", name: "Flexible", total: 1282.1, nightlyRate: 0, cleaningFee: 0 }],
    };
    // Melhor não mandar plano nenhum (e gritar no log) do que mandar o errado:
    // o plano errado muda a política de cancelamento do hóspede.
    expect(resolveRatePlanId({}, quote)).toBe("");
  });

  it("aguenta intents e quotes incompletos sem rebentar", () => {
    expect(resolveRatePlanId({}, {})).toBe("");
    expect(resolveRatePlanId(null, null)).toBe("");
    expect(resolveRatePlanId({}, { total: 100, ratePlanOptions: "nao-e-array" })).toBe("");
    expect(resolveRatePlanId({}, { total: NaN, ratePlanOptions: [{ ratePlanId: "x", total: NaN }] })).toBe("");
  });

  it("tolera cêntimos de arredondamento entre a opção e o total cotado", () => {
    const quote = {
      total: 1282.1,
      ratePlanOptions: [{ ratePlanId: "rp-flex", name: "Flexible", total: 1282.11, nightlyRate: 0, cleaningFee: 0 }],
    };
    expect(resolveRatePlanId({}, quote)).toBe("rp-flex");
  });
});
