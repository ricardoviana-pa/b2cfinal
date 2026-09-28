/**
 * Newsletter links that arrive from an email. Static branded pages
 * (server/lib/brand-page.ts), uncached, noindex, no personal data.
 *
 * GET  /api/newsletter/confirm?lead=<id>&e=<exp>&t=<hmac>&lang=<xx>
 *   The link in the double opt-in email. Verifies the signature and the
 *   expiry (7 days) and shows a page whose form POSTs the same fields at once
 *   (button as the fallback without JavaScript). The GET changes nothing:
 *   mail scanners (Safe Links and the like) fetch links, and a subscription
 *   must come from the person.
 * POST /api/newsletter/confirm
 *   Promotes "nl-pending-<origin>" to "newsletter-<origin>" with confirmedAt
 *   and the signals of who confirmed (confirmationSignals: seconds since the
 *   form, user agent, "auto" or "click"), and shows "Subscrição confirmada"
 *   with the exit link. Idempotent. Scanners that run the page in a sandbox
 *   do post it: those confirmations get confirmSuspect and count only as a
 *   single opt-in downstream, until a later click that looks human.
 *
 * GET  /api/newsletter/unsubscribe?lead=<id>&t=<hmac>&lang=<xx>
 *   Shows one button. A GET never unsubscribes: mail scanners open links.
 * POST /api/newsletter/unsubscribe  (lead, t, lang in the form or the query:
 *   works as a one-click List-Unsubscribe-Post target too)
 *   Every consent lead of that address stops counting (db.unsubscribeNewsletterEmail).
 *   The exit token never expires: leaving must always work.
 */
import type { Express, Request, Response } from "express";
import * as dbModule from "../db";
import { brandPage } from "../lib/brand-page";
import { NEWSLETTER_LANGS, NL_SUBSCRIBED_KEY, newsletterLang } from "@shared/newsletter";
import { CONFIRM_EMAIL_COPY, NEWSLETTER_PAGE_COPY } from "../services/newsletter-copy";
import {
  brevoAddConfirmed,
  brevoRemove,
  confirmationSignals,
  normaliseEmail,
  originFromSource,
  safeErrorLabel,
  signToken,
  verifyToken,
  type FetchLike,
} from "../services/newsletter";

export interface NewsletterRouteDeps {
  getLeadById: typeof dbModule.getLeadById;
  confirmNewsletterLead: typeof dbModule.confirmNewsletterLead;
  unsubscribeNewsletterEmail: typeof dbModule.unsubscribeNewsletterEmail;
  env: NodeJS.ProcessEnv;
  fetchImpl: FetchLike;
  now: () => Date;
}

const defaultDeps = (): NewsletterRouteDeps => ({
  getLeadById: dbModule.getLeadById,
  confirmNewsletterLead: dbModule.confirmNewsletterLead,
  unsubscribeNewsletterEmail: dbModule.unsubscribeNewsletterEmail,
  env: process.env,
  fetchImpl: (input, init) => globalThis.fetch(input, init),
  now: () => new Date(),
});

function pick(req: Request, key: string): string {
  const fromBody = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>)[key] : undefined;
  const value = fromBody ?? req.query[key];
  return typeof value === "string" ? value : "";
}

function langFromRequest(req: Request): string {
  const q = pick(req, "lang").toLowerCase();
  if ((NEWSLETTER_LANGS as readonly string[]).includes(q)) return q;
  return newsletterLang(String(req.headers["accept-language"] ?? "").slice(0, 2));
}

function noStore(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
}

/** Relative exit link shown on the confirmation page (same host, never an email in the URL). */
export function exitPath(leadId: number, lang: string, env: NodeJS.ProcessEnv = process.env): string {
  return `/api/newsletter/unsubscribe?lead=${leadId}&t=${signToken("exit", leadId, 0, env)}&lang=${newsletterLang(lang)}`;
}

