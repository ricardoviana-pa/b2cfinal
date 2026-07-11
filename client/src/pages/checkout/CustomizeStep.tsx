/**
 * Checkout 2.0 — passo "Personalizar" (Fase 2, spec v1.2 §5).
 *
 * Estrutura narrativa em capítulos por scroll (não são páginas separadas —
 * decisão fechada em §5.1). Cada capítulo abre com título serif e uma linha
 * editorial; os cards têm fotografia real 3:2 (§9, a correção nº1 face à demo).
 *
 * Abre com "Incluído na sua estadia" (generosidade antes do comércio) e a linha
 * de contexto "Selecionado para {casa}". No topo de "A chegada" vive a escolha
 * OBRIGATÓRIA de receção (§5.2). Nada vem pré-selecionado.
 */
import { useTranslation } from "react-i18next";
import { Check, Minus, Plus, Clock3, ConciergeBell, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";

export type ExtraChapter = "arrival" | "home" | "table" | "wellness" | "experiences";

export interface CatalogExtra {
  sku: string;
  chapter: ExtraChapter;
  pricingModel: "per_stay" | "per_day" | "per_person" | "per_unit" | "per_person_per_unit" | "on_request";
  fulfillment: "instant" | "needs_confirmation" | "on_request";
  unitPrice?: number;
  minQty?: number;
  maxQty?: number;
  minPeople?: number;
  popular?: boolean;
  photo: string;
  rank?: number;
  suggestedQty?: number;
  suggestedDays?: number;
}

export interface ReceptionConfig {
  hostedPrice: number;
  hostedLatePrice: number;
  lateFromHour: number;
  photoSelf: string;
  photoHosted: string;
}

export type ReceptionChoice = { type: "self" | "hosted"; late?: boolean } | null;

export interface ExtraSelection {
  qty?: number;
  people?: number;
  sessions?: number;
  days?: number;
}

export const EXTRA_CHAPTERS: ExtraChapter[] = ["arrival", "home", "table", "wellness", "experiences"];

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

export function receptionAmount(cfg: ReceptionConfig, choice: ReceptionChoice): number {
  if (!choice || choice.type === "self") return 0;
  return choice.late ? cfg.hostedLatePrice : cfg.hostedPrice;
}

function Stepper({
  value, min, max, onChange, ariaLabel,
}: { value: number; min: number; max: number; onChange: (v: number) => void; ariaLabel: string }) {
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

/** Reception — mandatory choice at the top of "A chegada" (§5.2). */
function ReceptionChoiceCards({
  config, choice, lang, onChoose,
}: {
  config: ReceptionConfig;
  choice: ReceptionChoice;
  lang: string;
  onChoose: (c: ReceptionChoice) => void;
}) {
  const { t } = useTranslation();
  const selfSelected = choice?.type === "self";
  const hostedSelected = choice?.type === "hosted";

  return (
    <div className="space-y-2.5">
      <p className="text-[12px] text-pa-earth">{t("checkout.reception.prompt")}</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {/* Self check-in — included */}
        <button
          type="button"
          onClick={() => onChoose({ type: "self" })}
          aria-pressed={selfSelected}
          className={cn(
            "text-left rounded-lg border overflow-hidden transition-all bg-white",
            selfSelected ? "border-pa-dark ring-1 ring-pa-dark" : "border-pa-sand hover:border-pa-gold",
          )}
        >
          <div className="relative aspect-[3/2] bg-pa-warm">
            <img src={config.photoSelf} alt="" className="w-full h-full object-cover" loading="lazy" />
            {selfSelected && (
              <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pa-dark flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" />
              </span>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] text-pa-dark font-medium">{t("checkout.reception.self.name")}</p>
              <span className="text-[11px] font-medium tracking-wider uppercase text-pa-gold">{t("checkout.included.badge")}</span>
            </div>
            <p className="text-[12px] text-pa-earth leading-snug mt-1">{t("checkout.reception.self.desc")}</p>
          </div>
        </button>

        {/* Hosted reception — paid, with a late-arrival price modifier */}
        <button
          type="button"
          onClick={() => onChoose({ type: "hosted", late: choice?.type === "hosted" ? choice.late : false })}
          aria-pressed={hostedSelected}
          className={cn(
            "text-left rounded-lg border overflow-hidden transition-all bg-white",
            hostedSelected ? "border-pa-dark ring-1 ring-pa-dark" : "border-pa-sand hover:border-pa-gold",
          )}
        >
          <div className="relative aspect-[3/2] bg-pa-warm">
            <img src={config.photoHosted} alt="" className="w-full h-full object-cover" loading="lazy" />
            {hostedSelected && (
              <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pa-dark flex items-center justify-center">
                <Check className="w-3.5 h-3.5 text-white" />
              </span>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] text-pa-dark font-medium">{t("checkout.reception.hosted.name")}</p>
              <span className="text-[13px] text-pa-dark font-medium tabular-nums">
                {formatEur(hostedSelected && choice?.late ? config.hostedLatePrice : config.hostedPrice, lang)}
              </span>
            </div>
            <p className="text-[12px] text-pa-earth leading-snug mt-1">{t("checkout.reception.hosted.desc")}</p>
          </div>
        </button>
      </div>

      {/* Arrival window — only when hosted is chosen; toggles the price (§5.2) */}
      {hostedSelected && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-[11px] text-pa-stone-aa">{t("checkout.reception.arrivalWindow")}</span>
          {[false, true].map((late) => (
            <button
              key={String(late)}
              type="button"
              onClick={() => onChoose({ type: "hosted", late })}
              className={cn(
                "text-[11.5px] px-3 py-1 rounded-full border transition-colors",
                (choice?.late ?? false) === late
                  ? "border-pa-dark bg-pa-dark text-white"
                  : "border-pa-sand text-pa-earth hover:border-pa-dark",
              )}
            >
              {late
                ? t("checkout.reception.afterLate", { hour: config.lateFromHour })
                : t("checkout.reception.beforeLate", { hour: config.lateFromHour })}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ExtraCard({
  item, sel, lang, guests, nights, onToggle, onAdjust,
}: {
  item: CatalogExtra;
  sel: ExtraSelection | undefined;
  lang: string;
  guests: number;
  nights: number;
  onToggle: (item: CatalogExtra) => void;
  onAdjust: (sku: string, patch: ExtraSelection) => void;
}) {
  const { t } = useTranslation();
  const selected = sel != null;
  const amount = selected ? extraAmount(item, sel!) : null;
  const onRequest = item.pricingModel === "on_request";

  const unitSuffix = (): string => {
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
    <div
      className={cn(
        "rounded-lg border overflow-hidden bg-white transition-all flex flex-col",
        selected ? "border-pa-dark ring-1 ring-pa-dark" : "border-pa-sand hover:border-pa-gold",
      )}
    >
      <div className="relative aspect-[3/2] bg-pa-warm">
        <img src={item.photo} alt="" className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute top-2 left-2 flex gap-1.5">
          {item.popular && (
            <span className="text-[9px] font-medium tracking-wider uppercase px-1.5 py-0.5 bg-white/90 text-pa-gold rounded-sm">
              {t("checkout.mostChosen", "Most chosen")}
            </span>
          )}
          {item.fulfillment === "needs_confirmation" && (
            <span className="inline-flex items-center gap-1 text-[9px] font-medium tracking-wider uppercase px-1.5 py-0.5 bg-white/90 text-pa-earth rounded-sm">
              <Clock3 className="w-2.5 h-2.5" /> {t("checkout.confirm24h", "Confirmed within 24h")}
            </span>
          )}
        </div>
        {selected && (
          <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pa-dark flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" />
          </span>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        <p className="text-[13.5px] text-pa-dark font-medium">{t(`checkout.extras.${item.sku}.name`)}</p>
        <p className="text-[12px] text-pa-earth leading-snug mt-0.5 flex-1">{t(`checkout.extras.${item.sku}.desc`)}</p>

        <div className="flex items-center justify-between gap-3 mt-3">
          <p className="text-[12px] text-pa-dark tabular-nums">
            {onRequest ? (
              <span className="inline-flex items-center gap-1 text-pa-earth">
                <ConciergeBell className="w-3 h-3" /> {t("checkout.onRequest", "On request")}
              </span>
            ) : (
              <>
                {formatEur(item.unitPrice!, lang)} <span className="text-pa-stone-aa">/ {unitSuffix()}</span>
                {item.minPeople ? <span className="text-pa-stone-aa"> · {t("checkout.minPeople", { count: item.minPeople })}</span> : null}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => onToggle(item)}
            aria-pressed={selected}
            className={cn(
              "shrink-0 min-h-[34px] px-4 rounded-full border text-[11px] font-medium tracking-[0.08em] uppercase transition-colors",
              selected ? "bg-pa-dark border-pa-dark text-white" : "border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark",
            )}
          >
            {selected ? t("checkout.added", "Added") : onRequest ? t("checkout.request", "Request") : t("checkout.add", "Add")}
          </button>
        </div>

        {/* Quantity controls when selected + priced */}
        {selected && !onRequest && (
          <div className="flex items-center justify-between gap-3 border-t border-pa-sand mt-3 pt-3">
            <div className="flex items-center gap-4 flex-wrap">
              {item.pricingModel === "per_day" && (
                <div className="flex items-center gap-2"><span className="text-[11px] text-pa-stone-aa">{t("checkout.daysLabel", "Days")}</span>
                  <Stepper value={sel!.days ?? 1} min={1} max={Math.max(1, nights)} onChange={(v) => onAdjust(item.sku, { days: v })} ariaLabel={t("checkout.daysLabel", "Days")} /></div>
              )}
              {item.pricingModel === "per_unit" && (
                <div className="flex items-center gap-2"><span className="text-[11px] text-pa-stone-aa">{item.sku.startsWith("transfer") ? t("checkout.tripsLabel", "Trips") : t("checkout.qtyLabel", "Quantity")}</span>
                  <Stepper value={sel!.qty ?? 1} min={item.minQty ?? 1} max={item.maxQty ?? 10} onChange={(v) => onAdjust(item.sku, { qty: v })} ariaLabel={t("checkout.qtyLabel", "Quantity")} /></div>
              )}
              {(item.pricingModel === "per_person" || item.pricingModel === "per_person_per_unit") && (
                <div className="flex items-center gap-2"><span className="text-[11px] text-pa-stone-aa">{t("checkout.peopleLabel", "People")}</span>
                  <Stepper value={sel!.people ?? item.minPeople ?? Math.min(guests, 30)} min={item.minPeople ?? 1} max={30} onChange={(v) => onAdjust(item.sku, { people: v })} ariaLabel={t("checkout.peopleLabel", "People")} /></div>
              )}
              {item.pricingModel === "per_person_per_unit" && (
                <div className="flex items-center gap-2"><span className="text-[11px] text-pa-stone-aa">{t("checkout.sessionsLabel", "Sessions")}</span>
                  <Stepper value={sel!.sessions ?? 1} min={1} max={10} onChange={(v) => onAdjust(item.sku, { sessions: v })} ariaLabel={t("checkout.sessionsLabel", "Sessions")} /></div>
              )}
            </div>
            {amount != null && <span className="text-[14px] text-pa-dark font-medium tabular-nums shrink-0">{formatEur(amount, lang)}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomizeStep({
  catalog, included, reception, receptionChoice, selection, nights, guests, propertyName, lang,
  onToggle, onAdjust, onChooseReception,
}: {
  catalog: CatalogExtra[];
  included: readonly string[];
  reception: ReceptionConfig | null;
  receptionChoice: ReceptionChoice;
  selection: Record<string, ExtraSelection>;
  nights: number;
  guests: number;
  propertyName: string;
  lang: string;
  onToggle: (item: CatalogExtra) => void;
  onAdjust: (sku: string, patch: ExtraSelection) => void;
  onChooseReception: (c: ReceptionChoice) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="space-y-8">
      {/* Context line — curation only creates value if it is visible (§5.3) */}
      <p className="flex items-center gap-1.5 text-[12px] text-pa-gold">
        <Sparkles className="w-3.5 h-3.5" /> {t("checkout.curatedFor", { property: propertyName })}
      </p>

      {/* "Incluído na sua estadia" — generosity before commerce (§5) */}
      <div className="rounded-lg bg-pa-warm border border-pa-sand p-5">
        <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-3">
          {t("checkout.included.title", "Included in your stay")}
        </p>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {included.map((key) => (
            <div key={key} className="flex items-center gap-2 text-[12.5px] text-pa-earth">
              <Check className="w-3.5 h-3.5 text-pa-gold shrink-0" strokeWidth={2} />
              {t(`checkout.included.${key}`)}
            </div>
          ))}
        </div>
      </div>

      {/* Chapters */}
      {EXTRA_CHAPTERS.map((chapter) => {
        const items = catalog.filter((i) => i.chapter === chapter);
        const isArrival = chapter === "arrival";
        if (!items.length && !(isArrival && reception)) return null;
        return (
          <div key={chapter} className="space-y-4">
            <div>
              <h2 className="font-display text-[22px] text-pa-dark leading-tight">{t(`checkout.chapter.${chapter}.title`)}</h2>
              <p className="text-[13px] text-pa-earth mt-0.5">{t(`checkout.chapter.${chapter}.line`)}</p>
            </div>

            {/* Reception lives at the top of "A chegada" */}
            {isArrival && reception && (
              <ReceptionChoiceCards config={reception} choice={receptionChoice} lang={lang} onChoose={onChooseReception} />
            )}

            {items.length > 0 && (
              <div className="grid sm:grid-cols-2 gap-3">
                {items.map((item) => (
                  <ExtraCard
                    key={item.sku}
                    item={item}
                    sel={selection[item.sku]}
                    lang={lang}
                    guests={guests}
                    nights={nights}
                    onToggle={onToggle}
                    onAdjust={onAdjust}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      <p className="text-[11.5px] text-pa-stone-aa leading-relaxed">
        {t("checkout.extrasChargeNote")}
      </p>
    </div>
  );
}
