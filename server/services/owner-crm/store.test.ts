import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const fake = vi.hoisted(() => ({ db: vi.fn(), production: vi.fn(() => true) }));
vi.mock("../../db", () => ({ getDb: fake.db }));
vi.mock("../owner-intake/email", () => ({ isOwnerIntakeProduction: fake.production }));
import { acquireCrmLease, crmCandidates, crmEmailReplies, verifyCrmEmailReply, saveCrmEmailReply, crmDealForV4, crmFileBytes, crmStorageHealth, releaseSyncedEmailBytes, saveCrmResult, sqlLedger } from "./store";
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
  it("unions only confirmed email files bound to the exact request with public upload metadata", async () => {
    const form = { id: "form", name: "form.png", mimeType: "image/png", size: 1, digest: "a".repeat(64) };
    const email = { id: "email", name: "email.heic", mimeType: "image/heic", size: 2, digest: "b".repeat(64), origin: "email" };
    const execute = vi.fn().mockResolvedValueOnce([[{ id: "synthetic", capturedAt: "2026-11-04T10:00:00Z", updatedAt: "2026-11-04T12:00:00Z",
      contact: { name: "Synthetic", email: "synthetic@example.com", type: "villa" }, context: {} }], []])
      .mockResolvedValueOnce([[form, email], []]);
    fake.db.mockResolvedValue({ execute }); const [e] = await crmCandidates(new Date("2026-11-03"), "v4");
    expect(e.files).toEqual([form, email]);
    const query = dialect.sqlToQuery(execute.mock.calls[1][0]);
    expect(query.sql).toContain("UNION ALL"); expect(query.sql).toContain("'email' AS origin");
    expect(query.sql).toContain("m.messageKey = f.messageKey");
    expect(query.sql).toContain("m.status = 'ready' AND f.active = 1"); expect(query.params).toEqual(["synthetic", "v4:synthetic"]);
  });
  it.each(["v3", "v4"] as const)("permits older %s requests only through persisted confirmed email evidence", async source => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: "synthetic", createdAt: "2026-10-01T10:00:00Z", capturedAt: "2026-10-01T10:00:00Z", updatedAt: "2026-11-05T12:00:00Z",
      hasReadyEmailEvidence: 1, contact: { name: "Owner", email: "owner@example.com" }, payload: { name: "Owner", email: "owner@example.com" }, context: {} }], []]).mockResolvedValueOnce([[], []]);
    fake.db.mockResolvedValue({ execute }); const [e] = await crmCandidates(new Date("2026-11-03"), source);
    expect(e.hasReadyEmailEvidence).toBe(true); expect(e.capturedAt.toISOString()).toBe("2026-10-01T10:00:00.000Z");
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toMatch(/WHERE \(e\.(?:createdAt|capturedAt) >= \? OR EXISTS/);
    expect(query.sql).toContain("em.status = 'ready' AND em.dealId > 0 AND em.personId > 0");
    expect(query.params).toContain(`${source}:`);
    expect(query.sql).toContain("ef.content IS NOT NULL");
    if (source === "v3") expect(query.sql).toContain("h.originalSourceKey = CONCAT('v3:', e.id)");
  });
  it("does not grant the historical exception from public payload or attribution", async () => {
    const execute = vi.fn().mockResolvedValueOnce([[{ id: "synthetic", createdAt: "2026-10-01", updatedAt: "2026-11-05",
      payload: { name: "Owner", email: "owner@example.com", hasReadyEmailEvidence: true }, hasReadyEmailEvidence: 0 }], []]).mockResolvedValueOnce([[], []]);
    fake.db.mockResolvedValue({ execute }); const [e] = await crmCandidates(new Date("2026-11-03"), "v3");
    expect(e.details.hasReadyEmailEvidence).toBe(true); expect(e.hasReadyEmailEvidence).toBe(false);
  });
  it("reads email bytes only with the same confirmed request, active file, ID and digest", async () => {
    const e = { id: "synthetic", source: "v4", sourceKey: "v4:synthetic" } as CrmEnquiry;
    const file = { id: "email-photo", name: "a.jpg", mimeType: "image/jpeg", size: 9, digest: "c".repeat(64) };
    const execute = vi.fn().mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[{ content: Buffer.from("synthetic") }], []]);
    fake.db.mockResolvedValue({ execute }); expect((await crmFileBytes(e, file)).toString()).toBe("synthetic");
    const query = dialect.sqlToQuery(execute.mock.calls[1][0]);
    expect(query.params).toEqual([e.sourceKey, file.id, file.digest]);
    expect(query.sql).toContain("m.status = 'ready' AND f.active = 1");
    execute.mockResolvedValue([[], []]);
    await expect(crmFileBytes(e, file)).rejects.toMatchObject({ code: "FILE_CHANGED", confirmedRejected: true });
    execute.mockResolvedValueOnce([[], []]).mockResolvedValueOnce([[{ content: null }], []]);
    await expect(crmFileBytes(e, file)).rejects.toMatchObject({ code: "FILE_CONTENT_RELEASED", review: true, confirmedRejected: true });
  });
  it("releases only confirmed email bytes under the current deal/person binding and live worker lease", async () => {
    const execute = vi.fn(async () => [{ affectedRows: 1 }, []]); fake.db.mockResolvedValue({ execute });
    await releaseSyncedEmailBytes("current-lease", { sourceKey: "v4:synthetic" } as CrmEnquiry, { personId: 11, dealId: 22 });
    const query = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain("SET f.content = NULL, f.remoteFileId = upload.remoteId, f.syncedAt = COALESCE");
    expect(query.sql).toContain("upload.status = 'done' AND upload.remoteId > 0");
    expect(query.sql).toContain("':file:', f.digest");
    expect(query.sql).toContain("deal.status = 'done' AND deal.remoteId = l.dealId");
    expect(query.sql).toContain("person.status = 'done' AND person.remoteId = l.personId");
    expect(query.sql).toContain("m.status = 'ready' AND f.active = 1 AND l.status = 'synced'");
    expect(query.sql).toContain("m.dealId = l.dealId AND m.personId = l.personId");
    expect(query.sql).toContain("f.remoteFileId IS NULL OR f.remoteFileId = upload.remoteId");
    expect(query.sql).toContain("expiresAt > UTC_TIMESTAMP(3)");
    expect(query.params).toEqual(["v4:synthetic", 22, 11, "current-lease"]);
    expect(query.sql).not.toContain("owner_v4_files"); expect(query.sql).not.toContain("DELETE");
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
  it("selects only ready pending replies and rechecks the current contact, canonical binding and worker lease", async () => {
    const reply = {messageKey:'a'.repeat(64),sourceKey:'v4:11111111-1111-4111-8111-111111111111',personId:11,dealId:22,senderEmail:'owner@synthetic.test',subject:'Re',receivedAt:new Date(),bodyText:'Resposta'};
    const execute = vi.fn().mockResolvedValueOnce([[reply],[]]).mockResolvedValueOnce([[{messageKey:reply.messageKey}],[]]); fake.db.mockResolvedValue({execute});
    expect(await crmEmailReplies()).toEqual([reply]); await verifyCrmEmailReply('lease',reply);
    const selection=dialect.sqlToQuery(execute.mock.calls[0][0]); expect(selection.sql).toContain("bodyText IS NOT NULL AND replyNoteId IS NULL"); expect(selection.sql).toContain("replyNextAttemptAt<=UTC_TIMESTAMP(3)");
    const validation=dialect.sqlToQuery(execute.mock.calls[1][0]);
    expect(validation.sql).toContain('l.dealId=m.dealId AND l.personId=m.personId'); expect(validation.sql).toContain('JSON_EXTRACT(e4.contact');
    expect(validation.sql).toContain('h.originalSourceKey=m.sourceKey'); expect(validation.params).toContain('lease');
    execute.mockResolvedValue([[],[]]); await expect(verifyCrmEmailReply('lease',reply)).rejects.toThrow('REPLY_BINDING_OR_LEASE_CHANGED');
  });
  it("persists a reply note only after its confirmed operation and live binding, and exposes pending failures in health", async () => {
    const reply = {messageKey:'b'.repeat(64),sourceKey:'v4:11111111-1111-4111-8111-111111111111',personId:11,dealId:22,senderEmail:'owner@synthetic.test',subject:'Re',receivedAt:new Date(),bodyText:'Resposta'};
    const execute=vi.fn().mockResolvedValueOnce([[{messageKey:reply.messageKey}],[]]).mockResolvedValueOnce([{affectedRows:1},[]]); fake.db.mockResolvedValue({execute});
    await saveCrmEmailReply('lease',reply,99); const saved=dialect.sqlToQuery(execute.mock.calls[1][0]);
    expect(saved.sql).toContain("status='done' AND remoteId="); expect(saved.sql).toContain('m.replyNoteId IS NULL OR m.replyNoteId=');
    expect(saved.params).toContain(`owner-reply:${reply.messageKey}:note`); expect(saved.params).toContain('lease');
    execute.mockImplementation(async statement => dialect.sqlToQuery(statement).sql.includes("SELECT messageKey FROM owner_email_messages") ? [[{messageKey:reply.messageKey}],[]] : [[],[]]);
    expect(await crmStorageHealth()).toEqual({storageReady:true,attentionRequired:true});
  });

});
