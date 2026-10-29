import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  candidates: vi.fn(), claim: vi.fn(), send: vi.fn(), properties: vi.fn(), eligible: vi.fn(),
  consent: vi.fn(), claimAlert: vi.fn(), alert: vi.fn(), update: vi.fn(), beQuote: vi.fn(), avail: vi.fn(),
  attempt: vi.fn(), plan: vi.fn(), breakdown: vi.fn(),
}));
vi.mock("../db", () => ({
  listRecoveryCandidates: mock.candidates, claimRecoveryStage: mock.claim,
  hasNewsletterConsent: mock.consent, claimConciergeAlert: mock.claimAlert, updateBookingIntent: mock.update,
}));
vi.mock("./transactional-email", () => ({ sendCheckoutRecovery: mock.send, sendConciergeCallAlert: mock.alert }));
vi.mock("./guesty-booking", () => ({ createBEQuote: mock.beQuote }));
vi.mock("./guesty", () => ({ checkAvailability: mock.avail, describeGuestyError: (e: any) => String(e?.message ?? e) }));
vi.mock("../lib/guesty", () => ({ guestyClient: { getListingCalendar: vi.fn().mockResolvedValue([]) } }));
vi.mock("./properties-store", () => ({ getPropertiesForSite: mock.properties, isHiddenFromCatalog: () => false }));
vi.mock('./recovery-eligibility', () => ({ canRemindRecoveryStay: mock.eligible }));
// Contacto 1 no pagamento: tentativas PayPal/Klarna na Stripe, a oferta de
// duas partes do checkout e o total que o checkout cobraria.
vi.mock("./stripe-klarna", () => ({ hasCheckoutPaymentAttempt: mock.attempt }));
vi.mock("../routers/checkout", () => ({ clientPaymentPlanFor: mock.plan }));
vi.mock("./checkout-card-charge", () => ({ listingBreakdownFromIntent: mock.breakdown }));
import { paymentWasAttempted, recoveryOptoutUrl, runCheckoutRecoverySweep, startCheckoutRecoveryScheduler } from "./checkout-recovery";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CHECKOUT_RECOVERY", "true");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RENDER_GIT_BRANCH", "main");
  mock.claim.mockResolvedValue(true);
  mock.send.mockResolvedValue(undefined);
  mock.properties.mockResolvedValue([]);
  mock.eligible.mockResolvedValue(true);
  mock.consent.mockResolvedValue(false);
  mock.claimAlert.mockResolvedValue(true);
  mock.alert.mockResolvedValue(undefined);
  mock.update.mockResolvedValue(true);
  mock.avail.mockResolvedValue({ available: true });
  mock.attempt.mockResolvedValue(false);
  mock.plan.mockResolvedValue({ available: false, reason: "disabled" });
  mock.breakdown.mockResolvedValue({ totalCents: 250_000 });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const futureCheckIn = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
const futureCheckOut = new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10);
const intent = (hours: number, over: Record<string, unknown> = {}) => ({
  id: "12345678-1234-1234-1234-123456789abc", locale: "pt",
  email: "guest@example.test", recoveryStage: 0, status: "contact_captured",
  listingId: "listing-1", destination: "minho", guests: 2,
  checkIn: futureCheckIn, checkOut: futureCheckOut,
  createdAt: new Date(Date.now() - hours * 3_600_000),
  expiresAt: new Date(Date.now() + 3_600_000), quote: { total: 100 },
  ...over,
});
const HOLDOUT_ID = "b1f0cbcd-6881-4459-ae49-edf3b0c3cd19";

