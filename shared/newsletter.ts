/**
 * Newsletter capture: the rules shared by the browser and the server.
 *
 * Everything here is pure (no DOM, no env), so the pop-up contract ("never
 * before the cookie choice, never to someone who subscribed or saw it in the
 * last 30 days, never on the checkout or the legal pages") and the consent
 * text are unit-tested on the server test runner.
 *
 * The consent sentence lives here, not in the i18n JSON, because the form
 * shows it and the server records it word for word with the subscription:
 * one source, so what the person read is what the database keeps.
 */

export const NEWSLETTER_LANGS = ["pt", "es", "en", "fr", "de", "it", "nl", "fi", "sv"] as const;
export type NewsletterLang = (typeof NEWSLETTER_LANGS)[number];

export function newsletterLang(locale: string | null | undefined): NewsletterLang {
  const two = String(locale || "").slice(0, 2).toLowerCase();
  return (NEWSLETTER_LANGS as readonly string[]).includes(two) ? (two as NewsletterLang) : "en";
}

/** Where the subscription was made. Lead source: "nl-pending-<origin>", then "newsletter-<origin>". */
export const NEWSLETTER_ORIGINS = ["popup", "house", "article", "footer"] as const;
export type NewsletterOrigin = (typeof NEWSLETTER_ORIGINS)[number];

/** What opened the pop-up (or "link" for ?nl=1 in the landing URL, e.g. an ad). */
export const NEWSLETTER_TRIGGERS = ["timer", "scroll", "exit", "link"] as const;
export type NewsletterTrigger = (typeof NEWSLETTER_TRIGGERS)[number];

/** The optional question after subscribing: what kind of stay. Ids, never free text. */
export const NEWSLETTER_INTERESTS = ["family", "couple", "friends", "celebration", "work", "long-stay"] as const;
export type NewsletterInterest = (typeof NEWSLETTER_INTERESTS)[number];

export const NEWSLETTER_DEVICES = ["desktop", "mobile"] as const;
export type NewsletterDevice = (typeof NEWSLETTER_DEVICES)[number];

export function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/* ── Consent text (recorded with every subscription) ─────────────────── */

/** Bump when the sentence changes: the lead keeps the version it was given. */
export const NEWSLETTER_CONSENT_VERSION = "2026-09-28";

export const NEWSLETTER_CONSENT_TEXT: Record<NewsletterLang, string> = {
  pt: "Ao subscrever, aceita receber emails da Portugal Active com novidades e promoções das nossas casas. Enviamos um email para confirmar e pode sair em qualquer altura.",
  es: "Al suscribirse, acepta recibir correos de Portugal Active con novedades y promociones de nuestras casas. Le enviamos un correo para confirmar y puede darse de baja en cualquier momento.",
  en: "By subscribing, you agree to receive emails from Portugal Active with news and offers from our homes. We will send you an email to confirm, and you can unsubscribe at any time.",
  fr: "En vous abonnant, vous acceptez de recevoir des e-mails de Portugal Active avec les nouveautés et les offres de nos maisons. Nous vous envoyons un e-mail de confirmation et vous pouvez vous désabonner à tout moment.",
  de: "Mit Ihrer Anmeldung stimmen Sie zu, E-Mails von Portugal Active mit Neuigkeiten und Angeboten unserer Häuser zu erhalten. Wir senden Ihnen eine E-Mail zur Bestätigung, und Sie können sich jederzeit abmelden.",
  it: "Iscrivendosi, accetta di ricevere email da Portugal Active con novità e offerte delle nostre case. Le inviamo un'email di conferma e può annullare l'iscrizione in qualsiasi momento.",
  nl: "Door u in te schrijven, gaat u akkoord met e-mails van Portugal Active met nieuws en aanbiedingen van onze huizen. We sturen u een e-mail ter bevestiging en u kunt zich op elk moment afmelden.",
  fi: "Tilaamalla hyväksyt, että Portugal Active lähettää sinulle sähköpostia talojemme uutisista ja tarjouksista. Lähetämme vahvistusviestin, ja voit perua tilauksen milloin tahansa.",
  sv: "Genom att prenumerera godkänner du att få e-post från Portugal Active med nyheter och erbjudanden från våra hus. Vi skickar ett mejl för bekräftelse, och du kan avsluta prenumerationen när som helst.",
};

