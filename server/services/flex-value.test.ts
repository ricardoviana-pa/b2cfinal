import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";

vi.mock("../lib/guesty", () => ({ guestyBEClient: { request: vi.fn() } }));

import { flexAddsValue, flexExtraDays, flexPriceForPlan } from "@shared/flexValue";
import { effectiveQuote, type CheckoutQuoteSnapshot } from "@/lib/checkoutQuote";
import { canonicalStayQuote } from "./trusted-checkout-quote";
import { computeChargeBreakdown } from "./checkout-pricing";
import { FLEX_CONFIG, flexPriceFor } from "../config/checkout-extras";

/**
 * Flex (auditoria do funil, 29 out 2026, n.º 14, parte do cliente):
 *  (a) não o mostrar onde não acrescenta nenhum dia à tarifa;
 *  (c) o preço no ecrã tem de ser o que o servidor cobra, também depois de
 *      trocar de tarifa (antes usava as noites da tarifa com que se chegou).
 */

const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const TODAY = "2026-10-29";
const DAYS = FLEX_CONFIG.rescheduleDaysBefore;
const plusDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const extra = (policyCode: unknown, arrivalInDays: number) =>
  flexExtraDays({ policyCode, checkIn: plusDays(TODAY, arrivalInDays), rescheduleDaysBefore: DAYS, today: TODAY });

describe("dias que o Flex acrescenta à tarifa", () => {
  it("moderate (cancelamento gratuito até 7 dias antes): nenhum, é o mesmo prazo do Flex", () => {
    expect(DAYS).toBe(7);
    expect(extra("moderate", 30)).toBe(0);
    expect(extra("MODERATE", 90)).toBe(0);
    expect(extra(["moderate"], 30)).toBe(0);
    expect(flexAddsValue(extra("moderate", 30))).toBe(false);
  });

  it("tarifas com janela maior: os dias entre o fim do cancelamento gratuito e os 7 dias antes", () => {
    expect(extra("firm", 30)).toBe(7); // 14 − 7
    expect(extra("strict", 60)).toBe(23); // 30 − 7
    expect(extra("strict_60", 90)).toBe(53); // 60 − 7
    expect(flexAddsValue(extra("firm", 30))).toBe(true);
  });

  it("não reembolsável: todos os dias desde hoje até 7 dias antes da chegada", () => {
    // chegada daqui a 30 dias: hoje (incluído) até D−7, 24 dias
    expect(extra("non_refundable", 30)).toBe(24);
    expect(extra("super_strict", 30)).toBe(24);
    expect(extra("non_refundable", 7)).toBe(1); // o último dia para remarcar é hoje
  });

  it("com o cancelamento gratuito já passado, conta desde hoje", () => {
    // firm (14 dias) com chegada daqui a 10: a janela gratuita acabou, o Flex vale até D−7
    expect(extra("firm", 10)).toBe(4);
  });

  it("a menos de 7 dias da chegada o Flex já não serve, em qualquer tarifa", () => {
    for (const code of ["non_refundable", "moderate", "firm", "strict", "strict_60"]) {
      expect(extra(code, 6)).toBe(0);
      expect(extra(code, 1)).toBe(0);
    }
  });

  it("política desconhecida ou sem datas: null, e o Flex fica como até aqui", () => {
    expect(extra("flexible", 30)).toBeNull();
    expect(extra(null, 30)).toBeNull();
    expect(flexExtraDays({ policyCode: "moderate", checkIn: "", rescheduleDaysBefore: DAYS, today: TODAY })).toBeNull();
    expect(flexAddsValue(null)).toBe(true);
  });
});

/* ── Preço: o ecrã igual ao que o servidor cobra ── */

const stay = {
  listingId: "synthetic-home",
  guestyQuoteId: "aaaaaaaaaaaaaaaaaaaaaaaa",
  checkIn: "2099-11-10",
  checkOut: "2099-11-15",
  guests: 4,
};
const now = Date.parse("2099-01-01T12:00:00Z");
/** Cotação do Guesty com duas tarifas, valores com cêntimos. */
function guestyQuote(plans: Array<{ id: string; name: string; policy: string; subTotal: number; cleaning: number }>) {
  return {
    _id: stay.guestyQuoteId, unitTypeId: stay.listingId, guestsCount: stay.guests,
    checkInDateLocalized: stay.checkIn, checkOutDateLocalized: stay.checkOut,
    createdAt: "2099-01-01T00:00:00Z", expiresAt: "2099-01-02T00:00:00Z",
    rates: {
      ratePlans: plans.map((p) => ({
        ratePlan: { _id: p.id, name: p.name, cancellationPolicy: p.policy, money: { currency: "EUR", subTotalPrice: p.subTotal, fareCleaning: p.cleaning } },
      })),
    },
  };
}
/** O que o servidor cobra de Flex para a tarifa: quote de confiança + breakdown canónico. */
function serverFlexCents(raw: unknown, ratePlanId: string): number {
  const trusted = canonicalStayQuote(raw, { ...stay, ratePlanId }, now);
  return computeChargeBreakdown({ quoteTotal: trusted.quote.total, totalNights: trusted.quote.totalNights, flex: true }).flexCents;
}
function serverTotalCents(raw: unknown, ratePlanId: string): number {
  const trusted = canonicalStayQuote(raw, { ...stay, ratePlanId }, now);
  return computeChargeBreakdown({ quoteTotal: trusted.quote.total, totalNights: trusted.quote.totalNights, flex: true }).totalCents;
}

