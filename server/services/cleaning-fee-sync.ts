/**
 * Cleaning-fee sync between listing.prices.cleaningFee (OTA-facing) and
 * each rate plan's money.fareCleaning (Booking Engine — drives our website).
 *
 * Why this exists:
 *   Guesty stores the cleaning fee in TWO independent fields:
 *     1. listing.prices.cleaningFee → distributed to Airbnb / Booking.com
 *     2. ratePlan.money.fareCleaning → used by the Booking Engine /quotes
 *        endpoint (which our /api/listings/:id/quote sits on top of)
 *   Changing (1) does NOT propagate to (2). Result: website price diverges
 *   from OTAs for any property whose rate plan has an override.
 *
 * Source of truth: the listing field (1). All rate plans for a listing are
 * forced to match the listing's cleaningFee.
 *
 * Safety:
 *   - audit() is read-only — always safe.
 *   - apply({ dryRun: true }) (default) logs intended PUTs without executing.
 *   - apply({ dryRun: false }) executes PUT against Guesty Open API.
 *   - Errors per rate plan are caught — one failure doesn't abort the batch.
 *   - Tolerance of ±0.01 to avoid float-rounding false positives.
 */

import { guestyClient } from "../lib/guesty.ts";

/** Endpoint path candidates for updating a rate plan (Guesty doesn't document
 *  Open API rate plan writes consistently — we try the canonical REST path
 *  first, fall back to the listing-scoped path if the first 404s). */
const UPDATE_ENDPOINTS = (listingId: string, ratePlanId: string) => [
  `/v1/rate-plans/${ratePlanId}`,
  `/v1/listings/${listingId}/ratePlans/${ratePlanId}`,
];

export interface RatePlanDriftEntry {
  listingId: string;
  listingTitle: string;
  listingCleaningFee: number;
  ratePlanId: string;
  ratePlanName: string;
  ratePlanCleaningFee: number;
  driftAmount: number;
  inSync: boolean;
}

export interface AuditResult {
  scannedListings: number;
  scannedRatePlans: number;
  outOfSync: RatePlanDriftEntry[];
  inSync: RatePlanDriftEntry[];
  errors: Array<{ listingId: string; error: string }>;
}

export interface ApplyResult extends AuditResult {
  attempted: number;
  succeeded: number;
  failed: Array<{ entry: RatePlanDriftEntry; error: string }>;
  dryRun: boolean;
}

const TOLERANCE = 0.01;

/** Pull a numeric cleaningFee out of various shapes Guesty returns. */
function readRatePlanCleaningFee(rp: any): number {
  const money = rp?.money ?? rp?.ratePlan?.money ?? {};
  const v =
    money.fareCleaning ??
    money.cleaningFee ??
    money.cleaning ??
    rp?.cleaningFee ??
    0;
  return Number(v) || 0;
}

function readRatePlanId(rp: any): string {
  return rp?._id ?? rp?.id ?? rp?.ratePlanId ?? rp?.ratePlan?._id ?? "";
}

function readRatePlanName(rp: any): string {
  return rp?.name ?? rp?.ratePlan?.name ?? "(unnamed)";
}

/** Page through all active+listed listings, returning the minimum fields we
 *  need (id, title, prices.cleaningFee). */
async function listAllListings(): Promise<Array<{ id: string; title: string; cleaningFee: number }>> {
  const pageSize = 100;
  const out: Array<{ id: string; title: string; cleaningFee: number }> = [];
  let skip = 0;
  let total = Infinity;

  while (skip < total) {
    const res: any = await guestyClient.getListings({
      limit: pageSize,
      skip,
      active: true,
      listed: true,
      fields: "title prices.cleaningFee",
    });
    const items: any[] = res?.results ?? res?.data ?? res?.items ?? [];
    if (skip === 0) {
      total = Number(res?.count ?? res?.total ?? items.length) || items.length;
    }
    for (const it of items) {
      out.push({
        id: String(it._id ?? it.id ?? ""),
        title: String(it.title ?? "(untitled)"),
        cleaningFee: Number(it?.prices?.cleaningFee ?? 0) || 0,
      });
    }
    if (items.length < pageSize) break;
    skip += pageSize;
  }
  return out;
}