export const NEWSLETTER_PRIVACY_LABEL: Record<NewsletterLang, string> = {
  pt: "Política de privacidade",
  es: "Política de privacidad",
  en: "Privacy policy",
  fr: "Politique de confidentialité",
  de: "Datenschutzerklärung",
  it: "Informativa sulla privacy",
  nl: "Privacybeleid",
  fi: "Tietosuojakäytäntö",
  sv: "Integritetspolicy",
};

/**
 * Languages whose privacy policy already says that the visit origin (UTM,
 * click id type, referrer) is kept with the subscription (privacy.s2OriginBody
 * in the i18n JSON; server/newsletter-rules.test.ts checks the two agree).
 * In the other languages the sign-up keeps no visit origin, even with the
 * "Aceitar tudo" choice, so opening a language (NEWSLETTER_LOCALES or
 * NEWSLETTER_FOOTER_LOCALES) never stores what its policy does not announce.
 */
export const NEWSLETTER_VISIT_ORIGIN_LANGS: readonly NewsletterLang[] = ["pt"];

export function keepsVisitOrigin(locale: string | null | undefined): boolean {
  return NEWSLETTER_VISIT_ORIGIN_LANGS.includes(newsletterLang(locale));
}

/** The exact sentence the form shows, plus where the privacy policy link pointed. */
export function consentRecord(locale: string | null | undefined): { lang: NewsletterLang; version: string; text: string } {
  const lang = newsletterLang(locale);
  return {
    lang,
    version: NEWSLETTER_CONSENT_VERSION,
    text: `${NEWSLETTER_CONSENT_TEXT[lang]} ${NEWSLETTER_PRIVACY_LABEL[lang]}: https://www.portugalactive.com/${lang}/legal/privacy`,
  };
}

/* ── Pop-up rules ─────────────────────────────────────────────────────── */

export const NL_SUBSCRIBED_KEY = "pa_nl_subscribed";
export const NL_POPUP_AT_KEY = "pa_nl_popup_at";
/**
 * localStorage: Date.now() of the last sign we already have this person's
 * email (a visit from one of our emails, a booking thank-you page, the
 * newsletter box of the checkout). Written only after the cookie banner has
 * an answer (client/src/components/marketing/newsletterBrowser.ts).
 */
export const NL_KNOWN_AT_KEY = "pa_nl_known_at";
export const NL_KNOWN_DAYS = 180;

export const NL_POPUP_COOLDOWN_DAYS = 30;
/** Computer: 8 seconds on the site, or the pointer leaving through the top (exit intent). */
export const NL_DESKTOP_DELAY_MS = 8_000;
/** Exit intent only counts after this long on the page (the first move to the tab bar is not an exit). */
export const NL_EXIT_MIN_DWELL_MS = 2_000;
/** Phone: 15 seconds on the site, or 40% of the page scrolled. */
export const NL_MOBILE_DELAY_MS = 15_000;
export const NL_MOBILE_SCROLL_PCT = 40;

/**
 * Route prefixes (without the language prefix) where the pop-up never shows:
 * paying or just paid, legal texts, private areas, and pages where the
 * visitor is already writing to us or is not a guest (owners, careers).
 */
export const NL_EXCLUDED_PATH_PREFIXES = [
  "/checkout",
  "/booking",
  "/legal",
  "/login",
  "/account",
  "/admin",
  "/404",
  "/newsletter",
  "/contact",
  "/owners",
  "/owners-portal",
  "/careers",
] as const;

