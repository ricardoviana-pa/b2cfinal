/**
 * Newsletter double opt-in, the click that comes back from the Brevo email.
 *
 * GET /api/newsletter/confirmed?lead=<id>&t=<hmac>&lang=<pt>
 *   Verifies the HMAC (lead ids are guessable, the token is the capability),
 *   promotes the pending lead to "newsletter-<origin>", fires the welcome
 *   exactly once (claim on metadata.welcomeAt) and redirects to the static
 *   confirmation page. Idempotent: a second click redirects again and sends
 *   nothing. Never reveals anything about the lead. Uncached.
 *
 * GET /:lang/newsletter/confirmada
 *   Branded static page (server/lib/brand-page.ts), noindex, no personal
 *   data, served by Express before the SPA fallback.
 */
import type { Express, Request, Response } from "express";
import * as dbModule from "../db";
import { brandPage } from "../lib/brand-page";
import { CONFIRM_PAGE_COPY, newsletterLang } from "../services/newsletter-copy";
import {
  confirmedPagePath,
  fireConfirmedEvent,
  originFromSource,
  sendWelcomeTransactional,
  verifyConfirmToken,
  welcomeMode,
  welcomeParams,
  type FetchLike,
} from "../services/newsletter";

const SITE_LANGS = ["en", "pt", "fr", "es", "it", "fi", "de", "nl", "sv"] as const;

export interface NewsletterRouteDeps {
  getLeadById: typeof dbModule.getLeadById;
  confirmNewsletterLead: typeof dbModule.confirmNewsletterLead;
  claimNewsletterWelcome: typeof dbModule.claimNewsletterWelcome;
  env: NodeJS.ProcessEnv;
  fetchImpl: FetchLike;
}

const defaultDeps = (): NewsletterRouteDeps => ({
  getLeadById: dbModule.getLeadById,
  confirmNewsletterLead: dbModule.confirmNewsletterLead,
  claimNewsletterWelcome: dbModule.claimNewsletterWelcome,
  env: process.env,
  fetchImpl: globalThis.fetch,
});

function langFromRequest(req: Request): string {
  const q = String(req.query.lang ?? "").toLowerCase();
  if ((SITE_LANGS as readonly string[]).includes(q)) return q;
  const accept = String(req.headers["accept-language"] ?? "").toLowerCase().slice(0, 2);
  return (SITE_LANGS as readonly string[]).includes(accept) ? accept : "en";
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}

export function confirmedPageHtml(lang: string, env: NodeJS.ProcessEnv = process.env): string {
  const copy = CONFIRM_PAGE_COPY[newsletterLang(lang)];
  const withCode = !!(env.NEWSLETTER_WELCOME_CODE || "").trim() && !!(env.NEWSLETTER_WELCOME_CODE_UNTIL || "").trim();
  // Internal link, no UTMs: a UTM on a same-site link would overwrite the
  // visitor's real acquisition source in GA4 and "site" is not in the
  // taxonomy (CLAUDE.md). The welcome email carries the campaign UTMs.
  return brandPage(lang, copy.confirmedTitle, withCode ? copy.confirmedBodyWithCode : copy.confirmedBody, {
    href: `/${lang}/homes`,
    label: copy.ctaHomes,
  });
}

export function registerNewsletterRoutes(app: Express, overrides: Partial<NewsletterRouteDeps> = {}): void {
  const deps = { ...defaultDeps(), ...overrides };

  app.get("/api/newsletter/confirmed", async (req: Request, res: Response) => {
    noStore(res);
    const lang = langFromRequest(req);
    const copy = CONFIRM_PAGE_COPY[newsletterLang(lang)];
    const leadId = Number(req.query.lead);
    const token = String(req.query.t ?? "");

    const invalid = () => res.status(400).type("html").send(brandPage(lang, copy.invalidTitle, copy.invalidBody));

    if (!verifyConfirmToken(leadId, token, deps.env)) return invalid();

    let lead: Awaited<ReturnType<typeof dbModule.getLeadById>>;
    try {
      lead = await deps.getLeadById(leadId);
    } catch (err: any) {
      console.error("[Newsletter] confirm: lead lookup failed:", err?.message ?? err);
      return res.status(500).type("html").send(brandPage(lang, copy.errorTitle, copy.errorBody));
    }
    const origin = originFromSource(lead?.source);
    if (!lead || !origin) return invalid();

    const meta: Record<string, string> = lead.metadata || {};
    const locale = newsletterLang(meta.locale || lang);
    const confirmedAt = new Date().toISOString();

    let confirmed = false;
    try {
      confirmed = await deps.confirmNewsletterLead(leadId, origin, confirmedAt);
    } catch (err: any) {
      console.error(`[Newsletter] confirm: lead #${leadId} update failed:`, err?.message ?? err);
    }
    if (!confirmed) return res.status(500).type("html").send(brandPage(lang, copy.errorTitle, copy.errorBody));

    // Welcome, once: the claim wins the race between two clicks.
    const mode = welcomeMode(deps.env);
    if (mode !== "off") {
      let claimed = false;
      try {
        claimed = await deps.claimNewsletterWelcome(leadId, confirmedAt);
      } catch (err: any) {
        console.error(`[Newsletter] welcome claim failed for lead #${leadId}:`, err?.message ?? err);
      }
      if (claimed) {
        const params = welcomeParams({ locale, propertyName: meta.propertyName, confirmedAt }, deps.env);
        const result =
          mode === "event"
            ? await fireConfirmedEvent({ email: lead.email, origin, params }, deps.env, deps.fetchImpl)
            : await sendWelcomeTransactional({ email: lead.email, locale, params }, deps.env, deps.fetchImpl);
        console.info(`[Newsletter] confirmed lead #${leadId} origin=${origin} lang=${locale} welcome=${mode} status=${result.status}${result.ok ? "" : ` code=${result.code ?? ""}`}`);
      } else {
        console.info(`[Newsletter] confirmed lead #${leadId} again (welcome already sent)`);
      }
    } else {
      console.info(`[Newsletter] confirmed lead #${leadId} origin=${origin} lang=${locale} welcome=off`);
    }

    return res.redirect(302, confirmedPagePath(locale));
  });

  app.get("/:lang([a-z]{2})/newsletter/confirmada", (req: Request, res: Response) => {
    const lang = String(req.params.lang).toLowerCase();
    if (!(SITE_LANGS as readonly string[]).includes(lang)) return res.status(404).end();
    noStore(res);
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    return res.type("html").send(confirmedPageHtml(lang, deps.env));
  });
}
