import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  initialise: vi.fn(), acquire: vi.fn(), release: vi.fn(), candidates: vi.fn(), bytes: vi.fn(), save: vi.fn(),
  cleanup: vi.fn(), checkpoint: vi.fn(), sync: vi.fn(), eligible: vi.fn(), gateway: vi.fn(),
}));
vi.mock("../owner-intake/email", () => ({ isOwnerIntakeProduction: () => true }));
vi.mock("./store", () => ({
  initialiseOwnerCrmSchema: fake.initialise, acquireCrmLease: fake.acquire, releaseCrmLease: fake.release,
  crmCandidates: fake.candidates, crmFileBytes: fake.bytes, saveCrmResult: fake.save, releaseSyncedEmailBytes: fake.cleanup,
  sqlLedger: () => ({ checkpoint: fake.checkpoint }), crmDealForV4: vi.fn(), crmStorageHealth: vi.fn(), ownerCrmStatus: vi.fn(),
}));
vi.mock("./pipedrive", () => ({ PipedriveGateway: fake.gateway }));
vi.mock("./sync", () => ({ automationEligible: fake.eligible, snapshotHash: () => "synthetic-version", syncEnquiry: fake.sync }));
import { sweepOwnerCrm } from "./service";
import { CrmError, type CrmEnquiry } from "./types";

const enquiry = { source: "v4", sourceKey: "v4:synthetic", id: "synthetic" } as CrmEnquiry;
const ids = { personId: 11, dealId: 22, noteId: 33 };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("OWNER_CRM_ENABLED", "true"); vi.stubEnv("PIPEDRIVE_API_TOKEN", "synthetic-only");
  vi.stubEnv("PIPEDRIVE_OWNER_ID", "22976488"); vi.stubEnv("PIPEDRIVE_STAGE_ID", "1");
  vi.stubEnv("OWNER_AUTOMATION_FROM", "2026-11-03T00:00:00Z");
  fake.acquire.mockResolvedValue("synthetic-lease"); fake.eligible.mockReturnValue(true); fake.sync.mockResolvedValue(ids);
  fake.candidates.mockImplementation(async (_from, source) => source === "v4" ? [enquiry] : []);
});
afterEach(() => vi.unstubAllEnvs());

describe("email photo transport-copy retention", () => {
  it("releases imported bytes only after every CRM operation succeeded and the binding was persisted", async () => {
    await sweepOwnerCrm();
    expect(fake.save).toHaveBeenCalledWith("synthetic-lease", enquiry, "synthetic-version", "synced", ids);
    expect(fake.cleanup).toHaveBeenCalledWith("synthetic-lease", enquiry, ids);
    expect(fake.sync.mock.invocationCallOrder[0]).toBeLessThan(fake.save.mock.invocationCallOrder[0]);
    expect(fake.save.mock.invocationCallOrder[0]).toBeLessThan(fake.cleanup.mock.invocationCallOrder[0]);
    expect(fake.release).toHaveBeenCalledWith("synthetic-lease");
  });
  it.each([new CrmError("PIPEDRIVE_HTTP_429", false, true), new CrmError("CREATE_UNCONFIRMED", true)])
    ("retains bytes after incomplete or uncertain CRM work: $code", async error => {
      fake.sync.mockRejectedValue(error); await sweepOwnerCrm();
      expect(fake.cleanup).not.toHaveBeenCalled();
      expect(fake.save).toHaveBeenCalledWith("synthetic-lease", enquiry, "synthetic-version", error.review ? "review" : "retry", null, error.code);
    });
  it("retains bytes if success could not be persisted, and retries cleanup failures without losing the binding", async () => {
    fake.save.mockRejectedValueOnce(new Error("synthetic database write failure")); await sweepOwnerCrm();
    expect(fake.cleanup).not.toHaveBeenCalled();
    fake.save.mockClear(); fake.cleanup.mockRejectedValueOnce(new Error("synthetic temporary cleanup failure"));
    await sweepOwnerCrm();
    expect(fake.save).toHaveBeenNthCalledWith(1, "synthetic-lease", enquiry, "synthetic-version", "synced", ids);
    expect(fake.save).toHaveBeenNthCalledWith(2, "synthetic-lease", enquiry, "synthetic-version", "retry", null, "CRM_UNAVAILABLE");
    await sweepOwnerCrm(); expect(fake.cleanup).toHaveBeenCalledTimes(2);
  });
  it("does not release anything for excluded QA enquiries or without the global lease", async () => {
    fake.eligible.mockReturnValue(false); await sweepOwnerCrm();
    expect(fake.sync).not.toHaveBeenCalled(); expect(fake.cleanup).not.toHaveBeenCalled();
    fake.acquire.mockResolvedValue(null); await sweepOwnerCrm();
    expect(fake.cleanup).not.toHaveBeenCalled();
  });
});
