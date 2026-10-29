import { describe, expect, it } from "vitest";
import fs from "node:fs";
import i18next from "i18next";
import en from "../../client/src/i18n/locales/en.json";
import pt from "../../client/src/i18n/locales/pt.json";
import fr from "../../client/src/i18n/locales/fr.json";
import es from "../../client/src/i18n/locales/es.json";
import it_ from "../../client/src/i18n/locales/it.json";
import de from "../../client/src/i18n/locales/de.json";
import nl from "../../client/src/i18n/locales/nl.json";
import sv from "../../client/src/i18n/locales/sv.json";
import fi from "../../client/src/i18n/locales/fi.json";
import {
  LIMIT_DECLINE_CODES,
  NO_RETRY_DECLINE_CODES,
  PAYMENT_ERROR_KEYS,
  classifyPaymentError,
  humanPaymentError,
  needsPriceRefresh,
  paymentErrorActions,
} from "@/lib/paymentErrors";

/**
 * Pagamento recusado (auditoria do funil, out/2026, n.º 4): um só aviso
 * traduzido para cartão, wallets, PayPal e Klarna, sem nunca sugerir repetir o
 * mesmo cartão numa recusa por fraude/perda/roubo/do_not_honor, e sem nunca
 * oferecer outro pagamento quando o anterior já passou ou está a processar.
 */

const LOCALES: Record<string, Record<string, unknown>> = { en, pt, fr, es, it: it_, de, nl, sv, fi };
const read = (p: string) => fs.readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const get = (o: unknown, k: string): unknown =>
  k.split(".").reduce<unknown>((a, p) => (a && typeof a === "object" ? (a as Record<string, unknown>)[p] : undefined), o);

const card = (decline_code?: string, code = "card_declined") => ({ type: "card_error", code, decline_code, message: "Your card was declined." });
const server = (message: string) => new Error(message);

