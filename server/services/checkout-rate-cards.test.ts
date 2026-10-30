import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { rateCardModels } from "@/lib/rateCards";

/**
 * Tarifas em dois cartões de opção, "mais e-commerce, com os valores"
 * (decisão do Ricardo, 29 out 2026): nome, benefício com a data, total, a
 * poupança da não reembolsável ao lado do total da reembolsável, a linha das
 * duas partes debaixo da reembolsável. Widget da casa e passo 1 do checkout
 * usam o mesmo componente; a reembolsável vem pré-selecionada.
 */
const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
const locale = (lang: string) => JSON.parse(read(`client/src/i18n/locales/${lang}.json`));
const BANNED = /insurance|seguro|assurance|versicherung|assicurazion|verzekering|försäkring|vakuutus|\bhotel|sinal|dep[oó]sito|presta[cç][oõ]es/i;
/** Urgência inventada (regra da marca): nada de "só hoje", "últimas", "rápido". */
const URGENCY = /only today|hurry|last chance|limited time|só hoje|últim|apresse|depressa|schnell|beeil|dépêch|vite|affrettat|snel|skynda|kiire/i;

const flex = { ratePlanId: "flex", name: "Flexible", total: 2700, cancellationPolicy: ["moderate"] };
const nr = { ratePlanId: "nr", name: "Non-refundable", total: 2430, cancellationPolicy: ["super_strict"] };
const CHECK_IN = "2099-11-20";
const TODAY = "2099-10-01";

describe("o que cada cartão diz", () => {
  it("reembolsável: benefício com a data do fim do cancelamento gratuito, sem poupança, candidata às duas partes", () => {
    const [f] = rateCardModels([flex, nr], CHECK_IN, TODAY);
    expect(f).toMatchObject({
      ratePlanId: "flex", kind: "refundable", policyCode: "moderate", freeUntil: "2099-11-13",
      total: 2700, compareTotal: null, savings: 0, twoPartsCandidate: true,
    });
  });

  it("não reembolsável: o total da reembolsável riscado e a poupança ao cêntimo", () => {
    const [, n] = rateCardModels([flex, nr], CHECK_IN, TODAY);
    expect(n).toMatchObject({
      ratePlanId: "nr", kind: "non_refundable", policyCode: "non_refundable", freeUntil: null,
      total: 2430, compareTotal: 2700, savings: 270, twoPartsCandidate: false,
    });
    expect(rateCardModels([flex, { ...nr, total: 2430.5 }], CHECK_IN, TODAY)[1].savings).toBe(269.5);
    // a ordem não muda a comparação
    expect(rateCardModels([nr, flex], CHECK_IN, TODAY)[0].savings).toBe(270);
  });

  it("janela já fechada ou código desconhecido: sem data e sem linha das duas partes", () => {
    const [f] = rateCardModels([flex, nr], CHECK_IN, "2099-11-18");
    expect(f.freeUntil).toBeNull();
    const unknown = { ratePlanId: "u", name: "Summer", total: 2600, cancellationPolicy: ["custom"] };
    const [u] = rateCardModels([unknown, nr], CHECK_IN, TODAY);
    expect(u).toMatchObject({ kind: "unknown", policyCode: null, freeUntil: null, twoPartsCandidate: false });
    // sem reembolsável, a poupança compara com a mais cara
    expect(rateCardModels([unknown, nr], CHECK_IN, TODAY)[1]).toMatchObject({ savings: 170, compareTotal: 2600 });
  });

  it("uma tarifa única não tem com que se comparar", () => {
    expect(rateCardModels([flex], CHECK_IN, TODAY)[0]).toMatchObject({ savings: 0, compareTotal: null });
  });
});

