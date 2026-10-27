/**
 * Plano de pagamento (docs/pagamento_duas_partes.md, 2.1, 2.2, 2.6 e Fase 1):
 * computePaymentOffer decide se a opção de duas partes existe; computePaymentPlan
 * decide o que se cobra hoje. Tudo puro: o dia da reserva, o id do intent e a
 * configuração entram como argumentos, por isso os testes não dependem do
 * relógio nem do env.
 */
import { describe, it, expect } from "vitest";
import {
  computeChargeBreakdown,
  computePaymentOffer,
  computePaymentPlan,
  fullPaymentDiscountCents,
  type PaymentPlan,
  type PaymentPlanOffer,
} from "./checkout-pricing";
import {
  addDays,
  inTwoPartsHoldout,
  readTwoPartsConfig,
  splitTwoParts,
  twoPartsInstants,
  twoPartsSchedule,
  type TwoPartsConfig,
} from "./payment-plan";

/** Dia da reserva no calendário de Lisboa. */
const HOJE = "2026-10-27";
/** Exemplo da spec 2.3: moderate, C a 28 jun 2027, muito para lá de hoje + 10. */
const CHECK_IN = "2027-07-15";

/** 2 500 € de estadia, receção com anfitrião (50 €), um transfer (120 €) e Flex (230 €). */
const BREAKDOWN = {
  stayCents: 250_000,
  receptionCents: 5_000,
  extrasCents: 12_000,
  flexCents: 23_000,
  totalCents: 290_000,
};

/** O que um ambiente de teste da Stripe com a flag ligada lê do env. */
const CONFIG_TESTE: TwoPartsConfig = readTwoPartsConfig({
  CHECKOUT_TWO_PARTS: "true",
  STRIPE_SECRET_KEY: "sk_test_fase1",
});

/**
 * Ids dentro e fora do grupo de controlo, procurados pela própria função em
 * vez de fixados à mão: se o hash ou o sal mudarem, os testes continuam a
 * testar os dois lados.
 */
function intentId(fraction: number, noControlo: boolean): string {
  for (let i = 0; i < 10_000; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    if (inTwoPartsHoldout(id, fraction) === noControlo) return id;
  }
  throw new Error(`nenhum id ${noControlo ? "dentro" : "fora"} do holdout ${fraction}`);
}
const FORA = intentId(CONFIG_TESTE.holdout, false);
const DENTRO = intentId(CONFIG_TESTE.holdout, true);

type OfferInput = Parameters<typeof computePaymentOffer>[0];

function oferta(over: Partial<OfferInput> = {}): PaymentPlanOffer {
  return computePaymentOffer({
    breakdown: BREAKDOWN,
    policy: "MODERATE",
    checkIn: CHECK_IN,
    bookingDate: HOJE,
    intentId: FORA,
    currency: "EUR",
    config: CONFIG_TESTE,
    ...over,
  });
}

function disponivel(o: PaymentPlanOffer): Extract<PaymentPlanOffer, { available: true }> {
  if (!o.available) throw new Error(`oferta indisponível: ${o.reason}`);
  return o;
}

describe("configuração de teste usada abaixo", () => {
  it("é a de um ambiente de teste Stripe com a flag ligada e os valores por omissão", () => {
    expect(CONFIG_TESTE).toMatchObject({
      enabled: true,
      livemode: false,
      engineReady: false,
      holdout: 0.1,
      minStayCents: 100_000,
      incentive: "flex",
      warnings: [],
    });
    expect(inTwoPartsHoldout(FORA, 0.1)).toBe(false);
    expect(inTwoPartsHoldout(DENTRO, 0.1)).toBe(true);
  });
});

