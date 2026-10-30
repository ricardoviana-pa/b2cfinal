/**
 * Checkout, secção "Extras" (29 out 2026: versão compacta).
 *
 * O que o Ricardo pediu: manter os extras mas simplificá-los e tirar ruído.
 * Na prática quase ninguém compra serviços no checkout; o que se usa são o
 * animal de estimação, o berço de viagem e a cadeira de bebé, e o resto
 * pede-se por email ao concierge. Por isso a secção passa a três grupos
 * curtos, todos com a mesma anatomia de linha:
 *
 *   1. A chegada: a escolha obrigatória da receção (spec §5.2), em duas
 *      linhas rádio no mesmo cartão (self check-in incluído / presencial).
 *   2. Detalhes da estadia: berço, cadeira de bebé e animal (o kit e a
 *      comida do animal só aparecem com a taxa escolhida, §5.0).
 *   3. Serviços opcionais: a lista curta aprovada a 23 set 2026 (chef,
 *      breakfast box, compras feitas; sem nenhum destes no catálogo curado,
 *      as três primeiras linhas por rank). Os transfers (par Porto/Lisboa
 *      com um só selector de aeroporto), o resto do catálogo e as
 *      experiências (linhas com miniatura real) ficam atrás de "Ver todos
 *      os serviços (N)"; um item escolhido aí continua à vista com a lista
 *      fechada.
 *
 * Saíram os capítulos editoriais (títulos de 48 px, overlines, nav sticky
 * com scrollspy, animações de entrada, carrossel com setas), a caixa de
 * abertura e o botão de continuar a meio: o CTA único vive no fim da
 * secção, no CheckoutPage. Nada vem pré-seleccionado; a lógica de preços
 * (extraAmount), de cascata pai/filho e de eventos é a mesma de sempre.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";

export type ExtraChapter = "arrival" | "home" | "table" | "wellness" | "experiences";

export interface CatalogExtra {
  sku: string;
  chapter: ExtraChapter;
  pricingModel: "per_stay" | "per_day" | "per_person" | "per_unit" | "per_person_per_unit" | "included_selectable" | "per_person_per_day" | "on_request";
  fulfillment: "instant" | "needs_confirmation" | "on_request";
  unitPrice?: number;
  priceFrom?: number;
  minQty?: number;
  maxQty?: number;
  minPeople?: number;
  popular?: boolean;
  photo?: string;
  feature?: boolean;
  parentSku?: string;
  scarcity?: boolean;
  region?: "north" | "south";
  unitKey?: "hour" | "cleaning";
  tierPrices?: number[];
  rank?: number;
  suggestedQty?: number;
  suggestedDays?: number;
  petsOnly?: boolean;
}

export interface ReceptionConfig {
  hostedPrice: number;
  hostedLatePrice: number;
  lateFromHour: number;
}

export type ReceptionChoice = { type: "self" | "hosted"; late?: boolean } | null;

export interface ExtraSelection {
  qty?: number;
  people?: number;
  sessions?: number;
  days?: number;
}

export const EXTRA_CHAPTERS: ExtraChapter[] = ["arrival", "table", "home", "wellness", "experiences"];

/** Serviços visíveis por defeito: a lista curta aprovada a 23 set 2026 (chef,
 *  breakfast box, compras feitas); o resto, transfers incluídos, fica atrás de
 *  "Ver todos os serviços". Sem nenhum destes no catálogo curado, as 3
 *  primeiras linhas por rank. */
const SHORT_LIST = ["private-chef", "breakfast-box", "grocery-setup"];
const TOP_SERVICES = 3;

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
    case "per_unit": {
      const q = sel.qty ?? 1;
      if (item.tierPrices?.length) return item.tierPrices[Math.min(q, item.tierPrices.length) - 1];
      return item.unitPrice * q;
    }
    case "per_person_per_unit":
      return item.unitPrice * (sel.people ?? 1) * (sel.sessions ?? 1);
    case "included_selectable":
      // 1.ª unidade incluída; extras a unitPrice (§5.0)
      return item.unitPrice * Math.max(0, (sel.qty ?? 1) - 1);
    case "per_person_per_day":
      return item.unitPrice * (sel.people ?? 1) * (sel.days ?? 1);
  }
}

