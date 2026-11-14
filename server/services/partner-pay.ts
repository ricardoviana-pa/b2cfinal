/**
 * Casas parceiras (Tripwix): retenção de 100% da estadia no cartão, no
 * momento do pedido, e cobrança só quando a casa confirma.
 *
 * Porquê (13 nov 2026): a Tripwix confirma cada estadia em até 48 h. O site
 * só guardava um pedido, sem pagamento, e o hóspede ia-se embora enquanto se
 * esperava. Temos o preço e o calendário e ~90% dos pedidos confirmam.
 *
 * Retenção e não cobrança (decisão do Ricardo, 13 nov 2026): o valor fica
 * congelado no cartão (capture_method manual). Se a casa confirma, captura-se
 * no Dashboard do Stripe e só aí há comissão; se não confirma, cancela-se e
 * não se paga nada. Uma cobrança devolvida perdia a comissão do Stripe.
 * A retenção dura poucos dias (Visa ~5, os outros ~7): HOLD_DAYS é o prazo
 * que se diz à equipa.
 *
 * Estados do pedido (metadata.payment): started → held → paid, ou
 * held → released; depois de pago, partially_refunded / refunded.
 *
 * Como funciona:
 * - O painel da casa parceira, quando a estadia é cobrável, abre uma sessão
 *   do Stripe Checkout (página do Stripe: cartão, Apple Pay, Google Pay, 3DS)
 *   com o total que o hóspede viu. O servidor volta a cotar antes de cobrar:
 *   nunca se cobra um valor diferente do que estava no ecrã.
 * - O pedido fica guardado nos leads como sempre (source partner-home-request),
 *   com o estado do pagamento no metadata: started → paid → refunded.
 * - A captura, o cancelamento e a devolução fazem-se no Dashboard do Stripe.
 *   O webhook do cartão (payment_intent.amount_capturable_updated, .succeeded,
 *   .canceled, charge.refunded) atualiza o pedido e envia os emails; uma
 *   passagem de 5 em 5 minutos faz o mesmo se um evento não chegar. Nada aqui
 *   captura, cancela ou devolve dinheiro por conta própria.
 * - Nada toca no Guesty nem no checkout das nossas casas: o PI leva
 *   metadata.flow = "partner_pay" e os outros fluxos ignoram-no.
 *
 * Ligado por omissão; PARTNER_PAY=false desliga. Com a flag desligada, ou numa
 * estadia que o servidor não consegue cotar com confiança, o painel continua
 * a ser o pedido sem pagamento.
 *
 * O que NÃO está aqui (v1): Klarna/PayPal, duas partes, e a confirmação ao
 * hóspede com os detalhes da estadia (a equipa escreve-a, como hoje).
 */
import { isPartnerHome } from "../../shared/partnerHome";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type Stripe from "stripe";
import * as db from "../db";
import { isPreviewDeployment } from "../lib/preview-isolation";
import { getPropertiesForSite, partnerSupplierReference } from "./properties-store";
import { getPartnerQuote, partnerFeesOf, type PartnerQuote } from "./tripwix";

export const PARTNER_PAY_FLOW = "partner_pay";
/** Um calendário lido há mais do que isto não chega para cobrar (serve para mostrar preço, até 48 h). */
export const PAYABLE_MAX_AGE_MS = 6 * 3_600_000;
/** O Stripe Checkout não aceita sessões com menos de 30 minutos. */
const SESSION_TTL_SECONDS = 31 * 60;
/** Teto do Stripe por cobrança em EUR (999 999,99). */
const MAX_CHARGE_EUR = 999_999;

/** Dias que a equipa tem para capturar ou cancelar (a Visa garante a retenção online ~5 dias). */
export const HOLD_DAYS = 4;

export type PartnerPaymentState = "started" | "held" | "paid" | "released" | "expired" | "partially_refunded" | "refunded";
/** Dinheiro do hóspede comprometido com estas noites: retido ou já cobrado. */
const committed = (payment?: string) => payment === "held" || payment === "paid";

/** A chave secreta em uso. Num preview só serve uma chave de teste: nunca dinheiro real fora de produção. */
function stripeKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (isPreviewDeployment(env) && !key.startsWith("sk_test_")) return null;
  return key;
}

/**
 * Ligado por omissão desde 13 nov 2026 (decisão do Ricardo: "é para ligar já
 * hoje"). PARTNER_PAY=false no Render desliga sem deploy de código: o painel
 * volta a ser o pedido sem pagamento.
 */
