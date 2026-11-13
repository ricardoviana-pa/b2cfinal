/**
 * Casas parceiras: cobrança de 100% no pedido (services/partner-pay.ts).
 *
 * O que estes testes seguram: nunca se cobra um valor diferente do que o
 * hóspede viu; nunca se cobra uma estadia que o servidor não consegue cotar
 * com confiança; o pedido muda de estado uma só vez por evento do Stripe; e
 * com a flag desligada nada disto existe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UID = "3bac86ea-0000-4000-8000-000000000001";
const home = { slug: "casa-de-caiz", name: "Casa de Caiz", bookingMode: "request", source: "tripwix", isActive: true, supplierUid: UID, supplierReference: "PT0101", maxGuests: 10, minNights: 2, cleaningFee: 0, securityDeposit: 0 };
const leads = new Map<number, any>();
const emails: { id: number; notice: string; channel: string; payment?: string; variant?: string; overlapWith?: string }[] = [];
const emailFails = { on: false };
const sessionsExpire = vi.fn();
const quote = vi.fn();
const sessionsCreate = vi.fn();
const sessionsRetrieve = vi.fn();
const piRetrieve = vi.fn();

vi.mock("./db", () => ({
  createLead: async (row: any) => { const id = leads.size + 1; leads.set(id, { id, ...row }); return { id }; },
  updateLead: async (id: number, data: any) => { leads.set(id, { ...leads.get(id), ...data }); },
  getLeadById: async (id: number) => leads.get(id),
  listLeads: async () => [...leads.values()],
  getSettingsByKeys: async () => new Map(),
  upsertSetting: async () => {},
}));
vi.mock("./services/properties-store", () => ({ getPropertiesForSite: async () => [home] }));
vi.mock("./services/transactional-email", () => ({
  sendPartnerPaymentEmail: async (lead: any, notice: string, channel: string, variant?: string) => {
    if (emailFails.on) throw new Error("provider down");
    emails.push({ id: lead.id, notice, channel, payment: lead.metadata?.payment, ...(variant ? { variant } : {}), ...(lead.metadata?.overlapWith ? { overlapWith: lead.metadata.overlapWith } : {}) });
    return `email-${emails.length}`;
  },
}));
vi.mock("./services/tripwix", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./services/tripwix")>()),
  getPartnerQuote: (...a: any[]) => quote(...a),
}));
vi.mock("stripe", () => ({
  default: class { checkout = { sessions: { create: sessionsCreate, retrieve: sessionsRetrieve, expire: sessionsExpire } }; paymentIntents = { retrieve: piRetrieve }; },
}));

const NOW = Date.parse("2026-11-13T12:00:00Z");
const priced = (over: Record<string, unknown> = {}) => ({
  available: true, nights: 7, perNight: [], accommodation: 8427.5, cleaningFee: 0, total: 8427.5, securityDeposit: 0,
  feesKnown: false, unavailable: [], currency: "EUR", source: "cached", fetchedAt: NOW - 20 * 60_000, ...over,
});
const input = (over: Record<string, unknown> = {}) => ({
  name: "Ana Teste", email: "ana@example.com", phone: "+351900000000", property: "casa-de-caiz",
  checkin: "2027-01-10", checkout: "2027-01-17", guests: 4, shownTotal: 8427.5, locale: "pt", returnPath: "/pt/homes/casa-de-caiz", ...over,
});
const pay = async () => import("./services/partner-pay");
const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  leads.clear(); emails.length = 0; emailFails.on = false;
  quote.mockReset(); sessionsCreate.mockReset(); sessionsRetrieve.mockReset(); piRetrieve.mockReset(); sessionsExpire.mockReset();
  sessionsExpire.mockResolvedValue({});
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.stubEnv("PARTNER_PAY", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_partner");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ENV", "");
  vi.stubEnv("RENDER_SERVICE_ID", "");
  vi.stubEnv("RENDER_GIT_BRANCH", "");
  sessionsCreate.mockResolvedValue({ id: "cs_test_abcdefghij1234567890", url: "https://checkout.stripe.com/c/pay/cs_test_abc" });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("the switch", () => {
  it("on in production unless PARTNER_PAY=false, never without a Stripe key, and never with a live key outside production", async () => {
    const { partnerPayEnabled } = await pay();
    const prod = { SITE_URL: "https://www.portugalactive.com", NODE_ENV: "production" };
    expect(partnerPayEnabled({ ...prod, STRIPE_SECRET_KEY: "sk_live_x" } as any)).toBe(true);
    expect(partnerPayEnabled({ ...prod, STRIPE_SECRET_KEY: "sk_live_x", PARTNER_PAY: "true" } as any)).toBe(true);
    expect(partnerPayEnabled({ ...prod, STRIPE_SECRET_KEY: "sk_live_x", PARTNER_PAY: "false" } as any)).toBe(false);
    expect(partnerPayEnabled({ ...prod } as any)).toBe(false);
    expect(partnerPayEnabled({ STRIPE_SECRET_KEY: "sk_live_x", APP_ENV: "preview" } as any)).toBe(false);
    expect(partnerPayEnabled({ STRIPE_SECRET_KEY: "sk_live_x", NODE_ENV: "development" } as any)).toBe(false);
    expect(partnerPayEnabled({ STRIPE_SECRET_KEY: "sk_test_x", APP_ENV: "preview" } as any)).toBe(true);
  });

  it("payable only when free, priced, read in the last 6 hours and the switch is on", async () => {
    const { partnerQuotePayable } = await pay();
    expect(partnerQuotePayable(priced() as any)).toBe(true);
    expect(partnerQuotePayable(priced({ available: false }) as any)).toBe(false);
    expect(partnerQuotePayable(priced({ total: 0 }) as any)).toBe(false);
    expect(partnerQuotePayable(priced({ fetchedAt: NOW - 7 * 3_600_000 }) as any)).toBe(false);
    expect(partnerQuotePayable(priced({ fetchedAt: undefined }) as any)).toBe(false);
    expect(partnerQuotePayable(null)).toBe(false);
    vi.stubEnv("PARTNER_PAY", "false");
    expect(partnerQuotePayable(priced() as any)).toBe(false);
  });
});

describe("opening the payment", () => {
  it("charges the total the guest saw, in cents, on a card-only Stripe page, and saves the request first", async () => {
    quote.mockResolvedValue(priced());
    const { startPartnerPayment } = await pay();
    const r = await startPartnerPayment(input());
    await flush();
    expect(r).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_abc", leadId: 1 });
    const [params, opts] = sessionsCreate.mock.calls[0];
    expect(opts).toEqual({ idempotencyKey: "partner-pay-1" });
    expect(params).toMatchObject({
      mode: "payment", payment_method_types: ["card"], customer_email: "ana@example.com", locale: "pt",
      success_url: "https://www.portugalactive.com/pt/homes/casa-de-caiz?checkin=2027-01-10&checkout=2027-01-17&guests=4&partner_session={CHECKOUT_SESSION_ID}",
      cancel_url: "https://www.portugalactive.com/pt/homes/casa-de-caiz?checkin=2027-01-10&checkout=2027-01-17&guests=4",
    });
    expect(params.line_items[0].price_data).toMatchObject({ currency: "eur", unit_amount: 842750 });
    // Na língua do hóspede, e o botão do Stripe diz "Reservar", não "Pagar".
    expect(params.line_items[0].price_data.product_data).toEqual({ name: "Casa de Caiz · 7 noites", description: "10/01/2027 → 17/01/2027 · 4 hóspedes" });
    expect(params.submit_type).toBe("book");
    expect(params.payment_intent_data.metadata).toMatchObject({ flow: "partner_pay", leadId: "1", property: "casa-de-caiz", checkin: "2027-01-10", checkout: "2027-01-17" });
    expect(params.payment_intent_data.capture_method).toBe("manual"); // retenção: só se cobra na captura
    expect(params.adaptive_pricing).toEqual({ enabled: false }); // sempre em euros, sem conversão no Stripe
    expect(params.custom_text.submit.message).toContain("48 horas");
    expect(params.custom_text.submit.message).toContain("não é cobrado agora");
    const lead = leads.get(1);
    expect(lead).toMatchObject({ source: "partner-home-request", email: "ana@example.com" });
    expect(lead.metadata).toMatchObject({ payment: "started", paymentAmount: "8427.5", total: "8427.5", nights: "7", paymentSessionId: "cs_test_abcdefghij1234567890" });
    // A equipa sabe já que há um pagamento aberto; o hóspede só recebe email quando paga.
    expect(emails).toEqual([{ id: 1, notice: "started", channel: "team", payment: "started" }]);
  });

  it("the price moved since the guest saw it: nothing is charged and nothing is saved", async () => {
    quote.mockResolvedValue(priced({ total: 8600 }));
    const { startPartnerPayment } = await pay();
    await expect(startPartnerPayment(input())).rejects.toMatchObject({ code: "CONFLICT", message: "PARTNER_PRICE_CHANGED" });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(leads.size).toBe(0);
  });

  it.each([
    ["nights taken", priced({ available: false, unavailable: ["2027-01-12"] })],
    ["no price for these dates", null],
    ["a calendar read more than 6 hours ago", priced({ fetchedAt: NOW - 7 * 3_600_000 })],
  ])("%s: not payable, the panel falls back to the request", async (_name, q) => {
    quote.mockResolvedValue(q);
    const { startPartnerPayment } = await pay();
    await expect(startPartnerPayment(input())).rejects.toMatchObject({ code: "CONFLICT", message: "PARTNER_NOT_PAYABLE" });
    expect(sessionsCreate).not.toHaveBeenCalled();
    expect(leads.size).toBe(0);
  });

  it("another guest already paid for nights of this stay and the home has not answered: no second charge", async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    await m.startPartnerPayment(input()); await flush();
    // Só iniciado (pode ter desistido): o segundo hóspede ainda pode pagar.
    await expect(m.startPartnerPayment(input({ email: "rui@example.com", checkin: "2027-01-14", checkout: "2027-01-21" }))).resolves.toMatchObject({ leadId: 2 });
    await m.handlePartnerPaymentSucceeded({ id: "pi_1", amount_received: 842750, metadata: { flow: "partner_pay", leadId: "1" } });
    sessionsCreate.mockClear();
    await expect(m.startPartnerPayment(input({ email: "eva@example.com", checkin: "2027-01-16", checkout: "2027-01-23" }))).rejects.toMatchObject({ code: "CONFLICT", message: "PARTNER_NOT_PAYABLE" });
    expect(sessionsCreate).not.toHaveBeenCalled();
    // A saída de um é a entrada do outro: não se sobrepõem.
    await expect(m.startPartnerPayment(input({ email: "eva@example.com", checkin: "2027-01-17", checkout: "2027-01-24" }))).resolves.toBeTruthy();
    // Devolvido: as noites voltam a poder ser pagas.
    await m.handlePartnerChargeRefunded({ id: "ch_1", refunded: true, amount: 842750, amount_refunded: 842750, metadata: { flow: "partner_pay", leadId: "1" } });
    await expect(m.startPartnerPayment(input({ email: "eva@example.com", checkin: "2027-01-16", checkout: "2027-01-23" }))).resolves.toBeTruthy();
  });

  it("switch off: refused before anything is read", async () => {
    vi.stubEnv("PARTNER_PAY", "false");
    const { startPartnerPayment } = await pay();
    await expect(startPartnerPayment(input())).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(quote).not.toHaveBeenCalled();
  });

  it.each([
    ["a past check-in", { checkin: "2026-11-01", checkout: "2026-11-08" }],
    ["too many guests", { guests: 11 }],
    ["a return path that leaves the site", { returnPath: "//evil.example/x" }],
    ["a home that is not a partner home", { property: "villa-aura" }],
  ])("%s: refused", async (_name, over) => {
    quote.mockResolvedValue(priced());
    const { startPartnerPayment } = await pay();
    await expect(startPartnerPayment(input(over))).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("Stripe refuses the session: the request stays saved for the team and the guest sees an error", async () => {
    quote.mockResolvedValue(priced());
    sessionsCreate.mockRejectedValue(new Error("stripe down"));
    const { startPartnerPayment } = await pay();
    await expect(startPartnerPayment(input())).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR", message: "PARTNER_PAY_FAILED" });
    expect(leads.get(1).metadata.payment).toBe("started");
    expect(emails).toEqual([{ id: 1, notice: "started", channel: "team", payment: "started" }]);
  });
});

describe("Stripe says the payment succeeded", () => {
  const started = async () => { quote.mockResolvedValue(priced()); await (await pay()).startPartnerPayment(input()); await flush(); emails.length = 0; };
  const pi = { id: "pi_1", amount_received: 842750, metadata: { flow: "partner_pay", leadId: "1" } };

  it("marks the request paid once, and tells the team and the guest once", async () => {
    await started();
    const { handlePartnerPaymentSucceeded } = await pay();
    expect(await handlePartnerPaymentSucceeded(pi)).toBe("paid");
    expect(leads.get(1).metadata).toMatchObject({ payment: "paid", paymentIntentId: "pi_1", paidAmount: "8427.5" });
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["paid/team", "paid/guest"]);
    // Reentrega do webhook, ou o hóspede a voltar à página: nada muda, nada se repete.
    const paidAt = leads.get(1).metadata.paidAt;
    expect(await handlePartnerPaymentSucceeded(pi)).toBe("already");
    expect(leads.get(1).metadata.paidAt).toBe(paidAt);
    expect(emails).toHaveLength(2);
  });

  it("the 'PAGO' email fails: throws for Stripe to redeliver, and the redelivery sends it without paying twice", async () => {
    await started();
    const { handlePartnerPaymentSucceeded } = await pay();
    emailFails.on = true;
    await expect(handlePartnerPaymentSucceeded(pi)).rejects.toThrow("PARTNER_NOTIFY_FAILED");
    expect(leads.get(1).metadata.payment).toBe("paid");
    emailFails.on = false;
    expect(await handlePartnerPaymentSucceeded(pi)).toBe("already");
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["paid/team", "paid/guest"]);
  });

  it("closes the payment pages still open for the same nights, and warns the team if a second payment got through", async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    sessionsCreate.mockResolvedValueOnce({ id: "cs_test_aaaaaaaaaaaaaaaaaaaa", url: "https://checkout.stripe.com/a" });
    sessionsCreate.mockResolvedValueOnce({ id: "cs_test_bbbbbbbbbbbbbbbbbbbb", url: "https://checkout.stripe.com/b" });
    sessionsCreate.mockResolvedValueOnce({ id: "cs_test_cccccccccccccccccccc", url: "https://checkout.stripe.com/c" });
    await m.startPartnerPayment(input()); // 1: 10 a 17
    await m.startPartnerPayment(input({ email: "rui@example.com", checkin: "2027-01-14", checkout: "2027-01-21" })); // 2: toca nas noites do 1
    await m.startPartnerPayment(input({ email: "eva@example.com", checkin: "2027-01-17", checkout: "2027-01-24" })); // 3: não toca no 1
    await flush(); emails.length = 0;
    await m.handlePartnerPaymentSucceeded({ id: "pi_1", amount_received: 842750, metadata: { flow: "partner_pay", leadId: "1" } });
    expect(sessionsExpire.mock.calls.map((c) => c[0])).toEqual(["cs_test_bbbbbbbbbbbbbbbbbbbb"]);
    expect(leads.get(1).metadata.overlapWith).toBeUndefined();
    // O hóspede 2 já estava no fim do pagamento e o Stripe cobrou-o na mesma.
    emails.length = 0;
    await m.handlePartnerPaymentSucceeded({ id: "pi_2", amount_received: 842750, metadata: { flow: "partner_pay", leadId: "2" } });
    expect(leads.get(2).metadata).toMatchObject({ payment: "paid", overlapWith: "PA-1" });
    expect(emails.find((e) => e.channel === "team")).toMatchObject({ id: 2, notice: "paid", overlapWith: "PA-1" });
  });

  it("a payment from the checkout of our own homes is not ours to touch", async () => {
    await started();
    const { handlePartnerPaymentSucceeded } = await pay();
    expect(await handlePartnerPaymentSucceeded({ id: "pi_2", metadata: { flow: "card_v2", intentId: "x", leadId: "1" } })).toBe("ignored");
    expect(await handlePartnerPaymentSucceeded({ id: "pi_3", metadata: { flow: "partner_pay", leadId: "999" } })).toBe("ignored");
    expect(leads.get(1).metadata.payment).toBe("started");
    expect(emails).toHaveLength(0);
  });

  it("a late 'succeeded' never turns a refunded request back into paid", async () => {
    await started();
    const { handlePartnerPaymentSucceeded, handlePartnerChargeRefunded } = await pay();
    await handlePartnerPaymentSucceeded(pi);
    await handlePartnerChargeRefunded({ id: "ch_1", refunded: true, amount: 842750, amount_refunded: 842750, metadata: pi.metadata });
    expect(await handlePartnerPaymentSucceeded(pi)).toBe("already");
    expect(leads.get(1).metadata.payment).toBe("refunded");
  });
});

describe("a refund made in the Stripe Dashboard", () => {
  const paidLead = async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    await m.startPartnerPayment(input()); await flush();
    await m.handlePartnerPaymentSucceeded({ id: "pi_1", amount_received: 842750, metadata: { flow: "partner_pay", leadId: "1" } });
    emails.length = 0;
    return m;
  };

  it("in full: the request is marked refunded and the guest is told", async () => {
    const m = await paidLead();
    expect(await m.handlePartnerChargeRefunded({ id: "ch_1", refunded: true, amount: 842750, amount_refunded: 842750, metadata: { flow: "partner_pay", leadId: "1" } })).toBe("refunded");
    expect(leads.get(1).metadata).toMatchObject({ payment: "refunded", refundedAmount: "8427.5" });
    // O hóspede primeiro: o email da equipa diz se ele foi avisado.
    expect(emails.map((e) => `${e.notice}/${e.channel}/${e.variant}`)).toEqual(["refunded/guest/full", "refunded/team/full"]);
  });

  it("in part: only the team is told", async () => {
    const m = await paidLead();
    expect(await m.handlePartnerChargeRefunded({ id: "ch_1", refunded: false, amount: 842750, amount_refunded: 50000, metadata: { flow: "partner_pay", leadId: "1" } })).toBe("partially_refunded");
    expect(leads.get(1).metadata).toMatchObject({ payment: "partially_refunded", refundedAmount: "500" });
    expect(emails.map((e) => `${e.notice}/${e.channel}/${e.variant}`)).toEqual(["refunded/team/50000"]);
  });

  it("in part, then in full: the team hears of both and the guest of the full one", async () => {
    const m = await paidLead();
    const meta = { flow: "partner_pay", leadId: "1" };
    await m.handlePartnerChargeRefunded({ id: "ch_1", refunded: false, amount: 842750, amount_refunded: 50000, metadata: meta });
    await m.handlePartnerChargeRefunded({ id: "ch_1", refunded: true, amount: 842750, amount_refunded: 842750, metadata: meta });
    expect(emails.map((e) => `${e.channel}/${e.variant}`)).toEqual(["team/50000", "guest/full", "team/full"]);
    // Um evento parcial atrasado não desfaz a devolução total nem repete avisos.
    expect(await m.handlePartnerChargeRefunded({ id: "ch_1", refunded: false, amount: 842750, amount_refunded: 50000, metadata: meta })).toBe("refunded");
    expect(leads.get(1).metadata).toMatchObject({ payment: "refunded", refundedAmount: "8427.5" });
    expect(emails).toHaveLength(3);
  });

  it("the email provider is down: the handler throws so Stripe redelivers, and the redelivery sends what is missing", async () => {
    const m = await paidLead();
    const charge = { id: "ch_1", refunded: true, amount: 842750, amount_refunded: 842750, metadata: { flow: "partner_pay", leadId: "1" } };
    emailFails.on = true;
    await expect(m.handlePartnerChargeRefunded(charge)).rejects.toThrow("PARTNER_NOTIFY_FAILED");
    expect(leads.get(1).metadata.payment).toBe("refunded"); // o estado fica; só os avisos faltam
    emailFails.on = false;
    expect(await m.handlePartnerChargeRefunded(charge)).toBe("refunded");
    expect(emails.map((e) => `${e.channel}/${e.variant}`)).toEqual(["guest/full", "team/full"]);
  });

  it("a charge with no metadata: the payment intent says whose it is", async () => {
    const m = await paidLead();
    piRetrieve.mockResolvedValue({ metadata: { flow: "partner_pay", leadId: "1" } });
    expect(await m.handlePartnerChargeRefunded({ id: "ch_1", refunded: true, amount: 842750, amount_refunded: 842750, payment_intent: "pi_1", metadata: {} })).toBe("refunded");
    expect(piRetrieve).toHaveBeenCalledWith("pi_1");
  });

  it("a refund on one of our own homes' payments is ignored, without asking Stripe", async () => {
    const m = await paidLead();
    expect(await m.handlePartnerChargeRefunded({ id: "ch_9", refunded: true, amount: 100, amount_refunded: 100, payment_intent: "pi_9", metadata: { flow: "card_v2", intentId: "abc" } })).toBe("ignored");
    expect(piRetrieve).not.toHaveBeenCalled();
    expect(leads.get(1).metadata.payment).toBe("paid");
  });
});

describe("the guest comes back from the Stripe page", () => {
  it("the amount is on hold: closes the request here if the webhook has not arrived, and shows only what the page needs", async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    await m.startPartnerPayment(input()); await flush(); emails.length = 0;
    sessionsRetrieve.mockResolvedValue({
      id: "cs_test_abcdefghij1234567890", status: "complete", payment_status: "unpaid", metadata: { flow: "partner_pay", leadId: "1" },
      payment_intent: { id: "pi_1", status: "requires_capture", amount: 842750, amount_capturable: 842750, metadata: { flow: "partner_pay", leadId: "1" } },
    });
    expect(await m.partnerPaymentStatus("cs_test_abcdefghij1234567890")).toEqual({
      status: "held", reference: "PA-1", propertyName: "Casa de Caiz", checkin: "2027-01-10", checkout: "2027-01-17", guests: "4", total: "8427.5",
    });
    expect(leads.get(1).metadata).toMatchObject({ payment: "held", heldAmount: "8427.5", paymentIntentId: "pi_1" });
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["held/team", "held/guest"]);
  });

  it("the guest opens the link again after the capture: charged, not on hold", async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    await m.startPartnerPayment(input()); await flush();
    sessionsRetrieve.mockResolvedValue({
      id: "cs_test_abcdefghij1234567890", status: "complete", payment_status: "paid", metadata: { flow: "partner_pay", leadId: "1" },
      payment_intent: { id: "pi_1", status: "succeeded", amount: 842750, amount_received: 842750, metadata: { flow: "partner_pay", leadId: "1" } },
    });
    expect(await m.partnerPaymentStatus("cs_test_abcdefghij1234567890")).toMatchObject({ status: "paid", total: "8427.5" });
  });

  it("not paid, someone else's session, or a made-up id: says nothing about anyone", async () => {
    const m = await pay();
    sessionsRetrieve.mockResolvedValue({ payment_status: "unpaid", metadata: { flow: "partner_pay", leadId: "1" } });
    expect(await m.partnerPaymentStatus("cs_test_abcdefghij1234567890")).toEqual({ status: "open" });
    sessionsRetrieve.mockResolvedValue({ payment_status: "paid", metadata: { flow: "card_v2" } });
    expect(await m.partnerPaymentStatus("cs_test_abcdefghij1234567890")).toEqual({ status: "unknown" });
    sessionsRetrieve.mockClear();
    expect(await m.partnerPaymentStatus("not-a-session")).toEqual({ status: "unknown" });
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });
});

describe("retention: the amount is held on the card and only charged on capture (13 nov 2026)", () => {
  const meta = { flow: "partner_pay", leadId: "1" };
  const authorised = { id: "pi_1", status: "requires_capture", amount: 842750, amount_capturable: 842750, metadata: meta };
  const captured = { id: "pi_1", status: "succeeded", amount: 842750, amount_received: 842750, metadata: meta };
  const canceled = { id: "pi_1", status: "canceled", amount: 842750, metadata: meta };
  const started = async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    await m.startPartnerPayment(input()); await flush(); emails.length = 0;
    return m;
  };

  it("card authorised: the request is held, with the day the team must capture or cancel by, and both are told once", async () => {
    const m = await started();
    expect(await m.handlePartnerPaymentHeld(authorised)).toBe("held");
    expect(leads.get(1).metadata).toMatchObject({ payment: "held", heldAmount: "8427.5", paymentIntentId: "pi_1", holdUntil: "2026-11-17" });
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["held/team", "held/guest"]);
    expect(await m.handlePartnerPaymentHeld(authorised)).toBe("already");
    expect(emails).toHaveLength(2);
  });

  it("captured in the Dashboard: charged, both are told, and the competing pages are not closed twice", async () => {
    const m = await started();
    await m.handlePartnerPaymentHeld(authorised);
    emails.length = 0; sessionsExpire.mockClear();
    expect(await m.handlePartnerPaymentSucceeded(captured)).toBe("paid");
    expect(leads.get(1).metadata).toMatchObject({ payment: "paid", paidAmount: "8427.5" });
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["paid/team", "paid/guest"]);
    expect(sessionsExpire).not.toHaveBeenCalled();
  });

  it("cancelled in the Dashboard (or expired): released, nothing charged, the guest is told first", async () => {
    const m = await started();
    await m.handlePartnerPaymentHeld(authorised);
    emails.length = 0;
    expect(await m.handlePartnerPaymentCanceled(canceled)).toBe("released");
    expect(leads.get(1).metadata.payment).toBe("released");
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["released/guest", "released/team"]);
    // Reentrega: nada muda, nada se repete. E as noites voltam a poder ser reservadas.
    expect(await m.handlePartnerPaymentCanceled(canceled)).toBe("released");
    expect(emails).toHaveLength(2);
    await expect(m.startPartnerPayment(input({ email: "rui@example.com" }))).resolves.toBeTruthy();
  });

  it("a guest who left the Stripe page: the request is marked expired and nobody gets a 'released' email", async () => {
    const m = await started();
    expect(await m.handlePartnerPaymentCanceled(canceled)).toBe("expired");
    expect(leads.get(1).metadata.payment).toBe("expired");
    expect(emails).toHaveLength(0);
  });

  it("a cancel event after the capture changes nothing", async () => {
    const m = await started();
    await m.handlePartnerPaymentHeld(authorised);
    await m.handlePartnerPaymentSucceeded(captured);
    emails.length = 0;
    expect(await m.handlePartnerPaymentCanceled(canceled)).toBe("already");
    expect(leads.get(1).metadata.payment).toBe("paid");
    expect(emails).toHaveLength(0);
  });

  it("nights on hold for one guest: no second hold, and the other open pages are closed", async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    sessionsCreate.mockResolvedValueOnce({ id: "cs_test_aaaaaaaaaaaaaaaaaaaa", url: "https://checkout.stripe.com/a" });
    sessionsCreate.mockResolvedValueOnce({ id: "cs_test_bbbbbbbbbbbbbbbbbbbb", url: "https://checkout.stripe.com/b" });
    await m.startPartnerPayment(input());
    await m.startPartnerPayment(input({ email: "rui@example.com", checkin: "2027-01-14", checkout: "2027-01-21" }));
    await flush();
    await m.handlePartnerPaymentHeld(authorised);
    expect(sessionsExpire.mock.calls.map((c) => c[0])).toEqual(["cs_test_bbbbbbbbbbbbbbbbbbbb"]);
    await expect(m.startPartnerPayment(input({ email: "eva@example.com", checkin: "2027-01-16", checkout: "2027-01-23" }))).rejects.toMatchObject({ message: "PARTNER_NOT_PAYABLE" });
  });

  it("the email provider is down when the hold arrives: throws for Stripe to redeliver, then sends what is missing", async () => {
    const m = await started();
    emailFails.on = true;
    await expect(m.handlePartnerPaymentHeld(authorised)).rejects.toThrow("PARTNER_NOTIFY_FAILED");
    expect(leads.get(1).metadata.payment).toBe("held");
    emailFails.on = false;
    expect(await m.handlePartnerPaymentHeld(authorised)).toBe("already");
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["held/team", "held/guest"]);
  });
});

describe("the five-minute pass: Stripe's state reaches the request even if an event never arrives", () => {
  const meta = { flow: "partner_pay", leadId: "1" };
  const started = async () => {
    quote.mockResolvedValue(priced());
    const m = await pay();
    await m.startPartnerPayment(input()); await flush(); emails.length = 0;
    return m;
  };

  it("an open page whose card was authorised becomes held, and the team hears of it", async () => {
    const m = await started();
    sessionsRetrieve.mockResolvedValue({ status: "complete", metadata: meta, payment_intent: { id: "pi_1", status: "requires_capture", amount: 842750, amount_capturable: 842750, metadata: meta } });
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 1, changed: 1 });
    expect(leads.get(1).metadata.payment).toBe("held");
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["held/team", "held/guest"]);
  });

  it("a held request whose hold was cancelled or captured in the Dashboard follows", async () => {
    const m = await started();
    await m.handlePartnerPaymentHeld({ id: "pi_1", status: "requires_capture", amount: 842750, amount_capturable: 842750, metadata: meta });
    emails.length = 0;
    piRetrieve.mockResolvedValue({ id: "pi_1", status: "requires_capture", amount: 842750, amount_capturable: 842750, metadata: meta });
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 1, changed: 0 }); // ainda retido: nada a fazer
    piRetrieve.mockResolvedValue({ id: "pi_1", status: "canceled", amount: 842750, metadata: meta });
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 1, changed: 1 });
    expect(leads.get(1).metadata.payment).toBe("released");
    expect(emails.map((e) => `${e.notice}/${e.channel}`)).toEqual(["released/guest", "released/team"]);
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 0, changed: 0 }); // fechado: já não é conferido
  });

  it("an abandoned page is marked expired and not asked about again; a still-open one is left alone", async () => {
    const m = await started();
    sessionsRetrieve.mockResolvedValue({ status: "open", metadata: meta, payment_intent: null });
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 1, changed: 0 });
    expect(leads.get(1).metadata.payment).toBe("started");
    sessionsRetrieve.mockResolvedValue({ status: "expired", metadata: meta, payment_intent: null });
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 1, changed: 1 });
    expect(leads.get(1).metadata.payment).toBe("expired");
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 0, changed: 0 });
    expect(emails).toHaveLength(0);
  });

  it("Stripe is down: the pass fails quietly and tries again next time", async () => {
    const m = await started();
    sessionsRetrieve.mockRejectedValue(new Error("stripe down"));
    expect(await m.sweepPartnerPayments()).toEqual({ checked: 1, changed: 0 });
    expect(leads.get(1).metadata.payment).toBe("started");
  });
});
