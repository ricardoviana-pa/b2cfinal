import type { V4Record } from "./types";
import { isOwnerIntakeProduction } from "../owner-intake/email";

export const PHOTO_REMINDER_DELAY_MS = 48 * 3600_000;
export const PHOTO_REMINDER_QUIET_MS = 24 * 3600_000;
export const PHOTO_REMINDER_KIND = "photo_reminder";
export const PHOTO_REMINDER_FROM = "2026-11-03T00:00:00Z";
export function photoRemindersEnabled(env: NodeJS.ProcessEnv = process.env) {
  return isOwnerIntakeProduction(env) && env.OWNER_PHOTO_REMINDERS_ENABLED === "true";
}
export function reminderFrom(env: NodeJS.ProcessEnv = process.env) {
  const requested = Date.parse(env.OWNER_AUTOMATION_FROM || PHOTO_REMINDER_FROM);
  // Invalid configuration fails closed; never sweep a whole historic database.
  return new Date(Number.isFinite(requested) ? requested : 8640000000000000);
}
export function reminderIsTest(record: V4Record) {
  return /PA[-_ ]?QA|N[ÃA]O[-_ ]?CONTACTAR|E2E[-_ ]?TEST|\bsynthetic\b|\bsint[eé]tic[oa]\b/i.test(record.contact.name)
    || /@(?:example\.(?:invalid|test|com|org|net)|test\.invalid)$/i.test(record.contact.email);
}
export function reminderEligible(record: V4Record, files: { mimeType: string }[], now: Date, env: NodeJS.ProcessEnv = process.env) {
  const testAllowed = (env.OWNER_AUTOMATION_TEST_IDS || "").split(",").map(s => s.trim()).includes(record.id);
  return (testAllowed || !reminderIsTest(record))
    && record.capturedAt >= reminderFrom(env)
    && record.capturedAt.getTime() <= now.getTime() - PHOTO_REMINDER_DELAY_MS
    && record.updatedAt.getTime() <= now.getTime() - PHOTO_REMINDER_QUIET_MS
    && record.tokenExpiresAt > new Date(now.getTime() + 3600_000)
    && ["awaiting_details", "awaiting_photos"].includes(record.status)
    && !record.details?.photosLink?.trim()
    && !files.some(file => file.mimeType.startsWith("image/"));
}
export function reminderWelcomeReady(welcome: { status: string; firstAttemptAt: Date | null; acceptedAt?: string } | undefined, now: Date) {
  const acceptedAt = welcome?.acceptedAt ? new Date(welcome.acceptedAt) : welcome?.firstAttemptAt;
  return welcome?.status === "sent" && !!acceptedAt
    && acceptedAt.getTime() <= now.getTime() - PHOTO_REMINDER_QUIET_MS;
}
