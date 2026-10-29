/**
 * Title and description of the legal pages, in the 9 site languages.
 *
 * One source for the server (PAGE_META in server/_core/vite.ts: direct loads,
 * crawlers, share cards) and for the pages themselves (usePageMeta: the head
 * after a client-side navigation), so the two can never disagree again.
 * Until Oct 2026 the privacy, terms and cookie pages had an English <title>,
 * og:title and description in every language, under a translated H1, and the
 * client wrote a second, different English string after a footer click
 * (auditoria 29 out 2026, Regression:P6).
 *
 * Titles are the page's H1 (privacy.title, terms.title, cookiesPage.title,
 * cancellationPolicy.pageTitle in the locale files) without the
 * " | Portugal Active" suffix, which the server and usePageMeta both add.
 * Descriptions stay under 155 characters, where the server cuts them.
 * The cancellation-policy description is Guesty's own policy summary and
 * lives in shared/cancellationPolicy.ts.
 */
import { cancellationPolicyMetaDescription } from "./cancellationPolicy";

export const LEGAL_META_LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"] as const;
export type LegalMetaLang = (typeof LEGAL_META_LANGS)[number];
export type LegalMetaPath = "/legal/privacy" | "/legal/terms" | "/legal/cookies" | "/legal/cancellation-policy";
export const LEGAL_META_PATHS: readonly LegalMetaPath[] = ["/legal/privacy", "/legal/terms", "/legal/cookies", "/legal/cancellation-policy"];

type Entry = { title: string; description: string };
type Copy = Record<LegalMetaLang, Entry>;

const PRIVACY: Copy = {
  en: { title: "Privacy Policy",
        description: "How Portugal Active collects, uses and protects your personal data when you browse, book or contact us. GDPR compliant." },
  pt: { title: "Política de Privacidade",
        description: "Como a Portugal Active recolhe, utiliza e protege os seus dados pessoais quando navega no site, reserva ou nos contacta. Em conformidade com o RGPD." },
  fr: { title: "Politique de confidentialité",
        description: "Comment Portugal Active collecte, utilise et protège vos données personnelles lorsque vous naviguez, réservez ou nous contactez. Conforme au RGPD." },
  es: { title: "Política de privacidad",
        description: "Cómo Portugal Active recoge, utiliza y protege sus datos personales cuando navega, reserva o se pone en contacto con nosotros. Conforme al RGPD." },
  it: { title: "Informativa sulla privacy",
        description: "Come Portugal Active raccoglie, utilizza e protegge i vostri dati personali quando navigate, prenotate o ci contattate. Conforme al GDPR." },
  de: { title: "Datenschutzrichtlinie",
        description: "Wie Portugal Active Ihre personenbezogenen Daten erhebt, nutzt und schützt, wenn Sie die Website besuchen, buchen oder uns kontaktieren. DSGVO-konform." },
  nl: { title: "Privacybeleid",
        description: "Hoe Portugal Active uw persoonsgegevens verzamelt, gebruikt en beschermt wanneer u de website bezoekt, boekt of contact met ons opneemt. Conform de AVG." },
  sv: { title: "Integritetspolicy",
        description: "Hur Portugal Active samlar in, använder och skyddar dina personuppgifter när du besöker webbplatsen, bokar eller kontaktar oss. Enligt GDPR." },
  fi: { title: "Tietosuojakäytäntö",
        description: "Miten Portugal Active kerää, käyttää ja suojaa henkilötietojasi, kun käytät sivustoa, teet varauksen tai otat meihin yhteyttä. GDPR:n mukainen." },
};

