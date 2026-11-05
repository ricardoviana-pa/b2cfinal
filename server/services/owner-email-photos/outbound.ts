import { createHash } from "node:crypto";
import { Resend } from "resend";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../db";
import { isOwnerIntakeProduction } from "../owner-intake/email";
import { normalizeMessageId } from "./matching";

export class OutboundEventError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}
const sentEvent = z.object({ type: z.literal("email.sent"), data: z.object({
  email_id: z.uuid(), from: z.string().max(500), message_id: z.string().min(3).max(998).regex(/^<[^<>\s]+>$/),
}) });
/** Verification is local; the SDK does not make an API call or require a read key. */
export function parseOutboundEvent(body: Buffer, headers: { id: string; timestamp: string; signature: string }, secret: string) {
  let event: unknown;
  try {
    const payload = new TextDecoder("utf-8", { fatal: true }).decode(body);
    event = new Resend("local-webhook-verification-only").webhooks.verify({ payload, headers, webhookSecret: secret });
  } catch { throw new OutboundEventError("INVALID_WEBHOOK_SIGNATURE", 401); }
  if ((event as { type?: unknown })?.type !== "email.sent") return null;
  const parsed = sentEvent.safeParse(event);
  if (!parsed.success) throw new OutboundEventError("INVALID_OUTBOUND_EVENT", 400);
  if (!/(?:^|<)management@portugalactive\.com(?:>|$)/i.test(parsed.data.data.from.trim())) return null;
  return { providerId: parsed.data.data.email_id, messageId: parsed.data.data.message_id };
}
/** Store only message correlation, never recipient addresses, bodies or private links. */
export async function recordOutboundMessage(event: { providerId: string; messageId: string }, now = new Date()) {
  if (!isOwnerIntakeProduction()) throw new OutboundEventError("PRODUCTION_REQUIRED", 503);
  const db = await getDb(); if (!db) throw new OutboundEventError("OUTBOUND_STORAGE_UNAVAILABLE", 503);
  const messageId = normalizeMessageId(event.messageId);
  if (!messageId) throw new OutboundEventError("INVALID_MESSAGE_ID", 400);
  const messageIdHash = createHash("sha256").update(messageId).digest("hex");
  await db.transaction(async tx => {
    await tx.execute(sql`INSERT IGNORE INTO owner_email_outbound_ids (messageIdHash,providerId,messageId,createdAt)
      VALUES (${messageIdHash},${event.providerId},${messageId},${now})`);
    const [rows] = await tx.execute(sql`SELECT providerId,messageId FROM owner_email_outbound_ids WHERE messageIdHash=${messageIdHash} FOR UPDATE`) as unknown as [{ providerId: string; messageId: string }[], unknown];
    if (rows[0]?.providerId !== event.providerId || rows[0]?.messageId !== messageId)
      throw new OutboundEventError("OUTBOUND_ID_CONFLICT", 409);
  });
}
