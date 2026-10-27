/**
 * Exportação interna para a máquina de leads do pa-marketing (b-crm/jobs/lost_leads.py):
 * os carrinhos não pagos e os pedidos do site dos últimos dias, para o balcão os mover para
 * reserva direta.
 *
 * GET /api/internal/leads-export?since=AAAA-MM-DD
 * Authorization: Bearer <SITE_EXPORT_TOKEN>
 *
 * Devolve {"since": ..., "intents": [...], "leads": [...]}:
 * - intents: booking_intents em contact_captured ou payment_pending, com email, criados desde
 *   `since`, só com os campos que a máquina usa (nunca o NIF, o payment intent nem a cotação
 *   completa). Um intent pago ou expirado nunca sai daqui, mesmo que a base o devolvesse.
 * - leads: contact-form e search-no-availability em new ou contacted, criados desde `since`.
 *   Newsletter e owners nunca saem (proprietários são outro circuito).
 *
 * Sem SITE_EXPORT_TOKEN no ambiente a rota responde sempre 401: só existe quando alguém a
 * configurar no Render. A comparação do token é em tempo constante, como o opt-out dos
 * lembretes (verifyRecoveryOptoutToken). Sem `since`, os últimos 14 dias.
 */
import type { Express, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import type { BookingIntent, Lead } from "../../drizzle/schema";
import { listLeadsForExport, listUnpaidIntentsForExport } from "../db";

export const LEADS_EXPORT_PATH = "/api/internal/leads-export";
export const DEFAULT_WINDOW_DAYS = 14;
const MIN_TOKEN_LENGTH = 16;
export const EXPORT_INTENT_STATUSES: ReadonlyArray<BookingIntent["status"]> = ["contact_captured", "payment_pending"];
export const EXPORT_LEAD_SOURCES: ReadonlyArray<string> = ["contact-form", "search-no-availability"];
export const EXPORT_LEAD_STATUSES: ReadonlyArray<Lead["status"]> = ["new", "contacted"];

/** Bearer igual a SITE_EXPORT_TOKEN, comparado em tempo constante; sem variável, nunca. */
export function verifyExportToken(header: string | undefined, expected = process.env.SITE_EXPORT_TOKEN): boolean {
  if (!expected || expected.length < MIN_TOKEN_LENGTH) return false;
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  if (!match) return false;
  const given = Buffer.from(match[1], "utf8");
  const wanted = Buffer.from(expected, "utf8");
  if (given.length !== wanted.length) return false;
  try {
    return timingSafeEqual(given, wanted);
  } catch {
    return false;
  }
}

/** `since` como AAAA-MM-DD (00:00 UTC); vazio dá os últimos DEFAULT_WINDOW_DAYS; inválido dá null. */
export function parseSince(value: unknown, now = new Date()): Date | null {
  if (value === undefined || value === null || value === "") {
    return new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function exportIntent(intent: BookingIntent) {
  return {
    id: intent.id,
    listingId: intent.listingId,
    propertyName: intent.propertyName,
    checkIn: intent.checkIn,
    checkOut: intent.checkOut,
    guests: intent.guests,
    email: intent.email,
    guestFirstName: intent.guestFirstName,
    guestLastName: intent.guestLastName,
    guestPhone: intent.guestPhone,
    quote: { total: intent.quote?.total ?? null },
    status: intent.status,
    locale: intent.locale,
    recoveryStage: intent.recoveryStage,
    recoveryOptout: intent.recoveryOptout,
    conciergeAlerted: intent.conciergeAlerted,
    reservationId: intent.reservationId,
    createdAt: intent.createdAt,
    updatedAt: intent.updatedAt,
  };
}

export function exportLead(lead: Lead) {
  return {
    id: lead.id,
    email: lead.email,
    name: lead.name,
    phone: lead.phone,
    message: lead.message,
    source: lead.source,
    status: lead.status,
    metadata: lead.metadata ?? {},
    createdAt: lead.createdAt,
  };
}

export function registerLeadsExportRoute(app: Express): void {
  app.get(LEADS_EXPORT_PATH, async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (!verifyExportToken(req.headers.authorization)) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const since = parseSince(req.query.since);
    if (!since) {
      res.status(400).json({ error: "since must be YYYY-MM-DD" });
      return;
    }
    try {
      const [intents, leads] = await Promise.all([listUnpaidIntentsForExport(since), listLeadsForExport(since)]);
      res.json({
        since: since.toISOString(),
        intents: intents
          .filter((i) => EXPORT_INTENT_STATUSES.includes(i.status) && !!i.email)
          .map(exportIntent),
        leads: leads
          .filter((l) => EXPORT_LEAD_SOURCES.includes(l.source) && EXPORT_LEAD_STATUSES.includes(l.status))
          .map(exportLead),
      });
    } catch (error) {
      console.error("[leads-export] failed:", error);
      res.status(500).json({ error: "export failed" });
    }
  });
}
