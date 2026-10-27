/**
 * Which cancellation policy does a booking have? Guesty does not return
 * `cancellationPolicy` on website reservations, so the answer comes from the
 * reservation's rate plan: ratePlanId → the listing's rate plans (Open API
 * GET /v1/listings/{id}/ratePlans, the same call /api/listings/:id/rate-plans
 * already makes) → that plan's code and name. Never a guess: when any step is
 * missing the caller gets what is known (maybe just the name, maybe nothing)
 * and shows the "terms of your rate" fallback.
 */
import { cacheManager } from "../lib/cacheManager";
import { guestyClient } from "../lib/guesty";
import { cancellationFeeMatches } from "@shared/cancellationPolicy";

const TTL_RATE_PLANS_MS = 6 * 60 * 60 * 1000;

export interface RatePlanPolicy {
  ratePlanId: string | null;
  /** Guesty's internal plan name — for classification and logs, never shown to guests. */
  name: string | null;
  /** Guesty's code(s) as sent, e.g. ["MODERATE"]; [] when unknown. */
  cancellationPolicy: string[];
  /** Guesty's cancellationFee (percent) when it sent one. */
  cancellationFee?: unknown;
}

const feeWarned = new Set<string>();

/** Every sentence says 100 % after the deadline; a plan set to anything else
 *  is shown as unknown (planPolicyCode) and logged once, so someone updates
 *  the copy. */
export function warnIfFeeDiffers(where: string, plan: { ratePlanId?: string | null; name?: string | null; cancellationFee?: unknown }): void {
  if (cancellationFeeMatches(plan.cancellationFee)) return;
  const key = `${plan.ratePlanId ?? plan.name ?? "?"}|${String(plan.cancellationFee)}`;
  if (feeWarned.has(key)) return;
  feeWarned.add(key);
  console.warn(
    `[cancellation] ${where}: rate plan ${plan.ratePlanId ?? "?"} ("${plan.name ?? ""}") has cancellationFee=${String(plan.cancellationFee)}, not 100 — the site shows "the cancellation terms of your rate" for it until the policy copy is updated`,
  );
}

/** Resolve `p`, or `fallback` after `ms` — the slow Guesty call keeps running
 *  (and fills the cache) but nobody waits for it. */
export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([p.catch(() => fallback), late]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** cancellationPolicy arrives as string[], a single string, or an object
 *  depending on the payload generation — never assume array. */
export function policyToStrings(policy: unknown): string[] {
  if (Array.isArray(policy)) return policy.map((p) => (typeof p === "string" ? p : JSON.stringify(p)));
  if (typeof policy === "string") return policy ? [policy] : [];
  if (policy && typeof policy === "object") {
    return Object.values(policy as Record<string, unknown>)
      .filter((v) => typeof v === "string" || typeof v === "number")
      .map(String);
  }
  return [];
}

function planField(rp: any, key: string): any {
  return rp?.[key] ?? rp?.ratePlan?.[key];
}

/** Rate plans of a listing as Guesty returns them (results[] or a bare array). */
export async function getListingRatePlansCached(listingId: string): Promise<any[]> {
  const key = `rate-plans:${listingId}`;
  const cached = cacheManager.get<any[]>(key);
  if (cached) return cached;
  const raw: any = await guestyClient.getListingRatePlans(listingId);
  const list: any[] = Array.isArray(raw?.results)
    ? raw.results
    : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw)
        ? raw
        : [];
  cacheManager.set(key, list, TTL_RATE_PLANS_MS);
  return list;
}

/** Find one plan of the listing by id → its Guesty code and name. */
export async function ratePlanPolicyFor(listingId: string, ratePlanId: string): Promise<RatePlanPolicy> {
  const plans = await getListingRatePlansCached(listingId);
  const plan = plans.find((p) => String(planField(p, "_id") ?? planField(p, "id") ?? "") === ratePlanId);
  const out: RatePlanPolicy = {
    ratePlanId,
    name: plan ? String(planField(plan, "name") || "") || null : null,
    cancellationPolicy: plan ? policyToStrings(planField(plan, "cancellationPolicy")) : [],
  };
  const fee = plan ? planField(plan, "cancellationFee") : undefined;
  if (fee != null) {
    out.cancellationFee = fee;
    warnIfFeeDiffers(`listing ${listingId}`, out);
  }
  return out;
}

/**
 * The policy of a reservation, from its own rate plan in Guesty. Reads the
 * reservation payload first (it may already carry the code or the plan id),
 * then the Open API reservation for `ratePlanId`, then the listing's plans.
 * Fail-soft: errors only reduce what is known.
 */
export async function reservationRatePlanPolicy(
  reservationId: string,
  reservation: any,
  listingId: string,
): Promise<RatePlanPolicy> {
  const direct = policyToStrings(reservation?.cancellationPolicy ?? reservation?.ratePlan?.cancellationPolicy);
  let ratePlanId: string | null =
    String(reservation?.ratePlanId || reservation?.ratePlan?._id || reservation?.ratePlan?.id || "") || null;
  let name: string | null = reservation?.ratePlan?.name ? String(reservation.ratePlan.name) : null;
  let planListing = listingId;

  if (!ratePlanId) {
    try {
      const r: any = await guestyClient.request("GET", `/v1/reservations/${encodeURIComponent(reservationId)}`, {
        query: { fields: "ratePlanId listingId" },
      });
      ratePlanId = r?.ratePlanId ? String(r.ratePlanId) : null;
      if (!planListing && r?.listingId) planListing = String(r.listingId);
    } catch {
      /* fail-soft */
    }
  }

  if (ratePlanId && planListing) {
    try {
      const plan = await ratePlanPolicyFor(planListing, ratePlanId);
      const out: RatePlanPolicy = {
        ratePlanId,
        name: name || plan.name,
        cancellationPolicy: direct.length ? direct : plan.cancellationPolicy,
      };
      if (plan.cancellationFee != null) out.cancellationFee = plan.cancellationFee;
      return out;
    } catch {
      /* fail-soft */
    }
  }
  return { ratePlanId, name, cancellationPolicy: direct };
}
