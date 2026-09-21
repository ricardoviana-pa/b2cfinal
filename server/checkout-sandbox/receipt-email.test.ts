import "./setup";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { hasReservationAccess } from "../lib/reservation-access";
const fake = vi.hoisted(() => ({ send: vi.fn(async () => ({ error: null })) }));
vi.mock("resend", () => ({ Resend: class { emails = { send: fake.send }; } }));
let email: typeof import("../services/transactional-email");
beforeAll(async () => {
  vi.stubEnv("RESEND_API_KEY", "synthetic-mocked-receipt-email");
  email = await import("../services/transactional-email");
});
beforeEach(() => {
  fake.send.mockClear();
  vi.stubEnv("APP_ENV", "production"); vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RENDER_GIT_BRANCH", "main"); vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  vi.stubEnv("JWT_SECRET", "synthetic-receipt-email-signature-only");
});
afterAll(() => vi.unstubAllEnvs());
describe("requested access email (network disabled)", () => {
  it("uses the official origin and a proof scoped to the reservation", async () => {
    const reservationId = "a".repeat(24);
    await email.sendReservationAccessLink({ email: "guest@receipt.invalid", reservationId, locale: "pt" });
    expect(fake.send).toHaveBeenCalledOnce();
    const [payload, options] = fake.send.mock.calls[0] as any[];
    expect(payload.to).toBe("guest@receipt.invalid");
    expect(payload.replyTo).toBe("booking@portugalactive.com");
    const href = [...payload.html.matchAll(/href="([^"]+)"/g)].map((match: any) => match[1]).find((url: string) => url.includes("/booking/thank-you/"));
    const url = new URL(href);
    expect(url.origin).toBe("https://www.portugalactive.com");
    expect(url.pathname).toBe(`/pt/booking/thank-you/${reservationId}`);
    expect(hasReservationAccess(reservationId, new URLSearchParams(url.hash.slice(1)).get("receipt"))).toBe(true);
    expect(options.idempotencyKey).toMatch(/^receipt-access-/);
  });
  it.each(["preview", "development"])("does not send from %s", async mode => {
    vi.stubEnv("APP_ENV", mode);
    await expect(email.sendReservationAccessLink({ email: "guest@receipt.invalid", reservationId: "a".repeat(24) })).rejects.toThrow();
    expect(fake.send).not.toHaveBeenCalled();
  });
  it("does not send a link without its access proof", async () => {
    vi.stubEnv("JWT_SECRET", "");
    await expect(email.sendReservationAccessLink({ email: "guest@receipt.invalid", reservationId: "a".repeat(24) })).rejects.toThrow();
    expect(fake.send).not.toHaveBeenCalled();
  });
});
