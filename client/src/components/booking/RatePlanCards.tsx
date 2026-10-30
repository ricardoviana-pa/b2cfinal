/**
 * Escolha da tarifa, no widget da casa e no passo 1 do checkout: dois cartões
 * de opção claros (decisão do Ricardo, 29 out 2026, "mais e-commerce, com os
 * valores"). Cada cartão: nome da tarifa, uma linha de benefício
 * (cancelamento gratuito até <data> / sem reembolso), o total da estadia e,
 * na não reembolsável, o total da reembolsável riscado com "Poupe X €". A
 * linha "pode pagar em duas partes" fica debaixo do cartão reembolsável
 * quando a estadia a merece. Estado escolhido evidente; rádios nativos
 * (teclado: setas e espaço), o cartão inteiro é o rótulo. Sem urgência.
 *
 * As regras (benefício, poupança, candidata às duas partes) estão em
 * client/src/lib/rateCards.ts; a tarifa pré-selecionada vem de
 * shared/ratePlanDefault.ts (a reembolsável, quando existe).
 */
import type { Ref } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBookingDate, formatQuotedEur } from "@/lib/format";
import { cancellationPolicyCopy, cancellationPolicyPath } from "@/lib/cancellation";
import { hasVerifiedRefundAdvantage } from "@/lib/ratePlanRecommendation";
import { rateCardModels, type RateCardModel, type RateCardOption } from "@/lib/rateCards";
import TwoPartsHint from "./TwoPartsHint";

export default function RatePlanCards<T extends RateCardOption>({
  options,
  selectedId,
  onSelect,
  checkIn,
  lang,
  name,
  columns = 1,
  twoPartsVariant = null,
  selectedRef,
  containerRef,
  className,
}: {
  options: readonly T[];
  selectedId: string | null;
  onSelect: (option: T, model: RateCardModel<T>) => void;
  checkIn: string;
  lang: string;
  /** Nome do grupo de rádios (um por ecrã). */
  name: string;
  /** 2 = lado a lado a partir de 640 px (coluna do checkout); 1 = empilhados (widget). */
  columns?: 1 | 2;
  /** Linha das duas partes debaixo do cartão reembolsável: "widget" (página da casa) ou "rate" (passo 1). */
  twoPartsVariant?: "widget" | "rate" | null;
  /** Widget: o cartão escolhido fica à vista por cima do RESERVE (bookingCardReveal). */
  selectedRef?: Ref<HTMLLabelElement>;
  containerRef?: Ref<HTMLDivElement>;
  className?: string;
}) {
  const { t } = useTranslation();
  const copy = cancellationPolicyCopy(lang);
  const models = rateCardModels(options, checkIn);
  const policyLink = (code: Parameters<typeof cancellationPolicyPath>[1], label: string) => (
    <a
      href={cancellationPolicyPath(lang, code)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="underline underline-offset-2 hover:text-pa-dark"
    >
      {label}
    </a>
  );

  return (
    <div ref={containerRef} className={cn("space-y-2", className)}>
      <p className="eyebrow font-medium tracking-[0.12em] uppercase text-pa-gold-aa">{t("bookingWidget.ratePlan", "Rate plan")}</p>
      <div role="radiogroup" aria-label={t("bookingWidget.ratePlan", "Rate plan")} className={cn("grid gap-2", columns === 2 && "sm:grid-cols-2")}>
        {models.map((m) => {
          const selected = selectedId === m.ratePlanId;
          const nonRef = m.kind === "non_refundable";
          const label =
            m.kind === "non_refundable"
              ? t("booking.nonRefundable")
              : m.kind === "refundable"
                ? t("booking.flexibleRate")
                : t("bookingConfirm.rate");
          const benefitId = `rate-${name}-${m.ratePlanId}-benefit`;
          const recommended = !nonRef && hasVerifiedRefundAdvantage(m.option, options, checkIn);
          return (
            <label
              key={m.ratePlanId}
              ref={selected ? selectedRef : undefined}
              data-testid="rate-card"
              data-selected={selected ? "true" : "false"}
              className={cn(
                "relative flex flex-col gap-2.5 rounded-lg border bg-white p-4 cursor-pointer transition-colors",
                selected ? "border-pa-dark ring-1 ring-pa-dark" : "border-pa-sand hover:border-pa-gold",
              )}
            >
              <input
                type="radio"
                name={name}
                value={m.ratePlanId}
                checked={selected}
                onChange={() => onSelect(m.option, m)}
                aria-describedby={benefitId}
                className="peer sr-only"
              />
              {/* Anel de foco do teclado no cartão inteiro (o rádio é invisível) */}
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-lg ring-2 ring-pa-dark ring-offset-2 opacity-0 peer-focus-visible:opacity-100" />
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
                      selected ? "border-pa-dark bg-pa-dark" : "border-pa-stone-aa bg-white",
                    )}
                  >
                    {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="body-sm text-pa-dark font-medium leading-snug">{label}</p>
                      {recommended && (
                        <span className="eyebrow font-medium tracking-wider uppercase px-1.5 py-0.5 bg-pa-warm text-pa-gold-aa border border-pa-sand rounded-sm">
                          {t("bookingWidget.recommended", "Recommended")}
                        </span>
                      )}
                    </div>
                    <p id={benefitId} className={cn("caption mt-0.5 leading-snug", nonRef ? "text-pa-earth" : "text-pa-dark")}>
                      {m.kind === "refundable" && m.freeUntil
                        ? t("booking.freeCancellation", { date: formatBookingDate(m.freeUntil, lang, true) })
                        : nonRef
                          ? policyLink("non_refundable", t("checkout.rateCard.noRefund", "No refund if you cancel"))
                          : (
                            <>
                              {copy.unknown} {policyLink(m.policyCode, copy.termsLink)}
                            </>
                          )}
                    </p>
                  </div>
                </div>
                <p className="body-md text-pa-dark font-medium tabular-nums leading-tight shrink-0 text-right">{formatQuotedEur(m.total, lang)}</p>
              </div>
              {/* A poupança numa linha própria, à direita, debaixo do benefício: dentro
                  da coluna do preço empurrava o título para ~70 px a 360 px em alemão
                  ("Nicht erstattungsfähig" entrava pelo preço) e dividia o benefício em
                  três linhas. Assim o título e o benefício têm a largura toda. */}
              {m.savings > 0 && m.compareTotal != null && (
                <p className="caption -mt-1 leading-snug flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                  <s className="text-pa-stone-aa tabular-nums">{formatQuotedEur(m.compareTotal, lang)}</s>
                  <span className="inline-flex items-center rounded-full border border-pa-sand bg-pa-warm px-2 py-0.5 eyebrow font-medium tracking-[0.08em] uppercase text-pa-gold-aa whitespace-nowrap">
                    {t("bookingWidget.save", "Save")} {formatQuotedEur(m.savings, lang)}
                  </span>
                </p>
              )}
              {twoPartsVariant && m.twoPartsCandidate && (
                <TwoPartsHint
                  variant={twoPartsVariant}
                  checkIn={checkIn}
                  policyCode={m.policyCode}
                  stayTotal={m.total}
                  className="caption text-pa-dark leading-snug border-t border-pa-sand pt-2"
                />
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