export function partnerPayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PARTNER_PAY !== "false" && !!stripeKey(env);
}

async function stripeClient(): Promise<Stripe> {
  const key = stripeKey();
  if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PARTNER_PAY_OFF" });
  const StripeCtor = (await import("stripe")).default;
  return new StripeCtor(key);
}

/** A estadia pode ser cobrada já: livre, com preço em todas as noites, lida há pouco. */
export function partnerQuotePayable(quote: PartnerQuote | null | undefined, now = Date.now(), env: NodeJS.ProcessEnv = process.env): boolean {
  if (!partnerPayEnabled(env) || !quote || !quote.available) return false;
  if (!(quote.total > 0) || quote.total > MAX_CHARGE_EUR) return false;
  if (!quote.fetchedAt || now - quote.fetchedAt > PAYABLE_MAX_AGE_MS) return false;
  return true;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const payInput = z.object({
  email: z.string().email().max(320),
  name: z.string().trim().min(1).max(255),
  phone: z.string().max(50).optional(),
  message: z.string().max(5000).optional(),
  property: z.string().min(1).max(200),
  checkin: z.string().regex(YMD),
  checkout: z.string().regex(YMD),
  guests: z.coerce.number().int().min(1).max(100),
  /** O total que o hóspede tem no ecrã. Diferente do do servidor → não se cobra. */
  shownTotal: z.number().positive().max(MAX_CHARGE_EUR),
  locale: z.string().max(10).optional(),
  /** Caminho da página da casa, para o regresso do Stripe. */
  returnPath: z.string().max(300).regex(/^\/(?!\/)[A-Za-z0-9/_\-.]*$/),
});
export type PartnerPayInput = z.input<typeof payInput>;

const realDate = (v: string) => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const cents = (eur: number) => Math.round(eur * 100);

function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.SITE_URL || env.PUBLIC_BASE_URL || env.PUBLIC_URL || env.APP_URL || "";
  try { return new URL(configured).origin; } catch { return "https://www.portugalactive.com"; }
}

/** Línguas do site que o Stripe Checkout fala; o resto fica em "auto" (língua do browser). */
const CHECKOUT_LOCALES: Record<string, Stripe.Checkout.SessionCreateParams.Locale> = {
  en: "en", pt: "pt", es: "es", fr: "fr", it: "it", de: "de", nl: "nl", sv: "sv", fi: "fi",
};

const SUBMIT_NOTE: Record<string, string> = {
  pt: "O valor não é cobrado agora: fica retido no seu cartão e só é cobrado quando confirmarmos a casa, em até 48 horas. Se não for possível confirmar, a retenção é libertada e nada é cobrado.",
  en: "Your card is not charged now: the amount is held on your card and only charged once we confirm the home, within 48 hours. If we cannot confirm it, the hold is released and nothing is charged.",
  es: "El importe no se cobra ahora: queda retenido en su tarjeta y solo se cobra cuando confirmemos la casa, en un máximo de 48 horas. Si no es posible confirmarla, la retención se libera y no se cobra nada.",
  fr: "Le montant n'est pas débité maintenant : il est bloqué sur votre carte et débité seulement lorsque nous confirmons la maison, sous 48 heures. Si nous ne pouvons pas la confirmer, le montant est libéré et rien n'est débité.",
  it: "L'importo non viene addebitato ora: resta bloccato sulla carta e viene addebitato solo quando confermiamo la casa, entro 48 ore. Se non è possibile confermarla, l'importo viene sbloccato e nulla viene addebitato.",
  de: "Der Betrag wird jetzt nicht abgebucht: Er wird auf Ihrer Karte vorgemerkt und erst abgebucht, wenn wir das Haus bestätigen, innerhalb von 48 Stunden. Können wir es nicht bestätigen, wird die Vormerkung aufgehoben und nichts abgebucht.",
  nl: "Het bedrag wordt nu niet afgeschreven: het wordt op uw kaart gereserveerd en pas afgeschreven wanneer wij het huis bevestigen, binnen 48 uur. Lukt dat niet, dan vervalt de reservering op uw kaart en wordt er niets afgeschreven.",
  sv: "Beloppet dras inte nu: det reserveras på ditt kort och dras först när vi bekräftar huset, inom 48 timmar. Går det inte att bekräfta hävs reservationen på kortet och inget dras.",
  fi: "Summaa ei veloiteta nyt: se varataan kortiltasi ja veloitetaan vasta, kun vahvistamme talon, 48 tunnin kuluessa. Jos emme voi vahvistaa sitä, katevaraus vapautetaan eikä mitään veloiteta.",
};

