import { isOwnerIntakeProduction } from "../owner-intake/email";
import { acquireCrmLease, crmCandidates, crmDealForV4, crmFileBytes, crmStorageHealth, initialiseOwnerCrmSchema, releaseCrmLease, releaseSyncedEmailBytes, saveCrmResult, sqlLedger } from "./store";
import { PipedriveGateway, type PipedriveConfig } from "./pipedrive";
import { automationEligible, snapshotHash, syncEnquiry } from "./sync";
import { CrmError } from "./types";
export { ownerCrmStatus } from "./store";

export function ownerCrmConfig(env: NodeJS.ProcessEnv = process.env): PipedriveConfig | null {
  if (!isOwnerIntakeProduction(env) || env.OWNER_CRM_ENABLED !== "true" || !env.PIPEDRIVE_API_TOKEN) return null;
  const ownerId = Number(env.PIPEDRIVE_OWNER_ID); const stageId = Number(env.PIPEDRIVE_STAGE_ID);
  if (ownerId !== 22976488 || stageId !== 1) return null;
  return { token: env.PIPEDRIVE_API_TOKEN, ownerId, stageId };
}
/** The reminder scheduler defers on errors; a closed CRM deal cancels the reminder. */
export async function ownerCrmAllowsPhotoReminder(enquiryId: string) {
  const config = ownerCrmConfig();
  if (!config) {
    if (process.env.OWNER_CRM_ENABLED === "true") throw new CrmError("CRM_REMINDER_CONFIG_UNAVAILABLE");
    return true;
  }
  const dealId = await crmDealForV4(enquiryId); if (!dealId) return true;
  return new PipedriveGateway(config).dealAllowsReminder(dealId);
}
export async function ownerCrmHealth() {
  const enabled = process.env.OWNER_CRM_ENABLED === "true";
  const configured = !!ownerCrmConfig();
  if (!configured) return { enabled, configured, storageReady: false, attentionRequired: enabled };
  const storage = await crmStorageHealth();
  return { enabled, configured, ...storage };
}
let running: Promise<void> | null = null;
export function sweepOwnerCrm() {
  const config = ownerCrmConfig(); if (!config) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    const from = new Date(process.env.OWNER_AUTOMATION_FROM || "2026-11-03T00:00:00Z");
    if (!Number.isFinite(+from)) throw new CrmError("INVALID_AUTOMATION_CUTOFF", true);
    await initialiseOwnerCrmSchema();
    const token = await acquireCrmLease(); if (!token) return;
    try {
      const ledger = sqlLedger(token); const gateway = new PipedriveGateway(config);
      for (const source of ["v4", "v3"] as const) {
        for (const e of await crmCandidates(from, source)) {
          await ledger.checkpoint(); const version = snapshotHash(e);
          if (!automationEligible(e)) { await saveCrmResult(token, e, version, "excluded"); continue; }
          try {
            const ids = await syncEnquiry(e, ledger, gateway, file => crmFileBytes(e, file));
            await saveCrmResult(token, e, version, "synced", ids);
            await ledger.checkpoint();
            await releaseSyncedEmailBytes(token, e, ids);
          } catch (error) {
            const failure = error instanceof CrmError ? error : new CrmError("CRM_UNAVAILABLE");
            await saveCrmResult(token, e, version, failure.review ? "review" : "retry", null, failure.code);
            if (failure.code === "LEASE_LOST") throw failure;
          }
        }
      }
    } finally { await releaseCrmLease(token); }
  })().finally(() => { running = null; });
  return running;
}
let started = false;
export function startOwnerCrmSweep() {
  if (started || !ownerCrmConfig()) return;
  started = true;
  const tick = () => { void sweepOwnerCrm().catch(() => console.warn("[Owner CRM] reconciliation deferred; saved enquiries retained")); };
  tick(); setInterval(tick, 60_000).unref();
}