export function receptionAmount(cfg: ReceptionConfig, choice: ReceptionChoice): number {
  if (!choice || choice.type === "self") return 0;
  return choice.late ? cfg.hostedLatePrice : cfg.hostedPrice;
}

/** Detalhes da estadia: preparação da casa, não venda (berço, cadeira, animal). */
export function isStayDetail(item: CatalogExtra): boolean {
  return item.pricingModel === "included_selectable" || !!item.petsOnly;
}

function Stepper({
  value, min, max, onChange, ariaLabel,
}: { value: number; min: number; max: number; onChange: (v: number) => void; ariaLabel: string }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label={`${ariaLabel} −`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-pa-sand bg-white text-pa-earth hover:border-pa-dark hover:text-pa-dark disabled:opacity-25 transition-colors"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className="min-w-[2ch] text-center body-sm text-pa-dark tabular-nums">{value}</span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label={`${ariaLabel} +`}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-pa-sand bg-white text-pa-earth hover:border-pa-dark hover:text-pa-dark disabled:opacity-25 transition-colors"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

/** Rótulo pequeno de um grupo + cartão com linhas separadas por hairlines. */
function Group({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="eyebrow tracking-[0.12em] uppercase text-pa-stone-aa">{label}</p>
        {hint ? <p className="caption text-pa-earth">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Fórmula explícita do preço — mata a ambiguidade dos steppers (12 jul):
 *  "4 pessoas × 5 dias × 25 € = 500 €". */
function priceFormula(item: CatalogExtra, sel: ExtraSelection, lang: string, t: any): string | null {
  if (item.unitPrice == null) return null;
  const u = formatEur(item.unitPrice, lang);
  const p = (n: number) => `${n} ${String(t("checkout.peopleLabel", "People")).toLowerCase()}`;
  const d = (n: number) => `${n} ${String(t("checkout.daysLabel", "Days")).toLowerCase()}`;
  switch (item.pricingModel) {
    case "per_day": return `${d(sel.days ?? 1)} × ${u}`;
    case "per_unit": {
      const q = sel.qty ?? 1;
      if (item.tierPrices?.length) {
        // escalões: mostrar a soma real (50 € + 100 €), não qty × unit
        const parts = item.tierPrices.slice(0, q).map((tot, i) => (i === 0 ? tot : tot - item.tierPrices![i - 1]));
        return parts.map((v) => formatEur(v, lang)).join(" + ");
      }
      return `${q} × ${u}`;
    }
    case "per_person": return `${p(sel.people ?? item.minPeople ?? 1)} × ${u}`;
    case "per_person_per_unit": {
      const unit = item.unitKey === "hour" ? t("checkout.hoursLabel", "Hours") : t("checkout.sessionsLabel", "Sessions");
      return `${p(sel.people ?? 1)} × ${sel.sessions ?? 1} ${String(unit).toLowerCase()} × ${u}`;
    }
    case "per_person_per_day": return `${p(sel.people ?? 1)} × ${d(sel.days ?? 1)} × ${u}`;
    case "included_selectable": {
      const extra = Math.max(0, (sel.qty ?? 1) - 1);
      return extra === 0 ? String(t("checkout.included.badge")) : `1 ${String(t("checkout.included.badge")).toLowerCase()} + ${extra} × ${u}`;
    }
    default: return null;
  }
}

/** Resumo curto da seleção para a linha adicionada ("2 mudas · 90 €"). */
function selectionSummary(item: CatalogExtra, sel: ExtraSelection, amount: number | null, lang: string, t: any): string {
  const bits: string[] = [];
  if (sel.days) bits.push(`${sel.days} ${String(t("checkout.daysLabel", "Days")).toLowerCase()}`);
  if (sel.qty) bits.push(`${sel.qty}×`);
  if (sel.people) bits.push(`${sel.people} ${String(t("checkout.peopleLabel", "People")).toLowerCase()}`);
  if (sel.sessions && sel.sessions > 1) bits.push(`${sel.sessions} ${String(t("checkout.sessionsLabel", "Sessions")).toLowerCase()}`);
  if (amount != null) {
    bits.push(amount === 0 && item.pricingModel === "included_selectable" ? t("checkout.included.badge") : formatEur(amount, lang));
  }
  return bits.join(" · ");
}

/** Botão redondo de adicionar/retirar: "+" vazio, ✓ cheio quando adicionado. */
function ToggleButton({ selected, label, onClick }: { selected: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
      className={cn(
        // Alvo de toque de 44 px mesmo com o círculo de 36 px no computador
        "relative shrink-0 flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded-full border transition-colors before:absolute before:-inset-1 before:content-['']",
        selected
          ? "bg-pa-dark border-pa-dark text-white hover:bg-pa-earth hover:border-pa-earth"
          : "bg-white border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark",
      )}
    >
      {selected ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <Plus className="w-4 h-4" />}
    </button>
  );
}

/** A linha de opção — a anatomia única da secção (serviços, detalhes e experiências). */
function OptionRow({
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
  const name = t(`checkout.extras.${item.sku}.name`);
  const desc = t(`checkout.extras.${item.sku}.desc`, { defaultValue: "" });

  const unitSuffix = (): string => {
    switch (item.pricingModel) {
      case "per_stay": return t("checkout.perStay", "per stay");
      case "per_day": return t("checkout.perDay", "per day");
      case "per_person": return t("checkout.perPerson", "per person");
      case "per_unit":
        return item.sku.startsWith("transfer")
          ? t("checkout.perTrip", "per trip")
          : item.unitKey === "cleaning"
            ? t("checkout.perCleaning", "per cleaning")
            : item.sku === "pet-fee"
              ? t("checkout.perPetStay", "per pet · stay")
              : t("checkout.perChange", "per change");
      case "per_person_per_unit":
        return item.unitKey === "hour" ? t("checkout.perPersonHour", "per child · hour") : t("checkout.perPersonSession", "per person · session");
      case "per_person_per_day": return t("checkout.perPersonDay", "per person · day");
      default: return "";
    }
  };

  // Segunda linha: a descrição; depois de adicionar, o resumo da seleção.
  // Serviços com confirmação do concierge dizem-no logo aqui, antes de adicionar.
  const secondLine = selected && !onRequest && item.pricingModel !== "per_stay"
    ? selectionSummary(item, sel!, amount, lang, t)
    : [desc, !selected && item.fulfillment === "needs_confirmation" ? t("checkout.confirm24h", "Confirmed within 2 hours") : ""]
        .filter(Boolean)
        .join(" · ");

  const hasSteppers = selected && !onRequest && item.pricingModel !== "per_stay";

  return (
    <div className={cn("px-4 py-3.5 sm:px-5 transition-colors", selected && "bg-pa-warm", item.parentSku && "pl-9 sm:pl-10")}>
      <div className="flex items-center gap-3">
        {item.photo ? (
          <img
            src={item.photo}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            decoding="async"
            className="w-12 h-12 rounded-md object-cover shrink-0 bg-pa-sand"
            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 body-sm font-medium text-pa-dark leading-snug">
            {selected && <Check className="w-3.5 h-3.5 text-pa-gold shrink-0" strokeWidth={2.5} />}
            <span className="min-w-0">{name}</span>
          </p>
          {secondLine ? (
            <p className={cn("caption leading-snug mt-0.5", selected && !onRequest ? "text-pa-dark" : "text-pa-stone-aa")}>{secondLine}</p>
          ) : null}
        </div>
        <div className="shrink-0 flex items-center gap-2 sm:gap-3">
          <div className="text-right max-w-[9.5rem] sm:max-w-none">
            {onRequest ? (
              item.priceFrom != null ? (
                <>
                  <p className="body-sm text-pa-dark tabular-nums">{t("checkout.fromPrice", { price: formatEur(item.priceFrom, lang) })}</p>
                  <p className="caption text-pa-stone-aa">{t("checkout.noChargeNow", "no charge now")}</p>
                </>
              ) : (
                <p className="caption text-pa-stone-aa max-w-[120px] leading-snug">{t("checkout.conciergeQuote", "Quoted by your concierge")}</p>
              )
            ) : item.pricingModel === "included_selectable" ? (
              <>
                <p className="eyebrow font-medium tracking-[0.1em] uppercase text-pa-gold">{t("checkout.included.badge")}</p>
                {/* No telemóvel a regra do extra fica na linha da seleção ("2× · 25 €") */}
                <p className="caption text-pa-stone-aa hidden sm:block">{t("checkout.firstIncluded", { price: formatEur(item.unitPrice!, lang) })}</p>
              </>
            ) : (
              <>
                {/* No telemóvel a unidade desce para a linha de baixo: ao lado
                    do preço espremia o nome do item ("Bringing a / pet") */}
                <p className="body-sm text-pa-dark tabular-nums leading-snug">
                  {formatEur(item.unitPrice!, lang)}
                  <span className="caption text-pa-stone-aa block sm:inline">
                    <span className="hidden sm:inline"> / </span>
                    {unitSuffix()}
                  </span>
                </p>
                {item.minPeople ? (
                  <p className="caption text-pa-stone-aa">{t("checkout.minPeople", { count: item.minPeople })}</p>
                ) : null}
              </>
            )}
          </div>
          <ToggleButton
            selected={selected}
            label={`${selected ? t("checkout.remove", "Remove") : onRequest ? t("checkout.request", "Request") : t("checkout.add", "Add")}: ${name}`}
            onClick={() => onToggle(item)}
          />
        </div>
      </div>

      {/* Steppers compactos quando adicionado; a fórmula do preço à direita */}
      {hasSteppers && (
        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-4 flex-wrap">
            {item.pricingModel === "per_day" && (
              <div className="flex items-center gap-2"><span className="caption text-pa-stone-aa">{t("checkout.daysLabel", "Days")}</span>
                <Stepper value={sel!.days ?? 1} min={1} max={Math.max(1, nights)} onChange={(v) => onAdjust(item.sku, { days: v })} ariaLabel={t("checkout.daysLabel", "Days")} /></div>
            )}
            {item.pricingModel === "included_selectable" && (
              <div className="flex items-center gap-2"><span className="caption text-pa-stone-aa">{t("checkout.qtyLabel", "Quantity")}</span>
                <Stepper value={sel!.qty ?? 1} min={item.minQty ?? 1} max={item.maxQty ?? 3} onChange={(v) => onAdjust(item.sku, { qty: v })} ariaLabel={t("checkout.qtyLabel", "Quantity")} /></div>
            )}
            {item.pricingModel === "per_unit" && (
              <div className="flex items-center gap-2"><span className="caption text-pa-stone-aa">{item.sku.startsWith("transfer") ? t("checkout.tripsLabel", "Trips") : t("checkout.qtyLabel", "Quantity")}</span>
                <Stepper value={sel!.qty ?? 1} min={item.minQty ?? 1} max={item.maxQty ?? 10} onChange={(v) => onAdjust(item.sku, { qty: v })} ariaLabel={t("checkout.qtyLabel", "Quantity")} /></div>
            )}
            {(item.pricingModel === "per_person" || item.pricingModel === "per_person_per_unit" || item.pricingModel === "per_person_per_day") && (
              <div className="flex items-center gap-2"><span className="caption text-pa-stone-aa">{t("checkout.peopleLabel", "People")}</span>
                <Stepper value={sel!.people ?? item.minPeople ?? Math.min(guests, 30)} min={item.minPeople ?? 1} max={30} onChange={(v) => onAdjust(item.sku, { people: v })} ariaLabel={t("checkout.peopleLabel", "People")} /></div>
            )}
            {item.pricingModel === "per_person_per_day" && (
              <>
                <div className="flex items-center gap-2"><span className="caption text-pa-stone-aa">{t("checkout.daysLabel", "Days")}</span>
                  <Stepper value={sel!.days ?? 1} min={1} max={Math.max(1, nights)} onChange={(v) => onAdjust(item.sku, { days: v })} ariaLabel={t("checkout.daysLabel", "Days")} /></div>
                <button
                  type="button"
                  onClick={() => onAdjust(item.sku, { days: Math.max(1, nights) })}
                  className={cn(
                    "caption text-inherit h-8 px-3 rounded-full border transition-colors",
                    (sel!.days ?? 1) === Math.max(1, nights)
                      ? "border-pa-dark bg-pa-dark text-white"
                      : "border-pa-sand bg-white text-pa-earth hover:border-pa-dark",
                  )}
                >
                  {t("checkout.allDays", "Every day")}
                </button>
              </>
            )}
            {item.pricingModel === "per_person_per_unit" && (
              <div className="flex items-center gap-2"><span className="caption text-pa-stone-aa">{item.unitKey === "hour" ? t("checkout.hoursLabel", "Hours") : t("checkout.sessionsLabel", "Sessions")}</span>
                <Stepper value={sel!.sessions ?? 1} min={1} max={10} onChange={(v) => onAdjust(item.sku, { sessions: v })} ariaLabel={t("checkout.sessionsLabel", "Sessions")} /></div>
            )}
          </div>
          {(() => {
            const f = priceFormula(item, sel!, lang, t);
            return f ? (
              <span className="caption text-pa-earth tabular-nums">
                {f}{amount != null && amount > 0 ? ` = ${formatEur(amount, lang)}` : ""}
              </span>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

/** A chegada: escolha obrigatória da receção em duas linhas rádio (spec §5.2). */
function ReceptionRows({
  config, choice, lang, onChoose, nudge,
}: {
  config: ReceptionConfig;
  choice: ReceptionChoice;
  lang: string;
  onChoose: (c: ReceptionChoice) => void;
  nudge?: boolean;
}) {
  const { t } = useTranslation();
  const Row = ({
    selected, name, value, desc, onClick,
  }: { selected: boolean; name: string; value: React.ReactNode; desc: string; onClick: () => void }) => (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn("w-full text-left px-4 py-3.5 sm:px-5 flex items-start gap-3 transition-colors", selected ? "bg-pa-warm" : "hover:bg-pa-cream")}
    >
      <span
        aria-hidden
        className={cn(
          "mt-[3px] w-4 h-4 shrink-0 rounded-full border flex items-center justify-center",
          selected ? "border-pa-dark" : "border-pa-stone-aa",
        )}
      >
        {selected && <span className="w-2 h-2 rounded-full bg-pa-dark" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block body-sm font-medium text-pa-dark leading-snug">{name}</span>
        <span className="block caption text-pa-stone-aa leading-snug mt-0.5">{desc}</span>
      </span>
      <span className="shrink-0 pt-0.5">{value}</span>
    </button>
  );

  return (
    <div id="reception-choice" className="scroll-mt-[150px]">
      <div
        role="radiogroup"
        aria-label={t("checkout.reception.prompt")}
        className={cn(
          "rounded-lg border divide-y overflow-hidden transition-shadow",
          nudge && !choice ? "border-pa-gold ring-1 ring-pa-gold divide-pa-sand" : "border-pa-sand divide-pa-sand",
        )}
      >
        <Row
          selected={choice?.type === "self"}
          name={t("checkout.reception.self.name")}
          value={<span className="eyebrow font-medium tracking-[0.1em] uppercase text-pa-gold">{t("checkout.included.badge")}</span>}
          desc={t("checkout.reception.self.desc")}
          onClick={() => onChoose({ type: "self" })}
        />
        <Row
          selected={choice?.type === "hosted"}
          name={t("checkout.reception.hosted.name")}
          value={
            <span className="body-sm text-pa-dark tabular-nums">
              {formatEur(choice?.type === "hosted" && choice?.late ? config.hostedLatePrice : config.hostedPrice, lang)}
            </span>
          }
          desc={`${t("checkout.reception.hosted.desc")} ${t("checkout.reception.lateNote", { hour: config.lateFromHour, price: formatEur(config.hostedLatePrice, lang) })}`}
          onClick={() => onChoose({ type: "hosted", late: choice?.type === "hosted" ? choice.late : false })}
        />
        {choice?.type === "hosted" && (
          <div className="flex items-center gap-2 px-4 py-2.5 sm:px-5 bg-pa-warm">
            <span className="caption text-pa-earth">{t("checkout.reception.arrivalWindow")}</span>
            {[false, true].map((late) => (
              <button
                key={String(late)}
                type="button"
                onClick={() => onChoose({ type: "hosted", late })}
                aria-pressed={(choice?.late ?? false) === late}
                className={cn(
                  "caption text-inherit h-8 px-3 rounded-full border transition-colors",
                  (choice?.late ?? false) === late
                    ? "border-pa-dark bg-pa-dark text-white"
                    : "border-pa-sand bg-white text-pa-earth hover:border-pa-dark",
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
      {nudge && !choice ? (
        <p className="caption text-pa-dark mt-2" role="alert">{t("checkout.reception.required")}</p>
      ) : null}
    </div>
  );
}

export default function CustomizeStep({
  catalog, reception, receptionChoice, selection, nights, guests, lang, defaultAirport,
  onToggle, onAdjust, onChooseReception, receptionNudge,
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
  destination?: string;
  defaultAirport?: "porto" | "lisbon";
  onToggle: (item: CatalogExtra) => void;
  onAdjust: (sku: string, patch: ExtraSelection) => void;
  onChooseReception: (c: ReceptionChoice) => void;
  onSkip?: () => void;
  /** true quando o hóspede tentou continuar sem escolher a receção */
  receptionNudge?: boolean;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const [airportOverride, setAirportOverride] = useState<"porto" | "lisbon" | null>(null);

  const rowProps = { lang, guests, nights, onToggle, onAdjust };
  const visibleChild = (i: CatalogExtra) => !i.parentSku || selection[i.parentSku] != null;

  // 2. Detalhes da estadia: berço, cadeira, animal (+ kit e comida com a taxa escolhida)
  const detailRows = catalog.filter((i) => isStayDetail(i) && visibleChild(i));

  // 3. Serviços: transfers em par Porto/Lisboa (B2) com um só selector de aeroporto
  const pairFor = (skus: string[]) => {
    const found = skus.map((k) => catalog.find((i) => i.sku === k)).filter(Boolean) as CatalogExtra[];
    return found.length === 2 ? found : null;
  };
  const carPair = pairFor(["transfer-porto", "transfer-lisbon"]);
  const vanPair = pairFor(["transfer-porto-van", "transfer-lisbon-van"]);
  const pairs = [carPair, vanPair].filter(Boolean) as CatalogExtra[][];
  const pairedSkus = new Set(pairs.flat().map((i) => i.sku));
  const selectedAirport = pairs.some(([p, l]) => selection[(p.sku.includes("porto") ? l : p).sku] != null)
    ? "lisbon"
    : pairs.some(([p, l]) => selection[(p.sku.includes("porto") ? p : l).sku] != null)
      ? "porto"
      : null;
  const shownAirport: "porto" | "lisbon" = selectedAirport ?? airportOverride ?? defaultAirport ?? "porto";
  const switchAirport = (to: "porto" | "lisbon") => {
    if (to === shownAirport) return;
    for (const pair of pairs) {
      const porto = pair[0].sku.includes("porto") ? pair[0] : pair[1];
      const lisbon = porto === pair[0] ? pair[1] : pair[0];
      const from = to === "lisbon" ? porto : lisbon;
      const target = to === "lisbon" ? lisbon : porto;
      const prev = selection[from.sku];
      if (prev) {
        onToggle(from);
        onToggle(target);
        if (prev.qty && prev.qty > 1) onAdjust(target.sku, { qty: prev.qty });
      }
    }
    setAirportOverride(to);
  };
  const transferRows = pairs.map((pair) => {
    const porto = pair[0].sku.includes("porto") ? pair[0] : pair[1];
    const lisbon = porto === pair[0] ? pair[1] : pair[0];
    return shownAirport === "lisbon" ? lisbon : porto;
  });
  // Transfers avulsos (uma só região no catálogo curado) seguem como linhas normais
  const looseTransfers = catalog.filter((i) => i.sku.startsWith("transfer") && !pairedSkus.has(i.sku));

  // O resto dos serviços, pela ordem da curadoria do servidor (rank) e do catálogo
  const serviceRows = catalog
    .map((item, idx) => ({ item, idx }))
    .filter(({ item }) => !isStayDetail(item) && item.chapter !== "experiences" && !item.sku.startsWith("transfer") && visibleChild(item))
    .sort((a, b) => (a.item.rank ?? Number.MAX_SAFE_INTEGER) - (b.item.rank ?? Number.MAX_SAFE_INTEGER) || a.idx - b.idx)
    .map(({ item }) => item);
  const shortList = SHORT_LIST.map((sku) => serviceRows.find((i) => i.sku === sku)).filter(Boolean) as CatalogExtra[];
  const topServices = shortList.length ? shortList : serviceRows.slice(0, TOP_SERVICES);
  const moreServices = serviceRows.filter((i) => !topServices.includes(i));
  const experiences = [...catalog.filter((i) => i.chapter === "experiences")].sort(
    (a, b) => Number(!!b.photo) - Number(!!a.photo),
  );
  const hiddenRows = [...transferRows, ...looseTransfers, ...moreServices, ...experiences];
  // Regra "curados ∪ escolhidos": um item do catálogo completo que já foi
  // adicionado (retoma, ?case=full, ou escolhido e lista fechada a seguir)
  // continua à vista na lista curta, com os seus steppers.
  const expanded = showAll;
  const pinnedRows = expanded ? [] : hiddenRows.filter((i) => selection[i.sku] != null);
  // O número do botão conta só o que ainda não está à vista
  const hiddenCount = hiddenRows.length - pinnedRows.length;
  // A nota das cobranças (preço fechado hoje, confirmação com reembolso, sob
  // orçamento sem cobrança) fica sempre à vista: o chef, visível por defeito,
  // é um serviço com confirmação.
  const chargeNoteVisible = topServices.length > 0 || pinnedRows.length > 0 || expanded;

  return (
    <div className="space-y-6">
      {reception && (
        <Group label={t("checkout.chapter.arrival.title")} hint={t("checkout.reception.prompt")}>
          <ReceptionRows config={reception} choice={receptionChoice} lang={lang} onChoose={onChooseReception} nudge={receptionNudge} />
        </Group>
      )}

      {detailRows.length > 0 && (
        <Group label={t("checkout.stayDetails.title")}>
          <div className="rounded-lg border border-pa-sand divide-y divide-pa-sand overflow-hidden">
            {detailRows.map((item) => (
              <OptionRow key={item.sku} item={item} sel={selection[item.sku]} {...rowProps} />
            ))}
          </div>
        </Group>
      )}

      {(transferRows.length > 0 || looseTransfers.length > 0 || serviceRows.length > 0 || experiences.length > 0) && (
        <Group label={t("conversion.optionalServices")}>
          <div className="rounded-lg border border-pa-sand divide-y divide-pa-sand overflow-hidden">
            {topServices.map((item) => (
              <OptionRow key={item.sku} item={item} sel={selection[item.sku]} {...rowProps} />
            ))}
            {pinnedRows.map((item) => (
              <OptionRow key={item.sku} item={item} sel={selection[item.sku]} {...rowProps} />
            ))}
            {expanded && transferRows.length > 0 && (
              <div className="px-4 py-2.5 sm:px-5 flex items-center justify-between gap-2 bg-pa-cream">
                <span className="caption text-pa-earth">{t("checkout.arrivalAirport", "Arrival airport")}</span>
                <div className="flex items-center gap-1.5" role="group" aria-label={t("checkout.arrivalAirport", "Arrival airport")}>
                  {(["porto", "lisbon"] as const).map((ap) => (
                    <button
                      key={ap}
                      type="button"
                      onClick={() => switchAirport(ap)}
                      aria-pressed={shownAirport === ap}
                      className={cn(
                        "caption text-inherit h-8 px-3 rounded-full border transition-colors",
                        shownAirport === ap
                          ? "border-pa-dark bg-pa-dark text-white"
                          : "border-pa-sand bg-white text-pa-earth hover:border-pa-dark",
                      )}
                    >
                      {ap === "porto" ? t("checkout.airportPorto", "Porto") : t("checkout.airportLisbon", "Lisbon")}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {expanded && transferRows.map((item) => (
              <OptionRow key={item.sku} item={item} sel={selection[item.sku]} {...rowProps} />
            ))}
            {expanded && looseTransfers.map((item) => (
              <OptionRow key={item.sku} item={item} sel={selection[item.sku]} {...rowProps} />
            ))}
            {expanded && moreServices.map((item) => (
              <OptionRow key={item.sku} item={item} sel={selection[item.sku]} {...rowProps} />
            ))}
            {expanded && experiences.length > 0 && (
              <div className="px-4 py-2.5 sm:px-5 bg-pa-cream">
                <span className="caption text-pa-earth">{t("checkout.chapter.experiences.title")}</span>
              </div>
            )}
            {expanded && experiences.map((item) => (
              <OptionRow key={item.sku} item={item} sel={selection[item.sku]} {...rowProps} />
            ))}
          </div>

          {hiddenRows.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-2 inline-flex items-center gap-1 min-h-11 caption font-medium text-pa-gold-aa hover:text-pa-dark underline underline-offset-2 transition-colors"
            >
              {showAll ? t("reviews.showFewer") : `${t("checkout.seeAll", "See all services")} (${hiddenCount})`}
              {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
          {chargeNoteVisible && (
            <p className="caption text-pa-stone-aa leading-relaxed mt-3">{t("checkout.extrasChargeNote")}</p>
          )}
        </Group>
      )}
    </div>
  );
}
