import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
const fake = vi.hoisted(() => ({ db: vi.fn(), production: vi.fn(() => true) }));
vi.mock("../../db", () => ({ getDb: fake.db }));
vi.mock("../owner-intake/email", async importOriginal => ({ ...await importOriginal<any>(), isOwnerIntakeProduction: fake.production }));
import { addV4File, authenticateV4, claimV4, draftV4, failedV4, mutateV4, removeV4File, startV4, submitV4Media, v4MailFiles } from "./store";
import { detailsInput, pngBytes, startInput, testNow } from "./fixtures.test-utils";
import { tokenHash, validateFile } from "./validation";
import type { V4Outbox } from "./types";
const dialect = new MySqlDialect(); const ok = (affectedRows = 1) => [{ affectedRows }, []];
const fileId = (i: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`;
beforeEach(() => { fake.db.mockReset(); fake.production.mockReturnValue(true); });

/** Isolated SQL-shaped adapter. Serial commits emulate row locks/unique-key races. */
function memoryStore({ failOutbox = false, failMediaOutbox = false, failFile = false } = {}) {
  type State = { enquiries: Map<string, any>; files: Map<string, any>; mutations: Map<string, any>; outbox: Map<string, any> };
  let state: State = { enquiries: new Map(), files: new Map(), mutations: new Map(), outbox: new Map() }; let queue = Promise.resolve();
  const statements: { sql: string; params: any[] }[] = [];
  const duplicate = () => Object.assign(new Error("synthetic duplicate"), { code: "ER_DUP_ENTRY" });
  async function execute(statement: SQL, s = state) {
    const q = dialect.sqlToQuery(statement); const p = q.params as any[]; statements.push(q);
    if (q.sql.startsWith("INSERT INTO owner_v4_enquiries")) {
      const [id, startFingerprint, contact, context, attribution, tokenHash, tokenExpiresAt, capturedAt, updatedAt, privacyAcknowledgedAt, privacyNoticeVersion] = p;
      if (s.enquiries.has(id)) throw duplicate();
      s.enquiries.set(id, { id, startFingerprint, contact, context, attribution, tokenHash, tokenExpiresAt, capturedAt, updatedAt, privacyAcknowledgedAt, privacyNoticeVersion,
        details: null, status: "awaiting_details", revision: 0, completedFingerprint: null, qualificationCompletedAt: null,
        mediaReceivedAt: null, awaitingPhotosAt: null, completionCount: 0, mediaFileCount: 0 }); return ok();
    }
    if (q.sql.startsWith("INSERT INTO owner_v4_outbox")) {
      if (failOutbox || (failMediaOutbox && p[2] === "media")) throw new Error("synthetic outbox failure");
      const [id, enquiryId, kind, payload, attachmentBytes, createdAt] = p;
      if (s.outbox.has(id)) throw duplicate();
      s.outbox.set(id, { id, enquiryId, kind, payload, attachmentBytes, createdAt, status: "pending", attempts: 0, leaseAt: null, firstAttemptAt: null }); return ok();
    }
    if (q.sql.startsWith("SELECT * FROM owner_v4_enquiries WHERE id")) return [[s.enquiries.get(p[0])].filter(Boolean), []];
    if (q.sql.startsWith("SELECT * FROM owner_v4_enquiries WHERE tokenHash")) return [[...s.enquiries.values()].filter(r => r.tokenHash === p[0] && r.tokenExpiresAt > p[1]), []];
    if (q.sql.startsWith("SELECT kind, payload FROM owner_v4_outbox") && q.sql.includes("WHERE enquiryId"))
      return [[...s.outbox.values()].filter(r => r.enquiryId === p[0] && ["completed", "media"].includes(r.kind))
        .sort((a, b) => (JSON.parse(b.payload).notificationRevision || 0) - (JSON.parse(a.payload).notificationRevision || 0)
          || +b.createdAt - +a.createdAt || b.id.localeCompare(a.id)).slice(0, 1), []];
    if (q.sql.startsWith("SELECT payload FROM owner_v4_outbox")) return [[s.outbox.get(p[0])].filter(Boolean), []];
    if (q.sql.startsWith("SELECT fingerprint, response FROM owner_v4_mutations")) return [[s.mutations.get(`${p[0]}:${p[1]}`)].filter(Boolean), []];
    if (q.sql.startsWith("INSERT INTO owner_v4_mutations")) {
      const [enquiryId, id, fingerprint, response, createdAt] = p; const key = `${enquiryId}:${id}`;
      if (s.mutations.has(key)) throw duplicate(); s.mutations.set(key, { enquiryId, id, fingerprint, response, createdAt }); return ok();
    }
    if (q.sql.startsWith("UPDATE owner_v4_enquiries SET contact")) {
      const [contact, details, status, revision, completedFingerprint, updatedAt, qualificationCompletedAt, mediaReceivedAt, awaitingPhotosAt, completionCount, mediaFileCount, id] = p;
      Object.assign(s.enquiries.get(id), { contact, details, status, revision, completedFingerprint, updatedAt, qualificationCompletedAt, mediaReceivedAt, awaitingPhotosAt, completionCount, mediaFileCount }); return ok();
    }
    if (q.sql.startsWith("SELECT id, name, mimeType, size, digest, active FROM owner_v4_files"))
      return [[...s.files.values()].filter(f => f.enquiryId === p[0] && f.active).sort((a, b) => +a.createdAt - +b.createdAt || a.id.localeCompare(b.id)), []];
    if (q.sql.startsWith("SELECT id, enquiryId, name")) return [[s.files.get(p[0])].filter(Boolean), []];
    if (q.sql.startsWith("SELECT enquiryId FROM owner_v4_files")) return [[s.files.get(p[0])].filter(Boolean), []];
    if (q.sql.startsWith("SELECT COUNT(*) AS count")) {
      const all = [...s.files.values()].filter(f => f.enquiryId === p[0]);
      return [[{ count: all.length, bytes: all.reduce((sum, f) => sum + f.size, 0) }], []];
    }
    if (q.sql.startsWith("SELECT name, mimeType, content, digest")) return [[s.files.get(p[0])].filter(f => f && f.enquiryId === p[1]), []];
    if (q.sql.startsWith("INSERT INTO owner_v4_files")) {
      if (failFile) throw new Error("synthetic file failure");
      const [id, enquiryId, name, mimeType, size, digest, content, createdAt, active = 1] = p;
      if (s.files.has(id)) throw duplicate(); s.files.set(id, { id, enquiryId, name, mimeType, size, digest, content, createdAt, active }); return ok();
    }
    if (q.sql.startsWith("UPDATE owner_v4_files SET active")) {
      const f = s.files.get(p[0]); if (!f || f.enquiryId !== p[1] || !f.active) return ok(0); f.active = 0; return ok();
    }
    throw new Error(`Unhandled synthetic SQL shape: ${q.sql}`);
  }
  const db = { execute,
    transaction<T>(run: (tx: { execute: typeof execute }) => Promise<T>): Promise<T> {
      const result = queue.then(async () => {
        const copy = Object.fromEntries(Object.entries(state).map(([k, map]) => [k, new Map([...map].map(([id, row]: [string, any]) => [id, { ...row }]))])) as State;
        const value = await run({ execute: statement => execute(statement, copy) }); state = copy; return value;
      });
      queue = result.then(() => {}, () => {}); return result;
    } };
  fake.db.mockResolvedValue(db); return { state: () => state, statements, db };
}
async function captured() { const m = memoryStore(); const result = await startV4(startInput(), testNow); return { m, result, auth: await authenticateV4(result.continuationToken, testNow) }; }

describe("v4 atomic capture and bearer ownership", () => {
  it("commits one contact and two frozen messages, with only a hash in the lead", async () => {
    const { m, result } = await captured(); const stored = m.state().enquiries.get(result.reference);
    expect(m.state().enquiries.size).toBe(1); expect(m.state().outbox.size).toBe(2);
    expect(stored.tokenHash).toBe(tokenHash(result.continuationToken));
    expect(stored).toMatchObject({ privacyAcknowledgedAt: testNow, privacyNoticeVersion: "owner-intake-v4" });
    expect(JSON.stringify(stored)).not.toContain(result.continuationToken);
    expect(JSON.parse(m.state().outbox.get(`${result.reference}:welcome`).payload).completionUrl).toBe(result.completionUrl);
  });
  it("does not retain a lead if its notification transaction fails", async () => {
    const m = memoryStore({ failOutbox: true });
    await expect(startV4(startInput(), testNow)).rejects.toThrow("synthetic outbox failure");
    expect(m.state().enquiries.size).toBe(0); expect(m.state().outbox.size).toBe(0);
  });
  it("concurrent capture replays return the same token and never add messages", async () => {
    const m = memoryStore(); const results = await Promise.all([startV4(startInput(), testNow), startV4(startInput(), testNow)]);
    expect(results.map(r => r.duplicate).sort()).toEqual([false, true]);
    expect(results[0].continuationToken).toBe(results[1].continuationToken); expect(m.state().outbox.size).toBe(2);
    await expect(startV4({ ...startInput(), phone: "+351900000001" }, testNow)).rejects.toThrow("REQUEST_ID_CONFLICT");
  });
  it("denies unknown and expired tokens without exposing whether a reference exists", async () => {
    const { result } = await captured();
    await expect(authenticateV4("b".repeat(43), testNow)).rejects.toThrow("TOKEN_INVALID_OR_EXPIRED");
    await expect(authenticateV4(result.continuationToken, new Date("2099-03-01"))).rejects.toThrow("TOKEN_INVALID_OR_EXPIRED");
  });
  it("cannot write in a development or preview context", async () => {
    const m = memoryStore(); fake.production.mockReturnValue(false);
    await expect(startV4(startInput(), testNow)).rejects.toThrow("INTAKE_UNAVAILABLE"); expect(m.state().enquiries.size).toBe(0);
  });
  it("isolates 100 simultaneous synthetic captures and 100 replays into 100 leads and 200 notifications", async () => {
    const m = memoryStore(); const inputs = Array.from({ length: 100 }, (_, i) => ({ ...startInput(), requestId: fileId(i + 1), email: `synthetic-${i}@example.invalid` }));
    const accepted = await Promise.all(inputs.map(input => startV4(input, testNow)));
    const replays = await Promise.all(inputs.map(input => startV4(input, testNow)));
    expect(accepted.every(r => !r.duplicate)).toBe(true); expect(replays.every(r => r.duplicate)).toBe(true);
    expect(new Set(accepted.map(r => r.reference)).size).toBe(100);
    expect(m.state().enquiries.size).toBe(100); expect(m.state().outbox.size).toBe(200);
    expect(accepted.map(r => r.continuationToken)).toEqual(replays.map(r => r.continuationToken));
  });
});
describe("v4 same-lead drafts and completion", () => {
  it("updates inline contact details and resumes a partial draft without sending another welcome", async () => {
    const { m, auth } = await captured();
    await mutateV4(auth, { mutationId: fileId(1), contact: { phone: "+351900000001" }, details: { description: "Partial" } }, false, testNow);
    const result = await draftV4(auth); expect(result.reference).toBe(auth.id);
    expect(result.contact.phone).toBe("+351900000001"); expect(result.details).toEqual({ description: "Partial" });
    expect(result).not.toHaveProperty("tokenHash"); expect(result).not.toHaveProperty("continuationToken"); expect(m.state().outbox.size).toBe(2);
  });
  it("accepts completed qualification without photos and emails management once", async () => {
    const { m, auth } = await captured(); const input = { mutationId: fileId(1), details: detailsInput() };
    expect(await mutateV4(auth, input, true, testNow)).toMatchObject({ reference: auth.id, status: "awaiting_photos", duplicate: false });
    expect(await mutateV4(auth, input, true, testNow)).toMatchObject({ duplicate: true });
    expect(await mutateV4(auth, { ...input, mutationId: fileId(2) }, true, testNow)).toMatchObject({ duplicate: true });
    expect(m.state().enquiries.size).toBe(1); expect(m.state().outbox.size).toBe(3);
    expect(m.state().enquiries.get(auth.id)).toMatchObject({ completionCount: 1, qualificationCompletedAt: testNow, awaitingPhotosAt: testNow });
    await expect(mutateV4(auth, { ...input, contact: { locality: "Changed locality" } }, true, testNow)).rejects.toThrow("MUTATION_ID_CONFLICT");
  });
  it("invalid completion rolls back inline contact edits and creates no completion email", async () => {
    const { m, auth } = await captured();
    await expect(mutateV4(auth, { mutationId: fileId(1), contact: { name: "Changed" }, details: { description: "short" } }, true, testNow)).rejects.toThrow("VALIDATION_FAILED");
    expect(JSON.parse(m.state().enquiries.get(auth.id).contact).name).toBe(auth.contact.name); expect(m.state().outbox.size).toBe(2);
  });
  it("adding optional photos later completes the same reference with immutable file snapshots", async () => {
    const { m, auth } = await captured();
    await mutateV4(auth, { mutationId: fileId(1), details: detailsInput() }, true, testNow);
    await addV4File(auth, validateFile(fileId(3), "synthetic.png", "image/png", pngBytes()), testNow);
    expect(await mutateV4(auth, { mutationId: fileId(2), details: detailsInput() }, true, testNow)).toMatchObject({ reference: auth.id, status: "complete" });
    const saved = m.state().outbox.get(`${auth.id}:completed:2`); const payload = JSON.parse(saved.payload);
    await removeV4File(auth, fileId(3), testNow);
    expect((await draftV4(auth)).files).toHaveLength(0);
    const files = await v4MailFiles({ ...saved, payload } as V4Outbox);
    expect(files[0].content.equals(pngBytes())).toBe(true); expect(payload.fileIds).toEqual([fileId(3)]);
    expect(m.state().enquiries.size).toBe(1); expect(m.state().outbox.size).toBe(4);
    expect(m.state().enquiries.get(auth.id).awaitingPhotosAt).toEqual(testNow);
  });
  it("counts a photo link as media received without requiring an attachment", async () => {
    const { m, auth } = await captured();
    await mutateV4(auth, { mutationId: fileId(1), details: { ...detailsInput(), photosLink: "https://example.invalid/synthetic-photos" } }, true, testNow);
    expect(m.state().enquiries.get(auth.id)).toMatchObject({ status: "complete", mediaReceivedAt: testNow, mediaFileCount: 0 });
  });
  it("does not treat a PDF document as the images required for assessment", async () => {
    const { auth } = await captured();
    await addV4File(auth, validateFile(fileId(1), "synthetic.pdf", "application/pdf", Buffer.from("%PDF-1.7\nsynthetic\n%%EOF")), testNow);
    expect(await mutateV4(auth, { mutationId: fileId(2), details: detailsInput() }, true, testNow)).toMatchObject({ status: "awaiting_photos" });
  });
});
describe("v4 focused media follow-up on the same request", () => {
  const mediaRows = (m: ReturnType<typeof memoryStore>) => [...m.state().outbox.values()].filter(row => row.kind === "media");
  const png = (i = 1) => validateFile(fileId(i), `synthetic-${i}.png`, "image/png", pngBytes());
  const pdf = () => validateFile(fileId(1), "synthetic.pdf", "application/pdf", Buffer.from("%PDF-1.7\nsynthetic\n%%EOF"));
  it("distinguishes a stored upload from a confirmed follow-up after a disconnect", async () => {
    const { m, auth } = await captured();
    await mutateV4(auth, { mutationId: fileId(20), details: { description: "Partial description" } }, false, testNow);
    const initial = m.state().outbox.get(`${auth.id}:welcome`).payload;
    const contact = m.state().enquiries.get(auth.id).contact;
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(false);
    await addV4File(auth, png(), testNow);
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(true);
    expect(m.state().outbox.size).toBe(2);
    const input = { mutationId: fileId(21) };
    expect(await submitV4Media(auth, input, testNow)).toMatchObject({ reference: auth.id, status: "awaiting_details", duplicate: false });
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(false);
    expect(await submitV4Media(auth, input, testNow)).toMatchObject({ duplicate: true });
    expect(await submitV4Media(auth, { mutationId: fileId(22) }, testNow)).toMatchObject({ duplicate: true });
    const saved = m.state().enquiries.get(auth.id);
    expect(saved).toMatchObject({ contact, qualificationCompletedAt: null, completionCount: 0, status: "awaiting_details" });
    expect(JSON.parse(saved.details)).toEqual({ description: "Partial description" });
    expect(m.state().outbox.get(`${auth.id}:welcome`).payload).toBe(initial);
    expect(m.state().outbox.size).toBe(3); expect(m.state().enquiries.size).toBe(1);
    expect(JSON.parse(mediaRows(m)[0].payload).mail.text).toContain("Fotografias recebidas");
    expect(JSON.parse(mediaRows(m)[0].payload).mail.text).toContain("informação da casa por completar");
  });
  it("serialises concurrent confirmations and rejects reuse of a mutation for a different change", async () => {
    const { m, auth } = await captured(); await addV4File(auth, png(), testNow);
    const results = await Promise.all([21, 22].map(i => submitV4Media(auth, { mutationId: fileId(i) }, testNow)));
    expect(results.map(r => r.duplicate).sort()).toEqual([false, true]); expect(mediaRows(m)).toHaveLength(1);
    await expect(submitV4Media(auth, { mutationId: fileId(21), photosLink: "https://example.test/other" }, testNow)).rejects.toThrow("MUTATION_ID_CONFLICT");
    expect((await draftV4(auth)).details).toBeNull();
  });
  it("preserves completed qualification and suppresses an identical later completion", async () => {
    const { m, auth } = await captured();
    await mutateV4(auth, { mutationId: fileId(20), details: detailsInput() }, true, testNow);
    const qualified = m.state().enquiries.get(auth.id).qualificationCompletedAt;
    await addV4File(auth, png(), testNow);
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(true);
    const later = new Date(+testNow + 60_000);
    expect(await submitV4Media(auth, { mutationId: fileId(21) }, later)).toMatchObject({ status: "complete" });
    expect(m.state().enquiries.get(auth.id)).toMatchObject({ qualificationCompletedAt: qualified, completionCount: 1 });
    expect(await mutateV4(auth, { mutationId: fileId(22), details: detailsInput() }, true, later)).toMatchObject({ duplicate: true });
    expect(m.state().outbox.size).toBe(4); expect(mediaRows(m)).toHaveLength(1);
    expect(JSON.parse(mediaRows(m)[0].payload).mail.text).toContain("confirmar suficiência antes de avaliar");
  });
  it.each([false, true])("labels PDF-only follow-up as documents, qualified=%s", async qualified => {
    const { m, auth } = await captured();
    if (qualified) await mutateV4(auth, { mutationId: fileId(20), details: detailsInput() }, true, testNow);
    await addV4File(auth, pdf(), testNow);
    expect(await submitV4Media(auth, { mutationId: fileId(21) }, testNow)).toMatchObject({ status: qualified ? "awaiting_photos" : "awaiting_details" });
    const text = JSON.parse(mediaRows(m)[0].payload).mail.text;
    expect(text).toContain("Documentos recebidos"); expect(text).toContain("Fotografias em falta");
    expect(text).not.toContain("Dados e imagens recebidos");
  });
  it("retains frozen attachments and never changes an in-flight provider payload", async () => {
    const { m, auth } = await captured(); await addV4File(auth, png(), testNow);
    await submitV4Media(auth, { mutationId: fileId(21) }, testNow);
    const row = mediaRows(m)[0]; const frozen = row.payload; row.status = "sending";
    await removeV4File(auth, fileId(1), testNow); await addV4File(auth, png(2), testNow);
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(true);
    await submitV4Media(auth, { mutationId: fileId(22) }, testNow);
    expect(m.state().outbox.get(row.id).payload).toBe(frozen);
    const files = await v4MailFiles({ ...row, payload: JSON.parse(frozen) } as V4Outbox);
    expect(files.map(f => f.name)).toEqual(["synthetic-1.png"]); expect(files[0].content.equals(pngBytes())).toBe(true);
    expect(mediaRows(m)).toHaveLength(2);
  });
  it("handles A→B→A at the same timestamp using the latest notification, including reopened qualification", async () => {
    const { m, auth } = await captured(); const a = "https://example.test/photos-a", b = "https://example.test/photos-b";
    await mutateV4(auth, { mutationId: fileId(20), details: { ...detailsInput(), photosLink: a } }, true, testNow);
    await mutateV4(auth, { mutationId: fileId(21), details: { photosLink: b } }, false, testNow);
    await submitV4Media(auth, { mutationId: fileId(22) }, testNow);
    await mutateV4(auth, { mutationId: fileId(23), details: { photosLink: a } }, false, testNow);
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(true);
    expect(await submitV4Media(auth, { mutationId: fileId(24) }, testNow)).toMatchObject({ duplicate: false, status: "awaiting_details" });
    expect(mediaRows(m).map(r => JSON.parse(r.payload).mediaLink)).toEqual([b, a]);
    expect(m.state().enquiries.get(auth.id).qualificationCompletedAt).toEqual(testNow);
  });
  it("recognises media already included in legacy completed notifications", async () => {
    const { m, auth } = await captured(); await addV4File(auth, png(), testNow);
    await mutateV4(auth, { mutationId: fileId(20), details: detailsInput() }, true, testNow);
    const row = m.state().outbox.get(`${auth.id}:completed:1`), payload = JSON.parse(row.payload);
    delete payload.mediaFingerprint; delete payload.mediaLink; delete payload.notificationRevision; row.payload = JSON.stringify(payload);
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(false);
    expect(await submitV4Media(auth, { mutationId: fileId(21) }, testNow)).toMatchObject({ duplicate: true });
    expect(mediaRows(m)).toHaveLength(0);
    await addV4File(auth, png(2), testNow); expect((await draftV4(auth)).mediaConfirmationRequired).toBe(true);
  });
  it("validates the effective link saved in a partial draft before rendering any email", async () => {
    const { m, auth } = await captured();
    for (const [i, photosLink] of ["javascript:alert(1)", "https://"].entries()) {
      await mutateV4(auth, { mutationId: fileId(20 + i), details: { photosLink } }, false, testNow);
      await expect(submitV4Media(auth, { mutationId: fileId(22 + i) }, testNow)).rejects.toMatchObject({ message: "VALIDATION_FAILED", fields: ["photosLink"] });
    }
    expect(m.state().outbox.size).toBe(2);
    await submitV4Media(auth, { mutationId: fileId(24), photosLink: "https://example.test/photos" }, testNow);
    expect(mediaRows(m)).toHaveLength(1);
  });
  it("rejects empty initial submissions but allows one confirmation when the last link was withdrawn", async () => {
    const { m, auth } = await captured();
    await expect(submitV4Media(auth, { mutationId: fileId(20) }, testNow)).rejects.toMatchObject({ message: "MEDIA_REQUIRED", status: 400 });
    await submitV4Media(auth, { mutationId: fileId(21), photosLink: "https://example.test/photos" }, testNow);
    expect(await submitV4Media(auth, { mutationId: fileId(22), photosLink: "" }, testNow)).toMatchObject({ duplicate: false, status: "awaiting_details" });
    expect((await draftV4(auth)).details?.photosLink).toBe(""); expect(mediaRows(m)).toHaveLength(2);
    expect(JSON.parse(mediaRows(m)[1].payload).mail.text).toContain("Material retirado pelo proprietário");
    expect(await submitV4Media(auth, { mutationId: fileId(23) }, testNow)).toMatchObject({ duplicate: true });
    expect(mediaRows(m)).toHaveLength(2);
  });
  it("resumes and confirms removal of the final file without qualifying a partial request", async () => {
    const { m, auth } = await captured(); await addV4File(auth, png(), testNow);
    await submitV4Media(auth, { mutationId: fileId(20) }, testNow);
    await removeV4File(auth, fileId(1), testNow);
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(true);
    expect(await submitV4Media(auth, { mutationId: fileId(21) }, testNow)).toMatchObject({ status: "awaiting_details", duplicate: false });
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(false);
    expect(m.state().enquiries.get(auth.id).qualificationCompletedAt).toBeNull();
    const last = JSON.parse(mediaRows(m)[1].payload); expect(last.fileIds).toEqual([]);
    expect(last.mail.text).toContain("Material retirado pelo proprietário");
  });
  it("does not mistake an unnotified draft link for material previously sent to the team", async () => {
    const { m, auth } = await captured();
    await mutateV4(auth, { mutationId: fileId(20), details: detailsInput() }, true, testNow);
    await mutateV4(auth, { mutationId: fileId(21), details: { photosLink: "https://example.test/draft-only" } }, false, testNow);
    await expect(submitV4Media(auth, { mutationId: fileId(22), photosLink: "" }, testNow)).rejects.toThrow("MEDIA_REQUIRED");
    expect(mediaRows(m)).toHaveLength(0); expect((await draftV4(auth)).details?.photosLink).toBe("https://example.test/draft-only");
  });
  it("allows direct withdrawal of a link already included in a legacy notification", async () => {
    const { m, auth } = await captured();
    await mutateV4(auth, { mutationId: fileId(20), details: { ...detailsInput(), photosLink: "https://example.test/legacy" } }, true, testNow);
    const row = m.state().outbox.get(`${auth.id}:completed:1`), payload = JSON.parse(row.payload);
    delete payload.mediaFingerprint; delete payload.mediaLink; delete payload.notificationRevision; row.payload = JSON.stringify(payload);
    expect(await submitV4Media(auth, { mutationId: fileId(21), photosLink: "" }, testNow)).toMatchObject({ status: "awaiting_photos", duplicate: false });
    expect(JSON.parse(mediaRows(m)[0].payload).mail.text).toContain("Material retirado pelo proprietário");
  });
  it("after final-file removal, keeps qualified requests awaiting photos and the original qualification timestamp", async () => {
    const { m, auth } = await captured(); await addV4File(auth, png(), testNow);
    await mutateV4(auth, { mutationId: fileId(20), details: detailsInput() }, true, testNow);
    await removeV4File(auth, fileId(1), testNow);
    expect((await draftV4(auth)).mediaConfirmationRequired).toBe(true);
    expect(await submitV4Media(auth, { mutationId: fileId(21) }, new Date(+testNow + 60_000))).toMatchObject({ status: "awaiting_photos" });
    expect(m.state().enquiries.get(auth.id).qualificationCompletedAt).toEqual(testNow);
  });
  it("does not confirm notification when its transaction fails; saved uploads remain resumable", async () => {
    const m = memoryStore({ failMediaOutbox: true }); const started = await startV4(startInput(), testNow);
    const auth = await authenticateV4(started.continuationToken, testNow); await addV4File(auth, png(), testNow);
    await expect(submitV4Media(auth, { mutationId: fileId(20) }, testNow)).rejects.toThrow("synthetic outbox failure");
    const draft = await draftV4(auth); expect(draft.mediaConfirmationRequired).toBe(true); expect(draft.files).toHaveLength(1);
    expect(m.state().outbox.size).toBe(2); expect(m.state().mutations.size).toBe(0);
  });
});
describe("v4 separate binary files and bounded private storage", () => {
  it("replays a file upload idempotently and rejects conflicting bytes or another owner's ID", async () => {
    const { m, auth } = await captured(); const file = validateFile(fileId(1), "synthetic.png", "image/png", pngBytes());
    expect(await addV4File(auth, file, testNow)).toMatchObject({ duplicate: false });
    expect(await addV4File(auth, file, testNow)).toMatchObject({ duplicate: true }); expect(m.state().files.size).toBe(1);
    await expect(addV4File(auth, { ...file, digest: "changed" }, testNow)).rejects.toThrow("FILE_ID_CONFLICT");
    const second = await startV4({ ...startInput(), requestId: fileId(9) }, testNow); const other = await authenticateV4(second.continuationToken, testNow);
    await expect(addV4File(other, file, testNow)).rejects.toThrow("FILE_ID_CONFLICT");
    await removeV4File(other, file.id, testNow); expect((await draftV4(auth)).files).toHaveLength(1);
  });
  it("enforces 15MiB atomically even when four maximum files arrive concurrently", async () => {
    const { m, auth } = await captured(); const bytes = pngBytes(5 * 1024 * 1024);
    const results = await Promise.allSettled([1, 2, 3, 4].map(i => addV4File(auth, validateFile(fileId(i), `synthetic-${i}.png`, "image/png", bytes), testNow)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3); expect(m.state().files.size).toBe(3);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason.message).toBe("PAYLOAD_TOO_LARGE");
  });
  it("enforces eight files and records lifecycle counters", async () => {
    const { m, auth } = await captured();
    for (let i = 1; i <= 8; i++) await addV4File(auth, validateFile(fileId(i), `synthetic-${i}.png`, "image/png", pngBytes()), testNow);
    await expect(addV4File(auth, validateFile(fileId(9), "ninth.png", "image/png", pngBytes()), testNow)).rejects.toThrow("PAYLOAD_TOO_LARGE");
    expect(m.state().enquiries.get(auth.id)).toMatchObject({ mediaFileCount: 8, mediaReceivedAt: testNow });
  });
  it("bounds historical storage even when an owner repeatedly removes and replaces files", async () => {
    const { m, auth } = await captured();
    for (let i = 1; i <= 32; i++) {
      await addV4File(auth, validateFile(fileId(i), `synthetic-${i}.png`, "image/png", pngBytes()), testNow);
      await removeV4File(auth, fileId(i), testNow);
    }
    await expect(addV4File(auth, validateFile(fileId(33), "new.png", "image/png", pngBytes()), testNow)).rejects.toThrow("ATTACHMENT_HISTORY_LIMIT");
    expect(m.state().files.size).toBe(32);
    expect(await mutateV4(auth, { mutationId: fileId(40), details: detailsInput() }, true, testNow)).toMatchObject({ success: true, status: "awaiting_photos" });
  });
  it("a confirmed cancellation prevents an upload still in flight from reviving the same file ID", async () => {
    const { auth } = await captured();
    await removeV4File(auth, fileId(1), testNow);
    await expect(addV4File(auth, validateFile(fileId(1), "late.png", "image/png", pngBytes()), testNow)).rejects.toThrow("FILE_ID_CONFLICT");
    expect((await draftV4(auth)).files).toHaveLength(0);
    expect(await addV4File(auth, validateFile(fileId(2), "selected-again.png", "image/png", pngBytes()), testNow)).toMatchObject({ success: true });
  });
});
describe("v4 durable delivery claim", () => {
  it("claims atomically, recovers five-minute leases and stops automatic retries before dedup expires", async () => {
    const execute = vi.fn().mockResolvedValue(ok(0)); fake.db.mockResolvedValue({ execute });
    expect(await claimV4("synthetic-outbox", testNow)).toBeNull();
    const queries = execute.mock.calls.map(([q]) => dialect.sqlToQuery(q));
    expect(queries[0].sql).toContain("needs_review"); expect(queries[0].params).toContainEqual(new Date(testNow.getTime() - 20 * 3600_000));
    expect(queries[1].sql).toContain("leaseAt <"); expect(queries[1].params).toContainEqual(new Date(testNow.getTime() - 5 * 60_000));
  });
  it("only clears a confirmed-rejection window when the same lease opened it", async () => {
    const execute = vi.fn().mockResolvedValue(ok()); fake.db.mockResolvedValue({ execute });
    await failedV4({ id: "synthetic", leaseAt: testNow } as V4Outbox, "PROVIDER_DAILY_QUOTA", new Date("2099-01-02"), false, true);
    const q = dialect.sqlToQuery(execute.mock.calls[0][0]);
    expect(q.sql).toContain("firstAttemptAt = CASE WHEN ? AND firstAttemptAt = ? THEN NULL ELSE firstAttemptAt END");
    expect(q.sql).toContain("status = 'sending' AND leaseAt = ?");
    expect(q.params).toContain(true); expect(q.params.filter(p => p instanceof Date && +p === +testNow)).toHaveLength(2);
  });
});
