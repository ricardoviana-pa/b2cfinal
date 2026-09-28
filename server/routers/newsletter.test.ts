import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  recentSends: vi.fn(),
  createLead: vi.fn(),
  markFailed: vi.fn(),
  setInterest: vi.fn(),
  funnel: vi.fn(),
  properties: vi.fn(),
  sendConfirmation: vi.fn(),
}));
vi.mock("../db", () => ({
  recentNewsletterSends: mock.recentSends,
  createLead: mock.createLead,
  markNewsletterSendFailed: mock.markFailed,
  setNewsletterInterest: mock.setInterest,
  newsletterFunnel: mock.funnel,
}));
vi.mock("../services/properties-store", () => ({ getPropertiesForSite: mock.properties }));
vi.mock("../services/transactional-email", () => ({ sendNewsletterConfirmation: mock.sendConfirmation }));
import { newsletterRouter } from "./newsletter";
import { interestRef } from "../services/newsletter";

const EMAIL = "guest@example.test";
const ctx = (headers: Record<string, string> = {}) => ({ req: { headers }, res: {}, user: null }) as any;
const input = (over: Record<string, unknown> = {}) => ({
  email: ` ${EMAIL.toUpperCase()} `,
  locale: "pt",
  origin: "house" as const,
  page: "/homes/casa-x?checkin=2026-11-01",
  propertySlug: "casa-x",
  device: "mobile" as const,
  hp: "",
  ...over,
});
const logs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  // CI runs the suite with APP_ENV=preview; these cases describe the live site.
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("RENDER_SERVICE_ID", "");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("DATABASE_URL", "mysql://synthetic");
  vi.stubEnv("RESEND_API_KEY", "re_synthetic_not_real");
  vi.stubEnv("NEWSLETTER_TOKEN_SECRET", "test-secret-never-real");
  vi.stubEnv("NEWSLETTER_LOCALES", "pt,es");
  vi.stubEnv("BREVO_API_KEY", "");
  vi.stubEnv("NEWSLETTER_POPUP", "");
  vi.stubEnv("NEWSLETTER_HOUSE_ALERTS", "");
  vi.stubEnv("NEWSLETTER_FOOTER_LOCALES", "");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
  for (const level of ["info", "warn", "error", "log"] as const) {
    vi.spyOn(console, level).mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  }
  mock.recentSends.mockResolvedValue([]);
  mock.createLead.mockResolvedValue({ id: 91 });
  mock.markFailed.mockResolvedValue(undefined);
  mock.sendConfirmation.mockResolvedValue(undefined);
  mock.properties.mockResolvedValue([
    { slug: "casa-x", name: "Casa X by Portugal Active I Pool", guestyId: "abc123", isActive: true },
    { slug: "quinta-parceira", name: "Quinta Parceira", source: "tripwix", isActive: true },
  ]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("newsletter.config", () => {
  it("tells the client what the live site allows, with no Brevo key", async () => {
    const cfg = await newsletterRouter.createCaller(ctx()).config();
    expect(cfg).toEqual({
      available: true,
      popup: true,
      locales: ["pt", "es"],
      footerLocales: ["pt", "es"],
      houseAlerts: false,
      timings: { desktopDelayMs: 8000, mobileDelayMs: 15000, mobileScrollPct: 40, cooldownDays: 30 },
    });
  });

  it("the footer follows the languages with native review; more only by NEWSLETTER_FOOTER_LOCALES (Ricardo's decision)", async () => {
    vi.stubEnv("NEWSLETTER_LOCALES", "pt");
    expect(await newsletterRouter.createCaller(ctx()).config()).toMatchObject({ footerLocales: ["pt"] });
    vi.stubEnv("NEWSLETTER_FOOTER_LOCALES", "pt, ES,en,xx1");
    expect(await newsletterRouter.createCaller(ctx()).config()).toMatchObject({ footerLocales: ["pt", "es", "en"] });
  });

  it("house pages promise an alert only with NEWSLETTER_HOUSE_ALERTS=true (the CRM rule approved)", async () => {
    vi.stubEnv("NEWSLETTER_HOUSE_ALERTS", "true");
    expect(await newsletterRouter.createCaller(ctx()).config()).toMatchObject({ houseAlerts: true });
    vi.stubEnv("NEWSLETTER_HOUSE_ALERTS", "1");
    expect(await newsletterRouter.createCaller(ctx()).config()).toMatchObject({ houseAlerts: false });
  });

  it("the kill switch removes only the pop-up; without the email nothing shows", async () => {
    vi.stubEnv("NEWSLETTER_POPUP", "false");
    expect(await newsletterRouter.createCaller(ctx()).config()).toMatchObject({ available: true, popup: false });
    vi.stubEnv("NEWSLETTER_POPUP", "");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(await newsletterRouter.createCaller(ctx()).config()).toMatchObject({ available: false, popup: false });
  });
});

describe("newsletter.subscribe", () => {
  it("stores a PENDING lead in the site's leads table with the proof of consent, and sends the confirmation", async () => {
    const result = await newsletterRouter.createCaller(ctx({ "cf-ipcountry": "es" })).subscribe(input());
    expect(result.ok).toBe(true);
    expect(result.ref).toMatch(/^91\.\d+\.[0-9a-f]{32}$/);

    expect(mock.createLead).toHaveBeenCalledTimes(1);
    const lead = mock.createLead.mock.calls[0][0];
    expect(lead.email).toBe(EMAIL);
    // Pending: not "newsletter*", so neither the Mailing List nor the checkout recovery count it.
    expect(lead.source).toBe("nl-pending-house");
    expect(lead.metadata).toMatchObject({
      flow: "site-doi-v1",
      origin: "house",
      locale: "pt",
      page: "/homes/casa-x",
      pageKind: "house",
      device: "mobile",
      propertySlug: "casa-x",
      propertyName: "Casa X",
      listingId: "abc123",
      country: "ES",
      consent: "true",
      consentVersion: "2026-09-28",
    });
    expect(lead.metadata.consentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(lead.metadata.consentText).toContain("Ao subscrever, aceita receber emails da Portugal Active");
    expect(lead.metadata.consentText).toContain("https://www.portugalactive.com/pt/legal/privacy");
    expect(lead.metadata.trigger).toBeUndefined();
    // Alert version off (default): the house is the interest, no alert was promised.
    expect(lead.metadata.alertListingId).toBeUndefined();

    expect(mock.sendConfirmation).toHaveBeenCalledTimes(1);
    const mail = mock.sendConfirmation.mock.calls[0][0];
    expect(mail).toMatchObject({ email: EMAIL, locale: "pt", leadId: 91, houseName: "Casa X" });
    expect(mail.confirmUrl).toMatch(/^https:\/\/www\.portugalactive\.com\/api\/newsletter\/confirm\?lead=91&e=\d+&t=[0-9a-f]{32}&lang=pt$/);
    // No Brevo, no other network call.
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(logs.join("\n")).not.toContain("example.test");
    expect(logs.join("\n")).toContain("confirmation sent for lead #91 origin=house lang=pt");
  });

  it("records the pop-up trigger, and the campaign of the visit when the visitor accepted measurement", async () => {
    await newsletterRouter.createCaller(ctx()).subscribe(input({
      origin: "popup",
      trigger: "exit",
      propertySlug: undefined,
      page: "/",
      visitOrigin: { v: 1, consent: true, stored: true, first: null, last: { ageSec: 60, utm_source: "google", utm_medium: "cpc", utm_campaign: "2026-10_o1_pt_familias", clickId: "gclid" } },
    }));
    const meta = mock.createLead.mock.calls[0][0].metadata;
    expect(meta).toMatchObject({ origin: "popup", trigger: "exit", pageKind: "home", visitConsent: "true", utmSource: "google", utmMedium: "cpc", utmCampaign: "2026-10_o1_pt_familias", clickId: "gclid" });
    expect(meta.propertySlug).toBeUndefined();
  });

  it("without measurement consent, no campaign is kept", async () => {
    await newsletterRouter.createCaller(ctx()).subscribe(input({ visitOrigin: { v: 1, consent: false } }));
    const meta = mock.createLead.mock.calls[0][0].metadata;
    expect(meta.visitConsent).toBe("false");
    expect(meta.utmSource).toBeUndefined();
  });

  it("partner homes: no house recorded, no house line in the email", async () => {
    await newsletterRouter.createCaller(ctx()).subscribe(input({ propertySlug: "quinta-parceira" }));
    expect(mock.createLead.mock.calls[0][0].metadata.propertyName).toBeUndefined();
    expect(mock.sendConfirmation.mock.calls[0][0].houseName).toBeUndefined();
  });

  it("with the alert version on, the lead says which house was promised an alert (the CRM owes that email)", async () => {
    vi.stubEnv("NEWSLETTER_HOUSE_ALERTS", "true");
    await newsletterRouter.createCaller(ctx()).subscribe(input());
    expect(mock.createLead.mock.calls[0][0].metadata).toMatchObject({ listingId: "abc123", alertListingId: "abc123" });
    // A partner home never gets the promise, even with the switch on.
    mock.recentSends.mockResolvedValue([]);
    await newsletterRouter.createCaller(ctx()).subscribe(input({ email: "other@example.test", propertySlug: "quinta-parceira" }));
    expect(mock.createLead.mock.calls[1][0].metadata.alertListingId).toBeUndefined();
    // No house on the page: nothing promised.
    await newsletterRouter.createCaller(ctx()).subscribe(input({ email: "third@example.test", origin: "article", propertySlug: undefined, page: "/blog/x" }));
    expect(mock.createLead.mock.calls[2][0].metadata.alertListingId).toBeUndefined();
  });

  it("at most one confirmation email per address per hour, with the same success answer", async () => {
    mock.recentSends.mockResolvedValue([Date.now() - 10 * 60 * 1000]);
    const result = await newsletterRouter.createCaller(ctx()).subscribe(input());
    expect(result.ok).toBe(true);
    expect(result.ref).toMatch(/^\d+\.\d+\.[0-9a-f]{32}$/);
    expect(mock.createLead).not.toHaveBeenCalled();
    expect(mock.sendConfirmation).not.toHaveBeenCalled();
    expect(mock.recentSends).toHaveBeenCalledWith(EMAIL, 24 * 60 * 60 * 1000);
    expect(logs.join("\n")).toContain("confirmation throttled");
    expect(logs.join("\n")).not.toContain("example.test");
  });

  it("parallel sign-ups of the same address send one email (the limit cannot be raced)", async () => {
    let release!: () => void;
    mock.recentSends.mockImplementation(() => new Promise((resolve) => { release = () => resolve([]); }));
    const caller = newsletterRouter.createCaller(ctx());
    const first = caller.subscribe(input());
    const second = await caller.subscribe(input({ email: EMAIL.toLowerCase() }));
    expect(second.ok).toBe(true);
    release();
    expect((await first).ok).toBe(true);
    expect(mock.createLead).toHaveBeenCalledTimes(1);
    expect(mock.sendConfirmation).toHaveBeenCalledTimes(1);
    // Once the first finished, the address is free again (the per-address limit then decides).
    mock.recentSends.mockResolvedValue([]);
    await caller.subscribe(input());
    expect(mock.createLead).toHaveBeenCalledTimes(2);
  });

  it("a bot (honeypot) gets the same answer and nothing is stored or sent", async () => {
    const result = await newsletterRouter.createCaller(ctx()).subscribe(input({ hp: "http://spam" }));
    expect(result.ok).toBe(true);
    expect(mock.recentSends).not.toHaveBeenCalled();
    expect(mock.createLead).not.toHaveBeenCalled();
    expect(mock.sendConfirmation).not.toHaveBeenCalled();
  });

  it("refuses the booking platforms' relay addresses", async () => {
    await expect(newsletterRouter.createCaller(ctx()).subscribe(input({ email: "x1@guest.airbnb.com" }))).rejects.toMatchObject({ message: "PROXY_EMAIL", code: "BAD_REQUEST" });
    expect(mock.createLead).not.toHaveBeenCalled();
  });

  it("503 when the site cannot send the confirmation (no email or no database)", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(newsletterRouter.createCaller(ctx()).subscribe(input())).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(mock.createLead).not.toHaveBeenCalled();
  });

  it("a failed email marks the lead (it does not count for the limit) and answers an error, never with the address", async () => {
    mock.sendConfirmation.mockRejectedValue(new Error(`Resend error for ${EMAIL}`));
    await expect(newsletterRouter.createCaller(ctx()).subscribe(input())).rejects.toMatchObject({ message: "NEWSLETTER_SEND_FAILED" });
    expect(mock.markFailed).toHaveBeenCalledWith(91);
    expect(logs.join("\n")).not.toContain("example.test");
  });

  it("a database error is logged by class only (a Drizzle message carries the address)", async () => {
    mock.createLead.mockRejectedValue(Object.assign(new Error(`Failed query: insert into leads params: ${EMAIL}`), { code: "ER_BAD_FIELD_ERROR" }));
    await expect(newsletterRouter.createCaller(ctx()).subscribe(input())).rejects.toMatchObject({ message: "NEWSLETTER_STORE_FAILED" });
    expect(logs.join("\n")).toContain("ER_BAD_FIELD_ERROR");
    expect(logs.join("\n")).not.toContain("example.test");
  });

  it("is read-only on a preview", async () => {
    vi.stubEnv("APP_ENV", "preview");
    await expect(newsletterRouter.createCaller(ctx()).subscribe(input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.createLead).not.toHaveBeenCalled();
  });
});

describe("newsletter.interest", () => {
  it("stores the answer on the lead the reference was issued for", async () => {
    mock.setInterest.mockResolvedValue({ id: 91, email: EMAIL, source: "nl-pending-house", metadata: { flow: "site-doi-v1" } });
    const ref = interestRef(91);
    expect(await newsletterRouter.createCaller(ctx()).interest({ ref, interest: "family" })).toEqual({ ok: true });
    expect(mock.setInterest).toHaveBeenCalledWith(91, "family", expect.stringMatching(/^\d{4}-/));
  });

  it("a forged or decoy reference answers ok and writes nothing", async () => {
    const ref = interestRef(91).replace(/^91\./, "92.");
    expect(await newsletterRouter.createCaller(ctx()).interest({ ref, interest: "work" })).toEqual({ ok: true });
    expect(mock.setInterest).not.toHaveBeenCalled();
  });

  it("only the listed answers are accepted (no free text)", async () => {
    await expect(newsletterRouter.createCaller(ctx()).interest({ ref: interestRef(91), interest: "anything" as any })).rejects.toBeTruthy();
  });
});
