/**
 * Newsletter capture (pop-up, house block, article block, footer): the server
 * rules in one place. No key the site does not already have is needed.
 *
 * Flow
 *   1. newsletter.subscribe stores a PENDING lead in the site's own `leads`
 *      table (source "nl-pending-<origin>") with the proof of consent (date,
 *      origin, page, the exact sentence shown and its version) and sends the
 *      double opt-in email with the transactional email the site already uses
 *      (Resend, the same sender as the booking emails).
 *   2. The click (link to GET /api/newsletter/confirm, HMAC token that
 *      expires after 7 days) opens a page with one button; only the POST of
 *      that button promotes the lead to "newsletter-<origin>" with
 *      confirmedAt. The page never posts by itself: a mail scanner that
 *      fetches the link, or runs its JavaScript in a sandbox, confirms
 *      nothing. The POST also keeps the signals of who confirmed (seconds
 *      since the form, user agent, whether it came from the button): a
 *      confirmation that looks automated gets confirmSuspect "1", never goes
 *      to Brevo and counts only as a single opt-in until the person clicks
 *      again (confirmationSignals).
 *      A pending lead nobody confirms is anonymised after 8 days
 *      ("nl-expired-<origin>", no address; expireNewsletterPending).
 *   3. Exit, always: the unsubscribe link (no expiry) turns every consent
 *      lead of the address into "nl-unsubscribed-<origin>" (and a checkout
 *      consent back into "checkout"). The collector reads it as an
 *      "unsubscribed" preference and drops the address from the marketing
 *      audience (pa-mailing-list PR #5, which must be live BEFORE this one:
 *      the collector of today knows neither "nl-unsubscribed-*" nor
 *      "nl-pending-*"; PR #5 reads the sources of today as before).
 *      Brevo is optional: when BREVO_API_KEY and BREVO_NEWSLETTER_LIST_ID
 *      exist, contacts confirmed by a click that looks human are added to the
 *      site's own Brevo list ("Newsletter do site", never the "Newsletter"
 *      nor the "Base de hóspedes" lists) and removed on exit; without them
 *      nothing is called.
 *
 * What counts as consent, and at which level. The PA Mailing List collector
 * reads the leads table every 6 hours. Only a lead of this flow confirmed by
 * the click (flow site-doi-v1, confirmedAt, no confirmSuspect) is a double
 * opt-in there (preference scope "newsletter-doi", level dupla_confirmacao in
 * pa-marketing). Every other "newsletter*" lead is a single opt-in
 * (opt_in_registado): the footer and home sign-ups from before this flow and
 * the checkout box ("newsletter-checkout", the box only). The checkout
 * recovery (db.hasNewsletterConsent, LIKE 'newsletter%') still treats all of
 * them as consent, as before this change: whether legacy and checkout
 * sign-ups need a confirmation too is Ricardo's decision (docs/newsletter.md).
 * Pending leads unlock nothing anywhere.
 *
 * Privacy: the email address never goes into a URL, a log line or an error
 * message. Only lead ids, origins and counts are logged.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { CHECKOUT_EMAIL_ORIGIN } from "../lib/checkout-email";
import { isPreviewDeployment } from "../lib/preview-isolation";
import {
  NEWSLETTER_LANGS,
  NEWSLETTER_ORIGINS,
  NL_DESKTOP_DELAY_MS,
  NL_MOBILE_DELAY_MS,
  NL_MOBILE_SCROLL_PCT,
  NL_POPUP_COOLDOWN_DAYS,
  isOneOf,
  newsletterLang,
  type NewsletterOrigin,
} from "@shared/newsletter";
import { CONFIRM_LINK_DAYS } from "./newsletter-copy";
import type { ServerVisitOrigin } from "./visit-origin";

export const PENDING_PREFIX = "nl-pending-";
export const CONFIRMED_PREFIX = "newsletter-";
export const UNSUBSCRIBED_PREFIX = "nl-unsubscribed-";
/** A pending lead nobody confirmed, anonymised (no address) after PENDING_RETENTION_DAYS. */
export const EXPIRED_PREFIX = "nl-expired-";
/** Marks the leads written by this flow (legacy "newsletter-footer" rows have no double opt-in). */
export const FLOW_VERSION = "site-doi-v1";

export const pendingSource = (origin: NewsletterOrigin): string => `${PENDING_PREFIX}${origin}`;
export const confirmedSource = (origin: NewsletterOrigin): string => `${CONFIRMED_PREFIX}${origin}`;
export const unsubscribedSource = (origin: string): string => `${UNSUBSCRIBED_PREFIX}${origin}`.slice(0, 100);

