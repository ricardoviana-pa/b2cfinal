import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  candidates: vi.fn(), claim: vi.fn(), send: vi.fn(), properties: vi.fn(), eligible: vi.fn(),
}));
vi.mock("../db", () => ({ listRecoveryCandidates: mock.candidates, claimRecoveryStage: mock.claim }));
vi.mock("./transactional-email", () => ({ sendCheckoutRecovery: mock.send }));
vi.mock("./properties-store", () => ({ getPropertiesForSite: mock.properties }));
vi.mock('./recovery-eligibility', () => ({ canRemindRecoveryStay: mock.eligible }));
import { recoveryOptoutUrl, runCheckoutRecoverySweep, startCheckoutRecoveryScheduler } from "./checkout-recovery";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CHECKOUT_RECOVERY", "true");
  vi.stubEnv("APP_ENV", "production");
  vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RENDER_GIT_BRANCH", "main");
  mock.claim.mockResolvedValue(true);
  mock.send.mockResolvedValue(undefined);
  mock.properties.mockResolvedValue([]);
  mock.eligible.mockResolvedValue(true);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
const intent = (hours: number) => ({
  id: "12345678-1234-1234-1234-123456789abc", locale: "pt",
  email: "guest@example.test", recoveryStage: 0,
  createdAt: new Date(Date.now() - hours * 3_600_000),
  expiresAt: new Date(Date.now() + 3_600_000), quote: { total: 100 },
});

describe("recovery email environment regression", () => {
  it("DEV cannot read or claim shared intents or send emails", async () => {
    vi.stubEnv("SITE_URL", "https://dev.portugalactive.com");
    vi.stubEnv("RENDER_GIT_BRANCH", "dev");
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 0 });
    expect(mock.candidates).not.toHaveBeenCalled();
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
    vi.useFakeTimers();
    startCheckoutRecoveryScheduler();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([[2, 1, "1h"], [21, 2, "20h"]])("production sends only the owed stage after %s hours", async (hours, stage, suffix) => {
    const row = intent(Number(hours));
    mock.candidates.mockResolvedValue([row]);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 1, checked: 1 });
    expect(mock.claim).toHaveBeenCalledWith(row.id, 0, stage);
    expect(mock.send).toHaveBeenCalledOnce();
    expect(mock.send).toHaveBeenCalledWith(expect.objectContaining({
      stage, resumeUrl: `https://www.portugalactive.com/pt/checkout/${row.id}?utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_${suffix}`,
      optoutUrl: expect.stringMatching(/^https:\/\/www\.portugalactive\.com\/api\/checkout\/recovery-optout\?/),
    }));
  });
  it("does not resend a stage another production worker has claimed", async () => {
    mock.candidates.mockResolvedValue([intent(2)]);
    mock.claim.mockResolvedValue(false);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("opt-out links cannot pick up a DEV domain", () => {
    vi.stubEnv("SITE_URL", "https://dev.portugalactive.com");
    expect(new URL(recoveryOptoutUrl(intent(2).id)).origin).toBe("https://www.portugalactive.com");
  });
  it('does not claim or send an already booked or superseded stay', async () => {
    mock.candidates.mockResolvedValue([intent(2)]);
    mock.eligible.mockResolvedValue(false);
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it('defers without claiming when Guesty cannot verify the stay', async () => {
    mock.candidates.mockResolvedValue([intent(2)]);
    mock.eligible.mockRejectedValue(new Error('timeout'));
    expect(await runCheckoutRecoverySweep()).toEqual({ sent: 0, checked: 1 });
    expect(mock.claim).not.toHaveBeenCalled();
    expect(mock.send).not.toHaveBeenCalled();
  });
});