/** "noite/noites" e "hóspede/hóspedes" na linha da estadia da página do Stripe, na língua do hóspede. */
const STAY_WORDS: Record<string, { nights: [string, string]; guests: [string, string] }> = {
  en: { nights: ["night", "nights"], guests: ["guest", "guests"] },
  pt: { nights: ["noite", "noites"], guests: ["hóspede", "hóspedes"] },
  es: { nights: ["noche", "noches"], guests: ["huésped", "huéspedes"] },
  fr: { nights: ["nuit", "nuits"], guests: ["voyageur", "voyageurs"] },
  it: { nights: ["notte", "notti"], guests: ["ospite", "ospiti"] },
  de: { nights: ["Nacht", "Nächte"], guests: ["Gast", "Gäste"] },
  nl: { nights: ["nacht", "nachten"], guests: ["gast", "gasten"] },
  sv: { nights: ["natt", "nätter"], guests: ["gäst", "gäster"] },
  fi: { nights: ["yö", "yötä"], guests: ["vieras", "vierasta"] },
};
const stayWords = (lang: string) => STAY_WORDS[lang] ?? STAY_WORDS.en;
/** 2027-02-08 → 08/02/2027: lê-se igual em todas as línguas do site. */
const dayMonthYear = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;

/**
 * Já há um pagamento por devolver nesta casa que toca nestas noites?
 *
 * Enquanto a Tripwix não confirma (até 48 h) o calendário dela continua a
 * dar as noites como livres, e um segundo hóspede pagaria as mesmas datas
 * para depois ser reembolsado. Com um pago pendente, o segundo fica pelo
 * pedido sem pagamento e a equipa decide.
 */
const sameNights = (m: Record<string, string>, slug: string, checkin: string, checkout: string) =>
  m.property === slug && YMD.test(m.checkin || "") && YMD.test(m.checkout || "") && m.checkin < checkout && checkin < m.checkout;

async function paidStayOverlaps(slug: string, checkin: string, checkout: string): Promise<boolean> {
  const rows = await db.listLeads({ source: "partner-home-request" });
  return rows.some((lead: any) => committed(lead?.metadata?.payment) && sameNights(lead.metadata, slug, checkin, checkout));
}

/**
 * Um pedido acabou de ficar pago: as páginas de pagamento ainda abertas para
 * as mesmas noites fecham-se (uma sessão vive 31 minutos, e o segundo hóspede
 * — ou o mesmo, noutro separador — pagaria por cima). Se mesmo assim já
 * houver outro pagamento para estas noites, devolve os pedidos em causa para
 * a equipa ser avisada. Melhor esforço: nunca falha o pagamento que chegou.
 */
async function closeCompetingPayments(leadId: number, m: Record<string, string>): Promise<number[]> {
  const alsoPaid: number[] = [];
  try {
    const rows = await db.listLeads({ source: "partner-home-request" });
    const rivals = rows.filter((lead: any) => lead?.id !== leadId && lead?.metadata && sameNights(lead.metadata, m.property, m.checkin, m.checkout));
    for (const lead of rivals as any[]) {
      if (committed(lead.metadata.payment)) alsoPaid.push(lead.id);
      if (lead.metadata.payment !== "started" || !lead.metadata.paymentSessionId) continue;
      try {
        await (await stripeClient()).checkout.sessions.expire(lead.metadata.paymentSessionId);
        console.info(`[Partner pay] expired open session of lead=${lead.id} (lead=${leadId} paid the same nights)`);
      } catch { /* já paga ou já expirada: o Stripe recusa, e está certo */ }
    }
  } catch (err: any) {
    console.error(`[Partner pay] closing competing payments failed lead=${leadId}:`, err?.message);
  }
  return alsoPaid;
}

/**
 * Abre a sessão de pagamento de uma estadia numa casa parceira.
 * Lança CONFLICT com PARTNER_NOT_PAYABLE (o painel volta ao pedido sem
 * pagamento) ou PARTNER_PRICE_CHANGED (o painel relê o preço e mostra-o).
 */
