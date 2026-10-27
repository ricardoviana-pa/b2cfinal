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
 * Línguas: pt-PT (o texto validado pelo André Feiteiro) e inglês. As outras
 * sete caem para inglês até à tradução revista da Fase 3 (revisão nativa
 * obrigatória em DE, FR e NL), porque um mandato mal traduzido é pior do
 * que um mandato em inglês.
 */
import { createHash } from "crypto";
import { TWO_PARTS_RULES } from "./payment-plan";

/** Versão do texto do mandato (caixa + parágrafo, pt e en). */
export const TWO_PARTS_MANDATE_VERSION = "2026-10-27.v1";

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

export type MandateLang = "pt" | "en";

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
      `como segunda e última parte desta estadia. Se a cobrança for recusada, avisamos por email e SMS, ` +
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
      `as the second and final part of this stay. If the charge is declined, we will let you know by email and SMS, ` +
      `retry the same amount on ${s.retries}, and you will have ${s.noticeDays} days from that notice ` +
      `to pay by another method; otherwise the booking is cancelled and we refund everything you paid. ` +
      `You can pay early, change your card or cancel at any time, using the link in your confirmation. ` +
      `Free cancellation until ${s.deadline}.`,
  },
};

const INTL_TAG: Record<MandateLang, string> = { pt: "pt-PT", en: "en-GB" };

/** Língua do mandato: pt para qualquer variante de português, inglês para o resto. */
function mandateLang(lang: string | null | undefined): MandateLang {
  return String(lang ?? "").trim().toLowerCase().slice(0, 2) === "pt" ? "pt" : "en";
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
  if (lang === "pt") return `${day} ${time.startsWith("01:") ? "à" : "às"} ${time} (hora de Lisboa)`;
  return `${day} at ${time} (Lisbon time)`;
}

/** "A e B", "A, B e C" / "A and B" (sem vírgula de Oxford, como no inglês britânico). */
function joinList(items: string[], lang: MandateLang): string {
  if (items.length < 2) return items.join("");
  const and = lang === "pt" ? "e" : "and";
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
