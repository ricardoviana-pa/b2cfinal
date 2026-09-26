import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BREVO_API_BASE,
  brevoAttributes,
  confirmToken,
  confirmUrl,
  confirmedPagePath,
  createDoiContact,
  doiTemplateId,
  fireConfirmedEvent,
  isNewsletterConfigured,
  isNewsletterEnabled,
  isProxyEmail,
  newsletterLocales,
  normaliseEmail,
  originFromSource,
  pendingSource,
  confirmedSource,
  popupDelayMs,
  sendWelcomeTransactional,
  verifyConfirmToken,
  welcomeMode,
  welcomeParams,
} from "./newsletter";
import { formatValidUntil, interestLine, newsletterLang, offerLine } from "./newsletter-copy";

const PROD = {
  NODE_ENV: "production",
  RENDER_GIT_BRANCH: "main",
  SITE_URL: "https://www.portugalactive.com",
  NEWSLETTER_TOKEN_SECRET: "test-secret-never-real",
  BREVO_API_KEY: "xkeysib-test-not-real",
  BREVO_NEWSLETTER_LIST_ID: "42",
  BREVO_DOI_TEMPLATE_ID_PT: "101",
  BREVO_DOI_TEMPLATE_ID_EN: "103",
  BREVO_WELCOME_TEMPLATE_ID_PT: "201",
} as NodeJS.ProcessEnv;

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("sources and origins", () => {
  it("keeps pending subscriptions out of the newsletter-% consent match", () => {
    expect(pendingSource("house")).toBe("nl-pending-house");
    expect(pendingSource("house").startsWith("newsletter")).toBe(false);
    expect(confirmedSource("footer")).toBe("newsletter-footer");
  });
  it("reads the origin back from either source", () => {
    expect(originFromSource("nl-pending-popup")).toBe("popup");
    expect(originFromSource("newsletter-article")).toBe("article");
    expect(originFromSource("newsletter-checkout")).toBeNull();
    expect(originFromSource("contact-form")).toBeNull();
    expect(originFromSource(undefined)).toBeNull();
  });
});

describe("email hygiene", () => {
  it("normalises and rejects platform relay addresses", () => {
    expect(normaliseEmail("  Guest@Example.TEST ")).toBe("guest@example.test");
    expect(isProxyEmail("abc123@guest.airbnb.com")).toBe(true);
    expect(isProxyEmail("abc@guest.booking.com")).toBe(true);
    expect(isProxyEmail("x@m.expediapartnercentral.com")).toBe(true);
    expect(isProxyEmail("guest@example.test")).toBe(false);
  });
});

describe("configuration", () => {
  it("shows only Portuguese until the other languages are reviewed", () => {
    expect(newsletterLocales({})).toEqual(["pt"]);
    expect(newsletterLocales({ NEWSLETTER_LOCALES: "pt, es ,EN,xx1" })).toEqual(["pt", "es", "en"]);
    expect(popupDelayMs({})).toBe(20_000);
    expect(popupDelayMs({ NEWSLETTER_POPUP_DELAY_MS: "5000" })).toBe(5000);
    expect(popupDelayMs({ NEWSLETTER_POPUP_DELAY_MS: "10" })).toBe(20_000);
  });
  it("needs the Brevo key, the list and the PT DOI template", () => {
    expect(isNewsletterConfigured(PROD)).toBe(true);
    expect(isNewsletterConfigured({ ...PROD, BREVO_API_KEY: "" })).toBe(false);
    expect(isNewsletterConfigured({ ...PROD, BREVO_NEWSLETTER_LIST_ID: "" })).toBe(false);
    expect(isNewsletterConfigured({ ...PROD, BREVO_DOI_TEMPLATE_ID_PT: "", BREVO_DOI_TEMPLATE_ID_EN: "" })).toBe(false);
  });
  it("is enabled in production only, and never with the kill switch", () => {
    expect(isNewsletterEnabled(PROD)).toBe(true);
    expect(isNewsletterEnabled({ ...PROD, NEWSLETTER_POPUP: "false" })).toBe(false);
    expect(isNewsletterEnabled({ ...PROD, APP_ENV: "preview" })).toBe(false);
    expect(isNewsletterEnabled({ ...PROD, RENDER_GIT_BRANCH: "dev" })).toBe(false);
  });
  it("falls back to the English template for languages without one", () => {
    expect(doiTemplateId("pt", PROD)).toBe(101);
    expect(doiTemplateId("es", PROD)).toBe(103);
    expect(doiTemplateId("de", PROD)).toBe(103);
    expect(newsletterLang("fr-FR")).toBe("en");
    expect(newsletterLang("PT")).toBe("pt");
    expect(welcomeMode({})).toBe("event");
    expect(welcomeMode({ NEWSLETTER_WELCOME_MODE: "transactional" })).toBe("transactional");
    expect(welcomeMode({ NEWSLETTER_WELCOME_MODE: "off" })).toBe("off");
  });
});