export async function startPartnerPayment(raw: unknown): Promise<{ url: string; leadId: number }> {
  if (!partnerPayEnabled()) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PARTNER_PAY_OFF" });
  const parsed = payInput.safeParse(raw);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid partner payment" });
  const input = parsed.data;
  const today = new Date().toISOString().slice(0, 10);
  if (!realDate(input.checkin) || !realDate(input.checkout) || input.checkout <= input.checkin || input.checkin < today) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid request dates" });
  }
  const property: any = (await getPropertiesForSite()).find((p: any) =>
    p.slug === input.property && p.bookingMode === "request" && isPartnerHome(p) && p.isActive !== false && p.supplierUid);
  if (!property) throw new TRPCError({ code: "BAD_REQUEST", message: "Partner home unavailable" });
  if (property.maxGuests && input.guests > property.maxGuests) throw new TRPCError({ code: "BAD_REQUEST", message: "Too many guests" });

  const quote = await getPartnerQuote(property.supplierUid, input.checkin, input.checkout, partnerFeesOf(property, input.guests));
  if (!partnerQuotePayable(quote)) throw new TRPCError({ code: "CONFLICT", message: "PARTNER_NOT_PAYABLE" });
  if (cents(quote!.total) !== cents(input.shownTotal)) throw new TRPCError({ code: "CONFLICT", message: "PARTNER_PRICE_CHANGED" });
  if (await paidStayOverlaps(property.slug, input.checkin, input.checkout)) {
    console.info(`[Partner pay] refused: paid stay already pending property=${property.slug} ${input.checkin}→${input.checkout}`);
    throw new TRPCError({ code: "CONFLICT", message: "PARTNER_NOT_PAYABLE" });
  }
  const amount = cents(quote!.total);
  const lang = (input.locale || "en").slice(0, 2).toLowerCase();

  const metadata: Record<string, string> = {
    property: property.slug, propertyName: property.name,
    checkin: input.checkin, checkout: input.checkout, guests: String(input.guests),
    nights: String(quote!.nights), total: String(quote!.total), totalSource: "shown",
    quoteStatus: quote!.feesKnown ? "complete" : "partial", locale: input.locale || "en",
    payment: "started" satisfies PartnerPaymentState, paymentAmount: String(quote!.total),
    paymentStartedAt: new Date().toISOString(),
  };
  const saved = await db.createLead({
    email: input.email, name: input.name, phone: input.phone, message: input.message,
    source: "partner-home-request", metadata,
  });
  console.info(`[Partner pay] started lead=${saved.id} property=${property.slug} amount=${quote!.total}`);

  const stripe = await stripeClient();
  const flowMeta = {
    flow: PARTNER_PAY_FLOW, leadId: String(saved.id), property: property.slug,
    // The supplier's reference is not part of the public record: it comes from the store's server-side map.
    supplierReference: await partnerSupplierReference(property.supplierUid),
    checkin: input.checkin, checkout: input.checkout, guests: String(input.guests),
  };
  const back = `${siteOrigin()}${input.returnPath}`;
  const stay = `checkin=${input.checkin}&checkout=${input.checkout}&guests=${input.guests}`;
  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Só cartão (inclui Apple Pay e Google Pay): resposta imediata, sem
      // métodos que confirmam dias depois.
      payment_method_types: ["card"],
      customer_email: input.email,
      client_reference_id: `partner-lead-${saved.id}`,
      locale: CHECKOUT_LOCALES[lang] ?? "auto",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: amount,
          product_data: {
            name: `${property.name} · ${quote!.nights} ${stayWords(lang).nights[quote!.nights === 1 ? 0 : 1]}`,
            description: `${dayMonthYear(input.checkin)} → ${dayMonthYear(input.checkout)} · ${input.guests} ${stayWords(lang).guests[input.guests === 1 ? 0 : 1]}`,
          },
        },
      }],
      // "Reservar" no botão em vez de "Pagar": o valor fica retido, não é cobrado agora.
      submit_type: "book",
      custom_text: { submit: { message: SUBMIT_NOTE[lang] ?? SUBMIT_NOTE.en } },
      // Sempre em euros: sem conversão de moeda (com taxa) na página do Stripe,
      // e o valor pago é o que o painel mostrou.
      adaptive_pricing: { enabled: false },
      metadata: flowMeta,
      payment_intent_data: {
        // Retenção: o cartão é autorizado agora e só se cobra na captura,
        // feita no Dashboard quando a casa confirma. Cancelar não tem custo.
        capture_method: "manual",
        metadata: flowMeta,
        description: `Partner stay PA-${saved.id} · ${property.name} · ${input.checkin} → ${input.checkout}`,
      },
      expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      success_url: `${back}?${stay}&partner_session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${back}?${stay}`,
    }, { idempotencyKey: `partner-pay-${saved.id}` });
  } catch (err: any) {
    console.error(`[Partner pay] Stripe session failed lead=${saved.id}:`, err?.message);
    // O pedido fica guardado: a equipa recebe-o como um pedido normal.
    await notifyPartnerPayment(saved.id, "started").catch(() => {});
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PARTNER_PAY_FAILED" });
  }
  if (!session.url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PARTNER_PAY_FAILED" });
  await db.updateLead(saved.id, { metadata: { ...metadata, paymentSessionId: session.id } }).catch(() => {});
  // A equipa sabe já que há um hóspede a pagar; se não pagar, é um pedido para recuperar.
  void notifyPartnerPayment(saved.id, "started").catch(() => {});
  return { url: session.url, leadId: saved.id };
}

