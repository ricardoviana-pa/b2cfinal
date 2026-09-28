import { describe, expect, it, vi } from "vitest";
import {
  DAY_MS,
  brevoAddConfirmed,
  brevoAttributes,
  brevoRemove,
  confirmExpiry,
  confirmUrl,
  decoyRef,
  doiAllowed,
  interestRef,
  isNewsletterAvailable,
  isPopupEnabled,
  isProxyEmail,
  isUiPreview,
  newsletterLocales,
  normaliseEmail,
  originFromSource,
  parseInterestRef,
  publicLeadSource,
  safeErrorLabel,
  signToken,
  unsubscribeTarget,
  verifyToken,
  visitOriginMetadata,
} from "./newsletter";

const LIVE = {
  NODE_ENV: "production",
  RENDER_GIT_BRANCH: "main",
  SITE_URL: "https://www.portugalactive.com",
  DATABASE_URL: "mysql://synthetic",
  RESEND_API_KEY: "re_synthetic_not_real",
  NEWSLETTER_TOKEN_SECRET: "test-secret-never-real",
} as NodeJS.ProcessEnv;
const NOW = Date.parse("2026-10-05T10:00:00Z");

describe("configuration: no key the site does not already have", () => {
  it("the forms work on the live site with the database and the transactional email it already uses", () => {
    expect(isNewsletterAvailable(LIVE)).toBe(true);
    expect(isPopupEnabled(LIVE)).toBe(true);
    // No Brevo key needed.
    expect(LIVE.BREVO_API_KEY).toBeUndefined();
  });

  it("hidden without the database or the email, and on any preview", () => {
    expect(isNewsletterAvailable({ ...LIVE, DATABASE_URL: "" })).toBe(false);
    expect(isNewsletterAvailable({ ...LIVE, RESEND_API_KEY: "" })).toBe(false);
    expect(isNewsletterAvailable({ ...LIVE, APP_ENV: "preview" })).toBe(false);
    expect(isNewsletterAvailable({ ...LIVE, RENDER_GIT_BRANCH: "dev" })).toBe(false);
  });

  it("NEWSLETTER_POPUP=false switches off only the pop-up", () => {
    const env = { ...LIVE, NEWSLETTER_POPUP: "false" };
    expect(isNewsletterAvailable(env)).toBe(true);
    expect(isPopupEnabled(env)).toBe(false);
  });

  it("the UI preview flag only works on previews (visual check), never on the live site", () => {
    expect(isUiPreview({ ...LIVE, NEWSLETTER_UI_PREVIEW: "true" })).toBe(false);
    expect(isUiPreview({ APP_ENV: "preview", NEWSLETTER_UI_PREVIEW: "true" })).toBe(true);
    expect(isPopupEnabled({ APP_ENV: "preview", NEWSLETTER_UI_PREVIEW: "true" })).toBe(true);
  });

  it("pop-up languages: Portuguese until native review, a list when set", () => {
    expect(newsletterLocales({})).toEqual(["pt"]);
    expect(newsletterLocales({ NEWSLETTER_LOCALES: "pt, ES,en,xxx" })).toEqual(["pt", "es", "en"]);
  });
});