describe("fullPaymentDiscountCents — 1% da estadia ao euro (opção B, 2.6)", () => {
  it.each([
    [250_000, 2_500], // 2 500 € → 25 €
    [225_000, 2_300], // 2 250 € → 22,50 € → 23 € (meio euro arredonda para cima)
    [224_999, 2_200], // 2 249,99 € → 22,4999 € → 22 €
    [123_456, 1_200], // 1 234,56 € → 12,35 € → 12 €
    [100_000, 1_000], // no mínimo, 10 €
    [0, 0],
  ])("estadia de %i cêntimos → desconto de %i cêntimos", (stay, desconto) => {
    expect(fullPaymentDiscountCents(stay)).toBe(desconto);
  });

  it("é sempre um número inteiro de euros", () => {
    for (let stay = 100_000; stay < 1_000_000; stay += 7_919) {
      expect(fullPaymentDiscountCents(stay) % 100).toBe(0);
    }
  });
});

describe("computePaymentOffer — quando a opção de duas partes existe (spec 2.1)", () => {
  it("com a flag desligada não existe, seja qual for o resto (golden rule da Fase 1)", () => {
    const desligada = { ...CONFIG_TESTE, enabled: false };
    expect(oferta({ config: desligada })).toEqual({ available: false, reason: "disabled" });
    // Nem o modo live, nem o controlo, nem a moeda, nem a tarifa passam à frente.
    expect(
      oferta({
        config: { ...desligada, livemode: true },
        intentId: DENTRO,
        currency: "USD",
        policy: "NON_REFUNDABLE",
      }),
    ).toEqual({ available: false, reason: "disabled" });
    // O env de produção de hoje (nada definido) dá exatamente isto.
    expect(oferta({ config: readTwoPartsConfig({}) })).toEqual({ available: false, reason: "disabled" });
  });

  it("em live sem o motor da segunda cobrança não existe, mesmo com a flag ligada por engano", () => {
    const live = readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true", STRIPE_SECRET_KEY: "sk_live_x" });
    expect(oferta({ config: live })).toEqual({ available: false, reason: "engine_not_ready" });
    // Sem chave conta como live: na dúvida, fechado.
    const semChave = readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true" });
    expect(oferta({ config: semChave })).toEqual({ available: false, reason: "engine_not_ready" });
  });

  it("em live com o motor pronto (Fase 2) existe: a trava é o motor, não o modo live", () => {
    expect(oferta({ config: { ...CONFIG_TESTE, livemode: true, engineReady: true } }).available).toBe(true);
  });

  it("um intent do grupo de controlo não vê a opção; um de fora vê", () => {
    expect(oferta({ intentId: DENTRO })).toEqual({ available: false, reason: "holdout" });
    expect(oferta({ intentId: FORA }).available).toBe(true);
  });

  it("holdout 0 deixa todos ver a opção; holdout 1 esconde-a de todos", () => {
    expect(oferta({ intentId: DENTRO, config: { ...CONFIG_TESTE, holdout: 0 } }).available).toBe(true);
    expect(oferta({ intentId: FORA, config: { ...CONFIG_TESTE, holdout: 1 } })).toEqual({
      available: false,
      reason: "holdout",
    });
  });

  it("só em EUR (maiúsculas ou minúsculas)", () => {
    expect(oferta({ currency: "eur" }).available).toBe(true);
    for (const c of ["USD", "GBP", ""]) expect(oferta({ currency: c })).toEqual({ available: false, reason: "currency" });
  });

  it.each([
    ["não reembolsável", "NON_REFUNDABLE"],
    ["super_strict (alias de não reembolsável)", "super_strict"],
    ["código nulo", null],
    ["código ausente", undefined],
    ["código desconhecido", "flexible"],
    ["códigos que discordam", ["MODERATE", "FIRM"]],
  ])("tarifa %s: sem opção", (_nome, policy) => {
    expect(oferta({ policy })).toEqual({ available: false, reason: "policy" });
  });

  it("C tem de cair a pelo menos 10 dias de hoje: no limite existe, um dia antes não", () => {
    // moderate: check-in a hoje + 27 → C = hoje + 10.
    const limite = addDays(HOJE, 27);
    const o = disponivel(oferta({ checkIn: limite }));
    expect(o.schedule.chargeDate).toBe(addDays(HOJE, 10));
    expect(oferta({ checkIn: addDays(HOJE, 26) })).toEqual({ available: false, reason: "lead_time" });
  });

  it.each([
    ["moderate", 27],
    ["firm", 34],
    ["strict", 50],
    ["strict_60", 80],
  ])("%s: check-in mínimo a %i dias", (code, dias) => {
    expect(oferta({ policy: code, checkIn: addDays(HOJE, dias) }).available).toBe(true);
    expect(oferta({ policy: code, checkIn: addDays(HOJE, dias - 1) })).toEqual({ available: false, reason: "lead_time" });
  });

  it("estadia abaixo do mínimo configurado: sem opção", () => {
    const b = (stayCents: number) => ({ ...BREAKDOWN, stayCents });
    expect(oferta({ breakdown: b(100_000) }).available).toBe(true);
    expect(oferta({ breakdown: b(99_999) })).toEqual({ available: false, reason: "min_stay" });
    // O mínimo vem da configuração, não da constante.
    const alto = { ...CONFIG_TESTE, minStayCents: 150_000 };
    expect(oferta({ breakdown: b(120_000), config: alto })).toEqual({ available: false, reason: "min_stay" });
    expect(oferta({ breakdown: b(150_000), config: alto }).available).toBe(true);
  });

  it("o mínimo conta só a estadia: extras, receção e Flex não fazem uma estadia de 900 € elegível", () => {
    const b = { stayCents: 90_000, receptionCents: 9_000, extrasCents: 50_000, flexCents: 0 };
    expect(oferta({ breakdown: b })).toEqual({ available: false, reason: "min_stay" });
  });

  it("datas ilegíveis: sem opção, sem rebentar", () => {
    expect(oferta({ checkIn: "2027-02-30" })).toEqual({ available: false, reason: "invalid" });
    expect(oferta({ bookingDate: "ontem" })).toEqual({ available: false, reason: "invalid" });
  });

  it("quando existe, traz o calendário, os instantes e a divisão da spec", () => {
    const o = disponivel(oferta());
    const s = twoPartsSchedule("MODERATE", CHECK_IN)!;
    expect(o.schedule).toEqual(s);
    expect(o.instants).toEqual(twoPartsInstants(s));
    expect(o.instants.chargeAt.toISOString()).toBe("2027-06-28T09:00:00.000Z");
    expect(o.split).toEqual(splitTwoParts(BREAKDOWN));
    expect(o.split).toEqual({ depositStayCents: 125_000, depositCents: 165_000, balanceCents: 125_000 });
    expect(o.incentive).toBe("flex");
    expect(o.discountCents).toBe(0);
  });

  it.each([
    ["moderate", "2027-07-08", "2027-06-28"],
    ["firm", "2027-07-01", "2027-06-21"],
    ["strict", "2027-06-15", "2027-06-05"],
    ["strict_60", "2027-05-16", "2027-05-06"],
  ])("%s: D e C por política", (code, d, c) => {
    const o = disponivel(oferta({ policy: code }));
    expect(o.schedule.freeCancelDeadline).toBe(d);
    expect(o.schedule.chargeDate).toBe(c);
  });

  it("o desconto só existe na opção B; nas outras é 0", () => {
    expect(disponivel(oferta({ config: { ...CONFIG_TESTE, incentive: "discount" } }))).toMatchObject({
      incentive: "discount",
      discountCents: 2_500,
    });
    expect(disponivel(oferta({ config: { ...CONFIG_TESTE, incentive: "none" } }))).toMatchObject({
      incentive: "none",
      discountCents: 0,
    });
  });
});

