import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { isOwnerIntakeProduction } from "../owner-intake/email";
import { CrmError, type CrmEnquiry, type CrmFile, type CrmFieldState, type CrmLedger, type CrmOperation, type CrmSource } from "./types";
import { emptyFieldState, PROPERTY_FIELDS_VERSION } from "./fields";

export const CRM_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS owner_crm_links (
    sourceKey varchar(48) NOT NULL PRIMARY KEY, sourceVersion char(64) NULL,
    sourceModifiedAt datetime(3) NULL, status varchar(20) NOT NULL DEFAULT 'pending',
    personId bigint NULL, dealId bigint NULL, noteId bigint NULL, lastError varchar(60) NULL,
    nextAttemptAt datetime(3) NULL, updatedAt datetime(3) NOT NULL,
    INDEX idx_owner_crm_status (status, nextAttemptAt)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_crm_operations (
    operationKey varchar(150) NOT NULL PRIMARY KEY, status varchar(20) NOT NULL DEFAULT 'ready',
    remoteId bigint NULL, attemptedAt datetime(3) NULL, updatedAt datetime(3) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS owner_crm_lease (
    id varchar(20) NOT NULL PRIMARY KEY, leaseToken varchar(36) NULL, expiresAt datetime(3) NULL
  )`,
  `CREATE TABLE IF NOT EXISTS owner_crm_field_state (
    stateKey varchar(150) NOT NULL PRIMARY KEY, state json NOT NULL, updatedAt datetime(3) NOT NULL
  )`,
] as const;
type Executor = { execute(statement: SQL): Promise<unknown> };
const rows = <T>(result: unknown) => (result as [T[], unknown])[0];
const affected = (result: unknown) => Number((result as [{ affectedRows: number }, unknown])[0].affectedRows);
const object = (value: any): Record<string, any> => typeof value === "string" ? JSON.parse(value) : value || {};
async function database() {
  if (!isOwnerIntakeProduction()) throw new CrmError("PRODUCTION_REQUIRED", true);
  const db = await getDb(); if (!db) throw new CrmError("CRM_STORAGE_UNAVAILABLE"); return db;
}
export async function initialiseOwnerCrmSchema() {
  const db = await database(); for (const query of CRM_SCHEMA) await db.execute(sql.raw(query));
  await db.execute(sql`INSERT IGNORE INTO owner_crm_lease (id) VALUES ('sweep')`);
}
export async function acquireCrmLease() {
  const db = await database(); const token = randomUUID();
  const changed = affected(await db.execute(sql`UPDATE owner_crm_lease SET leaseToken = ${token}, expiresAt = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE)
    WHERE id = 'sweep' AND (expiresAt IS NULL OR expiresAt < UTC_TIMESTAMP(3))`));
  return changed === 1 ? token : null;
}
export async function releaseCrmLease(token: string) {
  const db = await database(); await db.execute(sql`UPDATE owner_crm_lease SET leaseToken = NULL, expiresAt = NULL WHERE id = 'sweep' AND leaseToken = ${token}`);
}
export function sqlLedger(token: string): CrmLedger {
  return {
    async fieldState(key) {
      const db = await database();
      const found = rows<{ state: CrmFieldState | string }>(await db.execute(sql`SELECT state FROM owner_crm_field_state WHERE stateKey = ${key} LIMIT 1`))[0];
      return found ? object(found.state) as CrmFieldState : emptyFieldState();
    },
    async saveFieldState(key, state) {
      const db = await database();
      const changed = affected(await db.execute(sql`INSERT INTO owner_crm_field_state (stateKey, state, updatedAt)
        SELECT ${key}, ${JSON.stringify(state)}, UTC_TIMESTAMP(3) FROM owner_crm_lease
        WHERE id = 'sweep' AND leaseToken = ${token} AND expiresAt > UTC_TIMESTAMP(3)
        ON DUPLICATE KEY UPDATE state = VALUES(state), updatedAt = UTC_TIMESTAMP(3)`));
      if (!changed) throw new CrmError("LEASE_LOST");
    },
    async checkpoint() {
      const db = await database();
      const changed = affected(await db.execute(sql`UPDATE owner_crm_lease SET expiresAt = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 5 MINUTE)
        WHERE id = 'sweep' AND leaseToken = ${token} AND expiresAt > UTC_TIMESTAMP(3)`));
      if (changed !== 1) throw new CrmError("LEASE_LOST");
    },
    async operation(key) {
      const db = await database();
      await db.execute(sql`INSERT IGNORE INTO owner_crm_operations (operationKey, updatedAt) VALUES (${key}, UTC_TIMESTAMP(3))`);
      const row = rows<any>(await db.execute(sql`SELECT operationKey, status, remoteId FROM owner_crm_operations WHERE operationKey = ${key} LIMIT 1`))[0];
      if (!row) throw new CrmError("CRM_STORAGE_UNAVAILABLE");
      return { key, status: row.status, remoteId: row.remoteId ? Number(row.remoteId) : null } as CrmOperation;
    },
    async attempting(key) {
      const db = await database();
      return affected(await db.execute(sql`UPDATE owner_crm_operations SET status = 'attempting', attemptedAt = UTC_TIMESTAMP(3), updatedAt = UTC_TIMESTAMP(3)
        WHERE operationKey = ${key} AND status = 'ready' AND remoteId IS NULL
        AND EXISTS (SELECT id FROM owner_crm_lease WHERE id = 'sweep' AND leaseToken = ${token} AND expiresAt > UTC_TIMESTAMP(3))`)) === 1;
    },
    async confirmed(key, remoteId) {
      const db = await database();
      const changed = affected(await db.execute(sql`UPDATE owner_crm_operations SET status = 'done', remoteId = ${remoteId}, updatedAt = UTC_TIMESTAMP(3)
        WHERE operationKey = ${key} AND (remoteId IS NULL OR remoteId = ${remoteId})
        AND EXISTS (SELECT id FROM owner_crm_lease WHERE id = 'sweep' AND leaseToken = ${token} AND expiresAt > UTC_TIMESTAMP(3))`));
      if (changed !== 1) throw new CrmError("REMOTE_MAPPING_OR_LEASE_CONFLICT", true);
    },
    async rejected(key) {
      const db = await database(); await db.execute(sql`UPDATE owner_crm_operations SET status = 'ready', updatedAt = UTC_TIMESTAMP(3)
        WHERE operationKey = ${key} AND status = 'attempting' AND remoteId IS NULL
        AND EXISTS (SELECT id FROM owner_crm_lease WHERE id = 'sweep' AND leaseToken = ${token} AND expiresAt > UTC_TIMESTAMP(3))`);
    },
  };
}
export async function crmCandidates(from: Date, source: CrmSource, limit = 20) {
  const db = await database();
  const testIds = (process.env.OWNER_AUTOMATION_TEST_IDS || "").split(",").map(v => v.trim()).filter(v => /^[0-9a-f-]{36}$/i.test(v));
  const authorizedTest = testIds.length ? sql`l.status = 'excluded' AND e.id IN (${sql.join(testIds.map(id => sql`${id}`), sql`, `)})` : sql`FALSE`;
  const readyEvidence = readyEmailEvidence(source);
  const pendingCleanup = pendingEmailCleanup(source);
  const query = source === "v4" ? sql`SELECT e.*, h.originalSourceKey, h.originalRequestedAt, ${readyEvidence} AS hasReadyEmailEvidence FROM owner_v4_enquiries e
    LEFT JOIN owner_crm_photo_requests h ON h.enquiryId = e.id LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v4:', e.id)
    WHERE (e.capturedAt >= ${from} OR ${readyEvidence}) AND (l.sourceKey IS NULL OR e.updatedAt > l.sourceModifiedAt
      OR (l.status = 'synced' AND NOT EXISTS (SELECT operationKey FROM owner_crm_operations WHERE operationKey = CONCAT('enquiry:v4:', e.id, ':', ${PROPERTY_FIELDS_VERSION}) AND status = 'done'))
      OR (l.status = 'synced' AND ${pendingCleanup})
      OR (l.status IN ('retry','review') AND l.nextAttemptAt <= UTC_TIMESTAMP(3)) OR (${authorizedTest})) ORDER BY e.capturedAt, e.id LIMIT ${limit}`
    : sql`SELECT e.*, ${readyEvidence} AS hasReadyEmailEvidence FROM owner_enquiries e LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v3:', e.id)
    WHERE (e.createdAt >= ${from} OR ${readyEvidence})
      AND NOT EXISTS (SELECT dealId FROM owner_crm_photo_requests h WHERE h.originalSourceKey = CONCAT('v3:', e.id) AND h.enquiryId <> e.id)
      AND (l.sourceKey IS NULL OR e.updatedAt > l.sourceModifiedAt
      OR (l.status = 'synced' AND NOT EXISTS (SELECT operationKey FROM owner_crm_operations WHERE operationKey = CONCAT('enquiry:v3:', e.id, ':', ${PROPERTY_FIELDS_VERSION}) AND status = 'done'))
      OR (l.status = 'synced' AND ${pendingCleanup})
      OR (l.status IN ('retry','review') AND l.nextAttemptAt <= UTC_TIMESTAMP(3)) OR (${authorizedTest})) ORDER BY e.createdAt, e.id LIMIT ${limit}`;
  const enquiries: CrmEnquiry[] = [];
  for (const row of rows<any>(await db.execute(query))) {
    const files = await crmFileMetadata(db, source, row.id);
    if (source === "v4") {
      const contact = object(row.contact);
      enquiries.push({ source, id: row.id, sourceKey: `${source}:${row.id}`, modifiedAt: new Date(row.updatedAt), capturedAt: new Date(row.capturedAt),
        name: contact.name, email: contact.email, phone: contact.phone || "", locality: contact.locality || "", type: contact.type || "",
        details: object(row.details), context: object(row.context), attribution: object(row.attribution), status: row.status,
        qualified: !!row.qualificationCompletedAt, files, privacyNoticeVersion: row.privacyNoticeVersion, hasReadyEmailEvidence: Number(row.hasReadyEmailEvidence) === 1,
        ...(row.originalSourceKey ? { originalSourceKey: row.originalSourceKey } : {}),
        ...(row.originalRequestedAt ? { originalRequestedAt: new Date(row.originalRequestedAt) } : {}) });
    } else {
      const p = object(row.payload);
      enquiries.push({ source, id: row.id, sourceKey: `${source}:${row.id}`, modifiedAt: new Date(row.updatedAt), capturedAt: new Date(row.createdAt),
        name: p.name, email: p.email, phone: p.phone || "", locality: p.address || "", type: p.type || "", details: p,
        context: p.context || { language: p.language || "pt" }, attribution: {}, status: p.qualificationIncomplete ? "awaiting_details" : "complete",
        qualified: !p.qualificationIncomplete, files, hasReadyEmailEvidence: Number(row.hasReadyEmailEvidence) === 1 });
    }
  }
  return enquiries;
}
// These flags come from the trusted importer journal, never public form fields.
function readyEmailEvidence(source: CrmSource) {
  return sql`EXISTS (SELECT 1 FROM owner_email_messages em WHERE em.sourceKey = CONCAT(${`${source}:`}, e.id)
    AND em.status = 'ready' AND em.dealId > 0 AND em.personId > 0)`;
}
function pendingEmailCleanup(source: CrmSource) {
  return sql`EXISTS (SELECT 1 FROM owner_email_files ef INNER JOIN owner_email_messages em ON em.messageKey = ef.messageKey
    WHERE em.sourceKey = CONCAT(${`${source}:`}, e.id) AND em.status = 'ready' AND ef.active = 1 AND ef.content IS NOT NULL)`;
}
async function crmFileMetadata(db: Executor, source: CrmSource, id: string) {
  const formFiles = source === "v4"
    ? sql`SELECT id, name, mimeType, size, digest, NULL AS origin FROM owner_v4_files WHERE enquiryId = ${id} AND active = 1`
    : sql`SELECT id, name, mimeType, size, digest, NULL AS origin FROM owner_enquiry_attachments WHERE enquiryId = ${id}`;
  // Email evidence remains separate from public uploads and their count/size limits.
  // Only the importer-confirmed request binding may project a file into its deal.
  return rows<CrmFile>(await db.execute(sql`${formFiles} UNION ALL
    SELECT f.id, f.name, f.mimeType, f.size, f.digest, 'email' AS origin FROM owner_email_files f
    INNER JOIN owner_email_messages m ON m.messageKey = f.messageKey
    WHERE m.sourceKey = ${`${source}:${id}`} AND m.status = 'ready' AND f.active = 1 ORDER BY id`));
}
export async function crmFileBytes(e: CrmEnquiry, file: CrmFile) {
  const db = await database();
  let found = rows<{ content: Buffer | null }>(await db.execute(e.source === "v4"
    ? sql`SELECT content FROM owner_v4_files WHERE enquiryId = ${e.id} AND id = ${file.id} AND digest = ${file.digest} AND active = 1 LIMIT 1`
    : sql`SELECT content FROM owner_enquiry_attachments WHERE enquiryId = ${e.id} AND id = ${file.id} AND digest = ${file.digest} LIMIT 1`))[0];
  found ||= rows<{ content: Buffer | null }>(await db.execute(sql`SELECT f.content FROM owner_email_files f
    INNER JOIN owner_email_messages m ON m.messageKey = f.messageKey
    WHERE m.sourceKey = ${e.sourceKey} AND m.status = 'ready' AND f.active = 1
      AND f.id = ${file.id} AND f.digest = ${file.digest} LIMIT 1`))[0];
  if (!found) throw new CrmError("FILE_CHANGED", false, true);
  if (found.content === null) throw new CrmError("FILE_CONTENT_RELEASED", true, true);
  return Buffer.from(found.content);
}
/** Release temporary transport copies only after the entire deal sync succeeded.
 * Metadata stays available for status, reminder suppression and digest idempotency.
 * The original Gmail attachment and the confirmed Pipedrive file remain intact.
 */
export async function releaseSyncedEmailBytes(token: string, e: CrmEnquiry, ids: { personId: number; dealId: number }) {
  const db = await database();
  await db.execute(sql`UPDATE owner_email_files f
    INNER JOIN owner_email_messages m ON m.messageKey = f.messageKey
    INNER JOIN owner_crm_links l ON l.sourceKey = m.sourceKey
    INNER JOIN owner_crm_operations deal ON deal.operationKey = CONCAT('enquiry:', m.sourceKey, ':deal') AND deal.status = 'done' AND deal.remoteId = l.dealId
    INNER JOIN owner_crm_operations person ON person.operationKey = CONCAT('enquiry:', m.sourceKey, ':person') AND person.status = 'done' AND person.remoteId = l.personId
    INNER JOIN owner_crm_operations upload ON upload.operationKey = CONCAT('enquiry:', m.sourceKey, ':file:', f.digest) AND upload.status = 'done' AND upload.remoteId > 0
    SET f.content = NULL, f.remoteFileId = upload.remoteId, f.syncedAt = COALESCE(f.syncedAt, UTC_TIMESTAMP(3))
    WHERE m.sourceKey = ${e.sourceKey} AND m.status = 'ready' AND f.active = 1 AND l.status = 'synced'
      AND l.dealId = ${ids.dealId} AND l.personId = ${ids.personId} AND m.dealId = l.dealId AND m.personId = l.personId
      AND (f.remoteFileId IS NULL OR f.remoteFileId = upload.remoteId)
      AND (f.content IS NOT NULL OR f.remoteFileId IS NULL OR f.syncedAt IS NULL)
      AND EXISTS (SELECT id FROM owner_crm_lease WHERE id = 'sweep' AND leaseToken = ${token} AND expiresAt > UTC_TIMESTAMP(3))`);
}
export async function saveCrmResult(token: string, e: CrmEnquiry, sourceVersion: string, status: "synced" | "excluded" | "retry" | "review",
  ids: { personId: number; dealId: number; noteId: number } | null = null, error: string | null = null) {
  const db = await database();
  const next = status === "review" ? new Date(Date.now() + 60 * 60_000) : status === "retry" ? new Date(Date.now() + 5 * 60_000) : null;
  const changed = affected(await db.execute(sql`INSERT INTO owner_crm_links (sourceKey, sourceVersion, sourceModifiedAt, status, personId, dealId, noteId, lastError, nextAttemptAt, updatedAt)
    SELECT ${e.sourceKey}, ${sourceVersion}, ${e.modifiedAt}, ${status}, ${ids?.personId || null}, ${ids?.dealId || null}, ${ids?.noteId || null}, ${error}, ${next}, UTC_TIMESTAMP(3)
    FROM owner_crm_lease WHERE id = 'sweep' AND leaseToken = ${token} AND expiresAt > UTC_TIMESTAMP(3)
    ON DUPLICATE KEY UPDATE sourceVersion = VALUES(sourceVersion), sourceModifiedAt = VALUES(sourceModifiedAt), status = VALUES(status),
      personId = COALESCE(VALUES(personId), personId), dealId = COALESCE(VALUES(dealId), dealId), noteId = COALESCE(VALUES(noteId), noteId),
      lastError = VALUES(lastError), nextAttemptAt = VALUES(nextAttemptAt), updatedAt = UTC_TIMESTAMP(3)`));
  if (!changed) throw new CrmError("LEASE_LOST");
}
export async function ownerCrmStatus() {
  const db = await database();
  const counts = rows<{ status: string; count: number }>(await db.execute(sql`SELECT status, COUNT(*) AS count FROM owner_crm_links GROUP BY status`));
  return Object.fromEntries(counts.map(row => [row.status, Number(row.count)]));
}
export async function crmDealForV4(enquiryId: string) {
  const db = await database();
  const linked = rows<{ dealId: number | null }>(await db.execute(sql`SELECT dealId FROM owner_crm_links WHERE sourceKey = ${`v4:${enquiryId}`} LIMIT 1`))[0]?.dealId;
  if (linked) return Number(linked);
  const operation = rows<{ remoteId: number | null }>(await db.execute(sql`SELECT remoteId FROM owner_crm_operations
    WHERE operationKey = ${`enquiry:v4:${enquiryId}:deal`} AND status = 'done' LIMIT 1`))[0]?.remoteId;
  return operation ? Number(operation) : null;
}
export async function crmStorageHealth() {
  try {
    const db = await database(); const from = new Date(process.env.OWNER_AUTOMATION_FROM || "2026-11-03T00:00:00Z");
    if (!Number.isFinite(+from)) return { storageReady: true, attentionRequired: true };
    await db.execute(sql`SELECT operationKey, remoteId FROM owner_crm_operations LIMIT 0`);
    await db.execute(sql`SELECT id, leaseToken FROM owner_crm_lease LIMIT 0`);
    await db.execute(sql`SELECT stateKey, state FROM owner_crm_field_state LIMIT 0`);
    const flagged = rows(await db.execute(sql`SELECT sourceKey FROM owner_crm_links WHERE status = 'review'
      OR (status = 'retry' AND sourceModifiedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)) LIMIT 1`)).length > 0;
    const v4Pending = rows(await db.execute(sql`SELECT e.id FROM owner_v4_enquiries e LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v4:', e.id)
      WHERE (e.capturedAt >= ${from} OR ${readyEmailEvidence("v4")}) AND e.updatedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)
      AND (l.sourceKey IS NULL OR (l.status <> 'excluded' AND (l.sourceModifiedAt IS NULL OR l.sourceModifiedAt < e.updatedAt))
        OR (l.status = 'synced' AND ${pendingEmailCleanup("v4")})
        OR (l.status = 'synced' AND NOT EXISTS (SELECT operationKey FROM owner_crm_operations WHERE operationKey = CONCAT('enquiry:v4:', e.id, ':', ${PROPERTY_FIELDS_VERSION}) AND status = 'done'))) LIMIT 1`)).length > 0;
    const v3Pending = rows(await db.execute(sql`SELECT e.id FROM owner_enquiries e LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v3:', e.id)
      WHERE (e.createdAt >= ${from} OR ${readyEmailEvidence("v3")}) AND e.updatedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)
      AND NOT EXISTS (SELECT dealId FROM owner_crm_photo_requests h WHERE h.originalSourceKey = CONCAT('v3:', e.id) AND h.enquiryId <> e.id)
      AND (l.sourceKey IS NULL OR (l.status <> 'excluded' AND (l.sourceModifiedAt IS NULL OR l.sourceModifiedAt < e.updatedAt))
        OR (l.status = 'synced' AND ${pendingEmailCleanup("v3")})
        OR (l.status = 'synced' AND NOT EXISTS (SELECT operationKey FROM owner_crm_operations WHERE operationKey = CONCAT('enquiry:v3:', e.id, ':', ${PROPERTY_FIELDS_VERSION}) AND status = 'done'))) LIMIT 1`)).length > 0;
    const replyPending = rows(await db.execute(sql`SELECT messageKey FROM owner_email_messages WHERE status='ready' AND bodyText IS NOT NULL AND replyNoteId IS NULL
      AND (replyError IS NOT NULL OR updatedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)) LIMIT 1`)).length > 0;
    return { storageReady: true, attentionRequired: flagged || v4Pending || v3Pending || replyPending };
  } catch { return { storageReady: false, attentionRequired: true }; }
}

/** Ready human replies are separate immutable notes, never a new lead/contact. */
export async function crmEmailReplies(limit = 20) {
  const db = await database();
  const found = rows<any>(await db.execute(sql`SELECT messageKey,sourceKey,dealId,personId,senderEmail,subject,receivedAt,bodyText
    FROM owner_email_messages WHERE status='ready' AND bodyText IS NOT NULL AND replyNoteId IS NULL
      AND (replyNextAttemptAt IS NULL OR replyNextAttemptAt<=UTC_TIMESTAMP(3)) ORDER BY receivedAt,messageKey LIMIT ${limit}`));
  return found.map(row => ({ ...row, dealId: Number(row.dealId), personId: Number(row.personId), receivedAt: new Date(row.receivedAt) })) as import("./replies").CrmEmailReply[];
}
export async function verifyCrmEmailReply(token: string, reply: import("./replies").CrmEmailReply) {
  const db = await database();
  const found = rows<any>(await db.execute(sql`SELECT m.messageKey FROM owner_email_messages m
    INNER JOIN owner_crm_links l ON l.sourceKey=m.sourceKey AND l.dealId=m.dealId AND l.personId=m.personId
    LEFT JOIN owner_v4_enquiries e4 ON m.sourceKey=CONCAT('v4:',e4.id)
    LEFT JOIN owner_enquiries e3 ON m.sourceKey=CONCAT('v3:',e3.id)
    WHERE m.messageKey=${reply.messageKey} AND m.sourceKey=${reply.sourceKey} AND m.dealId=${reply.dealId} AND m.personId=${reply.personId}
      AND m.senderEmail=${reply.senderEmail} AND m.status='ready' AND m.bodyText IS NOT NULL
      AND LOWER(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(e4.contact,'$.email')),JSON_UNQUOTE(JSON_EXTRACT(e3.payload,'$.email'))))=LOWER(m.senderEmail)
      AND NOT EXISTS (SELECT h.enquiryId FROM owner_crm_photo_requests h INNER JOIN owner_crm_links canonical ON canonical.sourceKey=CONCAT('v4:',h.enquiryId)
        AND canonical.dealId>0 AND canonical.personId>0 WHERE h.originalSourceKey=m.sourceKey)
      AND EXISTS (SELECT id FROM owner_crm_lease WHERE id='sweep' AND leaseToken=${token} AND expiresAt>UTC_TIMESTAMP(3)) LIMIT 1`));
  if (found.length !== 1) throw new CrmError("REPLY_BINDING_OR_LEASE_CHANGED", true);
}
export async function saveCrmEmailReply(token: string, reply: import("./replies").CrmEmailReply, noteId: number | null, error?: CrmError) {
  const db = await database();
  if (noteId !== null) {
    await verifyCrmEmailReply(token, reply);
    const changed = affected(await db.execute(sql`UPDATE owner_email_messages m INNER JOIN owner_crm_links l ON l.sourceKey=m.sourceKey
      AND l.personId=m.personId AND l.dealId=m.dealId SET m.replyNoteId=${noteId},m.replyError=NULL,m.replyNextAttemptAt=NULL
      WHERE m.messageKey=${reply.messageKey} AND m.sourceKey=${reply.sourceKey} AND m.personId=${reply.personId} AND m.dealId=${reply.dealId} AND m.status='ready'
        AND (m.replyNoteId IS NULL OR m.replyNoteId=${noteId})
        AND EXISTS (SELECT operationKey FROM owner_crm_operations WHERE operationKey=${`owner-reply:${reply.messageKey}:note`} AND status='done' AND remoteId=${noteId})
        AND EXISTS (SELECT id FROM owner_crm_lease WHERE id='sweep' AND leaseToken=${token} AND expiresAt>UTC_TIMESTAMP(3))`));
    if (changed !== 1) throw new CrmError("REPLY_MAPPING_OR_LEASE_CHANGED", true);
  } else {
    await db.execute(sql`UPDATE owner_email_messages SET replyError=${error?.code || "REPLY_SYNC_UNAVAILABLE"},
      replyNextAttemptAt=DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${error?.review ? 60 : 5} MINUTE)
      WHERE messageKey=${reply.messageKey} AND replyNoteId IS NULL
        AND EXISTS (SELECT id FROM owner_crm_lease WHERE id='sweep' AND leaseToken=${token} AND expiresAt>UTC_TIMESTAMP(3))`);
  }
}