export function registerNewsletterRoutes(app: Express, overrides: Partial<NewsletterRouteDeps> = {}): void {
  const deps = { ...defaultDeps(), ...overrides };

  /** Signature and expiry of a confirmation link; answers the invalid or expired page itself. */
  const checkConfirmLink = (req: Request, res: Response, lang: string): { leadId: number; exp: number } | null => {
    const leadId = Number(pick(req, "lead"));
    const exp = Number(pick(req, "e"));
    const check = verifyToken("confirm", leadId, exp, pick(req, "t"), deps.env, deps.now().getTime());
    const c = NEWSLETTER_PAGE_COPY[newsletterLang(lang)];
    if (check === "invalid") {
      res.status(400).type("html").send(brandPage(lang, c.invalidTitle, c.invalidBody));
      return null;
    }
    if (check === "expired") {
      res.status(410).type("html").send(brandPage(lang, c.expiredTitle, c.expiredBody, { cta: { href: `/${lang}/homes`, label: c.ctaHomes } }));
      return null;
    }
    return { leadId, exp };
  };

  app.get("/api/newsletter/confirm", (req: Request, res: Response) => {
    noStore(res);
    if (req.method === "HEAD") return res.status(200).end();
    const lang = newsletterLang(langFromRequest(req));
    const link = checkConfirmLink(req, res, lang);
    if (!link) return;
    const E = CONFIRM_EMAIL_COPY[lang];
    return res.type("html").send(
      brandPage(lang, E.heading, E.intro, {
        form: {
          action: "/api/newsletter/confirm",
          // "via" says whether the page posted by itself (the script sets "auto") or by the button.
          fields: { lead: String(link.leadId), e: String(link.exp), t: pick(req, "t"), lang, via: "click" },
          button: E.button,
          autoSubmit: true,
        },
      }),
    );
  });

  app.post("/api/newsletter/confirm", async (req: Request, res: Response) => {
    noStore(res);
    let lang = langFromRequest(req);
    const link = checkConfirmLink(req, res, lang);
    if (!link) return;
    const { leadId } = link;
    const copy = () => NEWSLETTER_PAGE_COPY[newsletterLang(lang)];
    const invalid = () => res.status(400).type("html").send(brandPage(lang, copy().invalidTitle, copy().invalidBody));
    const failed = () => res.status(500).type("html").send(brandPage(lang, copy().errorTitle, copy().errorBody));

    let lead: Awaited<ReturnType<typeof dbModule.getLeadById>>;
    try {
      lead = await deps.getLeadById(leadId);
    } catch (err: unknown) {
      console.error("[Newsletter] confirm: lead lookup failed:", safeErrorLabel(err));
      return failed();
    }
    const origin = originFromSource(lead?.source);
    // Unknown lead, not from this flow, or already unsubscribed: an old link does not subscribe again.
    if (!lead || !origin) return invalid();
    const meta: Record<string, string> = lead.metadata || {};
    lang = newsletterLang(meta.locale || lang);

    const now = deps.now();
    const confirmedAt = now.toISOString();
    const signals = confirmationSignals({ consentAt: meta.consentAt, confirmedAt: now, userAgent: req.headers["user-agent"], via: pick(req, "via") });
    const suspect = signals.confirmSuspect === "1";
    let result: Awaited<ReturnType<typeof dbModule.confirmNewsletterLead>>;
    try {
      result = await deps.confirmNewsletterLead(leadId, origin, { confirmedAt, ...signals });
    } catch (err: unknown) {
      console.error(`[Newsletter] confirm: lead #${leadId} update failed:`, safeErrorLabel(err));
      return failed();
    }
    if (result === "gone") return invalid();

    if (result === "confirmed" || result === "upgraded") {
      // Never the user agent in the log: only whether the click looked automated.
      console.info(`[Newsletter] ${result} lead #${leadId} origin=${origin} lang=${lang} via=${signals.confirmVia}${suspect ? " suspect=1" : ""}`);
      // Optional: only with BREVO_API_KEY and BREVO_NEWSLETTER_LIST_ID, and only for a click that looks human.
      if (!suspect) {
        const brevo = await brevoAddConfirmed(normaliseEmail(lead.email), { ...meta, confirmedAt }, deps.env, deps.fetchImpl);
        if (brevo && !brevo.ok) console.warn(`[Newsletter] Brevo add failed for lead #${leadId}: status=${brevo.status} code=${brevo.code ?? ""}`);
      }
    } else {
      console.info(`[Newsletter] lead #${leadId} confirmed again (already confirmed)`);
    }

    const c = copy();
    return res.type("html").send(
      brandPage(lang, c.confirmedTitle, c.confirmedBody, {
        cta: { href: `/${lang}/homes`, label: c.ctaHomes },
        note: { text: c.exitPrompt, link: { href: exitPath(leadId, lang, deps.env), label: c.exitLink } },
        // This browser: no pop-up any more (the person may confirm on another device than the one they signed up on).
        localFlags: { [NL_SUBSCRIBED_KEY]: "1" },
      }),
    );
  });

  const exitCheck = (req: Request) => {
    const leadId = Number(pick(req, "lead"));
    return { leadId, ok: verifyToken("exit", leadId, 0, pick(req, "t"), deps.env) === "ok" };
  };

  app.get("/api/newsletter/unsubscribe", (req: Request, res: Response) => {
    noStore(res);
    const lang = langFromRequest(req);
    const c = NEWSLETTER_PAGE_COPY[newsletterLang(lang)];
    const { leadId, ok } = exitCheck(req);
    if (!ok) return res.status(400).type("html").send(brandPage(lang, c.invalidTitle, c.invalidBody));
    return res.type("html").send(
      brandPage(lang, c.unsubscribeTitle, c.unsubscribeBody, {
        form: {
          action: "/api/newsletter/unsubscribe",
          fields: { lead: String(leadId), t: pick(req, "t"), lang },
          button: c.unsubscribeButton,
        },
      }),
    );
  });

  app.post("/api/newsletter/unsubscribe", async (req: Request, res: Response) => {
    noStore(res);
    const lang = langFromRequest(req);
    const c = NEWSLETTER_PAGE_COPY[newsletterLang(lang)];
    const { leadId, ok } = exitCheck(req);
    if (!ok) return res.status(400).type("html").send(brandPage(lang, c.invalidTitle, c.invalidBody));
    try {
      const lead = await deps.getLeadById(leadId);
      if (!lead) return res.status(400).type("html").send(brandPage(lang, c.invalidTitle, c.invalidBody));
      const email = normaliseEmail(lead.email);
      const changed = await deps.unsubscribeNewsletterEmail(email, deps.now().toISOString());
      console.info(`[Newsletter] unsubscribed via lead #${leadId}: ${changed} lead(s) changed`);
      const brevo = await brevoRemove(email, deps.env, deps.fetchImpl);
      if (brevo && !brevo.ok) console.warn(`[Newsletter] Brevo removal failed for lead #${leadId}: status=${brevo.status} code=${brevo.code ?? ""}`);
    } catch (err: unknown) {
      console.error(`[Newsletter] unsubscribe failed for lead #${leadId}:`, safeErrorLabel(err));
      return res.status(500).type("html").send(brandPage(lang, c.errorTitle, c.errorBody));
    }
    // Someone who just left never gets the pop-up again in this browser either.
    return res.type("html").send(brandPage(lang, c.unsubscribedTitle, c.unsubscribedBody, { localFlags: { [NL_SUBSCRIBED_KEY]: "1" } }));
  });
}
