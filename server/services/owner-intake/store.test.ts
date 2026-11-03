import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { type SQL } from "drizzle-orm";
import { validateOwnerIntake } from "./validation";
import { png, syntheticOwner } from "./__tests__/fixtures";

const fake = vi.hoisted(() => ({ getDb: vi.fn(), preview: vi.fn(() => false) }));
vi.mock("../../db", () => ({ getDb: fake.getDb }));
vi.mock("../../lib/preview-isolation", () => ({ isPreviewDeployment: fake.preview }));
import { claimOwnerNotification, initialiseOwnerIntakeSchema, markOwnerNotificationSent, ownerSchemaReady, saveOwnerIntake } from "./store";

const dialect = new MySqlDialect();
const query = (sql: SQL) => dialect.sqlToQuery(sql);
const mail = { from: "sender@example.invalid", to: "management@portugalactive.com", replyTo: "owner@example.invalid", subject: "Synthetic", html: "Synthetic", text: "Synthetic" };
const ok = (affectedRows = 1) => [{ affectedRows }, []];
beforeEach(() => { fake.getDb.mockReset(); fake.preview.mockReturnValue(false); });
afterEach(() => vi.restoreAllMocks());

/** Synthetic transactional adapter; no connection strings or real DB involved. */
function transactionalStore({ failAttachment = false } = {}) {
  let records = new Map<string, any>();
  let files: unknown[] = [];
  let queue = Promise.resolve();
  const statements: { sql: string; params: unknown[] }[] = [];
  const execute = async (statement: SQL, txRecords = records, txFiles = files) => {
    const q = query(statement); statements.push(q);
    if (q.sql.startsWith("INSERT INTO owner_enquiries")) {
      const [id, fingerprint, payload, count, message] = q.params;
      if (txRecords.has(String(id))) throw Object.assign(new Error("synthetic duplicate"), { code: "ER_DUP_ENTRY" });
      txRecords.set(String(id), { id, fingerprint, payload, attachmentCount: count, notificationMail: message, createdAt: new Date(), updatedAt: new Date() });
      return ok();
    }
    if (q.sql.startsWith("INSERT INTO owner_enquiry_attachments")) {
      if (failAttachment) throw new Error("synthetic attachment write failure");
      txFiles.push(q.params); return ok();
    }
    if (q.sql.startsWith("SELECT * FROM owner_enquiries")) return [[txRecords.get(String(q.params[0]))].filter(Boolean), []];
    return ok();
  };
  const db = { execute,
    transaction<T>(run: (tx: { execute: (statement: SQL) => Promise<unknown> }) => Promise<T>): Promise<T> {
      // Serial transaction commits emulate unique-key contention; each failure rolls back.
      const result = queue.then(async () => {
        const txRecords = new Map(records); const txFiles = [...files];
        const value = await run({ execute: statement => execute(statement, txRecords, txFiles) });
        records = txRecords; files = txFiles; return value;
      });
      queue = result.then(() => {}, () => {});
      return result;
    },
  };
  fake.getDb.mockResolvedValue(db);
  return { db, statements, records: () => records, files: () => files };
}

