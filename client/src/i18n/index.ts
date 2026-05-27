/**
 * i18n bootstrap — lazy-loaded locales.
 *
 * The site supports 9 languages. Loading all 9 JSON catalogues into the main
 * bundle costs ~620 KB uncompressed on every page load — a major mobile CWV
 * regressor (this was the cause of the 2026-04 mobile collapse).
 *
 * Strategy:
 *  - Detect the active language from the URL path synchronously (no React).
 *  - Dynamically import ONLY the active language (and English as fallback)
 *    before React renders. Each locale becomes a separate chunk via Vite's
 *    `import()` splitting.
 *  - Patch `changeLanguage` so user-initiated language switches lazy-fetch
 *    the requested bundle on demand.
 *  - LanguageDetector (path/localStorage) is no longer needed — LocaleRouter
 *    and our detectFromPath() handle URL-based detection.
 *
 * Module evaluation blocks (top-level await) until the active locale is in
 * memory, so the first React render always has translations.
 */

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const SUPPORTED = ["en", "pt", "fr", "es", "it", "fi", "de", "nl", "sv"] as const;
type Lang = typeof SUPPORTED[number];

// Per-locale loaders — Vite emits each .json as its own chunk.
const loaders: Record<Lang, () => Promise<{ default: Record<string, unknown> }>> = {
  en: () => import("./locales/en.json"),
  pt: () => import("./locales/pt.json"),
  fr: () => import("./locales/fr.json"),
  es: () => import("./locales/es.json"),
  it: () => import("./locales/it.json"),
  fi: () => import("./locales/fi.json"),
  de: () => import("./locales/de.json"),
  nl: () => import("./locales/nl.json"),
  sv: () => import("./locales/sv.json"),
};

function detectFromPath(): Lang {
  if (typeof window === "undefined") return "en";
  const seg = window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  return (SUPPORTED as readonly string[]).includes(seg) ? (seg as Lang) : "en";
}

const loaded = new Set<Lang>();
const initialLng = detectFromPath();

// Preload the active locale (always) and English as fallback (so missing keys
// degrade to readable English rather than raw key strings).
const initialBundle = await loaders[initialLng]();
loaded.add(initialLng);

const resources: Record<string, { translation: Record<string, unknown> }> = {
  [initialLng]: { translation: initialBundle.default },
};

if (initialLng !== "en") {
  const enBundle = await loaders.en();
  resources.en = { translation: enBundle.default };
  loaded.add("en");
}

await i18n.use(initReactI18next).init({
  lng: initialLng,
  fallbackLng: "en",
  supportedLngs: [...SUPPORTED],
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  resources,
});

// Patch changeLanguage so a language switch fetches the bundle if not loaded yet.
const origChange = i18n.changeLanguage.bind(i18n);
i18n.changeLanguage = async (lng?: string, ...rest: unknown[]): Promise<any> => {
  if (lng && (SUPPORTED as readonly string[]).includes(lng) && !loaded.has(lng as Lang)) {
    const mod = await loaders[lng as Lang]();
    i18n.addResourceBundle(lng, "translation", mod.default, true, true);
    loaded.add(lng as Lang);
  }
  return (origChange as any)(lng, ...rest);
};

export const LOCALE_MAP: Record<string, string> = {
  en: 'en_GB', pt: 'pt_PT', es: 'es_ES', fr: 'fr_FR',
  de: 'de_DE', it: 'it_IT', nl: 'nl_NL', fi: 'fi_FI', sv: 'sv_SE',
};

function applyLanguage(lng: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lng;
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.setAttribute('content', LOCALE_MAP[lng] ?? 'en_GB');
}

// Keep og:locale and <html lang> in sync when users switch language mid-session.
i18n.on('languageChanged', applyLanguage);
applyLanguage(i18n.language || 'en');

export default i18n;