describe("classifyPaymentError: códigos da Stripe", () => {
  it("limite do cartão: recusa pelo valor (a única que pode oferecer as duas partes), sem repetir o mesmo cartão", () => {
    for (const c of ["insufficient_funds", "card_velocity_exceeded", "withdrawal_count_limit_exceeded", "invalid_amount"]) {
      expect(classifyPaymentError(card(c))).toEqual({ key: "payment.errors.declinedLimit", kind: "decline_limit", retrySameCard: false });
    }
  });

  it("transação duplicada: ver se já há um pagamento, nunca outro método (revisão do PR #176)", () => {
    expect(classifyPaymentError(card("duplicate_transaction"))).toEqual({
      key: "payment.errors.duplicateTransaction", kind: "blocked", retrySameCard: false,
    });
    expect(NO_RETRY_DECLINE_CODES as readonly string[]).not.toContain("duplicate_transaction");
  });

  it.each(["fraudulent", "do_not_honor", "stolen_card", "lost_card", "pickup_card", "generic_decline"])(
    "%s: recusa genérica, sem motivo revelado nem 'tente de novo'",
    (code) => {
      expect(classifyPaymentError(card(code))).toEqual({ key: "payment.errors.declinedGeneric", kind: "decline", retrySameCard: false });
    },
  );

  it("todos os códigos sem nova tentativa caem na recusa genérica", () => {
    for (const code of NO_RETRY_DECLINE_CODES) {
      const info = classifyPaymentError(card(code));
      expect(info.retrySameCard, code).toBe(false);
      expect(info.kind, code).toBe("decline");
    }
  });

  it("decline_code desconhecido ou ausente: recusa genérica", () => {
    expect(classifyPaymentError(card("some_new_code")).key).toBe("payment.errors.declinedGeneric");
    expect(classifyPaymentError(card(undefined)).key).toBe("payment.errors.declinedGeneric");
    expect(classifyPaymentError({ type: "card_error", message: "x" }).key).toBe("payment.errors.declinedGeneric");
  });

  it("cartão expirado ou não aceite: outro cartão ou método", () => {
    expect(classifyPaymentError(card("expired_card")).key).toBe("payment.errors.cardExpired");
    expect(classifyPaymentError({ type: "card_error", code: "expired_card" }).key).toBe("payment.errors.cardExpired");
    expect(classifyPaymentError(card("card_not_supported")).key).toBe("payment.errors.cardNotSupported");
    expect(classifyPaymentError(card("currency_not_supported")).key).toBe("payment.errors.cardNotSupported");
  });

  it("dados do cartão por corrigir: corrigir e repetir", () => {
    expect(classifyPaymentError({ type: "card_error", code: "incorrect_cvc" })).toEqual({ key: "payment.errors.incorrectCvc", kind: "card_details", retrySameCard: true });
    expect(classifyPaymentError({ type: "card_error", code: "incorrect_number" }).key).toBe("payment.errors.incorrectNumber");
    expect(classifyPaymentError({ type: "card_error", code: "invalid_expiry_year" }).key).toBe("payment.errors.cardDetails");
  });

  it("falhas passageiras do banco e 3DS por concluir: repetir é seguro", () => {
    expect(classifyPaymentError(card("processing_error"))).toEqual({ key: "payment.errors.bankUnavailable", kind: "retry", retrySameCard: true });
    expect(classifyPaymentError(card("try_again_later")).key).toBe("payment.errors.bankUnavailable");
    expect(classifyPaymentError({ type: "invalid_request_error", code: "payment_intent_authentication_failure" }).key).toBe("payment.errors.authenticationFailed");
    expect(classifyPaymentError(card("authentication_required")).kind).toBe("retry");
  });

  it("validação do próprio formulário da Stripe: a mensagem dela (já traduzida)", () => {
    const err = { type: "validation_error", code: "incomplete_number", message: "O número do cartão está incompleto." };
    expect(classifyPaymentError(err)).toEqual({ key: null, kind: "card_details", retrySameCard: true });
    expect(humanPaymentError(err, (k) => k)).toBe("O número do cartão está incompleto.");
    expect(humanPaymentError({ type: "validation_error" }, (k) => k)).toBe("payment.errors.cardValidationFailed");
  });

  it("PI noutro estado (já pago ou a processar): nunca convidar a pagar outra vez", () => {
    expect(classifyPaymentError({ type: "invalid_request_error", code: "payment_intent_unexpected_state" })).toEqual({
      key: "payment.errors.stillProcessing", kind: "blocked", retrySameCard: false,
    });
  });

  it("rede e limite de pedidos da Stripe", () => {
    expect(classifyPaymentError({ type: "api_connection_error", message: "x" }).key).toBe("payment.errors.network");
    expect(classifyPaymentError({ type: "rate_limit_error", message: "x" }).key).toBe("payment.errors.rateLimitError");
  });
});