describe("atomic owner intake storage and replay handling", () => {
  it("commits structured record, private bytes and immutable notification together", async () => {
    const fakeDb = transactionalStore();
    const input = validateOwnerIntake({ ...syntheticOwner(), photoMethod: "files", attachments: [png()] });
    expect(await saveOwnerIntake(input, mail)).toEqual({ duplicate: false, reference: input.fields.requestId });
    expect(fakeDb.records().size).toBe(1); expect(fakeDb.files()).toHaveLength(1);
    const stored = fakeDb.records().get(input.fields.requestId);
    expect(JSON.parse(stored.notificationMail)).toEqual(mail);
    expect(JSON.parse(stored.payload)).not.toHaveProperty("attachments");
    expect(fakeDb.statements[1].params.at(-1)).toBeInstanceOf(Buffer);
  });
  it("an attachment error rolls the whole transaction back and never acknowledges it", async () => {
    const fakeDb = transactionalStore({ failAttachment: true });
    const input = validateOwnerIntake({ ...syntheticOwner(), photoMethod: "files", attachments: [png()] });
    await expect(saveOwnerIntake(input, mail)).rejects.toThrow("INTAKE_UNAVAILABLE");
    expect(fakeDb.records().size).toBe(0); expect(fakeDb.files()).toHaveLength(0);
  });
  it("two concurrent identical requests create one record and one file only", async () => {
    const fakeDb = transactionalStore();
    const input = validateOwnerIntake({ ...syntheticOwner(), photoMethod: "files", attachments: [png()] });
    const results = await Promise.all([saveOwnerIntake(input, mail), saveOwnerIntake(input, mail)]);
    expect(results.map(r => r.duplicate).sort()).toEqual([false, true]);
    expect(fakeDb.records().size).toBe(1); expect(fakeDb.files()).toHaveLength(1);
  });
  it("reusing a reference for edited data is a conflict, never a silently lost update", async () => {
    transactionalStore();
    await saveOwnerIntake(validateOwnerIntake(syntheticOwner()), mail);
    await expect(saveOwnerIntake(validateOwnerIntake({ ...syntheticOwner(), description: "Different synthetic information about this property" }), mail)).rejects.toThrow("REQUEST_ID_CONFLICT");
  });
  it("missing database is an error, not pretend acceptance", async () => {
    fake.getDb.mockResolvedValue(null);
    await expect(saveOwnerIntake(validateOwnerIntake(syntheticOwner()), mail)).rejects.toThrow("INTAKE_UNAVAILABLE");
    expect(await ownerSchemaReady()).toBe(false);
  });
});
describe("durable notification claims", () => {
  it("claims atomically, stops after20h, and only retries stale sending leases", async () => {
    const execute = vi.fn().mockResolvedValue(ok(0)); fake.getDb.mockResolvedValue({ execute });
    const now = new Date("2099-01-02T00:00:00Z");
    expect(await claimOwnerNotification(syntheticOwner().requestId, now)).toBeNull();
    const [expiry, claim] = execute.mock.calls.map(([statement]) => query(statement));
    expect(expiry.sql).toContain("notificationStatus = 'needs_review'");
    expect(expiry.params).toContainEqual(new Date("2099-01-01T04:00:00Z"));
    expect(claim.sql).toContain("notificationStatus IN ('pending', 'failed')");
    expect(claim.sql).toContain("notificationStatus = 'sending' AND notificationLeaseAt <");
    expect(claim.sql).not.toContain("'needs_review'");
    expect(claim.params).toContainEqual(new Date("2099-01-01T23:55:00Z"));
  });
  it("only the holder of a sending lease can mark provider acceptance", async () => {
    const execute = vi.fn().mockResolvedValue(ok()); fake.getDb.mockResolvedValue({ execute });
    const leaseAt = new Date("2099-01-02T00:00:00Z");
    await markOwnerNotificationSent(syntheticOwner().requestId, leaseAt, "synthetic-provider-id");
    const q = query(execute.mock.calls[0][0]);
    expect(q.sql).toContain("notificationStatus = 'sending' AND notificationLeaseAt =");
    expect(q.params).toEqual(["synthetic-provider-id", syntheticOwner().requestId, leaseAt]);
  });
  it("boot migration is additive only and blocked in previews", async () => {
    const execute = vi.fn().mockResolvedValue(ok()); fake.getDb.mockResolvedValue({ execute });
    expect(await initialiseOwnerIntakeSchema()).toBe(true);
    const sqls = execute.mock.calls.map(([statement]) => query(statement).sql);
    expect(sqls.filter(s => s.startsWith("CREATE TABLE IF NOT EXISTS"))).toHaveLength(2);
    expect(sqls.every(s => !/DROP|DELETE|ALTER/i.test(s))).toBe(true);
    execute.mockClear(); fake.preview.mockReturnValue(true);
    expect(await initialiseOwnerIntakeSchema()).toBe(false); expect(execute).not.toHaveBeenCalled();
  });
});