/** Origin of a lead source ("nl-pending-house" or "newsletter-house" → "house"). */
export function originFromSource(source: string | null | undefined): NewsletterOrigin | null {
  if (!source) return null;
  const rest = source.startsWith(PENDING_PREFIX)
    ? source.slice(PENDING_PREFIX.length)
    : source.startsWith(CONFIRMED_PREFIX)
      ? source.slice(CONFIRMED_PREFIX.length)
      : "";
  return isOneOf(NEWSLETTER_ORIGINS, rest) ? rest : null;
}

/**
 * Where a consent lead goes when the person leaves: the checkout consent back
 * to "checkout" (as when the box is unticked, consent "false"), every other
 * "newsletter*" or pending lead to "nl-unsubscribed-<origin>". The PA Mailing
 * List collector (pa-mailing-list PR #5) reads "nl-unsubscribed-*" as an
 * "unsubscribed" preference: the address leaves v_b2c_marketing_eligibility
 * and no later collection undoes it.
 */
export function unsubscribeTarget(source: string): { source: string; consent?: "false" } {
  if (source === "newsletter-checkout") return { source: "checkout", consent: "false" };
  const origin = source.replace(/^newsletter-?|^nl-pending-/, "") || "unknown";
  return { source: unsubscribedSource(origin) };
}

export function normaliseEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

/** Mailboxes of the booking platforms: relays, never a person's own address. */
export const PROXY_EMAIL_DOMAINS = ["guest.airbnb.com", "guest.booking.com", "m.expediapartnercentral.com"] as const;

export function isProxyEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  return PROXY_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/* ── Configuration (read at call time so the tests can stub the env) ─── */

/**
 * Languages where the pop-up and the inline blocks show. Portuguese until the
 * other languages have native review (regra do pa-marketing: revisão nativa
 * nas duas primeiras peças de cada tipo). The footer form follows the same
 * languages (newsletterFooterLocales): with the defaults, the other eight
 * languages have no sign-up at all, where the old single opt-in footer form
 * showed in all nine. For ES and EN that is a regression recorded in
 * docs/newsletter.md ("Decisões em aberto"), with an owner and a date.
 * TODO(humano): NEWSLETTER_LOCALES=pt,es,en in Render after the native review of ES and EN.
 */
export function newsletterLocales(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.NEWSLETTER_LOCALES ?? "pt";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2}$/.test(s));
}

/**
 * Languages where the footer form shows. The same as the pop-up and the
 * blocks (NEWSLETTER_LOCALES, PT by default) until the texts of each language
 * have native review: the form texts, the consent sentence, the confirmation
 * email and the pages of its links are new in every language (regra do
 * pa-marketing). NEWSLETTER_FOOTER_LOCALES=pt,es,en,... in Render opens the
 * footer in more languages before that review: Ricardo's explicit decision.
 * A language without the visit-origin line in its privacy policy
 * (privacy.s2OriginBody, PT only today) keeps no visit origin with the
 * sign-up (keepsVisitOrigin in shared/newsletter.ts).
 */
export function newsletterFooterLocales(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.NEWSLETTER_FOOTER_LOCALES;
  if (!raw || !raw.trim()) return newsletterLocales(env);
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2}$/.test(s));
}

/**
 * The forms may show and accept sign-ups: live site (not a preview), with the
 * database and the transactional email the site already has in production.
 * Without them every submission would fail, so the forms stay hidden.
 */
export function isNewsletterAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isPreviewDeployment(env)) return false;
  return !!env.DATABASE_URL && !!env.RESEND_API_KEY;
}

/**
 * Local visual check only: NEWSLETTER_UI_PREVIEW=true shows the forms and the
 * pop-up on a preview or on `npm run dev` (submissions still fail there: the
 * preview is read-only). Never used on the live site.
 */
export function isUiPreview(env: NodeJS.ProcessEnv = process.env): boolean {
  return isPreviewDeployment(env) && env.NEWSLETTER_UI_PREVIEW === "true";
}

/** The pop-up may show: the forms are available and the kill switch (NEWSLETTER_POPUP=false) is off. */
export function isPopupEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEWSLETTER_POPUP === "false") return false;
  return isNewsletterAvailable(env) || isUiPreview(env);
}