export type PopupIneligibleReason =
  | "disabled"
  | "locale"
  | "path"
  | "subscribed"
  | "known"
  | "cooldown"
  | "utm"
  | "cookie_banner"
  | "hidden";

export interface PopupEligibilityInput {
  /** newsletter.config: popup switch on and the forms available. */
  enabled: boolean;
  /** Languages the pop-up may show in (newsletter.config.locales). */
  locales: readonly string[];
  lang: string;
  /** Route without the language prefix, e.g. "/homes/casa-x". */
  path: string;
  /** localStorage[NL_SUBSCRIBED_KEY] */
  subscribed: string | null;
  /** localStorage[NL_POPUP_AT_KEY]: Date.now() of the last display (closing counts, it was seen). */
  lastShownAt: string | null;
  /** "1" when this visit came from one of our emails (kept in memory: nothing is written before the cookie banner). */
  skipSession: string | null;
  /** localStorage[NL_KNOWN_AT_KEY]: we already have this person's email (email visit, booking, checkout box). */
  knownAt?: string | null;
  /** Cookie banner choice: null while the banner still waits for an answer. */
  cookieChoice: string | null;
  /** document.visibilityState === "visible" */
  visible: boolean;
  now: number;
  /** ?nl=1 in the landing URL (an ad or a link that promises the sign-up): the cooldown does not apply. */
  forced?: boolean;
  cooldownDays?: number;
}

