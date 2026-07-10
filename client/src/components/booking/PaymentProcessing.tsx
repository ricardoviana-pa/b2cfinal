import { Loader2, AlertCircle, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import Header from "@/components/layout/Header";

/**
 * Branded interstitial shown on the PayPal/Klarna return pages while the
 * payment is verified and the reservation is created. Renders an "in progress"
 * state with a spinner + indeterminate progress bar, or a terminal failure
 * state when `failed` is true.
 */
export default function PaymentProcessing({
  status,
  failed = false,
  title,
}: {
  status: string;
  failed?: boolean;
  title?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <section className="flex items-center justify-center px-5 py-20 md:py-28">
        <div className="w-full max-w-[440px] rounded-[18px] border border-[#E8E4DC] bg-white p-8 text-center shadow-[0_1px_2px_rgba(20,20,20,0.04),0_18px_50px_rgba(26,26,24,0.07)] md:p-10">
          <div
            className={`mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full ${
              failed ? "bg-[#fdecec]" : "bg-[#F5F1EB]"
            }`}
          >
            {failed ? (
              <AlertCircle className="h-7 w-7 text-[#DC2626]" strokeWidth={1.8} />
            ) : (
              <Loader2 className="h-7 w-7 animate-spin text-[#8B7355]" strokeWidth={1.8} />
            )}
          </div>

          <h1 className="headline-md mb-2 text-[#1A1A18]">
            {title || (failed ? t("paymentReturn.failedTitle") : t("paymentReturn.processingTitle"))}
          </h1>
          <p className="body-sm mx-auto max-w-[340px] text-[#6b6860]">{status}</p>

          {!failed && (
            <>
              <div className="relative mx-auto mt-7 h-1.5 w-full overflow-hidden rounded-full bg-[#EFEBE3]">
                <span className="progress-indeterminate" />
              </div>
              <div className="mt-6 flex items-center justify-center gap-2 text-[12px] text-[#9E9A90]">
                <ShieldCheck className="h-3.5 w-3.5 text-[#8B7355]" strokeWidth={1.8} />
                {t("paymentReturn.secureNote")}
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
