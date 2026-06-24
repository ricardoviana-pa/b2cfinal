#!/usr/bin/env tsx
/**
 * One-off probe: does Guesty expose a guest NAME we could attach to reviews?
 *
 *   pnpm tsx scripts/test-guest-name.ts
 *
 * The review payload itself is anonymised (only reviewer_id / guestId). This
 * checks whether the reservation or guest record behind a review returns a
 * first name — if it does, attaching real first names to reviews is viable;
 * if not, we keep the "Verified guest" cards.
 *
 * Prints only field NAMES + whether a name value is present (not the full PII).
 */

import "dotenv/config";
import { guestyClient } from "../server/lib/guesty.ts";

function namey(obj: any): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return { _type: typeof obj };
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (/name|first|last|full/i.test(k)) {
      const v = obj[k];
      out[k] = typeof v === "string" ? (v ? `present (len ${v.length})` : "empty") : v;
    }
  }
  return out;
}

async function main() {
  console.log("Fetching a few reviews to grab real reservation/guest ids…\n");
  const resp: any = await guestyClient.getReviews({ limit: 20, skip: 0 });
  const reviews: any[] = resp?.data ?? resp?.results ?? [];
  console.log(`Got ${reviews.length} reviews.`);

  const sample = reviews.find((r) => r.reservationId || r.guestId) ?? reviews[0];
  if (!sample) {
    console.log("No reviews returned — cannot probe.");
    process.exit(0);
  }

  console.log("Sample review ids:", {
    reservationId: sample.reservationId ?? "(none)",
    guestId: sample.guestId ?? "(none)",
    rawReviewerId: sample.rawReview?.reviewer_id ?? "(none)",
  });

  // ── Probe 1: the reservation behind the review ──
  if (sample.reservationId) {
    console.log("\n── GET /v1/reservations/" + sample.reservationId + " ──");
    try {
      const r: any = await guestyClient.request("GET", `/v1/reservations/${sample.reservationId}`);
      console.log("  top-level name-ish fields:", namey(r));
      console.log("  r.guest name-ish fields  :", namey(r?.guest));
      console.log("  r.guest keys             :", r?.guest ? Object.keys(r.guest).join(",") : "(no guest object)");
    } catch (e: any) {
      console.log("  ERROR:", e?.status ?? "", e?.message ?? e);
    }
  }

  // ── Probe 2: the guest record ──
  if (sample.guestId) {
    console.log("\n── GET /v1/guests/" + sample.guestId + " ──");
    try {
      const g: any = await guestyClient.request("GET", `/v1/guests/${sample.guestId}`);
      console.log("  name-ish fields:", namey(g));
      console.log("  all keys       :", g ? Object.keys(g).join(",") : "(empty)");
    } catch (e: any) {
      console.log("  ERROR:", e?.status ?? "", e?.message ?? e);
    }
  }

  console.log("\nVERDICT: if either probe shows a present firstName/fullName, real");
  console.log("first names on reviews are viable. If both are empty/404, keep");
  console.log("\"Verified guest\".");
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err?.message ?? err);
  process.exit(1);
});
