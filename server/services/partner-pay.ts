/**
 * Casas parceiras (Tripwix): cobrança de 100% da estadia no momento do pedido.
 *
 * Porquê (13 nov 2026): a Tripwix confirma cada estadia em até 48 h. O site
 * só guardava um pedido, sem pagamento, e o hóspede ia-se embora enquanto se
 * esperava. Temos o preço e o calendário e ~90% dos pedidos confirmam, por
 * isso o hóspede paga logo; se a casa não confirmar, devolve-se tudo.
 *
 * Como funciona:
 * - O painel da casa parceira, quando a estadia é cobrável, abre uma sessão
 *   do Stripe Checkout (página do Stripe: cartão, Apple Pay, Google Pay, 3DS)
 *   com o total que o hóspede viu. O servidor volta a cotar antes de cobrar:
 *   nunca se cobra um valor diferente do que estava no ecrã.
 * - O pedido fica guardado nos leads como sempre (source partner-home-request),
 *   com o estado do pagamento no metadata: started → paid → refunded.
 * - A cobrança e a devolução controlam-se no Dashboard do Stripe. O webhook
 *   do cartão (payment_intent.succeeded, charge.refunded) atualiza o pedido e
 *   envia os emails. Nada aqui devolve dinheiro por conta própria.
 * - Nada toca no Guesty nem no checkout das nossas casas: o PI leva
 *   metadata.flow = "partner_pay" e os outros fluxos ignoram-no.
 *
 * Desligado por omissão: PARTNER_PAY=true liga. Com a flag desligada, ou numa
 * estadia que o servidor não consegue cotar com confiança, o painel continua
 * a ser o pedido sem pagamento.
 *
 * O que NÃO está aqui (v1): retenção sem captura (capture_method manual),
 * Klarna/PayPal, duas partes, e a confirmação ao hóspede quando a Tripwix
 * aceita (a equipa confirma por email, como hoje).
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type Stripe from "stripe";
import * as db from "../db";
import { isPreviewDeployment } from "../lib/preview-isolation";
import { getPropertiesForSite } from "./properties-store";
import { getPartnerQuote, partnerFeesOf, type PartnerQuote } from "./tripwix";

export const PARTNER_PAY_FLOW = "partner_pay";
/** Um calendário lido há mais do que isto não chega para cobrar (serve para mostrar preço, até 48 h). */
export const PAYABLE_MAX_AGE_MS = 6 * 3_600_000;
/** O Stripe Checkout não aceita sessões com menos de 30 minutos. */
const SESSION_TTL_SECONDS = 31 * 60;
/** Teto do Stripe por cobrança em EUR (999 999,99). */
const MAX_CHARGE_EUR = 999_999;

export type PartnerPaymentState = "started" | "paid" | "partially_refunded" | "refunded";

/** A chave secreta em uso. Num preview só serve uma chave de teste: nunca dinheiro real fora de produção. */
function stripeKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (isPreviewDeployment(env) && !key.startsWith("sk_test_")) return null;
  return key;
}

export function partnerPayEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PARTNER_PAY === "true" && !!stripeKey(env);
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
  pt: "O valor é cobrado agora. Confirmamos a casa em até 48 horas; se não for possível confirmar, devolvemos o valor total.",
  en: "Your card is charged now. We confirm the home within 48 hours; if we cannot confirm it, you are refunded in full.",
  es: "El importe se cobra ahora. Confirmamos la casa en un máximo de 48 horas; si no es posible, le devolvemos el importe íntegro.",
  fr: "Le montant est débité maintenant. Nous confirmons la maison sous 48 heures ; si ce n'est pas possible, vous êtes remboursé intégralement.",
  it: "L'importo viene addebitato ora. Confermiamo la casa entro 48 ore; se non è possibile, rimborsiamo l'intero importo.",
  de: "Der Betrag wird jetzt abgebucht. Wir bestätigen das Haus innerhalb von 48 Stunden; ist das nicht möglich, erstatten wir den vollen Betrag.",
  nl: "Het bedrag wordt nu afgeschreven. Wij bevestigen het huis binnen 48 uur; lukt dat niet, dan krijgt u het volledige bedrag terug.",
  sv: "Beloppet dras nu. Vi bekräftar huset inom 48 timmar; går det inte får du hela beloppet tillbaka.",
  fi: "Summa veloitetaan nyt. Vahvistamme talon 48 tunnin kuluessa; jos se ei onnistu, palautamme koko summan.",
};

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
  return rows.some((lead: any) => lead?.metadata?.payment === "paid" && sameNights(lead.metadata, slug, checkin, checkout));
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
      if (lead.metadata.payment === "paid") alsoPaid.push(lead.id);
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
    p.slug === input.property && p.bookingMode === "request" && p.source === "tripwix" && p.isActive !== false && p.supplierUid);
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
    supplierReference: String(property.supplierReference ?? ""),
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
            name: `${property.name} · ${quote!.nights} ${quote!.nights === 1 ? "night" : "nights"}`,
            description: `${input.checkin} → ${input.checkout} · ${input.guests} ${input.guests === 1 ? "guest" : "guests"}`,
          },
        },
      }],
      custom_text: { submit: { message: SUBMIT_NOTE[lang] ?? SUBMIT_NOTE.en } },
      // Sempre em euros: sem conversão de moeda (com taxa) na página do Stripe,
      // e o valor pago é o que o painel mostrou.
      adaptive_pricing: { enabled: false },
      metadata: flowMeta,
      payment_intent_data: {
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

type Notice = "started" | "paid" | "refunded";
/** Na devolução o hóspede vai primeiro: o email da equipa diz se ele foi avisado. */
const CHANNELS: Record<Notice, ("team" | "guest")[]> = { started: ["team"], paid: ["team", "guest"], refunded: ["guest", "team"] };

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
  const notice: Notice = m.payment === "paid" ? "paid" : m.payment === "started" ? "started" : "refunded";
  const ok = await notifyPartnerPayment(leadId, notice, { guest: false, variant: notice === "refunded" ? refundVariant(m) : undefined });
  return { teamNotification: ok ? "accepted" : "failed" };
}

