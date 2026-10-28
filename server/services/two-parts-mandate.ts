/**
 * Pagamento em duas partes: o texto do mandato que o hóspede aceita junto ao
 * botão de pagar, e as versões dos consentimentos que ficam registadas.
 * Texto e porquês em docs/pagamento_duas_partes.md (secção 6.2).
 *
 * O mandato é a prova da segunda cobrança: é uma cobrança sem o hóspede
 * presente (MIT, sem 3DS), por isso uma disputa decide-se pelo que ele
 * autorizou, com montante, data, retentativas e prazo exatos. Por isso:
 * - o texto é renderizado aqui, no servidor, a partir dos mesmos instantes
 *   que o motor vai usar (twoPartsInstants), e não montado no browser;
 * - o hash (sha256 da versão, língua, caixa e parágrafo) fica em
 *   checkout_card_mandates.mandate_text_hash; voltar a renderizar com a
 *   mesma versão e os mesmos valores tem de dar exatamente os mesmos bytes;
 * - mudar uma vírgula do texto, em qualquer língua, obriga a nova
 *   TWO_PARTS_MANDATE_VERSION (o teste com o texto fixo apanha a mudança).
 *
 * Línguas: pt-PT (o texto validado pelo André Feiteiro), inglês e, desde a
 * v2 (28 out 2026), FR/ES/IT/DE/NL/SV/FI. As sete traduções estão POR REVER
 * por nativos (obrigatório em DE, FR e NL antes de ligar as duas partes); a
 * v2 também tirou o "e SMS" (decisão do Ricardo: avisos só por email).
 */
import { createHash } from "crypto";
import { TWO_PARTS_RULES } from "./payment-plan";

/** Versão do texto do mandato (caixa + parágrafo, pt e en). */
export const TWO_PARTS_MANDATE_VERSION = "2026-10-28.v2";

/**
 * Versão da declaração de execução imediata do Flex
 * (`checkout.flex.immediateConsent`, spec 4.2 e 6.4): "Ao adicionar o Flex
 * concordo que a proteção começa de imediato e reconheço que, por isso, não
 * há direito de livre resolução." Sem este consentimento expresso o hóspede
 * mantinha os 14 dias de livre resolução sobre o Flex (DL 24/2014 art. 17.º
 * n.º 1 a)). Fica em booking_intents.flex_consent_version, ao lado de
 * flex_immediate_consent_at; muda quando a frase mudar em qualquer língua.
 */
export const FLEX_IMMEDIATE_CONSENT_VERSION = "2026-10-27.v1";

export type MandateLang = "pt" | "en" | "fr" | "es" | "it" | "de" | "nl" | "sv" | "fi";
const MANDATE_LANGS: readonly MandateLang[] = ["pt", "en", "fr", "es", "it", "de", "nl", "sv", "fi"];

export interface MandateValues {
  /** A segunda parte, ao cêntimo (TwoPartsSplit.balanceCents). */
  amountLaterCents: number;
  /** C: a segunda cobrança (10:00 de Lisboa). */
  chargeAt: Date;
  /** Retentativas automáticas, por ordem (só recusas soft). */
  retryAt: Date[];
  /** D: fim do cancelamento gratuito (23:59 de Lisboa). */
  freeCancelDeadlineAt: Date;
}

export interface TwoPartsMandateText {
  lang: MandateLang;
  /** A frase da caixa, não pré-marcada. */
  checkbox: string;
  /** O parágrafo por baixo da caixa (`payment.mandate`). */
  text: string;
  version: string;
  /** sha256 hex de `${version}\n${lang}\n${checkbox}\n${text}`. */
  hash: string;
}

interface MandateSlots {
  amountLater: string;
  date: string;
  retries: string;
  deadline: string;
  noticeDays: number;
}

/**
 * O texto, por língua. pt-PT é o da spec 6.2, palavra por palavra; o inglês
 * é a tradução fiel, na voz inglesa do site (britânico: "authorise").
 * Alterar qualquer uma destas frases = nova TWO_PARTS_MANDATE_VERSION.
 */
