/* ==========================================================================
   EXPERIENCE BOOKING CARD — sticky right rail
   Embeds the Bókun booking widget (calendar + participants + checkout) inline
   using the official BokunWidgetsLoader embed method for seamless checkout.
   Fallback: WhatsApp prefill when Bókun not configured or no activityId.
   ========================================================================== */

import { useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, MessageCircle } from 'lucide-react';
import BokunCalendarWidget from './BokunCalendarWidget';
import { pushEcommerce } from '@/lib/datalayer';

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
  // Tracking
  experienceSlug?: string;
  experienceCategory?: string;
  priceOta?: number;
}

const WHATSAPP_NUMBER = '351927161771';
const BOKUN_CHANNEL_UUID = import.meta.env.VITE_BOKUN_CHANNEL_UUID || 'a283fa3e-a892-41cd-a775-036ac351a454';

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
  experienceSlug,
  experienceCategory,
  priceOta,
}: ExperienceBookingCardProps) {
  const { t } = useTranslation();
  const hasBokun = !!bokunActivityId && !!BOKUN_CHANNEL_UUID;

  useEffect(() => {
    if (!hasBokun || !experienceSlug) return;
    // Only fire on desktop — card is CSS-hidden (not unmounted) on mobile,
    // so without this guard it would double-fire alongside the mobile bar click.
    if (window.matchMedia('(max-width: 1023px)').matches) return;
    pushEcommerce({
      event: 'begin_checkout',
      ecommerce: {
        currency: 'EUR',
        value: priceOta || 0,
        items: [{
          item_id: `EXP-${experienceSlug}`,
          item_name: experienceName,
          item_category: experienceCategory || '',
          price: priceOta || 0,
          quantity: 1,
        }],
      },
    });
  // Fires once per slug/hasBokun pair — price/name changes must not re-fire.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasBokun, experienceSlug]);

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

      {/* Bókun inline calendar widget (checkout opens in Bókun modal overlay) */}
      {hasBokun ? (
        <div className="bg-white">
          <BokunCalendarWidget
            bokunActivityId={bokunActivityId!}
            experienceName={experienceName}
            style={{ minHeight: '480px' }}
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
            onClick={() => {
              if (!experienceSlug) return;
              pushEcommerce({
                event: 'begin_checkout',
                ecommerce: {
                  currency: 'EUR',
                  value: priceOta || 0,
                  items: [{
                    item_id: `EXP-${experienceSlug}`,
                    item_name: experienceName,
                    item_category: experienceCategory || '',
                    price: priceOta || 0,
                    quantity: 1,
                  }],
                },
              });
            }}
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
              <MessageCircle className="w-3 h-3" /> {t('experience.messageWhatsApp', 'Message us on WhatsApp to book')}
            </a>
          </p>
        </div>
      )}

      {/* Trust signals */}
      <div className="px-7 py-5 border-t border-[#E8E4DC]">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5 text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>
            <Check className="w-3.5 h-3.5 text-[#6B8E4E] shrink-0" />
            <span>{t('experience.freeCancellation', 'Free cancellation up to {{hours}}h before', { hours: freeCancellationHours })}</span>
          </div>
          {reserveNowPayLater && (
            <div className="flex items-center gap-2.5 text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>
              <Check className="w-3.5 h-3.5 text-[#6B8E4E] shrink-0" />
              <span>{t('experience.reserveNowPayLater', 'Reserve now, pay later')}</span>
            </div>
          )}
          <div className="flex items-center gap-2.5 text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>
            <Check className="w-3.5 h-3.5 text-[#6B8E4E] shrink-0" />
            <span>{t('experience.instantConfirmation', 'Instant confirmation')}</span>
          </div>
        </div>
        {hasBokun && (
          <p className="text-center text-[12px] text-[#9E9A90] mt-4" style={{ fontWeight: 300 }}>
            {t('experience.orLabel', 'or')}{' '}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#8B7355] hover:text-[#1A1A18] transition-colors"
            >
              <MessageCircle className="w-3 h-3" /> {t('experience.messageWhatsAppShort', 'message us on WhatsApp')}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