describe("classifyPaymentError: mensagens do servidor (inglês técnico)", () => {
  it.each([
    ["two-part payment is not available for this booking; refresh to see the options", "payment.errors.twoPartsUnavailable", "two_parts_unavailable"],
    ["the authorisation for the second payment must be accepted", "payment.mandateMissing", "mandate_missing"],
    ["quote expired; refresh the price before paying", "payment.errors.quoteExpired", "stale"],
    ["Please refresh your dates and price before continuing.", "payment.errors.quoteExpired", "stale"],
    ["dates no longer available", "payment.errors.datesGone", "stale"],
    // PayPal/Klarna (wallet-price-validation.ts): antes caía no genérico "tente novamente"
    ["The price or booking details have changed. Please refresh before paying.", "payment.errors.priceChanged", "stale"],
    ["payment is still processing; do not pay again", "payment.errors.stillProcessing", "blocked"],
    ["already paid", "payment.errors.alreadyPaidShort", "blocked"],
    ["payment could not be prepared; retry the same checkout", "payment.errors.prepareFailed", "retry"],
    ["payment could not be saved; retry the same checkout", "payment.errors.saveFailed", "retry"],
    ["checkout state could not be saved", "payment.errors.saveFailed", "retry"],
    ["Failed to fetch", "payment.errors.network", "retry"],
    ["Stripe failed to load", "payment.errors.network", "retry"],
    ["invalid total", "payment.errors.genericRetry", "generic"],
    ["payment does not belong to this checkout", "payment.errors.genericRetry", "generic"],
  ])("%s", (message, key, kind) => {
    const info = classifyPaymentError(server(message));
    expect(info.key).toBe(key);
    expect(info.kind).toBe(kind);
  });

  it("a mensagem real do servidor para PayPal/Klarna acende o 'Atualizar preço'", () => {
    const src = read("server/services/wallet-price-validation.ts");
    const message = /const changed = \(\) => new Error\('([^']+)'\)/.exec(src)?.[1];
    expect(message).toBeTruthy();
    const info = classifyPaymentError(server(message!));
    expect(info).toEqual({ key: "payment.errors.priceChanged", kind: "stale", retrySameCard: false });
    expect(needsPriceRefresh(info)).toBe(true);
    expect(needsPriceRefresh(classifyPaymentError(server("quote expired; refresh the price before paying")))).toBe(true);
    expect(needsPriceRefresh(classifyPaymentError(server("dates no longer available")))).toBe(false);
    expect(needsPriceRefresh(classifyPaymentError(card("insufficient_funds")))).toBe(false);
    expect(needsPriceRefresh(null)).toBe(false);
    // e o formulário usa-a no erro do PayPal/Klarna
    expect(read("client/src/components/booking/CheckoutPaymentForm.tsx")).toMatch(
      /if \(isQuoteExpiredError\(err\) \|\| needsPriceRefresh\(view\.info\)\) props\.onQuoteExpired\?\.\(\);/,
    );
  });

  it("um erro sem nada conhecido cai na mensagem genérica", () => {
    expect(classifyPaymentError(undefined).key).toBe("payment.errors.genericRetry");
    expect(classifyPaymentError(null).key).toBe("payment.errors.genericRetry");
    expect(classifyPaymentError("boom").key).toBe("payment.errors.genericRetry");
  });
});