/**
 * House pages: the version that promises an alert ("Quer saber quando esta
 * casa tiver datas livres ou preço de época baixa? ... avisamos") only when
 * NEWSLETTER_HOUSE_ALERTS=true. It is a promise the operation must keep: the
 * CRM writes to those subscribers when the house has free dates or a
 * low-season price (leads with metadata.alertListingId, attribute house_alert
 * in the PA Mailing List). Off by default: the house page asks "Gostou desta
 * casa?" and still records the house as the interest.
 * TODO(humano): NEWSLETTER_HOUSE_ALERTS=true in Render once Ricardo approves the alert rule.
 */
export function isHouseAlertsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NEWSLETTER_HOUSE_ALERTS === "true";
}

export function popupTimings(env: NodeJS.ProcessEnv = process.env) {
  const num = (raw: string | undefined, fallback: number, min: number) => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
  };
  return {
    desktopDelayMs: num(env.NEWSLETTER_POPUP_DESKTOP_MS, NL_DESKTOP_DELAY_MS, 1000),
    mobileDelayMs: num(env.NEWSLETTER_POPUP_MOBILE_MS, NL_MOBILE_DELAY_MS, 1000),
    mobileScrollPct: num(env.NEWSLETTER_POPUP_SCROLL_PCT, NL_MOBILE_SCROLL_PCT, 5),
    cooldownDays: NL_POPUP_COOLDOWN_DAYS,
  };
}

/**
 * What newsletter.config answers. Depends only on the environment, so the
 * server render seeds it too (server/_core/vite.ts, entry-server.tsx): the
 * footer band and the blocks come in the HTML and nothing moves after
 * hydration.
 */
export function newsletterConfigPayload(env: NodeJS.ProcessEnv = process.env) {
  return {
    /** The forms may show (live site with database and transactional email; or a local UI preview). */
    available: isNewsletterAvailable(env) || isUiPreview(env),
    /** The pop-up may show (available and NEWSLETTER_POPUP is not "false"). */
    popup: isPopupEnabled(env),
    /** Languages of the pop-up and the inline blocks. */
    locales: newsletterLocales(env),
    /** Languages of the footer form (the same as the blocks unless NEWSLETTER_FOOTER_LOCALES says otherwise). */
    footerLocales: newsletterFooterLocales(env),
    /** House pages promise an alert ("avisamos") only when the CRM rule is approved (NEWSLETTER_HOUSE_ALERTS). */
    houseAlerts: isHouseAlertsEnabled(env),
    timings: popupTimings(env),
  };
}

/* ── Log hygiene ──────────────────────────────────────────────────────── */

/**
 * What an error may put in a log line: its class name and, when present, a
 * short driver code (ER_DUP_ENTRY, ECONNREFUSED). Never err.message: a
 * DrizzleQueryError message is "Failed query: ... params: <values>" and the
 * values carry the subscriber's address.
 */
export function safeErrorLabel(err: unknown): string {
  const name = err instanceof Error ? err.name : typeof err;
  const rawCode = (err as any)?.code ?? (err as any)?.cause?.code;
  const code = typeof rawCode === "string" && /^[A-Z0-9_]{2,40}$/.test(rawCode) ? rawCode : "";
  return code ? `${name} ${code}` : name;
}

/* ── Confirmation emails per address (nobody can flood a third party) ── */

/** At most one confirmation email per address per hour... */
export const DOI_MIN_INTERVAL_MS = 60 * 60 * 1000;
/** ...and three per 24 hours, whatever the origin. */
export const DOI_MAX_PER_DAY = 3;
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * May the site send another confirmation email to this address? `times` are
 * the moments the previous ones were sent (last 24 h). When the answer is no,
 * the endpoint still answers success and sends nothing: the state of an
 * address is never revealed.
 */
export function doiAllowed(times: number[], now: number = Date.now()): boolean {
  const recent = times.filter((t) => Number.isFinite(t) && now - t < DAY_MS && t <= now + 60_000);
  if (recent.length >= DOI_MAX_PER_DAY) return false;
  const last = recent.length ? Math.max(...recent) : -Infinity;
  return now - last >= DOI_MIN_INTERVAL_MS;
}

/* ── Who confirmed: a person, or a mail scanner that runs the page ────── */

/**
 * A confirmation this soon after the form is almost always a mail security
 * scanner opening the link at delivery (Defender Safe Links detonation,
 * Mimecast, Proofpoint open the link in a sandbox).
 */
