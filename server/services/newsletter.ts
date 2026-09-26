/**
 * Newsletter capture (pop-up, inline block, footer): the rules and the Brevo
 * calls, in one place.
 *
 * Flow: the site stores a PENDING lead (source "nl-pending-<origin>") with the
 * consent proof (date, page, origin) and asks Brevo for a double opt-in
 * (Brevo sends the confirmation email from reservas@news.portugalactive.com
 * and only lists the contact after the click). The click returns to
 * GET /api/newsletter/confirmed?lead=<id>&t=<hmac>, which promotes the lead
 * to "newsletter-<origin>" and fires the welcome (an event for the Brevo
 * automation, or a transactional template as plan B).
 *
 * Pending sources are deliberately NOT prefixed "newsletter": db.hasNewsletterConsent
 * does LIKE 'newsletter%' and gates the checkout recovery contacts 3 and 4,
 * which an unconfirmed subscription must never unlock.
 *
 * Privacy: the email address never goes into a URL, a log line or an error
 * message. Only lead ids and counts are logged.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { CHECKOUT_EMAIL_ORIGIN } from "../lib/checkout-email";
import { isPreviewDeployment } from "../lib/preview-isolation";
import { formatValidUntil, interestLine, newsletterLang, offerLine, whatsappMessage, type NewsletterLang } from "./newsletter-copy";

export const NEWSLETTER_ORIGINS = ["popup", "house", "article", "footer"] as const;
export type NewsletterOrigin = (typeof NEWSLETTER_ORIGINS)[number];

export const PENDING_PREFIX = "nl-pending-";
export const CONFIRMED_PREFIX = "newsletter-";

/** How long a pending lead is reused instead of creating a new one (24 h). */
export const PENDING_REUSE_MS = 24 * 60 * 60 * 1000;

/** Mailboxes of the booking platforms: relays, never a person's own address. */
export const PROXY_EMAIL_DOMAINS = ["guest.airbnb.com", "guest.booking.com", "m.expediapartnercentral.com"] as const;

export const BREVO_API_BASE = "https://api.brevo.com/v3";
export const BREVO_TIMEOUT_MS = 10_000;
export const WELCOME_EVENT_NAME = "newsletter_confirmada";
export const WHATSAPP_NUMBER = "351927161771";
export const FLOW_VERSION = "2026-10-v1";

export const pendingSource = (origin: NewsletterOrigin): string => `${PENDING_PREFIX}${origin}`;
export const confirmedSource = (origin: NewsletterOrigin): string => `${CONFIRMED_PREFIX}${origin}`;

export function isNewsletterOrigin(value: unknown): value is NewsletterOrigin {
  return typeof value === "string" && (NEWSLETTER_ORIGINS as readonly string[]).includes(value);
}

/** Origin of a lead source ("nl-pending-house" or "newsletter-house" → "house"). */
export function originFromSource(source: string | null | undefined): NewsletterOrigin | null {
  if (!source) return null;
  const rest = source.startsWith(PENDING_PREFIX)
    ? source.slice(PENDING_PREFIX.length)
    : source.startsWith(CONFIRMED_PREFIX)
      ? source.slice(CONFIRMED_PREFIX.length)
      : "";
  return isNewsletterOrigin(rest) ? rest : null;
}

export const isPendingSource = (source: string | null | undefined): boolean => !!source && source.startsWith(PENDING_PREFIX);
export const isConfirmedSource = (source: string | null | undefined): boolean => !!source && source.startsWith(CONFIRMED_PREFIX);

export function normaliseEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

export function isProxyEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1);
  return PROXY_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/* ── Configuration (read at call time so tests can stub the env) ───────── */

export function newsletterLocales(env: NodeJS.ProcessEnv = process.env): string[] {
  // Only Portuguese until the Spanish and English texts have native review
  // (regra global: revisão nativa nas duas primeiras peças de cada tipo).
  const raw = env.NEWSLETTER_LOCALES ?? "pt";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => /^[a-z]{2}$/.test(s));
}

export function popupDelayMs(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.NEWSLETTER_POPUP_DELAY_MS);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 20_000;
}

