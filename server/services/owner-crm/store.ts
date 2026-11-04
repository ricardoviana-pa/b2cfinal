import { randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";
import { getDb } from "../../db";
import { isOwnerIntakeProduction } from "../owner-intake/email";
import { CrmError, type CrmEnquiry, type CrmFile, type CrmLedger, type CrmOperation, type CrmSource } from "./types";

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
  const query = source === "v4" ? sql`SELECT e.* FROM owner_v4_enquiries e LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v4:', e.id)
    WHERE e.capturedAt >= ${from} AND (l.sourceKey IS NULL OR e.updatedAt > l.sourceModifiedAt
      OR (l.status IN ('retry','review') AND l.nextAttemptAt <= UTC_TIMESTAMP(3)) OR (${authorizedTest})) ORDER BY e.capturedAt, e.id LIMIT ${limit}`
    : sql`SELECT e.* FROM owner_enquiries e LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v3:', e.id)
    WHERE e.createdAt >= ${from} AND (l.sourceKey IS NULL OR e.updatedAt > l.sourceModifiedAt
      OR (l.status IN ('retry','review') AND l.nextAttemptAt <= UTC_TIMESTAMP(3)) OR (${authorizedTest})) ORDER BY e.createdAt, e.id LIMIT ${limit}`;
  const enquiries: CrmEnquiry[] = [];
  for (const row of rows<any>(await db.execute(query))) {
    const files = await crmFileMetadata(db, source, row.id);
    if (source === "v4") {
      const contact = object(row.contact);
      enquiries.push({ source, id: row.id, sourceKey: `${source}:${row.id}`, modifiedAt: new Date(row.updatedAt), capturedAt: new Date(row.capturedAt),
        name: contact.name, email: contact.email, phone: contact.phone || "", locality: contact.locality || "", type: contact.type || "",
        details: object(row.details), context: object(row.context), attribution: object(row.attribution), status: row.status,
        qualified: !!row.qualificationCompletedAt, files });
    } else {
      const p = object(row.payload);
      enquiries.push({ source, id: row.id, sourceKey: `${source}:${row.id}`, modifiedAt: new Date(row.updatedAt), capturedAt: new Date(row.createdAt),
        name: p.name, email: p.email, phone: p.phone || "", locality: p.address || "", type: p.type || "", details: p,
        context: p.context || { language: p.language || "pt" }, attribution: {}, status: p.qualificationIncomplete ? "awaiting_details" : "complete",
        qualified: !p.qualificationIncomplete, files });
    }
  }
  return enquiries;
}
async function crmFileMetadata(db: Executor, source: CrmSource, id: string) {
  return rows<CrmFile>(await db.execute(source === "v4"
    ? sql`SELECT id, name, mimeType, size, digest FROM owner_v4_files WHERE enquiryId = ${id} AND active = 1 ORDER BY id`
    : sql`SELECT id, name, mimeType, size, digest FROM owner_enquiry_attachments WHERE enquiryId = ${id} ORDER BY id`));
}
export async function crmFileBytes(e: CrmEnquiry, file: CrmFile) {
  const db = await database();
  const found = rows<{ content: Buffer }>(await db.execute(e.source === "v4"
    ? sql`SELECT content FROM owner_v4_files WHERE enquiryId = ${e.id} AND id = ${file.id} AND digest = ${file.digest} AND active = 1 LIMIT 1`
    : sql`SELECT content FROM owner_enquiry_attachments WHERE enquiryId = ${e.id} AND id = ${file.id} AND digest = ${file.digest} LIMIT 1`))[0];
  if (!found) throw new CrmError("FILE_CHANGED", false, true); return Buffer.from(found.content);
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
    const flagged = rows(await db.execute(sql`SELECT sourceKey FROM owner_crm_links WHERE status = 'review'
      OR (status = 'retry' AND sourceModifiedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)) LIMIT 1`)).length > 0;
    const v4Pending = rows(await db.execute(sql`SELECT e.id FROM owner_v4_enquiries e LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v4:', e.id)
      WHERE e.capturedAt >= ${from} AND e.updatedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)
      AND (l.sourceKey IS NULL OR (l.status <> 'excluded' AND (l.sourceModifiedAt IS NULL OR l.sourceModifiedAt < e.updatedAt))) LIMIT 1`)).length > 0;
    const v3Pending = rows(await db.execute(sql`SELECT e.id FROM owner_enquiries e LEFT JOIN owner_crm_links l ON l.sourceKey = CONCAT('v3:', e.id)
      WHERE e.createdAt >= ${from} AND e.updatedAt < DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 15 MINUTE)
      AND (l.sourceKey IS NULL OR (l.status <> 'excluded' AND (l.sourceModifiedAt IS NULL OR l.sourceModifiedAt < e.updatedAt))) LIMIT 1`)).length > 0;
    return { storageReady: true, attentionRequired: flagged || v4Pending || v3Pending };
  } catch { return { storageReady: false, attentionRequired: true }; }
}
