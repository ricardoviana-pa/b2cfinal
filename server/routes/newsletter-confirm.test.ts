import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerNewsletterRoutes } from "./newsletter-confirm";
import { confirmToken } from "../services/newsletter";

const EMAIL = "guest@example.test";
const env = {
  NODE_ENV: "production",
  RENDER_GIT_BRANCH: "main",
  SITE_URL: "https://www.portugalactive.com",
  NEWSLETTER_TOKEN_SECRET: "test-secret-never-real",
  BREVO_API_KEY: "xkeysib-test-not-real",
  BREVO_NEWSLETTER_LIST_ID: "42",
  BREVO_DOI_TEMPLATE_ID_PT: "101",
  BREVO_WELCOME_TEMPLATE_ID_PT: "201",
  NEWSLETTER_WELCOME_MODE: "event",
} as NodeJS.ProcessEnv;

const deps = {
  getLeadById: vi.fn(),
  confirmNewsletterLead: vi.fn(),
  claimNewsletterWelcome: vi.fn(),
  fetchImpl: vi.fn(),
};
const pendingLead = (over: Record<string, unknown> = {}) => ({
  id: 77, email: EMAIL, source: "nl-pending-house", status: "new",
  metadata: { locale: "pt", origin: "house", propertyName: "Casa X", consent: "true", consentAt: "2026-10-01T10:00:00.000Z" },
  createdAt: new Date("2026-10-01T10:00:00.000Z"),
  ...over,
});

let server: Server;
let origin: string;
const logs: string[] = [];
beforeAll(async () => {
  const app = express();
  registerNewsletterRoutes(app, { ...deps, env, fetchImpl: (...args) => deps.fetchImpl(...args) });
  app.use((_req, res) => { res.status(404).end(); });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  logs.length = 0;
  vi.spyOn(console, "info").mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  vi.spyOn(console, "warn").mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  vi.spyOn(console, "error").mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  deps.getLeadById.mockResolvedValue(pendingLead());
  deps.confirmNewsletterLead.mockResolvedValue(true);
  deps.claimNewsletterWelcome.mockResolvedValue(true);
  deps.fetchImpl.mockResolvedValue(new Response(null, { status: 204 }));
});
afterEach(() => { vi.restoreAllMocks(); });

const get = (url: string, headers: Record<string, string> = {}) => fetch(`${origin}${url}`, { redirect: "manual", headers });
const validUrl = (id = 77, lang = "pt") => `/api/newsletter/confirmed?lead=${id}&t=${confirmToken(id, env)}&lang=${lang}`;

