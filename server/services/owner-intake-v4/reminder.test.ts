import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import type { SQL } from "drizzle-orm";
const fake = vi.hoisted(() => ({ db: vi.fn(), production: vi.fn(() => true) }));
vi.mock("../../db", () => ({ getDb: fake.db }));
vi.mock("../owner-intake/email", async original => ({ ...await original<any>(), isOwnerIntakeProduction: fake.production }));
import { PHOTO_REMINDER_DELAY_MS, photoRemindersEnabled, reminderEligible, reminderFrom, reminderWelcomeReady } from "./reminder";
import { prepareV4ReminderDelivery, queueV4PhotoReminders } from "./store";
import { photoReminderMail, photoRequestMail } from "./email";
import { recordInput, SYNTHETIC_TOKEN, testNow } from "./fixtures.test-utils";
import type { V4Outbox } from "./types";
const now = new Date(testNow.getTime() + PHOTO_REMINDER_DELAY_MS);
const url = `https://www.portugalactive.com/management/complete/?lang=pt#token=${SYNTHETIC_TOKEN}`;
const dialect = new MySqlDialect();
const ok = (affectedRows = 1) => [{ affectedRows }, []];
beforeEach(() => {
  fake.db.mockReset(); fake.production.mockReturnValue(true);
  vi.stubEnv("OWNER_PHOTO_REMINDERS_ENABLED", "true");
  vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", recordInput().id);
  vi.stubEnv("OWNER_AUTOMATION_FROM", "2026-11-03T00:00:00Z");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function memory(record = recordInput()) {
  const state = { record, files: [] as { mimeType: string }[], outbox: new Map<string, any>(), statements: [] as string[] };
  state.outbox.set(`${record.id}:welcome`, { id: `${record.id}:welcome`, status: "sent", firstAttemptAt: testNow, payload: { completionUrl: url } });
  let lock = Promise.resolve();
  async function execute(statement: SQL) {
    const q = dialect.sqlToQuery(statement), p = q.params as any[]; state.statements.push(q.sql);
    if (q.sql.startsWith("SELECT e.id FROM")) return [[{ id: record.id }], []];
    if (q.sql.startsWith("SELECT * FROM owner_v4_enquiries")) return [[state.record], []];
    if (q.sql.includes("AS emailPhotoCount")) return [[{ emailPhotoCount: state.record.emailPhotoCount || 0, emailFileCount: state.record.emailFileCount || 0 }], []];
    if (q.sql.startsWith("SELECT id, name, mimeType")) return [state.files, []];
    if (q.sql.startsWith("SELECT id FROM owner_v4_outbox") || q.sql.startsWith("SELECT status,")) return [[state.outbox.get(p[0])].filter(Boolean), []];
    if (q.sql.startsWith("INSERT INTO owner_v4_outbox")) {
      const [id, enquiryId, kind, payload, attachmentBytes, createdAt] = p;
      if (state.outbox.has(id)) throw new Error("duplicate reminder");
      state.outbox.set(id, { id, enquiryId, kind, payload: JSON.parse(payload), attachmentBytes, createdAt, status: "pending" }); return ok();
    }
    if (q.sql.startsWith("UPDATE owner_v4_outbox SET status = 'cancelled'")) {
      const item = state.outbox.get(p[0]);
      if (item?.status === "sending" && +item.leaseAt === +p[1]) { item.status = "cancelled"; item.leaseAt = null; return ok(); }
      return ok(0);
    }
    if (q.sql.startsWith("UPDATE owner_v4_outbox SET status = 'pending'")) {
      const [next, lease, id] = p; const item = state.outbox.get(id);
      if (item?.status === "sending" && +item.leaseAt === +lease) { item.status = "pending"; item.leaseAt = null; item.nextAttemptAt = next; return ok(); }
      return ok(0);
    }
    throw new Error(`Unexpected isolated statement: ${q.sql}`);
  }
  fake.db.mockResolvedValue({ execute, transaction<T>(run: (tx: { execute: typeof execute }) => Promise<T>) {
    const result = lock.then(() => run({ execute })); lock = result.then(() => {}, () => {}); return result;
  } });
  const reminder = () => state.outbox.get(`${record.id}:photo-reminder`);
  const claim = () => { const item = reminder(); Object.assign(item, { status: "sending", leaseAt: now, attempts: 1 }); return { ...item } as V4Outbox; };
  return { ...state, reminder, claim };
}
describe("one restrained owner photo reminder", () => {
  it("waits 48 hours, honors deployment flag and production isolation", async () => {
    const r = recordInput(); expect(reminderEligible(r, [], new Date(+now - 1))).toBe(false);
    expect(reminderEligible(r, [], now)).toBe(true);
    expect(photoRemindersEnabled()).toBe(true);
    vi.stubEnv("OWNER_PHOTO_REMINDERS_ENABLED", "false"); expect(await queueV4PhotoReminders(now)).toBe(0); expect(fake.db).not.toHaveBeenCalled();
    vi.stubEnv("OWNER_PHOTO_REMINDERS_ENABLED", "true"); fake.production.mockReturnValue(false);
    expect(await queueV4PhotoReminders(now)).toBe(0); expect(fake.db).not.toHaveBeenCalled();
  });
  it("excludes old, expired and synthetic enquiries except the exact approved test ID", () => {
    const r = recordInput(); vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", ""); expect(reminderEligible(r, [], now)).toBe(false);
    vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", r.id); expect(reminderEligible(r, [], now)).toBe(true);
    expect(reminderEligible({ ...r, tokenExpiresAt: now }, [], now)).toBe(false);
    expect(reminderEligible({ ...r, capturedAt: new Date("2026-11-02") }, [], now)).toBe(false);
    vi.stubEnv("OWNER_AUTOMATION_FROM", "invalid"); expect(+reminderFrom()).toBeGreaterThan(+now);
    expect(reminderEligible(r, [], now)).toBe(false);
  });
  it("requires a delivered welcome and a 24 hour pause after its actual acceptance", () => {
    expect(reminderWelcomeReady({ status: "pending", firstAttemptAt: testNow }, now)).toBe(false);
    expect(reminderWelcomeReady({ status: "sent", firstAttemptAt: testNow, acceptedAt: now.toISOString() }, now)).toBe(false);
    expect(reminderWelcomeReady({ status: "sent", firstAttemptAt: testNow }, now)).toBe(true);
    expect(reminderEligible({ ...recordInput(), updatedAt: new Date(+now - 3600_000) }, [], now)).toBe(false);
  });
  it("suppresses for uploaded images or links, while a document alone still needs photos", () => {
    expect(reminderEligible(recordInput(), [{ mimeType: "image/png" }], now)).toBe(false);
    expect(reminderEligible({ ...recordInput(), details: { photosLink: "https://example.test/album" } }, [], now)).toBe(false);
    expect(reminderEligible(recordInput(), [{ mimeType: "application/pdf" }], now)).toBe(true);
    expect(reminderEligible({ ...recordInput(), status: "complete" }, [], now)).toBe(false);
    expect(reminderEligible({ ...recordInput(), emailPhotoCount: 2, emailFileCount: 2 }, [], now)).toBe(false);
    expect(reminderEligible({ ...recordInput(), emailPhotoCount: 0, emailFileCount: 1 }, [], now)).toBe(true);
  });
  it("does not queue requests for photos already received by email, and cancels a previously queued request", async () => {
    const m = memory();
    m.record.emailPhotoCount = 1; m.record.emailFileCount = 1;
    expect(await queueV4PhotoReminders(now)).toBe(0); expect(m.reminder()).toBeUndefined();
    m.record.emailPhotoCount = 0; m.record.emailFileCount = 0;
    expect(await queueV4PhotoReminders(now)).toBe(1); const item = m.claim();
    m.record.emailPhotoCount = 1; m.record.emailFileCount = 1;
    expect(await prepareV4ReminderDelivery(item, now)).toBe(false);
    expect(m.reminder().status).toBe("cancelled");
    expect(m.statements.some(q => q.includes("m.sourceKey = CONCAT('v4:', e.id)") && q.includes("m.status = 'ready'"))).toBe(true);
  });
  it("two concurrent scheduler sweeps freeze exactly one message with the same private photo link", async () => {
    const m = memory(); expect(await Promise.all([queueV4PhotoReminders(now), queueV4PhotoReminders(now)])).toEqual([1, 0]);
    expect(await queueV4PhotoReminders(now)).toBe(0); expect(m.outbox.size).toBe(2);
    expect(m.reminder().payload.completionUrl).toBe(url); expect(m.reminder().payload.fileIds).toEqual([]);
    expect(m.reminder().payload.mail.text).toContain("sem repetir o formulário");
    expect(m.statements.some(q => q.includes("FOR UPDATE"))).toBe(true);
  });
  it("does not queue a reminder if the welcome/link is unconfirmed or points elsewhere", async () => {
    const m = memory(), welcome = m.outbox.get(`${m.record.id}:welcome`);
    welcome.status = "failed"; expect(await queueV4PhotoReminders(now)).toBe(0);
    welcome.status = "sent"; welcome.payload.completionUrl = "https://example.test/#token=" + SYNTHETIC_TOKEN;
    expect(await queueV4PhotoReminders(now)).toBe(0); expect(m.reminder()).toBeUndefined();
  });
  it("cancels a reminder when photos arrive while it is queued, and never sends it later", async () => {
    const m = memory(); await queueV4PhotoReminders(now); const item = m.claim();
    m.files.push({ mimeType: "image/jpeg" }); expect(await prepareV4ReminderDelivery(item, now)).toBe(false);
    expect(m.reminder().status).toBe("cancelled"); m.files.length = 0;
    expect(await prepareV4ReminderDelivery(item, now)).toBe(false); expect(await queueV4PhotoReminders(now)).toBe(0);
  });
  it("persists cancellation for a closed CRM deal even if a later retry sees it reopen", async () => {
    const m = memory(); await queueV4PhotoReminders(now); const item = m.claim();
    expect(await prepareV4ReminderDelivery(item, now, false)).toBe(false);
    expect(m.reminder().status).toBe("cancelled");
    expect(await prepareV4ReminderDelivery(item, now, true)).toBe(false);
    expect(await queueV4PhotoReminders(now)).toBe(0);
  });
  it("excludes named E2E tests without excluding people whose name includes Testa", () => {
    const r = recordInput(); r.contact.email = "contact@fictitious-business.pt";
    vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", "");
    for (const name of ["E2E-TEST", "PA_QA_CASE", "PAQA_CASE", "Teste sintético", "synthetic test"]) {
      r.contact.name = name; expect(reminderEligible(r, [], now)).toBe(false);
    }
    r.contact.name = "João Testa"; expect(reminderEligible(r, [], now)).toBe(true);
  });
  it("rechecks expiry, changed recipient and the claimed lease before dispatch", async () => {
    const m = memory(); await queueV4PhotoReminders(now); const item = m.claim();
    expect(await prepareV4ReminderDelivery(item, now)).toBe(true);
    expect(await prepareV4ReminderDelivery({ ...item, leaseAt: testNow }, now)).toBe(false);
    m.record.contact.email = "changed@example.test"; expect(await prepareV4ReminderDelivery(item, now)).toBe(false);
    expect(m.reminder().status).toBe("cancelled");
  });
  it("pauses existing reminders when disabled and postpones recent contact activity", async () => {
    const m = memory(); await queueV4PhotoReminders(now); const item = m.claim();
    vi.stubEnv("OWNER_PHOTO_REMINDERS_ENABLED", "false"); expect(await prepareV4ReminderDelivery(item, now)).toBe(false);
    expect(m.reminder().status).toBe("pending");
    vi.stubEnv("OWNER_PHOTO_REMINDERS_ENABLED", "true"); const again = m.claim(); m.record.updatedAt = now;
    expect(await prepareV4ReminderDelivery(again, now)).toBe(false);
    expect(m.reminder().status).toBe("pending"); expect(+m.reminder().nextAttemptAt).toBe(+now + 24 * 3600_000);
  });
  it("provides branded photo-only copy in all ten languages without restarting the form", () => {
    for (const language of ["pt", "en", "fr", "de", "nl", "es", "it", "he", "ar", "zh"]) {
      const r = recordInput(); r.context.language = language; r.contact.name = '<script>"Owner"</script>';
      const mail = photoReminderMail(r, url); expect(mail.html).toContain('pa-logo-dark.png');
      expect(mail.html).toContain(`lang="${language}"`); expect(mail.html).not.toContain('<script>');
      expect(mail.text).toContain(url); expect(mail.replyTo).toBe("management@portugalactive.com");
      expect(mail.from).toContain("management@portugalactive.com");
      if (["he", "ar"].includes(language)) expect(mail.html).toContain('dir="rtl"');
    }
  });
});

describe("explicit historical photo delivery", () => {
  function historical() {
    const record = recordInput(); record.capturedAt = now; record.updatedAt = now;
    record.privacyAcknowledgedAt = null; record.privacyNoticeVersion = "owner-crm-photo-followup";
    const m = memory(record); m.outbox.delete(`${record.id}:welcome`);
    m.outbox.set(`${record.id}:photo-reminder`, { id: `${record.id}:photo-reminder`, enquiryId: record.id, kind: "historical_photos",
      payload: { mail: photoRequestMail(record, url), completionUrl: url, fileIds: [] }, attachmentBytes: 0, status: "pending" });
    return m;
  }
  it("delivers an explicitly requested fresh continuation without a welcome or artificial aging", async () => {
    const m = historical(); const item = m.claim();
    expect(await prepareV4ReminderDelivery(item, now, true)).toBe(true);
    expect(m.outbox.has(`${m.record.id}:welcome`)).toBe(false);
    expect(m.statements.some(q => q.startsWith("SELECT status, firstAttemptAt, payload"))).toBe(false);
  });
  it("shares the existing reminder identity so an automatic sweep cannot create another request", async () => {
    const m = historical();
    expect(await queueV4PhotoReminders(new Date(+now + PHOTO_REMINDER_DELAY_MS))).toBe(0);
    expect(m.outbox.size).toBe(1); expect(m.reminder().kind).toBe("historical_photos");
  });
  it("cancels for photos or a closed CRM deal, including on repeated dispatch", async () => {
    const m = historical(); const item = m.claim();
    m.files.push({ mimeType: "image/png" });
    expect(await prepareV4ReminderDelivery(item, now, true)).toBe(false); expect(m.reminder().status).toBe("cancelled");
    m.files.length = 0; expect(await prepareV4ReminderDelivery(item, now, true)).toBe(false);
    const other = historical(); const second = other.claim();
    expect(await prepareV4ReminderDelivery(second, now, false)).toBe(false); expect(other.reminder().status).toBe("cancelled");
  });
  it("respects the stop switch and still checks the same recipient, token and expiry", async () => {
    const m = historical(); const item = m.claim();
    vi.stubEnv("OWNER_PHOTO_REMINDERS_ENABLED", "false");
    expect(await prepareV4ReminderDelivery(item, now, true)).toBe(false); expect(m.reminder().status).toBe("pending");
    expect(+m.reminder().nextAttemptAt).toBe(+now + 15 * 60_000);
    vi.stubEnv("OWNER_PHOTO_REMINDERS_ENABLED", "true"); const again = m.claim();
    m.record.tokenExpiresAt = now;
    expect(await prepareV4ReminderDelivery(again, now, true)).toBe(false); expect(m.reminder().status).toBe("cancelled");
  });
});
