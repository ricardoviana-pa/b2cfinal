import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import pt from "./locales/pt.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import fi from "./locales/fi.json";
import de from "./locales/de.json";
import nl from "./locales/nl.json";
import sv from "./locales/sv.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      pt: { translation: pt },
      fr: { translation: fr },
      es: { translation: es },
      it: { translation: it },
      fi: { translation: fi },
      de: { translation: de },
      nl: { translation: nl },
      sv: { translation: sv },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "pt", "fr", "es", "it", "fi", "de", "nl", "sv"],
    lng: "en",
    defaultNS: "translation",
    interpolation: { escapeValue: false },
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

const LOCALE_MAP: Record<string, string> = {
  en: 'en_GB', pt: 'pt_PT', es: 'es_ES', fr: 'fr_FR',
  de: 'de_DE', it: 'it_IT', nl: 'nl_NL', fi: 'fi_FI', sv: 'sv_SE',
};

function applyLanguage(lng: string) {
  document.documentElement.lang = lng;
  const ogLocale = document.querySelector('meta[property="og:locale"]');
  if (ogLocale) ogLocale.setAttribute('content', LOCALE_MAP[lng] ?? 'en_GB');
}

i18n.on('languageChanged', applyLanguage);
// Set immediately on initial load
applyLanguage(i18n.language || 'en');

export default i18n;