describe("signed tokens", () => {
  it("a confirmation link is valid for 7 days, then expires", () => {
    const exp = confirmExpiry(NOW);
    expect(exp).toBe(NOW / 1000 + 7 * 86_400);
    const t = signToken("confirm", 42, exp, LIVE);
    expect(t).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyToken("confirm", 42, exp, t, LIVE, NOW)).toBe("ok");
    expect(verifyToken("confirm", 42, exp, t, LIVE, NOW + 8 * DAY_MS)).toBe("expired");
  });

  it("a changed lead, expiry, kind or secret is invalid", () => {
    const exp = confirmExpiry(NOW);
    const t = signToken("confirm", 42, exp, LIVE);
    expect(verifyToken("confirm", 43, exp, t, LIVE, NOW)).toBe("invalid");
    expect(verifyToken("confirm", 42, exp + 86_400, t, LIVE, NOW)).toBe("invalid");
    expect(verifyToken("exit", 42, exp, t, LIVE, NOW)).toBe("invalid");
    expect(verifyToken("confirm", 42, exp, t, { ...LIVE, NEWSLETTER_TOKEN_SECRET: "other" }, NOW)).toBe("invalid");
    expect(verifyToken("confirm", 42, exp, "zz", LIVE, NOW)).toBe("invalid");
    expect(verifyToken("confirm", 42, exp, t, { NODE_ENV: "production" }, NOW)).toBe("invalid");
  });

  it("falls back to JWT_SECRET, which production always has", () => {
    const env = { JWT_SECRET: "jwt-synthetic" } as NodeJS.ProcessEnv;
    const t = signToken("exit", 7, 0, env);
    expect(verifyToken("exit", 7, 0, t, env)).toBe("ok");
  });

  it("the exit link never expires", () => {
    const t = signToken("exit", 42, 0, LIVE);
    expect(verifyToken("exit", 42, 0, t, LIVE, NOW + 3650 * DAY_MS)).toBe("ok");
  });

  it("the confirmation URL carries the lead id and the token, never the address", () => {
    const url = confirmUrl(42, "pt", confirmExpiry(NOW), LIVE);
    expect(url).toMatch(/^https:\/\/www\.portugalactive\.com\/api\/newsletter\/confirm\?lead=42&e=\d+&t=[0-9a-f]{32}&lang=pt$/);
    expect(url).not.toContain("@");
  });

  it("the interest reference works for its lead only; the decoy looks the same and works for nothing", () => {
    const ref = interestRef(42, LIVE, NOW);
    expect(parseInterestRef(ref, LIVE, NOW)).toBe(42);
    expect(parseInterestRef(ref.replace(/^42\./, "43."), LIVE, NOW)).toBeNull();
    expect(parseInterestRef(ref, LIVE, NOW + 2 * DAY_MS)).toBeNull();
    const decoy = decoyRef(NOW);
    expect(decoy).toMatch(/^\d+\.\d+\.[0-9a-f]{32}$/);
    expect(parseInterestRef(decoy, LIVE, NOW)).toBeNull();
  });
});

describe("confirmation emails per address", () => {
  const H = 60 * 60 * 1000;
  it("one per hour and three per 24 hours", () => {
    expect(doiAllowed([], NOW)).toBe(true);
    expect(doiAllowed([NOW - 30 * 60 * 1000], NOW)).toBe(false);
    expect(doiAllowed([NOW - 2 * H], NOW)).toBe(true);
    expect(doiAllowed([NOW - 10 * H, NOW - 5 * H, NOW - 2 * H], NOW)).toBe(false);
    expect(doiAllowed([NOW - 30 * H, NOW - 26 * H, NOW - 2 * H], NOW)).toBe(true);
  });
});

describe("lead sources", () => {
  it("origins round-trip between pending and confirmed; unsubscribed is not an origin", () => {
    expect(originFromSource("nl-pending-house")).toBe("house");
    expect(originFromSource("newsletter-popup")).toBe("popup");
    expect(originFromSource("newsletter-checkout")).toBeNull();
    expect(originFromSource("nl-unsubscribed-popup")).toBeNull();
    expect(originFromSource(null)).toBeNull();
  });

  it("the public leads.create can never write consent", () => {
    expect(publicLeadSource("newsletter-footer")).toBe("nl-legacy-footer");
    expect(publicLeadSource("newsletter")).toBe("nl-legacy-unknown");
    expect(publicLeadSource("nl-pending-popup")).toBe("nl-legacy-popup");
    expect(publicLeadSource("nl-unsubscribed-popup")).toBe("nl-legacy-popup");
    expect(publicLeadSource("contact-form")).toBe("contact-form");
    expect(publicLeadSource("search-no-availability")).toBe("search-no-availability");
  });

  it("leaving withdraws every consent: the checkout box goes back to checkout, the rest to nl-unsubscribed", () => {
    expect(unsubscribeTarget("newsletter-checkout")).toEqual({ source: "checkout", consent: "false" });
    expect(unsubscribeTarget("newsletter-popup")).toEqual({ source: "nl-unsubscribed-popup" });
    expect(unsubscribeTarget("newsletter-footer")).toEqual({ source: "nl-unsubscribed-footer" });
    expect(unsubscribeTarget("nl-pending-house")).toEqual({ source: "nl-unsubscribed-house" });
    expect(unsubscribeTarget("newsletter")).toEqual({ source: "nl-unsubscribed-unknown" });
  });

  it("addresses", () => {
    expect(normaliseEmail("  Guest@Example.TEST ")).toBe("guest@example.test");
    expect(isProxyEmail("abc@guest.airbnb.com")).toBe(true);
    expect(isProxyEmail("abc@example.org")).toBe(false);
  });
});