const leadIdOf = (meta: Record<string, string> | null | undefined) => {
  const id = Number(meta?.leadId);
  return meta?.flow === PARTNER_PAY_FLOW && Number.isInteger(id) && id > 0 ? id : null;
};

/**
 * payment_intent.succeeded de uma casa parceira (webhook, ou o regresso do
 * hóspede à página). Idempotente: um pedido já pago ou reembolsado não muda.
 */
export async function handlePartnerPaymentSucceeded(pi: { id: string; amount_received?: number; amount?: number; currency?: string; metadata?: Record<string, string> | null }): Promise<"paid" | "already" | "ignored"> {
  const leadId = leadIdOf(pi.metadata);
  if (!leadId) return "ignored";
  const lead = await db.getLeadById(leadId);
  if (!lead || lead.source !== "partner-home-request") return "ignored";
  const metadata = { ...(lead.metadata || {}) };
  const first = !metadata.payment || metadata.payment === "started";
  if (first) {
    metadata.payment = "paid" satisfies PartnerPaymentState;
    metadata.paymentIntentId = pi.id;
    metadata.paidAt = new Date().toISOString();
    metadata.paidAmount = String((Number(pi.amount_received ?? pi.amount) || 0) / 100);
    if (pi.currency && pi.currency.toLowerCase() !== "eur") metadata.paidCurrency = pi.currency.toUpperCase();
    await db.updateLead(leadId, { metadata });
    console.info(`[Partner pay] paid lead=${leadId} pi=${pi.id} amount=${metadata.paidAmount}`);
    const alsoPaid = await closeCompetingPayments(leadId, metadata);
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

/**
 * O hóspede voltou do Stripe: a sessão foi paga? Fecha o pedido aqui se o
 * webhook ainda não chegou. Só devolve o que a página mostra.
 */
export async function partnerPaymentStatus(sessionId: string): Promise<{ status: "paid" | "open" | "unknown"; reference?: string; propertyName?: string; checkin?: string; checkout?: string; guests?: string; total?: string }> {
  if (!partnerPayEnabled() || !/^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)) return { status: "unknown" };
  let session: Stripe.Checkout.Session;
  try {
    session = await (await stripeClient()).checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
  } catch { return { status: "unknown" }; }
  const leadId = leadIdOf(session.metadata as Record<string, string> | null);
  if (!leadId) return { status: "unknown" };
  if (session.payment_status !== "paid") return { status: "open" };
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  if (pi && typeof pi === "object") await handlePartnerPaymentSucceeded(pi as any).catch((err: any) => console.error(`[Partner pay] status settle failed lead=${leadId}:`, err?.message));
  // Pago é pago, mesmo que a BD falhe agora: a página nunca volta a oferecer o pagamento.
  const m = (await db.getLeadById(leadId).catch(() => undefined))?.metadata || {};
  return { status: "paid", reference: `PA-${leadId}`, propertyName: m.propertyName, checkin: m.checkin, checkout: m.checkout, guests: m.guests, total: m.paidAmount || m.total };
}
