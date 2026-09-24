import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  candidates: vi.fn(), claim: vi.fn(), send: vi.fn(), properties: vi.fn(), eligible: vi.fn(),
  consent: vi.fn(), claimAlert: vi.fn(), alert: vi.fn(), update: vi.fn(), beQuote: vi.fn(), avail: vi.fn(),
}));
vi.mock("../db", () => ({
  listRecoveryCandidates: mock.candidates, claimRecoveryStage: mock.claim,
  hasNewsletterConsent: mock.consent, claimConciergeAlert: mock.claimAlert, updateBookingIntent: mock.update,
}));
vi.mock("./transactional-email", () => ({ sendCheckoutRecovery: mock.send, sendConciergeCallAlert: mock.alert }));
vi.mock("./guesty-booking", () => ({ createBEQuote: mock.beQuote }));
vi.mock("./guesty", () => ({ checkAvailability: mock.avail, describeGuestyError: (e: any) => String(e?.message ?? e) }));
vi.mock("../lib/guesty", () => ({ guestyClient: { getListingCalendar: vi.fn().mockResolvedValue([]) } }));
vi.mock("./properties-store", () => ({ getPropertiesForSite: mock.properties }));
vi.mock('./recovery-eligibility', () => ({ canRemindRecoveryStay: mock.eligible }));
import { recoveryOptoutUrl, runCheckoutRecoverySweep, startCheckoutRecoveryScheduler } from "./checkout-recovery";

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
});