describe("confirmation token", () => {
  it("is a 32-hex HMAC of the lead id, verified in constant time", () => {
    const token = confirmToken(123, PROD);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(verifyConfirmToken(123, token, PROD)).toBe(true);
    expect(verifyConfirmToken(123, token.toUpperCase(), PROD)).toBe(true);
    expect(verifyConfirmToken(124, token, PROD)).toBe(false);
    expect(verifyConfirmToken(123, token.slice(1), PROD)).toBe(false);
    expect(verifyConfirmToken(123, "", PROD)).toBe(false);
    expect(verifyConfirmToken(0, token, PROD)).toBe(false);
  });
  it("uses the recovery secret or the JWT secret when no newsletter secret is set", () => {
    const a = confirmToken(7, { RECOVERY_OPTOUT_SECRET: "r" });
    const b = confirmToken(7, { JWT_SECRET: "j" });
    expect(a).not.toBe(b);
    expect(() => confirmToken(7, {})).toThrow(/secret/i);
    expect(verifyConfirmToken(7, a, {})).toBe(false);
  });
  it("never puts the address in the confirmation URL", () => {
    const url = confirmUrl(55, "pt", PROD);
    expect(url).toBe(`https://www.portugalactive.com/api/newsletter/confirmed?lead=55&t=${confirmToken(55, PROD)}&lang=pt`);
    expect(url).not.toContain("@");
    expect(confirmedPagePath("de")).toBe("/en/newsletter/confirmada");
    expect(confirmedPagePath("pt")).toBe("/pt/newsletter/confirmada");
  });
});

describe("attributes and welcome params", () => {
  it("writes only the flow's own attributes (never CASA, SAUDACAO or WA_LINK)", () => {
    const attrs = brevoAttributes({
      locale: "pt", country: "es", origin: "house", page: "/homes/casa-x",
      propertyName: "Casa X", listingId: "abc123", subscribedAt: "2026-10-01T10:00:00.000Z",
    });
    expect(attrs).toEqual({
      LINGUA: "pt", PAIS: "ES", ORIGEM_SITE: "house", PAGINA_SITE: "/homes/casa-x",
      CASA_INTERESSE: "Casa X", CASA_INTERESSE_ID: "abc123", INSCRITO_EM: "2026-10-01T10:00:00.000Z",
    });
    expect(Object.keys(attrs)).not.toContain("CASA");
    expect(Object.keys(attrs)).not.toContain("SAUDACAO");
    expect(Object.keys(attrs)).not.toContain("WA_LINK");
  });
  it("leaves the offer line empty until the code is decided", () => {
    const params = welcomeParams({ locale: "pt", propertyName: "Casa X", confirmedAt: "2026-10-01T10:00:00.000Z" }, PROD);
    expect(params.LINHA_OFERTA).toBe("");
    expect(params.CODIGO_PROMO).toBe("");
    expect(params.LINHA_INTERESSE).toContain("Casa X");
    expect(params.WA_LINK_NL).toMatch(/^https:\/\/wa\.me\/351927161771\?text=/);
    expect(params.CONFIRMADO_EM).toBe("2026-10-01T10:00:00.000Z");
  });
  it("writes the offer line from the coupon's own date, never by hand", () => {
    const env = { ...PROD, NEWSLETTER_WELCOME_CODE: "bemvindo", NEWSLETTER_WELCOME_CODE_UNTIL: "2027-06-30", NEWSLETTER_WELCOME_PCT: "10" };
    const params = welcomeParams({ locale: "pt", confirmedAt: "x" }, env);
    expect(params.CODIGO_PROMO).toBe("BEMVINDO");
    expect(params.CODIGO_VALIDADE_TXT).toBe("30 de junho de 2027");
    expect(params.LINHA_OFERTA).toContain("BEMVINDO");
    expect(params.LINHA_OFERTA).toContain("fora de julho e agosto");
    expect(params.LINHA_INTERESSE).toBe("");
    expect(formatValidUntil("en", "2027-06-30")).toBe("30 June 2027");
    expect(formatValidUntil("pt", "not-a-date")).toBe("");
    expect(offerLine("pt", "X", "", "10")).toBe("");
    expect(interestLine("es", "  ")).toBe("");
  });
});