describe("recovery email environment regression", () => {
  it("DEV cannot read or claim shared intents or send emails", async () => {
    vi.stubEnv("SITE_URL", "https://dev.portugalactive.com");
    vi.stubEnv("RENDER_GIT_BRANCH", "dev");
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 0 });
    expect(mock.candidates).not.toHaveBeenCalled();
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
    vi.useFakeTimers();
    startCheckoutRecoveryScheduler();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([[2, 1, "1h"], [21, 2, "20h"]])("production sends only the owed stage after %s hours", async (hours, stage, suffix) => {
    const row = intent(Number(hours));
    mock.candidates.mockResolvedValue([row]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 1, checked: 1 });
    expect(mock.claim).toHaveBeenCalledWith(row.id, 0, stage);
    expect(mock.send).toHaveBeenCalledOnce();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      stage, resumeUrl: `https://www.portugalactive.com/pt/checkout/${row.id}?utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_${suffix}`,
      optoutUrl: expect.stringMatching(/^https:\/\/www\.portugalactive\.com\/api\/checkout\/recovery-optout\?/),
    }));
  });
  it("does not resend a stage another production worker has claimed", async () => {
    mock.candidates.mockResolvedValue([intent(2)]);
    mock.claim.mockResolvedValue(false);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("opt-out links cannot pick up a DEV domain", () => {
    vi.stubEnv("SITE_URL", "https://dev.portugalactive.com");
    expect(new URL(recoveryOptoutUrl(intent(2).id)).origin).toBe("https://www.portugalactive.com");
  });
  it('does not claim or send an already booked or superseded stay', async () => {
    mock.candidates.mockResolvedValue([intent(2)]);
    mock.eligible.mockResolvedValue(false);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('defers without claiming when Guesty cannot verify the stay', async () => {
    mock.candidates.mockResolvedValue([intent(2)]);
    mock.eligible.mockRejectedValue(new Error('timeout'));
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
});

describe("funil de 4 contactos", () => {
  it("grupo de controlo: nunca recebe email nem é reclamado", async () => {
    mock.candidates.mockResolvedValue([intent(2, { id: HOLDOUT_ID })]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("contacto 1 parado no pagamento leva a variante de pagamento", async () => {
    mock.candidates.mockResolvedValue([intent(2, { status: "payment_pending" })]);
    await runCheckoutRecoverySweep();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ stage: 1, paymentStep: true }));
  });
  it("o consentimento lê-se uma vez por email em cada passagem (quota da BD)", async () => {
    const expired = { recoveryStage: 2, expiresAt: new Date(Date.now() - 3_600_000) };
    mock.candidates.mockResolvedValue([
      intent(80, { ...expired, id: "11111111-1111-1111-1111-111111111111" }),
      intent(90, { ...expired, id: "22222222-2222-2222-2222-222222222222" }),
      intent(80, { ...expired, id: "33333333-3333-3333-3333-333333333333", email: "other@example.test" }),
    ]);
    await runCheckoutRecoverySweep();
    expect(mock.consent.mock.calls.map((c) => c[0]).sort()).toEqual(["guest@example.test", "other@example.test"]);
    await runCheckoutRecoverySweep();
    expect(mock.consent).toHaveBeenCalledTimes(4);
  });
  it("sem consentimento, depois de a cotação expirar não há mais contactos", async () => {
    mock.candidates.mockResolvedValue([intent(80, { recoveryStage: 2, expiresAt: new Date(Date.now() - 3_600_000) })]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("contacto 3 refaz a cotação, grava o Flex oferecido e envia", async () => {
    mock.consent.mockResolvedValue(true);
    mock.beQuote.mockResolvedValue({
      quoteId: "q-new", total: 2280, currency: "EUR", nights: 5, ratePlanId: "rp1",
      pricing: { nightlyRate: 420, totalNights: 2100, cleaningFee: 180, taxesAndFees: 0 },
      ratePlanOptions: [{ ratePlanId: "rp1", name: "Flexible", total: 2280, nightlyRate: 420, cleaningFee: 180, taxesAndFees: 0 }],
    });
    mock.candidates.mockResolvedValue([intent(80, { recoveryStage: 2, expiresAt: new Date(Date.now() - 3_600_000) })]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 1, checked: 1 });
    expect(mock.update).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ guestyQuoteId: "q-new", flex: true, flexGiftUntil: expect.any(Date) }));
    expect(mock.claim).toHaveBeenCalledWith(expect.any(String), 2, 3);
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ stage: 3, flexGift: expect.objectContaining({ days: expect.any(Number) }) }));
  });
  it("contacto 3 com datas perdidas salta para as alternativas", async () => {
    mock.consent.mockResolvedValue(true);
    mock.beQuote.mockRejectedValue(new Error("This property is not available for the selected dates."));
    mock.candidates.mockResolvedValue([intent(80, { recoveryStage: 2, expiresAt: new Date(Date.now() - 3_600_000) })]);
    await runCheckoutRecoverySweep();
    expect(mock.claim).toHaveBeenCalledWith(expect.any(String), 2, 4);
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ stage: 4 }));
  });
  it("contacto 4 envia as alternativas sem o priceFrom do catálogo", async () => {
    mock.consent.mockResolvedValue(true);
    const home = (id: string, over: Record<string, unknown> = {}) => ({
      guestyId: id, slug: `casa-${id}`, name: `Casa ${id}`, destination: "minho", maxGuests: 6,
      priceFrom: 250, pricePerNight: 250, locality: "Caminha", images: [`https://assets.example.test/${id}.jpg`], ...over,
    });
    mock.properties.mockResolvedValue([home("listing-1"), home("alt-a"), home("alt-b", { priceFrom: 90 })]);
    mock.candidates.mockResolvedValue([intent(7 * 24 + 2, { recoveryStage: 3, expiresAt: new Date(Date.now() - 3_600_000) })]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 1, checked: 1 });
    expect(mock.claim).toHaveBeenCalledWith(expect.any(String), 3, 4);
    const sent = mock.send.mock.calls[0][0];
    expect(sent.stage).toBe(4);
    expect(sent.alternatives).toHaveLength(2);
    for (const alt of sent.alternatives) {
      expect(alt).not.toHaveProperty("priceFrom");
      expect(alt).toEqual({
        name: expect.any(String), locality: "Caminha",
        imageUrl: expect.stringContaining("https://assets.example.test/"),
        url: expect.stringMatching(/^https:\/\/www\.portugalactive\.com\/pt\/homes\/casa-alt-[ab]\?/),
      });
    }
  });
  it("Guesty em baixo no contacto 3: adia sem reclamar", async () => {
    mock.consent.mockResolvedValue(true);
    mock.beQuote.mockRejectedValue(new Error("be_quote_timeout"));
    mock.candidates.mockResolvedValue([intent(80, { recoveryStage: 2, expiresAt: new Date(Date.now() - 3_600_000) })]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.claim).not.toHaveBeenCalled();
  });
  it("check-in a menos de 2 dias: sem contactos", async () => {
    const soon = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    mock.candidates.mockResolvedValue([intent(2, { checkIn: soon })]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
  });
  it("abandono de valor alto no pagamento alerta o concierge uma vez", async () => {
    mock.candidates.mockResolvedValue([intent(2, { status: "payment_pending", guestPhone: "+351900000000", quote: { total: 4200 } })]);
    await runCheckoutRecoverySweep();
    expect(mock.claimAlert).toHaveBeenCalledOnce();
    expect(mock.alert).toHaveBeenCalledWith(expect.objectContaining({ total: 4200 }));
  });
  it("valor baixo não alerta o concierge", async () => {
    mock.candidates.mockResolvedValue([intent(2, { status: "payment_pending", guestPhone: "+351900000000", quote: { total: 900 } })]);
    await runCheckoutRecoverySweep();
    expect(mock.alert).not.toHaveBeenCalled();
  });
  it.each([false, 'unavailable'])("não alerta o concierge sem confirmar abandono: %s", async (eligible) => {
    mock.candidates.mockResolvedValue([intent(2, { status: "payment_pending", guestPhone: "+351900000000", quote: { total: 4200 } })]);
    if (eligible === false) mock.eligible.mockResolvedValue(false);
    else mock.eligible.mockRejectedValue(new Error('timeout'));
    await runCheckoutRecoverySweep();
    expect(mock.claimAlert).not.toHaveBeenCalled();
    expect(mock.alert).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("grupo de controlo mantém alerta humano após verificar a estadia", async () => {
    mock.candidates.mockResolvedValue([intent(2, { id: HOLDOUT_ID, status: "payment_pending", guestPhone: "+351900000000", quote: { total: 4200 } })]);
    await runCheckoutRecoverySweep();
    expect(mock.eligible).toHaveBeenCalledOnce();
    expect(mock.alert).toHaveBeenCalledOnce();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("cotação expirada mantém alerta humano elegível sem email automático", async () => {
    mock.candidates.mockResolvedValue([intent(25, { status: "payment_pending", guestPhone: "+351900000000", quote: { total: 4200 }, expiresAt: new Date(Date.now() - 3_600_000) })]);
    await runCheckoutRecoverySweep();
    expect(mock.eligible).toHaveBeenCalledOnce();
    expect(mock.alert).toHaveBeenCalledOnce();
    expect(mock.send).not.toHaveBeenCalled();
  });
});

describe("contacto 1 no pagamento: o email depende de ter havido uma tentativa de pagar", () => {
  // Tarifa moderate (cancelamento gratuito até 7 dias antes), 3 000 € de estadia.
  const atPayment = (over: Record<string, unknown> = {}) => intent(2, {
    status: "payment_pending", ratePlanId: "rp-moderate",
    quote: { total: 3000, currency: "EUR", ratePlanOptions: [
      { ratePlanId: "rp-moderate", name: "Flexible", total: 3000, nightlyRate: 600, cleaningFee: 0, cancellationPolicy: ["MODERATE"] },
    ] },
    ...over,
  });
  const chargeAt = "2099-01-15T10:00:00.000Z";

  it("sem tentativa (nada no intent nem na Stripe): a pergunta, com a política da tarifa e as duas partes do checkout", async () => {
    const row = atPayment();
    mock.candidates.mockResolvedValue([row]);
    mock.plan.mockResolvedValue({ available: true, depositCents: 150_000, balanceCents: 150_000, chargeAt });
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 1, checked: 1 });
    expect(mock.attempt).toHaveBeenCalledWith(row.id);
    // As mesmas regras do ecrã do checkout, sobre este intent.
    expect(mock.plan).toHaveBeenCalledWith(expect.objectContaining({ id: row.id, ratePlanId: "rp-moderate" }));
    expect(mock.breakdown).not.toHaveBeenCalled();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      stage: 1, paymentStep: true, paymentAttempted: false, klarna: false,
      cancellation: { policy: "moderate" },
      twoParts: { todayCents: 150_000, laterCents: 150_000, chargeAt: new Date(chargeAt) },
    }));
  });

  it("cartão ou wallet tentados (PI no intent): o texto de sempre, sem perguntar à Stripe; acima de 1 000 €, sem Klarna", async () => {
    mock.candidates.mockResolvedValue([atPayment({ paymentIntentId: "pi_card_attempt" })]);
    mock.breakdown.mockResolvedValue({ totalCents: 300_000 });
    await runCheckoutRecoverySweep();
    expect(mock.attempt).not.toHaveBeenCalled();
    expect(mock.plan).not.toHaveBeenCalled();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      stage: 1, paymentStep: true, paymentAttempted: true, klarna: false, cancellation: null, twoParts: null,
    }));
  });

  it("PayPal ou Klarna tentados (só a Stripe sabe): o texto de sempre, com o Klarna quando o total cabe no limite", async () => {
    mock.candidates.mockResolvedValue([atPayment({ quote: { total: 900, currency: "EUR" } })]);
    mock.attempt.mockResolvedValue(true);
    mock.breakdown.mockResolvedValue({ totalCents: 95_000 });
    await runCheckoutRecoverySweep();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ stage: 1, paymentAttempted: true, klarna: true }));
  });

  it("total do checkout por saber: o Klarna não é sugerido", async () => {
    mock.candidates.mockResolvedValue([atPayment({ paymentIntentId: "pi_card_attempt" })]);
    mock.breakdown.mockRejectedValue(new Error("listing facts unavailable"));
    await runCheckoutRecoverySweep();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ paymentAttempted: true, klarna: false }));
  });

  it("Stripe sem resposta: conta como sem tentativa (o texto que não fala de falhas serve a todos)", async () => {
    mock.attempt.mockRejectedValue(new Error("stripe search unavailable"));
    expect(await paymentWasAttempted({ id: "intent-x", paymentIntentId: null })).toBe(false);
    expect(await paymentWasAttempted({ id: "intent-x", paymentIntentId: "pi_y" })).toBe(true);
    mock.candidates.mockResolvedValue([atPayment()]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 1, checked: 1 });
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ paymentAttempted: false }));
  });

  it.each([
    ["sem oferta (tarifa, antecedência ou flag)", () => mock.plan.mockResolvedValue({ available: false, reason: "lead_time" })],
    ["erro ao calcular", () => mock.plan.mockRejectedValue(new Error("listing facts unavailable"))],
  ])("duas partes %s: o email sai sem a linha", async (_label, arrange) => {
    arrange();
    mock.candidates.mockResolvedValue([atPayment()]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 1, checked: 1 });
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ paymentAttempted: false, twoParts: null }));
  });

  it("fora do passo de pagamento nada disto corre: nem Stripe, nem duas partes, nem total", async () => {
    mock.candidates.mockResolvedValue([intent(2)]);
    await runCheckoutRecoverySweep();
    expect(mock.attempt).not.toHaveBeenCalled();
    expect(mock.plan).not.toHaveBeenCalled();
    expect(mock.breakdown).not.toHaveBeenCalled();
    const sent = mock.send.mock.calls[0][0];
    expect(sent).toMatchObject({ stage: 1, paymentStep: false });
    expect(sent.paymentAttempted).toBeUndefined();
    expect(sent.twoParts).toBeUndefined();
  });

  it("contacto 2 no pagamento: o texto não muda (só o contacto 1 tem as variantes)", async () => {
    mock.candidates.mockResolvedValue([atPayment({ createdAt: new Date(Date.now() - 21 * 3_600_000), recoveryStage: 1 })]);
    await runCheckoutRecoverySweep();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({ stage: 2 }));
    expect(mock.attempt).not.toHaveBeenCalled();
  });
});
