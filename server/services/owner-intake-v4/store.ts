import { sql, type SQL } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../../db";
import { isOwnerIntakeProduction } from "../owner-intake/email";
import { OWNER_FILE_COUNT_LIMIT, OWNER_TOTAL_FILE_LIMIT } from "../../../shared/owner-intake";
import { OWNER_V4_TOKEN_DAYS, OWNER_V4_FILE_HISTORY_BYTES, OWNER_V4_FILE_HISTORY_COUNT, type OwnerV4Draft, type OwnerV4Mutation, type OwnerV4Receipt, type OwnerV4Start, type OwnerV4StartReceipt } from "../../../shared/owner-intake-v4";
import { OwnerIntakeError, completeDetails, fingerprint, newToken, tokenHash, type V4File } from "./validation";
import { managementCompletedMail, managementStartMail, welcomeMail } from "./email";
import type { V4Record, V4FileMetadata, V4Outbox, V4OutboxPayload } from "./types";

export const V4_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS owner_v4_enquiries (
    id varchar(36) NOT NULL PRIMARY KEY, startFingerprint char(64) NOT NULL,
    contact json NOT NULL, context json NOT NULL, attribution json NULL, details json NULL,
    status varchar(24) NOT NULL DEFAULT 'awaiting_details', tokenHash char(64) NOT NULL,
    tokenExpiresAt datetime(3) NOT NULL, revision int NOT NULL DEFAULT 0, completedFingerprint char(64) NULL,
    capturedAt datetime(3) NOT NULL, updatedAt datetime(3) NOT NULL, privacyAcknowledgedAt datetime(3) NOT NULL,
    privacyNoticeVersion varchar(40) NOT NULL, qualificationCompletedAt datetime(3) NULL,
    mediaReceivedAt datetime(3) NULL, awaitingPhotosAt datetime(3) NULL, completionCount int NOT NULL DEFAULT 0,
    mediaFileCount int NOT NULL DEFAULT 0, UNIQUE INDEX idx_owner_v4_token (tokenHash), INDEX idx_owner_v4_captured (capturedAt)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_v4_files (
    id varchar(36) NOT NULL PRIMARY KEY, enquiryId varchar(36) NOT NULL, name varchar(180) NOT NULL,
    mimeType varchar(50) NOT NULL, size int NOT NULL, digest char(64) NOT NULL, content mediumblob NOT NULL,
    active tinyint NOT NULL DEFAULT 1, createdAt datetime(3) NOT NULL,
    INDEX idx_owner_v4_files (enquiryId, active)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_v4_mutations (
    enquiryId varchar(36) NOT NULL, id varchar(36) NOT NULL, fingerprint char(64) NOT NULL,
    response json NOT NULL, createdAt datetime(3) NOT NULL, PRIMARY KEY (enquiryId, id)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_v4_outbox (
    id varchar(100) NOT NULL PRIMARY KEY, enquiryId varchar(36) NOT NULL, kind varchar(24) NOT NULL,
    payload json NOT NULL, attachmentBytes int NOT NULL DEFAULT 0,
    status varchar(20) NOT NULL DEFAULT 'pending', attempts int NOT NULL DEFAULT 0,
    leaseAt datetime(3) NULL, firstAttemptAt datetime(3) NULL, nextAttemptAt datetime(3) NULL,
    providerId varchar(128) NULL, lastError varchar(40) NULL, createdAt datetime(3) NOT NULL,
    INDEX idx_owner_v4_pending (status, nextAttemptAt), INDEX idx_owner_v4_enquiry (enquiryId)
  )`,
] as const;
type Executor = { execute(statement: SQL): Promise<unknown> };
const rows = <T>(result: unknown) => (result as [T[], unknown])[0];
const affected = (result: unknown) => Number((result as [{ affectedRows: number }, unknown])[0].affectedRows);
const obj = <T>(value: T | string): T => typeof value === "string" ? JSON.parse(value) : value;
const date = (value: any) => value ? new Date(value) : null;
function record(row: any): V4Record { return { ...row, contact: obj(row.contact), context: obj(row.context), attribution: obj(row.attribution),
  details: obj(row.details), tokenExpiresAt: new Date(row.tokenExpiresAt), capturedAt: new Date(row.capturedAt), updatedAt: new Date(row.updatedAt), privacyAcknowledgedAt: new Date(row.privacyAcknowledgedAt),
  qualificationCompletedAt: date(row.qualificationCompletedAt), mediaReceivedAt: date(row.mediaReceivedAt), awaitingPhotosAt: date(row.awaitingPhotosAt) }; }
async function database() {
  if (!isOwnerIntakeProduction()) throw new OwnerIntakeError("INTAKE_UNAVAILABLE");
  const db = await getDb(); if (!db) throw new OwnerIntakeError("INTAKE_UNAVAILABLE"); return db;
}
export async function initialiseV4Schema() {
  if (!isOwnerIntakeProduction()) return false;
  const db = await database(); for (const statement of V4_SCHEMA) await db.execute(sql.raw(statement)); return v4SchemaReady();
}
export async function v4SchemaReady() {
  try {
    const db = await database();
    await db.execute(sql`SELECT id, contact, tokenHash, tokenExpiresAt, completionCount, privacyAcknowledgedAt, privacyNoticeVersion FROM owner_v4_enquiries LIMIT 0`);
    await db.execute(sql`SELECT id, digest, content, active FROM owner_v4_files LIMIT 0`);
    await db.execute(sql`SELECT id, fingerprint, response FROM owner_v4_mutations LIMIT 0`);
    await db.execute(sql`SELECT id, payload, attachmentBytes, leaseAt FROM owner_v4_outbox LIMIT 0`);
    return true;
  } catch { return false; }
}
export async function authenticateV4(token: string, now = new Date()) {
  const db = await database();
  const found = rows<any>(await db.execute(sql`SELECT * FROM owner_v4_enquiries WHERE tokenHash = ${tokenHash(token)} AND tokenExpiresAt > ${now} LIMIT 1`))[0];
  if (!found) throw new OwnerIntakeError("TOKEN_INVALID_OR_EXPIRED", 401); return record(found);
}
async function locked(tx: Executor, auth: V4Record, now: Date) {
  const row = rows<any>(await tx.execute(sql`SELECT * FROM owner_v4_enquiries WHERE id = ${auth.id} FOR UPDATE`))[0];
  if (!row) throw new OwnerIntakeError("TOKEN_INVALID_OR_EXPIRED", 401);
  const found = record(row);
  if (found.tokenHash !== auth.tokenHash || found.tokenExpiresAt <= now) throw new OwnerIntakeError("TOKEN_INVALID_OR_EXPIRED", 401);
  return found;
}
async function fileMetadata(tx: Executor, id: string) {
  return rows<V4FileMetadata>(await tx.execute(sql`SELECT id, name, mimeType, size, digest, active FROM owner_v4_files WHERE enquiryId = ${id} AND active = 1 ORDER BY createdAt, id`));
}
async function outbox(tx: Executor, id: string, enquiryId: string, kind: string, payload: V4OutboxPayload, bytes: number, now: Date) {
  await tx.execute(sql`INSERT INTO owner_v4_outbox (id, enquiryId, kind, payload, attachmentBytes, createdAt)
    VALUES (${id}, ${enquiryId}, ${kind}, ${JSON.stringify(payload)}, ${bytes}, ${now})`);
}
function duplicateKey(error: any) { return error?.code === "ER_DUP_ENTRY" || error?.cause?.code === "ER_DUP_ENTRY" || error?.errno === 1062 || error?.cause?.errno === 1062; }
const receipt = (r: V4Record, duplicate = false): OwnerV4Receipt => ({ success: true, reference: r.id, status: r.status, duplicate });
export async function startV4(input: OwnerV4Start, now = new Date()): Promise<OwnerV4StartReceipt> {
  const db = await database(); const fp = fingerprint(input); const token = newToken();
  const completionUrl = `https://www.portugalactive.com/management/complete/?lang=${input.context.language}#token=${token}`;
  const r: V4Record = { id: input.requestId, startFingerprint: fp, contact: { name: input.name, email: input.email, phone: input.phone, type: input.type, locality: input.locality },
    context: input.context, attribution: input.attribution || null, details: null, status: "awaiting_details", tokenHash: tokenHash(token),
    tokenExpiresAt: new Date(now.getTime() + OWNER_V4_TOKEN_DAYS * 86400_000), revision: 0, completedFingerprint: null,
    capturedAt: now, updatedAt: now, privacyAcknowledgedAt: now, privacyNoticeVersion: "owner-intake-v4",
    qualificationCompletedAt: null, mediaReceivedAt: null, awaitingPhotosAt: null, completionCount: 0, mediaFileCount: 0 };
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`INSERT INTO owner_v4_enquiries (id, startFingerprint, contact, context, attribution, tokenHash, tokenExpiresAt, capturedAt, updatedAt, privacyAcknowledgedAt, privacyNoticeVersion)
        VALUES (${r.id}, ${fp}, ${JSON.stringify(r.contact)}, ${JSON.stringify(r.context)}, ${r.attribution ? JSON.stringify(r.attribution) : null}, ${r.tokenHash}, ${r.tokenExpiresAt}, ${now}, ${now}, ${now}, ${r.privacyNoticeVersion})`);
      // The link necessarily exists in the private frozen welcome payload, never in logs or analytics.
      await outbox(tx, `${r.id}:welcome`, r.id, "welcome", { mail: welcomeMail(r, completionUrl), fileIds: [], completionUrl }, 0, now);
      await outbox(tx, `${r.id}:captured`, r.id, "captured", { mail: managementStartMail(r), fileIds: [] }, 0, now);
    });
    return { ...receipt(r), continuationToken: token, completionUrl };
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const row = rows<any>(await db.execute(sql`SELECT * FROM owner_v4_enquiries WHERE id = ${r.id} LIMIT 1`))[0];
    if (!row || row.startFingerprint !== fp) throw new OwnerIntakeError("REQUEST_ID_CONFLICT", 409);
    const existing = record(row);
    if (existing.tokenExpiresAt <= now) throw new OwnerIntakeError("TOKEN_INVALID_OR_EXPIRED", 401);
    const original = rows<{ payload: V4OutboxPayload | string }>(await db.execute(sql`SELECT payload FROM owner_v4_outbox WHERE id = ${`${r.id}:welcome`} LIMIT 1`))[0];
    const url = original && obj(original.payload).completionUrl;
    const originalToken = url?.split("#token=")[1];
    if (!url || !originalToken || tokenHash(originalToken) !== existing.tokenHash) throw new OwnerIntakeError("INTAKE_UNAVAILABLE");
    return { ...receipt(existing, true), completionUrl: url, continuationToken: originalToken };
  }
}
export async function draftV4(auth: V4Record): Promise<OwnerV4Draft> {
  const db = await database();
  return db.transaction(async tx => {
    const r = await locked(tx, auth, new Date()); const files = await fileMetadata(tx, r.id);
    return { success: true, reference: r.id, status: r.status, contact: r.contact, details: r.details,
      files: files.map(({ id, name, mimeType, size }) => ({ id, name, mimeType, size })),
      context: r.context, ...(r.attribution ? { attribution: r.attribution } : {}), expiresAt: r.tokenExpiresAt.toISOString() };
  });
}
async function persistRecord(tx: Executor, r: V4Record) {
  await tx.execute(sql`UPDATE owner_v4_enquiries SET contact = ${JSON.stringify(r.contact)}, details = ${r.details ? JSON.stringify(r.details) : null},
    status = ${r.status}, revision = ${r.revision}, completedFingerprint = ${r.completedFingerprint}, updatedAt = ${r.updatedAt},
    qualificationCompletedAt = ${r.qualificationCompletedAt}, mediaReceivedAt = ${r.mediaReceivedAt}, awaitingPhotosAt = ${r.awaitingPhotosAt},
    completionCount = ${r.completionCount}, mediaFileCount = ${r.mediaFileCount} WHERE id = ${r.id}`);
}
function withPhotos(r: V4Record, files: V4FileMetadata[]) { return !!r.details?.photosLink || files.some(f => f.mimeType.startsWith("image/")); }
export async function mutateV4(auth: V4Record, input: OwnerV4Mutation, complete: boolean, now = new Date()): Promise<OwnerV4Receipt> {
  const db = await database(); const fp = fingerprint({ input, complete });
  return db.transaction(async tx => {
    const r = await locked(tx, auth, now);
    const previous = rows<{ fingerprint: string; response: OwnerV4Receipt | string }>(await tx.execute(sql`SELECT fingerprint, response FROM owner_v4_mutations WHERE enquiryId = ${r.id} AND id = ${input.mutationId} LIMIT 1`))[0];
    if (previous) {
      if (previous.fingerprint !== fp) throw new OwnerIntakeError("MUTATION_ID_CONFLICT", 409);
      return { ...obj(previous.response), duplicate: true };
    }
    r.contact = { ...r.contact, ...input.contact };
    r.details = { ...r.details, ...input.details };
    const files = await fileMetadata(tx, r.id); let unchangedCompletion = false;
    if (complete) {
      r.details = completeDetails(r.details);
      const completed = fingerprint({ contact: r.contact, details: r.details, files: files.map(f => ({ id: f.id, digest: f.digest })) });
      unchangedCompletion = completed === r.completedFingerprint;
      r.status = withPhotos(r, files) ? "complete" : "awaiting_photos";
      r.qualificationCompletedAt ||= now;
      if (r.details.photosLink) r.mediaReceivedAt ||= now;
      // Lifecycle timestamps record the first occurrence; status records the current state.
      if (r.status === "awaiting_photos") r.awaitingPhotosAt ||= now;
      if (!unchangedCompletion) {
        r.completionCount++; r.completedFingerprint = completed;
        await outbox(tx, `${r.id}:completed:${r.completionCount}`, r.id, "completed",
          { mail: managementCompletedMail(r, files), fileIds: files.map(f => f.id) }, files.reduce((sum, f) => sum + f.size, 0), now);
      }
    } else {
      // A saved draft may deliberately contain incomplete answers; no completion email is emitted.
      r.status = "awaiting_details";
    }
    r.revision++; r.updatedAt = now;
    await persistRecord(tx, r);
    const result = receipt(r, unchangedCompletion);
    await tx.execute(sql`INSERT INTO owner_v4_mutations (enquiryId, id, fingerprint, response, createdAt)
      VALUES (${r.id}, ${input.mutationId}, ${fp}, ${JSON.stringify(result)}, ${now})`);
    return result;
  });
}
export async function addV4File(auth: V4Record, file: V4File, now = new Date()) {
  const db = await database();
  return db.transaction(async tx => {
    const r = await locked(tx, auth, now);
    const existing = rows<V4FileMetadata & { enquiryId: string }>(await tx.execute(sql`SELECT id, enquiryId, name, mimeType, size, digest, active FROM owner_v4_files WHERE id = ${file.id} LIMIT 1`))[0];
    if (existing) {
      if (existing.enquiryId !== r.id || existing.digest !== file.digest || existing.name !== file.name || existing.mimeType !== file.mimeType || !existing.active)
        throw new OwnerIntakeError("FILE_ID_CONFLICT", 409);
      return { ...receipt(r, true), file: { id: existing.id, name: existing.name, mimeType: existing.mimeType, size: existing.size } };
    }
    const files = await fileMetadata(tx, r.id);
    if (files.length >= OWNER_FILE_COUNT_LIMIT || files.reduce((sum, f) => sum + f.size, 0) + file.size > OWNER_TOTAL_FILE_LIMIT)
      throw new OwnerIntakeError("PAYLOAD_TOO_LARGE", 413, ["attachments"]);
    const history = rows<{ count: number; bytes: number }>(await tx.execute(sql`SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM owner_v4_files WHERE enquiryId = ${r.id}`))[0];
    if (!history) throw new OwnerIntakeError("INTAKE_UNAVAILABLE");
    if (Number(history.count) >= OWNER_V4_FILE_HISTORY_COUNT || Number(history.bytes) + file.size > OWNER_V4_FILE_HISTORY_BYTES)
      throw new OwnerIntakeError("ATTACHMENT_HISTORY_LIMIT", 413, ["attachments"]);
    await tx.execute(sql`INSERT INTO owner_v4_files (id, enquiryId, name, mimeType, size, digest, content, createdAt)
      VALUES (${file.id}, ${r.id}, ${file.name}, ${file.mimeType}, ${file.size}, ${file.digest}, ${file.bytes}, ${now})`);
    r.mediaFileCount = files.length + 1; r.mediaReceivedAt ||= now; r.updatedAt = now; r.revision++;
    await persistRecord(tx, r);
    return { ...receipt(r), file: { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size } };
  });
}
export async function removeV4File(auth: V4Record, id: string, now = new Date()) {
  const db = await database();
  return db.transaction(async tx => {
    const r = await locked(tx, auth, now);
    const existing = rows<{ enquiryId: string }>(await tx.execute(sql`SELECT enquiryId FROM owner_v4_files WHERE id = ${id} LIMIT 1`))[0];
    let changed = 0;
    if (!existing) {
      const history = rows<{ count: number; bytes: number }>(await tx.execute(sql`SELECT COUNT(*) AS count, COALESCE(SUM(size), 0) AS bytes FROM owner_v4_files WHERE enquiryId = ${r.id}`))[0];
      if (!history) throw new OwnerIntakeError("INTAKE_UNAVAILABLE");
      // Cancel even an in-flight upload not yet persisted. A late PUT cannot revive
      // this UUID; choosing the file again requires a new UUID. Bound tombstones too.
      if (Number(history.count) < OWNER_V4_FILE_HISTORY_COUNT) {
        await tx.execute(sql`INSERT INTO owner_v4_files (id, enquiryId, name, mimeType, size, digest, content, createdAt, active)
          VALUES (${id}, ${r.id}, ${""}, ${""}, ${0}, ${""}, ${Buffer.alloc(0)}, ${now}, ${0})`);
        changed = 1;
      }
    } else if (existing.enquiryId === r.id) {
      changed = affected(await tx.execute(sql`UPDATE owner_v4_files SET active = 0 WHERE id = ${id} AND enquiryId = ${r.id} AND active = 1`));
    }
    const files = await fileMetadata(tx, r.id);
    r.mediaFileCount = files.length; r.updatedAt = now; r.revision++;
    if (r.status !== "awaiting_details") {
      r.status = withPhotos(r, files) ? "complete" : "awaiting_photos";
      if (r.status === "awaiting_photos") r.awaitingPhotosAt ||= now;
    }
    // Keep private bytes: a frozen outbox snapshot may still reference the removed file.
    await persistRecord(tx, r); return receipt(r, changed === 0);
  });
}