const TEMPLATES: Record<MandateLang, { checkbox: (s: MandateSlots) => string; text: (s: MandateSlots) => string }> = {
  pt: {
    checkbox: (s) =>
      `Autorizo a Portugal Active a cobrar ${s.amountLater} a ${s.date} no cartão que uso agora, ` +
      `como segunda e última parte desta estadia, e, se essa cobrança for recusada, ` +
      `a tentar de novo o mesmo valor até ${s.deadline}.`,
    text: (s) =>
      `Ao pagar, autoriza a Portugal Active a cobrar ${s.amountLater} a ${s.date}, no cartão que usar agora, ` +
      `como segunda e última parte desta estadia. Se a cobrança for recusada, avisamos por email, ` +
      `tentamos de novo o mesmo valor em ${s.retries}, e tem ${s.noticeDays} dias, contados do aviso, ` +
      `para pagar por outro meio; caso contrário a reserva é cancelada e devolvemos tudo o que pagou. ` +
      `Pode pagar antes, mudar de cartão ou cancelar a qualquer momento, no link da sua confirmação. ` +
      `Cancelamento gratuito até ${s.deadline}.`,
  },
  en: {
    checkbox: (s) =>
      `I authorise Portugal Active to charge ${s.amountLater} on ${s.date} to the card I am using now, ` +
      `as the second and final part of this stay, and, if that charge is declined, ` +
      `to retry the same amount until ${s.deadline}.`,
    text: (s) =>
      `By paying, you authorise Portugal Active to charge ${s.amountLater} on ${s.date} to the card you are using now, ` +
      `as the second and final part of this stay. If the charge is declined, we will let you know by email, ` +
      `retry the same amount on ${s.retries}, and you will have ${s.noticeDays} days from that notice ` +
      `to pay by another method; otherwise the booking is cancelled and we refund everything you paid. ` +
      `You can pay early, change your card or cancel at any time, using the link in your confirmation. ` +
      `Free cancellation until ${s.deadline}.`,
  },
  fr: {
    checkbox: (s) =>
      `J'autorise Portugal Active à débiter ${s.amountLater} le ${s.date} sur la carte que j'utilise maintenant, ` +
      `comme deuxième et dernière partie de ce séjour, et, si ce débit est refusé, ` +
      `à retenter le même montant jusqu'au ${s.deadline}.`,
    text: (s) =>
      `En payant, vous autorisez Portugal Active à débiter ${s.amountLater} le ${s.date} sur la carte que vous utilisez maintenant, ` +
      `comme deuxième et dernière partie de ce séjour. Si le débit est refusé, nous vous prévenons par e-mail, ` +
      `nous retentons le même montant le ${s.retries}, et vous disposez de ${s.noticeDays} jours à compter de cet avis ` +
      `pour payer par un autre moyen ; à défaut, la réservation est annulée et nous remboursons tout ce que vous avez payé. ` +
      `Vous pouvez payer plus tôt, changer de carte ou annuler à tout moment, via le lien de votre confirmation. ` +
      `Annulation gratuite jusqu'au ${s.deadline}.`,
  },
  es: {
    checkbox: (s) =>
      `Autorizo a Portugal Active a cobrar ${s.amountLater} el ${s.date} en la tarjeta que uso ahora, ` +
      `como segunda y última parte de esta estancia y, si ese cobro es rechazado, ` +
      `a intentar de nuevo el mismo importe hasta el ${s.deadline}.`,
    text: (s) =>
      `Al pagar, autoriza a Portugal Active a cobrar ${s.amountLater} el ${s.date} en la tarjeta que usa ahora, ` +
      `como segunda y última parte de esta estancia. Si el cobro es rechazado, le avisamos por email, ` +
      `intentamos de nuevo el mismo importe el ${s.retries}, y tiene ${s.noticeDays} días, contados desde el aviso, ` +
      `para pagar por otro medio; de lo contrario, la reserva se cancela y le devolvemos todo lo que pagó. ` +
      `Puede pagar antes, cambiar de tarjeta o cancelar en cualquier momento, en el enlace de su confirmación. ` +
      `Cancelación gratuita hasta el ${s.deadline}.`,
  },
  it: {
    checkbox: (s) =>
      `Autorizzo Portugal Active ad addebitare ${s.amountLater} il ${s.date} sulla carta che uso ora, ` +
      `come seconda e ultima parte di questo soggiorno e, se l'addebito viene rifiutato, ` +
      `a riprovare lo stesso importo fino al giorno ${s.deadline}.`,
    text: (s) =>
      `Pagando, autorizza Portugal Active ad addebitare ${s.amountLater} il ${s.date} sulla carta che usa ora, ` +
      `come seconda e ultima parte di questo soggiorno. Se l'addebito viene rifiutato, la avvisiamo via email, ` +
      `riproviamo lo stesso importo il ${s.retries}, e ha ${s.noticeDays} giorni dall'avviso ` +
      `per pagare con un altro metodo; altrimenti la prenotazione viene annullata e le rimborsiamo tutto quanto pagato. ` +
      `Può pagare prima, cambiare carta o annullare in qualsiasi momento, dal link nella sua conferma. ` +
      `Cancellazione gratuita fino al giorno ${s.deadline}.`,
  },
  de: {
    checkbox: (s) =>
      `Ich ermächtige Portugal Active, am ${s.date} ${s.amountLater} von der Karte abzubuchen, die ich jetzt verwende, ` +
      `als zweiten und letzten Teil dieses Aufenthalts, und, falls diese Abbuchung abgelehnt wird, ` +
      `denselben Betrag bis ${s.deadline} erneut zu versuchen.`,
    text: (s) =>
      `Mit Ihrer Zahlung ermächtigen Sie Portugal Active, am ${s.date} ${s.amountLater} von der Karte abzubuchen, die Sie jetzt verwenden, ` +
      `als zweiten und letzten Teil dieses Aufenthalts. Wird die Abbuchung abgelehnt, informieren wir Sie per E-Mail, ` +
      `versuchen denselben Betrag am ${s.retries} erneut, und Sie haben ab dieser Mitteilung ${s.noticeDays} Tage Zeit, ` +
      `auf anderem Weg zu zahlen; andernfalls wird die Buchung storniert und wir erstatten alles, was Sie gezahlt haben. ` +
      `Sie können jederzeit früher zahlen, die Karte wechseln oder stornieren, über den Link in Ihrer Bestätigung. ` +
      `Kostenlose Stornierung bis ${s.deadline}.`,
  },
  nl: {
    checkbox: (s) =>
      `Ik machtig Portugal Active om op ${s.date} ${s.amountLater} af te schrijven van de kaart die ik nu gebruik, ` +
      `als tweede en laatste deel van dit verblijf, en, als die afschrijving wordt geweigerd, ` +
      `hetzelfde bedrag opnieuw te proberen tot ${s.deadline}.`,
    text: (s) =>
      `Door te betalen machtigt u Portugal Active om op ${s.date} ${s.amountLater} af te schrijven van de kaart die u nu gebruikt, ` +
      `als tweede en laatste deel van dit verblijf. Wordt de afschrijving geweigerd, dan laten we het u per e-mail weten, ` +
      `proberen we hetzelfde bedrag opnieuw op ${s.retries}, en heeft u ${s.noticeDays} dagen vanaf dat bericht ` +
      `om op een andere manier te betalen; anders wordt de boeking geannuleerd en betalen we alles terug wat u heeft betaald. ` +
      `U kunt op elk moment eerder betalen, van kaart wisselen of annuleren, via de link in uw bevestiging. ` +
      `Gratis annuleren tot ${s.deadline}.`,
  },
  sv: {
    checkbox: (s) =>
      `Jag godkänner att Portugal Active debiterar ${s.amountLater} den ${s.date} på det kort jag använder nu, ` +
      `som andra och sista delen av denna vistelse, och, om den debiteringen nekas, ` +
      `försöker igen med samma belopp fram till ${s.deadline}.`,
    text: (s) =>
      `Genom att betala godkänner du att Portugal Active debiterar ${s.amountLater} den ${s.date} på det kort du använder nu, ` +
      `som andra och sista delen av denna vistelse. Om debiteringen nekas meddelar vi dig via e-post, ` +
      `försöker igen med samma belopp den ${s.retries}, och du har ${s.noticeDays} dagar från meddelandet ` +
      `att betala på annat sätt; annars avbokas bokningen och vi återbetalar allt du har betalat. ` +
      `Du kan när som helst betala tidigare, byta kort eller avboka via länken i din bekräftelse. ` +
      `Kostnadsfri avbokning fram till ${s.deadline}.`,
  },
  fi: {
    checkbox: (s) =>
      `Valtuutan Portugal Activen veloittamaan ${s.amountLater} ${s.date} kortilta, jota käytän nyt, ` +
      `tämän majoituksen toisena ja viimeisenä osana, ja jos veloitus hylätään, ` +
      `yrittämään samaa summaa uudelleen ${s.deadline} asti.`,
    text: (s) =>
      `Maksamalla valtuutat Portugal Activen veloittamaan ${s.amountLater} ${s.date} kortilta, jota käytät nyt, ` +
      `tämän majoituksen toisena ja viimeisenä osana. Jos veloitus hylätään, ilmoitamme sinulle sähköpostitse, ` +
      `yritämme samaa summaa uudelleen ${s.retries}, ja sinulla on ${s.noticeDays} päivää ilmoituksesta ` +
      `maksaa muulla tavalla; muuten varaus perutaan ja palautamme kaiken maksamasi. ` +
      `Voit milloin tahansa maksaa aiemmin, vaihtaa korttia tai peruuttaa vahvistuksesi linkin kautta. ` +
      `Maksuton peruutus ${s.deadline} asti.`,
  },
};

