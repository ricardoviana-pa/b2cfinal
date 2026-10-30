/**
 * Bloco pré-contratual (DL 24/2014, arts. 4.º e 5.º; spec das duas partes,
 * 4.1, ponto 5): imediatamente acima do botão final do método escolhido, em
 * todos os planos e métodos. Compacto e formal: a empresa (denominação e
 * NIPC, mais a sede quando estiver confirmada em shared/company.ts), o preço
 * total, o plano de pagamento numa linha ("X hoje · Y em <data>" ou "X
 * hoje"), a frase da política de cancelamento (a única do ecrã, reutilizada
 * daqui) e a nota de que não há direito de livre resolução de 14 dias.
 */
import { useTranslation } from "react-i18next";
import { COMPANY_LEGAL_NAME, COMPANY_NIPC, companyAddressLine } from "@shared/company";
import { formatQuotedEur } from "@/lib/format";
import CancellationPolicyLine from "@/components/booking/CancellationPolicyLine";

/** A linha do plano, fora do componente para o teste: "X hoje" ou "X hoje · Y em <data>". */
export function paymentPlanLine(
  t: (key: string, options?: Record<string, unknown>) => string,
  p: { lang: string; amountNow: number; amountLater?: number | null; laterDate?: string | null },
): string {
  const amountNow = formatQuotedEur(p.amountNow, p.lang);
  if (p.amountLater && p.amountLater > 0 && p.laterDate) {
    return t("checkout.legal.paySplit", { amountNow, amountLater: formatQuotedEur(p.amountLater, p.lang), date: p.laterDate });
  }
  return t("checkout.legal.payFull", { amount: amountNow });
}

export default function PreContractualBlock({
  lang,
  total,
  amountNow,
  amountLater,
  laterDate,
  policyCode,
  checkIn,
  showPolicy,
}: {
  lang: string;
  /** Preço total da reserva (o Total do resumo). */
  total: number;
  /** O que se cobra hoje (igual ao total em "tudo agora"). */
  amountNow: number;
  /** Duas partes: a 2.ª cobrança e a sua data (já formatada). */
  amountLater?: number | null;
  laterDate?: string | null;
  policyCode: unknown;
  checkIn: string;
  /** A frase da política só se escreve quando há tarifa conhecida (como antes). */
  showPolicy: boolean;
}) {
  const { t } = useTranslation();
  const address = companyAddressLine();
  return (
    <div className="space-y-1 border-t border-pa-sand pt-3" data-testid="checkout-precontractual">
      <p className="caption text-pa-stone-aa leading-snug">
        {t("checkout.legal.operator", { company: COMPANY_LEGAL_NAME, nipc: COMPANY_NIPC })}
        {address ? ` · ${address}` : ""}
      </p>
      <p className="caption text-pa-dark leading-snug tabular-nums">
        {t("checkout.legal.total", { total: formatQuotedEur(total, lang) })} · {paymentPlanLine(t, { lang, amountNow, amountLater, laterDate })}
      </p>
      {showPolicy && (
        <CancellationPolicyLine code={policyCode} checkIn={checkIn} lang={lang} className="caption text-pa-earth leading-snug" />
      )}
      <p className="caption text-pa-stone-aa leading-snug">{t("checkout.legal.noWithdrawal")}</p>
    </div>
  );
}