describe("computePaymentPlan — o que se cobra hoje (spec 2.1, 2.2, 2.6)", () => {
  const plano = (offer: PaymentPlanOffer, requested: PaymentPlan, wallet = false, breakdown = BREAKDOWN) =>
    computePaymentPlan({ breakdown, offer, requested, wallet });

  const indisponiveis: Array<[string, PaymentPlanOffer]> = [
    ["flag desligada", oferta({ config: { ...CONFIG_TESTE, enabled: false } })],
    ["live sem motor", oferta({ config: { ...CONFIG_TESTE, livemode: true } })],
    ["grupo de controlo", oferta({ intentId: DENTRO })],
    ["moeda", oferta({ currency: "USD" })],
    ["não reembolsável", oferta({ policy: "NON_REFUNDABLE" })],
    ["código nulo", oferta({ policy: null })],
    ["C < hoje + 10", oferta({ checkIn: addDays(HOJE, 26) })],
    ["estadia < mínimo", oferta({ breakdown: { ...BREAKDOWN, stayCents: 99_999 } })],
    ["datas ilegíveis", oferta({ checkIn: "amanhã" })],
  ];

  it("flags ausentes: exatamente a cobrança de hoje (o total do breakdown, sem incentivo)", () => {
    const offer = oferta({ config: readTwoPartsConfig({}) });
    expect(plano(offer, "full")).toEqual({
      offer,
      plan: "full",
      requestedUnavailable: false,
      forcedFullByWallet: false,
      incentiveApplied: "none",
      amountDueTodayCents: BREAKDOWN.totalCents,
      balanceCents: 0,
    });
    expect(plano(offer, "full", true)).toMatchObject({ plan: "full", amountDueTodayCents: BREAKDOWN.totalCents, forcedFullByWallet: false });
  });

  it.each(indisponiveis)("sem opção (%s): pagamento integral sem incentivo, mesmo na opção B", (_nome, offer) => {
    expect(offer.available).toBe(false);
    expect(plano(offer, "full")).toMatchObject({
      plan: "full",
      incentiveApplied: "none",
      amountDueTodayCents: BREAKDOWN.totalCents,
      balanceCents: 0,
      requestedUnavailable: false,
    });
  });

  it("sem opção na opção B: a tarifa NR, a antecedência curta e a estadia pequena não levam o 1%", () => {
    const b = { ...CONFIG_TESTE, incentive: "discount" as const };
    for (const offer of [
      oferta({ config: b, policy: "NON_REFUNDABLE" }),
      oferta({ config: b, policy: null }),
      oferta({ config: b, checkIn: addDays(HOJE, 26) }),
      oferta({ config: b, breakdown: { ...BREAKDOWN, stayCents: 99_999 } }),
      oferta({ config: b, intentId: DENTRO }),
    ]) {
      expect(plano(offer, "full")).toMatchObject({ incentiveApplied: "none", amountDueTodayCents: BREAKDOWN.totalCents });
    }
  });

  it.each(indisponiveis)("pedido de duas partes sem opção (%s): integral e sinalizado, nunca em silêncio", (_nome, offer) => {
    expect(plano(offer, "two_parts")).toMatchObject({
      plan: "full",
      requestedUnavailable: true,
      forcedFullByWallet: false,
      incentiveApplied: "none",
      amountDueTodayCents: BREAKDOWN.totalCents,
      balanceCents: 0,
    });
  });

  it("duas partes elegível: hoje paga-se a divisão da spec, depois o resto, sem incentivo", () => {
    const offer = oferta();
    const d = plano(offer, "two_parts");
    expect(d).toEqual({
      offer,
      plan: "two_parts",
      requestedUnavailable: false,
      forcedFullByWallet: false,
      incentiveApplied: "none",
      amountDueTodayCents: 165_000, // 1 250 € + 50 € + 120 € + 230 €
      balanceCents: 125_000,
    });
    expect(d.amountDueTodayCents + d.balanceCents).toBe(BREAKDOWN.totalCents);
  });

  it("duas partes com estadia de cêntimos ímpares: o cêntimo fica na primeira parte e a soma bate", () => {
    const b = { stayCents: 250_001, receptionCents: 0, extrasCents: 0, flexCents: 0, totalCents: 250_001 };
    const d = plano(oferta({ breakdown: b }), "two_parts", false, b);
    expect(d).toMatchObject({ plan: "two_parts", amountDueTodayCents: 125_100, balanceCents: 124_901 });
    expect(d.amountDueTodayCents + d.balanceCents).toBe(b.totalCents);
  });

  it("duas partes na opção B: ao preço apresentado, sem o desconto do pagamento integral", () => {
    const offer = oferta({ config: { ...CONFIG_TESTE, incentive: "discount" } });
    expect(plano(offer, "two_parts")).toMatchObject({
      plan: "two_parts",
      incentiveApplied: "none",
      amountDueTodayCents: 165_000,
      balanceCents: 125_000,
    });
  });

  it("wallet com duas partes pedidas: integral COM o incentivo (o hóspede não perde a oferta por usar Apple Pay)", () => {
    expect(plano(oferta(), "two_parts", true)).toMatchObject({
      plan: "full",
      forcedFullByWallet: true,
      requestedUnavailable: false,
      incentiveApplied: "flex",
      amountDueTodayCents: BREAKDOWN.totalCents,
      balanceCents: 0,
    });
    const b = oferta({ config: { ...CONFIG_TESTE, incentive: "discount" } });
    expect(plano(b, "two_parts", true)).toMatchObject({
      plan: "full",
      forcedFullByWallet: true,
      incentiveApplied: "discount",
      amountDueTodayCents: BREAKDOWN.totalCents - 2_500,
    });
  });

  it("wallet sem opção: integral sinalizado como pedido indisponível, não como forçado pela wallet", () => {
    expect(plano(oferta({ policy: "NON_REFUNDABLE" }), "two_parts", true)).toMatchObject({
      plan: "full",
      forcedFullByWallet: false,
      requestedUnavailable: true,
      incentiveApplied: "none",
    });
  });

  it("integral elegível (opção A): incentivo Flex aplicado; o total já vem com o Flex a 0 do breakdown", () => {
    const comOferta = { ...BREAKDOWN, flexCents: 0, totalCents: BREAKDOWN.totalCents - BREAKDOWN.flexCents };
    for (const wallet of [false, true]) {
      expect(plano(oferta(), "full", wallet, comOferta)).toMatchObject({
        plan: "full",
        forcedFullByWallet: false,
        requestedUnavailable: false,
        incentiveApplied: "flex",
        amountDueTodayCents: comOferta.totalCents,
        balanceCents: 0,
      });
    }
  });

  it("integral elegível na opção C (none): sem incentivo, total do breakdown", () => {
    const offer = oferta({ config: { ...CONFIG_TESTE, incentive: "none" } });
    expect(plano(offer, "full")).toMatchObject({ incentiveApplied: "none", amountDueTodayCents: BREAKDOWN.totalCents });
  });

  it("integral elegível na opção B: 1% da estadia ao euro abatido ao total", () => {
    const offer = oferta({ config: { ...CONFIG_TESTE, incentive: "discount" } });
    expect(plano(offer, "full")).toMatchObject({
      plan: "full",
      incentiveApplied: "discount",
      amountDueTodayCents: 290_000 - 2_500,
      balanceCents: 0,
    });
  });

  it("opção B: o desconto conta só a estadia; receção, extras e Flex não o mudam", () => {
    const config = { ...CONFIG_TESTE, incentive: "discount" as const };
    const semNada = { stayCents: 250_000, receptionCents: 0, extrasCents: 0, flexCents: 0, totalCents: 250_000 };
    const comTudo = { stayCents: 250_000, receptionCents: 9_000, extrasCents: 48_000, flexCents: 23_000, totalCents: 330_000 };
    const a = plano(oferta({ breakdown: semNada, config }), "full", false, semNada);
    const b = plano(oferta({ breakdown: comTudo, config }), "full", false, comTudo);
    expect(semNada.totalCents - a.amountDueTodayCents).toBe(2_500);
    expect(comTudo.totalCents - b.amountDueTodayCents).toBe(2_500);
  });

  it("invariantes em todas as combinações de oferta, pedido e método", () => {
    const ofertas: PaymentPlanOffer[] = [
      oferta(),
      oferta({ config: { ...CONFIG_TESTE, incentive: "discount" } }),
      oferta({ config: { ...CONFIG_TESTE, incentive: "none" } }),
      ...indisponiveis.map(([, o]) => o),
    ];
    for (const offer of ofertas) {
      for (const requested of ["full", "two_parts"] as const) {
        for (const wallet of [false, true]) {
          const d = plano(offer, requested, wallet);
          const duas = offer.available && requested === "two_parts" && !wallet;
          const desconto = d.incentiveApplied === "discount" && offer.available ? offer.discountCents : 0;
          expect(d.plan).toBe(duas ? "two_parts" : "full");
          expect(d.balanceCents > 0).toBe(duas);
          // Nada se perde nem se inventa: hoje + depois + desconto = total.
          expect(d.amountDueTodayCents + d.balanceCents + desconto).toBe(BREAKDOWN.totalCents);
          // Incentivo só no pagamento integral de uma reserva elegível.
          if (!offer.available || d.plan === "two_parts") expect(d.incentiveApplied).toBe("none");
          else expect(d.incentiveApplied).toBe(offer.incentive);
          expect(d.requestedUnavailable).toBe(requested === "two_parts" && !offer.available);
          expect(d.forcedFullByWallet).toBe(offer.available && requested === "two_parts" && wallet);
          expect(d.offer).toBe(offer);
        }
      }
    }
  });
});

