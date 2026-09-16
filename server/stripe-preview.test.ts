import { afterEach, describe, expect, it, vi } from "vitest";
const load = vi.hoisted(() => vi.fn().mockResolvedValue({ simulatedStripe: true }));
vi.mock("@stripe/stripe-js/pure", () => ({ loadStripe: load }));
import { loadStripe } from "../client/src/lib/stripeLoader";
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("Stripe script environment boundary", () => {
  it.each(["dev.portugalactive.com", "localhost", "preview.onrender.com"])("never initializes Stripe on %s", async hostname => {
    vi.stubGlobal("window", { location: { hostname } });
    await expect(loadStripe("pk_live_placeholder")).resolves.toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it.each(["www.portugalactive.com", "portugalactive.com"])("preserves the payment loader on %s", async hostname => {
    vi.stubGlobal("window", { location: { hostname } });
    await expect(loadStripe("pk_live_placeholder")).resolves.toEqual({ simulatedStripe: true });
    expect(load).toHaveBeenCalledWith("pk_live_placeholder");
  });
});
