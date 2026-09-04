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
import { createHmac, timingSafeEqual } from "crypto";
import { sanitizePropertyName } from "@shared/displayName";
import { listRecoveryCandidates, claimRecoveryStage } from "../db";
import { sendCheckoutRecovery } from "./transactional-email";
import { getPropertiesForSite } from "./properties-store";
import type { BookingIntent } from "../../drizzle/schema";

const HOUR_MS = 60 * 60 * 1000;

/* ────────────────────────────────────────────────────────────────
   Bloco 2 — opt-out dos lembretes (link discreto no rodapé).
   Token HMAC simples sobre o id do intent: o link só funciona para
   quem recebeu o email; sem estado extra na DB além do booleano.
   ──────────────────────────────────────────────────────────────── */

function optoutSecret(): string {
  return (
    process.env.RECOVERY_OPTOUT_SECRET ||
    process.env.JWT_SECRET ||
    "pa-recovery-optout-dev"
  );
}

/** Token HMAC-SHA256(intentId) truncado a 32 hex — chega para um opt-out. */
export function recoveryOptoutToken(intentId: string): string {
  return createHmac("sha256", optoutSecret()).update(intentId).digest("hex").slice(0, 32);
}

/** Comparação em tempo constante; qualquer formato inesperado falha. */
export function verifyRecoveryOptoutToken(intentId: string, token: string): boolean {
  if (!intentId || !token || token.length !== 32) return false;
  try {
    return timingSafeEqual(
      Buffer.from(recoveryOptoutToken(intentId), "utf8"),
      Buffer.from(token.toLowerCase(), "utf8"),
    );
  } catch {
    return false;
  }
}

/** Link de opt-out para o rodapé dos emails de recuperação. */
export function recoveryOptoutUrl(intentId: string): string {
  return `${publicBaseUrl()}/api/checkout/recovery-optout?intent=${encodeURIComponent(intentId)}&t=${recoveryOptoutToken(intentId)}`;
}
const STAGE_1_AFTER_MS = 1 * HOUR_MS;
const STAGE_2_AFTER_MS = 20 * HOUR_MS;
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/** Public origin for resume links. SITE_URL first (the env real deploys set);
 *  production fallback — dev sets SITE_URL, production may omit it. */
function publicBaseUrl(): string {
  const fromEnv =
    process.env.SITE_URL || process.env.PUBLIC_BASE_URL || process.env.PUBLIC_URL || process.env.APP_URL;
  const base = fromEnv || "https://www.portugalactive.com";
  return base.replace(/\/+$/, "");
}

function resumeUrl(intent: BookingIntent, stage: 1 | 2): string {
  const locale = intent.locale || "en";
  const utm = `utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_${stage === 1 ? "1h" : "20h"}`;
  return `${publicBaseUrl()}/${locale}/checkout/${intent.id}?${utm}`;
}


/** Mirror of client/src/lib/images.ts optimizeGuestyImage, with a 4:3 crop so
 *  the email card matches the checkout's aspect-[4/3] hero. */
function heroImageUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!raw.includes("assets.guesty.com/image/upload/")) return raw;
  if (/\/image\/upload\/[a-z]{1,3}_/.test(raw)) return raw;
  return raw.replace("/image/upload/", "/image/upload/w_1200,ar_4:3,c_fill,q_auto,f_auto/");
}

/** First photo of the intent's property, by slug or Guesty listing id. Fail-soft. */
async function resolvePropertyPhoto(intent: BookingIntent): Promise<string | undefined> {
  try {
    const props = await getPropertiesForSite();
    const prop = (props as any[]).find(
      (p) =>
        (intent.propertySlug && p.slug === intent.propertySlug) ||
        (p.guestyId || p.listingId) === intent.listingId,
    );
    return heroImageUrl(prop?.images?.[0]);
  } catch {
    return undefined;
  }
}

/**
 * One pass over the abandoned intents. Exported for manual triggering/tests.
 * Never throws — recovery must not take the server down.
 */
export async function runCheckoutRecoverySweep(): Promise<{ sent: number; checked: number }> {
  let sent = 0;
  let checked = 0;
  // Kill switch por tick: respeita CHECKOUT_RECOVERY=false mesmo se o
  // scheduler já tiver arrancado (belt and braces)
  if (process.env.CHECKOUT_RECOVERY === "false") return { sent, checked };
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
      // Belt and braces: a query já filtra, mas o opt-out nunca recebe email
      if ((intent as any).recoveryOptout) continue;

      // Claim before sending — losing an email beats repeating one.
      const claimed = await claimRecoveryStage(intent.id, stage, target);
      if (!claimed) continue;

      try {
        const quote = intent.quote as {
          nightlyRate?: number; nights?: number; totalNights?: number;
          cleaningFee?: number; taxesAndFees?: number; total?: number;
        } | null;
        await sendCheckoutRecovery({
          guestEmail: intent.email,
          guestFirstName: intent.guestFirstName,
          propertyName: sanitizePropertyName(intent.propertyName || ""),
          destination: intent.destination,
          checkIn: intent.checkIn,
          checkOut: intent.checkOut,
          guests: intent.guests,
          total: quote?.total,
          quote,
          imageUrl: await resolvePropertyPhoto(intent),
          expiresAt: intent.expiresAt,
          resumeUrl: resumeUrl(intent, target),
          optoutUrl: recoveryOptoutUrl(intent.id),
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
  // Kill switch: CHECKOUT_RECOVERY=false desliga a automação sem redeploy
  if (process.env.CHECKOUT_RECOVERY === "false") {
    console.info("[Recovery] Desativado (CHECKOUT_RECOVERY=false)");
    return;
  }
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
