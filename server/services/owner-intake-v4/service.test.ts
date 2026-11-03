import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ configured: vi.fn(), claim: vi.fn(), files: vi.fn(), sent: vi.fn(), failed: vi.fn(), pending: vi.fn(), init: vi.fn(), send: vi.fn() }));
vi.mock("../owner-intake/email", () => ({ ownerEmailConfigured: fake.configured, isOwnerIntakeProduction: () => true }));
vi.mock("./store", () => ({ claimV4: fake.claim, v4MailFiles: fake.files, sentV4: fake.sent, failedV4: fake.failed, pendingV4: fake.pending, initialiseV4Schema: fake.init }));
vi.mock("./email", async importOriginal => ({ ...await importOriginal<any>(), sendV4Mail: fake.send }));
import { deliverV4, runBoundedDeliveries, sweepV4 } from "./service";
import { V4DeliveryError } from "./email";
const lease = new Date("2099-01-01T00:00:00Z");
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(lease);
  for (const mock of Object.values(fake)) mock.mockReset();
  fake.configured.mockReturnValue(true); fake.files.mockResolvedValue([]); fake.sent.mockResolvedValue(undefined); fake.failed.mockResolvedValue(undefined);
  fake.send.mockResolvedValue("synthetic-provider"); fake.pending.mockResolvedValue([]);
  fake.claim.mockResolvedValue({ id: "synthetic", enquiryId: "synthetic", attempts: 1, leaseAt: lease, payload: { mail: { html: "frozen" }, fileIds: [] } });
});
afterEach(() => { vi.useRealTimers(); });
async function finish<T>(promise: Promise<T>) { await vi.runAllTimersAsync(); return promise; }
describe("v4 bounded durable delivery", () => {
  it("bounds both delivery concurrency and the total file bytes in memory", async () => {
    const pending = [10, 10, 0, 5, 0].map((attachmentBytes, id) => ({ id, attachmentBytes }));
    let active = 0, bytes = 0, maxActive = 0, maxBytes = 0; const visited: number[] = [];
    const promise = runBoundedDeliveries(pending, async item => {
      active++; bytes += item.attachmentBytes; maxActive = Math.max(maxActive, active); maxBytes = Math.max(maxBytes, bytes);
      await new Promise(resolve => setTimeout(resolve, 10)); visited.push(item.id); active--; bytes -= item.attachmentBytes;
    }, 2, 15);
    await finish(promise); expect(maxActive).toBe(2); expect(maxBytes).toBeLessThanOrEqual(15); expect(visited.sort()).toEqual([0, 1, 2, 3, 4]);
  });
  it("waits for in-flight work even if another worker fails, preserving the concurrency bound", async () => {
    let completed = false;
    const promise = runBoundedDeliveries([{ attachmentBytes: 0, fail: true }, { attachmentBytes: 0, fail: false }], async item => {
      if (item.fail) throw new Error("synthetic failure");
      await new Promise(resolve => setTimeout(resolve, 50)); completed = true;
    });
    const assertion = expect(promise).rejects.toThrow("synthetic failure"); await finish(assertion); expect(completed).toBe(true);
  });
  it("does not send unless a lease was claimed and records the provider acceptance", async () => {
    await finish(deliverV4("synthetic")); expect(fake.send).toHaveBeenCalledWith("synthetic", { html: "frozen" }, []);
    expect(fake.sent).toHaveBeenCalledTimes(1); fake.claim.mockResolvedValue(null);
    await finish(deliverV4("synthetic")); expect(fake.send).toHaveBeenCalledTimes(1);
  });
  it("persists Retry-After and retains the same frozen retry after an ambiguous provider response", async () => {
    fake.send.mockRejectedValue(new V4DeliveryError("PROVIDER_RATE_LIMITED", 600, false, true));
    await finish(deliverV4("synthetic"));
    expect(fake.failed).toHaveBeenCalledWith(expect.anything(), "PROVIDER_RATE_LIMITED", expect.any(Date), false, true);
    const retry = fake.failed.mock.calls[0][2] as Date; expect(retry.getTime() - Date.now()).toBeGreaterThanOrEqual(600_000);
    expect(fake.sent).not.toHaveBeenCalled();
  });
  it("a DB failure after acceptance retries the identical message/key instead of another circuit", async () => {
    fake.sent.mockRejectedValueOnce(new Error("synthetic post-send failure"));
    await finish(deliverV4("synthetic")); await finish(deliverV4("synthetic"));
    expect(fake.send.mock.calls[0]).toEqual(fake.send.mock.calls[1]); expect(fake.failed).toHaveBeenCalledTimes(1);
  });
  it("two sweep triggers share one worker pool and recover queued work", async () => {
    fake.pending.mockResolvedValueOnce([{ id: "synthetic", attachmentBytes: 0 }]).mockResolvedValue([]);
    const first = sweepV4(), second = sweepV4(); expect(first).toBe(second);
    await finish(first); expect(fake.send).toHaveBeenCalledTimes(1);
  });
});
