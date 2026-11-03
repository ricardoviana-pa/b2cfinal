import { isOwnerIntakeProduction, ownerEmailConfigured, ownerNotificationMail, sendOwnerNotification } from "./email";
import {
  claimOwnerNotification, markOwnerNotificationFailed, markOwnerNotificationSent,
  notificationState, ownerNotificationFiles, pendingOwnerNotificationIds, saveOwnerIntake, initialiseOwnerIntakeSchema,
} from "./store";
import type { ValidatedOwnerIntake } from "./validation";

/** Public success means the lead and files committed, regardless of email latency. */
export async function acceptOwnerIntake(input: ValidatedOwnerIntake) {
  return saveOwnerIntake(input, ownerNotificationMail(input.fields, input.attachments.map(file => file.name)));
}

export async function deliverOwnerNotification(id: string, now = new Date()) {
  if (!ownerEmailConfigured()) return notificationState(id);
  const item = await claimOwnerNotification(id, now);
  if (!item || !item.notificationLeaseAt) return notificationState(id);
  try {
    const files = await ownerNotificationFiles(id);
    if (files.length !== item.attachmentCount) throw new Error("OWNER_ATTACHMENT_COUNT_MISMATCH");
    const providerId = await sendOwnerNotification(id, item.notificationMail, files);
    await markOwnerNotificationSent(id, item.notificationLeaseAt, providerId);
  } catch {
    // Includes an ambiguous timeout or a failed post-send DB update. A retry uses
    // the SAME frozen message and provider key; never another delivery circuit.
    const delay = Math.min(60, 2 ** Math.min(item.notificationAttempts, 5));
    await markOwnerNotificationFailed(id, item.notificationLeaseAt, new Date(now.getTime() + delay * 60_000));
  }
  return notificationState(id);
}

let sweepRunning = false;
export async function sweepOwnerNotifications() {
  if (sweepRunning || !ownerEmailConfigured()) return;
  sweepRunning = true;
  try {
    const ids = await pendingOwnerNotificationIds(new Date());
    for (const id of ids) await deliverOwnerNotification(id);
  } finally { sweepRunning = false; }
}
let sweepStarted = false;
export function startOwnerNotificationSweep() {
  if (sweepStarted || !isOwnerIntakeProduction()) return;
  sweepStarted = true;
  let initialised = false;
  let ticking = false;
  const tick = () => {
    if (ticking) return;
    ticking = true;
    void (async () => {
      // A transient DB outage during the first deployment must recover without
      // an operator restarting the service. These CREATEs are additive/idempotent.
      if (!initialised) initialised = await initialiseOwnerIntakeSchema();
      if (initialised) await sweepOwnerNotifications();
    })().catch(() => console.warn("[Owner intake] notification sweep unavailable; persisted requests retained"))
      .finally(() => { ticking = false; });
  };
  tick();
  setInterval(tick, 60_000).unref();
}