const INTL_TAG: Record<MandateLang, string> = {
  pt: "pt-PT", en: "en-GB", fr: "fr-FR", es: "es-ES", it: "it-IT", de: "de-DE", nl: "nl-NL", sv: "sv-SE", fi: "fi-FI",
};

/** Língua do mandato: a do hóspede, se for uma das 9 do site; senão inglês. */
function mandateLang(lang: string | null | undefined): MandateLang {
  const l = String(lang ?? "").trim().toLowerCase().slice(0, 2) as MandateLang;
  return MANDATE_LANGS.includes(l) ? l : "en";
}

/**
 * Espaços do ICU normalizados para um só caráter. O ICU já mudou espaços
 * entre versões (o fr-FR passou a espaço fino, o en-US pôs U+202F antes de
 * "AM"); como o hash é a prova do texto aceite, um Node novo não pode
 * produzir bytes diferentes para o mesmo mandato.
 */
function normalizeSpaces(s: string, to: string): string {
  return s.replace(/[\s\u00a0\u202f]+/g, to);
}

/**
 * Montante sempre com cêntimos e com separador de milhares, também em pt
 * ("1 262,00 €"; o pt-PT do ICU não agrupa números de 4 algarismos por
 * omissão). No mandato o valor é exato: fixar o montante é o que afasta o
 * reembolso em 8 semanas (RJSPME arts. 117.º e 118.º). Espaço não separável,
 * para o valor nunca partir a meio na linha.
 */
