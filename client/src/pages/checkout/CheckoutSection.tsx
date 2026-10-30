/**
 * Secção do checkout numa só página (29 out 2026).
 *
 * As três etapas (estadia, extras, pagamento) deixam de ser ecrãs separados
 * com um stepper no cabeçalho e passam a secções numeradas na mesma página,
 * como num checkout de referência (Indie Campers): só a secção activa está
 * aberta; uma concluída colapsa numa linha com ✓, um resumo e "Editar"; uma
 * futura é só o número e o título, em cinza.
 *
 * É apresentação pura: o estado (`step`), a sincronização com o intent e os
 * handlers continuam todos no CheckoutPage.
 */
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckoutSectionState = "open" | "done" | "todo";

export default function CheckoutSection({
  id,
  index,
  title,
  state,
  summary,
  editLabel,
  onEdit,
  children,
  className,
}: {
  id: string;
  index: number;
  title: string;
  state: CheckoutSectionState;
  /** Linha de resumo de uma secção concluída ("28 Nov → 3 Dez · 4 hóspedes · Tarifa reembolsável"). */
  summary?: ReactNode;
  editLabel?: string;
  onEdit?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  const open = state === "open";
  const done = state === "done";
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      data-state={state}
      aria-current={open ? "step" : undefined}
      className={cn("bg-white border border-pa-sand rounded-xl scroll-mt-[76px]", className)}
    >
      <div className={cn("flex items-center gap-3 px-4 sm:px-5", open ? "pt-5 pb-4" : "py-4")}>
        <span
          aria-hidden
          className={cn(
            "w-6 h-6 shrink-0 rounded-full flex items-center justify-center caption text-inherit tabular-nums",
            done
              ? "bg-pa-dark text-white"
              : open
                ? "border border-pa-dark text-pa-dark"
                : "border border-pa-sand text-pa-stone-aa",
          )}
        >
          {done ? <Check className="w-3 h-3" strokeWidth={2.5} /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={`${id}-title`}
            className={cn(
              open ? "font-display headline-sm text-pa-dark leading-tight" : "body-sm font-medium text-inherit",
              !open && (done ? "text-pa-dark" : "text-pa-stone-aa"),
            )}
          >
            {title}
          </h2>
          {done && summary ? <p className="caption text-pa-earth leading-snug line-clamp-2 mt-0.5">{summary}</p> : null}
        </div>
        {done && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`${editLabel}: ${title}`}
            className="shrink-0 min-h-[44px] px-2 -mr-2 caption font-medium text-pa-gold-aa underline underline-offset-2 hover:text-pa-dark transition-colors"
          >
            {editLabel}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="border-t border-pa-sand px-4 sm:px-5 pt-5 pb-5 checkout-step-in">{children}</div>
      ) : null}
    </section>
  );
}
