import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { getPropertiesForSite } from "./properties-store";
import { sendPartnerRequestEmail } from "./transactional-email";

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
    total: m.total && /^\d+(\.\d{1,2})?$/.test(m.total) ? m.total : "—",
    quoteStatus: m.quoteStatus || "unknown", locale: m.locale || "en",
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
