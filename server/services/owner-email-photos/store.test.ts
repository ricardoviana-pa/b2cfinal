import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
const fake = vi.hoisted(() => ({ db: vi.fn(), production: vi.fn(() => true), config: vi.fn(() => ({ token: "synthetic-test-secret" })) }));
vi.mock("../../db", () => ({ getDb: fake.db }));
vi.mock("../owner-intake/email", () => ({ isOwnerIntakeProduction: fake.production }));
vi.mock("../owner-crm/service", () => ({ ownerCrmConfig: fake.config }));
import { acceptOwnerEmail, completeOwnerEmail, putOwnerEmailFile } from "./store";
import { syntheticMetadata } from "./fixtures.test-utils";
import type { InboundAttachmentDescriptor, InboundPhotoMetadata } from "./protocol";
const dialect = new MySqlDialect(), now = new Date("2099-01-04T12:00:00Z");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", OLD = "33333333-3333-4333-8333-333333333333";
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4xkAAAAASUVORK5CYII=", "base64");
const descriptor = (bytes = png, patch: Partial<InboundAttachmentDescriptor> = {}): InboundAttachmentDescriptor => ({ id: "a".repeat(64), name: "property.png", mimeType: "image/png", size: bytes.length, disposition: "attachment", ...patch });
const metadata = (patch: Partial<InboundPhotoMetadata> = {}): InboundPhotoMetadata => ({ ...syntheticMetadata(), text: A, attachments: [descriptor()], ...patch });
function request(id = A, email = "owner@synthetic.test") {
  return { id, sourceKey: `v4:${id}`, contact: { name: "Owner Fixture", email, phone: "+351900000000" }, tokenHash: hash("a".repeat(43)),
    personId: id === A ? 10 : 11, dealId: id === A ? 20 : 21, originalSourceKey: null, status: "awaiting_photos", revision: 4,
    qualificationCompletedAt: now, mediaReceivedAt: null, updatedAt: now, details: { description: "A fictional property" }, outbound: [] as string[] };
}
/** Synthetic transactional adapter; no credentials, network or external database. */
function memoryStore(seed: any[] = [request()], options: { failReview?: boolean } = {}) {
  type State = { requests: Map<string, any>; bindings: Map<string, any>; messages: Map<string, any>; files: Map<string, any>; outbox: Map<string, any> };
  let state: State = { requests: new Map(seed.map(r => [r.sourceKey, { ...r }])), bindings: new Map(seed.map(r => [r.sourceKey, { personId: r.personId, dealId: r.dealId }])), messages: new Map(), files: new Map(), outbox: new Map() };
  const statements: { sql: string; params: any[] }[] = []; let queue = Promise.resolve();
  const ok = () => [{ affectedRows: 1 }, []], result = (values: any[]) => [values, []];
  async function execute(query: SQL, s = state): Promise<any> {
    const q = dialect.sqlToQuery(query), p = q.params as any[]; statements.push(q);
    if (q.sql.startsWith("SELECT e.id,e.tokenHash") || q.sql.startsWith("SELECT e.id,e.payload")) {
      const v4 = q.sql.startsWith("SELECT e.id,e.tokenHash");
      return result([...s.requests.values()].filter(r => r.sourceKey.startsWith(v4 ? "v4:" : "v3:"))
        .filter(r => v4 || ![...s.requests.values()].some(other => other.originalSourceKey === r.sourceKey && s.bindings.has(other.sourceKey)))
        .filter(r => p.includes((r.contact || r.payload).email) || p.includes(r.id) || p.includes(r.originalSourceKey) || p.includes(r.tokenHash) || r.outbound.some((id: string) => p.includes(hash(id))))
        .map(r => ({ ...r, ...s.bindings.get(r.sourceKey) })));
    }
    if (q.sql.startsWith("SELECT id FROM owner_v4_enquiries WHERE LOWER")) return result([...s.requests.values()].filter(r => p.includes((r.contact || r.payload).email)).slice(0,1));
    if (q.sql.startsWith("SELECT h.messageId")) return result(([...s.requests.values()].find(r => r.id === p[0])?.outbound || []).map((messageId: string) => ({ messageId })));
    if (q.sql.startsWith("SELECT * FROM owner_email_messages")) return result([s.messages.get(p[0])].filter(Boolean));
    if (q.sql.startsWith("SELECT attachmentId FROM owner_email_files") || q.sql.startsWith("SELECT attachmentId,mimeType")) return result([...s.files.values()].filter(f => f.messageKey === p[0]));
    if (q.sql.startsWith("SELECT digest,outcome FROM owner_email_files")) return result([s.files.get(`${p[0]}:${p[1]}`)].filter(Boolean));
    if (q.sql.startsWith("INSERT IGNORE INTO owner_email_messages")) {
      const [messageKey, mailbox, providerId, threadId, messageId, fingerprint, sourceKey, dealId, personId, senderEmail, subject, descriptors, status, reason, receivedAt, createdAt, updatedAt, bodyText] = p;
      if (!s.messages.has(messageKey)) s.messages.set(messageKey, { messageKey, mailbox, providerId, threadId, messageId, fingerprint, sourceKey, dealId, personId, senderEmail, subject, descriptors, status, reason, receivedAt, createdAt, updatedAt, bodyText });
      return ok();
    }
    if (q.sql.startsWith("INSERT INTO owner_email_files")) {
      const [id, messageKey, attachmentId, name, mimeType, size, digest, content, active, outcome, reason, createdAt] = p;
      const key = `${messageKey}:${attachmentId}`; if (s.files.has(key)) throw new Error("synthetic duplicate attachment");
      s.files.set(key, { id, messageKey, attachmentId, name, mimeType, size, digest, content, active, outcome, reason, createdAt }); return ok();
    }
    if (q.sql.startsWith("INSERT IGNORE INTO owner_v4_outbox")) {
      if (options.failReview) throw new Error("synthetic outbox failure");
      const [id, enquiryId, payload, createdAt] = p; if (!s.outbox.has(id)) s.outbox.set(id, { id, enquiryId, payload, createdAt, kind: "email_review", status: "pending" }); return ok();
    }
    if (q.sql.startsWith("UPDATE owner_email_messages SET bodyText")) {
      const [bodyText,fingerprint,sourceKey,personId,dealId,senderEmail,status,updatedAt,messageKey] = p;
      Object.assign(s.messages.get(messageKey), {bodyText,fingerprint,sourceKey,personId,dealId,senderEmail,status,reason:null,updatedAt}); return ok();
    }
    if (q.sql.startsWith("UPDATE owner_email_messages SET status='review'")) { Object.assign(s.messages.get(p[2]), { status: "review", reason: p[0], updatedAt: p[1] }); return ok(); }
    if (q.sql.startsWith("UPDATE owner_email_messages SET status='ignored'")) { Object.assign(s.messages.get(p[1]), { status: "ignored", reason: "NO_ELIGIBLE_ATTACHMENTS", updatedAt: p[0] }); return ok(); }
    if (q.sql.startsWith("UPDATE owner_email_messages SET status='ready'")) { Object.assign(s.messages.get(p[1]), { status: "ready", updatedAt: p[0] }); return ok(); }
    if (q.sql.startsWith("UPDATE owner_email_messages SET updatedAt")) { s.messages.get(p[1]).updatedAt = p[0]; return ok(); }
    if (q.sql.startsWith("UPDATE owner_email_files SET active=0")) { for (const f of s.files.values()) if (f.messageKey === p[0]) Object.assign(f, { active: 0, content: null }); return ok(); }
    if (q.sql.startsWith("SELECT * FROM owner_v4_enquiries WHERE id")) return result([s.requests.get(`v4:${p[0]}`)].filter(Boolean));
    if (q.sql.startsWith("SELECT * FROM owner_enquiries WHERE id")) return result([s.requests.get(`v3:${p[0]}`)].filter(Boolean));
    if (q.sql.startsWith("SELECT personId,dealId FROM owner_crm_links")) return result([s.bindings.get(p[0])].filter(Boolean));
    if (q.sql.startsWith("SELECT h.enquiryId FROM owner_crm_photo_requests")) return result([...s.requests.values()].filter(r => r.originalSourceKey === p[0] && s.bindings.has(r.sourceKey)));
    if (q.sql.startsWith("UPDATE owner_v4_enquiries SET updatedAt")) {
      const [updatedAt, status, hasPhotos, receivedAt, id] = p, r = s.requests.get(`v4:${id}`); r.updatedAt = updatedAt; r.status = status; r.revision++;
      if (hasPhotos && !r.mediaReceivedAt) r.mediaReceivedAt = receivedAt; return ok();
    }
    if (q.sql.startsWith("UPDATE owner_enquiries SET updatedAt")) { s.requests.get(`v3:${p[1]}`).updatedAt = p[0]; return ok(); }
    if (q.sql.startsWith("UPDATE owner_v4_outbox SET status='cancelled'")) {
      for (const r of s.outbox.values()) if (r.enquiryId === p[0] && ["photo_reminder", "historical_photos"].includes(r.kind) && ["pending", "failed"].includes(r.status)) r.status = "cancelled";
      return ok();
    }
    throw new Error(`Unhandled synthetic SQL: ${q.sql}`);
  }
  const db = { execute, transaction<T>(run: (tx: { execute(query: SQL): Promise<any> }) => Promise<T>): Promise<T> {
    const result = queue.then(async () => {
      const copy = Object.fromEntries(Object.entries(state).map(([key, map]) => [key, new Map([...map].map(([id, row]) => [id, { ...row }]))])) as State;
      const value = await run({ execute: query => execute(query, copy) }); state = copy; return value;
    }); queue = result.then(() => {}, () => {}); return result;
  } };
  fake.db.mockResolvedValue(db);
  let closed = false, unavailable = false;
  const fetch = vi.fn(async (url: string) => {
    if (unavailable) return { ok: false, status: 503 };
    const id = Number(url.split("/").at(-1)), deal = url.includes("/deals/"), r = seed.find(r => deal ? r.dealId === id : r.personId === id);
    return { ok: true, status: 200, json: async () => ({ success: true, data: !r ? null : deal ? { id, status: closed ? "lost" : "open", person_id: r.personId }
      : { id, email: [{ value: (r.contact || (r as any).payload).email }] } }) };
  }); vi.stubGlobal("fetch", fetch);
  return { state: () => state, statements, fetch, closeRemote: () => { closed = true; }, failRemote: (value: boolean) => { unavailable = value; } };
}
beforeEach(() => { vi.clearAllMocks(); fake.production.mockReturnValue(true); delete process.env.OWNER_AUTOMATION_TEST_IDS; });
describe("durable owner reply photo ingestion", () => {
  it("ignores ordinary mail and signature-only replies before matching or contacting CRM", async () => {
    const m = memoryStore();
    expect(await acceptOwnerEmail(metadata({ attachments: [], text: "A normal thank-you" }), now)).toMatchObject({ state: "ignored" });
    expect(await acceptOwnerEmail(metadata({ providerId: "signature-mail", text: "Thanks", attachments: [descriptor(png, { name: "pa-logo-dark.png" })] }), now)).toMatchObject({ state: "ignored" });
    expect(m.fetch).not.toHaveBeenCalled(); expect(m.state().outbox.size).toBe(0);
    expect(m.statements.some(q => q.sql.startsWith("SELECT e.id"))).toBe(false);
  });
  it("accepts a referenced text-only reply, pauses reminders and never claims photos received", async () => {
    const m = memoryStore(), mail = metadata({ attachments: [], replyText: "Já não pretendo vender.\nhttps://airbnb.pt/rooms/123" });
    m.state().outbox.set("reminder", { enquiryId: A, kind: "photo_reminder", status: "pending" });
    const accepted = await acceptOwnerEmail(mail,now); expect(accepted).toMatchObject({state:"accepted",missingAttachmentIds:[]});
    expect(await completeOwnerEmail(accepted.messageKey,now)).toMatchObject({state:"complete"});
    expect(await acceptOwnerEmail(mail,now)).toMatchObject({state:"complete"});
    expect(await completeOwnerEmail(accepted.messageKey,now)).toMatchObject({state:"complete"});
    expect(m.state().messages.get(accepted.messageKey)).toMatchObject({bodyText:mail.replyText,sourceKey:`v4:${A}`,dealId:20,personId:10});
    expect(m.state().requests.get(`v4:${A}`)).toMatchObject({status:"awaiting_photos",mediaReceivedAt:null,revision:5});
    expect(m.state().outbox.get("reminder").status).toBe("cancelled"); expect(m.state().files.size).toBe(0);
    expect(m.state().outbox.size).toBe(1);
  });
  it("keeps empty new text separate from the quoted private body and still pauses followups", async () => {
    const m = memoryStore(), mail = metadata({attachments:[],replyText:"", text:`${A} https://www.portugalactive.com/management/complete/#token=${'t'.repeat(43)}`});
    const accepted = await acceptOwnerEmail(mail,now); await completeOwnerEmail(accepted.messageKey,now);
    expect(m.state().messages.get(accepted.messageKey).bodyText).toBe("");
    expect(JSON.stringify([...m.state().messages.values()])).not.toContain('t'.repeat(43));
  });
  it("ignores unrelated external messages while keeping ambiguous known replies in review without photo alerts", async () => {
    const m = memoryStore([request(),request(B)]);
    expect(await acceptOwnerEmail(metadata({providerId:"unknown",from:"other@synthetic.test",text:"Invoice",replyText:"Invoice",references:["<external-thread@synthetic.test>"],attachments:[]}),now)).toMatchObject({state:"ignored"});
    expect(await acceptOwnerEmail(metadata({providerId:"ambiguous",text:`${A} ${B}`,replyText:"Photos soon",attachments:[]}),now)).toMatchObject({state:"review"});
    expect(m.state().outbox.size).toBe(0); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("enriches an exact old ready message once, preserving its files and binding; altered text is rejected", async () => {
    const m = memoryStore(), mail = metadata(), accepted = await acceptOwnerEmail(mail,now);
    await putOwnerEmailFile(accepted.messageKey,mail.attachments[0].id,png,now); await completeOwnerEmail(accepted.messageKey,now);
    const enriched = {...mail,replyText:"A casa está disponível."};
    expect(await acceptOwnerEmail(enriched,now)).toMatchObject({state:"complete"});
    expect(await acceptOwnerEmail(enriched,now)).toMatchObject({state:"complete"});
    expect(m.state().messages.get(accepted.messageKey).bodyText).toBe(enriched.replyText); expect(m.state().files.size).toBe(1);
    await expect(acceptOwnerEmail({...enriched,replyText:"Alterado"},now)).rejects.toThrow("MESSAGE_CONTENT_CONFLICT");
  });
  it("never enriches an old ready message when the remote deal has closed", async () => {
    const m = memoryStore(), mail = metadata(), accepted = await acceptOwnerEmail(mail,now);
    await putOwnerEmailFile(accepted.messageKey,mail.attachments[0].id,png,now); await completeOwnerEmail(accepted.messageKey,now); m.closeRemote();
    expect(await acceptOwnerEmail({...mail,replyText:"Uma resposta"},now)).toMatchObject({state:"complete"});
    expect(m.state().messages.get(accepted.messageKey).bodyText).toBeNull();
  });
  it("recovers only exact old no-attachment ignores after authenticated matching", async () => {
    const m = memoryStore(), mail = metadata({attachments:[]}), old = await acceptOwnerEmail(mail,now);
    expect(old.state).toBe("ignored");
    expect(await acceptOwnerEmail({...mail,replyText:"https://airbnb.pt/rooms/123"},now)).toMatchObject({state:"accepted"});
    expect(await completeOwnerEmail(old.messageKey,now)).toMatchObject({state:"complete"});
    expect(m.state().messages.size).toBe(1); expect(m.state().messages.get(old.messageKey).dealId).toBe(20);
  });
  it("retries recent uncorrelated replies before creating a review, then resolves a late RFC webhook", async () => {
    const m = memoryStore(), mail = metadata({ text: "Fotos em anexo", references: ["<late-welcome@synthetic.test>"] });
    await expect(acceptOwnerEmail(mail, now)).rejects.toMatchObject({ code: "CORRELATION_PENDING", status: 503 });
    expect(m.state().messages.size).toBe(0); expect(m.state().outbox.size).toBe(0);
    m.state().requests.get(`v4:${A}`).outbound = ["late-welcome@synthetic.test"];
    expect(await acceptOwnerEmail(mail, new Date(+now + 60_000))).toMatchObject({ state: "accepted" });
  });
  it("reviews a still-uncorrelated reply after 15 minutes and never delays a verified contradiction", async () => {
    const m = memoryStore();
    expect(await acceptOwnerEmail(metadata({ text: "Fotos em anexo" }), new Date(+now + 15 * 60_000))).toMatchObject({ state: "review" });
    expect(m.state().outbox.size).toBe(1);
    const other = metadata({ providerId: "wrong-owner", from: "another-owner@synthetic.test" });
    expect(await acceptOwnerEmail(other, now)).toMatchObject({ state: "review" });
    expect([...m.state().messages.values()].at(-1).reason).toBe("SENDER_REQUEST_MISMATCH");
  });
  it("rejects implausible future timestamps before storing metadata", async () => {
    const m = memoryStore();
    await expect(acceptOwnerEmail(metadata({ receivedAt: new Date(+now + 5 * 60_000 + 1).toISOString() }), now)).rejects.toMatchObject({ code: "INVALID_MESSAGE_TIME", status: 400 });
    expect(m.state().messages.size).toBe(0); expect(m.fetch).not.toHaveBeenCalled();
  });
  it("loads conflicting UUIDs and RFC references belonging to a different owner, then queues one safe review", async () => {
    const other = { ...request(B, "other@synthetic.test"), outbound: ["other-message@synthetic.test"] }, m = memoryStore([request(), other]);
    const mail = metadata({ text: `${A}\n${B}`, subject: `Re: https://www.portugalactive.com/management/complete/#token=${"t".repeat(43)}`, references: ["<other-message@synthetic.test>"] });
    const [a, b] = await Promise.all([acceptOwnerEmail(mail, now), acceptOwnerEmail(mail, now)]);
    expect(a.state).toBe("review"); expect(b).toEqual(a); expect(m.state().outbox.size).toBe(1); expect(m.fetch).not.toHaveBeenCalled();
    expect([...m.state().messages.values()][0].reason).toBe("CONFLICTING_REQUEST_REFERENCES");
    expect(JSON.stringify([...m.state().messages.values(), ...m.state().outbox.values()])).not.toContain("t".repeat(43));
    expect([...m.state().outbox.values()][0].payload).toContain("mais de uma propriedade");
    expect([...m.state().outbox.values()][0].payload).not.toContain("CONFLICTING_REQUEST_REFERENCES");
    const params = m.statements.filter(q => q.sql.startsWith("SELECT e.id,e.tokenHash")).flatMap(q => q.params);
    expect(params).toContain(B); expect(params).toContain(hash("other-message@synthetic.test")); expect(params).toContain(hash("t".repeat(43)));
  });
  it("supports historical v3 aliases through the existing canonical v4 request", async () => {
    const historical = { ...request(), originalSourceKey: `v3:${OLD}` }, m = memoryStore([historical]);
    expect(await acceptOwnerEmail(metadata({ text: OLD }), now)).toMatchObject({ state: "accepted" });
    expect([...m.state().messages.values()][0]).toMatchObject({ sourceKey: `v4:${A}`, personId: 10, dealId: 20 });
  });
  it("imports direct v3 replies only to an existing binding and detects a new historical continuation before completion", async () => {
    const v3 = { ...request(OLD), sourceKey: `v3:${OLD}`, contact: undefined, payload: request(OLD).contact }, m = memoryStore([v3]);
    const mail = metadata({ text: OLD }), accepted = await acceptOwnerEmail(mail, now);
    expect(m.state().messages.get(accepted.messageKey)).toMatchObject({ sourceKey: `v3:${OLD}`, dealId: v3.dealId });
    await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, png, now);
    const continued = { ...request(), originalSourceKey: `v3:${OLD}` };
    m.state().requests.set(continued.sourceKey, continued); m.state().bindings.set(continued.sourceKey, { personId: continued.personId, dealId: continued.dealId });
    expect(await completeOwnerEmail(accepted.messageKey, now)).toMatchObject({ state: "review" });
    expect(m.state().messages.get(accepted.messageKey).reason).toBe("SOURCE_CANONICAL_CHANGED");
    expect(m.statements.some(q => /INSERT (?:IGNORE )?INTO owner_crm_links/.test(q.sql))).toBe(false);
  });
  it("stores oversized customer messages as one review instead of requesting files or retrying forever", async () => {
    const m = memoryStore(), mail = metadata({ attachments: [descriptor(png, { size: 16 * 1024 * 1024 })] });
    const first = await acceptOwnerEmail(mail, now), replay = await acceptOwnerEmail(mail, now);
    expect(first).toEqual(replay); expect(first).toMatchObject({ state: "review", missingAttachmentIds: [] });
    expect(m.state().outbox.size).toBe(1); expect(m.state().files.size).toBe(0); expect(m.fetch).not.toHaveBeenCalled();
    expect([...m.state().outbox.values()][0].payload).toContain("15 MB");
  });
  it("serialises duplicate uploads and completions; marks real photos once and cancels only queued photo reminders", async () => {
    const m = memoryStore(), mail = metadata(), accepted = await acceptOwnerEmail(mail, now);
    m.state().outbox.set("reminder", { enquiryId: A, kind: "photo_reminder", status: "pending" });
    m.state().outbox.set("welcome", { enquiryId: A, kind: "welcome", status: "pending" });
    const puts = await Promise.all([putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, png, now), putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, png, now)]);
    expect(puts.map(p => p.duplicate).sort()).toEqual([false, true]); expect(m.state().files.size).toBe(1);
    expect((await acceptOwnerEmail(mail, now)).missingAttachmentIds).toEqual([]);
    const completed = await Promise.all([completeOwnerEmail(accepted.messageKey, now), completeOwnerEmail(accepted.messageKey, now)]);
    expect(completed.map(c => c.state)).toEqual(["complete", "complete"]);
    expect(m.state().requests.get(`v4:${A}`)).toMatchObject({ revision: 5, status: "complete", mediaReceivedAt: now, details: { description: "A fictional property" } });
    expect(m.state().outbox.get("reminder").status).toBe("cancelled"); expect(m.state().outbox.get("welcome").status).toBe("pending");
    expect(m.fetch).toHaveBeenCalledTimes(4); // Acceptance + final live binding checks; duplicates make no extra calls.
    expect(m.statements.filter(q => q.sql.includes("FOR UPDATE")).slice(-3).map(q => q.sql.split(" WHERE")[0]))
      .toEqual(["SELECT * FROM owner_v4_enquiries", "SELECT personId,dealId FROM owner_crm_links", "SELECT * FROM owner_email_messages"]);
    // A replay still succeeds after the CRM worker released the temporary bytes.
    for (const f of m.state().files.values()) f.content = null;
    expect(await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, png, now)).toMatchObject({ success: true, state: "complete", duplicate: true });
  });
  it("rejects changed metadata or different bytes under the same deterministic identifiers", async () => {
    memoryStore(); const mail = metadata(), accepted = await acceptOwnerEmail(mail, now);
    await expect(acceptOwnerEmail({ ...mail, subject: "Different content" }, now)).rejects.toThrow("MESSAGE_CONTENT_CONFLICT");
    await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, png, now);
    await expect(putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, Buffer.from("different"), now)).rejects.toThrow("ATTACHMENT_CONTENT_CONFLICT");
  });
  it("records invalid content as a terminal review without endless retries or retaining transport bytes", async () => {
    const m = memoryStore(), bytes = Buffer.from("not a photo"), mail = metadata({ attachments: [descriptor(bytes)] }), accepted = await acceptOwnerEmail(mail, now);
    expect(await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, bytes, now)).toMatchObject({ success: true, state: "review", duplicate: false });
    expect(await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, bytes, now)).toMatchObject({ success: true, state: "review", duplicate: true });
    expect(await completeOwnerEmail(accepted.messageKey, now)).toMatchObject({ state: "review" });
    expect([...m.state().files.values()][0]).toMatchObject({ active: 0, content: null, outcome: "review", reason: "UNSUPPORTED_OR_INVALID_FILE" });
    expect(m.state().outbox.size).toBe(1); expect(m.state().requests.get(`v4:${A}`).revision).toBe(4);
  });
  it("consumes a harmless inline banner once and completes as ignored without any warning", async () => {
    const m = memoryStore(), bytes = Buffer.alloc(40000); bytes.set([0xff, 0xd8, 0xff, 0xc0]); bytes.writeUInt16BE(11, 4); bytes[6] = 8;
    bytes.writeUInt16BE(80, 7); bytes.writeUInt16BE(800, 9); bytes[11] = 1; bytes[12] = 1; bytes[13] = 0x11; bytes[39998] = 0xff; bytes[39999] = 0xd9;
    const mail = metadata({ attachments: [descriptor(bytes, { name: "image001.jpg", mimeType: "image/jpeg", disposition: "inline" })] }), accepted = await acceptOwnerEmail(mail, now);
    expect(await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, bytes, now)).toMatchObject({ success: true, state: "ignored" });
    expect((await acceptOwnerEmail(mail, now)).missingAttachmentIds).toEqual([]);
    expect(await completeOwnerEmail(accepted.messageKey, now)).toMatchObject({ state: "ignored" }); expect(m.state().outbox.size).toBe(0);
  });
  it("imports a PDF as a document without completing photographic qualification or suppressing reminders", async () => {
    const m = memoryStore(), bytes = Buffer.from("%PDF-1.4\nfixture\n%%EOF"), mail = metadata({ attachments: [descriptor(bytes, { name: "document.pdf", mimeType: "application/pdf" })] });
    const accepted = await acceptOwnerEmail(mail, now); await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, bytes, now);
    m.state().outbox.set("reminder", { enquiryId: A, kind: "photo_reminder", status: "pending" });
    expect(await completeOwnerEmail(accepted.messageKey, now)).toMatchObject({ state: "complete" });
    expect(m.state().requests.get(`v4:${A}`)).toMatchObject({ status: "awaiting_photos", mediaReceivedAt: null }); expect(m.state().outbox.get("reminder").status).toBe("pending");
  });
  it.each(["remote", "binding", "owner"])("rechecks %s changes before publishing any file to the CRM", async change => {
    const m = memoryStore(), mail = metadata(), accepted = await acceptOwnerEmail(mail, now); await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, png, now);
    if (change === "remote") m.closeRemote();
    if (change === "binding") m.state().bindings.set(`v4:${A}`, { personId: 10, dealId: 999 });
    if (change === "owner") m.state().requests.get(`v4:${A}`).contact = { name: "Different owner", email: "changed@synthetic.test" };
    expect(await completeOwnerEmail(accepted.messageKey, now)).toMatchObject({ state: "review" });
    expect([...m.state().files.values()][0]).toMatchObject({ active: 0, content: null }); expect(m.state().requests.get(`v4:${A}`).revision).toBe(4); expect(m.state().outbox.size).toBe(1);
  });
  it("keeps partial files resumable through missing attachments or temporary CRM errors", async () => {
    const m = memoryStore(), mail = metadata(), accepted = await acceptOwnerEmail(mail, now);
    await expect(completeOwnerEmail(accepted.messageKey, now)).rejects.toThrow("ATTACHMENTS_PENDING");
    await putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, png, now); m.failRemote(true);
    await expect(completeOwnerEmail(accepted.messageKey, now)).rejects.toThrow("CRM_READ_UNAVAILABLE");
    expect(m.state().messages.get(accepted.messageKey).status).toBe("receiving"); expect(m.state().requests.get(`v4:${A}`).revision).toBe(4);
    m.failRemote(false); expect(await completeOwnerEmail(accepted.messageKey, now)).toMatchObject({ state: "complete" });
  });
  it("rolls back a review and file outcome together when the internal notification cannot be stored", async () => {
    const m = memoryStore([request()], { failReview: true }), bytes = Buffer.from("invalid"), mail = metadata({ attachments: [descriptor(bytes)] }), accepted = await acceptOwnerEmail(mail, now);
    await expect(putOwnerEmailFile(accepted.messageKey, mail.attachments[0].id, bytes, now)).rejects.toThrow("synthetic outbox failure");
    expect(m.state().files.size).toBe(0); expect(m.state().messages.get(accepted.messageKey).status).toBe("receiving");
  });
});
