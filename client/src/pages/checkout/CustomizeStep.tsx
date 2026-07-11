/**
 * Checkout 2.0 — passo "Personalizar" na direção CONFIGURADOR
 * (docs/checkout_fase2_1_polish.md, substitui a grelha de cards fotográficos).
 *
 * Referência Apple: capítulos que funcionam como atos (título serif grande,
 * overline numerada, uma linha editorial), opções como LINHAS TIPOGRÁFICAS
 * dentro de um cartão por grupo com hairlines, e quase nenhuma imagem.
 *
 * Política de imagem (2.1 §4): máximo 5 fotos no passo inteiro — a casa vive
 * no resumo lateral; aqui só o chef (destaque 3.3) e 3 experiências (3.4).
 * Proibido stock e imagem gerada; sku sem asset aprovado rende como linha.
 *
 * Orientação: nav de capítulos sticky com scrollspy + "Saltar personalização".
 * Motion: entrada de capítulo com fade e subida de 12px em 300ms, uma vez,
 * respeitando prefers-reduced-motion. Sem parallax, sem efeitos.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  Minus,
  Plus,
  Clock3,
  ChevronDown,
  MessageCircle,
  BedDouble,
  Gift,
  BadgeCheck,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatEur } from "@/lib/format";

export type ExtraChapter = "arrival" | "home" | "table" | "wellness" | "experiences";

export interface CatalogExtra {
  sku: string;
  chapter: ExtraChapter;
  pricingModel: "per_stay" | "per_day" | "per_person" | "per_unit" | "per_person_per_unit" | "on_request";
  fulfillment: "instant" | "needs_confirmation" | "on_request";
  unitPrice?: number;
  priceFrom?: number;
  minQty?: number;
  maxQty?: number;
  minPeople?: number;
  popular?: boolean;
  photo?: string;
  feature?: boolean;
  rank?: number;
  suggestedQty?: number;
  suggestedDays?: number;
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

export const EXTRA_CHAPTERS: ExtraChapter[] = ["arrival", "home", "table", "wellness", "experiences"];

/** Altura somada dos dois headers fixos: top bar do checkout (61px) + nav de capítulos (~45px). */
const STICKY_OFFSET = 106;

/** Linhas visíveis por grupo antes de "Ver mais" (2.1 §1 e critério 6). */
const GROUP_VISIBLE: Record<ExtraChapter, number> = {
  arrival: 3,
  home: 2,
  table: 2,
  wellness: 2,
  experiences: 3,
};

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
    <div className="flex items-center gap-2" aria-label={ariaLabel}>
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

