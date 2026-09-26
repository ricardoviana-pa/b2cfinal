/**
 * Server-side strings of the newsletter capture: the static confirmation page
 * (served by Express, outside the client i18n bundle) and the pre-computed
 * lines the welcome email template substitutes verbatim (the Brevo template
 * does no logic, rule from campaign 1's audit).
 *
 * Portuguese is the draft submitted for Ricardo's approval (bloco de quarta
 * 30 de setembro de 2026). English and Spanish are drafts awaiting native
 * review; the other six site languages fall back to English until reviewed.
 * TODO(humano): native review of EN and ES before NEWSLETTER_LOCALES includes them.
 */

export type NewsletterLang = "pt" | "es" | "en";

export const NEWSLETTER_TEMPLATE_LANGS: readonly NewsletterLang[] = ["pt", "es", "en"];

/** The language the DOI/welcome templates and the confirmation page exist in. */
export function newsletterLang(locale: string | undefined | null): NewsletterLang {
  const two = String(locale || "").slice(0, 2).toLowerCase();
  return (NEWSLETTER_TEMPLATE_LANGS as readonly string[]).includes(two) ? (two as NewsletterLang) : "en";
}

interface ConfirmPageCopy {
  confirmedTitle: string;
  confirmedBody: string;
  confirmedBodyWithCode: string;
  ctaHomes: string;
  invalidTitle: string;
  invalidBody: string;
  errorTitle: string;
  errorBody: string;
}

export const CONFIRM_PAGE_COPY: Record<NewsletterLang, ConfirmPageCopy> = {
  pt: {
    confirmedTitle: "Subscrição confirmada",
    confirmedBody:
      "Obrigado. A partir de agora recebe as promoções só para subscritores e as novidades das nossas casas.",
    confirmedBodyWithCode:
      "Obrigado. A partir de agora recebe as promoções só para subscritores e as novidades das nossas casas. O primeiro email, com o seu código de boas-vindas, chega dentro de minutos.",
    ctaHomes: "Ver as casas",
    invalidTitle: "Link inválido",
    invalidBody: "Este link já não é válido. Se quiser subscrever, volte ao site e deixe o seu email outra vez.",
    errorTitle: "Algo falhou",
    errorBody: "Não conseguimos confirmar a subscrição agora. Tente outra vez daqui a instantes ou escreva para info@portugalactive.com.",
  },
  es: {
    confirmedTitle: "Suscripción confirmada",
    confirmedBody:
      "Gracias. A partir de ahora recibe las promociones solo para suscriptores y las novedades de nuestras casas.",
    confirmedBodyWithCode:
      "Gracias. A partir de ahora recibe las promociones solo para suscriptores y las novedades de nuestras casas. El primer correo, con su código de bienvenida, llega en unos minutos.",
    ctaHomes: "Ver las casas",
    invalidTitle: "Enlace no válido",
    invalidBody: "Este enlace ya no es válido. Si quiere suscribirse, vuelva a la web y deje su correo otra vez.",
    errorTitle: "Algo ha fallado",
    errorBody: "No hemos podido confirmar la suscripción ahora. Inténtelo de nuevo en unos instantes o escriba a info@portugalactive.com.",
  },
  en: {
    confirmedTitle: "Subscription confirmed",
    confirmedBody:
      "Thank you. From now on you will receive the subscriber-only offers and the news about our homes.",
    confirmedBodyWithCode:
      "Thank you. From now on you will receive the subscriber-only offers and the news about our homes. The first email, with your welcome code, arrives within minutes.",
    ctaHomes: "See the homes",
    invalidTitle: "Invalid link",
    invalidBody: "This link is no longer valid. If you would like to subscribe, go back to the site and leave your email again.",
    errorTitle: "Something went wrong",
    errorBody: "We could not confirm the subscription right now. Please try again in a moment or write to info@portugalactive.com.",
  },
};

/** "Ficou registado o seu interesse na {casa}: ..." or empty when there is no house. */
export function interestLine(lang: NewsletterLang, houseName: string | undefined | null): string {
  const house = (houseName || "").trim();
  if (!house) return "";
  switch (lang) {
    case "pt":
      return `Ficou registado o seu interesse na ${house}: quando houver novidades sobre ela, sabe primeiro.`;
    case "es":
      return `Hemos registrado su interés en ${house}: cuando haya novedades sobre ella, lo sabrá primero.`;
    default:
      return `We have noted your interest in ${house}: when there is news about it, you will hear first.`;
  }
}

/**
 * Welcome offer line. Empty until Ricardo decides the offer (code and value):
 * without NEWSLETTER_WELCOME_CODE and NEWSLETTER_WELCOME_CODE_UNTIL the
 * welcome email goes out with the news only. The validity text is written
 * from the coupon's own date, never by hand.
 * TODO(humano): NEWSLETTER_WELCOME_CODE, NEWSLETTER_WELCOME_CODE_UNTIL (aaaa-mm-dd) and
 * NEWSLETTER_WELCOME_PCT in the Render environment, after the Guesty coupon exists.
 */
export function offerLine(lang: NewsletterLang, code: string, validUntilText: string, pct: string): string {
  if (!code || !validUntilText || !pct) return "";
  switch (lang) {
    case "pt":
      return `Para a primeira estadia, guarde este código: ${code}. No site, tira ${pct}% ao preço em estadias fora de julho e agosto, para reservas feitas até ${validUntilText}.`;
    case "es":
      return `Para la primera estancia, guarde este código: ${code}. En la web, quita un ${pct}% al precio en estancias fuera de julio y agosto, para reservas hechas hasta el ${validUntilText}.`;
    default:
      return `For your first stay, keep this code: ${code}. On the site it takes ${pct}% off the price of stays outside July and August, for bookings made by ${validUntilText}.`;
  }
}

/** WhatsApp pre-filled message for the welcome email (attribute WA_LINK_NL). */
export function whatsappMessage(lang: NewsletterLang): string {
  switch (lang) {
    case "pt":
      return "Olá! Subscrevi a lista da Portugal Active e tenho uma dúvida.";
    case "es":
      return "¡Hola! Me he suscrito a la lista de Portugal Active y tengo una duda.";
    default:
      return "Hello! I subscribed to the Portugal Active list and have a question.";
  }
}

/** "30 de junho de 2027" style date in the person's language, from an ISO day. */
export function formatValidUntil(lang: NewsletterLang, iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const date = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const locale = lang === "pt" ? "pt-PT" : lang === "es" ? "es-ES" : "en-GB";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}
