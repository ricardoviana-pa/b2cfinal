import { sql, type SQL } from "drizzle-orm";

/** Additive tables. Only the sanitized new reply is retained, never quoted history/private capabilities. */
export const OWNER_EMAIL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS owner_email_messages (
    messageKey char(64) NOT NULL PRIMARY KEY, mailbox varchar(254) NOT NULL, providerId varchar(64) NOT NULL,
    threadId varchar(128) NULL, messageId varchar(998) NULL, fingerprint char(64) NOT NULL,
    sourceKey varchar(48) NULL, dealId bigint NULL, personId bigint NULL,
    senderEmail varchar(254) NOT NULL, subject varchar(500) NOT NULL, descriptors json NOT NULL,
    bodyText mediumtext NULL, replyNoteId bigint NULL, replyNextAttemptAt datetime(3) NULL, replyError varchar(64) NULL,
    status varchar(20) NOT NULL, reason varchar(64) NULL, receivedAt datetime(3) NOT NULL,
    createdAt datetime(3) NOT NULL, updatedAt datetime(3) NOT NULL,
    INDEX idx_owner_email_source (sourceKey,status), INDEX idx_owner_email_state (status,updatedAt)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_email_files (
    id varchar(36) NOT NULL PRIMARY KEY, messageKey char(64) NOT NULL, attachmentId char(64) NOT NULL,
    name varchar(180) NOT NULL, mimeType varchar(50) NOT NULL, size int NOT NULL, digest char(64) NOT NULL,
    content mediumblob NULL, active tinyint NOT NULL DEFAULT 1, outcome varchar(16) NOT NULL DEFAULT 'accepted', reason varchar(64) NULL,
    remoteFileId bigint NULL, syncedAt datetime(3) NULL, createdAt datetime(3) NOT NULL,
    UNIQUE INDEX idx_owner_email_attachment (messageKey,attachmentId), INDEX idx_owner_email_file_message (messageKey,active)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_email_outbound_ids (
    messageIdHash char(64) NOT NULL PRIMARY KEY, providerId varchar(128) NOT NULL,
    messageId varchar(998) NOT NULL, createdAt datetime(3) NOT NULL,
    INDEX idx_owner_outbound_provider (providerId)
  )`,
  `CREATE TABLE IF NOT EXISTS owner_email_state (
    id varchar(32) NOT NULL PRIMARY KEY, lastPollAt datetime(3) NULL, updatedAt datetime(3) NOT NULL
  )`,
] as const;

const migrated = new WeakMap<object, Promise<void>>();
/** Existing installations keep all rows; no table rebuild or application-side production data copy. */
export function ensureOwnerEmailBodySchema(db: { execute(query: SQL): Promise<unknown> }) {
  const previous = migrated.get(db); if (previous) return previous;
  const run = (async () => {
    const result = await db.execute(sql`SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='owner_email_messages'`);
    const columns = new Set((result as [{ COLUMN_NAME: string }[], unknown])[0].map(row => row.COLUMN_NAME.toLowerCase()));
    for (const [name, definition] of Object.entries({ bodyText: "mediumtext NULL", replyNoteId: "bigint NULL", replyNextAttemptAt: "datetime(3) NULL", replyError: "varchar(64) NULL" })) {
      if (columns.has(name.toLowerCase())) continue;
      try { await db.execute(sql.raw(`ALTER TABLE owner_email_messages ADD COLUMN ${name} ${definition}`)); }
      catch (error) {
        const failure = error as { code?: string; cause?: { code?: string } };
        if (failure.code !== "ER_DUP_FIELDNAME" && failure.cause?.code !== "ER_DUP_FIELDNAME") throw error;
      }
    }
  })().catch(error => { migrated.delete(db); throw error; });
  migrated.set(db, run); return run;
}
