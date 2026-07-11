/**
 * Checkout 2.0 — launch catalog for the "Personalizar" step (Fase 2, spec §5).
 *
 * Prices are INDICATIVE until confirmed with Susana/Diogo (spec §15.4).
 * Names/descriptions are translated client-side via i18n keys
 * `checkout.extras.<sku>.name` / `.desc` (all 9 locales).
 *
 * pricing_model: per_stay | per_day | per_person | per_unit | per_person_per_unit | on_request
 * fulfillment:   instant (straight to the ops manifest)
 *              | needs_confirmation (team confirms in 24h; charged only after
 *                confirmation until the invoice-items spike unlocks single charge)
 *              | on_request (no price, creates a concierge request)
 *
 * v1 scope is global; per-region/per-property scoping arrives with the DB
 * catalog (extras_catalog, spec §10).
 */

export type ExtraPricingModel =
  | "per_stay"
  | "per_day"
  | "per_person"
  | "per_unit"
  | "per_person_per_unit"
  | "on_request";

export type ExtraFulfillment = "instant" | "needs_confirmation" | "on_request";

export interface CheckoutExtra {
  sku: string;
  category: "arrival" | "home" | "table" | "wellness" | "experiences";
  pricingModel: ExtraPricingModel;
  fulfillment: ExtraFulfillment;
  /** EUR, whole euros. Absent for on_request items. */
  unitPrice?: number;
  minQty?: number;
  maxQty?: number;
  /** per_person / per_person_per_unit: minimum people (e.g. chef min 4) */
  minPeople?: number;
  /** "Mais escolhido" badge — max 2 items site-wide (spec §5) */
  popular?: boolean;
}

export const CHECKOUT_EXTRAS: CheckoutExtra[] = [
  // ── Chegada ──
  { sku: "late-checkin", category: "arrival", pricingModel: "per_stay", fulfillment: "instant", unitPrice: 50 },
  { sku: "transfer-porto", category: "arrival", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 120, minQty: 1, maxQty: 4, popular: true },
  { sku: "transfer-porto-van", category: "arrival", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 160, minQty: 1, maxQty: 4 },

  // ── Casa ──
  { sku: "daily-cleaning", category: "home", pricingModel: "per_day", fulfillment: "instant", unitPrice: 60 },
  { sku: "linen-change", category: "home", pricingModel: "per_unit", fulfillment: "instant", unitPrice: 45, minQty: 1, maxQty: 10 },

  // ── Mesa ──
  { sku: "private-chef", category: "table", pricingModel: "per_person", fulfillment: "needs_confirmation", unitPrice: 95, minPeople: 4 },
  { sku: "hamper-essentials", category: "table", pricingModel: "per_stay", fulfillment: "instant", unitPrice: 75 },
  { sku: "hamper-gourmet", category: "table", pricingModel: "per_stay", fulfillment: "instant", unitPrice: 150, popular: true },
  { sku: "grocery-list", category: "table", pricingModel: "on_request", fulfillment: "on_request" },

  // ── Bem-estar ──
  { sku: "massage", category: "wellness", pricingModel: "per_person_per_unit", fulfillment: "needs_confirmation", unitPrice: 90 },

  // ── Experiências (V1: on_request; V2: disponibilidade Bókun em tempo real) ──
  { sku: "exp-surf", category: "experiences", pricingModel: "on_request", fulfillment: "on_request" },
  { sku: "exp-kitesurf", category: "experiences", pricingModel: "on_request", fulfillment: "on_request" },
  { sku: "exp-wine", category: "experiences", pricingModel: "on_request", fulfillment: "on_request" },
  { sku: "exp-heritage", category: "experiences", pricingModel: "on_request", fulfillment: "on_request" },
];
