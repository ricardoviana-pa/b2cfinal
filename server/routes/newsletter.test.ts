import express from "express";
import { createServer, type Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerNewsletterRoutes } from "./newsletter";
import { confirmExpiry, signToken } from "../services/newsletter";

const EMAIL = "guest@example.test";
const NOW = new Date("2026-10-05T10:00:00Z");
const env = {
  NODE_ENV: "production",
  RENDER_GIT_BRANCH: "main",
  SITE_URL: "https://www.portugalactive.com",
  NEWSLETTER_TOKEN_SECRET: "test-secret-never-real",
} as NodeJS.ProcessEnv;

const deps = {
  getLeadById: vi.fn(),
  confirmNewsletterLead: vi.fn(),
  unsubscribeNewsletterEmail: vi.fn(),
  fetchImpl: vi.fn(),
};
/** Mutated per test (the routes read deps.env at request time). */
const routeEnv: NodeJS.ProcessEnv = { ...env };
const pendingLead = (over: Record<string, unknown> = {}) => ({
  id: 77,
  email: EMAIL,
  source: "nl-pending-house",
  status: "new",
  metadata: { flow: "site-doi-v1", locale: "es", origin: "house", propertyName: "Casa X", consent: "true", consentAt: "2026-10-05T09:00:00.000Z" },
  createdAt: new Date("2026-10-05T09:00:00.000Z"),
  ...over,
});

let server: Server;
let origin: string;
const logs: string[] = [];
beforeAll(async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  registerNewsletterRoutes(app, {
    getLeadById: (...a) => deps.getLeadById(...a),
    confirmNewsletterLead: (...a) => deps.confirmNewsletterLead(...a),
    unsubscribeNewsletterEmail: (...a) => deps.unsubscribeNewsletterEmail(...a),
    fetchImpl: (...a) => deps.fetchImpl(...a),
    now: () => NOW,
    env: routeEnv,
  });
  app.use((_req, res) => { res.status(404).end(); });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  vi.clearAllMocks();
  delete routeEnv.BREVO_API_KEY;
  delete routeEnv.BREVO_NEWSLETTER_LIST_ID;
  logs.length = 0;
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...a) => { logs.push(a.map(String).join(" ")); });
  }
  deps.getLeadById.mockResolvedValue(pendingLead());
  deps.confirmNewsletterLead.mockResolvedValue("confirmed");
  deps.unsubscribeNewsletterEmail.mockResolvedValue(2);
  deps.fetchImpl.mockResolvedValue(new Response(null, { status: 204 }));
});
afterEach(() => { vi.restoreAllMocks(); });

const confirmLink = (leadId = 77, exp = confirmExpiry(NOW.getTime()), lang = "es") =>
  `/api/newsletter/confirm?lead=${leadId}&e=${exp}&t=${signToken("confirm", leadId, exp, env)}&lang=${lang}`;
const exitQuery = (leadId = 77) => `lead=${leadId}&t=${signToken("exit", leadId, 0, env)}&lang=pt`;
const get = (url: string, init: RequestInit = {}) => fetch(`${origin}${url}`, { redirect: "manual", ...init });
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
/** What the page behind the email link posts (its form carries the link's fields; the script sets via=auto). */
const confirm = (link: string, agent = BROWSER, via = "auto") =>
  get("/api/newsletter/confirm", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": agent },
    body: `${link.split("?")[1]}&via=${via}`,
  });

describe("GET /api/newsletter/confirm (the link in the email)", () => {
  it("changes nothing: it shows a page that posts the confirmation at once, with the button as fallback", async () => {
    const res = await get(confirmLink());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain('<form id="pa-form" method="post" action="/api/newsletter/confirm"');
    expect(html).toContain('<input type="hidden" name="lead" value="77">');
    expect(html).toMatch(/<input type="hidden" name="t" value="[0-9a-f]{32}">/);
    expect(html).toContain("Confirmar suscripción");
    expect(html).toContain('<input type="hidden" name="via" value="click">');
    expect(html).toContain('<script>var f=document.getElementById("pa-form");if(f.via)f.via.value="auto";f.submit();</script>');
    // A mail scanner fetching the link confirms nothing.
    expect(deps.getLeadById).not.toHaveBeenCalled();
    expect(deps.confirmNewsletterLead).not.toHaveBeenCalled();
    expect(html).not.toContain("example.test");
  });

  it("an expired or tampered link is refused already on the GET", async () => {
    const expired = await get(confirmLink(77, Math.floor(NOW.getTime() / 1000) - 60, "pt"));
    expect(expired.status).toBe(410);
    const tampered = await get(confirmLink().replace("lead=77", "lead=78"));
    expect(tampered.status).toBe(400);
    expect(deps.confirmNewsletterLead).not.toHaveBeenCalled();
  });
});

