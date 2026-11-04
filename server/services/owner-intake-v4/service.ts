import { ownerEmailConfigured, isOwnerIntakeProduction } from "../owner-intake/email";
import { OWNER_TOTAL_FILE_LIMIT } from "../../../shared/owner-intake";
import { claimV4, failedV4, initialiseV4Schema, pendingV4, sentV4, v4MailFiles, queueV4PhotoReminders, prepareV4ReminderDelivery } from "./store";
import { sendV4Mail, V4DeliveryError } from "./email";
import { ownerCrmAllowsPhotoReminder } from "../owner-crm/service";

/** Two lightweight deliveries may overlap; their total attachment bytes stay bounded. */
export async function runBoundedDeliveries<T extends { attachmentBytes: number }>(items: T[], deliver: (item: T) => Promise<void>, concurrency = 2, byteLimit = OWNER_TOTAL_FILE_LIMIT) {
  const waiting = [...items]; const active = new Set<Promise<void>>(); let bytes = 0; let failure: unknown;
  while (waiting.length || active.size) {
    while (active.size < concurrency) {
      const index = waiting.findIndex(item => item.attachmentBytes >= 0 && item.attachmentBytes <= byteLimit - bytes);
      if (index < 0) break;
      const [item] = waiting.splice(index, 1); bytes += item.attachmentBytes;
      let job: Promise<void>;
      job = Promise.resolve().then(() => deliver(item)).catch(error => { failure ||= error; })
        .finally(() => { bytes -= item.attachmentBytes; active.delete(job); });
      active.add(job);
    }
    if (!active.size) throw new Error("INVALID_OUTBOX_WEIGHT");
    await Promise.race(active);
  }
  if (failure) throw failure;
}
let nextProviderSlot = 0;
async function providerPace() {
  // Conservative local pacing leaves room for other application emails. Account-wide
  // quotas still apply; Retry-After is respected by the durable retry schedule.
  const now = Date.now(); const slot = Math.max(now, nextProviderSlot); nextProviderSlot = slot + 500;
  if (slot > now) await new Promise(resolve => setTimeout(resolve, slot - now));
}
export async function deliverV4(id: string) {
  if (!ownerEmailConfigured()) return;
  const item = await claimV4(id);
  if (!item?.leaseAt) return;
  try {
    const files = await v4MailFiles(item);
    await providerPace();
    if (item.kind === "photo_reminder") {
      let crmAllows: boolean;
      try { crmAllows = await ownerCrmAllowsPhotoReminder(item.enquiryId); }
      catch { throw new V4DeliveryError("CRM_REMINDER_STATUS_UNAVAILABLE", 900, false, true); }
      if (!await prepareV4ReminderDelivery(item, new Date(), crmAllows)) return;
    }
    const providerId = await sendV4Mail(item.id, item.payload.mail, files);
    await sentV4(item, providerId);
  } catch (error) {
    const provider = error instanceof V4DeliveryError ? error : null;
    const seconds = Math.max(provider?.retryAfterSeconds || 0, Math.min(3600, 60 * 2 ** Math.min(item.attempts, 6)));
    await failedV4(item, provider?.code || "PROVIDER_UNCONFIRMED", new Date(Date.now() + seconds * 1000), provider?.permanent || false, provider?.confirmedRejected || false);
  }
}
let running: Promise<void> | null = null;
let requested = false;
export function sweepV4() {
  if (!ownerEmailConfigured()) return Promise.resolve();
  if (running) { requested = true; return running; }
  running = (async () => {
    // An optional reminder must never block the original enquiry notifications.
    try { await queueV4PhotoReminders(); }
    catch { console.warn("[Owner intake v4] photo reminders deferred; original notifications continue"); }
    for (let round = 0; round < 5; round++) {
      requested = false;
      const items = await pendingV4();
      if (items.length) await runBoundedDeliveries(items, item => deliverV4(item.id));
      if (items.length < 40 && !requested) break;
    }
  })().finally(() => { running = null; if (requested) kickV4(); });
  return running;
}
export function kickV4() {
  if (!isOwnerIntakeProduction()) return;
  setImmediate(() => { void sweepV4().catch(() => console.warn("[Owner intake v4] delivery deferred; persisted requests retained")); });
}
let started = false;
export function startV4Sweep() {
  if (started || !isOwnerIntakeProduction()) return;
  started = true; let ready = false; let ticking = false;
  const tick = () => {
    if (ticking) return; ticking = true;
    void (async () => {
      if (!ready) ready = await initialiseV4Schema();
      if (ready) await sweepV4();
    })().catch(() => console.warn("[Owner intake v4] queue unavailable; persisted requests retained")).finally(() => { ticking = false; });
  };
  tick(); setInterval(tick, 15_000).unref();
}
