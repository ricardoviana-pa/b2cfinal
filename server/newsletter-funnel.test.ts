import { describe, expect, it } from "vitest";
import { countNewsletterFunnel } from "./db";

describe("newsletter funnel (admin learning report)", () => {
  it("counts sign-ups of the double opt-in flow by source, trigger, device, page, campaign source and interest", () => {
    const flow = "site-doi-v1";
    const rows = [
      { source: "nl-pending-popup", metadata: { flow, trigger: "timer", device: "mobile", pageKind: "house" } },
      { source: "nl-pending-popup", metadata: { flow, trigger: "timer", device: "mobile", pageKind: "house" } },
      { source: "newsletter-popup", metadata: { flow, trigger: "timer", device: "mobile", pageKind: "house", confirmedAt: "x" } },
      { source: "newsletter-house", metadata: { flow, device: "desktop", pageKind: "house", utmSource: "google", interest: "family" } },
      // Legacy footer rows had no double opt-in: not part of this funnel.
      { source: "newsletter-footer", metadata: {} as Record<string, string> },
      { source: "newsletter-footer", metadata: null },
    ];
    const out = countNewsletterFunnel(rows);
    expect(out).toEqual([
      { source: "nl-pending-popup", trigger: "timer", device: "mobile", pageKind: "house", utmSource: null, interest: null, count: 2 },
      { source: "newsletter-popup", trigger: "timer", device: "mobile", pageKind: "house", utmSource: null, interest: null, count: 1 },
      { source: "newsletter-house", trigger: null, device: "desktop", pageKind: "house", utmSource: "google", interest: "family", count: 1 },
    ]);
    // Counts only: no address can come out of the report.
    expect(JSON.stringify(out)).not.toMatch(/@/);
  });
});