describe("o componente e quem o usa", () => {
  const cards = read("client/src/components/booking/RatePlanCards.tsx");
  const widget = read("client/src/components/booking/BookingWidget.tsx");
  const page = read("client/src/pages/checkout/CheckoutPage.tsx");

  it("widget e passo 1 usam os mesmos cartões; o passo 1 lado a lado no computador, o widget empilhado", () => {
    expect(widget).toMatch(/<RatePlanCards[\s\S]*?name="ratePlan"[\s\S]*?columns=\{1\}[\s\S]*?twoPartsVariant="widget"/);
    expect(page).toMatch(/<RatePlanCards[\s\S]*?name="checkoutRatePlan"[\s\S]*?columns=\{2\}[\s\S]*?twoPartsVariant="rate"/);
    // o passo 1 continua antes do email (spec §4)
    expect(page.indexOf("{rateChoice}")).toBeLessThan(page.indexOf('id="checkout-email"'));
    // os cartões antigos (um rádio com a frase comprida da política) saíram
    expect(page).not.toMatch(/name="checkoutRatePlan"\s*\n\s*checked=/);
    expect(widget).not.toMatch(/const maxTotal = Math\.max/);
  });

  it("rádios nativos (setas e espaço), estado escolhido evidente, anel de foco no cartão", () => {
    expect(cards).toMatch(/role="radiogroup"/);
    expect(cards).toMatch(/type="radio"/);
    expect(cards).toMatch(/peer-focus-visible:opacity-100/);
    expect(cards).toMatch(/data-selected=\{selected \? "true" : "false"\}/);
    expect(cards).toMatch(/border-pa-dark ring-1 ring-pa-dark/);
    expect(cards).toMatch(/aria-describedby=\{benefitId\}/);
  });

  it("benefício, total, total riscado com 'Poupe X €' e a linha das duas partes debaixo da reembolsável", () => {
    expect(cards).toMatch(/t\("booking\.freeCancellation", \{ date: formatBookingDate\(m\.freeUntil, lang, true\) \}\)/);
    expect(cards).toMatch(/checkout\.rateCard\.noRefund/);
    expect(cards).toMatch(/<s className="text-pa-stone-aa tabular-nums">\{formatQuotedEur\(m\.compareTotal, lang\)\}<\/s>/);
    expect(cards).toMatch(/t\("bookingWidget\.save", "Save"\)\} \{formatQuotedEur\(m\.savings, lang\)\}/);
    expect(cards).toMatch(/\{twoPartsVariant && m\.twoPartsCandidate && \(\s*<TwoPartsHint/);
    // tokens de contraste em fundo claro (nunca text-pa-gold como texto)
    expect(cards).not.toMatch(/text-pa-gold["\s]/);
    expect(cards).not.toMatch(/text-\[#9E9A90\]|text-\[#8B7355\]/);
    expect(cards).not.toMatch(URGENCY);
  });

  it("a reembolsável vem pré-selecionada no widget, no checkout (entrada, requote, cupão) e no servidor", () => {
    expect(widget).toMatch(/setSelectedRatePlanId\(preferredRatePlanId\(shownPlans, backendDefault, checkIn\)\)/);
    expect(widget).toMatch(/selectedId=\{selectedRatePlanId \?\? preferredRatePlanId\(quote\.ratePlanOptions, quote\.ratePlanId, checkIn\)\}/);
    expect(page).toMatch(/preferredRatePlanId\(shown, intent\.ratePlanId, intent\.checkIn\)/);
    expect(page).toMatch(/planStill\?\.ratePlanId \?\? preferredRatePlanId\(next\.ratePlanOptions, \(d as any\)\.ratePlanId, ci\)/);
    expect(page).toMatch(/stillThere\?\.ratePlanId \?\? preferredRatePlanId\(fresh\.ratePlanOptions, r\.ratePlanId, checkIn\)/);
    expect(read("server/services/trusted-checkout-quote.ts")).toMatch(/stay\.ratePlanId \|\| preferredRatePlanId\(parsed\.ratePlanOptions, parsed\.ratePlanId, stay\.checkIn\)/);
    // o antigo "a primeira das mostradas" / "a por omissão do Guesty" saiu
    expect(widget).not.toMatch(/shownPlans\.find\(o => o\.ratePlanId === backendDefault\) \|\| shownPlans\[0\]/);
    expect(page).not.toMatch(/next\.ratePlanOptions\?\.\[0\]\?\.ratePlanId/);
  });

  it("o widget só repete a linha das duas partes debaixo do total quando há uma tarifa única", () => {
    expect(widget).toMatch(/if \(\(quote\?\.ratePlanOptions\?\.length \?\? 0\) > 1\) return null;\s*\n\s*const refundable = quote\?\.ratePlanOptions\?\.find/);
  });
});

describe("as frases dos cartões nas 9 línguas", () => {
  it.each(LANGS)("%s", (lang) => {
    const l = locale(lang);
    expect(l.checkout.rateCard.noRefund).toBeTruthy();
    expect(l.checkout.rateCard.noRefund).not.toMatch(BANNED);
    expect(l.checkout.rateCard.noRefund).not.toMatch(URGENCY);
    expect(l.booking.freeCancellation).toMatch(/\{\{date/);
    expect(l.bookingWidget.save).toBeTruthy();
    expect(l.booking.flexibleRate).toBeTruthy();
    expect(l.booking.nonRefundable).toBeTruthy();
  });

  it("italiano no registo formal", () => {
    expect(locale("it").checkout.rateCard.noRefund).not.toMatch(/\b(tuo|tua|ti)\b/);
  });
});
