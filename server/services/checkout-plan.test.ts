import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { bookingIntents } from "../../drizzle/schema";
import {
  FULL_PAYMENT_GIFT_MS,
  effectiveFlexChoice,
  fullPaymentGiftPatchFor,
  withoutExpiredFlexGift,
  expiredRecoveryGiftPatch,
  isRecoveryGift,
  recoveryGiftExpired,
  PRIVATE_INTENT_FIELDS,
  PUBLIC_INTENT_FIELDS,
  grantFullPaymentGiftPatch,
  intentPaymentPlan,
  intentPolicyCode,
  isFullPaymentGift,
  offerForIntent,
  publicIntent,
  revokeFullPaymentGiftPatch,
  siteOriginForSchedule,
} from "./checkout-plan";
import { readTwoPartsConfig } from "./payment-plan";

describe("getIntent: projeção pública do intent", () => {
  const columns = Object.keys(getTableColumns(bookingIntents));

  it("cada coluna de booking_intents está classificada como pública ou privada", () => {
    // Uma coluna nova sem classificação parte este teste: decidir de propósito
    // se o browser a pode ver (o id do intent vai nos links de retoma).
    const classified = new Set<string>([...PUBLIC_INTENT_FIELDS, ...PRIVATE_INTENT_FIELDS]);
    expect(columns.filter((c) => !classified.has(c))).toEqual([]);
  });

  it("as duas listas não se sobrepõem e só têm colunas que existem", () => {
    const pub = new Set<string>(PUBLIC_INTENT_FIELDS);
    expect(PRIVATE_INTENT_FIELDS.filter((f) => pub.has(f))).toEqual([]);
    expect([...PUBLIC_INTENT_FIELDS, ...PRIVATE_INTENT_FIELDS].filter((f) => !columns.includes(f))).toEqual([]);
  });

  it("nunca devolve o PI, o Customer da Stripe nem o estado interno dos funis", () => {
    const row = Object.fromEntries(columns.map((c) => [c, `valor-${c}`]));
    const out = publicIntent(row);
    for (const secret of ["paymentIntentId", "stripeCustomerId", "recoveryStage", "recoveryOptout", "conciergeAlerted", "flexGiftPrevFlex", "flexImmediateConsentAt", "flexConsentVersion"]) {
      expect(out).not.toHaveProperty(secret);
    }
    expect(Object.keys(out).sort()).toEqual([...PUBLIC_INTENT_FIELDS].sort());
  });

  it("mantém todos os campos que o checkout, o Klarna e o PayPal leem", () => {
    // client/src/pages/checkout/CheckoutPage.tsx, KlarnaReturnPage.tsx, PayPalReturnPage.tsx
    const readByClient = [
      "id", "listingId", "propertyName", "propertySlug", "destination", "guestyQuoteId", "checkIn", "checkOut",
      "guests", "ratePlanId", "email", "guestFirstName", "guestLastName", "guestPhone", "nif", "quote", "extras",
      "reception", "flex", "status", "locale", "reservationId", "confirmationCode", "expiresAt", "flexGiftUntil",
    ];
    expect(readByClient.filter((f) => !(PUBLIC_INTENT_FIELDS as readonly string[]).includes(f))).toEqual([]);
  });

  it("não inventa campos que a linha não tem", () => {
    expect(publicIntent({ id: "x", status: "draft" })).toEqual({ id: "x", status: "draft" });
  });
});

