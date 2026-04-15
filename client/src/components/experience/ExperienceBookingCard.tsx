/* ==========================================================================
   EXPERIENCE BOOKING CARD — sticky right rail
   Embeds the Bókun booking widget (calendar + participants + checkout) inline.
   Fallback: WhatsApp prefill when Bókun not configured or no activityId.
   ========================================================================== */

import { useMemo } from 'react';
import { Check, MessageCircle } from 'lucide-react';

interface ExperienceBookingCardProps {
  experienceName: string;
  priceFrom: number;
  priceLabel?: string;
  duration?: string;
  freeCancellationHours?: number;
  reserveNowPayLater?: boolean;
  whatsappMessage: string;
  maxGroupSize?: number;
  bokunActivityId?: number;
}

const WHATSAPP_NUMBER = '351927161771';
const BOKUN_CHANNEL_UUID = import.meta.env.VITE_BOKUN_CHANNEL_UUID as string | undefined;

export default function ExperienceBookingCard({
  experienceName,
  priceFrom,
  priceLabel,
  duration,
  freeCancellationHours = 24,
  reserveNowPayLater = true,
  whatsappMessage,
  maxGroupSize = 10,
  bokunActivityId,
}: ExperienceBookingCardProps) {
  const hasBokun = !!bokunActivityId && !!BOKUN_CHANNEL_UUID;

  const widgetSrc = hasBokun
    ? `https://widgets.bokun.io/online-sales/${BOKUN_CHANNEL_UUID}/experience/${bokunActivityId}`
    : '';

  const finalMessage = useMemo(() => {
    let msg = whatsappMessage || `Hi Portugal Active, I'd like to book the ${experienceName} experience.`;
    msg += `\nParticipants: 2 adults`;
    msg += `\nEstimated total: €${priceFrom * 2}`;
    return msg;
  }, [whatsappMessage, experienceName, priceFrom]);

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(finalMessage)}`;

  return (
    <div className="bg-[#F5F1EB] border border-[#E8E4DC]">
      {/* Price headline */}
      <div className="px-7 pt-7 pb-5 border-b border-[#E8E4DC]">
        <p className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium mb-1">From</p>
        <p className="text-[28px] font-display text-[#1A1A18] leading-none">
          €{priceFrom}
          <span className="text-[12px] text-[#9E9A90] ml-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
            / person
          </span>
        </p>
        {duration && (
          <p className="text-[11px] text-[#6B6860] mt-2" style={{ fontWeight: 300 }}>
            {duration} · Private experience
          </p>
        )}
      </div>

      {/* Bókun inline widget */}
      {hasBokun ? (
        <div className="bg-white">
          <iframe
            key={`${bokunActivityId}-${BOKUN_CHANNEL_UUID}`}
            src={widgetSrc}
            title={`Book ${experienceName}`}
            className="w-full border-0"
            style={{ minHeight: '480px', height: '520px' }}
            allow="payment *; clipboard-write"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          />
        </div>
      ) : (
        <div className="px-7 py-6">
          {/* WhatsApp CTA fallback */}
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase py-4 hover:bg-black transition-colors mb-3"
            style={{ minHeight: '52px' }}
          >
            Check availability
          </a>
          <p className="text-center text-[12px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#8B7355] hover:text-[#1A1A18] transition-colors"
            >
              <MessageCircle className="w-3 h-3" /> Message us on WhatsApp to book
            </a>
          </p>
        </div>
      )}

      {/* Trust signals */}
      <div className="px-7 py-5 border-t border-[#E8E4DC]">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>
            <Check className="w-3.5 h-3.5 text-[#6B8E4E] shrink-0" />
            <span>Free cancellation up to {freeCancellationHours}h before</span>
          </div>
          {reserveNowPayLater && (
            <div className="flex items-center gap-2.5 text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>
              <Check className="w-3.5 h-3.5 text-[#6B8E4E] shrink-0" />
              <span>Reserve now, pay later</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>
            <Check className="w-3.5 h-3.5 text-[#6B8E4E] shrink-0" />
            <span>Instant confirmation</span>
          </div>
        </div>
        {hasBokun && (
          <p className="text-center text-[12px] text-[#9E9A90] mt-4" style={{ fontWeight: 300 }}>
            or{' '}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#8B7355] hover:text-[#1A1A18] transition-colors"
            >
              <MessageCircle className="w-3 h-3" /> message us on WhatsApp
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
