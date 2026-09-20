import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ summary: vi.fn(), openApi: vi.fn(), send: vi.fn() }));
vi.mock("../lib/guesty", () => ({
  guestyClient: { getReservation: fake.summary, request: fake.openApi },
  GuestyClientError: class extends Error { constructor(public status: number) { super("Synthetic provider failure"); } },
}));
vi.mock("./transactional-email", () => ({ sendReservationAccessLink: fake.send }));
import { GuestyClientError } from "../lib/guesty";
import { readReservationForReceipt, requestReservationAccess } from "./reservation-access";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("RENDER_GIT_BRANCH", "main");
  vi.stubEnv("APP_ENV", "production"); vi.stubEnv("SITE_URL", "https://www.portugalactive.com");
  fake.summary.mockResolvedValue({ guest: { email: "Guest@receipt.invalid" } });
  fake.send.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
describe("customer-requested receipt access", () => {
  it("sends only to the address returned by the reservation provider, once per interval", async () => {
    await Promise.all([1, 2].map(() => requestReservationAccess("a".repeat(24), "guest@receipt.invalid", "pt")));
    expect(fake.send).toHaveBeenCalledOnce();
    expect(fake.send).toHaveBeenCalledWith({ email: "Guest@receipt.invalid", reservationId: "a".repeat(24), locale: "pt" });
  });
  it("does not send to a different address or when provider data is missing", async () => {
    await requestReservationAccess("b".repeat(24), "other@receipt.invalid", "en");
    fake.summary.mockResolvedValue({});
    await requestReservationAccess("b".repeat(24), "guest@receipt.invalid", "en");
    expect(fake.send).not.toHaveBeenCalled();
  });
  it("never sends from DEV, even with a copied production URL", async () => {
    vi.stubEnv("APP_ENV", "preview");
    await requestReservationAccess("c".repeat(24), "guest@receipt.invalid", "en");
    expect(fake.summary).not.toHaveBeenCalled(); expect(fake.send).not.toHaveBeenCalled();
  });
  it("rejects malformed identifiers before looking up a reservation", async () => {
    await requestReservationAccess("../../unexpected", "guest@receipt.invalid", "en");
    expect(fake.summary).not.toHaveBeenCalled();
  });
  it("retries a failed send and does not claim that email was delivered", async () => {
    fake.send.mockRejectedValueOnce(new Error("Synthetic send failure"));
    await expect(requestReservationAccess("d".repeat(24), "guest@receipt.invalid", "en")).rejects.toThrow();
    await requestReservationAccess("d".repeat(24), "guest@receipt.invalid", "en");
    expect(fake.send).toHaveBeenCalledTimes(2);
  });
  it("can read an Open API booking absent from the Booking Engine summary", async () => {
    fake.summary.mockRejectedValue(new (GuestyClientError as any)(404));
    fake.openApi.mockResolvedValue({ _id: "e".repeat(24) });
    expect(await readReservationForReceipt("e".repeat(24))).toEqual({ _id: "e".repeat(24) });
    expect(fake.openApi).toHaveBeenCalledWith("GET", `/v1/reservations/${"e".repeat(24)}`, expect.any(Object));
  });
  it("does not multiply provider requests during a rate limit", async () => {
    fake.summary.mockRejectedValue(new (GuestyClientError as any)(429));
    await expect(readReservationForReceipt("f".repeat(24))).rejects.toThrow();
    expect(fake.openApi).not.toHaveBeenCalled();
  });
});
