import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatEurCents } from "@/lib/format";
import { cancellationPolicyText } from "@/lib/cancellation";

export interface RatePlanCardOption {
  ratePlanId: string;
  name: string;
  type: "flexible" | "non_refundable" | "other";
  cancellationPolicy?: string[];
  /** Integer cents (legacy REST quote shape) — NOT euro floats */
  total: number;
}

interface RatePlanCardsProps {
  options: RatePlanCardOption[];
  selectedRatePlanId?: string;
  currency?: string;
  /** Check-in date (YYYY-MM-DD) — enables concrete cancel-by dates in policy text */
  checkIn?: string;
  onSelect: (ratePlanId: string, type: RatePlanCardOption["type"]) => void;
}

export default function RatePlanCards({
  options,
  selectedRatePlanId,
  currency = "EUR",
  checkIn,
  onSelect,
}: RatePlanCardsProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  if (!options.length) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {options.map((option) => {
        const title =
          option.type === "non_refundable"
            ? t('booking.nonRefundable', 'Non-refundable')
            : option.type === "flexible"
              ? t('booking.flexibleRate', 'Flexible rate')
              : option.name;

        return (
          <button
            key={option.ratePlanId}
            type="button"
            onClick={() => onSelect(option.ratePlanId, option.type)}
            className={cn(
              "rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5 text-left transition-all duration-200 ease-in-out",
              selectedRatePlanId === option.ratePlanId
                ? "border-[#8B7355] ring-2 ring-[#8B7355]"
                : "hover:border-[#8B7355]"
            )}
          >
            <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-3">{title}</p>
            <p className="text-[13px] text-[#6B6860] min-h-[40px]">
              {option.cancellationPolicy?.[0]
                ? cancellationPolicyText(option.cancellationPolicy[0], checkIn, t, lang)
                : (option.type === "non_refundable" ? t('booking.noCancellation', 'No cancellation') : t('booking.cancellationPerPolicy', 'Cancellation subject to listing policy'))}
            </p>
            <p className="headline-sm text-[#1A1A18] mt-4">{formatEurCents(option.total, lang)}</p>
            <span className="inline-flex mt-4 rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 min-h-[48px] items-center justify-center">
              {t('booking.select', 'Select')}
            </span>
          </button>
        );
      })}
    </div>
  );
}