export async function pendingV4(now = new Date()) {
  const db = await database(); const stale = new Date(now.getTime() - 5 * 60_000);
  return rows<{ id: string; attachmentBytes: number }>(await db.execute(sql`SELECT id, attachmentBytes FROM owner_v4_outbox
    WHERE (status IN ('pending', 'failed') AND (nextAttemptAt IS NULL OR nextAttemptAt <= ${now}))
      OR (status = 'sending' AND leaseAt < ${stale}) ORDER BY createdAt, id LIMIT 40`));
}
export async function claimV4(id: string, now = new Date()): Promise<V4Outbox | null> {
  const db = await database(); const stale = new Date(now.getTime() - 5 * 60_000); const oldest = new Date(now.getTime() - 20 * 3600_000);
  await db.execute(sql`UPDATE owner_v4_outbox SET status = 'needs_review', lastError = 'DELIVERY_REVIEW_REQUIRED', leaseAt = NULL
    WHERE id = ${id} AND status IN ('pending', 'failed', 'sending') AND firstAttemptAt < ${oldest}`);
  const result = await db.execute(sql`UPDATE owner_v4_outbox SET status = 'sending', leaseAt = ${now}, firstAttemptAt = COALESCE(firstAttemptAt, ${now}), attempts = attempts + 1
    WHERE id = ${id} AND ((status IN ('pending', 'failed') AND (nextAttemptAt IS NULL OR nextAttemptAt <= ${now})) OR (status = 'sending' AND leaseAt < ${stale}))`);
  if (affected(result) !== 1) return null;
  const row = rows<any>(await db.execute(sql`SELECT * FROM owner_v4_outbox WHERE id = ${id} LIMIT 1`))[0];
  return row ? { ...row, payload: obj(row.payload), leaseAt: date(row.leaseAt), firstAttemptAt: date(row.firstAttemptAt) } : null;
}
export async function v4MailFiles(item: V4Outbox) {
  if (!item.payload.fileIds.length) return [];
  const db = await database(); const files = [];
  for (const id of item.payload.fileIds) {
    const file = rows<{ name: string; mimeType: string; content: Buffer; digest: string }>(await db.execute(sql`SELECT name, mimeType, content, digest FROM owner_v4_files WHERE id = ${id} AND enquiryId = ${item.enquiryId} LIMIT 1`))[0];
    if (!file || createHash("sha256").update(file.content).digest("hex") !== file.digest) throw new Error("FILE_SNAPSHOT_UNAVAILABLE");
    files.push(file);
  }
  return files;
}
export async function sentV4(item: V4Outbox, providerId: string) {
  const db = await database();
  await db.execute(sql`UPDATE owner_v4_outbox SET status = 'sent', providerId = ${providerId}, lastError = NULL, leaseAt = NULL, nextAttemptAt = NULL WHERE id = ${item.id} AND status = 'sending' AND leaseAt = ${item.leaseAt}`);
}
export async function failedV4(item: V4Outbox, code: string, next: Date, permanent = false, confirmedRejected = false) {
  const db = await database();
  // Clear only a window opened by THIS attempt when the provider explicitly refused
  // it. An earlier timeout/crash keeps its original window, even after a later429.
  await db.execute(sql`UPDATE owner_v4_outbox SET status = ${permanent ? "needs_review" : "failed"}, lastError = ${code},
    firstAttemptAt = CASE WHEN ${confirmedRejected} AND firstAttemptAt = ${item.leaseAt} THEN NULL ELSE firstAttemptAt END,
    leaseAt = NULL, nextAttemptAt = ${next} WHERE id = ${item.id} AND status = 'sending' AND leaseAt = ${item.leaseAt}`);
}
export async function v4AttentionRequired(now = new Date()) {
  const db = await database(); const stale = new Date(now.getTime() - 30 * 60_000);
  return rows<{ id: string }>(await db.execute(sql`SELECT id FROM owner_v4_outbox WHERE status = 'needs_review' OR (status <> 'sent' AND createdAt < ${stale}) LIMIT 1`)).length > 0;
}