export function newsletterListId(env: NodeJS.ProcessEnv = process.env): number | null {
  const n = Number(env.BREVO_NEWSLETTER_LIST_ID);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function templateIdFromEnv(env: NodeJS.ProcessEnv, prefix: string, lang: NewsletterLang): number | null {
  const pick = (l: string) => {
    const n = Number(env[`${prefix}_${l.toUpperCase()}`]);
    return Number.isInteger(n) && n > 0 ? n : null;
  };
  return pick(lang) ?? pick("en");
}

/** Brevo double opt-in template for the language (falls back to EN). */
export function doiTemplateId(locale: string | undefined, env: NodeJS.ProcessEnv = process.env): number | null {
  return templateIdFromEnv(env, "BREVO_DOI_TEMPLATE_ID", newsletterLang(locale));
}

/** Brevo welcome template for the language (plan B, transactional mode). */
export function welcomeTemplateId(locale: string | undefined, env: NodeJS.ProcessEnv = process.env): number | null {
  return templateIdFromEnv(env, "BREVO_WELCOME_TEMPLATE_ID", newsletterLang(locale));
}

export type WelcomeMode = "event" | "transactional" | "off";

export function welcomeMode(env: NodeJS.ProcessEnv = process.env): WelcomeMode {
  const raw = (env.NEWSLETTER_WELCOME_MODE || "event").trim().toLowerCase();
  return raw === "transactional" ? "transactional" : raw === "off" ? "off" : "event";
}

/**
 * Everything the subscribe endpoint needs to talk to Brevo. Without it the
 * endpoint answers 503 and the pop-up stays hidden (config.enabled = false).
 * TODO(humano): BREVO_API_KEY (a second Brevo key, only for the site),
 * BREVO_NEWSLETTER_LIST_ID and BREVO_DOI_TEMPLATE_ID_PT in the Render
 * Production environment, never in dev or previews.
 */
export function isNewsletterConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return !!env.BREVO_API_KEY && newsletterListId(env) !== null && doiTemplateId("pt", env) !== null;
}

export function isNewsletterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NEWSLETTER_POPUP === "false") return false;
  if (isPreviewDeployment(env)) return false;
  return isNewsletterConfigured(env);
}

/* ── Confirmation token (HMAC of the lead id; ids are guessable) ───────── */

function tokenSecret(env: NodeJS.ProcessEnv = process.env): string {
  return env.NEWSLETTER_TOKEN_SECRET || env.RECOVERY_OPTOUT_SECRET || env.JWT_SECRET || "";
}

export function confirmToken(leadId: number, env: NodeJS.ProcessEnv = process.env): string {
  const secret = tokenSecret(env);
  if (!secret) throw new Error("Newsletter token secret missing (NEWSLETTER_TOKEN_SECRET, RECOVERY_OPTOUT_SECRET or JWT_SECRET)");
  return createHmac("sha256", secret).update(`nl:${leadId}`).digest("hex").slice(0, 32);
}

/** Comparação em tempo constante; qualquer formato inesperado falha. */
export function verifyConfirmToken(leadId: number, token: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!Number.isInteger(leadId) || leadId <= 0 || !token || token.length !== 32) return false;
  if (!tokenSecret(env)) return false;
  try {
    return timingSafeEqual(Buffer.from(confirmToken(leadId, env), "utf8"), Buffer.from(token.toLowerCase(), "utf8"));
  } catch {
    return false;
  }
}

export function confirmUrl(leadId: number, locale: string, env: NodeJS.ProcessEnv = process.env): string {
  const lang = newsletterLang(locale);
  return `${CHECKOUT_EMAIL_ORIGIN}/api/newsletter/confirmed?lead=${leadId}&t=${confirmToken(leadId, env)}&lang=${lang}`;
}

export function confirmedPagePath(locale: string): string {
  return `/${newsletterLang(locale)}/newsletter/confirmada`;
}

/* ── Attributes and welcome params ─────────────────────────────────────── */

export interface SubscriptionFacts {
  locale: string;
  country: string;
  origin: NewsletterOrigin;
  page: string;
  propertyName?: string;
  listingId?: string;
  subscribedAt: string;
}

/**
 * Contact attributes owned by this flow. CASA, SAUDACAO and WA_LINK belong to
 * the campaigns and are never written here (decisão de 23 de setembro de 2026);
 * LINGUA and PAIS are facts about the person and may be written.
 */
export function brevoAttributes(facts: SubscriptionFacts): Record<string, string> {
  return {
    LINGUA: newsletterLang(facts.locale),
    PAIS: (facts.country || "").toUpperCase().slice(0, 2),
    ORIGEM_SITE: facts.origin,
    PAGINA_SITE: facts.page.slice(0, 200),
    CASA_INTERESSE: facts.propertyName || "",
    CASA_INTERESSE_ID: facts.listingId || "",
    INSCRITO_EM: facts.subscribedAt,
  };
}