function formatAmount(cents: number, lang: MandateLang): string {
  const s = new Intl.NumberFormat(INTL_TAG[lang], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: "always",
  }).format(cents / 100);
  return normalizeSpaces(s, "\u00a0");
}

/** Dia no calendário de Lisboa, onde estão todas as casas: "28 de junho de 2027" / "28 June 2027". */
function formatDay(at: Date, lang: MandateLang): string {
  const s = new Intl.DateTimeFormat(INTL_TAG[lang], {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  }).format(at);
  return normalizeSpaces(s, " ");
}

/**
 * Prazo com dia e hora de Lisboa (a Visa exige data e hora da política):
 * "8 de julho de 2027 às 23:59 (hora de Lisboa)" / "8 July 2027 at 23:59
 * (Lisbon time)". A hora é lida do instante, não escrita à mão, para o texto
 * dizer sempre o que o motor aplica.
 */
function formatDeadline(at: Date, lang: MandateLang): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Europe/Lisbon",
  }).format(at);
  const day = formatDay(at, lang);
  switch (lang) {
    case "pt": return `${day} ${time.startsWith("01:") ? "à" : "às"} ${time} (hora de Lisboa)`;
    case "fr": return `${day} à ${time} (heure de Lisbonne)`;
    case "es": return `${day} a las ${time} (hora de Lisboa)`;
    case "it": return `${day} alle ${time} (ora di Lisbona)`;
    case "de": return `${day} um ${time} Uhr (Lissabonner Zeit)`;
    case "nl": return `${day} om ${time} (Lissabonse tijd)`;
    case "sv": return `${day} kl. ${time} (Lissabontid)`;
    case "fi": return `${day} klo ${time} (Lissabonin aikaa)`;
    default: return `${day} at ${time} (Lisbon time)`;
  }
}