export const CONFIRM_MIN_HUMAN_SECONDS = 10;
const AUTOMATED_AGENT =
  /bot[\/;-]|\bbot\b|crawl|spider|slurp|headless|phantom|puppeteer|playwright|selenium|python|curl|wget|java\/|go-http|okhttp|axios|node-fetch|undici|^node$|libwww|scanner|preview|barracuda|mimecast|proofpoint|urldefense|safelinks|symantec|forcepoint|trend ?micro|ironport|fortinet|sophos|zscaler/i;

/**
 * What the confirmation POST keeps about who confirmed: seconds since the
 * form (consentAt), the user agent (cut to 160 characters, never logged) and
 * how the POST came: "click" is the button of the page behind the email link
 * (the page never posts by itself: a person has to press it), "auto" an old
 * cached copy of that page that still posted by itself, "missing" a POST
 * without the field (not the page at all).
 *
 * confirmSuspect "1" when the POST did not come from the button, the agent
 * looks automated or empty, or the click came under CONFIRM_MIN_HUMAN_SECONDS
 * after the form: the lead is still confirmed (the person did fill the form),
 * but it never goes to Brevo and the collector counts it as a single opt-in,
 * never as a double one, until a later click that looks human clears the
 * mark (db.confirmNewsletterLead).
 */
export function confirmationSignals(input: {
  consentAt?: string;
  confirmedAt: Date;
  userAgent?: unknown;
  via?: unknown;
}): Record<string, string> {
  const agent = String(input.userAgent ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 160);
  const started = Date.parse(String(input.consentAt ?? ""));
  const delay = Number.isFinite(started) ? Math.max(0, Math.round((input.confirmedAt.getTime() - started) / 1000)) : null;
  const via = input.via === "click" ? "click" : input.via === "auto" ? "auto" : "missing";
  const suspect = via !== "click" || !agent || AUTOMATED_AGENT.test(agent) || (delay !== null && delay < CONFIRM_MIN_HUMAN_SECONDS);
  return {
    confirmVia: via,
    ...(delay !== null ? { confirmDelaySec: String(delay) } : {}),
    ...(agent ? { confirmUa: agent } : {}),
    ...(suspect ? { confirmSuspect: "1" } : {}),
  };
}

/* ── Pending sign-ups nobody confirmed ────────────────────────────────── */

/**
 * Days a pending lead keeps the address: the 7 days of the link plus one.
 * After that expireNewsletterPending anonymises it ("nl-expired-<origin>",
 * no address, only the counting fields), so an address someone typed and
 * never confirmed (maybe not their own) is not kept. The counts of the
 * funnel stay.
 */
export const PENDING_RETENTION_DAYS = CONFIRM_LINK_DAYS + 1;
/** Metadata an expired lead keeps: what the funnel counts, nothing that identifies a person. */
export const EXPIRED_KEEP = ["flow", "origin", "locale", "pageKind", "trigger", "device", "utmSource", "interest", "consentVersion", "consentAt"] as const;

export function expiredMetadata(meta: Record<string, string> | null | undefined, at: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of EXPIRED_KEEP) {
    const value = meta?.[key];
    if (typeof value === "string" && value) out[key] = value;
  }
  out.expiredAt = at;
  return out;
}

/* ── Sources the public leads.create may write ────────────────────────── */

/**
 * leads.create is public and takes any source. "newsletter*" is marketing
 * consent (collector and hasNewsletterConsent), "nl-pending-" and
 * "nl-unsubscribed-" belong to this flow: only newsletter.subscribe, the
 * confirmation click, the exit link and the checkout write them. Anything
 * else (an old cached footer bundle, a script) becomes "nl-legacy-*", which
 * grants nothing.
 */
export function publicLeadSource(source: string): string {
  const s = String(source || "").trim();
  const legacy = (rest: string) => `nl-legacy-${rest || "unknown"}`.slice(0, 100);
  if (/^newsletter/i.test(s)) return legacy(s.replace(/^newsletter-?/i, ""));
  if (/^nl-(pending|unsubscribed)/i.test(s)) return legacy(s.replace(/^nl-(pending|unsubscribed)-?/i, ""));
  return s;
}

/* ── Signed tokens (lead ids are guessable, the token is the capability) ─ */

export type TokenKind = "confirm" | "exit" | "interest";

function tokenSecret(env: NodeJS.ProcessEnv = process.env): string {
  // JWT_SECRET is required in production (server/_core/env.ts): no new key.
  return env.NEWSLETTER_TOKEN_SECRET || env.JWT_SECRET || "";
}

