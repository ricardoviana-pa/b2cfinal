/**
 * Flex — remarcação garantida (spec §6). UI-first (Fase 3 UX; ledger de
 * créditos chega com a Fase 3 completa).
 *
 * NUNCA usar a palavra "seguro" em nenhuma língua — é uma opção tarifária do
 * operador (questão legal ASF). O bloco é visualmente distinto dos extras
 * (moldura dourada fina, ícone de calendário): isto é proteção, não serviço.
 *
 * Coerência com a política de cancelamento: são camadas diferentes. A política
 * da tarifa rege o cancelamento com reembolso em dinheiro; o Flex acrescenta o
 * direito de remarcar com crédito para lá dessa janela — e o copy muda com a
 * tarifa selecionada para tornar isso explícito.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Check, ChevronRight, RefreshCw, Shield, Wallet } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatEur, formatBookingDate } from "@/lib/format";
import { pushDL } from "@/lib/datalayer";

export interface FlexConfig {
  price: number;
  minTotal: number;
  rescheduleDaysBefore: number;
  creditMonths: number;
}

export default function FlexBlock({
  config,
  selected,
  stayTotal,
  nonRefundableSelected,
  freeCancelUntil,
  lang,
  listingId,
  demo,
  onToggle,
}: {
  config: FlexConfig;
  selected: boolean;
  stayTotal: number;
  /** true when the chosen rate plan is non-refundable — drives the contextual copy */
  nonRefundableSelected: boolean;
  /** concrete free-cancellation deadline (YYYY-MM-DD) of a flexible rate, if any */
  freeCancelUntil: string | null;
  lang: string;
  listingId?: string;
  demo?: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { t } = useTranslation();
  const [rulesOpen, setRulesOpen] = useState(false);
  const viewedRef = useRef(false);

  // GA4: flex_viewed — once per mount when the block is actually shown
  useEffect(() => {
    if (viewedRef.current || demo) return;
    viewedRef.current = true;
    pushDL({ event: "flex_viewed", property_id: listingId, value: config.price });
  }, [demo, listingId, config.price]);

  if (stayTotal < config.minTotal) return null;

  const contextualCopy = nonRefundableSelected
    ? t("checkout.flex.copyNonRefundable", {
        days: config.rescheduleDaysBefore,
      })
    : freeCancelUntil
      ? t("checkout.flex.copyFlexible", {
          date: formatBookingDate(freeCancelUntil, lang, true),
          days: config.rescheduleDaysBefore,
        })
      : t("checkout.flex.copyNonRefundable", { days: config.rescheduleDaysBefore });

  const benefits = [
    { icon: RefreshCw, text: t("checkout.flex.benefit1", { days: config.rescheduleDaysBefore }) },
    { icon: Shield, text: t("checkout.flex.benefit2") },
    { icon: Wallet, text: t("checkout.flex.benefit3", { months: config.creditMonths }) },
  ];

  const rules: string[] = [
    t("checkout.flex.rule1", { days: config.rescheduleDaysBefore }),
    t("checkout.flex.rule2"),
    t("checkout.flex.rule3", { months: config.creditMonths }),
    t("checkout.flex.rule4"),
    t("checkout.flex.rule5"),
    t("checkout.flex.rule6"),
  ];

  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-5 transition-all",
        selected ? "border-pa-gold ring-1 ring-pa-gold" : "border-pa-gold/50",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "shrink-0 w-10 h-10 rounded-md flex items-center justify-center transition-colors",
            selected ? "bg-pa-gold text-white" : "bg-pa-warm text-pa-gold",
          )}
        >
          <CalendarClock className="w-5 h-5" strokeWidth={1.8} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[17px] text-pa-dark leading-snug">
            {t("checkout.flex.title", "Flex — guaranteed rebooking")}
          </p>
          <p className="text-[12.5px] text-pa-earth mt-0.5">
            {t("checkout.flex.tagline", "Rebook whenever you need. The amount you paid is never lost.")}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[15px] text-pa-dark font-medium tabular-nums">{formatEur(config.price, lang)}</p>
          <p className="text-[10px] text-pa-stone-aa">{t("checkout.flex.perBooking", "one-time, per booking")}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {benefits.map(({ icon: Icon, text }, i) => (
          <div key={i} className="flex items-center gap-2 text-[12.5px] text-pa-earth">
            <Icon className="w-3.5 h-3.5 text-pa-gold shrink-0" strokeWidth={1.8} />
            {text}
          </div>
        ))}
      </div>

      {/* Contextual coherence line — changes with the selected rate plan */}
      <p className="mt-3 text-[12px] leading-relaxed text-pa-dark bg-pa-warm border border-pa-sand rounded-md px-3 py-2.5">
        {contextualCopy}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="inline-flex items-center gap-0.5 text-[12px] text-pa-gold hover:text-pa-dark transition-colors underline underline-offset-2"
        >
          {t("checkout.flex.howItWorks", "How it works")}
          <ChevronRight className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !selected;
            onToggle(next);
            if (!demo) {
              pushDL({ event: next ? "flex_added" : "flex_removed", property_id: listingId, value: config.price });
            }
          }}
          aria-pressed={selected}
          className={cn(
            "min-h-[40px] px-5 rounded-full border text-[11px] font-medium tracking-[0.08em] uppercase transition-colors",
            selected
              ? "bg-pa-gold border-pa-gold text-white"
              : "border-pa-gold text-pa-gold hover:bg-pa-gold hover:text-white",
          )}
        >
          {selected ? (
            <span className="inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5" /> {t("checkout.flex.added", "Added")}
            </span>
          ) : (
            t("checkout.flex.add", "Add Flex")
          )}
        </button>
      </div>

      {/* Rules modal */}
      <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
        <DialogContent className="max-w-[480px] bg-white">
          <div className="space-y-4">
            <div>
              <p className="font-display text-[20px] text-pa-dark">
                {t("checkout.flex.title", "Flex — guaranteed rebooking")}
              </p>
              <p className="text-[12.5px] text-pa-earth mt-1">
                {formatEur(config.price, lang)} · {t("checkout.flex.perBooking", "one-time, per booking")}
              </p>
            </div>
            <ol className="space-y-2.5">
              {rules.map((rule, i) => (
                <li key={i} className="flex gap-2.5 text-[12.5px] leading-relaxed text-pa-earth">
                  <span className="shrink-0 w-4 h-4 rounded-full bg-pa-warm text-pa-gold text-[10px] flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  {rule}
                </li>
              ))}
            </ol>
            {/* Honesty rule: cash refund inside the free-cancellation window is a
                right — Flex never replaces it (spec §6) */}
            <p className="text-[12px] leading-relaxed text-pa-dark bg-pa-warm border border-pa-sand rounded-md px-3 py-2.5">
              {t("checkout.flex.honesty")}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
