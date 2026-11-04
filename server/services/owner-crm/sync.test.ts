import { describe, expect, it, vi } from "vitest";
import { automationEligible, ensureRemote, hash, noteContent, remoteFilename, snapshotHash, syncEnquiry } from "./sync";
import { CrmError, type CrmEnquiry, type CrmFieldState, type CrmGateway, type CrmLedger, type CrmOperation } from "./types";
import { desiredPropertyFields, emptyFieldState } from "./fields";
import { ownerCrmConfig } from "./service";

const example = (): CrmEnquiry => ({ source: "v4", id: "00000000-0000-4000-8000-000000000001", sourceKey: "v4:00000000-0000-4000-8000-000000000001",
  modifiedAt: new Date("2026-11-04T12:00:00Z"), capturedAt: new Date("2026-11-04T10:00:00Z"), name: "Proprietário fictício", email: "owner@example.com", phone: "+351900000000",
  locality: "Localidade fictícia", type: "villa", details: { incomeExpectation: "30_60", launchTimeline: "3m", description: "Casa fictícia <script>" }, context: { language: "pt", page_path: "/management/" },
  attribution: { source: "google", campaign: "synthetic" }, status: "awaiting_photos", qualified: true, files: [] });
function memoryLedger() {
  const operations = new Map<string, CrmOperation>();
  const fieldStates = new Map<string, CrmFieldState>();
  const ledger: CrmLedger = {
    fieldState: async key => structuredClone(fieldStates.get(key) || emptyFieldState()),
    saveFieldState: async (key, value) => { fieldStates.set(key, structuredClone(value)); },
    checkpoint: vi.fn(async () => {}),
    operation: async key => { if (!operations.has(key)) operations.set(key, { key, status: "ready", remoteId: null }); return { ...operations.get(key)! }; },
    attempting: async key => { const op = operations.get(key)!; if (op.status !== "ready") return false; op.status = "attempting"; return true; },
    confirmed: async (key, remoteId) => { Object.assign(operations.get(key)!, { status: "done", remoteId }); },
    rejected: async key => { operations.get(key)!.status = "ready"; },
  };
  return { ledger, operations };
}
function gateway(): CrmGateway {
  let fields: Record<string, unknown> = {};
  return { findPersons: vi.fn(async () => []), createPerson: vi.fn(async () => 11), findDeals: vi.fn(async () => []), otherOpenDeals: vi.fn(async () => []),
    createDeal: vi.fn(async e => { fields = desiredPropertyFields(e); return 22; }), readDealFields: vi.fn(async () => ({ ...fields })), updateDealFields: vi.fn(async (_id, patch) => { fields = { ...fields, ...patch }; }),
    findNotes: vi.fn(async () => []), createNote: vi.fn(async () => 33), updateNote: vi.fn(async () => {}), findFiles: vi.fn(async () => []), createFile: vi.fn(async () => 44) };
}
describe("durable owner CRM identity", () => {
  it("replaying a completed enquiry creates one person, opportunity and note", async () => {
    const { ledger } = memoryLedger(); const api = gateway();
    for (let i = 0; i < 4; i++) expect(await syncEnquiry(example(), ledger, api, async () => Buffer.alloc(0))).toEqual({ personId: 11, dealId: 22, noteId: 33 });
    expect(api.createPerson).toHaveBeenCalledTimes(1); expect(api.createDeal).toHaveBeenCalledTimes(1); expect(api.createNote).toHaveBeenCalledTimes(1);
  });
  it("reuses existing exact-email person without updating their contact or owner fields", async () => {
    const { ledger } = memoryLedger(); const api = gateway(); vi.mocked(api.findPersons).mockResolvedValue([99]);
    const result = await syncEnquiry(example(), ledger, api, async () => Buffer.alloc(0));
    expect(result.personId).toBe(99); expect(api.createPerson).not.toHaveBeenCalled();
  });
  it("case-normalized email identity is shared between enquiries", async () => {
    const { ledger } = memoryLedger(); const api = gateway();
    await syncEnquiry(example(), ledger, api, async () => Buffer.alloc(0));
    const second = { ...example(), id: "second", sourceKey: "v4:second", email: " OWNER@EXAMPLE.COM " };
    await syncEnquiry(second, ledger, api, async () => Buffer.alloc(0));
    expect(api.createPerson).toHaveBeenCalledTimes(1); expect(api.createDeal).toHaveBeenCalledTimes(2);
  });
  it("a later email correction stays on the existing enquiry person and deal", async () => {
    const { ledger } = memoryLedger(); const api = gateway(); const e = example();
    await syncEnquiry(e, ledger, api, async () => Buffer.alloc(0)); e.email = "corrected@example.com";
    expect(await syncEnquiry(e, ledger, api, async () => Buffer.alloc(0))).toMatchObject({ personId: 11, dealId: 22 });
    expect(api.createPerson).toHaveBeenCalledTimes(1); expect(api.createDeal).toHaveBeenCalledTimes(1); expect(api.updateNote).toHaveBeenLastCalledWith(33, expect.stringContaining("corrected@example.com"));
  });
  it("holds a historical open opportunity for adjudication instead of duplicating", async () => {
    const { ledger, operations } = memoryLedger(); const api = gateway(); vi.mocked(api.findPersons).mockResolvedValue([99]); vi.mocked(api.otherOpenDeals).mockResolvedValue([88]);
    await expect(syncEnquiry(example(), ledger, api, async () => Buffer.alloc(0))).rejects.toThrow("EXISTING_OPPORTUNITY_REVIEW");
    expect(api.createDeal).not.toHaveBeenCalled(); expect([...operations.values()].find(o => o.key.endsWith(":deal"))?.status).toBe("ready");
  });
  it("a provider committed create with lost response reconciles on retry, never creates again", async () => {
    const { ledger } = memoryLedger(); const find = vi.fn(async () => [] as number[]); const create = vi.fn(async () => { throw new Error("network timeout"); });
    await expect(ensureRemote(ledger, "deal", find, create)).rejects.toThrow("CREATE_UNCONFIRMED");
    find.mockResolvedValue([32]); expect(await ensureRemote(ledger, "deal", find, create)).toBe(32); expect(create).toHaveBeenCalledTimes(1);
  });
  it("uncertain create with no searchable result stays on hold across retries", async () => {
    const { ledger } = memoryLedger(); const find = vi.fn(async () => []); const create = vi.fn(async () => { throw new Error("timeout"); });
    for (let i = 0; i < 5; i++) await expect(ensureRemote(ledger, "deal", find, create)).rejects.toThrow("CREATE_UNCONFIRMED");
    expect(create).toHaveBeenCalledTimes(1);
  });
  it("explicit rejection permits safe retry, unlike timeout", async () => {
    const { ledger } = memoryLedger(); const find = vi.fn(async () => []); const create = vi.fn().mockRejectedValueOnce(new CrmError("PIPEDRIVE_HTTP_429", false, true)).mockResolvedValue(55);
    await expect(ensureRemote(ledger, "deal", find, create)).rejects.toThrow("429"); expect(await ensureRemote(ledger, "deal", find, create)).toBe(55); expect(create).toHaveBeenCalledTimes(2);
  });
  it("a transient preflight lookup failure does not reserve an ambiguous remote create", async () => {
    const { ledger, operations } = memoryLedger(); const find = vi.fn(async () => []); const create = vi.fn(async () => 55);
    const prepare = vi.fn().mockRejectedValueOnce(new CrmError("PIPEDRIVE_UNAVAILABLE")).mockResolvedValue(undefined);
    await expect(ensureRemote(ledger, "deal", find, create, prepare)).rejects.toThrow("PIPEDRIVE_UNAVAILABLE");
    expect(operations.get("deal")?.status).toBe("ready"); expect(create).not.toHaveBeenCalled();
    expect(await ensureRemote(ledger, "deal", find, create, prepare)).toBe(55); expect(create).toHaveBeenCalledTimes(1);
  });
  it("an attachment read failure before upload remains safely retryable", async () => {
    const { ledger, operations } = memoryLedger(); const api = gateway(); const e = example(); const content = Buffer.from("synthetic photo");
    e.files = [{ id: "a", name: "a.png", mimeType: "image/png", size: content.length, digest: hash(content.toString()) }];
    const read = vi.fn().mockRejectedValueOnce(new Error("transient storage read")).mockResolvedValue(content);
    await expect(syncEnquiry(e, ledger, api, read)).rejects.toThrow("transient storage read");
    expect([...operations.values()].find(op => op.key.includes(":file:"))?.status).toBe("ready"); expect(api.createFile).not.toHaveBeenCalled();
    await syncEnquiry(e, ledger, api, read); expect(api.createFile).toHaveBeenCalledTimes(1);
  });
  it("two racing workers cannot both reserve a create", async () => {
    const { ledger } = memoryLedger(); const create = vi.fn(async () => 55);
    const results = await Promise.allSettled([ensureRemote(ledger, "deal", async () => [], create), ensureRemote(ledger, "deal", async () => [], create)]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(create).toHaveBeenCalledTimes(1);
  });
  it("ambiguous multiple exact contacts are never merged or duplicated automatically", async () => {
    const { ledger } = memoryLedger(); const api = gateway(); vi.mocked(api.findPersons).mockResolvedValue([3, 4]);
    await expect(syncEnquiry(example(), ledger, api, async () => Buffer.alloc(0))).rejects.toThrow("MULTIPLE_REMOTE_MATCHES"); expect(api.createPerson).not.toHaveBeenCalled(); expect(api.createDeal).not.toHaveBeenCalled();
  });
  it("later qualification and photos update the same deal and note, deduplicating bytes across file UUIDs", async () => {
    const { ledger } = memoryLedger(); const api = gateway(); const e = example(); const bytes = Buffer.from("synthetic photo");
    await syncEnquiry(e, ledger, api, async () => bytes);
    e.details.photosLink = "https://example.com/photos"; e.files = [{ id: "file-a", name: "image.png", mimeType: "image/png", size: bytes.length, digest: hash(bytes.toString()) }, { id: "file-b", name: "same-image.png", mimeType: "image/png", size: bytes.length, digest: hash(bytes.toString()) }];
    await syncEnquiry(e, ledger, api, async () => bytes); await syncEnquiry(e, ledger, api, async () => bytes);
    expect(api.createDeal).toHaveBeenCalledTimes(1); expect(api.createNote).toHaveBeenCalledTimes(1); expect(api.createFile).toHaveBeenCalledTimes(1); expect(api.updateNote).toHaveBeenLastCalledWith(33, expect.stringContaining("https://example.com/photos"));
  });
  it("corrupt attachment bytes are never sent", async () => {
    const { ledger } = memoryLedger(); const api = gateway(); const e = example(); e.files = [{ id: "a", name: "a.png", mimeType: "image/png", size: 1, digest: hash("A") }];
    await expect(syncEnquiry(e, ledger, api, async () => Buffer.from("B"))).rejects.toThrow("FILE_INTEGRITY"); expect(api.createFile).not.toHaveBeenCalled();
  });
  it("lost lease prevents subsequent provider calls", async () => {
    const { ledger } = memoryLedger(); vi.mocked(ledger.checkpoint).mockRejectedValue(new CrmError("LEASE_LOST")); const api = gateway();
    await expect(syncEnquiry(example(), ledger, api, async () => Buffer.alloc(0))).rejects.toThrow("LEASE_LOST"); expect(api.findPersons).not.toHaveBeenCalled();
  });
});
describe("CRM content and isolation", () => {
  it("labels net income and qualification honestly; escapes HTML and avoids private continuation tokens", () => {
    const content = noteContent(example()); expect(content).toContain("líquida anual"); expect(content).toContain("30.000–60.000"); expect(content).toContain("&lt;script&gt;"); expect(content).not.toContain("#token="); expect(content).toContain("A aguardar fotografias");
  });
  it("renders an escaped HTTP photo link as a clear action awaiting team review", () => {
    const e = example(); e.details.photosLink = 'https://example.com/álbum?view=1&caption=%22casa%22';
    const content = noteContent(e);
    expect(content).toContain('href="https://example.com/%C3%A1lbum?view=1&amp;caption=%22casa%22"');
    expect(content).toContain('>Ver fotografias</a>'); expect(content).toContain("Por rever pela equipa."); expect(content).not.toContain("fotografias aprovadas");
  });
  it.each(["javascript:alert(1)", "Fotos enviadas por telefone", "not a url"])('does not create an anchor from invalid photo link %s', value => {
    const e = example(); e.details.photosLink = value; const content = noteContent(e); expect(content).not.toContain("<a "); expect(content).toContain("A aguardar fotografias");
  });
  it("does not disclose a pasted private continuation link or token in the CRM note", () => {
    const e = example(); e.details.photosLink = "https://www.portugalactive.com/management/complete/?lang=pt#token=synthetic-private-token";
    const content = noteContent(e); expect(content).not.toContain("synthetic-private-token"); expect(content).not.toContain("/management/complete/"); expect(content).not.toContain("<a "); expect(content).toContain("Link pessoal de acompanhamento omitido");
  });
  it("historical photo follow-up preserves original v3 reference without claiming a new checkbox consent", () => {
    const e = example(); e.context = { page_kind: "crm-photo-followup", page_id: "v3:00000000-0000-4000-8000-000000000002" };
    e.privacyNoticeVersion = "owner-crm-photo-followup"; e.originalSourceKey = "v3:00000000-0000-4000-8000-000000000002"; e.originalRequestedAt = new Date("2026-11-01T12:00:00Z");
    const content = noteContent(e); expect(content).toContain("PA-OWNER-v3-00000000-0000-4000-8000-000000000002");
    expect(content).toContain("Pedido existente no CRM; contacto para obter elementos necessários à avaliação"); expect(content).not.toContain("Informação de privacidade aceite"); expect(content).toContain("Sem subscrição de marketing");
    expect(content).toContain("Pedido original recebido em"); expect(content).toContain("2026-11-01T12:00:00.000Z"); expect(content).toContain("Seguimento criado em");
  });
  it("public attribution cannot impersonate an imported enquiry or its original reference", () => {
    const e = example(); e.context = { page_kind: "crm-photo-followup", page_id: "v3:00000000-0000-4000-8000-000000000002" }; e.privacyNoticeVersion = "owner-intake-v4";
    const content = noteContent(e); expect(content).toContain("Informação de privacidade aceite"); expect(content).not.toContain("Pedido existente no CRM"); expect(content).not.toContain("PA-OWNER-v3-00000000-0000-4000-8000-000000000002");
  });
  it("legacy form records do not gain a privacy checkbox claim that was never captured", () => {
    const e = example(); e.source = "v3"; e.details.schemaVersion = "owner-intake-legacy";
    expect(noteContent(e)).toContain("Pedido recebido pelo formulário anterior"); expect(noteContent(e)).not.toContain("Informação de privacidade aceite");
  });
  it("snapshot changes when a photo arrives and file name uses full digest", () => {
    const e = example(); const first = snapshotHash(e); e.details.photosLink = "https://example.com/photo"; expect(snapshotHash(e)).not.toBe(first);
    expect(remoteFilename({ id: "a", name: "private.jpg", size: 1, mimeType: "image/jpeg", digest: "a".repeat(64) })).toBe(`PA-${"a".repeat(64)}.jpg`);
  });
  it("excludes synthetic records and old enquiries except explicit UUID test allowlist", () => {
    const e = example(); expect(automationEligible(e, {})).toBe(false);
    e.email = "owner@synthetic-domain.pt"; expect(automationEligible(e, {})).toBe(true); e.name = "PA-QA-CRM-NÃO-CONTACTAR"; expect(automationEligible(e, {})).toBe(false);
    expect(automationEligible(e, { OWNER_AUTOMATION_TEST_IDS: e.id })).toBe(true); e.capturedAt = new Date("2020-01-01"); expect(automationEligible(e, { OWNER_AUTOMATION_TEST_IDS: e.id })).toBe(false);
    expect(automationEligible(example(), { OWNER_AUTOMATION_FROM: "invalid" })).toBe(false);
  });
  it("disabled, DEV, wrong service and wrong routing cannot obtain a production client", () => {
    const env = { NODE_ENV: "production", RENDER_SERVICE_ID: "srv-d700n5fgi27c73f9bse0", OWNER_CRM_ENABLED: "true", PIPEDRIVE_API_TOKEN: "synthetic-only", PIPEDRIVE_OWNER_ID: "22976488", PIPEDRIVE_STAGE_ID: "1" };
    expect(ownerCrmConfig(env)?.stageId).toBe(1); expect(ownerCrmConfig({ ...env, OWNER_CRM_ENABLED: "false" })).toBeNull(); expect(ownerCrmConfig({ ...env, NODE_ENV: "development" })).toBeNull();
    expect(ownerCrmConfig({ ...env, RENDER_SERVICE_ID: "preview" })).toBeNull(); expect(ownerCrmConfig({ ...env, PIPEDRIVE_STAGE_ID: "99" })).toBeNull();
  });
});
