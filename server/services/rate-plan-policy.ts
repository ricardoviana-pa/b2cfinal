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

const TTL_RATE_PLANS_MS = 6 * 60 * 60 * 1000;

export interface RatePlanPolicy {
  ratePlanId: string | null;
  name: string | null;
  /** Guesty's code(s) as sent, e.g. ["MODERATE"]; [] when unknown. */
  cancellationPolicy: string[];
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
  return {
    ratePlanId,
    name: plan ? String(planField(plan, "name") || "") || null : null,
    cancellationPolicy: plan ? policyToStrings(planField(plan, "cancellationPolicy")) : [],
  };
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
      return {
        ratePlanId,
        name: name || plan.name,
        cancellationPolicy: direct.length ? direct : plan.cancellationPolicy,
      };
    } catch {
      /* fail-soft */
    }
  }
  return { ratePlanId, name, cancellationPolicy: direct };
}
