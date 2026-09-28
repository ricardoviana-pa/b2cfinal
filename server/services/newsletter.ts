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
 *      expires after 7 days; the page posts the confirmation at once, so a
 *      mail scanner that only fetches the link confirms nothing) promotes the
 *      lead to "newsletter-<origin>" with confirmedAt.
 *      Only from here on does it count: the PA Mailing List collector reads
 *      the leads table every 6 hours and treats "newsletter*" as opt-in, and
 *      db.hasNewsletterConsent (LIKE 'newsletter%') gates the marketing
 *      contacts of the checkout recovery. Pending leads unlock nothing.
 *   3. Exit, always: the unsubscribe link (no expiry) turns every consent
 *      lead of the address into "nl-unsubscribed-<origin>" (and a checkout
 *      consent back into "checkout"). The collector reads it as an
 *      "unsubscribed" preference and drops the address from the marketing
 *      audience (pa-mailing-list PR #5, which must go live with this one).
 *      Brevo is optional: when BREVO_API_KEY
 *      and BREVO_NEWSLETTER_LIST_ID exist, confirmed contacts are added to
 *      the list and removed on exit; without them nothing is called.
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
 * nas duas primeiras peças de cada tipo). The footer form shows in every
 * language, as it did before this change.
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
 * Languages where the footer form shows. Every site language by default: the
 * footer took sign-ups in all of them before this change. The texts of the
 * eight languages other than PT wait for native review; to follow that rule
 * strictly before it, NEWSLETTER_FOOTER_LOCALES=pt (or pt,es,en).
 */
export function newsletterFooterLocales(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.NEWSLETTER_FOOTER_LOCALES;
  if (!raw || !raw.trim()) return [...NEWSLETTER_LANGS];
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

export function brevoListId(env: NodeJS.ProcessEnv = process.env): number | null {
  const n = Number(env.BREVO_NEWSLETTER_LIST_ID);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** TODO(humano): BREVO_API_KEY and BREVO_NEWSLETTER_LIST_ID in Render Production, when the site gets its own Brevo key. */
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
 * Confirmed subscriber → Brevo list (upsert, no second opt-in: the site
 * already did the double opt-in). Never called without the key and the list.
 */
export async function brevoAddConfirmed(
  email: string,
  meta: Record<string, string>,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BrevoResult | null> {
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