describe("paymentErrorActions: até três saídas, nunca uma dupla cobrança", () => {
  const decline = classifyPaymentError(card("insufficient_funds"));

  it("recusa em 'tudo agora' com a oferta do servidor: duas partes, outro método e concierge", () => {
    expect(paymentErrorActions(decline, { twoPartsOffered: true, plan: "full" })).toEqual({ twoParts: true, otherMethod: true, concierge: true });
  });

  it("duas partes só nas recusas pelo limite do cartão (o cartão escrito fica no formulário)", () => {
    for (const c of LIMIT_DECLINE_CODES) {
      expect(paymentErrorActions(classifyPaymentError(card(c)), { twoPartsOffered: true, plan: "full" }).twoParts, c).toBe(true);
    }
  });

  it.each([
    "fraudulent", "lost_card", "stolen_card", "pickup_card", "restricted_card", "security_violation", "do_not_honor",
    "expired_card", "card_not_supported", "currency_not_supported", "generic_decline", "card_declined", "do_not_try_again",
  ])("%s: nunca 'pagar em duas partes' (seria repetir o mesmo cartão), mas outro método e concierge", (code) => {
    expect(paymentErrorActions(classifyPaymentError(card(code)), { twoPartsOffered: true, plan: "full" })).toEqual({
      twoParts: false, otherMethod: true, concierge: true,
    });
  });

  it("todas as recusas sem nova tentativa: nunca duas partes", () => {
    for (const code of NO_RETRY_DECLINE_CODES) {
      expect(paymentErrorActions(classifyPaymentError(card(code)), { twoPartsOffered: true, plan: "full" }).twoParts, code).toBe(false);
    }
  });

  it("transação duplicada: só o concierge (nem outro método nem duas partes)", () => {
    expect(paymentErrorActions(classifyPaymentError(card("duplicate_transaction")), { twoPartsOffered: true, plan: "full" })).toEqual({
      twoParts: false, otherMethod: false, concierge: true,
    });
  });

  it("sem oferta, ou já em duas partes: sem a opção das duas partes", () => {
    expect(paymentErrorActions(decline, { twoPartsOffered: false, plan: "full" }).twoParts).toBe(false);
    expect(paymentErrorActions(decline, { twoPartsOffered: false }).twoParts).toBe(false);
    expect(paymentErrorActions(decline, { twoPartsOffered: true, plan: "two_parts" }).twoParts).toBe(false);
  });

  it("já pago / a processar: só o concierge (nunca outro método nem duas partes)", () => {
    for (const message of ["already paid", "payment is still processing; do not pay again"]) {
      expect(paymentErrorActions(classifyPaymentError(server(message)), { twoPartsOffered: true, plan: "full" })).toEqual({
        twoParts: false, otherMethod: false, concierge: true,
      });
    }
    expect(paymentErrorActions({ kind: "blocked" }, { twoPartsOffered: true, plan: "full" }).otherMethod).toBe(false);
  });

  it("preço expirado ou mudado, datas ocupadas, duas partes retiradas: só o concierge", () => {
    for (const message of ["quote expired", "dates no longer available", "two-part payment is not available", "The price or booking details have changed. Please refresh before paying."]) {
      expect(paymentErrorActions(classifyPaymentError(server(message)), { twoPartsOffered: true, plan: "full" })).toEqual({
        twoParts: false, otherMethod: false, concierge: true,
      });
    }
  });

  it("dados do cartão por corrigir e autorização em falta: nenhuma ação (o campo diz o que fazer)", () => {
    expect(paymentErrorActions(classifyPaymentError({ type: "card_error", code: "incorrect_cvc" }), { twoPartsOffered: true, plan: "full" })).toEqual({
      twoParts: false, otherMethod: false, concierge: false,
    });
    expect(paymentErrorActions(classifyPaymentError(server("the authorisation for the second payment must be accepted")), { twoPartsOffered: true, plan: "two_parts" })).toEqual({
      twoParts: false, otherMethod: false, concierge: false,
    });
  });

  it("falha passageira ou desconhecida: outro método e concierge", () => {
    expect(paymentErrorActions(classifyPaymentError(card("processing_error")), { twoPartsOffered: true, plan: "full" })).toEqual({
      twoParts: false, otherMethod: true, concierge: true,
    });
    expect(paymentErrorActions(classifyPaymentError(server("weird")), { twoPartsOffered: true, plan: "full" })).toEqual({
      twoParts: false, otherMethod: true, concierge: true,
    });
  });
});

