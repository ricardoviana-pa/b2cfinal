/**
 * Pagamento em duas partes, antes do checkout (spec 4.1, pontos 1 e 2): o
 * hóspede fica a saber logo que pode pagar metade agora. Os valores e a data
 * vêm do servidor (booking.twoPartsPreview, as mesmas regras do checkout);
 * sem oferta (flag desligada, tarifa NR, estadia curta ou em cima da data)
 * não aparece nada.
 */
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { formatQuotedEur } from "@/lib/format";
import { planDate } from "@/pages/checkout/PaymentPlanSelector";

export default function TwoPartsHint({
  checkIn,
  policyCode,
  stayTotal,
  variant,
  className,
}: {
  checkIn: string;
  policyCode: string | null;
  /** Total da estadia em euros (a tarifa reembolsável). */
  stayTotal: number;
  /** "widget": página da casa; "rate": card da tarifa no passo 1. */
  variant: "widget" | "rate";
  className?: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const stayCents = Math.round((stayTotal || 0) * 100);
  const enabled = !!checkIn && !!policyCode && policyCode !== "non_refundable" && stayCents > 0;
  const { data } = trpc.booking.twoPartsPreview.useQuery(
    { checkIn, policyCode: policyCode ?? "", stayCents },
    { enabled, staleTime: 10 * 60_000, retry: false },
  );
  if (!enabled || !data?.available) return null;
  const date = planDate(data.chargeAt, lang);
  const flex = data.incentive === "flex";
  const text = variant === "widget"
    ? t(flex ? "bookingWidget.twoPartsHint" : "bookingWidget.twoPartsHintPlain", { date })
    : t(flex ? "checkout.rate.twoPartsLine" : "checkout.rate.twoPartsLinePlain", {
        amountNow: formatQuotedEur(data.amountNowCents / 100, lang),
        amountLater: formatQuotedEur(data.amountLaterCents / 100, lang),
        date,
      });
  return <p className={className ?? "caption text-pa-earth leading-snug"}>{text}</p>;
}