export function isExcludedPath(path: string): boolean {
  const p = (path || "/").split(/[?#]/)[0];
  const normal = p.startsWith("/") ? p : `/${p}`;
  return NL_EXCLUDED_PATH_PREFIXES.some((prefix) => normal === prefix || normal.startsWith(`${prefix}/`));
}

/** Visits from our own emails (or the checkout recovery) never get the pop-up: they are on the list already. */
export function hasEmailOrRecoveryUtm(search: string): boolean {
  if (!search) return false;
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    const source = (params.get("utm_source") || "").toLowerCase();
    const medium = (params.get("utm_medium") || "").toLowerCase();
    return source === "email" || medium === "email" || medium === "recovery";
  } catch {
    return false;
  }
}

/** ?nl=1 (or nl=open) in the landing URL: the visitor came for the sign-up. */
export function hasPopupLinkParam(search: string): boolean {
  if (!search) return false;
  try {
    const value = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("nl");
    return value === "1" || value === "open";
  } catch {
    return false;
  }
}

export function isWithinCooldown(lastShownAt: string | null, now: number, cooldownDays = NL_POPUP_COOLDOWN_DAYS): boolean {
  if (!lastShownAt) return false;
  const at = Number(lastShownAt);
  if (!Number.isFinite(at)) return false;
  return now - at < cooldownDays * 86_400_000;
}

export function popupEligibility(input: PopupEligibilityInput): { eligible: boolean; reason?: PopupIneligibleReason } {
  if (!input.enabled) return { eligible: false, reason: "disabled" };
  if (!input.locales.includes(input.lang)) return { eligible: false, reason: "locale" };
  if (isExcludedPath(input.path)) return { eligible: false, reason: "path" };
  if (input.subscribed === "1") return { eligible: false, reason: "subscribed" };
  if (!input.forced && isWithinCooldown(input.knownAt ?? null, input.now, NL_KNOWN_DAYS)) return { eligible: false, reason: "known" };
  if (!input.forced && isWithinCooldown(input.lastShownAt, input.now, input.cooldownDays)) return { eligible: false, reason: "cooldown" };
  if (!input.forced && input.skipSession === "1") return { eligible: false, reason: "utm" };
  if (!input.cookieChoice) return { eligible: false, reason: "cookie_banner" };
  if (!input.visible) return { eligible: false, reason: "hidden" };
  return { eligible: true };
}

/** Milliseconds left before the timer trigger, counted from when the visit became eligible (not per page). */
export function remainingDelay(delayMs: number, armedAt: number, now: number): number {
  return Math.max(0, delayMs - Math.max(0, now - armedAt));
}

/** Share of the scrollable height already scrolled, 0 to 100. A page that does not scroll never reaches it. */
export function scrollProgressPct(scrollY: number, viewportHeight: number, documentHeight: number): number {
  const scrollable = documentHeight - viewportHeight;
  if (!(scrollable > 0) || !(scrollY > 0)) return 0;
  return Math.min(100, (scrollY / scrollable) * 100);
}

/* ── Phone sheet: how much of the screen it may take, and when it gives way ── */

/**
 * Phone: the pop-up first shows as a strip of NL_STRIP_PX (one short line,
 * the "Subscrever" button and the X); the form with the consent sentence
 * opens only when the person taps "Subscrever". Unrequested, the strip and a
 * fixed bar at the bottom (the booking bar of a house page) together never
 * take more than NL_STRIP_MAX_SHARE of the visible height (innerHeight, the
 * dynamic viewport, never the large one of `vh`). Without a bar, up to 34 px
 * of the iPhone's home indicator area count too.
 */
export const NL_STRIP_PX = 64;
export const NL_STRIP_MAX_SHARE = 0.3;
export const NL_SAFE_AREA_ALLOWANCE_PX = 34;

export function stripFits(viewportHeight: number, bottomBarPx: number): boolean {
  if (!(viewportHeight > 0)) return false;
  const below = bottomBarPx > 0 ? bottomBarPx : NL_SAFE_AREA_ALLOWANCE_PX;
  return NL_STRIP_PX + below <= NL_STRIP_MAX_SHARE * viewportHeight;
}

/**
 * Overlays the phone sheet gives way to: dialogs and drawers (Radix and vaul
 * mark them role="dialog"), the header menu (aria-modal), and anything that
 * carries data-nl-suppress (the cookie banner, the "no availability" form).
 */
export const NL_OVERLAY_SELECTOR = '[role="dialog"], [role="alertdialog"], [aria-modal="true"], [data-nl-suppress]';

/** The little of the DOM otherOverlayOpen needs (a real document in the browser, a stub in the tests). */
export interface OverlayProbeElement {
  closest(selector: string): unknown;
  getBoundingClientRect(): { width: number; height: number };
}
export interface OverlayProbeDocument {
  body: { style: { pointerEvents: string } } | null;
  querySelectorAll(selector: string): ArrayLike<OverlayProbeElement>;
}

/**
 * Another overlay is open on top of the page: the pop-up must not open, and
 * the phone sheet (not modal) must close. A modal Radix layer (the booking
 * drawer, the filters, the full-screen calendar) sets pointer-events:none on
 * the body; the sheet would stay visible above it and stop answering taps.
 * The sheet itself (data-nl-popup) and hidden or closed elements do not count.
 */
export function otherOverlayOpen(
  doc: OverlayProbeDocument,
  styleOf: (el: OverlayProbeElement) => { display: string; visibility: string },
): boolean {
  if (doc.body?.style.pointerEvents === "none") return true;
  const nodes = doc.querySelectorAll(NL_OVERLAY_SELECTOR);
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i];
    if (el.closest("[data-nl-popup]") || el.closest("[inert]") || el.closest('[aria-hidden="true"]')) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = styleOf(el);
    if (style.display === "none" || style.visibility === "hidden") continue;
    return true;
  }
  return false;
}

/** Exit intent: the pointer leaves the window through the top edge (towards the tabs or the address bar). */
export function isExitIntent(event: { clientY: number; relatedTarget: unknown }, dwellMs: number): boolean {
  return event.relatedTarget == null && event.clientY <= 0 && dwellMs >= NL_EXIT_MIN_DWELL_MS;
}

/* ── Page context (learning: which pages bring subscribers) ──────────── */

export const NEWSLETTER_PAGE_KINDS = ["home", "homes", "house", "destination", "article", "blog", "experience", "other"] as const;
export type NewsletterPageKind = (typeof NEWSLETTER_PAGE_KINDS)[number];

