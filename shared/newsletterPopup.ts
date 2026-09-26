/**
 * Newsletter pop-up: the eligibility rules, as pure functions.
 *
 * The React gate (client/src/components/marketing/NewsletterPopupGate.tsx)
 * reads the browser (route, language, localStorage, sessionStorage, cookie
 * choice) and hands the values here. Keeping the decision pure means the
 * "once per 30 days, never after subscribing" contract is unit-tested on the
 * server test runner, where no DOM is needed.
 *
 * Storage keys are shared with NewsletterForm (which writes NL_SUBSCRIBED_KEY
 * on success) so an inline subscription also silences the pop-up.
 */

export const NL_SUBSCRIBED_KEY = "pa_nl_subscribed";
export const NL_POPUP_AT_KEY = "pa_nl_popup_at";
export const NL_SKIP_SESSION_KEY = "pa_nl_skip";

export const NL_POPUP_COOLDOWN_DAYS = 30;
export const NL_POPUP_DEFAULT_DELAY_MS = 20_000;
export const NL_POPUP_SCROLL_PCT = 50;

/** Route prefixes (without the language prefix) where the pop-up never shows. */
export const NL_EXCLUDED_PATH_PREFIXES = [
  "/checkout",
  "/booking",
  "/login",
  "/account",
  "/admin",
  "/legal",
  "/404",
  "/newsletter",
] as const;

export type PopupIneligibleReason =
  | "disabled"
  | "locale"
  | "path"
  | "subscribed"
  | "cooldown"
  | "utm"
  | "cookie_banner"
  | "hidden";

export interface PopupEligibilityInput {
  /** newsletter.config.enabled from the server. */
  enabled: boolean;
  /** Languages the pop-up may show in (newsletter.config.locales). */
  locales: readonly string[];
  /** Language of the current URL (two letters). */
  lang: string;
  /** Route without the language prefix, e.g. "/homes/casa-x". */
  path: string;
  /** localStorage[NL_SUBSCRIBED_KEY] */
  subscribed: string | null;
  /** localStorage[NL_POPUP_AT_KEY] (Date.now() of the last display). */
  lastShownAt: string | null;
  /** sessionStorage[NL_SKIP_SESSION_KEY] ("1" when the landing URL came from an email). */
  skipSession: string | null;
  /** Cookie banner choice: null while the banner is still open. */
  cookieChoice: string | null;
  /** document.visibilityState === "visible" */
  visible: boolean;
  now: number;
  cooldownDays?: number;
}

export function isExcludedPath(path: string): boolean {
  const p = path.startsWith("/") ? path : `/${path}`;
  return NL_EXCLUDED_PATH_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** Landing URLs from our own emails or the checkout recovery never get the pop-up. */
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
  if (isWithinCooldown(input.lastShownAt, input.now, input.cooldownDays)) return { eligible: false, reason: "cooldown" };
  if (input.skipSession === "1") return { eligible: false, reason: "utm" };
  if (!input.cookieChoice) return { eligible: false, reason: "cookie_banner" };
  if (!input.visible) return { eligible: false, reason: "hidden" };
  return { eligible: true };
}