/** Entrada de capítulo: fade + subida 12px, 300ms, uma vez (2.1 §5). */
function ChapterReveal({ children, className, id }: { children: React.ReactNode; className?: string; id?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      // Trigger antecipado (fixes 12 jul §3): revela 240px antes de entrar no
      // viewport — em scroll rápido a secção já está visível quando o hóspede
      // chega, eliminando o "ecrã vazio" da secção por revelar.
      { rootMargin: "0px 0px 240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <section ref={ref as any} id={id} className={cn("chapter-reveal", shown && "chapter-reveal-in", className)}>
      {children}
    </section>
  );
}

/** Cabeçalho de capítulo (2.1 §2): overline numerada + serif grande + linha. */
function ChapterHeader({ num, chapter }: { num: string; chapter: ExtraChapter }) {
  const { t } = useTranslation();
  return (
    <div className="mb-8">
      <p className="text-[12px] font-medium tracking-[0.14em] uppercase text-pa-gold mb-2.5">
        {t("checkout.chapterLabel", { num })}
      </p>
      <h2 className="font-display font-normal text-[32px] lg:text-[48px] leading-[1.05] text-pa-dark">
        {t(`checkout.chapter.${chapter}.title`)}
      </h2>
      <p className="text-[16px] lg:text-[17px] text-pa-earth mt-2.5">{t(`checkout.chapter.${chapter}.line`)}</p>
    </div>
  );
}

/** 3.1 Receção: par de cartões tipográficos iguais, semântica radio, sem imagem. */
function ReceptionChoiceCards({
  config, choice, lang, onChoose,
}: {
  config: ReceptionConfig;
  choice: ReceptionChoice;
  lang: string;
  onChoose: (c: ReceptionChoice) => void;
}) {
  const { t } = useTranslation();

  const Card = ({
    selected, name, value, desc, onClick,
  }: { selected: boolean; name: string; value: React.ReactNode; desc: string; onClick: () => void }) => (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        "text-left rounded-lg p-5 transition-all",
        selected
          ? "border-[1.5px] border-pa-dark bg-pa-warm"
          : "border border-pa-sand bg-white hover:border-pa-gold",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[15px] font-medium text-pa-dark">
          {selected && (
            <span className="w-[18px] h-[18px] rounded-full bg-pa-dark flex items-center justify-center shrink-0">
              <Check className="w-3 h-3 text-white" />
            </span>
          )}
          {name}
        </span>
        {value}
      </div>
      <p className="text-[13px] text-pa-earth leading-snug mt-2">{desc}</p>
    </button>
  );

  return (
    <div id="reception-choice" className="space-y-2.5 scroll-mt-[150px]">
      <p className="text-[13px] text-pa-earth">{t("checkout.reception.prompt")}</p>
      <div role="radiogroup" className="grid sm:grid-cols-2 gap-3">
        <Card
          selected={choice?.type === "self"}
          name={t("checkout.reception.self.name")}
          value={<span className="text-[11px] font-medium tracking-[0.1em] uppercase text-pa-gold shrink-0">{t("checkout.included.badge")}</span>}
          desc={t("checkout.reception.self.desc")}
          onClick={() => onChoose({ type: "self" })}
        />
        <Card
          selected={choice?.type === "hosted"}
          name={t("checkout.reception.hosted.name")}
          value={
            <span className="text-[15px] text-pa-dark tabular-nums shrink-0">
              {formatEur(choice?.type === "hosted" && choice?.late ? config.hostedLatePrice : config.hostedPrice, lang)}
            </span>
          }
          desc={t("checkout.reception.hosted.desc")}
          onClick={() => onChoose({ type: "hosted", late: choice?.type === "hosted" ? choice.late : false })}
        />
      </div>

      {choice?.type === "hosted" && (
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

/** Resumo curto da seleção para a linha adicionada ("2 mudas · 90 €"). */
function selectionSummary(item: CatalogExtra, sel: ExtraSelection, amount: number | null, lang: string, t: any): string {
  const bits: string[] = [];
  if (sel.days) bits.push(`${sel.days} ${String(t("checkout.daysLabel", "Days")).toLowerCase()}`);
  if (sel.qty) bits.push(`${sel.qty}×`);
  if (sel.people) bits.push(`${sel.people} ${String(t("checkout.peopleLabel", "People")).toLowerCase()}`);
  if (sel.sessions && sel.sessions > 1) bits.push(`${sel.sessions} ${String(t("checkout.sessionsLabel", "Sessions")).toLowerCase()}`);
  if (amount != null) bits.push(formatEur(amount, lang));
  return bits.join(" · ");
}

/** 3.2 Linha de opção — a anatomia única do passo. */
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
    <div className={cn("px-5 py-4 transition-colors", selected && "bg-pa-warm")}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {item.popular && (
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-1">
              {t("checkout.mostChosen", "Most chosen")}
            </p>
          )}
          <p className="flex items-center gap-1.5 text-[15px] font-medium text-pa-dark">
            {selected && <Check className="w-3.5 h-3.5 text-pa-gold shrink-0" strokeWidth={2.5} />}
            {t(`checkout.extras.${item.sku}.name`)}
          </p>
          <p className={cn("text-[13px] leading-snug mt-0.5", selected && !onRequest ? "text-pa-dark" : "text-pa-earth")}>
            {selected && !onRequest
              ? selectionSummary(item, sel!, amount, lang, t)
              : t(`checkout.extras.${item.sku}.desc`)}
          </p>
          {item.fulfillment === "needs_confirmation" && !selected && (
            <p className="inline-flex items-center gap-1 text-[10.5px] text-pa-stone-aa mt-1">
              <Clock3 className="w-2.5 h-2.5" /> {t("checkout.confirm24h", "Confirmed within 24h")}
            </p>
          )}
        </div>

        <div className="shrink-0 text-right">
          {onRequest ? (
            <p className="text-[12px] text-pa-stone-aa max-w-[130px]">{t("checkout.conciergeQuote", "Quoted by your concierge")}</p>
          ) : (
            <p className="text-[14px] text-pa-dark tabular-nums">
              {formatEur(item.unitPrice!, lang)}{" "}
              <span className="text-[12px] text-pa-stone-aa">/ {unitSuffix()}</span>
            </p>
          )}
          {item.minPeople ? (
            <p className="text-[11px] text-pa-stone-aa">{t("checkout.minPeople", { count: item.minPeople })}</p>
          ) : null}
          {!selected && (
            <button
              type="button"
              onClick={() => onToggle(item)}
              className="mt-1.5 min-h-[44px] sm:min-h-[32px] px-4 rounded-full border border-pa-sand bg-white text-[11px] font-medium tracking-[0.08em] uppercase text-pa-earth hover:border-pa-dark hover:text-pa-dark transition-colors"
            >
              {onRequest ? t("checkout.request", "Request") : t("checkout.add", "Add")}
            </button>
          )}
        </div>
      </div>

      {/* Steppers no lugar da pill quando adicionado (3.2) */}
      {selected && !onRequest && (
        <div className="flex items-center justify-between gap-4 mt-3 flex-wrap">
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
          <button
            type="button"
            onClick={() => onToggle(item)}
            className="text-[11px] text-pa-stone-aa hover:text-pa-dark underline underline-offset-2 transition-colors"
          >
            {t("checkout.remove", "Remove")}
          </button>
        </div>
      )}
      {/* Pedido sob orçamento adicionado: só o desfazer */}
      {selected && onRequest && (
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={() => onToggle(item)}
            className="text-[11px] text-pa-stone-aa hover:text-pa-dark underline underline-offset-2 transition-colors"
          >
            {t("checkout.remove", "Remove")}
          </button>
        </div>
      )}
    </div>
  );
}

/** 3.3 Destaque com imagem — só o chef, imagem 3:2 à esquerda a 40%. */
function FeatureCard(props: {
  item: CatalogExtra;
  sel: ExtraSelection | undefined;
  lang: string;
  guests: number;
  nights: number;
  onToggle: (item: CatalogExtra) => void;
  onAdjust: (sku: string, patch: ExtraSelection) => void;
}) {
  const { item } = props;
  return (
    <div
      className={cn(
        "rounded-lg overflow-hidden bg-white flex flex-col sm:flex-row transition-all",
        props.sel != null ? "border-[1.5px] border-pa-dark" : "border border-pa-sand",
      )}
    >
      <div className="sm:w-[40%] shrink-0 aspect-[3/2] sm:aspect-auto bg-pa-warm">
        <img src={item.photo} alt="" className="w-full h-full object-cover" loading="lazy" />
      </div>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <OptionRow {...props} />
      </div>
    </div>
  );
}

export default function CustomizeStep({
  catalog, included, reception, receptionChoice, selection, nights, guests, propertyName, lang,
  onToggle, onAdjust, onChooseReception, onSkip,
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
  onSkip: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeChapter, setActiveChapter] = useState<ExtraChapter>("arrival");

  // Scrollspy por posição de scroll (fixes 12 jul §2): o ativo é o ÚLTIMO
  // capítulo cujo título já passou o offset dos dois headers fixos — um e um
  // só, determinista em qualquer posição da página (bandas de interseção
  // permitiam dois ativos e falhavam no topo).
  useEffect(() => {
    const onScroll = () => {
      let current: ExtraChapter = EXTRA_CHAPTERS[0];
      for (const c of EXTRA_CHAPTERS) {
        const el = document.getElementById(`chapter-${c}`);
        if (el && el.getBoundingClientRect().top <= STICKY_OFFSET + 48) current = c;
      }
      setActiveChapter((prev) => (prev === current ? prev : current));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [catalog.length]);

  // Salto calculado (não scrollIntoView: frágil com dois headers sticky) —
  // deixa o título do capítulo visível logo abaixo da nav.
  const jumpTo = (chapter: ExtraChapter) => {
    const el = document.getElementById(`chapter-${chapter}`);
    if (!el) return;
    const target = Math.max(0, el.getBoundingClientRect().top + window.scrollY - STICKY_OFFSET - 16);
    window.scrollTo({ top: target, behavior: "smooth" });
    // O smooth scroll pode ser interrompido (rAF pausado, gesto do utilizador,
    // Safari antigo). Garante a chegada: se ao fim de 800ms estamos longe do
    // destino, completa de forma instantânea.
    window.setTimeout(() => {
      if (Math.abs(window.scrollY - target) > 60) window.scrollTo({ top: target, behavior: "auto" });
    }, 800);
  };

  const INCLUDED_ICONS: Record<string, typeof Check> = {
    concierge: MessageCircle,
    linen: BedDouble,
    welcome: Gift,
    bestRate: BadgeCheck,
  };

  // Única zona fotográfica do passo: 3 cartões com asset aprovado
  const expCards = catalog.filter((i) => i.chapter === "experiences" && i.photo).slice(0, 3);

  return (
    <div>
      <style>{`
        .chapter-reveal { opacity: 0; transform: translateY(12px); }
        .chapter-reveal-in { opacity: 1; transform: none; transition: opacity 300ms ease-out, transform 300ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .chapter-reveal { opacity: 1; transform: none; }
          .chapter-reveal-in { transition: none; }
        }
        .chapter-nav-scroll { scrollbar-width: none; }
        .chapter-nav-scroll::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Abertura: contexto + incluído numa linha discreta, sem caixa (2.1 §1.1) */}
      <p className="flex items-center gap-1.5 text-[12px] text-pa-gold">
        <Sparkles className="w-3.5 h-3.5" /> {t("checkout.curatedFor", { property: propertyName })}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mt-4 pb-1">
        {included.map((key) => {
          const Icon = INCLUDED_ICONS[key] ?? Check;
          return (
            <span key={key} className="inline-flex items-center gap-1.5 text-[12.5px] text-pa-earth">
              <Icon className="w-3.5 h-3.5 text-pa-gold" strokeWidth={1.8} />
              {t(`checkout.included.${key}`)}
            </span>
          );
        })}
      </div>

      {/* Nav de capítulos sticky com scrollspy + saltar (2.1 §1.2) */}
      <nav className="sticky top-[61px] z-30 -mx-1 px-1 mt-6 bg-pa-cream/95 backdrop-blur-sm border-b border-pa-sand">
        <div className="flex items-center justify-between gap-3">
          <div className="chapter-nav-scroll flex items-center gap-5 overflow-x-auto py-3">
            {EXTRA_CHAPTERS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => jumpTo(c)}
                className={cn(
                  "shrink-0 text-[12px] tracking-[0.02em] transition-colors pb-0.5 border-b",
                  activeChapter === c
                    ? "text-pa-dark border-pa-gold font-medium"
                    : "text-pa-stone-aa border-transparent hover:text-pa-dark",
                )}
              >
                {t(`checkout.chapter.${c}.title`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="shrink-0 text-[12px] text-pa-stone-aa hover:text-pa-dark underline underline-offset-2 transition-colors py-3"
          >
            {t("checkout.skipCustomize", "Skip personalization")}
          </button>
        </div>
      </nav>

      {/* Capítulos como atos: 96px+ antes de cada um (2.1 §2) */}
      {EXTRA_CHAPTERS.map((chapter, idx) => {
        const isArrival = chapter === "arrival";
        const isExperiences = chapter === "experiences";
        const chapterItems = catalog.filter((i) => i.chapter === chapter);
        if (!chapterItems.length && !(isArrival && reception)) return null;

        const featureItem = !isExperiences ? chapterItems.find((i) => i.feature && i.photo) : undefined;
        const rows = chapterItems.filter((i) => i !== featureItem);
        const isOpen = !!expanded[chapter];
        const visibleRows = isExperiences ? [] : isOpen ? rows : rows.slice(0, GROUP_VISIBLE[chapter]);
        const hiddenCount = isExperiences ? 0 : rows.length - visibleRows.length;

        return (
          <ChapterReveal key={chapter} id={`chapter-${chapter}`} className={cn("scroll-mt-[130px]", idx === 0 ? "mt-12" : "mt-24 lg:mt-28")}>
            <ChapterHeader num={String(idx + 1).padStart(2, "0")} chapter={chapter} />

            {/* Decisão primeiro (receção, cap 01) */}
            {isArrival && reception && (
              <div className="mb-6">
                <ReceptionChoiceCards config={reception} choice={receptionChoice} lang={lang} onChoose={onChooseReception} />
              </div>
            )}

            {/* Destaque com imagem (só chef, cap 03) */}
            {featureItem && (
              <div className="mb-3">
                <FeatureCard
                  item={featureItem}
                  sel={selection[featureItem.sku]}
                  lang={lang}
                  guests={guests}
                  nights={nights}
                  onToggle={onToggle}
                  onAdjust={onAdjust}
                />
              </div>
            )}

            {/* Grupo de opções: um cartão, linhas com hairlines (3.2) */}
            {!isExperiences && visibleRows.length > 0 && (
              <div className="bg-white border border-pa-sand rounded-lg divide-y divide-pa-sand overflow-hidden">
                {visibleRows.map((item) => (
                  <OptionRow
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
            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((prev) => ({ ...prev, [chapter]: true }))}
                className="mt-1 inline-flex items-center gap-1 min-h-[44px] text-[12px] text-pa-gold hover:text-pa-dark underline underline-offset-2 transition-colors"
              >
                {t("checkout.seeMore", { count: hiddenCount })} <ChevronDown className="w-3 h-3" />
              </button>
            )}

            {/* 3.4 Experiências: única zona fotográfica — 3 cartões reais */}
            {isExperiences && (
              <>
                <div className="flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto sm:overflow-visible snap-x pb-1">
                  {expCards.map((item) => {
                    const selected = selection[item.sku] != null;
                    return (
                      <div
                        key={item.sku}
                        className={cn(
                          "shrink-0 w-[70%] sm:w-auto snap-start rounded-lg overflow-hidden bg-white transition-all",
                          selected ? "border-[1.5px] border-pa-dark" : "border border-pa-sand",
                        )}
                      >
                        <div className="aspect-[3/2] bg-pa-warm relative">
                          <img src={item.photo} alt="" className="w-full h-full object-cover" loading="lazy" />
                          {selected && (
                            <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pa-dark flex items-center justify-center">
                              <Check className="w-3.5 h-3.5 text-white" />
                            </span>
                          )}
                        </div>
                        <div className="p-4">
                          <p className="text-[14px] font-medium text-pa-dark leading-snug">
                            {t(`checkout.extras.${item.sku}.name`)}
                          </p>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <p className="text-[12.5px] text-pa-earth">
                              {item.priceFrom != null
                                ? t("checkout.fromPrice", { price: formatEur(item.priceFrom, lang) })
                                : t("checkout.onRequestShort", "on request")}
                            </p>
                            <button
                              type="button"
                              onClick={() => onToggle(item)}
                              className={cn(
                                "min-h-[44px] sm:min-h-[30px] px-3.5 rounded-full border text-[10.5px] font-medium tracking-[0.08em] uppercase transition-colors",
                                selected
                                  ? "bg-pa-dark border-pa-dark text-white"
                                  : "border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark",
                              )}
                            >
                              {selected ? t("checkout.requested", "Requested") : t("checkout.request", "Request")}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <a
                  href={`/${lang}/experiences`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-[12px] text-pa-gold hover:text-pa-dark underline underline-offset-2 transition-colors"
                >
                  {t("checkout.seeAllExperiences")}
                </a>
              </>
            )}
          </ChapterReveal>
        );
      })}

      <p className="text-[11.5px] text-pa-stone-aa leading-relaxed mt-10">
        {t("checkout.extrasChargeNote")}
      </p>
    </div>
  );
}
