/**
 * Pagamento em duas partes, Fase 3: "Quando prefere pagar?" no passo do
 * pagamento (docs/pagamento_duas_partes.md 4.1, ponto 4).
 *
 * Os valores, as datas e o texto da autorização vêm TODOS do servidor
 * (getIntent.paymentPlan): o hash do mandato registado no createCardCharge é
 * o deste texto, por isso mostra-se tal como vem. "Pagar tudo agora" vem
 * pré-selecionado (nunca se pré-seleciona a opção que cria uma cobrança
 * futura) e a caixa da autorização nunca vem marcada.
 */
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatQuotedEur } from "@/lib/format";

export type PaymentPlanChoice = "full" | "two_parts";

/** O que o getIntent devolve em `paymentPlan` quando a opção existe. */
export type PaymentPlanOffer = {
  available: true;
  policyCode: string;
  incentive: "flex" | "discount" | "none";
  fullTodayCents: number;
  depositCents: number;
  depositStayCents: number;
  balanceCents: number;
  chargeAt: string;
  retryAt: string[];
  freeCancelDeadlineAt: string;
  hardStopAt: string;
  mandate: { lang: string; checkbox: string; text: string; version: string };
};

const INTL: Record<string, string> = {
  en: "en-GB", pt: "pt-PT", fr: "fr-FR", es: "es-ES", it: "it-IT", de: "de-DE", nl: "nl-NL", sv: "sv-SE", fi: "fi-FI",
};

/** "28 de junho de 2027", no fuso de Lisboa (a data da cobrança é de Lisboa). */
export function planDate(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(INTL[lang] ?? "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Lisbon",
  }).format(new Date(iso));
}

/**
 * Autorização da 2.ª parte (spec 6.2): o texto do servidor tal como vem (é o
 * que fica registado) e uma caixa separada da dos Termos, nunca pré-marcada.
 * Vive mesmo acima do botão de pagar, junto aos Termos e à frase de política
 * (auditoria do funil, out/2026, n.º 1); a dica fica junto à caixa enquanto
 * não estiver marcada.
 */
export function MandateConsent({
  offer,
  accepted,
  onChange,
  id = "checkout-mandate",
}: {
  offer: PaymentPlanOffer;
  accepted: boolean;
  onChange: (v: boolean) => void;
  id?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      {/* Texto do servidor, tal como vem: é o que fica registado. */}
      <p className="caption text-pa-earth leading-relaxed whitespace-pre-line">{offer.mandate.text}</p>
      <label className="flex items-start gap-2 cursor-pointer select-none">
        <input
          id={id}
          type="checkbox"
          checked={accepted}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={accepted ? undefined : `${id}-hint`}
          className="mt-0.5 w-4 h-4 accent-black border-pa-sand rounded"
        />
        <span className="caption text-pa-dark leading-snug">{offer.mandate.checkbox}</span>
      </label>
      {!accepted && (
        <p id={`${id}-hint`} className="caption text-pa-earth leading-snug pl-6">
          {t("payment.mandateMissing", "Tick the authorisation above to continue.")}
        </p>
      )}
    </div>
  );
}

export function PaymentPlanSelector({
  offer,
  plan,
  onPlanChange,
  lang,
}: {
  offer: PaymentPlanOffer;
  plan: PaymentPlanChoice;
  onPlanChange: (p: PaymentPlanChoice) => void;
  lang: string;
}) {
  const { t } = useTranslation();
  const eur = (cents: number) => formatQuotedEur(cents / 100, lang);
  const date = planDate(offer.chargeAt, lang);
  const flexIncluded = offer.incentive === "flex";

  const option = (id: PaymentPlanChoice, label: string, sub: string, notes: string[]) => (
    <label
      className={cn(
        "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
        // A mesma anatomia dos cartões de tarifa e das linhas de receção (29 out 2026)
        plan === id ? "border-pa-dark ring-1 ring-pa-dark bg-pa-warm" : "border-pa-sand bg-white hover:border-pa-dark",
      )}
    >
      <input
        type="radio"
        name="payment-plan"
        value={id}
        checked={plan === id}
        onChange={() => onPlanChange(id)}
        className="mt-1 w-4 h-4 accent-black"
      />
      <span className="min-w-0">
        <span className="block body-md font-medium text-pa-dark">{label}</span>
        <span className="block body-sm text-pa-dark mt-0.5">{sub}</span>
        {notes.map((n) => (
          <span key={n} className="block caption text-pa-earth mt-1 leading-snug">{n}</span>
        ))}
      </span>
    </label>
  );

  return (
    <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-3">
      <p className="eyebrow font-medium tracking-[0.12em] uppercase text-pa-gold">
        {t("checkout.payPlan.title", "When would you like to pay?")}
      </p>
      <div className="space-y-2" role="radiogroup" aria-label={t("checkout.payPlan.title", "When would you like to pay?")}>
        {option(
          "full",
          t("checkout.payPlan.full.label", "Pay everything now"),
          flexIncluded
            ? t("checkout.payPlan.full.sub", { total: eur(offer.fullTodayCents) })
            : t("checkout.payPlan.full.subPlain", { total: eur(offer.fullTodayCents) }),
          flexIncluded ? [t("checkout.payPlan.full.flexNote", "What you paid is never lost. Same cancellation policy.")] : [],
        )}
        {option(
          "two_parts",
          t("checkout.payPlan.split.label", "Pay in two parts"),
          t("checkout.payPlan.split.sub", { amountNow: eur(offer.depositCents), amountLater: eur(offer.balanceCents), date }),
          [
            t("checkout.payPlan.split.noFees", "At the price shown, no extra cost."),
            t("checkout.payPlan.split.whatToday", "Today you pay half of the stay, plus any extras and Flex you chose."),
          ],
        )}
      </div>

      {/* A autorização da 2.ª parte vive junto ao botão de pagar (MandateConsent). */}
      {plan === "two_parts" && (
        <div className="border-t border-pa-sand pt-3">
          <p className="caption text-pa-stone-aa leading-snug flex items-start gap-1.5">
            <Check className="w-3 h-3 mt-0.5 text-pa-gold shrink-0" />
            {t("checkout.payPlan.split.walletNote", "Apple Pay and Google Pay pay the whole stay today. To pay in two parts, use your card.")}
          </p>
        </div>
      )}
    </div>
  );
}
