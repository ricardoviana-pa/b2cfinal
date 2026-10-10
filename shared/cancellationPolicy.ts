/**
 * Cancellation policies — the ONE place where a Guesty cancellation code
 * becomes a rule and a sentence. Used by the rate selection (widget and
 * checkout), the confirmation pages, the guest emails, the FAQ, the legal
 * pages and the structured data. Nothing else may restate a policy.
 *
 * Source of truth is Guesty (read 10 Oct 2026, read-only API + the
 * Booking.com descriptions Guesty stores on our own reservations):
 *
 *   super_strict / NON_REFUNDABLE → "Não-Reembolsável": no refund
 *   MODERATE   → free cancellation until 7 days before arrival
 *   FIRM       → free cancellation until 14 days before arrival
 *   STRICT     → free cancellation until 30 days before arrival
 *   STRICT_60  → free cancellation until 60 days before arrival
 *
 * After the deadline the guest pays 100 % (Guesty cancellationFee 100).
 *
 * Any other code (including "flexible", which no direct plan uses) is
 * UNKNOWN: the site never guesses a rule for it. It shows the rate's name
 * and "the cancellation terms of your rate" with a link to the terms.
 */

export const POLICY_LANGS = ["en", "pt", "es", "fr", "de", "it", "nl", "sv", "fi"] as const;
export type PolicyLang = (typeof POLICY_LANGS)[number];

export const POLICY_CODES = ["non_refundable", "moderate", "firm", "strict", "strict_60"] as const;
export type PolicyCode = (typeof POLICY_CODES)[number];
export type RefundablePolicyCode = Exclude<PolicyCode, "non_refundable">;

/** Days before arrival until which cancelling is free. After that: 100 %. */
export const FREE_CANCELLATION_DAYS: Record<RefundablePolicyCode, number> = {
  moderate: 7,
  firm: 14,
  strict: 30,
  strict_60: 60,
};

/** Share of the stay charged once the free-cancellation period has ended. */
export const CHARGE_AFTER_DEADLINE_PERCENT = 100;

/** Section anchors on /legal/cancellation-policy. */
export const POLICY_ANCHORS: Record<PolicyCode, string> = {
  non_refundable: "non-refundable",
  moderate: "moderate",
  firm: "firm",
  strict: "strict",
  strict_60: "strict-60",
};

const CODE_ALIASES: Record<string, PolicyCode> = {
  super_strict: "non_refundable",
  non_refundable: "non_refundable",
  nonrefundable: "non_refundable",
  moderate: "moderate",
  firm: "firm",
  strict: "strict",
  strict_60: "strict_60",
};

export function policyLang(lang?: string | null): PolicyLang {
  const l = String(lang || "").toLowerCase().slice(0, 2);
  return (POLICY_LANGS as readonly string[]).includes(l) ? (l as PolicyLang) : "en";
}

function normalizeOne(raw: unknown): PolicyCode | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CODE_ALIASES[key] ?? null;
}

/**
 * Guesty's code (any case, string or string[]) → the policy, or null when it
 * is missing, unknown, or several different codes disagree.
 */
export function normalizePolicyCode(raw: unknown): PolicyCode | null {
  if (Array.isArray(raw)) {
    const codes = raw.map(normalizeOne);
    if (!codes.length || codes.some((c) => c == null)) return null;
    return codes.every((c) => c === codes[0]) ? codes[0] : null;
  }
  return normalizeOne(raw);
}

/** Free-cancellation days for the code, or null (non-refundable or unknown). */
export function freeCancellationDays(raw: unknown): number | null {
  const code = normalizePolicyCode(raw);
  if (!code || code === "non_refundable") return null;
  return FREE_CANCELLATION_DAYS[code];
}

const NON_REFUNDABLE_NAME = /n[aã]o[\s-]*reembols|non[\s-]*refund/i;

/**
 * Is this rate plan the non-refundable one? Guesty's code decides; the plan's
 * own name ("Não-Reembolsável") counts too, because it is Guesty's label.
 */
