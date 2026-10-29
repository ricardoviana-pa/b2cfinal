/**
 * Um só aviso de pagamento falhado para cartão, Apple Pay / Google Pay,
 * PayPal e Klarna (auditoria do funil, out/2026, n.º 4): a mensagem humana e
 * até três saídas.
 *   (a) "Pagar em duas partes (X hoje)": só numa recusa pelo limite do
 *       cartão, com a oferta do servidor e o hóspede em "tudo agora";
 *   (b) "Usar outro cartão ou método";
 *   (c) "Falar com o concierge": WhatsApp com a casa e as datas escritas
 *       (nunca dados do cartão). O clique conta como whatsapp_click pelo
 *       data-track-source (installContactClickTracking).
 * As ações que cada erro permite vêm de paymentErrorActions.
 */
import { useTranslation } from "react-i18next";
import { paymentErrorActions, type PaymentErrorInfo } from "@/lib/paymentErrors";

export interface PaymentErrorView {
  message: string;
  /** Sem classificação (cartão do widget antigo): só a mensagem. */
  info?: PaymentErrorInfo;
}

export interface TwoPartsSwitch {
  /** O valor de hoje em duas partes, já formatado ("1 350,00 €"). */
  amountNow: string;
  onSelect: () => void;
}

const ACTION =
  "pa-action inline-flex items-center justify-center px-3 rounded-md border border-pa-sand bg-white caption font-medium text-pa-dark hover:border-pa-dark transition-colors";

export default function PaymentErrorNotice({
  error,
  plan,
  twoParts,
  onUseOtherMethod,
  conciergeHref,
}: {
  error: PaymentErrorView;
  plan?: "full" | "two_parts";
  twoParts?: TwoPartsSwitch | null;
  onUseOtherMethod?: () => void;
  conciergeHref?: string;
}) {
  const { t } = useTranslation();
  const allowed = error.info
    ? paymentErrorActions(error.info, { twoPartsOffered: !!twoParts, plan })
    : { twoParts: false, otherMethod: false, concierge: false };
  const showTwoParts = allowed.twoParts && !!twoParts;
  const showOther = allowed.otherMethod && !!onUseOtherMethod;
  const showConcierge = allowed.concierge && !!conciergeHref;
  return (
    <div role="alert" className="p-3 bg-[#F5F1EB] border border-[#DC2626] rounded-md space-y-2.5">
      <div className="flex items-start gap-2">
        <span className="text-red-700 mt-0.5 shrink-0" aria-hidden>&#9888;</span>
        <p className="text-red-700 text-sm leading-snug whitespace-pre-line">{error.message}</p>
      </div>
      {(showTwoParts || showOther || showConcierge) && (
        <div className="flex flex-wrap gap-2 sm:pl-6">
          {showTwoParts && (
            <button type="button" onClick={twoParts!.onSelect} className={ACTION}>
              {t("payment.errorActions.twoParts", { amountNow: twoParts!.amountNow })}
            </button>
          )}
          {showOther && (
            <button type="button" onClick={onUseOtherMethod} className={ACTION}>
              {plan === "two_parts" ? t("payment.errorActions.otherCard") : t("payment.errorActions.otherMethod")}
            </button>
          )}
          {showConcierge && (
            <a
              href={conciergeHref}
              target="_blank"
              rel="noopener noreferrer"
              data-track-source="checkout_payment_failed"
              className={ACTION}
            >
              {t("payment.errorActions.concierge")}
            </a>
          )}
        </div>
      )}
    </div>
  );
}