type Notice = "started" | "held" | "paid" | "released" | "refunded";
/** Na libertação e na devolução o hóspede vai primeiro: o email da equipa diz se ele foi avisado. */
const CHANNELS: Record<Notice, ("team" | "guest")[]> = {
  started: ["team"], held: ["team", "guest"], paid: ["team", "guest"], released: ["guest", "team"], refunded: ["guest", "team"],
};

/**
 * Emails de cada passo, uma vez por pedido, canal e variante (a chave de
 * idempotência do fornecedor segura as repetições). Devolve false se algum
 * não saiu: quem chama a partir do webhook responde 500 e o Stripe reentrega.
 */
async function notifyPartnerPayment(leadId: number, notice: Notice, opts: { guest?: boolean; variant?: string } = {}): Promise<boolean> {
  const lead = await db.getLeadById(leadId);
  if (!lead) return true;
  const metadata: Record<string, string> = { ...(lead.metadata || {}) };
  const { sendPartnerPaymentEmail } = await import("./transactional-email");
  const suffix = opts.variant ? `_${opts.variant}` : "";
  const patch: Record<string, string> = {};
  let ok = true;
  for (const channel of CHANNELS[notice]) {
    if (channel === "guest" && opts.guest === false) continue;
    const key = `${notice}${channel === "team" ? "Team" : "Guest"}Notification${suffix}`;
    if (metadata[key] === "accepted") continue;
    try {
      patch[`${key}Id`] = await sendPartnerPaymentEmail({ ...lead, metadata }, notice, channel, opts.variant);
      metadata[key] = patch[key] = "accepted";
    } catch {
      metadata[key] = patch[key] = "failed";
      ok = false;
      console.error(`[Partner pay] notification failed lead=${leadId} notice=${notice} channel=${channel}`);
    }
  }
  if (!Object.keys(patch).length) return ok;
  // Só as chaves das notificações, por cima do estado mais recente: o
  // pagamento pode ter mudado entretanto, e um "failed" de quem perdeu a
  // corrida nunca apaga o "accepted" de quem a ganhou.
  const fresh = (await db.getLeadById(leadId))?.metadata || {};
  const merged: Record<string, string> = { ...fresh };
  for (const [k, v] of Object.entries(patch)) if (!(v === "failed" && merged[k] === "accepted")) merged[k] = v;
  await db.updateLead(leadId, { metadata: merged }).catch(() => {});
  return ok;
}

/** A variante de uma devolução: "full", ou os cêntimos devolvidos até agora (cada parcial tem o seu aviso). */
const refundVariant = (m: Record<string, string>) => (m.payment === "refunded" ? "full" : String(Math.round(Number(m.refundedAmount || 0) * 100)));

/** Admin: voltar a tentar o aviso à equipa do passo em que o pedido está (nunca escreve ao hóspede). */
export async function retryPartnerPaymentTeamNotice(leadId: number): Promise<{ teamNotification: string }> {
  const m = (await db.getLeadById(leadId))?.metadata || {};
  const notice: Notice = m.payment === "started" || m.payment === "held" || m.payment === "paid" || m.payment === "released" ? m.payment : "refunded";
  const ok = await notifyPartnerPayment(leadId, notice, { guest: false, variant: notice === "refunded" ? refundVariant(m) : undefined });
  return { teamNotification: ok ? "accepted" : "failed" };
}

