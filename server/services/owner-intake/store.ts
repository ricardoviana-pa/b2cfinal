import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { isPreviewDeployment } from "../../lib/preview-isolation";
import {
  type OwnerNotificationStatus, type OwnerStoredFields,
} from "../../../shared/owner-intake";
import { OwnerIntakeError, type ValidatedOwnerIntake } from "./validation";

export interface OwnerMail { from: string; to: string; replyTo: string; subject: string; html: string; text: string }
export interface OwnerRecord {
  id: string; fingerprint: string; payload: OwnerStoredFields; attachmentCount: number;
  notificationStatus: OwnerNotificationStatus; notificationAttempts: number;
  notificationLastError: string | null; notificationFirstAttemptAt: Date | null;
  notificationLeaseAt: Date | null; notificationNextAttemptAt: Date | null;
  notificationProviderId: string | null; notificationMail: OwnerMail;
  createdAt: Date; updatedAt: Date;
}
type Executor = { execute(query: SQL): Promise<unknown> };

// Additive tables only. Existing lead/customer/booking tables are never altered.
export const OWNER_SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS owner_enquiries (
    id varchar(36) NOT NULL PRIMARY KEY,
    fingerprint char(64) NOT NULL,
    payload json NOT NULL,
    attachmentCount int NOT NULL DEFAULT 0,
    notificationStatus varchar(20) NOT NULL DEFAULT 'pending',
    notificationAttempts int NOT NULL DEFAULT 0,
    notificationLastError varchar(40) NULL,
    notificationFirstAttemptAt datetime(3) NULL,
    notificationLeaseAt datetime(3) NULL,
    notificationNextAttemptAt datetime(3) NULL,
    notificationProviderId varchar(128) NULL,
    notificationMail json NOT NULL,
    createdAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_owner_created (createdAt, id),
    INDEX idx_owner_notification (notificationStatus, notificationNextAttemptAt)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_enquiry_attachments (
    id varchar(48) NOT NULL PRIMARY KEY,
    enquiryId varchar(36) NOT NULL,
    name varchar(180) NOT NULL,
    mimeType varchar(50) NOT NULL,
    size int NOT NULL,
    digest char(64) NOT NULL,
    content mediumblob NOT NULL,
    INDEX idx_owner_attachment_enquiry (enquiryId)
  )`,
] as const;

export async function initialiseOwnerIntakeSchema() {
  if (isPreviewDeployment()) return false;
  const db = await getDb();
  if (!db) return false;
  for (const statement of OWNER_SCHEMA_STATEMENTS) await db.execute(sql.raw(statement));
  return ownerSchemaReady();
}

function rows<T>(result: unknown): T[] { return (result as [T[], unknown])[0]; }
function affected(result: unknown): number { return Number((result as [{ affectedRows: number }, unknown])[0].affectedRows); }
function object<T>(value: T | string): T { return typeof value === "string" ? JSON.parse(value) : value; }
function record(raw: any): OwnerRecord {
  return { ...raw, payload: object(raw.payload), notificationMail: object(raw.notificationMail),
    createdAt: new Date(raw.createdAt), updatedAt: new Date(raw.updatedAt),
    notificationFirstAttemptAt: raw.notificationFirstAttemptAt ? new Date(raw.notificationFirstAttemptAt) : null,
    notificationLeaseAt: raw.notificationLeaseAt ? new Date(raw.notificationLeaseAt) : null,
    notificationNextAttemptAt: raw.notificationNextAttemptAt ? new Date(raw.notificationNextAttemptAt) : null };
}
async function database() {
  const db = await getDb();
  if (!db) throw new OwnerIntakeError("INTAKE_UNAVAILABLE");
  return db;
}
export async function ownerSchemaReady() {
  try {
    const db = await database();
    await db.execute(sql`SELECT id, fingerprint, payload, notificationMail, notificationFirstAttemptAt, notificationNextAttemptAt FROM owner_enquiries LIMIT 0`);
    await db.execute(sql`SELECT id, enquiryId, name, mimeType, size, digest, content FROM owner_enquiry_attachments LIMIT 0`);
    return true;
  } catch { return false; }
}
async function findRecord(db: Executor, id: string): Promise<OwnerRecord | undefined> {
  const found = rows<any>(await db.execute(sql`SELECT * FROM owner_enquiries WHERE id = ${id} LIMIT 1`))[0];
  return found ? record(found) : undefined;
}

/** A single transaction makes a lead, all its files and its outbox intent durable. */
export async function saveOwnerIntake(input: ValidatedOwnerIntake, mail: OwnerMail): Promise<{ duplicate: boolean; reference: string }> {
  const db = await database();
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO owner_enquiries (id, fingerprint, payload, attachmentCount, notificationMail)
        VALUES (${input.fields.requestId}, ${input.fingerprint}, ${JSON.stringify(input.fields)}, ${input.attachments.length}, ${JSON.stringify(mail)})`);
      for (const file of input.attachments) await tx.execute(sql`INSERT INTO owner_enquiry_attachments
        (id, enquiryId, name, mimeType, size, digest, content)
        VALUES (${file.id}, ${input.fields.requestId}, ${file.name}, ${file.mimeType}, ${file.size}, ${file.digest}, ${file.bytes})`);
    });
    return { duplicate: false, reference: input.fields.requestId };
  } catch (error: any) {
    // Driver errors can be wrapped by Drizzle. Never log their SQL/values (PII).
    if (error?.code === "ER_DUP_ENTRY" || error?.cause?.code === "ER_DUP_ENTRY" || error?.errno === 1062 || error?.cause?.errno === 1062) {
      const existing = await findRecord(db, input.fields.requestId);
      if (existing?.fingerprint === input.fingerprint) return { duplicate: true, reference: existing.id };
      if (existing) throw new OwnerIntakeError("REQUEST_ID_CONFLICT", 409);
    }
    throw new OwnerIntakeError("INTAKE_UNAVAILABLE");
  }
}