function sign(kind: TokenKind, leadId: number, exp: number, env: NodeJS.ProcessEnv): string {
  const secret = tokenSecret(env);
  if (!secret) throw new Error("Newsletter token secret missing (NEWSLETTER_TOKEN_SECRET or JWT_SECRET)");
  return createHmac("sha256", secret).update(`pa-newsletter:${kind}:${leadId}:${exp}`).digest("hex").slice(0, 32);
}

/** exp in Unix seconds; 0 means no expiry (the exit link must always work). */
export function signToken(kind: TokenKind, leadId: number, exp: number, env: NodeJS.ProcessEnv = process.env): string {
  return sign(kind, leadId, exp, env);
}

export type TokenCheck = "ok" | "expired" | "invalid";

/** Constant-time comparison; any unexpected shape is invalid. Expiry is checked after the signature. */
export function verifyToken(
  kind: TokenKind,
  leadId: number,
  exp: number,
  token: string,
  env: NodeJS.ProcessEnv = process.env,
  nowMs: number = Date.now(),
): TokenCheck {
  if (!Number.isInteger(leadId) || leadId <= 0) return "invalid";
  if (!Number.isInteger(exp) || exp < 0) return "invalid";
  if (typeof token !== "string" || !/^[0-9a-f]{32}$/i.test(token)) return "invalid";
  if (!tokenSecret(env)) return "invalid";
  let good = false;
  try {
    good = timingSafeEqual(Buffer.from(sign(kind, leadId, exp, env), "utf8"), Buffer.from(token.toLowerCase(), "utf8"));
  } catch {
    return "invalid";
  }
  if (!good) return "invalid";
  if (exp !== 0 && nowMs / 1000 > exp) return "expired";
  return "ok";
}

export function confirmExpiry(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000) + CONFIRM_LINK_DAYS * 86_400;
}

export function confirmUrl(leadId: number, locale: string, exp: number, env: NodeJS.ProcessEnv = process.env): string {
  const lang = newsletterLang(locale);
  return `${CHECKOUT_EMAIL_ORIGIN}/api/newsletter/confirm?lead=${leadId}&e=${exp}&t=${signToken("confirm", leadId, exp, env)}&lang=${lang}`;
}

/** Reference handed to the browser after subscribing: lets it answer the optional interest question for that lead only. */
export function interestRef(leadId: number, env: NodeJS.ProcessEnv = process.env, nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + DAY_MS / 1000;
  return `${leadId}.${exp}.${signToken("interest", leadId, exp, env)}`;
}

/** Same shape as a real reference, valid for nothing: the answer to a bot or a throttled address. */
export function decoyRef(nowMs: number = Date.now()): string {
  const exp = Math.floor(nowMs / 1000) + DAY_MS / 1000;
  return `${100000 + (randomBytes(3).readUIntBE(0, 3) % 900000)}.${exp}.${randomBytes(16).toString("hex")}`;
}

export function parseInterestRef(ref: string, env: NodeJS.ProcessEnv = process.env, nowMs: number = Date.now()): number | null {
  const match = /^(\d{1,12})\.(\d{1,12})\.([0-9a-f]{32})$/i.exec(String(ref || ""));
  if (!match) return null;
  const leadId = Number(match[1]);
  const exp = Number(match[2]);
  return verifyToken("interest", leadId, exp, match[3], env, nowMs) === "ok" ? leadId : null;
}

/* ── What the lead keeps ──────────────────────────────────────────────── */

const clip = (value: unknown, max: number): string => String(value ?? "").slice(0, max);

/**
 * The visit origin (UTM, click id TYPE, referrer domain, landing path),
 * already cleaned by parseVisitOriginPayload. Only with the "Aceitar tudo"
 * cookie choice; otherwise visitConsent "false" and nothing else. This is
 * what links a subscriber to the Google or Meta campaign that brought them.
 */
export function visitOriginMetadata(origin: ServerVisitOrigin | null): Record<string, string> {
  if (!origin) return {};
  if (!origin.consent) return { visitConsent: "false" };
  const out: Record<string, string> = { visitConsent: "true" };
  const last = origin.last ?? origin.first;
  const first = origin.first;
  const put = (key: string, value: unknown, max = 100) => {
    if (typeof value === "string" && value) out[key] = clip(value, max);
  };
  if (last) {
    put("utmSource", last.utm_source);
    put("utmMedium", last.utm_medium);
    put("utmCampaign", last.utm_campaign);
    put("utmContent", last.utm_content);
    put("utmTerm", last.utm_term);
    put("clickId", last.clickId);
    put("referrer", last.referrer);
    put("landing", last.landing, 150);
    put("visitAt", last.at, 25);
  }
  if (first && last && first.at !== last.at) {
    put("firstUtmSource", first.utm_source);
    put("firstUtmMedium", first.utm_medium);
    put("firstUtmCampaign", first.utm_campaign);
    put("firstClickId", first.clickId);
    put("firstReferrer", first.referrer);
    put("firstVisitAt", first.at, 25);
  }
  return out;
}