describe("GET /api/newsletter/confirmed", () => {
  it("rejects a bad token with the invalid-link page and touches nothing", async () => {
    const res = await get(`/api/newsletter/confirmed?lead=77&t=${"a".repeat(32)}&lang=pt`);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain("Link inválido");
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).not.toContain(EMAIL);
    expect(deps.getLeadById).not.toHaveBeenCalled();
    expect(deps.confirmNewsletterLead).not.toHaveBeenCalled();
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
  it("rejects a lead that is not a newsletter lead, in the browser's language", async () => {
    deps.getLeadById.mockResolvedValue(pendingLead({ source: "contact-form" }));
    const res = await get(validUrl(77, "xx"), { "accept-language": "en-GB,en;q=0.9" });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("Invalid link");
    expect(deps.confirmNewsletterLead).not.toHaveBeenCalled();
  });
  it("promotes the lead, fires the welcome event once and redirects uncached", async () => {
    const res = await get(validUrl());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/pt/newsletter/confirmada");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(deps.confirmNewsletterLead).toHaveBeenCalledWith(77, "house", expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
    expect(deps.claimNewsletterWelcome).toHaveBeenCalledTimes(1);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = deps.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/events");
    const body = JSON.parse(String(init.body));
    expect(body.event_name).toBe("newsletter_confirmada");
    expect(body.identifiers.email_id).toBe(EMAIL);
    expect(body.contact_properties.LINHA_INTERESSE).toContain("Casa X");
    expect(body.event_properties.origem).toBe("house");
    // The address never reaches the log.
    expect(logs.join("\n")).not.toContain(EMAIL);
    expect(logs.join("\n")).toContain("lead #77");
  });
  it("is idempotent: a second click redirects again and sends nothing", async () => {
    deps.getLeadById.mockResolvedValue(pendingLead({ source: "newsletter-house", metadata: { locale: "pt", welcomeAt: "2026-10-01T10:05:00.000Z" } }));
    deps.claimNewsletterWelcome.mockResolvedValue(false);
    const res = await get(validUrl());
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/pt/newsletter/confirmada");
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
  it("uses the transactional template in plan B, and nothing when the welcome is off", async () => {
    const app = express();
    const local = { ...deps, fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 201 })) };
    registerNewsletterRoutes(app, { ...local, env: { ...env, NEWSLETTER_WELCOME_MODE: "transactional" } });
    const s = createServer(app);
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const o = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    try {
      const res = await fetch(`${o}${validUrl()}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      const [url, init] = local.fetchImpl.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://api.brevo.com/v3/smtp/email");
      const body = JSON.parse(String(init.body));
      expect(body.templateId).toBe(201);
      expect(body.to).toEqual([{ email: EMAIL }]);
    } finally {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }

    const app2 = express();
    const off = { ...deps, fetchImpl: vi.fn() };
    registerNewsletterRoutes(app2, { ...off, env: { ...env, NEWSLETTER_WELCOME_MODE: "off" } });
    const s2 = createServer(app2);
    await new Promise<void>((resolve) => s2.listen(0, "127.0.0.1", resolve));
    const o2 = `http://127.0.0.1:${(s2.address() as { port: number }).port}`;
    try {
      const res = await fetch(`${o2}${validUrl()}`, { redirect: "manual" });
      expect(res.status).toBe(302);
      expect(off.fetchImpl).not.toHaveBeenCalled();
    } finally {
      await new Promise<void>((resolve) => s2.close(() => resolve()));
    }
  });
  it("answers with the error page when the lead cannot be promoted", async () => {
    deps.confirmNewsletterLead.mockResolvedValue(false);
    const res = await get(validUrl());
    expect(res.status).toBe(500);
    expect(await res.text()).toContain("Algo falhou");
    expect(deps.fetchImpl).not.toHaveBeenCalled();
  });
  it("falls back to the English page for a language without templates", async () => {
    deps.getLeadById.mockResolvedValue(pendingLead({ metadata: { locale: "de", origin: "house" } }));
    const res = await get(validUrl(77, "de"));
    expect(res.headers.get("location")).toBe("/en/newsletter/confirmada");
  });
});

describe("GET /:lang/newsletter/confirmada", () => {
  it("serves the branded static page, noindex, with a plain homes link", async () => {
    const res = await get("/pt/newsletter/confirmada");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    const html = await res.text();
    expect(html).toContain('<html lang="pt">');
    expect(html).toContain("Subscrição confirmada");
    expect(html).toContain('href="/pt/homes"');
    expect(html).not.toContain("utm_");
    expect(html).not.toContain("código de boas-vindas");
  });
  it("keeps the site language in the URL and the English copy for unreviewed languages", async () => {
    const html = await (await get("/fr/newsletter/confirmada")).text();
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain("Subscription confirmed");
    expect(html).toContain('href="/fr/homes"');
    expect((await get("/xx/newsletter/confirmada")).status).toBe(404);
  });
  it("mentions the welcome code only when the offer exists", async () => {
    const app = express();
    registerNewsletterRoutes(app, { ...deps, env: { ...env, NEWSLETTER_WELCOME_CODE: "BEMVINDO", NEWSLETTER_WELCOME_CODE_UNTIL: "2027-06-30" } });
    const s = createServer(app);
    await new Promise<void>((resolve) => s.listen(0, "127.0.0.1", resolve));
    const o = `http://127.0.0.1:${(s.address() as { port: number }).port}`;
    try {
      const html = await (await fetch(`${o}/pt/newsletter/confirmada`)).text();
      expect(html).toContain("código de boas-vindas");
    } finally {
      await new Promise<void>((resolve) => s.close(() => resolve()));
    }
  });
});