describe("Brevo calls (fetch injected)", () => {
  it("asks for a double opt-in with the list, the template of the language and the attributes", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, {}));
    const result = await createDoiContact(
      { email: "guest@example.test", locale: "pt", redirectionUrl: "https://www.portugalactive.com/api/newsletter/confirmed?lead=1&t=x", attributes: { LINGUA: "pt" } },
      PROD,
      fetchMock,
    );
    expect(result).toEqual({ ok: true, status: 201 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BREVO_API_BASE}/contacts/doubleOptinConfirmation`);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["api-key"]).toBe("xkeysib-test-not-real");
    expect(JSON.parse(String(init.body))).toEqual({
      email: "guest@example.test",
      includeListIds: [42],
      templateId: 101,
      redirectionUrl: "https://www.portugalactive.com/api/newsletter/confirmed?lead=1&t=x",
      attributes: { LINGUA: "pt" },
    });
  });
  it("reports a blocked (unsubscribed) contact without failing, and a network error as a failure", async () => {
    const blocked = vi.fn(async () => jsonResponse(400, { code: "invalid_parameter", message: "Contact is blacklisted" }));
    expect(await createDoiContact({ email: "a@example.test", locale: "en", redirectionUrl: "u", attributes: {} }, PROD, blocked))
      .toMatchObject({ ok: false, blocked: true, status: 400 });
    const down = vi.fn(async () => { throw new TypeError("fetch failed"); });
    expect(await createDoiContact({ email: "a@example.test", locale: "en", redirectionUrl: "u", attributes: {} }, PROD, down))
      .toEqual({ ok: false, status: 0, code: "network" });
    const other = vi.fn(async () => jsonResponse(401, { code: "unauthorized", message: "Key not found" }));
    expect(await createDoiContact({ email: "a@example.test", locale: "en", redirectionUrl: "u", attributes: {} }, PROD, other))
      .toEqual({ ok: false, status: 401, blocked: false, code: "unauthorized" });
  });
  it("does not call Brevo when the list or the template is missing", async () => {
    const fetchMock = vi.fn();
    const result = await createDoiContact({ email: "a@example.test", locale: "pt", redirectionUrl: "u", attributes: {} }, { ...PROD, BREVO_NEWSLETTER_LIST_ID: "" }, fetchMock);
    expect(result.code).toBe("not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fires the newsletter_confirmada event with the pre-computed contact properties", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    const params = welcomeParams({ locale: "pt", confirmedAt: "2026-10-01T10:00:00.000Z" }, PROD);
    await fireConfirmedEvent({ email: "guest@example.test", origin: "popup", params }, PROD, fetchMock);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BREVO_API_BASE}/events`);
    const body = JSON.parse(String(init.body));
    expect(body.event_name).toBe("newsletter_confirmada");
    expect(body.identifiers).toEqual({ email_id: "guest@example.test" });
    expect(body.contact_properties.CONFIRMADO_EM).toBe("2026-10-01T10:00:00.000Z");
    expect(body.event_properties.origem).toBe("popup");
  });
  it("sends the transactional welcome with the template of the language (plan B)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { messageId: "m" }));
    const params = welcomeParams({ locale: "pt", confirmedAt: "x" }, PROD);
    await sendWelcomeTransactional({ email: "guest@example.test", locale: "pt", params }, PROD, fetchMock);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${BREVO_API_BASE}/smtp/email`);
    const body = JSON.parse(String(init.body));
    expect(body.templateId).toBe(201);
    expect(body.to).toEqual([{ email: "guest@example.test" }]);
    expect(body.params.WA_LINK_NL).toContain("wa.me");
    const none = vi.fn();
    expect((await sendWelcomeTransactional({ email: "a@example.test", locale: "de", params }, PROD, none)).code).toBe("not_configured");
    expect(none).not.toHaveBeenCalled();
  });
});