export function isNonRefundablePlan(plan: { name?: string | null; cancellationPolicy?: unknown }): boolean {
  if (NON_REFUNDABLE_NAME.test(plan.name || "")) return true;
  return normalizePolicyCode(plan.cancellationPolicy) === "non_refundable";
}

/** The fields of a Guesty rate plan that decide what a guest is told. */
export interface PolicyPlan {
  name?: string | null;
  cancellationPolicy?: unknown;
  /** Guesty's share charged after the deadline (percent); 100 on every plan today. */
  cancellationFee?: unknown;
}

/**
 * Does Guesty's cancellationFee match the 100 % every sentence states?
 * Missing counts as a match (Guesty does not always send it); anything else
 * (a plan later set to 50 %) does not, and the plan is then shown as unknown.
 */
export function cancellationFeeMatches(fee: unknown): boolean {
  if (fee == null || fee === "") return true;
  const n = Number(String(fee).replace("%", "").trim());
  return n === CHARGE_AFTER_DEADLINE_PERCENT;
}

/**
 * The policy a guest is shown for a plan — ONE classification for the rate
 * cards, the checkout summary, the pay button, the thank-you page, the
 * confirmation page and the emails:
 *   - the non-refundable plan (Guesty's code or its "Não-Reembolsável" name);
 *   - otherwise Guesty's code, when it is known and its fee is the 100 % the
 *     sentences state;
 *   - otherwise null → "the cancellation terms of your rate".
 */
export function planPolicyCode(plan: PolicyPlan | null | undefined): PolicyCode | null {
  if (!plan) return null;
  if (!cancellationFeeMatches(plan.cancellationFee)) return null;
  if (isNonRefundablePlan({ name: plan.name, cancellationPolicy: plan.cancellationPolicy })) return "non_refundable";
  return normalizePolicyCode(plan.cancellationPolicy);
}

const REFUNDABLE_NAME = /ree?mbols|refundable/i;

export type RateKind = "non_refundable" | "refundable" | "unknown";

/**
 * Which label a rate card may carry. "Refundable" only when Guesty says so:
 * a known refundable code, or the plan's own Guesty name ("Reembolsável …").
 * Anything else is "unknown" and gets the neutral "Rate" label, so the site
 * never claims a refund it cannot establish.
 */
export function rateKind(plan: PolicyPlan): RateKind {
  if (isNonRefundablePlan({ name: plan.name, cancellationPolicy: plan.cancellationPolicy })) return "non_refundable";
  if (freeCancellationDays(plan.cancellationPolicy) != null) return "refundable";
  if (REFUNDABLE_NAME.test(plan.name || "")) return "refundable";
  return "unknown";
}

/**
 * Ordering for equal prices: the earlier the guest may still cancel for
 * free, the friendlier. Non-refundable is lowest; unknown codes sit at 0.
 */
export function policyGenerosity(raw: unknown): number {
  const code = normalizePolicyCode(raw);
  if (!code) return 0;
  if (code === "non_refundable") return -1;
  // 7 days → 4, 14 → 3, 30 → 2, 60 → 1
  const order: RefundablePolicyCode[] = ["strict_60", "strict", "firm", "moderate"];
  return order.indexOf(code) + 1;
}

/** Today's calendar date in mainland Portugal, where every home is. */
export function lisbonToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function isYmd(s: string | null | undefined): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function minusDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Last day of free cancellation (YYYY-MM-DD) for this code and arrival date,
 * or null when there is none: non-refundable, unknown code, no date, or the
 * period has already ended.
 */
export function freeCancellationDeadline(
  raw: unknown,
  checkIn: string | null | undefined,
  today: string = lisbonToday(),
): string | null {
  const days = freeCancellationDays(raw);
  const arrival = (checkIn || "").slice(0, 10);
  if (days == null || !isYmd(arrival)) return null;
  const deadline = minusDays(arrival, days);
  return deadline < today ? null : deadline;
}

/* ------------------------------------------------------------------ */
/* Words. Plain sentences, the site's voice, every supported language. */
/* ------------------------------------------------------------------ */