const leadIdOf = (meta: Record<string, string> | null | undefined) => {
  const id = Number(meta?.leadId);
  return meta?.flow === PARTNER_PAY_FLOW && Number.isInteger(id) && id > 0 ? id : null;
};

type PiLike = { id: string; status?: string; amount?: number; amount_capturable?: number; amount_received?: number; currency?: string; metadata?: Record<string, string> | null };

/**
 * payment_intent.amount_capturable_updated: o cartão foi autorizado e o valor
 * ficou retido (webhook, regresso do hóspede à página, ou a passagem de 5 em
 * 5 minutos). Idempotente: só um pedido "started" passa a "held".
 */
export async function handlePartnerPaymentHeld(pi: PiLike): Promise<"held" | "already" | "ignored"> {
  const leadId = leadIdOf(pi.metadata);
  if (!leadId) return "ignored";
  const lead = await db.getLeadById(leadId);
  if (!lead || lead.source !== "partner-home-request") return "ignored";
  const metadata = { ...(lead.metadata || {}) };
  const first = !metadata.payment || metadata.payment === "started" || metadata.payment === "expired";
  if (first) {
    metadata.payment = "held" satisfies PartnerPaymentState;
    metadata.paymentIntentId = pi.id;
    metadata.heldAt = new Date().toISOString();
    metadata.heldAmount = String((Number(pi.amount_capturable ?? pi.amount) || 0) / 100);
    metadata.holdUntil = new Date(Date.now() + HOLD_DAYS * 86_400_000).toISOString().slice(0, 10);
    if (pi.currency && pi.currency.toLowerCase() !== "eur") metadata.paidCurrency = pi.currency.toUpperCase();
    await db.updateLead(leadId, { metadata });
    console.info(`[Partner pay] held lead=${leadId} pi=${pi.id} amount=${metadata.heldAmount}`);
    const others = await closeCompetingPayments(leadId, metadata);
    if (others.length) {
      metadata.overlapWith = others.map((id) => `PA-${id}`).join(", ");
      await db.updateLead(leadId, { metadata }).catch(() => {});
      console.warn(`[Partner pay] lead=${leadId} holds nights already held or paid by ${metadata.overlapWith}`);
    }
  }
  if (metadata.payment === "held" && !(await notifyPartnerPayment(leadId, "held"))) {
    throw new Error("PARTNER_NOTIFY_FAILED");
  }
  return first ? "held" : "already";
}

/**
 * payment_intent.canceled: a retenção foi cancelada no Dashboard (a casa não
 * confirmou) ou expirou. Nada foi cobrado. Uma sessão que o hóspede abandonou
 * também cancela o seu PaymentIntent: esse pedido fica "expired", sem emails.
 */
export async function handlePartnerPaymentCanceled(pi: PiLike): Promise<"released" | "expired" | "already" | "ignored"> {
  const leadId = leadIdOf(pi.metadata);
  if (!leadId) return "ignored";
  const lead = await db.getLeadById(leadId);
  if (!lead || lead.source !== "partner-home-request") return "ignored";
  const metadata = { ...(lead.metadata || {}) };
  if (!metadata.payment || metadata.payment === "started") {
    metadata.payment = "expired" satisfies PartnerPaymentState;
    await db.updateLead(leadId, { metadata });
    return "expired";
  }
  if (metadata.payment === "held") {
    metadata.payment = "released" satisfies PartnerPaymentState;
    metadata.releasedAt = new Date().toISOString();
    await db.updateLead(leadId, { metadata });
    console.info(`[Partner pay] released lead=${leadId} pi=${pi.id}`);
  }
  if (metadata.payment !== "released") return "already";
  if (!(await notifyPartnerPayment(leadId, "released"))) throw new Error("PARTNER_NOTIFY_FAILED");
  return "released";
}

/**
 * payment_intent.succeeded de uma casa parceira: a retenção foi capturada no
 * Dashboard (webhook, regresso do hóspede, ou a passagem). Idempotente: um
 * pedido já cobrado ou reembolsado não muda.
 */