describe("textos do aviso nas 9 línguas", () => {
  const UI_KEYS = [
    "payment.termsHint",
    "payment.walletsHint",
    "payment.errorActions.twoParts",
    "payment.errorActions.otherMethod",
    "payment.errorActions.otherCard",
    "payment.errorActions.concierge",
    "payment.errorActions.whatsappMessage",
    "payment.payWithPaypal",
    "payment.payWithKlarna",
    "payment.payButton",
    "payment.payNowButton",
    "payment.mandateMissing",
    "checkout.emailLineLabel",
    "checkout.emailChange",
    "checkout.fieldErrors.firstName",
    "checkout.fieldErrors.lastName",
    "checkout.nifInvalid",
  ];
  const ALL = [...new Set([...PAYMENT_ERROR_KEYS, ...UI_KEYS])];
  // Flex nunca é "seguro"; as duas partes nunca são sinal/depósito/prestações.
  const BANNED = /sinal|dep[oó]sito|prestaç|deposit|instal+ment|seguro|insurance|assurance|acompte|anzahlung|versicherung|caparra|assicurazion|aanbetaling|verzekering|handpenning|försäkring|käsiraha|vakuutus|financiamento|hotel/i;
  // "{{checkIn, dal}}" (formatador do artigo italiano) é o mesmo marcador {{checkIn}}.
  const placeholders = (s: string) =>
    (s.match(/\{\{\s*\w+\s*(?:,[^}]*)?\}\}/g) ?? []).map((p) => p.replace(/\s/g, "").replace(/,[^}]*/, "")).sort();

  it.each(Object.keys(LOCALES))("%s: todas as chaves existem, com os mesmos {{marcadores}} do inglês", (lang) => {
    for (const key of ALL) {
      const value = get(LOCALES[lang], key);
      expect(typeof value, `${lang}.${key}`).toBe("string");
      expect((value as string).trim().length, `${lang}.${key}`).toBeGreaterThan(0);
      expect(placeholders(value as string), `${lang}.${key}`).toEqual(placeholders(get(en, key) as string));
    }
  });

  it.each(Object.keys(LOCALES))("%s: os textos novos não usam vocabulário proibido", (lang) => {
    const fresh = [
      ...UI_KEYS.filter((k) => !["payment.payWithPaypal", "payment.payWithKlarna", "payment.payButton", "payment.payNowButton", "payment.mandateMissing"].includes(k)),
      "payment.errors.declinedLimit", "payment.errors.declinedGeneric", "payment.errors.cardExpired",
      "payment.errors.cardNotSupported", "payment.errors.incorrectCvc", "payment.errors.incorrectNumber",
      "payment.errors.cardDetails", "payment.errors.bankUnavailable", "payment.errors.authenticationFailed",
      "payment.errors.twoPartsUnavailable", "payment.errors.prepareFailed",
      "payment.errors.priceChanged", "payment.errors.duplicateTransaction",
    ];
    for (const key of fresh) expect(get(LOCALES[lang], key), `${lang}.${key}`).not.toMatch(BANNED);
  });

  // Recusas sem nova tentativa: o texto nunca convida a repetir o mesmo cartão.
  const RETRY: Record<string, RegExp> = {
    en: /try again/i, pt: /tente (novamente|de novo)/i, fr: /réessay/i, es: /int[ée]ntelo de nuevo|vuelva a intentar/i,
    it: /riprov/i, de: /erneut|noch einmal/i, nl: /opnieuw/i, sv: /försök igen/i, fi: /uudelleen/i,
  };
  it.each(Object.keys(LOCALES))("%s: recusas por fraude, perda, roubo ou limite nunca dizem 'tente de novo'", (lang) => {
    const keys = new Set(
      [...NO_RETRY_DECLINE_CODES, "insufficient_funds", "expired_card", "card_not_supported", "duplicate_transaction"].map((c) => classifyPaymentError(card(c)).key as string),
    );
    for (const key of keys) expect(get(LOCALES[lang], key), `${lang}.${key}`).not.toMatch(RETRY[lang]);
  });

  it.each(Object.keys(LOCALES))("%s: a mensagem ao concierge nunca fala do cartão", (lang) => {
    expect(get(LOCALES[lang], "payment.errorActions.whatsappMessage")).not.toMatch(/card|cart[ãa]o|carte|tarjeta|carta|karte|kaart|kort/i);
  });

  it("humanPaymentError traduz pela língua do hóspede", async () => {
    const i18n = i18next.createInstance();
    await i18n.init({ lng: "pt", fallbackLng: "en", resources: { pt: { translation: pt }, en: { translation: en } } });
    expect(humanPaymentError(card("insufficient_funds"), i18n.t.bind(i18n) as any)).toBe(get(pt, "payment.errors.declinedLimit"));
    expect(humanPaymentError(server("two-part payment is not available for this booking"), i18n.t.bind(i18n) as any)).toBe(
      get(pt, "payment.errors.twoPartsUnavailable"),
    );
  });
});
