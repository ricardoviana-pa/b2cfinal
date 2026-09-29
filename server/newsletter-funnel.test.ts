import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { countNewsletterFunnel } from "./db";
import { summariseNewsletterFunnel } from "@shared/newsletter";

const flow = "site-doi-v1";
const rows = [
  { source: "nl-pending-popup", metadata: { flow, origin: "popup", trigger: "timer", device: "mobile", pageKind: "house" } },
  { source: "nl-pending-popup", metadata: { flow, origin: "popup", trigger: "timer", device: "mobile", pageKind: "house" } },
  { source: "newsletter-popup", metadata: { flow, origin: "popup", trigger: "timer", device: "mobile", pageKind: "house", confirmedAt: "x" } },
  // A mail scanner confirmed it: counted, and apart from the double opt-ins.
  { source: "newsletter-popup", metadata: { flow, origin: "popup", trigger: "timer", device: "mobile", pageKind: "house", confirmedAt: "x", confirmSuspect: "1" } },
  { source: "newsletter-house", metadata: { flow, origin: "house", device: "desktop", pageKind: "house", utmSource: "google", interest: "family", confirmedAt: "y" } },
  { source: "nl-unsubscribed-house", metadata: { flow, origin: "house", device: "desktop", pageKind: "house", confirmedAt: "y", unsubscribedAt: "z" } },
  // Nobody clicked in 8 days: the address is gone, the count stays.
  { source: "nl-expired-footer", metadata: { flow, origin: "footer", pageKind: "home", expiredAt: "w" } },
  // Legacy footer rows had no double opt-in: not part of this funnel.
  { source: "newsletter-footer", metadata: {} as Record<string, string> },
  { source: "newsletter-footer", metadata: null },
];

describe("newsletter funnel (admin learning report)", () => {
  it("counts sign-ups of the double opt-in flow by origin and state, with the scanner mark", () => {
    const out = countNewsletterFunnel(rows);
    const pick = (origin: string, state: string, suspect = false) =>
      out.filter((r) => r.origin === origin && r.state === state && r.suspect === suspect).reduce((n, r) => n + r.count, 0);
    expect(pick("popup", "pending")).toBe(2);
    expect(pick("popup", "confirmed")).toBe(1);
    expect(pick("popup", "confirmed", true)).toBe(1);
    expect(pick("house", "left")).toBe(1);
    expect(pick("footer", "expired")).toBe(1);
    expect(out.reduce((n, r) => n + r.count, 0)).toBe(7);
    expect(out[0]).toEqual({ origin: "popup", state: "pending", wasConfirmed: false, suspect: false, trigger: "timer", device: "mobile", pageKind: "house", utmSource: null, interest: null, count: 2 });
    // Counts only: no address can come out of the report.
    expect(JSON.stringify(out)).not.toMatch(/@/);
  });

  it("the admin summary gives sign-ups, confirmations, rate and double opt-ins by any dimension", () => {
    const byOrigin = summariseNewsletterFunnel(countNewsletterFunnel(rows), "origin");
    expect(byOrigin).toEqual([
      { key: "popup", signups: 4, confirmed: 2, doubleOptIn: 1, pending: 2, left: 0, rate: 0.5 },
      { key: "house", signups: 2, confirmed: 2, doubleOptIn: 2, pending: 0, left: 1, rate: 1 },
      { key: "footer", signups: 1, confirmed: 0, doubleOptIn: 0, pending: 0, left: 0, rate: 0 },
    ]);
    const bySource = summariseNewsletterFunnel(countNewsletterFunnel(rows), "utmSource");
    expect(bySource.find((r) => r.key === "google")).toMatchObject({ signups: 1, confirmed: 1 });
    expect(bySource.find((r) => r.key === "(none)")).toMatchObject({ signups: 6 });
  });

  it("the report is on the admin Leads page, and expired rows stay out of the list", () => {
    const page = fs.readFileSync("client/src/pages/admin/Leads.tsx", "utf8");
    expect(page).toContain("trpc.newsletter.stats.useQuery({ days: 30 })");
    expect(page).toContain("summariseNewsletterFunnel(");
    const db = fs.readFileSync("server/db.ts", "utf8");
    expect(db).toContain("else conditions.push(notLike(leads.source, `${EXPIRED_PREFIX}%`));");
  });
});