const TERMS: Copy = {
  en: { title: "Terms of Service",
        description: "Booking, payment and cancellation terms for Portugal Active holiday homes, experiences and concierge services." },
  pt: { title: "Termos de Serviço",
        description: "Condições de reserva, pagamento e cancelamento das casas de férias, experiências e serviços de concierge da Portugal Active." },
  fr: { title: "Conditions générales d'utilisation",
        description: "Conditions de réservation, de paiement et d'annulation des maisons de vacances, expériences et services de conciergerie Portugal Active." },
  es: { title: "Términos de servicio",
        description: "Condiciones de reserva, pago y cancelación de las casas vacacionales, experiencias y servicios de conserjería de Portugal Active." },
  it: { title: "Termini di servizio",
        description: "Condizioni di prenotazione, pagamento e cancellazione delle case vacanza, delle esperienze e dei servizi di concierge di Portugal Active." },
  de: { title: "Nutzungsbedingungen",
        description: "Buchungs-, Zahlungs- und Stornierungsbedingungen für die Ferienhäuser, Erlebnisse und Concierge-Services von Portugal Active." },
  nl: { title: "Servicevoorwaarden",
        description: "Boekings-, betalings- en annuleringsvoorwaarden voor de vakantiehuizen, ervaringen en conciërgediensten van Portugal Active." },
  sv: { title: "Tjänstevillkor",
        description: "Boknings-, betalnings- och avbokningsvillkor för Portugal Actives semesterhus, upplevelser och concierge-tjänster." },
  fi: { title: "Käyttöehdot",
        description: "Portugal Activen lomakotien, elämysten ja concierge-palvelujen varaus-, maksu- ja peruutusehdot." },
};

const COOKIES: Copy = {
  en: { title: "Cookie Policy",
        description: "Which cookies Portugal Active uses, what each one does and how to change your cookie preferences at any time." },
  pt: { title: "Política de Cookies",
        description: "Que cookies a Portugal Active utiliza, para que serve cada um e como alterar as suas preferências de cookies a qualquer momento." },
  fr: { title: "Politique de cookies",
        description: "Les cookies utilisés par Portugal Active, le rôle de chacun et comment modifier vos préférences en matière de cookies à tout moment." },
  es: { title: "Política de cookies",
        description: "Qué cookies utiliza Portugal Active, para qué sirve cada una y cómo cambiar sus preferencias de cookies en cualquier momento." },
  it: { title: "Politica sui cookie",
        description: "Quali cookie utilizza Portugal Active, a cosa serve ciascuno e come modificare in qualsiasi momento le vostre preferenze sui cookie." },
  de: { title: "Cookie-Richtlinie",
        description: "Welche Cookies Portugal Active verwendet, wozu sie dienen und wie Sie Ihre Cookie-Einstellungen jederzeit ändern können." },
  nl: { title: "Cookiebeleid",
        description: "Welke cookies Portugal Active gebruikt, waarvoor ze dienen en hoe u uw cookievoorkeuren op elk moment kunt wijzigen." },
  sv: { title: "Cookiepolicy",
        description: "Vilka cookies Portugal Active använder, vad de gör och hur du när som helst ändrar dina cookieinställningar." },
  fi: { title: "Evästekäytäntö",
        description: "Mitä evästeitä Portugal Active käyttää, mihin niitä tarvitaan ja miten voit muuttaa evästeasetuksiasi milloin tahansa." },
};

const CANCELLATION_TITLES: Record<LegalMetaLang, string> = {
  en: "Cancellation Policies",
  pt: "Políticas de Cancelamento",
  fr: "Politiques d'Annulation",
  es: "Políticas de Cancelación",
  it: "Politiche di Cancellazione",
  de: "Stornierungsbedingungen",
  nl: "Annuleringsbeleid",
  sv: "Avbokningspolicyer",
  fi: "Peruutuskäytännöt",
};

function metaLang(lang?: string | null): LegalMetaLang {
  const l = String(lang || "").toLowerCase().slice(0, 2);
  return (LEGAL_META_LANGS as readonly string[]).includes(l) ? (l as LegalMetaLang) : "en";
}

/** Bare title (no " | Portugal Active") and description, in the page language. */
export function legalPageMeta(path: LegalMetaPath, lang?: string | null): Entry {
  const l = metaLang(lang);
  if (path === "/legal/cancellation-policy") {
    return { title: CANCELLATION_TITLES[l], description: cancellationPolicyMetaDescription(l) };
  }
  const copy = path === "/legal/privacy" ? PRIVACY : path === "/legal/terms" ? TERMS : COOKIES;
  return copy[l];
}

/** The PAGE_META entries for one legal path: every language, server title form. */
export function legalPageMetaEntries(path: LegalMetaPath): Record<LegalMetaLang, Entry> {
  return Object.fromEntries(LEGAL_META_LANGS.map((l) => {
    const m = legalPageMeta(path, l);
    return [l, { title: `${m.title} | Portugal Active`, description: m.description }];
  })) as Record<LegalMetaLang, Entry>;
}
