import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { getPropertiesForSite } from "./properties-store";
import { sendPartnerRequestEmail } from "./transactional-email";
import { getPartnerCalendar, getPartnerQuote, partnerFeesOf } from "./tripwix";
import { addDays } from "./tripwix-calendar";

const requestInput = z.object({
  email: z.string().email().max(320), name: z.string().trim().min(1).max(255),
  phone: z.string().max(50).optional(), message: z.string().max(5000).optional(),
  metadata: z.object({
    property: z.string().min(1).max(200),
    checkin: z.string().max(10).optional(), checkout: z.string().max(10).optional(),
    guests: z.coerce.number().int().min(1).max(100),
    total: z.string().max(30).optional(), locale: z.string().max(10).optional(),
    quoteStatus: z.enum(["complete", "partial", "unavailable", "unknown"]).optional(),
  }),
});
type StoredRequest = Parameters<typeof sendPartnerRequestEmail>[0];

function date(value?: string) {
  if (!value || value === "—") return "—";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid request dates" });
  }
  return value;
}

const EUR = /^\d+(\.\d{1,2})?$/;
const ptDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

/**
 * O valor do pedido, calculado aqui e não só no browser (13 nov 2026).
 *
 * O painel mandava o total que tinha no ecrã; sem cotação carregada (datas
 * para lá do que a Tripwix publicou, casa sem calendário, pedido enviado com
 * a cotação ainda a chegar) o pedido seguia com "—" e a equipa não sabia
 * porquê. Agora o servidor cota a estadia no mesmo calendário que serve o
 * site (nunca chama a Tripwix) e, quando não há valor, diz o motivo.
 *
 * O total que o hóspede viu continua a mandar quando existe: é esse o número
 * que ele tem na cabeça. O do servidor entra quando o browser não mandou
 * nenhum, e aparece ao lado quando os dois diferem.
 */
export async function partnerRequestPrice(property: any, checkin: string, checkout: string, guests: number, shown?: string, shownStatus?: string): Promise<Record<string, string>> {
  const seen = shown && EUR.test(shown) ? shown : undefined;
  if (checkin === "—") {
    return { total: "—", quoteStatus: "unknown", priceNote: "O hóspede não escolheu datas." };
  }
  const uid = property?.supplierUid as string | undefined;
  let quote: Awaited<ReturnType<typeof getPartnerQuote>> = null;
  try { quote = uid ? await getPartnerQuote(uid, checkin, checkout, partnerFeesOf(property, guests)) : null; }
  catch { quote = null; }
  if (quote) {
    const server = String(quote.total);
    const out: Record<string, string> = {
      total: seen ?? server,
      totalSource: seen ? "shown" : "server",
      quoteStatus: !quote.available ? "unavailable" : quote.feesKnown ? "complete" : "partial",
    };
    if (seen && Math.abs(Number(seen) - quote.total) >= 0.01) out.serverTotal = server;
    if (!quote.available && quote.unavailable.length) {
      out.priceNote = `Noites ocupadas no calendário da Tripwix: ${quote.unavailable.slice(0, 14).map(ptDate).join(", ")}${quote.unavailable.length > 14 ? "…" : ""}`;
    } else if (!quote.available) {
      out.priceNote = "A estadia não cumpre o mínimo de noites ou a lotação da casa.";
    }
    return out;
  }
  // O hóspede viu um total e o servidor já não o consegue refazer: fica o que ele viu.
  if (seen) return { total: seen, totalSource: "shown", quoteStatus: shownStatus || "unknown" };
  // Sem cotação: o calendário diz porquê.
  let priceNote = "O site não conseguiu ler o calendário desta casa neste momento.";
  try {
    const today = new Date().toISOString().slice(0, 10);
    const year = uid ? await getPartnerCalendar(uid, today, addDays(today, 365)) : null;
    if (!year) {
      priceNote = "A Tripwix não tem calendário publicado para esta casa (sem preços nem disponibilidade).";
    } else {
      const last = [...year].reverse().find(d => d.status !== "unknown")?.date;
      const lastNight = addDays(checkout, -1);
      if (!last) priceNote = "A Tripwix não tem nenhum dia publicado para esta casa nos próximos 12 meses.";
      else if (lastNight > last) priceNote = `A Tripwix só tem preços publicados para esta casa até ${ptDate(last)}; estas datas ficam depois.`;
      else priceNote = "Falta o preço de pelo menos uma noite destas datas no calendário da Tripwix.";
    }
  } catch { /* fica o motivo genérico */ }
  const out: Record<string, string> = { total: "—", quoteStatus: "unknown", priceNote };
  const from = Number(property?.priceFrom);
  if (Number.isFinite(from) && from > 0) out.fromPrice = String(from);
  return out;
}

/** Failures in email delivery must not turn a saved enquiry into a failed form. */
async function notify(lead: StoredRequest, channels: ("team" | "guest")[]) {
  const metadata = { ...lead.metadata };
  for (const channel of channels) {
    const key = `${channel}Notification`;
    if (metadata[key] === "accepted") continue;
    try {
      metadata[`${key}Id`] = await sendPartnerRequestEmail(lead, channel);
      metadata[key] = "accepted";
    } catch {
      metadata[key] = "failed";
      console.error(`[Partner request] notification failed lead=${lead.id} channel=${channel}`);
    }
    metadata[`${key}At`] = new Date().toISOString();
  }
  try { await db.updateLead(lead.id, { metadata }); }
  catch {
    // The initial pending state remains visible to staff. Same provider key on retry.
    console.error(`[Partner request] notification status persistence failed lead=${lead.id}`);
  }
  return { teamNotification: metadata.teamNotification, guestNotification: metadata.guestNotification };
}

export async function createPartnerRequest(input: unknown) {
  const parsed = requestInput.safeParse(input);
  if (!parsed.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid partner request" });
  const { metadata: m, ...contact } = parsed.data;
  const property = (await getPropertiesForSite()).find(p => p.slug === m.property && p.bookingMode === "request");
  if (!property) throw new TRPCError({ code: "BAD_REQUEST", message: "Partner home unavailable" });
  if (property.maxGuests && m.guests > property.maxGuests) throw new TRPCError({ code: "BAD_REQUEST", message: "Too many guests" });
  const checkin = date(m.checkin), checkout = date(m.checkout);
  if ((checkin === "—") !== (checkout === "—") || (checkin !== "—" && checkout <= checkin)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid request dates" });
  }
  const metadata: Record<string, string> = {
    property: property.slug, propertyName: property.name,
    checkin, checkout, guests: String(m.guests),
    nights: checkin === "—" ? "—" : String(Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000)),
    ...(await partnerRequestPrice(property, checkin, checkout, m.guests, m.total, m.quoteStatus)),
    locale: m.locale || "en",
    teamNotification: "pending", guestNotification: "pending",
  };
  const saved = await db.createLead({ ...contact, source: "partner-home-request", metadata });
  console.info(`[Partner request] saved lead=${saved.id} property=${property.slug}`);
  await notify({ ...contact, id: saved.id, metadata }, ["team", "guest"]);
  return saved;
}

/** Staff can recover the internal alert without emailing a historical guest. */
export async function retryPartnerTeamNotification(id: number) {
  const lead = await db.getLeadById(id);
  if (!lead || lead.source !== "partner-home-request") throw new TRPCError({ code: "NOT_FOUND" });
  return notify({ ...lead, metadata: lead.metadata || {} }, ["team"]);
}