export function pageKind(path: string): NewsletterPageKind {
  const p = (path || "/").split(/[?#]/)[0].replace(/\/+$/, "") || "/";
  if (p === "/") return "home";
  if (p === "/homes") return "homes";
  if (/^\/homes\/[^/]+$/.test(p)) return "house";
  if (/^\/(destinations|collections)(\/|$)/.test(p)) return "destination";
  if (/^\/blog\/[^/]+$/.test(p)) return "article";
  if (p === "/blog") return "blog";
  if (/^\/(experiences|activities|adventures|services|concierge)(\/|$)/.test(p)) return "experience";
  return "other";
}

/** Slug of the house when the route is a house page, e.g. "/homes/casa-x" → "casa-x". */
export function houseSlugFromPath(path: string): string | undefined {
  const match = /^\/homes\/([^/?#]+)\/?$/.exec((path || "").split(/[?#]/)[0]);
  return match?.[1];
}

/**
 * A house whose news the PA can promise: managed by the PA (it has a Guesty
 * id) and not a partner home (source "tripwix"). The PA neither opens dates
 * nor sets prices for partner homes, so their pages get the generic texts and
 * no house interest is recorded.
 */
export function isNewsletterHouse(property: unknown): boolean {
  const p = property as { source?: unknown; guestyId?: unknown } | null | undefined;
  if (!p) return false;
  if (p.source === "tripwix") return false;
  return typeof p.guestyId === "string" ? p.guestyId.trim().length > 0 : !!p.guestyId;
}

/* ── Learning: the funnel of the admin report (/admin/leads) ─────────────── */

/** One group of db.newsletterFunnel (counts only, never an address). */
export interface NewsletterFunnelGroup {
  origin: string;
  state: "pending" | "confirmed" | "left" | "expired";
  wasConfirmed: boolean;
  suspect: boolean;
  trigger: string | null;
  device: string | null;
  pageKind: string | null;
  utmSource: string | null;
  interest: string | null;
  count: number;
}

export const NEWSLETTER_FUNNEL_DIMENSIONS = ["origin", "trigger", "device", "pageKind", "utmSource", "interest"] as const;
export type NewsletterFunnelDimension = (typeof NEWSLETTER_FUNNEL_DIMENSIONS)[number];

export interface NewsletterFunnelSummary {
  key: string;
  /** Every sign-up of the flow in the window (pending, confirmed, left, expired). */
  signups: number;
  /** Clicked the confirmation link (even if they left later). */
  confirmed: number;
  /** Confirmed by a click that looks human: the double opt-ins downstream. */
  doubleOptIn: number;
  /** Still waiting for the click (the link lasts 7 days). */
  pending: number;
  left: number;
  /** confirmed / signups, or null without sign-ups. */
  rate: number | null;
}

/** Sign-ups and confirmations by one dimension (origin, trigger, device, page, campaign source, interest). */
export function summariseNewsletterFunnel(groups: NewsletterFunnelGroup[], by: NewsletterFunnelDimension): NewsletterFunnelSummary[] {
  const out = new Map<string, NewsletterFunnelSummary>();
  for (const g of groups) {
    const key = String(g[by] ?? "(none)");
    const row = out.get(key) ?? { key, signups: 0, confirmed: 0, doubleOptIn: 0, pending: 0, left: 0, rate: null };
    row.signups += g.count;
    if (g.wasConfirmed) row.confirmed += g.count;
    if (g.wasConfirmed && !g.suspect) row.doubleOptIn += g.count;
    if (g.state === "pending") row.pending += g.count;
    if (g.state === "left") row.left += g.count;
    out.set(key, row);
  }
  return Array.from(out.values())
    .map((r) => ({ ...r, rate: r.signups ? r.confirmed / r.signups : null }))
    .sort((a, b) => b.signups - a.signups || a.key.localeCompare(b.key));
}