describe("POST /api/newsletter/confirm", () => {
  it("confirms the pending lead and shows the confirmation page in the subscriber's language, with the exit link", async () => {
    const res = await confirm(confirmLink());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await res.text();
    expect(html).toContain("Suscripción confirmada");
    expect(html).toContain('href="/es/homes"');
    expect(html).toMatch(/href="\/api\/newsletter\/unsubscribe\?lead=77&amp;t=[0-9a-f]{32}&amp;lang=es"/);
    expect(html).not.toContain("example.test");
    // That browser never gets the pop-up again (the flag the pop-up gate reads).
    expect(html).toContain('<script>try{localStorage.setItem("pa_nl_subscribed","1");}catch(e){}</script>');
    expect(deps.confirmNewsletterLead).toHaveBeenCalledWith(77, "house", {
      confirmedAt: NOW.toISOString(),
      confirmVia: "auto",
      confirmDelaySec: "3600",
      confirmUa: BROWSER,
    });
    // No Brevo key: no call.
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("confirmed lead #77 origin=house lang=es");
    expect(logs.join("\n")).not.toContain("example.test");
  });

  it("a scanner that runs the page is confirmed but marked: no Brevo, and the user agent never reaches the log", async () => {
    routeEnv.BREVO_API_KEY = "xkeysib-synthetic-not-real";
    routeEnv.BREVO_NEWSLETTER_LIST_ID = "12";
    const headless = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36";
    const res = await confirm(confirmLink(), headless);
    expect(res.status).toBe(200);
    expect(deps.confirmNewsletterLead).toHaveBeenCalledWith(77, "house", expect.objectContaining({ confirmSuspect: "1", confirmUa: headless }));
    expect(deps.fetchImpl).not.toHaveBeenCalled();
    expect(logs.join("\n")).toContain("confirmed lead #77 origin=house lang=es via=auto suspect=1");
    expect(logs.join("\n")).not.toContain("HeadlessChrome");
  });

  it("seconds after the sign-up is a scanner at delivery, whatever the agent says", async () => {
    deps.getLeadById.mockResolvedValue(pendingLead({ metadata: { flow: "site-doi-v1", locale: "es", origin: "house", consentAt: new Date(NOW.getTime() - 4000).toISOString() } }));
    await confirm(confirmLink());
    expect(deps.confirmNewsletterLead).toHaveBeenCalledWith(77, "house", expect.objectContaining({ confirmSuspect: "1", confirmDelaySec: "4" }));
  });

  it("a later human click upgrades a marked confirmation and only then goes to Brevo", async () => {
    routeEnv.BREVO_API_KEY = "xkeysib-synthetic-not-real";
    routeEnv.BREVO_NEWSLETTER_LIST_ID = "12";
    deps.getLeadById.mockResolvedValue(pendingLead({ source: "newsletter-house" }));
    deps.confirmNewsletterLead.mockResolvedValue("upgraded");
    const res = await confirm(confirmLink(), BROWSER, "click");
    expect(await res.text()).toContain("Suscripción confirmada");
    expect(deps.confirmNewsletterLead.mock.calls[0][2]).not.toHaveProperty("confirmSuspect");
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    expect(logs.join("\n")).toContain("upgraded lead #77 origin=house lang=es via=click");
  });

  it("a HEAD request (link checkers) confirms nothing", async () => {
    const res = await get(confirmLink(), { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(deps.getLeadById).not.toHaveBeenCalled();
    expect(deps.confirmNewsletterLead).not.toHaveBeenCalled();
  });

  it("a second click shows the same page and changes nothing", async () => {
    deps.getLeadById.mockResolvedValue(pendingLead({ source: "newsletter-house" }));
    deps.confirmNewsletterLead.mockResolvedValue("already");
    const res = await confirm(confirmLink());
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Suscripción confirmada");
  });

  it("after 7 days the link expires (410) and invites a new sign-up", async () => {
    const exp = Math.floor(NOW.getTime() / 1000) - 60;
    const res = await confirm(confirmLink(77, exp, "pt"));
    expect(res.status).toBe(410);
    expect(await res.text()).toContain("O link expirou");
    expect(deps.confirmNewsletterLead).not.toHaveBeenCalled();
  });

  it("a tampered token or lead id is refused and reveals nothing", async () => {
    const link = confirmLink().replace("lead=77", "lead=78");
    const res = await confirm(link);
    expect(res.status).toBe(400);
    expect(deps.getLeadById).not.toHaveBeenCalled();
  });

  it("an old link after leaving does not subscribe again", async () => {
    deps.getLeadById.mockResolvedValue(pendingLead({ source: "nl-unsubscribed-house" }));
    const res = await confirm(confirmLink());
    expect(res.status).toBe(400);
    expect(deps.confirmNewsletterLead).not.toHaveBeenCalled();
  });

  it("a database failure shows the error page and logs the class only", async () => {
    deps.confirmNewsletterLead.mockRejectedValue(Object.assign(new Error(`params: ${EMAIL}`), { code: "ECONNRESET" }));
    const res = await confirm(confirmLink());
    expect(res.status).toBe(500);
    expect(logs.join("\n")).toContain("ECONNRESET");
    expect(logs.join("\n")).not.toContain("example.test");
  });

  it("with the optional Brevo key, the confirmed contact goes to the list", async () => {
    Object.assign(routeEnv, { BREVO_API_KEY: "xkeysib-synthetic", BREVO_NEWSLETTER_LIST_ID: "42" });
    const res = await confirm(confirmLink());
    expect(res.status).toBe(200);
    expect(deps.fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = deps.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/contacts");
    expect(JSON.parse(String(init.body))).toMatchObject({ email: EMAIL, listIds: [42], attributes: { LINGUA: "es", CASA_INTERESSE: "Casa X" } });
  });
});

describe("exit, always possible", () => {
  it("GET shows one button and changes nothing (mail scanners open links)", async () => {
    const res = await get(`/api/newsletter/unsubscribe?${exitQuery()}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Cancelar a subscrição");
    expect(html).toContain('method="post" action="/api/newsletter/unsubscribe"');
    expect(deps.unsubscribeNewsletterEmail).not.toHaveBeenCalled();
  });

  it("POST withdraws every consent of the address and confirms on the page", async () => {
    const res = await get("/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: exitQuery(),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Subscrição cancelada");
    expect(html).not.toContain("example.test");
    expect(html).toContain('localStorage.setItem("pa_nl_subscribed","1")');
    expect(deps.unsubscribeNewsletterEmail).toHaveBeenCalledWith(EMAIL, NOW.toISOString());
    expect(logs.join("\n")).toContain("unsubscribed via lead #77: 2 lead(s) changed");
    expect(logs.join("\n")).not.toContain("example.test");
  });

  it("works as a one-click List-Unsubscribe-Post target (parameters in the query)", async () => {
    const res = await get(`/api/newsletter/unsubscribe?${exitQuery()}`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(deps.unsubscribeNewsletterEmail).toHaveBeenCalledTimes(1);
  });

  it("a forged exit link is refused", async () => {
    const res = await get("/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: exitQuery().replace("lead=77", "lead=76"),
    });
    expect(res.status).toBe(400);
    expect(deps.unsubscribeNewsletterEmail).not.toHaveBeenCalled();
  });

  it("with the optional Brevo key, the contact leaves the list too", async () => {
    Object.assign(routeEnv, { BREVO_API_KEY: "xkeysib-synthetic", BREVO_NEWSLETTER_LIST_ID: "42" });
    await get(`/api/newsletter/unsubscribe?${exitQuery()}`, { method: "POST" });
    const [url, init] = deps.fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/contacts/guest%40example.test");
    expect(JSON.parse(String(init.body))).toEqual({ unlinkListIds: [42] });
  });
});