export async function handlePartnerPaymentSucceeded(pi: PiLike): Promise<"paid" | "already" | "ignored"> {
  const leadId = leadIdOf(pi.metadata);
  if (!leadId) return "ignored";
  const lead = await db.getLeadById(leadId);
  if (!lead || lead.source !== "partner-home-request") return "ignored";
  const metadata = { ...(lead.metadata || {}) };
  const first = !metadata.payment || metadata.payment === "started" || metadata.payment === "held" || metadata.payment === "expired";
  const wasHeld = metadata.payment === "held";
  if (first) {
    metadata.payment = "paid" satisfies PartnerPaymentState;
    metadata.paymentIntentId = pi.id;
    metadata.paidAt = new Date().toISOString();
    metadata.paidAmount = String((Number(pi.amount_received ?? pi.amount) || 0) / 100);
    if (pi.currency && pi.currency.toLowerCase() !== "eur") metadata.paidCurrency = pi.currency.toUpperCase();
    await db.updateLead(leadId, { metadata });
    console.info(`[Partner pay] paid lead=${leadId} pi=${pi.id} amount=${metadata.paidAmount}`);
    // Já se fecharam as páginas concorrentes quando o valor ficou retido.
    const alsoPaid = wasHeld ? [] : await closeCompetingPayments(leadId, metadata);
    if (alsoPaid.length) {
      metadata.overlapWith = alsoPaid.map((id) => `PA-${id}`).join(", ");
      await db.updateLead(leadId, { metadata }).catch(() => {});
      console.warn(`[Partner pay] lead=${leadId} paid nights already paid by ${metadata.overlapWith}`);
    }
  }
  // Também na repetição: um email que falhou à primeira sai agora. Se voltar
  // a falhar, lança: o webhook responde 500 e o Stripe reentrega o evento.
  if (metadata.payment === "paid" && !(await notifyPartnerPayment(leadId, "paid"))) {
    throw new Error("PARTNER_NOTIFY_FAILED");
  }
  return first ? "paid" : "already";
}

/**
 * charge.refunded de uma casa parceira: a devolução foi feita no Dashboard do
 * Stripe. Total → o hóspede é avisado; parcial → só a equipa.
 */
export async function handlePartnerChargeRefunded(charge: { id: string; refunded?: boolean; amount?: number; amount_refunded?: number; payment_intent?: string | { id: string } | null; metadata?: Record<string, string> | null }): Promise<"refunded" | "partially_refunded" | "ignored"> {
  let meta = charge.metadata;
  if (!leadIdOf(meta) && !meta?.flow && charge.payment_intent && partnerPayEnabled()) {
    // Uma charge pode não trazer o metadata do PI: lê-se o PI.
    try {
      const id = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent.id;
      meta = (await (await stripeClient()).paymentIntents.retrieve(id)).metadata;
    } catch { return "ignored"; }
  }
  const leadId = leadIdOf(meta);
  if (!leadId) return "ignored";
  const lead = await db.getLeadById(leadId);
  if (!lead || lead.source !== "partner-home-request") return "ignored";
  const full = charge.refunded === true || (Number(charge.amount_refunded) > 0 && Number(charge.amount_refunded) >= Number(charge.amount));
  const state: PartnerPaymentState = full ? "refunded" : "partially_refunded";
  const metadata = { ...(lead.metadata || {}) };
  const refundedCents = Number(charge.amount_refunded) || 0;
  const knownCents = Math.round(Number(metadata.refundedAmount || 0) * 100);
  // Eventos fora de ordem: uma devolução parcial antiga nunca desfaz uma
  // total, nem baixa o valor já devolvido.
  if ((metadata.payment === "refunded" && !full) || refundedCents < knownCents) return metadata.payment as "refunded" | "partially_refunded";
  if (metadata.payment !== state || refundedCents !== knownCents) {
    metadata.payment = state;
    metadata.refundedAmount = String(refundedCents / 100);
    metadata.refundedAt = new Date().toISOString();
    await db.updateLead(leadId, { metadata });
    console.info(`[Partner pay] ${state} lead=${leadId} charge=${charge.id} amount=${metadata.refundedAmount}`);
  }
  if (!(await notifyPartnerPayment(leadId, "refunded", { guest: full, variant: refundVariant(metadata) }))) {
    throw new Error("PARTNER_NOTIFY_FAILED");
  }
  return state;
}