/* ── Brevo, optional (only when the key and the list exist) ──────────── */

export const BREVO_API_BASE = "https://api.brevo.com/v3";
export const BREVO_TIMEOUT_MS = 10_000;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Id of the site's OWN Brevo list, "Newsletter do site" (folder PA Marketing):
 * the same number the CRM session puts in growth.settings.site_newsletter_list_id,
 * which the welcome robot of pa-marketing reads. Never the id of the
 * "Newsletter" or the "Base de hóspedes" lists: the Base robot removes from
 * those whoever is not yet in the Mailing List catalogue (every subscriber
 * who just arrived), and the welcome robot refuses them.
 */
export function brevoListId(env: NodeJS.ProcessEnv = process.env): number | null {
  const n = Number(env.BREVO_NEWSLETTER_LIST_ID);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * TODO(humano): BREVO_API_KEY (the site's own key) and BREVO_NEWSLETTER_LIST_ID
 * (the id of the "Newsletter do site" list) in Render Production.
 */
export function isBrevoSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isPreviewDeployment(env)) return false;
  return !!env.BREVO_API_KEY && brevoListId(env) !== null;
}

/**
 * Contact attributes owned by this flow. CASA, SAUDACAO and WA_LINK belong to
 * the campaigns and are never written here (decisão de 23 de setembro de 2026).
 */
export function brevoAttributes(meta: Record<string, string>): Record<string, string> {
  return {
    LINGUA: newsletterLang(meta.locale),
    PAIS: clip(meta.country, 2).toUpperCase(),
    ORIGEM_SITE: clip(meta.origin, 20),
    PAGINA_SITE: clip(meta.page, 200),
    CASA_INTERESSE: clip(meta.propertyName, 120),
    CASA_INTERESSE_ID: clip(meta.listingId, 40),
    INTERESSE: clip(meta.interest, 20),
    INSCRITO_EM: clip(meta.consentAt, 30),
    CONFIRMADO_EM: clip(meta.confirmedAt, 30),
  };
}

export interface BrevoResult {
  ok: boolean;
  status: number;
  code?: string;
}

async function brevoCall(method: "POST" | "PUT", path: string, body: unknown, env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<BrevoResult> {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, status: 0, code: "no_api_key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${BREVO_API_BASE}${path}`, {
      method,
      headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true, status: res.status };
    let code = "";
    try {
      code = String(((await res.json()) as { code?: string })?.code ?? "");
    } catch {
      /* no JSON body */
    }
    return { ok: false, status: res.status, code: code || undefined };
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, status: 0, code: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Confirmed subscriber → the site's own Brevo list (upsert, no second
 * opt-in: the site already did the double opt-in). Never called without the
 * key and the list.
 *
 * Never for a confirmation marked as automated (confirmSuspect "1"), whoever
 * calls: the confirmation page and the interest answer both go through here,
 * and the welcome robot of pa-marketing reads that list as double opt-ins. A
 * lead that a scanner confirmed enters Brevo only after a click that looks
 * human clears the mark (db.confirmNewsletterLead, "upgraded").
 */
export async function brevoAddConfirmed(
  email: string,
  meta: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BrevoResult | null> {
  if (meta?.confirmSuspect === "1") return null;
  const listId = brevoListId(env);
  if (!isBrevoSyncEnabled(env) || listId === null) return null;
  return brevoCall("POST", "/contacts", { email, listIds: [listId], updateEnabled: true, attributes: brevoAttributes(meta) }, env, fetchImpl);
}

/** Exit → out of the Brevo list. Never called without the key and the list. */
export async function brevoRemove(
  email: string,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BrevoResult | null> {
  const listId = brevoListId(env);
  if (!isBrevoSyncEnabled(env) || listId === null) return null;
  return brevoCall("PUT", `/contacts/${encodeURIComponent(email)}?identifierType=email_id`, { unlinkListIds: [listId] }, env, fetchImpl);
}
