import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return {
    ...actual,
    guestyBEClient: {
      isConfigured: vi.fn().mockReturnValue(true),
      request: vi.fn(),
    },
  };
});

import { createBEQuote } from "./guesty-booking";
import { guestyBEClient, GuestyClientError } from "../lib/guesty";

describe("createBEQuote error logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.GUESTY_BE_CLIENT_ID = "abc123xyz";
  });

  it("logs status, credential prefix, listingId, and body on 500 failure", async () => {
    vi.mocked(guestyBEClient.request).mockRejectedValue(
      new GuestyClientError({
        message: "Service unavailable",
        status: 500,
        method: "POST",
        endpoint: "/api/reservations/quotes",
        details: { reason: "overloaded" },
      })
    );

    await expect(
      createBEQuote({ listingId: "listing-123", checkIn: "2026-04-08", checkOut: "2026-04-11", guests: 2 })
    ).rejects.toThrow();

    const errorCall = vi.mocked(console.error).mock.calls.find((args) =>
      String(args[0]).includes("[BE Quote] createBEQuote FAILED")
    );
    expect(errorCall).toBeDefined();
    const msg = String(errorCall![0]);
    expect(msg).toContain("status=500");
    expect(msg).toContain("listingId=listing-123");
    expect(msg).toContain("abc123"); // credential prefix
  });

  it("logs NOT SET when GUESTY_BE_CLIENT_ID is missing", async () => {
    delete process.env.GUESTY_BE_CLIENT_ID;
    vi.mocked(guestyBEClient.request).mockRejectedValue(
      new GuestyClientError({
        message: "Auth failed",
        status: 401,
        method: "POST",
        endpoint: "/api/reservations/quotes",
      })
    );

    await expect(
      createBEQuote({ listingId: "listing-abc", checkIn: "2026-04-08", checkOut: "2026-04-11", guests: 2 })
    ).rejects.toThrow();

    const errorCall = vi.mocked(console.error).mock.calls.find((args) =>
      String(args[0]).includes("[BE Quote] createBEQuote FAILED")
    );
    expect(String(errorCall![0])).toContain("NOT SET");
  });
});
