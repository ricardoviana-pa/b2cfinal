/** Basic consent mode: optional measurement only loads after an explicit grant. */
export type CookieChoice = 'all' | 'essential';
export const COOKIE_CHOICE_KEY = 'pa-cookies-consent';
export const COOKIE_PREFERENCES_EVENT = 'pa:cookie-preferences';
export const COOKIE_CHOICE_EVENT = 'pa:cookie-choice';
const SESSION_DENIAL_KEY = 'pa-cookies-denied';

type ConsentState = 'granted' | 'denied';
type ClarityFunction = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    dataLayer: (Record<string, unknown> | IArguments)[];
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    clarity?: ClarityFunction;
  }
}

let initialized = false;
let choice: CookieChoice | null = null;
let gtmLoaded = false;
let preferencesRequested = false;

function storedChoice(): CookieChoice | null {
  try {
    if (window.sessionStorage.getItem(SESSION_DENIAL_KEY) === '1') return 'essential';
  } catch { /* Storage can be unavailable in private/embedded browsers. */ }
  try {
    const value = window.localStorage.getItem(COOKIE_CHOICE_KEY);
    return value === 'all' || value === 'essential' ? value : null;
  } catch { return null; }
}

function googleConsent(state: ConsentState) {
  return {
    ad_storage: state,
    ad_user_data: state,
    ad_personalization: state,
    analytics_storage: state,
  };
}

function updateConsent(granted: boolean) {
  const state = granted ? 'granted' : 'denied';
  window.gtag?.('consent', 'update', googleConsent(state));
  // Queue the decision before Clarity's script is injected by GTM.
  if (granted && !window.clarity) {
    const queue: ClarityFunction = (...args) => { (queue.q = queue.q || []).push(args); };
    window.clarity = queue;
  }
  window.clarity?.('consentv2', { ad_Storage: state, analytics_Storage: state });
  window.fbq?.('consent', granted ? 'grant' : 'revoke');
}

function clearMeasurementCookies() {
  // Only known measurement cookies. Booking, login and basket storage are untouched.
  const names = document.cookie.split(';').map(part => part.split('=')[0].trim())
    .filter(name => /^(_ga($|_)|_gid$|_gat($|_)|_gcl_|_fbi$|_fbp$|_fbc$|_clck$|_clsk$)/.test(name));
  const host = window.location.hostname;
  const domains = ['', host];
  if (host === 'portugalactive.com' || host.endsWith('.portugalactive.com')) domains.push('portugalactive.com');
  for (const name of names) {
    for (const domain of new Set(domains)) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

function loadMeasurement() {
  if (choice !== 'all' || gtmLoaded) return;
  gtmLoaded = true;
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtm.js?id=GTM-TRPCDT3';
  script.dataset.paMeasurement = 'gtm';
  document.head.appendChild(script);
}

function startWhenReady() {
  if (document.readyState === 'complete') window.setTimeout(loadMeasurement, 100);
  // bootstrapMeasurement already registered the load listener if needed.
}

export function getCookieChoice(): CookieChoice | null {
  return typeof window === 'undefined' ? null : choice;
}

export function hasMeasurementConsent(): boolean {
  return typeof window !== 'undefined' && choice === 'all';
}

export function willReloadForEssential(): boolean {
  return gtmLoaded;
}

export function openCookiePreferences(): void {
  preferencesRequested = true;
  window.dispatchEvent(new Event(COOKIE_PREFERENCES_EVENT));
}

export function consumeCookiePreferencesRequest(): boolean {
  const requested = preferencesRequested;
  preferencesRequested = false;
  return requested;
}

function applyChoice(value: CookieChoice | null) {
  const wasLoaded = gtmLoaded;
  choice = value;
  updateConsent(value === 'all');
  if (value !== 'all') clearMeasurementCookies();
  window.dispatchEvent(new Event(COOKIE_CHOICE_EVENT));
  if (value === 'all') startWhenReady();
  // A loaded recording library cannot be unloaded reliably in an SPA. Revocation
  // is signalled first, then a fresh document keeps all optional scripts absent.
  else if (wasLoaded) window.location.reload();
}

export function saveCookieChoice(value: CookieChoice): void {
  try {
    window.localStorage.setItem(COOKIE_CHOICE_KEY, value);
    window.sessionStorage.removeItem(SESSION_DENIAL_KEY);
  } catch {
    if (value === 'essential') {
      // Avoid restoring a legacy "all" choice after a quota/write failure.
      try { window.localStorage.removeItem(COOKIE_CHOICE_KEY); } catch { /* unavailable */ }
      try { window.sessionStorage.setItem(SESSION_DENIAL_KEY, '1'); } catch { /* unavailable */ }
    }
  }
  applyChoice(value);
}

export function bootstrapMeasurement(): void {
  if (typeof window === 'undefined' || initialized) return;
  initialized = true;
  choice = storedChoice();
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('consent', 'default', googleConsent('denied'));
  window.gtag('set', 'ads_data_redaction', true);
  if (choice === 'all') updateConsent(true);
  else clearMeasurementCookies();
  if (document.readyState === 'complete') startWhenReady();
  else window.addEventListener('load', () => window.setTimeout(loadMeasurement, 100), { once: true });
  window.addEventListener('storage', event => {
    if (event.key !== COOKIE_CHOICE_KEY && event.key !== null) return;
    // A decision in another tab wins over this tab's fallback.
    try { window.sessionStorage.removeItem(SESSION_DENIAL_KEY); } catch { /* unavailable */ }
    applyChoice(storedChoice());
  });
}

bootstrapMeasurement();