describe("Flex oferecido por pagamento integral (spec 2.6, opção A)", () => {
  const now = Date.parse("2026-11-01T10:00:00Z");

  it("oferece o Flex por 7 dias e guarda a escolha anterior do hóspede", () => {
    expect(grantFullPaymentGiftPatch({ flex: false }, now)).toEqual({
      flexGiftUntil: new Date(now + FULL_PAYMENT_GIFT_MS),
      flex: true,
      flexGiftReason: "full_payment",
      flexGiftPrevFlex: false,
    });
    expect(grantFullPaymentGiftPatch({ flex: true }, now)?.flexGiftPrevFlex).toBe(true);
  });

  it("não mexe numa oferta já em vigor, seja do funil ou do próprio incentivo", () => {
    expect(grantFullPaymentGiftPatch({ flex: true, flexGiftUntil: new Date(now + 3_600_000) }, now)).toBeNull();
    expect(
      grantFullPaymentGiftPatch({ flex: true, flexGiftUntil: new Date(now + 3_600_000), flexGiftReason: "full_payment" }, now),
    ).toBeNull();
  });

  it("uma oferta expirada volta a ser dada", () => {
    expect(grantFullPaymentGiftPatch({ flex: true, flexGiftUntil: new Date(now - 1) }, now)).not.toBeNull();
  });

  it("ao passar a duas partes retira o Flex oferecido e repõe a escolha do hóspede", () => {
    expect(revokeFullPaymentGiftPatch({ flex: true, flexGiftReason: "full_payment", flexGiftPrevFlex: false })).toEqual({
      flexGiftUntil: null,
      flexGiftReason: null,
      flexGiftPrevFlex: null,
      flex: false,
    });
    expect(revokeFullPaymentGiftPatch({ flex: true, flexGiftReason: "full_payment", flexGiftPrevFlex: true })?.flex).toBe(true);
  });

  it("uma oferta expirada devolve a escolha guardada, nunca o flex=true forçado", () => {
    const expired = { flex: true, flexGiftReason: "full_payment", flexGiftPrevFlex: false, flexGiftUntil: new Date(now - 1) };
    expect(effectiveFlexChoice(expired, now)).toBe(false);
    expect(effectiveFlexChoice({ ...expired, flexGiftPrevFlex: true }, now)).toBe(true);
    // Sem escolha guardada: sem Flex.
    expect(effectiveFlexChoice({ ...expired, flexGiftPrevFlex: null }, now)).toBe(false);
    // Em vigor, conta o flex do intent.
    expect(effectiveFlexChoice({ ...expired, flexGiftUntil: new Date(now + 1) }, now)).toBe(true);
  });

  it("um Flex oferecido pelo funil de recuperação também volta à escolha do hóspede quando expira", () => {
    // Auditoria de 14 nov 2026: o contacto 3 ligava flex=true sem guardar a
    // escolha anterior; passadas as 72 h, quem voltava pelo link do email
    // encontrava o Flex escolhido e a pagar (10% das noites).
    const gift = { flex: true, flexGiftReason: "recovery", flexGiftPrevFlex: false, flexGiftUntil: new Date(now + 60_000) };
    expect(isRecoveryGift(gift)).toBe(true);
    expect(recoveryGiftExpired(gift, now)).toBe(false);
    expect(effectiveFlexChoice(gift, now)).toBe(true); // em vigor: oferecido, a 0 €
    expect(expiredRecoveryGiftPatch(gift, now)).toBeNull();

    const expired = { ...gift, flexGiftUntil: new Date(now - 1) };
    expect(recoveryGiftExpired(expired, now)).toBe(true);
    expect(effectiveFlexChoice(expired, now)).toBe(false);
    // Quem já tinha escolhido o Flex antes da oferta continua com ele.
    expect(effectiveFlexChoice({ ...expired, flexGiftPrevFlex: true }, now)).toBe(true);
    // Ofertas antigas, gravadas sem a escolha anterior: sem Flex.
    expect(effectiveFlexChoice({ ...expired, flexGiftPrevFlex: null }, now)).toBe(false);
    expect(expiredRecoveryGiftPatch(expired, now)).toEqual({ flexGiftUntil: null, flexGiftReason: null, flexGiftPrevFlex: null, flex: false });
    expect(expiredRecoveryGiftPatch({ ...expired, flexGiftPrevFlex: true }, now)?.flex).toBe(true);
    // Não mexe numa oferta por pagamento integral nem num intent sem oferta.
    expect(expiredRecoveryGiftPatch({ flex: true, flexGiftReason: "full_payment", flexGiftUntil: new Date(now - 1) }, now)).toBeNull();
    expect(expiredRecoveryGiftPatch({ flex: true }, now)).toBeNull();
  });

  it("renovar uma oferta expirada guarda a escolha original, não o Flex forçado", () => {
    const expired = { flex: true, flexGiftReason: "full_payment", flexGiftPrevFlex: false, flexGiftUntil: new Date(now - 1) };
    expect(grantFullPaymentGiftPatch(expired, now)?.flexGiftPrevFlex).toBe(false);
  });

  it("a vista do intent esconde a oferta expirada", () => {
    const expired = { id: "x", flex: true, flexGiftReason: "full_payment", flexGiftPrevFlex: false, flexGiftUntil: new Date(now - 1) };
    expect(withoutExpiredFlexGift(expired, now)).toMatchObject({ flex: false, flexGiftUntil: null, flexGiftReason: null });
    const live = { ...expired, flexGiftUntil: new Date(now + 1) };
    expect(withoutExpiredFlexGift(live, now)).toBe(live);
    // A oferta do funil de recuperação: igual.
    const recovery = { id: "y", flex: true, flexGiftReason: "recovery", flexGiftPrevFlex: false, flexGiftUntil: new Date(now - 1) };
    expect(withoutExpiredFlexGift(recovery, now)).toMatchObject({ id: "y", flex: false, flexGiftUntil: null, flexGiftReason: null });
    const liveRecovery = { ...recovery, flexGiftUntil: new Date(now + 1) };
    expect(withoutExpiredFlexGift(liveRecovery, now)).toBe(liveRecovery);
  });

  it("fullPaymentGiftPatchFor dá no integral com incentivo e retira em todos os outros casos", () => {
    const fresh = { flex: false };
    expect(fullPaymentGiftPatchFor(fresh, { plan: "full", incentiveApplied: "flex" }, now)).toMatchObject({ flexGiftReason: "full_payment" });
    expect(fullPaymentGiftPatchFor(fresh, { plan: "full", incentiveApplied: "none" }, now)).toBeNull();
    const gifted = { flex: true, flexGiftReason: "full_payment", flexGiftPrevFlex: false, flexGiftUntil: new Date(now + 1) };
    expect(fullPaymentGiftPatchFor(gifted, { plan: "two_parts", incentiveApplied: "none" }, now)).toMatchObject({ flex: false, flexGiftReason: null });
    // Reserva que deixou de ser elegível (tarifa NR, antecedência): a oferta sai.
    expect(fullPaymentGiftPatchFor(gifted, { plan: "full", incentiveApplied: "none" }, now)).toMatchObject({ flex: false, flexGiftReason: null });
    expect(fullPaymentGiftPatchFor(gifted, { plan: "full", incentiveApplied: "flex" }, now)).toBeNull();
  });

  it("nunca retira uma oferta do funil de recuperação", () => {
    expect(revokeFullPaymentGiftPatch({ flex: true, flexGiftReason: "recovery" })).toBeNull();
    expect(revokeFullPaymentGiftPatch({ flex: true, flexGiftUntil: new Date(now + 1), flexGiftReason: null })).toBeNull();
  });

  it("isFullPaymentGift e intentPaymentPlan tratam ausências como o caminho de hoje", () => {
    expect(isFullPaymentGift({})).toBe(false);
    expect(intentPaymentPlan({})).toBe("full");
    expect(intentPaymentPlan({ paymentPlan: "two_parts" })).toBe("two_parts");
    expect(intentPaymentPlan({ paymentPlan: "qualquer" })).toBe("full");
  });
});