describe("preço do Flex: o mesmo número no ecrã e na cobrança", () => {
  const raw = guestyQuote([
    { id: "plan-flex", name: "Reembolsável", policy: "FIRM", subTotal: 3180.4, cleaning: 180.25 },
    { id: "plan-nr", name: "Não-Reembolsável", policy: "SUPER_STRICT", subTotal: 2862.36, cleaning: 180.25 },
  ]);
  // O intent nasce com a tarifa por omissão do Guesty (a mais barata: a não reembolsável);
  // é esta a cotação que o checkout carrega uma vez e guarda como `quote`.
  const created = canonicalStayQuote(raw, { ...stay, ratePlanId: undefined as unknown as string }, now);
  const pageQuote = created.quote as CheckoutQuoteSnapshot;

  it("a cotação carregada é a da tarifa por omissão", () => {
    expect(created.ratePlanId).toBe("plan-nr");
    expect(pageQuote.ratePlanOptions?.map((o) => o.ratePlanId).sort()).toEqual(["plan-flex", "plan-nr"]);
  });

  it.each(["plan-nr", "plan-flex"])("com a tarifa %s escolhida no passo 1, o Flex do ecrã é o do servidor", (selected) => {
    const effective = effectiveQuote(pageQuote, selected);
    const screenFlex = flexPriceForPlan(effective, FLEX_CONFIG);
    expect(Math.round(screenFlex * 100)).toBe(serverFlexCents(raw, selected));
    // e o total de hoje (estadia + Flex) também
    expect(Math.round((effective!.total + screenFlex) * 100)).toBe(serverTotalCents(raw, selected));
  });

  it("a conta antiga (noites da cotação carregada) divergia depois de trocar de tarifa", () => {
    const oldScreenFlex = Math.round((pageQuote.totalNights * FLEX_CONFIG.pricePercent) / 100);
    expect(oldScreenFlex * 100).toBe(serverFlexCents(raw, "plan-nr"));
    expect(oldScreenFlex * 100).not.toBe(serverFlexCents(raw, "plan-flex"));
  });

  it("sem tarifa correspondente usa a cotação tal como está, como o servidor", () => {
    const effective = effectiveQuote(pageQuote, "plan-gone");
    expect(Math.round(flexPriceForPlan(effective, FLEX_CONFIG) * 100)).toBe(serverFlexCents(raw, "plan-nr"));
  });

  it("sem noites, o valor fixo de recurso (como o flexPriceFor do servidor)", () => {
    expect(flexPriceForPlan(null, FLEX_CONFIG)).toBe(flexPriceFor(0));
    expect(flexPriceForPlan({ total: 100, cleaningFee: 100 }, FLEX_CONFIG)).toBe(flexPriceFor(0));
  });

  it("com cêntimos ao acaso, a mesma conta do servidor (arredondamento incluído)", () => {
    let seed = 20261029;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    for (let i = 0; i < 500; i++) {
      const cleaning = Math.round(rnd() * 40000) / 100;
      const total = Math.round((cleaning + 1500 + rnd() * 20000) * 100) / 100;
      const taxesAndFees = i % 3 === 0 ? Math.round(rnd() * 5000) / 100 : 0;
      // o servidor: totalNights = total − limpeza − taxas (trusted-checkout-quote.ts)
      const serverEur = flexPriceFor(total - cleaning - taxesAndFees);
      expect(flexPriceForPlan({ total, cleaningFee: cleaning, taxesAndFees }, FLEX_CONFIG)).toBe(serverEur);
    }
  });
});

describe("o checkout usa estas regras", () => {
  const page = read("client/src/pages/checkout/CheckoutPage.tsx");

  it("o preço do Flex vem da tarifa escolhida, nunca de quote.totalNights", () => {
    expect(page).toMatch(/const flexUnit = flexConfig \? flexPriceForPlan\(effective, flexConfig\) : 0;/);
    expect(page).not.toMatch(/quote\?\.totalNights \?\? 0\) \* /);
  });

  it("o bloco do Flex só monta quando acrescenta dias, e um Flex pago sem valor sai sozinho", () => {
    expect(page).toMatch(/flexConfig && effective && flexOffered && \(\s*<FlexBlock/);
    expect(page).toMatch(/if \(!flexSelected \|\| flexGifted \|\| !flexConfig \|\| flexOffered\) return;\s*setFlexSelected\(false\);\s*syncIntent\(\{ flex: false \}\);/);
  });

  // Revisão do PR #176: a frase do Flex é texto jurídico validado pelo André
  // (spec §6 e §15.9) e o main vai direto para produção. A versão com a
  // condição ("Remarque até 7 dias antes da chegada…") fica para depois do
  // OK dele; até lá, a aprovada. A condição está no 1.º benefício do bloco.
  it("o título do Flex é a frase aprovada (spec §6) até ao OK do André, nunca 'seguro'", () => {
    const pt = JSON.parse(read("client/src/i18n/locales/pt.json")).checkout.flex.tagline as string;
    expect(pt).toBe("Remarque quando quiser. O valor que pagou nunca se perde.");
    for (const lang of ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"]) {
      const flex = JSON.parse(read(`client/src/i18n/locales/${lang}.json`)).checkout.flex;
      expect(flex.tagline, lang).not.toMatch(/insurance|seguro|assurance|versicherung|assicurazion|verzekering|försäkring|vakuutus/i);
      expect(flex.benefit1, lang).toContain("{{days}}");
    }
  });
});