export interface WelcomeParams {
  CONFIRMADO_EM: string;
  LINHA_INTERESSE: string;
  LINHA_OFERTA: string;
  CODIGO_PROMO: string;
  CODIGO_VALIDADE_TXT: string;
  WA_LINK_NL: string;
}

export function welcomeParams(
  input: { locale: string; propertyName?: string; confirmedAt: string },
  env: NodeJS.ProcessEnv = process.env,
): WelcomeParams {
  const lang = newsletterLang(input.locale);
  const code = (env.NEWSLETTER_WELCOME_CODE || "").trim().toUpperCase();
  const pct = (env.NEWSLETTER_WELCOME_PCT || "").trim();
  const validUntil = formatValidUntil(lang, (env.NEWSLETTER_WELCOME_CODE_UNTIL || "").trim());
  return {
    CONFIRMADO_EM: input.confirmedAt,
    LINHA_INTERESSE: interestLine(lang, input.propertyName),
    LINHA_OFERTA: offerLine(lang, code, validUntil, pct),
    CODIGO_PROMO: code,
    CODIGO_VALIDADE_TXT: validUntil,
    WA_LINK_NL: `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage(lang))}`,
  };
}

/* ── Brevo HTTP (fetch injected for the tests; never logs the address) ─── */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface BrevoResult {
  ok: boolean;
  status: number;
  /** The contact had unsubscribed before: Brevo will not email them again. */
  blocked?: boolean;
  /** Brevo's error code when known (never contains the address). */
  code?: string;
}

async function brevoPost(path: string, body: unknown, env: NodeJS.ProcessEnv, fetchImpl: FetchLike): Promise<BrevoResult> {
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, status: 0, code: "no_api_key" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BREVO_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${BREVO_API_BASE}${path}`, {
      method: "POST",
      headers: { "api-key": apiKey, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true, status: res.status };
    let code = "";
    let message = "";
    try {
      const json = (await res.json()) as { code?: string; message?: string };
      code = String(json?.code ?? "");
      message = String(json?.message ?? "");
    } catch {
      /* no JSON body */
    }
    // A contact who unsubscribed earlier is blacklisted for marketing; Brevo
    // refuses the DOI. Reported as "blocked" so the caller can answer the same
    // success (never reveal the state) and count it. The exact code is
    // confirmed at the first real call, like every Brevo path in this repo.
    const blocked = /blacklist|unsubscribed/i.test(`${code} ${message}`);
    return { ok: false, status: res.status, blocked, code: code || undefined };
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { ok: false, status: 0, code: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST /v3/contacts/doubleOptinConfirmation: Brevo emails the DOI template and
 * adds the contact to the list only after the click on {{ params.DOIurl }},
 * which points at redirectionUrl.
 */
export function createDoiContact(
  input: { email: string; locale: string; redirectionUrl: string; attributes: Record<string, string> },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BrevoResult> {
  const listId = newsletterListId(env);
  const templateId = doiTemplateId(input.locale, env);
  if (!listId || !templateId) return Promise.resolve({ ok: false, status: 0, code: "not_configured" });
  return brevoPost(
    "/contacts/doubleOptinConfirmation",
    {
      email: input.email,
      includeListIds: [listId],
      templateId,
      redirectionUrl: input.redirectionUrl,
      attributes: input.attributes,
    },
    env,
    fetchImpl,
  );
}

/** POST /v3/events: the Brevo automation "newsletter_confirmada + LINGUA" sends the welcome. */
export function fireConfirmedEvent(
  input: { email: string; origin: NewsletterOrigin; params: WelcomeParams },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BrevoResult> {
  return brevoPost(
    "/events",
    {
      event_name: WELCOME_EVENT_NAME,
      identifiers: { email_id: input.email },
      contact_properties: input.params,
      event_properties: { origem: input.origin, flow_version: FLOW_VERSION },
    },
    env,
    fetchImpl,
  );
}

/** POST /v3/smtp/email with the welcome template (plan B when the plan has no automations). */
export function sendWelcomeTransactional(
  input: { email: string; locale: string; params: WelcomeParams },
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl: FetchLike = globalThis.fetch,
): Promise<BrevoResult> {
  const templateId = welcomeTemplateId(input.locale, env);
  if (!templateId) return Promise.resolve({ ok: false, status: 0, code: "not_configured" });
  return brevoPost("/smtp/email", { templateId, to: [{ email: input.email }], params: input.params }, env, fetchImpl);
}