export interface PolicyCopy {
  /** Short label, e.g. a row header on a confirmation. */
  label: string;
  /** Name of each policy as listed on the legal page. */
  names: Record<PolicyCode, string>;
  nonRefundable: string;
  freeUntilDays: (days: number) => string;
  /** Rule with the concrete last day, e.g. "until 7 days before arrival (3 March 2027)". */
  freeUntilDate: (days: number, date: string) => string;
  windowPassed: string;
  unknown: string;
  termsLink: string;
  pageIntro: string;
  otherPlatformsTitle: string;
  otherPlatformsBody: string;
  question: string;
  summary: (daysList: string) => string;
  metaDescription: (daysList: string) => string;
  or: string;
}

const COPY: Record<PolicyLang, PolicyCopy> = {
  en: {
    label: "Cancellation",
    names: { non_refundable: "Non-refundable", moderate: "Moderate", firm: "Firm", strict: "Strict", strict_60: "Strict 60" },
    nonRefundable: "Non-refundable rate: if you cancel, nothing is refunded and the full price of the stay is charged.",
    freeUntilDays: (n) => `Free cancellation until ${n} days before arrival; after that, the full price of the stay is charged.`,
    freeUntilDate: (n, d) => `Free cancellation until ${n} days before arrival (${d}); after that, the full price of the stay is charged.`,
    windowPassed: "The free-cancellation period for these dates has ended: if you cancel, the full price of the stay is charged.",
    unknown: "The cancellation terms of your rate apply.",
    termsLink: "See the cancellation terms",
    pageIntro: "Every rate on our website has one of the cancellation policies below. You see the policy of your rate before you pay, and it is repeated on your booking confirmation.",
    otherPlatformsTitle: "Bookings made on other platforms",
    otherPlatformsBody: "If you booked on Airbnb, Booking.com or another platform, the cancellation policy of that platform applies, as it was shown to you when you booked.",
    question: "What is the cancellation policy?",
    summary: (list) => `It depends on the rate you choose. The non-refundable rate is not refunded if you cancel. Refundable rates allow free cancellation until ${list} days before arrival, depending on the rate; after that, the full price of the stay is charged. The policy of your rate is shown before you pay and on your booking confirmation. Bookings made on other platforms follow that platform's policy.`,
    metaDescription: (list) => `Portugal Active rates are non-refundable or free to cancel until ${list} days before arrival; after that, the full stay is charged.`,
    or: "or",
  },
  pt: {
    label: "Cancelamento",
    names: { non_refundable: "Não reembolsável", moderate: "Moderada", firm: "Firme", strict: "Rigorosa", strict_60: "Rigorosa 60" },
    nonRefundable: "Tarifa não reembolsável: se cancelar, nada é reembolsado e o valor total da estadia é cobrado.",
    freeUntilDays: (n) => `Cancelamento gratuito até ${n} dias antes da chegada; depois, o valor total da estadia é cobrado.`,
    freeUntilDate: (n, d) => `Cancelamento gratuito até ${n} dias antes da chegada (${d}); depois, o valor total da estadia é cobrado.`,
    windowPassed: "O prazo de cancelamento gratuito para estas datas já terminou: se cancelar, o valor total da estadia é cobrado.",
    unknown: "Aplicam-se as condições de cancelamento da sua tarifa.",
    termsLink: "Ver as condições de cancelamento",
    pageIntro: "Cada tarifa do nosso site tem uma das políticas de cancelamento abaixo. Vê a política da sua tarifa antes de pagar, e ela repete-se na confirmação da reserva.",
    otherPlatformsTitle: "Reservas feitas noutras plataformas",
    otherPlatformsBody: "Se reservou no Airbnb, na Booking.com ou noutra plataforma, aplica-se a política de cancelamento dessa plataforma, tal como lhe foi apresentada quando reservou.",
    question: "Qual é a política de cancelamento?",
    summary: (list) => `Depende da tarifa que escolher. A tarifa não reembolsável não é reembolsada se cancelar. As tarifas reembolsáveis permitem cancelar gratuitamente até ${list} dias antes da chegada, conforme a tarifa; depois, o valor total da estadia é cobrado. A política da sua tarifa é apresentada antes de pagar e na confirmação da reserva. As reservas feitas noutras plataformas seguem a política dessa plataforma.`,
    metaDescription: (list) => `Tarifas da Portugal Active: não reembolsáveis ou com cancelamento gratuito até ${list} dias antes da chegada; depois, cobra-se a estadia toda.`,
    or: "ou",
  },
  es: {
    label: "Cancelación",
    names: { non_refundable: "No reembolsable", moderate: "Moderada", firm: "Firme", strict: "Estricta", strict_60: "Estricta 60" },
    nonRefundable: "Tarifa no reembolsable: si cancela, no se reembolsa nada y se cobra el precio total de la estancia.",
    freeUntilDays: (n) => `Cancelación gratuita hasta ${n} días antes de la llegada; después, se cobra el precio total de la estancia.`,
    freeUntilDate: (n, d) => `Cancelación gratuita hasta ${n} días antes de la llegada (${d}); después, se cobra el precio total de la estancia.`,
    windowPassed: "El plazo de cancelación gratuita para estas fechas ya ha terminado: si cancela, se cobra el precio total de la estancia.",
    unknown: "Se aplican las condiciones de cancelación de su tarifa.",
    termsLink: "Ver las condiciones de cancelación",
    pageIntro: "Cada tarifa de nuestra web tiene una de las políticas de cancelación siguientes. Verá la política de su tarifa antes de pagar, y se repite en la confirmación de la reserva.",
    otherPlatformsTitle: "Reservas hechas en otras plataformas",
    otherPlatformsBody: "Si reservó en Airbnb, Booking.com u otra plataforma, se aplica la política de cancelación de esa plataforma, tal como se le mostró al reservar.",
    question: "¿Cuál es la política de cancelación?",
    summary: (list) => `Depende de la tarifa que elija. La tarifa no reembolsable no se reembolsa si cancela. Las tarifas reembolsables permiten cancelar gratis hasta ${list} días antes de la llegada, según la tarifa; después, se cobra el precio total de la estancia. La política de su tarifa se muestra antes de pagar y en la confirmación de la reserva. Las reservas hechas en otras plataformas siguen la política de esa plataforma.`,
    metaDescription: (list) => `Las tarifas de Portugal Active son no reembolsables o con cancelación gratuita hasta ${list} días antes de la llegada; después, se cobra todo.`,
    or: "o",
  },
  fr: {
    label: "Annulation",
    names: { non_refundable: "Non remboursable", moderate: "Modérée", firm: "Ferme", strict: "Stricte", strict_60: "Stricte 60" },
    nonRefundable: "Tarif non remboursable : en cas d'annulation, rien n'est remboursé et le prix total du séjour est facturé.",
    freeUntilDays: (n) => `Annulation gratuite jusqu'à ${n} jours avant l'arrivée ; ensuite, le prix total du séjour est facturé.`,
    freeUntilDate: (n, d) => `Annulation gratuite jusqu'à ${n} jours avant l'arrivée (${d}) ; ensuite, le prix total du séjour est facturé.`,
    windowPassed: "Le délai d'annulation gratuite pour ces dates est dépassé : en cas d'annulation, le prix total du séjour est facturé.",
    unknown: "Les conditions d'annulation de votre tarif s'appliquent.",
    termsLink: "Voir les conditions d'annulation",
    pageIntro: "Chaque tarif de notre site relève de l'une des politiques d'annulation ci-dessous. La politique de votre tarif s'affiche avant le paiement et figure à nouveau sur votre confirmation de réservation.",
    otherPlatformsTitle: "Réservations faites sur d'autres plateformes",
    otherPlatformsBody: "Si vous avez réservé sur Airbnb, Booking.com ou une autre plateforme, c'est la politique d'annulation de cette plateforme qui s'applique, telle qu'elle vous a été présentée lors de la réservation.",
    question: "Quelle est la politique d'annulation ?",
    summary: (list) => `Cela dépend du tarif choisi. Le tarif non remboursable n'est pas remboursé en cas d'annulation. Les tarifs remboursables permettent d'annuler gratuitement jusqu'à ${list} jours avant l'arrivée, selon le tarif ; ensuite, le prix total du séjour est facturé. La politique de votre tarif s'affiche avant le paiement et sur votre confirmation de réservation. Les réservations faites sur d'autres plateformes suivent la politique de cette plateforme.`,
    metaDescription: (list) => `Tarifs Portugal Active : non remboursables, ou annulation gratuite jusqu'à ${list} jours avant l'arrivée ; ensuite, tout le séjour est dû.`,
    or: "ou",
  },
  de: {
    label: "Stornierung",
    names: { non_refundable: "Nicht erstattbar", moderate: "Moderat", firm: "Fest", strict: "Streng", strict_60: "Streng 60" },
    nonRefundable: "Nicht erstattbarer Tarif: Bei einer Stornierung wird nichts erstattet und der volle Preis des Aufenthalts berechnet.",
    freeUntilDays: (n) => `Kostenlose Stornierung bis ${n} Tage vor der Anreise; danach wird der volle Preis des Aufenthalts berechnet.`,
    freeUntilDate: (n, d) => `Kostenlose Stornierung bis ${n} Tage vor der Anreise (${d}); danach wird der volle Preis des Aufenthalts berechnet.`,
    windowPassed: "Die Frist für die kostenlose Stornierung ist für diese Daten abgelaufen: Bei einer Stornierung wird der volle Preis des Aufenthalts berechnet.",
    unknown: "Es gelten die Stornierungsbedingungen Ihres Tarifs.",
    termsLink: "Stornierungsbedingungen ansehen",
    pageIntro: "Jeder Tarif auf unserer Website hat eine der folgenden Stornierungsbedingungen. Die Bedingung Ihres Tarifs sehen Sie vor der Zahlung, und sie steht noch einmal in Ihrer Buchungsbestätigung.",
    otherPlatformsTitle: "Buchungen über andere Plattformen",
    otherPlatformsBody: "Wenn Sie über Airbnb, Booking.com oder eine andere Plattform gebucht haben, gelten die Stornierungsbedingungen dieser Plattform, so wie sie Ihnen bei der Buchung angezeigt wurden.",
    question: "Wie lautet die Stornierungsrichtlinie?",
    summary: (list) => `Das hängt vom gewählten Tarif ab. Der nicht erstattbare Tarif wird bei einer Stornierung nicht erstattet. Erstattbare Tarife erlauben je nach Tarif eine kostenlose Stornierung bis ${list} Tage vor der Anreise; danach wird der volle Preis des Aufenthalts berechnet. Die Bedingung Ihres Tarifs sehen Sie vor der Zahlung und in Ihrer Buchungsbestätigung. Für Buchungen über andere Plattformen gelten die Bedingungen dieser Plattform.`,
    metaDescription: (list) => `Tarife von Portugal Active: nicht erstattbar oder bis ${list} Tage vor der Anreise kostenlos stornierbar; danach ist der volle Preis fällig.`,
    or: "oder",
  },
  it: {
    label: "Cancellazione",
    names: { non_refundable: "Non rimborsabile", moderate: "Moderata", firm: "Ferma", strict: "Rigida", strict_60: "Rigida 60" },
    nonRefundable: "Tariffa non rimborsabile: in caso di cancellazione non viene rimborsato nulla e viene addebitato il prezzo totale del soggiorno.",
    freeUntilDays: (n) => `Cancellazione gratuita fino a ${n} giorni prima dell'arrivo; dopo, viene addebitato il prezzo totale del soggiorno.`,
    freeUntilDate: (n, d) => `Cancellazione gratuita fino a ${n} giorni prima dell'arrivo (${d}); dopo, viene addebitato il prezzo totale del soggiorno.`,
    windowPassed: "Il periodo di cancellazione gratuita per queste date è terminato: in caso di cancellazione viene addebitato il prezzo totale del soggiorno.",
    unknown: "Si applicano le condizioni di cancellazione della sua tariffa.",
    termsLink: "Vedi le condizioni di cancellazione",
    pageIntro: "Ogni tariffa del nostro sito ha una delle politiche di cancellazione qui sotto. Vede la politica della sua tariffa prima di pagare, ed è ripetuta nella conferma della prenotazione.",
    otherPlatformsTitle: "Prenotazioni fatte su altre piattaforme",
    otherPlatformsBody: "Se ha prenotato su Airbnb, Booking.com o un'altra piattaforma, si applica la politica di cancellazione di quella piattaforma, come le è stata mostrata al momento della prenotazione.",
    question: "Qual è la politica di cancellazione?",
    summary: (list) => `Dipende dalla tariffa scelta. La tariffa non rimborsabile non viene rimborsata in caso di cancellazione. Le tariffe rimborsabili permettono di cancellare gratuitamente fino a ${list} giorni prima dell'arrivo, secondo la tariffa; dopo, viene addebitato il prezzo totale del soggiorno. La politica della sua tariffa è indicata prima di pagare e nella conferma della prenotazione. Le prenotazioni fatte su altre piattaforme seguono la politica di quella piattaforma.`,
    metaDescription: (list) => `Tariffe Portugal Active: non rimborsabili o con cancellazione gratuita fino a ${list} giorni prima dell'arrivo; dopo, si paga tutto il soggiorno.`,
    or: "o",
  },
  nl: {
    label: "Annulering",
    names: { non_refundable: "Niet-restitueerbaar", moderate: "Gematigd", firm: "Vast", strict: "Strikt", strict_60: "Strikt 60" },
    nonRefundable: "Niet-restitueerbaar tarief: bij annulering wordt niets terugbetaald en wordt de volledige prijs van het verblijf in rekening gebracht.",
    freeUntilDays: (n) => `Gratis annuleren tot ${n} dagen voor aankomst; daarna wordt de volledige prijs van het verblijf in rekening gebracht.`,
    freeUntilDate: (n, d) => `Gratis annuleren tot ${n} dagen voor aankomst (${d}); daarna wordt de volledige prijs van het verblijf in rekening gebracht.`,
    windowPassed: "De termijn voor gratis annuleren is voor deze data verstreken: bij annulering wordt de volledige prijs van het verblijf in rekening gebracht.",
    unknown: "De annuleringsvoorwaarden van uw tarief zijn van toepassing.",
    termsLink: "Bekijk de annuleringsvoorwaarden",
    pageIntro: "Elk tarief op onze website heeft een van de onderstaande annuleringsvoorwaarden. U ziet de voorwaarden van uw tarief voordat u betaalt, en ze staan ook in uw boekingsbevestiging.",
    otherPlatformsTitle: "Boekingen via andere platforms",
    otherPlatformsBody: "Heeft u geboekt via Airbnb, Booking.com of een ander platform, dan gelden de annuleringsvoorwaarden van dat platform, zoals ze bij het boeken werden getoond.",
    question: "Wat is het annuleringsbeleid?",
    summary: (list) => `Dat hangt af van het tarief dat u kiest. Het niet-restitueerbare tarief wordt bij annulering niet terugbetaald. Met restitueerbare tarieven annuleert u gratis tot ${list} dagen voor aankomst, afhankelijk van het tarief; daarna wordt de volledige prijs van het verblijf in rekening gebracht. De voorwaarden van uw tarief ziet u voordat u betaalt en in uw boekingsbevestiging. Boekingen via andere platforms volgen de voorwaarden van dat platform.`,
    metaDescription: (list) => `Tarieven van Portugal Active: niet-restitueerbaar of gratis annuleren tot ${list} dagen voor aankomst; daarna betaalt u het hele verblijf.`,
    or: "of",
  },
  sv: {
    label: "Avbokning",
    names: { non_refundable: "Ej återbetalningsbar", moderate: "Måttlig", firm: "Fast", strict: "Strikt", strict_60: "Strikt 60" },
    nonRefundable: "Ej återbetalningsbart pris: om du avbokar återbetalas ingenting och hela priset för vistelsen debiteras.",
    freeUntilDays: (n) => `Kostnadsfri avbokning fram till ${n} dagar före ankomst; därefter debiteras hela priset för vistelsen.`,
    freeUntilDate: (n, d) => `Kostnadsfri avbokning fram till ${n} dagar före ankomst (${d}); därefter debiteras hela priset för vistelsen.`,
    windowPassed: "Perioden för kostnadsfri avbokning har passerat för dessa datum: om du avbokar debiteras hela priset för vistelsen.",
    unknown: "Avbokningsvillkoren för ditt prisalternativ gäller.",
    termsLink: "Se avbokningsvillkoren",
    pageIntro: "Varje prisalternativ på vår webbplats har ett av avbokningsvillkoren nedan. Du ser villkoren för ditt prisalternativ innan du betalar, och de står även i bokningsbekräftelsen.",
    otherPlatformsTitle: "Bokningar via andra plattformar",
    otherPlatformsBody: "Om du bokade via Airbnb, Booking.com eller en annan plattform gäller den plattformens avbokningsvillkor, så som de visades när du bokade.",
    question: "Vad är avbokningspolicyn?",
    summary: (list) => `Det beror på vilket prisalternativ du väljer. Det ej återbetalningsbara priset återbetalas inte om du avbokar. Återbetalningsbara prisalternativ ger kostnadsfri avbokning fram till ${list} dagar före ankomst, beroende på prisalternativ; därefter debiteras hela priset för vistelsen. Villkoren för ditt prisalternativ visas innan du betalar och i bokningsbekräftelsen. Bokningar via andra plattformar följer den plattformens villkor.`,
    metaDescription: (list) => `Portugal Actives priser: ej återbetalningsbara eller kostnadsfri avbokning fram till ${list} dagar före ankomst; därefter debiteras allt.`,
    or: "eller",
  },
  fi: {
    label: "Peruutus",
    names: { non_refundable: "Ei palautettava", moderate: "Kohtuullinen", firm: "Kiinteä", strict: "Tiukka", strict_60: "Tiukka 60" },
    nonRefundable: "Hinta ei ole palautettava: jos peruutat, mitään ei palauteta ja koko oleskelun hinta veloitetaan.",
    freeUntilDays: (n) => `Maksuton peruutus ${n} päivää ennen saapumista asti; sen jälkeen koko oleskelun hinta veloitetaan.`,
    freeUntilDate: (n, d) => `Maksuton peruutus ${n} päivää ennen saapumista asti (${d}); sen jälkeen koko oleskelun hinta veloitetaan.`,
    windowPassed: "Maksuttoman peruutuksen aika on näiden päivien osalta päättynyt: jos peruutat, koko oleskelun hinta veloitetaan.",
    unknown: "Hintavaihtoehtosi peruutusehdot ovat voimassa.",
    termsLink: "Katso peruutusehdot",
    pageIntro: "Jokaisella verkkosivustomme hintavaihtoehdolla on jokin alla olevista peruutusehdoista. Näet hintavaihtoehtosi ehdot ennen maksamista, ja ne toistetaan varausvahvistuksessa.",
    otherPlatformsTitle: "Muilla alustoilla tehdyt varaukset",
    otherPlatformsBody: "Jos varasit Airbnb:n, Booking.comin tai muun alustan kautta, sovelletaan kyseisen alustan peruutusehtoja sellaisina kuin ne näytettiin varatessasi.",
    question: "Mikä on peruutuskäytäntö?",
    summary: (list) => `Se riippuu valitsemastasi hintavaihtoehdosta. Ei palautettavaa hintaa ei palauteta, jos peruutat. Palautettavissa hintavaihtoehdoissa voit peruuttaa maksutta ${list} päivää ennen saapumista asti hintavaihtoehdosta riippuen; sen jälkeen koko oleskelun hinta veloitetaan. Hintavaihtoehtosi ehdot näytetään ennen maksamista ja varausvahvistuksessa. Muilla alustoilla tehdyt varaukset noudattavat kyseisen alustan ehtoja.`,
    metaDescription: (list) => `Portugal Activen hinnat: ei palautettavia tai maksuton peruutus ${list} päivää ennen saapumista asti; sen jälkeen veloitetaan koko hinta.`,
    or: "tai",
  },
};