describe("do intent ao montante: breakdown canónico → oferta → plano", () => {
  // Estadia de 2 500 € (noites 2 300 €, Flex = 10% das noites = 230 €),
  // receção com anfitrião e um transfer Porto: o caso típico do piloto.
  const intent = {
    quoteTotal: 2_500,
    totalNights: 2_300,
    nights: 7,
    reception: { type: "hosted" as const, late: false },
    extras: [{ sku: "transfer-porto", qty: 1 }],
  };

  it("opção A: em duas partes o Flex escolhido é vendido e pago hoje; no integral entra oferecido a 0 €", () => {
    const vendido = computeChargeBreakdown({ ...intent, flex: true });
    expect(vendido).toMatchObject({ stayCents: 250_000, receptionCents: 5_000, extrasCents: 12_000, flexCents: 23_000, totalCents: 290_000 });

    const offer = oferta({ breakdown: vendido });
    const duas = computePaymentPlan({ breakdown: vendido, offer, requested: "two_parts", wallet: false });
    expect(duas).toMatchObject({ plan: "two_parts", amountDueTodayCents: 165_000, balanceCents: 125_000 });

    // O Flex oferecido a quem paga tudo usa o mecanismo do funil (flexGift).
    const oferecido = computeChargeBreakdown({ ...intent, flex: true, flexGift: true });
    expect(oferecido.flexCents).toBe(0);
    const integral = computePaymentPlan({ breakdown: oferecido, offer, requested: "full", wallet: false });
    expect(integral).toMatchObject({ plan: "full", incentiveApplied: "flex", amountDueTodayCents: 267_000 });

    // A oferta não depende do Flex: a estadia, que decide a elegibilidade, é a mesma.
    expect(oferta({ breakdown: oferecido }).available).toBe(true);
  });

  it("opção B acumulável com cupão: o 1% é sobre a estadia já com cupão, e o Flex escolhido continua a pagar-se", () => {
    // 2 500 € com cupão de 10% → 2 250 € de estadia no snapshot da quote.
    const comCupao = { ...intent, quoteTotal: 2_250, totalNights: 2_070, flex: true };
    const b = computeChargeBreakdown(comCupao);
    expect(b).toMatchObject({ stayCents: 225_000, flexCents: 20_700, totalCents: 225_000 + 5_000 + 12_000 + 20_700 });

    const offer = disponivel(oferta({ breakdown: b, config: { ...CONFIG_TESTE, incentive: "discount" } }));
    // 1% de 2 250 € = 22,50 € → 23 € (ao euro).
    expect(offer.discountCents).toBe(2_300);

    const integral = computePaymentPlan({ breakdown: b, offer, requested: "full", wallet: false });
    // fullTodayCents = estadia − desconto + receção + extras + Flex (spec 2.6).
    expect(integral.amountDueTodayCents).toBe(225_000 - 2_300 + 5_000 + 12_000 + 20_700);

    const duas = computePaymentPlan({ breakdown: b, offer, requested: "two_parts", wallet: false });
    expect(duas).toMatchObject({ amountDueTodayCents: 112_500 + 5_000 + 12_000 + 20_700, balanceCents: 112_500 });
  });
});
