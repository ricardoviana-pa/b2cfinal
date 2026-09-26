import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  findPending: vi.fn(), createLead: vi.fn(), getLeadById: vi.fn(), updateLead: vi.fn(), properties: vi.fn(),
}));
vi.mock("../db", () => ({
  findPendingNewsletterLead: mock.findPending, createLead: mock.createLead,
  getLeadById: mock.getLeadById, updateLead: mock.updateLead,
}));
vi.mock("../services/properties-store", () => ({ getPropertiesForSite: mock.properties }));
import { newsletterRouter } from "./newsletter";

const EMAIL = "guest@example.test";
const ctx = (headers: Record<string, string> = {}) => ({ req: { headers }, res: {}, user: null }) as any;
const input = (over: Record<string, unknown> = {}) => ({
  email: ` ${EMAIL.toUpperCase()} `, locale: "pt", origin: "house" as const, page: "/homes/casa-x",
  propertySlug: "casa-x", consent: true as const, hp: "", ...over,
});
const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const logs: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("NEWSLETTER_TOKEN_SECRET", "test-secret-never-real");
  vi.stubEnv("BREVO_API_KEY", "xkeysib-test-not-real");
  vi.stubEnv("BREVO_NEWSLETTER_LIST_ID", "42");
  vi.stubEnv("BREVO_DOI_TEMPLATE_ID_PT", "101");
  vi.stubEnv("NEWSLETTER_LOCALES", "pt,es");
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(201)));
  vi.spyOn(console, "info").mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  vi.spyOn(console, "warn").mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  mock.findPending.mockResolvedValue(null);
  mock.createLead.mockResolvedValue({ id: 91 });
  mock.getLeadById.mockResolvedValue({ id: 91, metadata: {} });
  mock.updateLead.mockResolvedValue(undefined);
  mock.properties.mockResolvedValue([
    { slug: "casa-x", name: "Casa X by Portugal Active I Pool", guestyId: "abc123", isActive: true },
  ]);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("newsletter.config", () => {
  it("is public and tells the client what the server allows", async () => {
    const cfg = await newsletterRouter.createCaller(ctx()).config();
    expect(cfg).toEqual({ enabled: true, locales: ["pt", "es"], popup: { delayMs: 20_000, scrollPct: 50, cooldownDays: 30 } });
    vi.stubEnv("BREVO_API_KEY", "");
    expect((await newsletterRouter.createCaller(ctx()).config()).enabled).toBe(false);
  });
});