/** "A e B", "A, B e C" / "A and B" (sem vírgula de Oxford, como no inglês britânico). */
function joinList(items: string[], lang: MandateLang): string {
  if (items.length < 2) return items.join("");
  const AND: Record<MandateLang, string> = { pt: "e", en: "and", fr: "et", es: "y", it: "e", de: "und", nl: "en", sv: "och", fi: "ja" };
  const and = AND[lang];
  return `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;
}

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

/**
 * Valores incoerentes dariam um mandato que promete o que o motor não faz
 * (retentar antes de cobrar, cobrar depois do prazo). Melhor falhar o
 * checkout em duas partes do que registar essa prova.
 */
function assertMandateValues(v: MandateValues): void {
  if (!Number.isSafeInteger(v.amountLaterCents) || v.amountLaterCents <= 0) {
    throw new Error(`mandato: montante inválido (${v.amountLaterCents})`);
  }
  if (!isValidDate(v.chargeAt)) throw new Error("mandato: data da segunda cobrança inválida");
  if (!isValidDate(v.freeCancelDeadlineAt)) throw new Error("mandato: prazo de cancelamento inválido");
  if (!Array.isArray(v.retryAt) || v.retryAt.length === 0) {
    // O texto promete retentativas; sem elas a frase seria falsa.
    throw new Error("mandato: sem retentativas");
  }
  let prev = v.chargeAt.getTime();
  for (const r of v.retryAt) {
    if (!isValidDate(r)) throw new Error("mandato: data de retentativa inválida");
    if (r.getTime() <= prev) throw new Error("mandato: retentativas fora de ordem ou antes da cobrança");
    prev = r.getTime();
  }
  if (v.freeCancelDeadlineAt.getTime() <= prev) {
    throw new Error("mandato: o prazo de cancelamento tem de ser depois da cobrança e das retentativas");
  }
}

export function renderTwoPartsMandate(lang: string | null | undefined, v: MandateValues): TwoPartsMandateText {
  assertMandateValues(v);
  const l = mandateLang(lang);
  const slots: MandateSlots = {
    amountLater: formatAmount(v.amountLaterCents, l),
    date: formatDay(v.chargeAt, l),
    retries: joinList(v.retryAt.map((r) => formatDay(r, l)), l),
    deadline: formatDeadline(v.freeCancelDeadlineAt, l),
    noticeDays: TWO_PARTS_RULES.noticeDays,
  };
  const checkbox = TEMPLATES[l].checkbox(slots);
  const text = TEMPLATES[l].text(slots);
  const version = TWO_PARTS_MANDATE_VERSION;
  const hash = createHash("sha256").update(`${version}\n${l}\n${checkbox}\n${text}`, "utf8").digest("hex");
  return { lang: l, checkbox, text, version, hash };
}

/* ════════════════════════════════════════════════════════════════
   Fase 2b: autorização de um cartão novo (página do saldo, spec 4.2
   `payPlanPage.changeCardConsent`). Mesmas regras do mandato do checkout:
   texto renderizado aqui, hash do que o hóspede viu, versão própria.
   ════════════════════════════════════════════════════════════════ */

export const CARD_CHANGE_MANDATE_VERSION = "2026-10-28.v2";

const CARD_CHANGE_TEMPLATES: Record<MandateLang, (s: { amountLater: string; date: string; deadline: string }) => string> = {
  pt: (s) =>
    `Autorizo a Portugal Active a cobrar ${s.amountLater} ${s.date} neste novo cartão, como segunda e última parte desta estadia, ` +
    `com novas tentativas do mesmo valor até ${s.deadline} se for recusada.`,
  en: (s) =>
    `I authorise Portugal Active to charge ${s.amountLater} ${s.date} to this new card, as the second and final part of this stay, ` +
    `with retries of the same amount until ${s.deadline} if it is declined.`,
  fr: (s) =>
    `J'autorise Portugal Active à débiter ${s.amountLater} ${s.date} sur cette nouvelle carte, comme deuxième et dernière partie de ce séjour, ` +
    `avec de nouvelles tentatives du même montant jusqu'au ${s.deadline} en cas de refus.`,
  es: (s) =>
    `Autorizo a Portugal Active a cobrar ${s.amountLater} ${s.date} en esta nueva tarjeta, como segunda y última parte de esta estancia, ` +
    `con nuevos intentos del mismo importe hasta el ${s.deadline} si es rechazado.`,
  it: (s) =>
    `Autorizzo Portugal Active ad addebitare ${s.amountLater} ${s.date} su questa nuova carta, come seconda e ultima parte di questo soggiorno, ` +
    `con nuovi tentativi dello stesso importo fino al giorno ${s.deadline} se viene rifiutato.`,
  de: (s) =>
    `Ich ermächtige Portugal Active, ${s.date} ${s.amountLater} von dieser neuen Karte abzubuchen, als zweiten und letzten Teil dieses Aufenthalts, ` +
    `mit erneuten Versuchen desselben Betrags bis ${s.deadline}, falls sie abgelehnt wird.`,
  nl: (s) =>
    `Ik machtig Portugal Active om ${s.date} ${s.amountLater} af te schrijven van deze nieuwe kaart, als tweede en laatste deel van dit verblijf, ` +
    `met nieuwe pogingen voor hetzelfde bedrag tot ${s.deadline} als die wordt geweigerd.`,
  sv: (s) =>
    `Jag godkänner att Portugal Active debiterar ${s.amountLater} ${s.date} på detta nya kort, som andra och sista delen av denna vistelse, ` +
    `med nya försök med samma belopp fram till ${s.deadline} om den nekas.`,
  fi: (s) =>
    `Valtuutan Portugal Activen veloittamaan ${s.amountLater} ${s.date} tältä uudelta kortilta tämän majoituksen toisena ja viimeisenä osana, ` +
    `ja yrittämään samaa summaa uudelleen ${s.deadline} asti, jos veloitus hylätään.`,
};