export function cancellationPolicyCopy(lang?: string | null): PolicyCopy {
  return COPY[policyLang(lang)];
}

/** "7, 14, 30 or 60" in the language (from the table above, never typed). */
function daysList(lang: PolicyLang): string {
  const days = Object.values(FREE_CANCELLATION_DAYS).sort((a, b) => a - b).map(String);
  if (days.length < 2) return days.join("");
  return `${days.slice(0, -1).join(", ")} ${COPY[lang].or} ${days[days.length - 1]}`;
}

/** The one-paragraph answer used by the FAQ, the terms and the PDP. */
export function cancellationPolicySummary(lang?: string | null): string {
  const l = policyLang(lang);
  return COPY[l].summary(daysList(l));
}

/** Meta description of /legal/cancellation-policy. */
export function cancellationPolicyMetaDescription(lang?: string | null): string {
  const l = policyLang(lang);
  return COPY[l].metaDescription(daysList(l));
}

/** The rule of a known code, without dates — the legal page's sentence. */
export function policyRuleSentence(code: PolicyCode, lang?: string | null): string {
  const c = COPY[policyLang(lang)];
  if (code === "non_refundable") return c.nonRefundable;
  return c.freeUntilDays(FREE_CANCELLATION_DAYS[code]);
}

const INTL_TAG: Record<PolicyLang, string> = {
  en: "en-GB", pt: "pt-PT", es: "es-ES", fr: "fr-FR", de: "de-DE",
  it: "it-IT", nl: "nl-NL", sv: "sv-SE", fi: "fi-FI",
};