export async function ownerNotificationFiles(enquiryId: string) {
  const db = await database();
  return rows<{ name: string; mimeType: string; content: Buffer }>(await db.execute(sql`SELECT name, mimeType, content FROM owner_enquiry_attachments WHERE enquiryId = ${enquiryId} ORDER BY id`));
}
export async function ownerDeliveryAttentionRequired(now = new Date()) {
  const db = await database();
  const stale = new Date(now.getTime() - 30 * 60_000);
  return rows<{ id: string }>(await db.execute(sql`SELECT id FROM owner_enquiries WHERE notificationStatus = 'needs_review'
    OR (notificationStatus <> 'sent' AND createdAt < ${stale}) LIMIT 1`)).length > 0;
}

/** Atomic claim + lease, so several workers/restarts do not send independently. */
export async function claimOwnerNotification(id: string, now: Date): Promise<OwnerRecord | null> {
  const db = await database();
  const staleLease = new Date(now.getTime() - 5 * 60_000);
  const oldestSafeRetry = new Date(now.getTime() - 20 * 60 * 60_000);
  // Resend retains keys 24h. Stop before that window rather than risk a second email.
  await db.execute(sql`UPDATE owner_enquiries SET notificationStatus = 'needs_review', notificationLastError = 'DELIVERY_REVIEW_REQUIRED', notificationLeaseAt = NULL
    WHERE id = ${id} AND notificationStatus IN ('pending', 'failed', 'sending') AND notificationFirstAttemptAt < ${oldestSafeRetry}`);
  const result = await db.execute(sql`UPDATE owner_enquiries SET notificationStatus = 'sending', notificationLeaseAt = ${now},
    notificationFirstAttemptAt = COALESCE(notificationFirstAttemptAt, ${now}), notificationAttempts = notificationAttempts + 1
    WHERE id = ${id} AND ((notificationStatus IN ('pending', 'failed') AND (notificationNextAttemptAt IS NULL OR notificationNextAttemptAt <= ${now}))
      OR (notificationStatus = 'sending' AND notificationLeaseAt < ${staleLease}))`);
  if (affected(result) !== 1) return null;
  return (await findRecord(db, id)) || null;
}
export async function markOwnerNotificationSent(id: string, leaseAt: Date, providerId: string) {
  const db = await database();
  await db.execute(sql`UPDATE owner_enquiries SET notificationStatus = 'sent', notificationProviderId = ${providerId}, notificationLastError = NULL, notificationLeaseAt = NULL, notificationNextAttemptAt = NULL
    WHERE id = ${id} AND notificationStatus = 'sending' AND notificationLeaseAt = ${leaseAt}`);
}
export async function markOwnerNotificationFailed(id: string, leaseAt: Date, nextAttempt: Date) {
  const db = await database();
  await db.execute(sql`UPDATE owner_enquiries SET notificationStatus = 'failed', notificationLastError = 'PROVIDER_UNCONFIRMED', notificationLeaseAt = NULL, notificationNextAttemptAt = ${nextAttempt}
    WHERE id = ${id} AND notificationStatus = 'sending' AND notificationLeaseAt = ${leaseAt}`);
}
export async function pendingOwnerNotificationIds(now: Date) {
  const db = await database();
  const stale = new Date(now.getTime() - 5 * 60_000);
  return rows<{ id: string }>(await db.execute(sql`SELECT id FROM owner_enquiries
    WHERE (notificationStatus IN ('pending', 'failed') AND (notificationNextAttemptAt IS NULL OR notificationNextAttemptAt <= ${now}))
      OR (notificationStatus = 'sending' AND notificationLeaseAt < ${stale})
    ORDER BY createdAt ASC LIMIT 20`)).map(row => row.id);
}
export async function notificationState(id: string): Promise<OwnerNotificationStatus | undefined> {
  const db = await database();
  return rows<{ notificationStatus: OwnerNotificationStatus }>(await db.execute(sql`SELECT notificationStatus FROM owner_enquiries WHERE id = ${id} LIMIT 1`))[0]?.notificationStatus;
}