describe("newsletter.subscribe", () => {
  it("stores a pending lead with the consent proof and asks Brevo for the double opt-in", async () => {
    const result = await newsletterRouter.createCaller(ctx({ "cf-ipcountry": "es" })).subscribe(input());
    expect(result).toEqual({ ok: true });
    expect(mock.createLead).toHaveBeenCalledTimes(1);
    const lead = mock.createLead.mock.calls[0][0];
    expect(lead.email).toBe(EMAIL);
    expect(lead.source).toBe("nl-pending-house");
    expect(lead.metadata).toMatchObject({
      locale: "pt", origin: "house", page: "/homes/casa-x", propertySlug: "casa-x",
      propertyName: "Casa X", listingId: "abc123", country: "ES", consent: "true",
    });
    expect(lead.metadata.consentAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/contacts/doubleOptinConfirmation");
    const body = JSON.parse(String(init.body));
    expect(body.email).toBe(EMAIL);
    expect(body.includeListIds).toEqual([42]);
    expect(body.templateId).toBe(101);
    expect(body.redirectionUrl).toMatch(/^https:\/\/www\.portugalactive\.com\/api\/newsletter\/confirmed\?lead=91&t=[0-9a-f]{32}&lang=pt$/);
    expect(body.attributes).toMatchObject({ LINGUA: "pt", PAIS: "ES", ORIGEM_SITE: "house", CASA_INTERESSE: "Casa X", CASA_INTERESSE_ID: "abc123" });
    expect(logs.join("\n")).not.toContain("example.test");
  });
  it("reuses a pending lead from the last 24 h instead of creating another", async () => {
    mock.findPending.mockResolvedValue({ id: 33, metadata: { consentAt: "2026-10-01T09:00:00.000Z" }, createdAt: new Date() });
    await newsletterRouter.createCaller(ctx()).subscribe(input());
    expect(mock.findPending).toHaveBeenCalledWith(EMAIL, "house", 24 * 60 * 60 * 1000);
    expect(mock.createLead).not.toHaveBeenCalled();
    const body = JSON.parse(String((globalThis.fetch as any).mock.calls[0][1].body));
    expect(body.redirectionUrl).toContain("lead=33&");
    expect(body.attributes.INSCRITO_EM).toBe("2026-10-01T09:00:00.000Z");
  });
  it("ignores the honeypot silently and refuses platform relay addresses and missing consent", async () => {
    const caller = newsletterRouter.createCaller(ctx());
    expect(await caller.subscribe(input({ hp: "http://spam.example.test" }))).toEqual({ ok: true });
    expect(mock.createLead).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    await expect(caller.subscribe(input({ email: "abc@guest.airbnb.com" }))).rejects.toThrow("PROXY_EMAIL");
    await expect(caller.subscribe(input({ consent: false as any }))).rejects.toThrow();
    await expect(caller.subscribe(input({ email: "not-an-email" }))).rejects.toThrow();
    await expect(caller.subscribe(input({ origin: "checkout" as any }))).rejects.toThrow();
    expect(mock.createLead).not.toHaveBeenCalled();
  });
  it("answers 503 with a clear message while the Brevo keys are missing", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const err = await newsletterRouter.createCaller(ctx()).subscribe(input()).catch((e) => e);
    expect(err.code).toBe("SERVICE_UNAVAILABLE");
    expect(err.message).toContain("BREVO_API_KEY");
    expect(mock.createLead).not.toHaveBeenCalled();
  });
  it("never trusts a house name from the browser and copes without a house", async () => {
    mock.properties.mockResolvedValue([]);
    await newsletterRouter.createCaller(ctx()).subscribe(input({ propertySlug: "unknown", origin: "popup" }));
    expect(mock.createLead.mock.calls[0][0].metadata).toMatchObject({ propertySlug: "", propertyName: "", listingId: "", country: "" });
    expect(mock.createLead.mock.calls[0][0].source).toBe("nl-pending-popup");
  });
  it("gives the same answer to a contact Brevo has blocked, and a generic error when Brevo fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(400, { code: "invalid_parameter", message: "Contact is blacklisted" })));
    expect(await newsletterRouter.createCaller(ctx()).subscribe(input())).toEqual({ ok: true });
    expect(logs.join("\n")).toContain("blocked contact");

    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(500, { code: "server_error", message: "boom" })));
    const err = await newsletterRouter.createCaller(ctx()).subscribe(input()).catch((e) => e);
    expect(err.message).toBe("NEWSLETTER_DOI_FAILED");
    expect(mock.updateLead).toHaveBeenCalledWith(91, { metadata: { doiError: "1" } });
    expect(logs.join("\n")).not.toContain("example.test");
  });
  it("fails with a generic error when the database is not available (dev)", async () => {
    mock.createLead.mockRejectedValue(new Error("Database not available"));
    const err = await newsletterRouter.createCaller(ctx()).subscribe(input()).catch((e) => e);
    expect(err.message).toBe("NEWSLETTER_STORE_FAILED");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it("is blocked in previews like every other mutation", async () => {
    vi.stubEnv("APP_ENV", "preview");
    await expect(newsletterRouter.createCaller(ctx()).subscribe(input())).rejects.toThrow("Preview is read-only");
    expect(mock.createLead).not.toHaveBeenCalled();
  });
});