function defaultFormatDate(ymd: string, lang: PolicyLang): string {
  try {
    return new Intl.DateTimeFormat(INTL_TAG[lang], {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${ymd}T12:00:00Z`));
  } catch {
    return ymd;
  }
}

export interface CancellationDescription {
  /** The policy, or null when Guesty's code is missing or unknown. */
  code: PolicyCode | null;
  /** false → the text is the "terms of your rate" fallback: link to the terms. */
  known: boolean;
  text: string;
  /** Last free-cancellation day (YYYY-MM-DD), when there still is one. */
  deadline: string | null;
}

/**
 * The sentence a guest reads for one rate: the rule of Guesty's code, with
 * the concrete date when the arrival is known ("until 7 days before arrival
 * (3 March 2027)" — the day count is Guesty's own rule, the date only helps).
 * Unknown code → "the cancellation terms of your rate" (never an invented
 * rule, and never Guesty's internal plan name: "Reembolsável Star Low 26/27"
 * is a tier and a season, not something a guest should read).
 *
 * Pass `planPolicyCode(plan)` when the plan is at hand, so every place shows
 * the same policy for the same plan.
 */
export function describeCancellationPolicy(
  raw: unknown,
  opts: {
    lang?: string | null;
    checkIn?: string | null;
    formatDate?: (ymd: string) => string;
    today?: string;
  } = {},
): CancellationDescription {
  const lang = policyLang(opts.lang);
  const c = COPY[lang];
  const code = normalizePolicyCode(raw);
  if (!code) {
    return { code: null, known: false, text: c.unknown, deadline: null };
  }
  if (code === "non_refundable") {
    return { code, known: true, text: c.nonRefundable, deadline: null };
  }
  const days = FREE_CANCELLATION_DAYS[code];
  const arrival = (opts.checkIn || "").slice(0, 10);
  if (!isYmd(arrival)) {
    return { code, known: true, text: c.freeUntilDays(days), deadline: null };
  }
  const deadline = freeCancellationDeadline(code, arrival, opts.today ?? lisbonToday());
  if (!deadline) return { code, known: true, text: c.windowPassed, deadline: null };
  const fmt = opts.formatDate ?? ((ymd: string) => defaultFormatDate(ymd, lang));
  return { code, known: true, text: c.freeUntilDate(days, fmt(deadline)), deadline };
}

/** Path of the policy page (with the section of a known code). */
export function cancellationPolicyPath(lang?: string | null, raw?: unknown): string {
  const code = normalizePolicyCode(raw);
  const base = `/${policyLang(lang)}/legal/cancellation-policy`;
  return code ? `${base}#${POLICY_ANCHORS[code]}` : base;
}