/** Audit drift across all listings. Read-only. */
export async function auditCleaningFeeDrift(): Promise<AuditResult> {
  const listings = await listAllListings();
  const result: AuditResult = {
    scannedListings: listings.length,
    scannedRatePlans: 0,
    outOfSync: [],
    inSync: [],
    errors: [],
  };

  for (const listing of listings) {
    try {
      const ratePlansRes: any = await guestyClient.getListingRatePlans(listing.id);
      const ratePlans: any[] =
        ratePlansRes?.results ?? ratePlansRes?.data ?? ratePlansRes?.ratePlans ?? ratePlansRes ?? [];
      for (const rp of ratePlans) {
        result.scannedRatePlans += 1;
        const rpId = readRatePlanId(rp);
        const rpName = readRatePlanName(rp);
        const rpFee = readRatePlanCleaningFee(rp);
        const drift = rpFee - listing.cleaningFee;
        const entry: RatePlanDriftEntry = {
          listingId: listing.id,
          listingTitle: listing.title,
          listingCleaningFee: listing.cleaningFee,
          ratePlanId: rpId,
          ratePlanName: rpName,
          ratePlanCleaningFee: rpFee,
          driftAmount: Math.round(drift * 100) / 100,
          inSync: Math.abs(drift) < TOLERANCE,
        };
        if (entry.inSync) result.inSync.push(entry);
        else result.outOfSync.push(entry);
      }
    } catch (error: any) {
      result.errors.push({
        listingId: listing.id,
        error: String(error?.message ?? error),
      });
    }
  }

  return result;
}

/** Update one rate plan's cleaning fee. Tries both endpoint shapes Guesty
 *  uses across plans; returns the URL that worked. Throws on failure. */
async function updateRatePlanCleaningFee(
  listingId: string,
  ratePlanId: string,
  newFee: number,
): Promise<string> {
  const body = { money: { fareCleaning: newFee } };
  const candidates = UPDATE_ENDPOINTS(listingId, ratePlanId);
  let lastError: any = null;
  for (const endpoint of candidates) {
    try {
      await guestyClient.request("PUT", endpoint, { body });
      return endpoint;
    } catch (err: any) {
      lastError = err;
      const status = err?.status ?? 0;
      // 404 = wrong endpoint shape — try next candidate
      // anything else (401/403/422/5xx) = real failure, bail out
      if (status !== 404) throw err;
    }
  }
  throw lastError ?? new Error("All rate-plan update endpoints returned 404");
}

/** Apply listing → rate-plan fee sync. Dry-run by default. */
export async function applyCleaningFeeFix(opts: {
  dryRun?: boolean;
  listingId?: string;
  onStep?: (msg: string) => void;
} = {}): Promise<ApplyResult> {
  const dryRun = opts.dryRun !== false;
  const log = opts.onStep ?? (() => {});
  const audit = await auditCleaningFeeDrift();

  const targets = audit.outOfSync.filter(
    (e) => !opts.listingId || e.listingId === opts.listingId,
  );

  const result: ApplyResult = {
    ...audit,
    attempted: targets.length,
    succeeded: 0,
    failed: [],
    dryRun,
  };

  for (const entry of targets) {
    const action = `${dryRun ? "[DRY-RUN] " : ""}PUT cleaningFee ${entry.ratePlanCleaningFee} → ${entry.listingCleaningFee} on rate-plan "${entry.ratePlanName}" (${entry.ratePlanId}) of "${entry.listingTitle}"`;
    log(action);
    if (dryRun) {
      result.succeeded += 1;
      continue;
    }
    try {
      const endpoint = await updateRatePlanCleaningFee(
        entry.listingId,
        entry.ratePlanId,
        entry.listingCleaningFee,
      );
      result.succeeded += 1;
      log(`  ✓ updated via ${endpoint}`);
    } catch (err: any) {
      const msg = `${err?.message ?? err} (status=${err?.status ?? "n/a"}, endpoint=${err?.endpoint ?? "n/a"})`;
      result.failed.push({ entry, error: msg });
      log(`  ✗ ${msg}`);
    }
  }

  return result;
}
