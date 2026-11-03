import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ save: vi.fn(), claim: vi.fn(), sent: vi.fn(), failed: vi.fn(), files: vi.fn(), state: vi.fn(), pending: vi.fn(), configured: vi.fn(), send: vi.fn(), init: vi.fn() }));
vi.mock("./store", () => ({ saveOwnerIntake: fake.save, claimOwnerNotification: fake.claim, markOwnerNotificationSent: fake.sent,
  markOwnerNotificationFailed: fake.failed, ownerNotificationFiles: fake.files, notificationState: fake.state,
  pendingOwnerNotificationIds: fake.pending, initialiseOwnerIntakeSchema: fake.init }));
vi.mock("./email", () => ({ ownerEmailConfigured: fake.configured, sendOwnerNotification: fake.send,
  isOwnerIntakeProduction: () => true, ownerNotificationMail: () => ({ html: "synthetic frozen message" }) }));
import { acceptOwnerIntake, deliverOwnerNotification, sweepOwnerNotifications } from "./service";
import { validateOwnerIntake } from "./validation";
import { syntheticOwner } from "./__tests__/fixtures";
const now = new Date("2099-01-01T00:00:00Z");
const frozenMail = { html: "synthetic original message" };
beforeEach(() => {
  for (const mock of Object.values(fake)) mock.mockReset();
  fake.configured.mockReturnValue(true); fake.files.mockResolvedValue([]); fake.state.mockResolvedValue("sent");
  fake.send.mockResolvedValue("synthetic-provider-id"); fake.sent.mockResolvedValue(undefined); fake.failed.mockResolvedValue(undefined);
  fake.claim.mockResolvedValue({ notificationLeaseAt: now, notificationAttempts: 1, notificationMail: frozenMail, attachmentCount: 0 });
});
afterEach(() => vi.restoreAllMocks());
describe("commit then durable delivery", () => {
  it("acceptance does not send email and does not hide persistence failure", async () => {
    fake.save.mockRejectedValue(new Error("synthetic persistence failure"));
    await expect(acceptOwnerIntake(validateOwnerIntake(syntheticOwner()))).rejects.toThrow("persistence failure");
    expect(fake.send).not.toHaveBeenCalled();
  });
  it("only a claimed request sends the frozen message and records the provider ID", async () => {
    await deliverOwnerNotification(syntheticOwner().requestId, now);
    expect(fake.send).toHaveBeenCalledWith(syntheticOwner().requestId, frozenMail, []);
    expect(fake.sent).toHaveBeenCalledWith(syntheticOwner().requestId, now, "synthetic-provider-id");
    fake.claim.mockResolvedValue(null);
    await deliverOwnerNotification(syntheticOwner().requestId, now);
    expect(fake.send).toHaveBeenCalledTimes(1);
  });
  it("provider timeout retains a retriable outbox record without another circuit", async () => {
    fake.send.mockRejectedValue(new Error("synthetic timeout")); fake.state.mockResolvedValue("failed");
    expect(await deliverOwnerNotification(syntheticOwner().requestId, now)).toBe("failed");
    expect(fake.sent).not.toHaveBeenCalled();
    expect(fake.failed).toHaveBeenCalledWith(syntheticOwner().requestId, now, new Date(now.getTime() + 120_000));
  });
  it("a DB failure after provider acceptance retains exactly the same replay key/message", async () => {
    fake.sent.mockRejectedValueOnce(new Error("synthetic post-send DB failure"));
    await deliverOwnerNotification(syntheticOwner().requestId, now);
    await deliverOwnerNotification(syntheticOwner().requestId, now);
    expect(fake.send.mock.calls[0]).toEqual(fake.send.mock.calls[1]);
    expect(fake.failed).toHaveBeenCalledTimes(1);
  });
  it("unconfigured delivery neither claims records nor sends", async () => {
    fake.configured.mockReturnValue(false);
    await deliverOwnerNotification(syntheticOwner().requestId, now);
    expect(fake.claim).not.toHaveBeenCalled(); expect(fake.send).not.toHaveBeenCalled();
  });
  it("the sweep resumes persisted pending work after a process restart", async () => {
    fake.pending.mockResolvedValue([syntheticOwner().requestId]);
    await sweepOwnerNotifications();
    expect(fake.claim).toHaveBeenCalledWith(syntheticOwner().requestId, expect.any(Date));
    expect(fake.send).toHaveBeenCalledTimes(1);
  });
  it("does not send a partial attachment set", async () => {
    fake.claim.mockResolvedValue({ notificationLeaseAt: now, notificationAttempts: 1, notificationMail: frozenMail, attachmentCount: 2 });
    await deliverOwnerNotification(syntheticOwner().requestId, now);
    expect(fake.send).not.toHaveBeenCalled(); expect(fake.failed).toHaveBeenCalledTimes(1);
  });
  it("serialises immediate/background sweeps so attachment-heavy emails do not accumulate", async () => {
    let release!: (ids: string[]) => void;
    fake.pending.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const first = sweepOwnerNotifications();
    await sweepOwnerNotifications();
    expect(fake.pending).toHaveBeenCalledTimes(1);
    release([syntheticOwner().requestId]); await first;
    expect(fake.send).toHaveBeenCalledTimes(1);
  });
});