/** O estado real de um PaymentIntent aplicado ao pedido (o mesmo que os três eventos do webhook fariam). */
async function settleFromIntent(pi: PiLike): Promise<"held" | "paid" | "released" | "open"> {
  if (pi.status === "requires_capture") { await handlePartnerPaymentHeld(pi); return "held"; }
  if (pi.status === "succeeded") { await handlePartnerPaymentSucceeded(pi); return "paid"; }
  if (pi.status === "canceled") { await handlePartnerPaymentCanceled(pi); return "released"; }
  return "open";
}

/**
 * Rede de segurança do webhook: de 5 em 5 minutos, os pedidos com pagamento
 * aberto (started há menos de 2 dias) ou com valor retido (até 10 dias) são
 * conferidos com o Stripe. Um evento que não chegou (endpoint sem o tipo de
 * evento, entrega falhada) não deixa dinheiro retido sem a equipa saber.
 */
export async function sweepPartnerPayments(now = Date.now()): Promise<{ checked: number; changed: number }> {
  if (!partnerPayEnabled()) return { checked: 0, changed: 0 };
  const rows = await db.listLeads({ source: "partner-home-request" });
  let checked = 0, changed = 0;
  for (const lead of rows as any[]) {
    const m = lead?.metadata || {};
    const since = Date.parse(m.heldAt || m.paymentStartedAt || "");
    const open = (m.payment === "started" && m.paymentSessionId && now - since < 2 * 86_400_000)
      || (m.payment === "held" && m.paymentIntentId && now - since < 10 * 86_400_000);
    if (!open) continue;
    checked++;
    try {
      const stripe = await stripeClient();
      let pi: Stripe.PaymentIntent | null = null;
      if (m.payment === "held") {
        pi = await stripe.paymentIntents.retrieve(m.paymentIntentId);
      } else {
        const session = await stripe.checkout.sessions.retrieve(m.paymentSessionId, { expand: ["payment_intent"] });
        pi = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent : null;
        if (!pi && session.status === "expired") {
          await db.updateLead(lead.id, { metadata: { ...m, payment: "expired" } });
          changed++;
          continue;
        }
      }
      if (!pi) continue;
      const before = m.payment;
      const after = await settleFromIntent(pi as any);
      if (after !== "open" && after !== before) changed++;
    } catch (err: any) {
      console.error(`[Partner pay] sweep failed lead=${lead?.id}:`, err?.message);
    }
  }
  if (changed) console.info(`[Partner pay] sweep: ${changed} of ${checked} open requests updated from Stripe`);
  return { checked, changed };
}

let sweepTimer: ReturnType<typeof setInterval> | null = null;
export function startPartnerPaymentSweep(): void {
  if (sweepTimer || !partnerPayEnabled()) return;
  sweepTimer = setInterval(() => { void sweepPartnerPayments().catch(() => {}); }, 5 * 60_000);
  sweepTimer.unref?.();
  console.info("[Partner pay] sweep started (every 5 min)");
}

/**
 * O hóspede voltou do Stripe: o valor ficou retido (ou já foi cobrado)? Fecha
 * o pedido aqui se o webhook ainda não chegou. Só devolve o que a página mostra.
 */
export async function partnerPaymentStatus(sessionId: string): Promise<{ status: "held" | "paid" | "open" | "unknown"; reference?: string; propertyName?: string; checkin?: string; checkout?: string; guests?: string; total?: string }> {
  if (!partnerPayEnabled() || !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return { status: "unknown" };
  let session: Stripe.Checkout.Session;
  try {
    session = await (await stripeClient()).checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
  } catch { return { status: "unknown" }; }
  const leadId = leadIdOf(session.metadata as Record<string, string> | null);
  if (!leadId) return { status: "unknown" };
  const pi = session.payment_intent && typeof session.payment_intent === "object" ? session.payment_intent as Stripe.PaymentIntent : null;
  const status = pi?.status === "requires_capture" ? "held" : pi?.status === "succeeded" ? "paid" : null;
  if (!pi || !status) return { status: "open" };
  await settleFromIntent(pi as any).catch((err: any) => console.error(`[Partner pay] status settle failed lead=${leadId}:`, err?.message));
  // Retido é retido, mesmo que a BD falhe agora: a página nunca volta a oferecer o pagamento.
  const m = (await db.getLeadById(leadId).catch(() => undefined))?.metadata || {};
  return { status, reference: `PA-${leadId}`, propertyName: m.propertyName, checkin: m.checkin, checkout: m.checkout, guests: m.guests, total: m.paidAmount || m.heldAmount || m.total };
}