describe("visit origin with the sign-up (links the subscriber to the Google or Meta campaign)", () => {
  it("keeps the cleaned UTM and the click id TYPE, only with consent", () => {
    const meta = visitOriginMetadata({
      v: 1, consent: true, stored: true,
      first: { utm_source: "google", utm_medium: "cpc", utm_campaign: "2026-10_o1_pt_familias", clickId: "gclid", at: "2026-10-01T10:00:00Z" },
      last: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "2026-10_o1_es_pilar", utm_content: "lareira", clickId: "fbclid", landing: "/homes/casa-x", at: "2026-10-05T09:00:00Z" },
    });
    expect(meta).toMatchObject({
      visitConsent: "true", utmSource: "meta", utmMedium: "paid_social", utmCampaign: "2026-10_o1_es_pilar",
      utmContent: "lareira", clickId: "fbclid", landing: "/homes/casa-x",
      firstUtmSource: "google", firstUtmCampaign: "2026-10_o1_pt_familias", firstClickId: "gclid",
    });
    expect(visitOriginMetadata({ v: 1, consent: false })).toEqual({ visitConsent: "false" });
    expect(visitOriginMetadata(null)).toEqual({});
  });
});

describe("Brevo is optional", () => {
  it("never called without the key and the list", async () => {
    const fetchImpl = vi.fn();
    expect(await brevoAddConfirmed("a@b.test", {}, LIVE, fetchImpl)).toBeNull();
    expect(await brevoRemove("a@b.test", LIVE, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("with the key: confirmed contact into the list, exit out of it (no second opt-in)", async () => {
    const env = { ...LIVE, BREVO_API_KEY: "xkeysib-synthetic", BREVO_NEWSLETTER_LIST_ID: "42" };
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    await brevoAddConfirmed("a@b.test", { locale: "pt", origin: "house", propertyName: "Casa X", interest: "family", consentAt: "x", confirmedAt: "y" }, env, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/contacts");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ email: "a@b.test", listIds: [42], updateEnabled: true });
    expect(body.attributes).toMatchObject({ LINGUA: "pt", ORIGEM_SITE: "house", CASA_INTERESSE: "Casa X", INTERESSE: "family" });
    await brevoRemove("a@b.test", env, fetchImpl);
    const [url2, init2] = fetchImpl.mock.calls[1] as unknown as [string, RequestInit];
    expect(url2).toBe("https://api.brevo.com/v3/contacts/a%40b.test?identifierType=email_id");
    expect(JSON.parse(String(init2.body))).toEqual({ unlinkListIds: [42] });
  });

  it("never on a preview, even with a key", async () => {
    const fetchImpl = vi.fn();
    expect(await brevoAddConfirmed("a@b.test", {}, { APP_ENV: "preview", BREVO_API_KEY: "k", BREVO_NEWSLETTER_LIST_ID: "1" }, fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("the campaign attributes (CASA, SAUDACAO, WA_LINK) are never written by the site", () => {
    const attrs = brevoAttributes({ locale: "es" });
    expect(Object.keys(attrs)).not.toContain("CASA");
    expect(Object.keys(attrs)).not.toContain("SAUDACAO");
    expect(Object.keys(attrs)).not.toContain("WA_LINK");
  });
});

describe("log hygiene", () => {
  it("an error label never carries the message (a Drizzle message has the address)", () => {
    const err = Object.assign(new Error("Failed query: insert ... params: guest@example.test"), { code: "ER_DUP_ENTRY" });
    expect(safeErrorLabel(err)).toBe("Error ER_DUP_ENTRY");
    expect(safeErrorLabel("x")).toBe("string");
  });
});