describe("intentPolicyCode: a política da tarifa que o hóspede paga", () => {
  const quote = {
    ratePlanOptions: [
      { ratePlanId: "flex", name: "Reembolsável", cancellationPolicy: ["MODERATE"] },
      { ratePlanId: "nr", name: "Não-Reembolsável", cancellationPolicy: ["SUPER_STRICT"] },
      { ratePlanId: "half", name: "Meio", cancellationPolicy: ["FIRM"], cancellationFee: 50 },
    ],
  };

  it("lê o código do plano escolhido", () => {
    expect(intentPolicyCode({ ratePlanId: "flex", quote })).toBe("moderate");
    expect(intentPolicyCode({ ratePlanId: "nr", quote })).toBe("non_refundable");
  });

  it("sem plano, plano desconhecido ou taxa diferente de 100%: null (paga-se por inteiro)", () => {
    expect(intentPolicyCode({ ratePlanId: null, quote })).toBeNull();
    expect(intentPolicyCode({ ratePlanId: "outro", quote })).toBeNull();
    expect(intentPolicyCode({ ratePlanId: "half", quote })).toBeNull();
    expect(intentPolicyCode({ ratePlanId: "flex", quote: {} })).toBeNull();
  });
});

describe("offerForIntent", () => {
  const breakdown = { stayCents: 300_000, receptionCents: 0, extrasCents: 0, flexCents: 0 };
  const intent = {
    id: "11111111-2222-3333-4444-555555555555",
    ratePlanId: "flex",
    checkIn: "2027-07-15",
    quote: { currency: "EUR", ratePlanOptions: [{ ratePlanId: "flex", name: "Reembolsável", cancellationPolicy: ["MODERATE"] }] },
  };

  it("com a flag desligada não há oferta, por mais elegível que a reserva seja", () => {
    const offer = offerForIntent(intent, breakdown, { now: new Date("2026-11-01T10:00:00Z"), config: readTwoPartsConfig({}) });
    expect(offer).toEqual({ available: false, reason: "disabled" });
  });

  it("em modo live o motor da 2.ª parte ainda não existe: nunca há oferta", () => {
    const config = readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true", STRIPE_SECRET_KEY: "sk_live_x" });
    expect(offerForIntent(intent, breakdown, { now: new Date("2026-11-01T10:00:00Z"), config })).toEqual({
      available: false,
      reason: "engine_not_ready",
    });
  });

  it("em modo de teste, elegível e fora do grupo de controlo: oferta com as datas da política", () => {
    const config = { ...readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true", STRIPE_SECRET_KEY: "sk_test_x" }), holdout: 0 };
    const offer = offerForIntent(intent, breakdown, { now: new Date("2026-11-01T10:00:00Z"), config });
    expect(offer.available).toBe(true);
    if (offer.available) {
      expect(offer.schedule.chargeDate).toBe("2027-06-28");
      expect(offer.split).toEqual({ depositStayCents: 150_000, depositCents: 150_000, balanceCents: 150_000 });
    }
  });
});

describe("siteOriginForSchedule", () => {
  it("guarda o host do site configurado", () => {
    expect(siteOriginForSchedule({ SITE_URL: "https://www.portugalactive.com" })).toBe("www.portugalactive.com");
    expect(siteOriginForSchedule({})).toBe("unknown");
    expect(siteOriginForSchedule({ SITE_URL: "lixo" })).toBe("unknown");
  });
});
