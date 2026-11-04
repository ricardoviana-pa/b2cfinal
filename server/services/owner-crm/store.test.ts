import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const fake = vi.hoisted(() => ({ db: vi.fn(), production: vi.fn(() => true) }));
vi.mock("../../db", () => ({ getDb: fake.db }));
vi.mock("../owner-intake/email", () => ({ isOwnerIntakeProduction: fake.production }));
import { acquireCrmLease, crmCandidates, crmDealForV4, crmStorageHealth, saveCrmResult, sqlLedger } from "./store";
import type { CrmEnquiry } from "./types";
const dialect = new MySqlDialect();
beforeEach(() => { fake.db.mockReset(); fake.production.mockReturnValue(true); });
afterEach(() => vi.unstubAllEnvs());
describe("CRM storage fencing and recovery", () => {
  it("refuses database access outside the production environment", async () => {
    fake.production.mockReturnValue(false); await expect(acquireCrmLease()).rejects.toThrow("PRODUCTION_REQUIRED"); expect(fake.db).not.toHaveBeenCalled();
  });
  it("claims exactly one global lease under two simultaneous sweeps", async () => {
    let claimed = false; const execute = vi.fn(async () => { const acquired = !claimed; claimed = true; return [{ affectedRows: acquired ? 1 : 0 }, []]; }); fake.db.mockResolvedValue({ execute });
    const leases = await Promise.all([acquireCrmLease(), acquireCrmLease()]); expect(leases.filter(Boolean)).toHaveLength(1);
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]); expect(query.sql).toContain("expiresAt < UTC_TIMESTAMP(3)");
  });
  it("cannot confirm a mapping or persist a stale snapshot after losing the lease", async () => {
    const execute = vi.fn(async () => [{ affectedRows: 0 }, []]); fake.db.mockResolvedValue({ execute }); const ledger = sqlLedger("synthetic-lease");
    await expect(ledger.confirmed("synthetic-operation", 123)).rejects.toThrow("REMOTE_MAPPING_OR_LEASE_CONFLICT");
    const e = { sourceKey: "v4:synthetic", modifiedAt: new Date() } as CrmEnquiry;
    await expect(saveCrmResult("synthetic-lease", e, "a".repeat(64), "synced", { personId: 1, dealId: 2, noteId: 3 })).rejects.toThrow("LEASE_LOST");
    await expect(ledger.saveFieldState("synthetic-fields", { lastWritten: {}, protected: [], pending: null })).rejects.toThrow("LEASE_LOST");
    for (const call of execute.mock.calls) {
      const query = dialect.sqlToQuery(call[0]); expect(query.sql).toContain("leaseToken = ?"); expect(query.sql).toContain("expiresAt > UTC_TIMESTAMP(3)"); expect(query.params).toContain("synthetic-lease");
    }
  });
  it("revisits already-synced enquiries once when dedicated field mapping is introduced", async () => {
    const execute = vi.fn(async () => [[], []]); fake.db.mockResolvedValue({ execute });
    await crmCandidates(new Date("2026-11-03"), "v4");
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]); expect(query.sql).toContain("l.status = 'synced' AND NOT EXISTS"); expect(query.params).toContain("property-fields:v1");
  });
  it("includes eligible v3 records with files in the recovery contract", async () => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: "synthetic", createdAt: "2026-11-04T10:00:00Z", updatedAt: "2026-11-04T10:00:00Z",
      payload: JSON.stringify({ name: "Synthetic", email: "synthetic@example.com", type: "villa", address: "Fictional address", schemaVersion: "owner-intake-v3", incomeExpectation: "30_60", context: { language: "pt" } }) }], []])
      .mockResolvedValueOnce([[{ id: "file", name: "a.png", mimeType: "image/png", size: 1, digest: "a".repeat(64) }], []]);
    fake.db.mockResolvedValue({ execute }); const found = await crmCandidates(new Date("2026-11-03"), "v3");
    expect(found).toHaveLength(1); expect(found[0]).toMatchObject({ source: "v3", sourceKey: "v3:synthetic", qualified: true, locality: "Fictional address", details: { incomeExpectation: "30_60" }, files: [{ id: "file" }] });
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]); expect(query.sql).toContain("NOT EXISTS (SELECT dealId FROM owner_crm_photo_requests"); expect(query.sql).toContain("h.originalSourceKey = CONCAT('v3:', e.id)");
  });
  it("loads historical provenance from the private journal rather than public attribution", async () => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: "synthetic", capturedAt: "2026-11-04T10:00:00Z", updatedAt: "2026-11-04T10:00:00Z",
      contact: { name: "Synthetic", email: "synthetic@example.com", type: "villa" }, context: { page_kind: "crm-photo-followup" }, privacyNoticeVersion: "owner-crm-photo-followup", originalSourceKey: "v3:00000000-0000-4000-8000-000000000001", originalRequestedAt: "2026-11-01T12:00:00Z" }], []]).mockResolvedValueOnce([[], []]);
    fake.db.mockResolvedValue({ execute }); const [e] = await crmCandidates(new Date("2026-11-03"), "v4");
    expect(e.privacyNoticeVersion).toBe("owner-crm-photo-followup"); expect(e.originalSourceKey).toContain("v3:"); expect(e.originalRequestedAt?.toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
  it("allows an explicitly approved previously excluded QA UUID back into reconciliation", async () => {
    const testId = "00000000-0000-4000-8000-000000000001"; vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", testId);
    const execute = vi.fn(async () => [[], []]); fake.db.mockResolvedValue({ execute }); await crmCandidates(new Date("2026-11-03"), "v4");
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]); expect(query.sql).toContain("l.status = 'excluded' AND e.id IN"); expect(query.params).toContain(testId);
  });
  it("uses the partial deal operation to suppress reminders before note/files complete", async () => {
    const execute = vi.fn().mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[{ remoteId: 44 }], []]); fake.db.mockResolvedValue({ execute });
    expect(await crmDealForV4("synthetic")).toBe(44);
  });
  it("health detects an unlinked source record even when the link ledger itself is empty", async () => {
    const execute = vi.fn(async statement => dialect.sqlToQuery(statement).sql.includes("SELECT e.id FROM owner_v4_enquiries") ? [[{ id: "synthetic" }], []] : [[], []]); fake.db.mockResolvedValue({ execute });
    expect(await crmStorageHealth()).toEqual({ storageReady: true, attentionRequired: true });
  });
  it("health reports unavailable storage without exposing database errors", async () => {
    fake.db.mockRejectedValue(new Error("synthetic private database text")); expect(await crmStorageHealth()).toEqual({ storageReady: false, attentionRequired: true });
  });
});
