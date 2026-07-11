/**
 * Checkout 2.0 — passo "Personalizar" (Fase 2, spec §5).
 *
 * Catalog cards grouped by category with explicit pricing models and
 * quantity/people/session steppers. Nothing pre-selected; "Mais escolhido"
 * on at most 2 items; needs_confirmation items carry the 24h badge.
 *
 * Until the Guesty invoice-items spike unlocks the single-charge path (2b),
 * priced extras are confirmed by the concierge and charged only after
 * confirmation — stated plainly under the list (spec §15.5 option b).
 */
import { useTranslation } from "react-i18next";
import {
  Check, Minus, Plus, Clock3, ConciergeBell,
  Moon, Car, Bus, SprayCan, BedDouble, ChefHat, ShoppingBasket, Wine, ListChecks,
  Flower2, Waves, Wind, Grape, Landmark, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";

/** Small brand icon per catalog item (spec §5 asks for a small visual per card) */
const EXTRA_ICONS: Record<string, LucideIcon> = {
  "late-checkin": Moon,
  "transfer-porto": Car,
  "transfer-porto-van": Bus,
  "daily-cleaning": SprayCan,
  "linen-change": BedDouble,
  "private-chef": ChefHat,
  "hamper-essentials": ShoppingBasket,
  "hamper-gourmet": Wine,
  "grocery-list": ListChecks,
  "massage": Flower2,
  "exp-surf": Waves,
  "exp-kitesurf": Wind,
  "exp-wine": Grape,
  "exp-heritage": Landmark,
};

export interface CatalogExtra {
  sku: string;
  category: "arrival" | "home" | "table" | "wellness" | "experiences";
  pricingModel: "per_stay" | "per_day" | "per_person" | "per_unit" | "per_person_per_unit" | "on_request";
  fulfillment: "instant" | "needs_confirmation" | "on_request";
  unitPrice?: number;
  minQty?: number;
  maxQty?: number;
  minPeople?: number;
  popular?: boolean;
}

/** Selection state per sku */
export interface ExtraSelection {
  qty?: number;
  people?: number;
  sessions?: number;
  days?: number;
}

export const EXTRA_CATEGORIES: Array<CatalogExtra["category"]> = [
  "arrival",
  "home",
  "table",
  "wellness",
  "experiences",
];

/** Whole-EUR amount for a selection, or null for on_request items */
export function extraAmount(item: CatalogExtra, sel: ExtraSelection): number | null {
  if (item.pricingModel === "on_request" || item.unitPrice == null) return null;
  switch (item.pricingModel) {
    case "per_stay":
      return item.unitPrice;
    case "per_day":
      return item.unitPrice * (sel.days ?? 1);
    case "per_person":
      return item.unitPrice * (sel.people ?? item.minPeople ?? 1);
    case "per_unit":
      return item.unitPrice * (sel.qty ?? 1);
    case "per_person_per_unit":
      return item.unitPrice * (sel.people ?? 1) * (sel.sessions ?? 1);
  }
}

function Stepper({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-2.5" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark disabled:opacity-25 transition-colors"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="min-w-[2ch] text-center text-[13px] text-pa-dark tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark disabled:opacity-25 transition-colors"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

export default function CustomizeStep({
  catalog,
  selection,
  nights,
  guests,
  lang,
  onToggle,
  onAdjust,
}: {
  catalog: CatalogExtra[];
  selection: Record<string, ExtraSelection>;
  nights: number;
  guests: number;
  lang: string;
  onToggle: (item: CatalogExtra) => void;
  onAdjust: (sku: string, patch: ExtraSelection) => void;
}) {
  const { t } = useTranslation();

  const unitSuffix = (item: CatalogExtra): string => {
    switch (item.pricingModel) {
      case "per_stay": return t("checkout.perStay", "per stay");
      case "per_day": return t("checkout.perDay", "per day");
      case "per_person": return t("checkout.perPerson", "per person");
      case "per_unit":
        return item.sku.startsWith("transfer") ? t("checkout.perTrip", "per trip") : t("checkout.perChange", "per change");
      case "per_person_per_unit": return t("checkout.perPersonSession", "per person · session");
      default: return "";
    }
  };

  return (
    <div className="space-y-6">
      {EXTRA_CATEGORIES.map((cat) => {
        const items = catalog.filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="space-y-2">
            <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold">
              {t(`checkout.cat.${cat}`)}
            </p>
            {items.map((item) => {
              const sel = selection[item.sku];
              const selected = sel != null;
              const amount = selected ? extraAmount(item, sel) : null;
              const onRequest = item.pricingModel === "on_request";
              return (
                <div
                  key={item.sku}
                  className={cn(
                    "bg-white border rounded-lg p-4 transition-all",
                    selected ? "border-pa-dark ring-1 ring-pa-dark" : "border-pa-sand hover:border-pa-gold",
                  )}
                >
                  <div className="flex items-start gap-3">
                    {(() => {
                      const Icon = EXTRA_ICONS[item.sku] ?? ConciergeBell;
                      return (
                        <span
                          className={cn(
                            "shrink-0 w-9 h-9 rounded-md flex items-center justify-center transition-colors",
                            selected ? "bg-pa-dark text-white" : "bg-pa-warm text-pa-gold",
                          )}
                        >
                          <Icon className="w-4 h-4" strokeWidth={1.8} />
                        </span>
                      );
                    })()}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[13.5px] text-pa-dark font-medium">
                          {t(`checkout.extras.${item.sku}.name`)}
                        </p>
                        {item.popular && (
                          <span className="text-[9px] font-medium tracking-wider uppercase px-1.5 py-0.5 bg-pa-warm text-pa-gold border border-pa-sand rounded-sm">
                            {t("checkout.mostChosen", "Most chosen")}
                          </span>
                        )}
                        {item.fulfillment === "needs_confirmation" && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-medium tracking-wider uppercase px-1.5 py-0.5 text-pa-earth border border-pa-sand rounded-sm">
                            <Clock3 className="w-2.5 h-2.5" /> {t("checkout.confirm24h", "Confirmed within 24h")}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-pa-earth leading-snug mt-0.5">
                        {t(`checkout.extras.${item.sku}.desc`)}
                      </p>
                      <p className="text-[12px] text-pa-dark mt-1.5 tabular-nums">
                        {onRequest ? (
                          <span className="inline-flex items-center gap-1 text-pa-earth">
                            <ConciergeBell className="w-3 h-3" /> {t("checkout.onRequest", "On request — no charge now")}
                          </span>
                        ) : (
                          <>
                            {formatEur(item.unitPrice!, lang)}{" "}
                            <span className="text-pa-stone-aa">/ {unitSuffix(item)}</span>
                            {item.minPeople ? (
                              <span className="text-pa-stone-aa"> · {t("checkout.minPeople", { count: item.minPeople })}</span>
                            ) : null}
                          </>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggle(item)}
                      aria-pressed={selected}
                      className={cn(
                        "shrink-0 min-h-[36px] px-4 rounded-full border text-[11px] font-medium tracking-[0.08em] uppercase transition-colors",
                        selected
                          ? "bg-pa-dark border-pa-dark text-white"
                          : "border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark",
                      )}
                    >
                      {selected ? (
                        <span className="inline-flex items-center gap-1"><Check className="w-3 h-3" /> {t("checkout.added", "Added")}</span>
                      ) : onRequest ? (
                        t("checkout.request", "Request")
                      ) : (
                        t("checkout.add", "Add")
                      )}
                    </button>
                  </div>

                  {/* Quantity controls for the selected item */}
                  {selected && !onRequest && (
                    <div className="flex items-center justify-between gap-4 border-t border-pa-sand mt-3 pt-3">
                      <div className="flex items-center gap-5 flex-wrap">
                        {item.pricingModel === "per_day" && (
                          <div className="flex items-center gap-2.5">
                            <span className="text-[11px] text-pa-stone-aa">{t("checkout.daysLabel", "Days")}</span>
                            <Stepper
                              value={sel.days ?? 1}
                              min={1}
                              max={Math.max(1, nights)}
                              onChange={(v) => onAdjust(item.sku, { days: v })}
                              ariaLabel={t("checkout.daysLabel", "Days")}
                            />
                          </div>
                        )}
                        {item.pricingModel === "per_unit" && (
                          <div className="flex items-center gap-2.5">
                            <span className="text-[11px] text-pa-stone-aa">
                              {item.sku.startsWith("transfer") ? t("checkout.tripsLabel", "Trips") : t("checkout.qtyLabel", "Quantity")}
                            </span>
                            <Stepper
                              value={sel.qty ?? 1}
                              min={item.minQty ?? 1}
                              max={item.maxQty ?? 10}
                              onChange={(v) => onAdjust(item.sku, { qty: v })}
                              ariaLabel={t("checkout.qtyLabel", "Quantity")}
                            />
                          </div>
                        )}
                        {(item.pricingModel === "per_person" || item.pricingModel === "per_person_per_unit") && (
                          <div className="flex items-center gap-2.5">
                            <span className="text-[11px] text-pa-stone-aa">{t("checkout.peopleLabel", "People")}</span>
                            <Stepper
                              value={sel.people ?? item.minPeople ?? Math.min(guests, 30)}
                              min={item.minPeople ?? 1}
                              max={30}
                              onChange={(v) => onAdjust(item.sku, { people: v })}
                              ariaLabel={t("checkout.peopleLabel", "People")}
                            />
                          </div>
                        )}
                        {item.pricingModel === "per_person_per_unit" && (
                          <div className="flex items-center gap-2.5">
                            <span className="text-[11px] text-pa-stone-aa">{t("checkout.sessionsLabel", "Sessions")}</span>
                            <Stepper
                              value={sel.sessions ?? 1}
                              min={1}
                              max={10}
                              onChange={(v) => onAdjust(item.sku, { sessions: v })}
                              ariaLabel={t("checkout.sessionsLabel", "Sessions")}
                            />
                          </div>
                        )}
                      </div>
                      {amount != null && (
                        <span className="text-[14px] text-pa-dark font-medium tabular-nums shrink-0">
                          {formatEur(amount, lang)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      <p className="text-[11.5px] text-pa-stone-aa leading-relaxed">
        {t(
          "checkout.extrasChargeNote",
          "Extras are confirmed by our concierge and charged only after confirmation — nothing is charged for them today. On-request items are quoted individually.",
        )}
      </p>
    </div>
  );
}
