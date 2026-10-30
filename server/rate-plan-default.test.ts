import { describe, expect, it } from "vitest";
import { isOpenRefundablePlan, preferredRatePlanId } from "@shared/ratePlanDefault";

/**
 * Tarifa pré-selecionada: a reembolsável, sempre que a estadia a ofereça
 * (decisão do Ricardo, 29 out 2026). Antes vinha a tarifa por omissão do
 * Guesty, que é a não reembolsável na maior parte das casas.
 */
const nr = { ratePlanId: "synthetic-nr", name: "Não-Reembolsável", total: 2430, cancellationPolicy: ["super_strict"] };
const flex = { ratePlanId: "synthetic-flex", name: "Flexible", total: 2700, cancellationPolicy: ["MODERATE"] };
const strict60 = { ratePlanId: "synthetic-strict-60", name: "Flexible 60", total: 2900, cancellationPolicy: ["STRICT_60"] };
const CHECK_IN = "2099-11-20";
const EARLY = "2099-10-01"; // todas as janelas abertas
const LATE = "2099-11-18"; // moderate (7 dias) já fechou

describe("a tarifa reembolsável vem pré-selecionada", () => {
  it("mesmo quando o fornecedor manda a não reembolsável por omissão, em qualquer ordem", () => {
    expect(preferredRatePlanId([nr, flex], nr.ratePlanId, CHECK_IN, EARLY)).toBe(flex.ratePlanId);
    expect(preferredRatePlanId([flex, nr], nr.ratePlanId, CHECK_IN, EARLY)).toBe(flex.ratePlanId);
    expect(preferredRatePlanId([nr, flex], undefined, CHECK_IN, EARLY)).toBe(flex.ratePlanId);
  });

  it("com duas reembolsáveis abertas, a mais barata", () => {
    expect(preferredRatePlanId([strict60, nr, flex], strict60.ratePlanId, CHECK_IN, EARLY)).toBe(flex.ratePlanId);
  });

  it("janela de cancelamento gratuito já fechada: essa tarifa deixa de se pré-selecionar", () => {
    expect(isOpenRefundablePlan(flex, CHECK_IN, LATE)).toBe(false);
    expect(preferredRatePlanId([nr, flex], nr.ratePlanId, CHECK_IN, LATE)).toBe(nr.ratePlanId);
    // sem tarifa por omissão entre as mostradas, a primeira
    expect(preferredRatePlanId([flex, nr], "outra", CHECK_IN, LATE)).toBe(flex.ratePlanId);
  });

  it("sem data de chegada, uma reembolsável com código conhecido conta como aberta", () => {
    expect(preferredRatePlanId([nr, flex], nr.ratePlanId, undefined, EARLY)).toBe(flex.ratePlanId);
  });

  it("código desconhecido: só o nome 'Reembolsável' do próprio Guesty a torna reembolsável", () => {
    const named = { ratePlanId: "named", name: "Rembolsável Premium", total: 2800, cancellationPolicy: ["custom-flex"] };
    const unknown = { ratePlanId: "unknown", name: "Summer", total: 2800, cancellationPolicy: ["custom-flex"] };
    expect(isOpenRefundablePlan(named, CHECK_IN, EARLY)).toBe(true);
    expect(isOpenRefundablePlan(unknown, CHECK_IN, EARLY)).toBe(false);
    expect(preferredRatePlanId([nr, named], nr.ratePlanId, CHECK_IN, EARLY)).toBe("named");
    expect(preferredRatePlanId([nr, unknown], nr.ratePlanId, CHECK_IN, EARLY)).toBe(nr.ratePlanId);
  });

  it("só não reembolsável: a por omissão do fornecedor; sem lista, null", () => {
    expect(preferredRatePlanId([nr], nr.ratePlanId, CHECK_IN, EARLY)).toBe(nr.ratePlanId);
    expect(preferredRatePlanId([], nr.ratePlanId, CHECK_IN, EARLY)).toBeNull();
    expect(preferredRatePlanId(undefined, nr.ratePlanId, CHECK_IN, EARLY)).toBeNull();
    expect(isOpenRefundablePlan(nr, CHECK_IN, EARLY)).toBe(false);
  });
});
