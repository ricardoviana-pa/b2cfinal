/**
 * CHECKOUT RECOVERY — Fase 4 (docs/checkout_spec.md §12/§16)
 *
 * Two-touch abandonment sequence for booking intents that captured an email
 * but never reached paid:
 *   stage 0 → 1: reminder ~1h after the intent was created
 *   stage 1 → 2: guaranteed-price nudge ~20h in (quote dies at ~23h)
 *
 * Idempotency: `recovery_stage` on the intent is claimed with a conditional
 * UPDATE before any email goes out, so a stage is sent at most once even
 * across concurrent sweeps or server instances. If the server was down past
 * the 20h mark, the guest gets only the 20h email — never both at once.
 *
 * The resume link lands on /:locale/checkout/:intentId, where the existing
 * client already fires the `checkout_resume` analytics event for sessions
 * that did not create the intent (CheckoutPage.tsx).
 */
import { listRecoveryCandidates, claimRecoveryStage } from "../db";
import { sendCheckoutRecovery } from "./transactional-email";
import type { BookingIntent } from "../../drizzle/schema";

const HOUR_MS = 60 * 60 * 1000;
const STAGE_1_AFTER_MS = 1 * HOUR_MS;
const STAGE_2_AFTER_MS = 20 * HOUR_MS;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/** Public origin for resume links. Env first so stg/prod deploys keep working. */
function publicBaseUrl(): string {
  const fromEnv =
    process.env.PUBLIC_BASE_URL || process.env.PUBLIC_URL || process.env.APP_URL;
  const base = fromEnv || "https://dev.portugalactive.com";
  return base.replace(/\/+$/, "");
}

function resumeUrl(intent: BookingIntent, stage: 1 | 2): string {
  const locale = intent.locale || "en";
  const utm = `utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_${stage === 1 ? "1h" : "20h"}`;
  return `${publicBaseUrl()}/${locale}/checkout/${intent.id}?${utm}`;
}

/**
 * One pass over the abandoned intents. Exported for manual triggering/tests.
 * Never throws — recovery must not take the server down.
 */
export async function runCheckoutRecoverySweep(): Promise<{ sent: number; checked: number }> {
  let sent = 0;
  let checked = 0;
  try {
    const candidates = await listRecoveryCandidates();
    checked = candidates.length;
    for (const intent of candidates) {
      const age = Date.now() - intent.createdAt.getTime();
      const stage = intent.recoveryStage ?? 0;

      // Decide the single email owed right now. An intent already past the
      // 20h mark skips straight to the final nudge, whatever its stage.
      let target: 1 | 2 | null = null;
      if (age >= STAGE_2_AFTER_MS && stage < 2) target = 2;
      else if (age >= STAGE_1_AFTER_MS && stage < 1) target = 1;
      if (!target || !intent.email) continue;

      // Claim before sending — losing an email beats repeating one.
      const claimed = await claimRecoveryStage(intent.id, stage, target);
      if (!claimed) continue;

      try {
        await sendCheckoutRecovery({
          guestEmail: intent.email,
          guestFirstName: intent.guestFirstName,
          propertyName: intent.propertyName,
          destination: intent.destination,
          checkIn: intent.checkIn,
          checkOut: intent.checkOut,
          guests: intent.guests,
          total: (intent.quote as { total?: number } | null)?.total,
          resumeUrl: resumeUrl(intent, target),
          locale: intent.locale,
          stage: target,
        });
        sent++;
        console.info(
          `[Recovery] Sent ${target === 1 ? "1h" : "20h"} email for intent ${intent.id} (${intent.email})`,
        );
      } catch (err: any) {
        console.error(`[Recovery] Send failed for intent ${intent.id}:`, err?.message ?? err);
      }
    }
  } catch (err: any) {
    console.warn("[Recovery] Sweep failed:", err?.message ?? err);
  }
  return { sent, checked };
}

let started = false;

/** 10-minute interval sweep, started once at boot. Fail-soft if the DB is down. */
export function startCheckoutRecoveryScheduler(): void {
  if (started) return;
  started = true;
  const timer = setInterval(() => {
    void runCheckoutRecoverySweep();
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
  // First pass shortly after boot so a restart doesn't delay overdue emails
  setTimeout(() => void runCheckoutRecoverySweep(), 30 * 1000).unref?.();
  console.info("[Recovery] Checkout abandonment sweep scheduled every 10 min (1h and 20h emails)");
}
