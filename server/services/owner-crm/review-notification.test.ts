import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
const fake = vi.hoisted(() => ({ production: true, db: vi.fn(), execute: vi.fn() }));
vi.mock("../../db", () => ({ getDb: fake.db }));
vi.mock("../owner-intake/email", () => ({ isOwnerIntakeProduction: () => fake.production }));
import { ownerCrmReviewId, queueOwnerCrmReview } from "./review-notification";
import { CrmError, type CrmEnquiry } from "./types";

const dialect = new MySqlDialect();
const id = "00000000-0000-4000-8000-000000000121";
const enquiry = (): CrmEnquiry => ({ id, source: "v4", sourceKey: `v4:${id}`, name: "PA-QA-CRM-REVIEW-NÃO-CONTACTAR",
  email: "owner@example.invalid", phone: "+351900000000", locality: "Localidade de teste", type: "villa", details: {},
  context: { language: "pt", page_path: "/management/", placement: "hero", page_id: "home", page_kind: "home", region: "" },
  attribution: {}, status: "complete", qualified: true, files: [], capturedAt: new Date("2026-11-05T10:00:00Z"),
  modifiedAt: new Date("2026-11-05T10:01:00Z"), privacyNoticeVersion: "owner-intake-v4" });
const review = () => new CrmError("EXISTING_OPPORTUNITY_REVIEW", true, true);
let outbox: Map<string, any>, person: unknown, queries: { sql: string; params: unknown[] }[];
beforeEach(() => {
  vi.resetAllMocks(); fake.production = true; outbox = new Map(); person = 121; queries = [];
  vi.stubEnv("OWNER_AUTOMATION_FROM", "2026-11-03T00:00:00Z"); vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", id);
  fake.db.mockResolvedValue({ execute: fake.execute });
  fake.execute.mockImplementation(async statement => {
    const q = dialect.sqlToQuery(statement); queries.push(q);
    if (q.sql.startsWith("SELECT remoteId")) return [person == null ? [] : [{ remoteId: person }], []];
    if (q.sql.startsWith("INSERT IGNORE INTO owner_v4_outbox")) {
      const [key, reference, raw] = q.params as [string, string, string];
      const existed = outbox.has(key); if (!existed) outbox.set(key, { reference, ...JSON.parse(raw) });
      return [{ affectedRows: existed ? 0 : 1 }, []];
    }
    throw new Error("UNEXPECTED_QUERY");
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("one commercial alert for an unresolved existing opportunity", () => {
  it("atomically queues one immutable alert across simultaneous attempts and later retries", async () => {
    const e = enquiry();
    const results = await Promise.all(Array.from({ length: 4 }, () => queueOwnerCrmReview(e, review())));
    expect(results.filter(Boolean)).toHaveLength(1); expect(outbox.size).toBe(1);
    const first = JSON.stringify([...outbox.values()][0]); e.name = "PA-QA altered later";
    expect(await queueOwnerCrmReview(e, review())).toBe(false);
    expect(JSON.stringify([...outbox.values()][0])).toBe(first);
    expect(queries.filter(q => q.sql.startsWith("INSERT")).every(q => q.sql.startsWith("INSERT IGNORE"))).toBe(true);
    expect(queries.some(q => q.sql.includes("SELECT") && q.sql.includes("FROM owner_v4_outbox"))).toBe(false);
  });
  it("uses a stable ID per source rather than error text, content, or attempt", () => {
    expect(ownerCrmReviewId(`v4:${id}`)).toBe(ownerCrmReviewId(`v4:${id}`));
    expect(ownerCrmReviewId(`v4:${id}`)).toMatch(/^crm-review:[a-f0-9]{64}$/);
    expect(ownerCrmReviewId(`v3:${id}`)).not.toBe(ownerCrmReviewId(`v4:${id}`));
  });
  it("is branded, explains the hold and points to only the known contact, with no attachments", async () => {
    await queueOwnerCrmReview(enquiry(), review());
    const payload = [...outbox.values()][0];
    expect(payload.fileIds).toEqual([]); expect(payload.mail.attachments).toBeUndefined();
    expect(payload.mail.to).toBe("management@portugalactive.com");
    expect(payload.mail.from).toBe("Portugal Active · Management <management@portugalactive.com>");
    expect(payload.mail.replyTo).toBe("owner@example.invalid");
    expect(payload.mail.html).toContain('alt="Portugal Active"');
    expect(payload.mail.html).toContain("/brand/pa-logo-dark.png");
    expect(payload.mail.html).toContain('href="https://portugalactive.pipedrive.com/person/121"');
    expect(payload.mail.text).toContain("não foi criado um negócio duplicado");
    expect(payload.mail.text).toContain("Responder a este aviso contacta diretamente o proprietário");
    expect(queries[0].sql).toContain("status='done'");
  });
  it.each([null, 0, -1, 1.5, "not-an-id", Number.MAX_SAFE_INTEGER + 1])("omits a CRM link unless its persisted contact ID is safe: %s", async unsafe => {
    person = unsafe; await queueOwnerCrmReview(enquiry(), review());
    expect([...outbox.values()][0].mail.html).not.toContain("pipedrive.com/person/");
  });
  it("escapes HTML and drops private links, hidden context and files instead of serialising the enquiry", async () => {
    const token = "x".repeat(43), e = enquiry();
    e.name = 'PA-QA <img src=x onerror="alert(1)"> & owner';
    e.locality = `Teste https://www.portugalactive.com/management/complete/#token=${token}`;
    e.details = { description: `private #token=${token}` };
    e.files = [{ id: "internal", name: `private-${token}.jpg`, mimeType: "image/jpeg", size: 123, digest: "f".repeat(64) }];
    await queueOwnerCrmReview(e, review());
    const payload = [...outbox.values()][0], body = JSON.stringify(payload);
    expect(payload.mail.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; owner");
    expect(payload.mail.html).not.toContain('<img src=x');
    expect(body).not.toContain(token); expect(body).not.toContain("management/complete");
    expect(payload.fileIds).toEqual([]);
  });
  it.each(["owner@example.invalid\r\nBcc:other@example.invalid", "owner@example.invalid,other@example.invalid", '<owner@example.invalid>'])
    ("never inserts an invalid Reply-To header: %s", async email => {
      const e = enquiry(); e.email = email; await queueOwnerCrmReview(e, review());
      expect([...outbox.values()][0].mail.replyTo).toBe("management@portugalactive.com");
    });
  it("does not queue outside production, for a different failure, or for invalid source identities", async () => {
    fake.production = false; expect(await queueOwnerCrmReview(enquiry(), review())).toBe(false);
    fake.production = true;
    expect(await queueOwnerCrmReview(enquiry(), new CrmError("PIPEDRIVE_HTTP_429"))).toBe(false);
    expect(await queueOwnerCrmReview({ ...enquiry(), sourceKey: "v4:other" }, review())).toBe(false);
    expect(await queueOwnerCrmReview({ ...enquiry(), id: "invalid" }, review())).toBe(false);
    expect(fake.db).not.toHaveBeenCalled();
  });
  it("suppresses synthetic leads outside the explicit allowlist", async () => {
    vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", "");
    expect(await queueOwnerCrmReview(enquiry(), review())).toBe(false); expect(fake.db).not.toHaveBeenCalled();
    vi.stubEnv("OWNER_AUTOMATION_TEST_IDS", id);
    expect(await queueOwnerCrmReview(enquiry(), review())).toBe(true);
  });
  it("surfaces storage errors without attempting delivery or changing the CRM result", async () => {
    fake.execute.mockRejectedValue(new Error("synthetic storage unavailable"));
    await expect(queueOwnerCrmReview(enquiry(), review())).rejects.toThrow("synthetic storage unavailable");
    expect(outbox.size).toBe(0); expect(queries).toHaveLength(0);
    fake.db.mockResolvedValue(null);
    await expect(queueOwnerCrmReview(enquiry(), review())).rejects.toThrow("CRM_REVIEW_STORAGE_UNAVAILABLE");
  });
});