/** "a 28 de junho" / "hoje" na língua do mandato (cartão novo). */
const CARD_CHANGE_DATE: Record<MandateLang, { on: (d: string) => string; today: string }> = {
  pt: { on: (d) => `a ${d}`, today: "hoje" },
  en: { on: (d) => `on ${d}`, today: "today" },
  fr: { on: (d) => `le ${d}`, today: "aujourd'hui" },
  es: { on: (d) => `el ${d}`, today: "hoy" },
  it: { on: (d) => `il ${d}`, today: "oggi" },
  de: { on: (d) => `am ${d}`, today: "heute" },
  nl: { on: (d) => `op ${d}`, today: "vandaag" },
  sv: { on: (d) => `den ${d}`, today: "i dag" },
  fi: { on: (d) => d, today: "tänään" },
};

/**
 * Texto da autorização de um cartão novo. Se a data da 2.ª cobrança já
 * passou (a cobrança falhou e o hóspede troca de cartão para pagar), o texto
 * diz "hoje" em vez de uma data no passado: a autorização tem de ser verdade.
 */
export function renderCardChangeMandate(
  lang: string | null | undefined,
  v: { amountLaterCents: number; chargeAt: Date; freeCancelDeadlineAt: Date; now?: Date },
): { lang: MandateLang; text: string; version: string; hash: string } {
  if (!Number.isSafeInteger(v.amountLaterCents) || v.amountLaterCents <= 0) {
    throw new Error(`mandato (cartão novo): montante inválido (${v.amountLaterCents})`);
  }
  if (!isValidDate(v.chargeAt) || !isValidDate(v.freeCancelDeadlineAt)) throw new Error("mandato (cartão novo): datas inválidas");
  const l = mandateLang(lang);
  const now = v.now ?? new Date();
  const future = v.chargeAt.getTime() > now.getTime();
  const date = future ? CARD_CHANGE_DATE[l].on(formatDay(v.chargeAt, l)) : CARD_CHANGE_DATE[l].today;
  const text = CARD_CHANGE_TEMPLATES[l]({
    amountLater: formatAmount(v.amountLaterCents, l),
    date,
    deadline: formatDeadline(v.freeCancelDeadlineAt, l),
  });
  const version = CARD_CHANGE_MANDATE_VERSION;
  const hash = createHash("sha256").update(`${version}\n${l}\ncard_change\n${text}`, "utf8").digest("hex");
  return { lang: l, text, version, hash };
}
