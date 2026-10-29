/**
 * booking.partnerCalendar / partnerQuote enquanto o job ainda não leu a casa
 * (revisão do PR #173, P173-R2): o calendário vinha [] e o painel desenhava
 * todas as datas livres. Agora vem null ("ainda não se sabe"), com cache
 * curta na edge, e o preço aparece assim que o job lê a casa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UID = "3bac86ea-0000-4000-8000-000000000001";
vi.mock("../db", () => ({ getSettingsByKeys: async () => new Map(), upsertSetting: async () => {} }));
vi.mock("../services/properties-store", () => ({
  getPropertiesForSite: async () => [{ source: "tripwix", isActive: true, supplierUid: UID, name: "Casa de Caiz", minNights: 2, maxGuests: 8 }],
}));

const T0 = Date.parse("2026-10-29T00:30:00Z");
const ymd = (days: number) => new Date(T0 + days * 86_400_000).toISOString().slice(0, 10);
const headers = new Map<string, string>();
const caller = async () => {
  const { bookingRouter } = await import("./booking");
  return bookingRouter.createCaller({ req: { headers: {} }, res: { setHeader: (k: string, v: string) => headers.set(k, v) }, user: null } as any);
};

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(T0));
  vi.stubEnv("TRIPWIX_API_KEY", "test-only");
  headers.clear();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("partner calendar before the job has read the home", () => {
  it("answers null (not every date free) with a short edge cache, then the real days once the job reads it", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(
      Array.from({ length: 366 }, (_, i) => ({ date: ymd(i), status: i < 120 ? "unavailable" : "available", price: "1950.00" })),
    ), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const c = await caller();

    expect(await c.partnerCalendar({ tripwixUid: UID, startDate: ymd(0), endDate: ymd(30) })).toBeNull();
    expect(headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60");
    expect(await c.partnerQuote({ tripwixUid: UID, checkIn: ymd(150), checkOut: ymd(155) })).toBeNull();
    expect(headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60");
    expect(fetcher).not.toHaveBeenCalled(); // o pedido do hóspede nunca lê a Tripwix

    const { refreshTripwixCalendar } = await import("../services/tripwix-calendar");
    expect(await refreshTripwixCalendar(UID)).toMatchObject({ action: "refreshed" });

    const days = await c.partnerCalendar({ tripwixUid: UID, startDate: ymd(0), endDate: ymd(30) });
    expect(days).toHaveLength(31);
    expect(days!.every((d) => d.status === "unavailable")).toBe(true); // fechada até fevereiro: nada livre
    expect(headers.get("Cache-Control")).toContain("s-maxage=900");
    expect(await c.partnerQuote({ tripwixUid: UID, checkIn: ymd(150), checkOut: ymd(155) })).toMatchObject({ available: true, nights: 5 });
    expect(headers.get("Cache-Control")).toContain("s-maxage=900");
  });

  it("a uid that is not a published partner home still answers []", async () => {
    const c = await caller();
    expect(await c.partnerCalendar({ tripwixUid: "3bac86ea-0000-4000-8000-0000000000ff", startDate: ymd(0), endDate: ymd(30) })).toEqual([]);
  });
});
