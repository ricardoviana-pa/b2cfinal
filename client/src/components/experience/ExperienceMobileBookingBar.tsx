/* ==========================================================================
   EXPERIENCE MOBILE BOOKING BAR — sticky bottom
   The same bar as a home's (PropertyDetail.tsx): the price on the left, the
   site's primary button on the right.
   Tap → opens the Bókun widget in the site's panel, a full-height sheet on a
   phone (BokunWidgetModal; checkout via Bókun's own window).
   Fallback: WhatsApp when Bókun is not configured.
   ========================================================================== */

import { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { preloadBokunWidgets } from './BokunCalendarWidget';
import BokunWidgetModal from './BokunWidgetModal';
import type { BokunOption } from './ExperienceBookingCard';
import { pushDL, pushEcommerce } from '@/lib/datalayer';
import { RISE_ABOVE_COOKIE_BANNER, publishBottomBarHeight } from '@/lib/fixedBottom';

interface ExperienceMobileBookingBarProps {
  experienceName: string;
  priceFrom: number;
  priceLabel?: string;
  whatsappMessage: string;
  maxGroupSize?: number;
  bokunActivityId?: number;
  /** Multiple rates/routes → the sheet lists them above the calendar. */
  bokunOptions?: BokunOption[];
  // Tracking
  experienceSlug?: string;
  experienceCategory?: string;
  priceOta?: number;
}

const WHATSAPP_NUMBER = '351927161771';
const BOKUN_CHANNEL_UUID = import.meta.env.VITE_BOKUN_CHANNEL_UUID || 'a283fa3e-a892-41cd-a775-036ac351a454';

export default function ExperienceMobileBookingBar({
  experienceName,
  priceFrom,
  priceLabel,
  whatsappMessage,
  maxGroupSize = 10,
  bokunActivityId,
  bokunOptions,
  experienceSlug,
  experienceCategory,
  priceOta,
}: ExperienceMobileBookingBarProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const bookButtonRef = useRef<HTMLButtonElement>(null);
  const hasBokun = !!bokunActivityId && !!BOKUN_CHANNEL_UUID;
  const isMultiOption = (bokunOptions?.length ?? 0) > 1;

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const finalMessage = useMemo(() => {
    let msg = whatsappMessage || `Hi Portugal Active, I'd like to book the ${experienceName} experience.`;
    msg += `\nParticipants: 2 adults`;
    return msg;
  }, [whatsappMessage, experienceName]);

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(finalMessage)}`;

  return (
    <>
      {/* Sticky bottom bar. Once shown it sits on the cookie banner while the
          banner is open; hidden, it stays off the screen. Its height keeps the
          footer's last row clear of it (lib/fixedBottom.ts). */}
      <div
        ref={publishBottomBarHeight}
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-pa-sand px-4 pt-3 transition-transform duration-300 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))', transform: visible ? RISE_ABOVE_COOKIE_BANNER : undefined }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* A price keeps its line; a long label or a long button text wraps. */}
          <div className={priceFrom > 0 ? 'shrink-0' : 'min-w-0'}>
            {priceFrom > 0 ? (
              <>
                <p className="eyebrow text-pa-stone">
                  {t('experience.from', 'From')}
                </p>
                <p className="mt-1.5 flex items-baseline gap-1">
                  <span className="text-[22px] font-light leading-none tracking-tight text-pa-dark tabular-nums">€{priceFrom}</span>
                  <span className="caption text-pa-stone">{t('experience.perPerson', '/ person')}</span>
                </p>
              </>
            ) : (
              <p className="body-sm font-medium text-pa-dark">
                {priceLabel || t('experience.priceOnRequest', 'Price on request')}
              </p>
            )}
          </div>
          {hasBokun ? (
            <button
              ref={bookButtonRef}
              type="button"
              // The supplier's script starts loading as the finger lands.
              onTouchStart={preloadBokunWidgets}
              onPointerEnter={preloadBokunWidgets}
              onFocus={preloadBokunWidgets}
              onClick={() => {
                if (experienceSlug) {
                  // Abre o widget Bókun; a compra acontece lá. Evento próprio
                  // para não contar como checkout de casa no GA4 e no Meta.
                  pushEcommerce({
                    event: 'experience_booking_open',
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
                }
                setWidgetOpen(true);
              }}
              className="btn-primary min-w-0"
            >
              {t('experience.bookNow', 'Book now')}
            </button>
          ) : (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary min-w-0"
              onClick={() => {
                if (!experienceSlug) return;
                // Abre o WhatsApp, não um checkout: conta como contacto
                pushDL({ event: 'whatsapp_click', source: 'experience_mobile_bar', item_id: `EXP-${experienceSlug}`, value: priceOta || 0 });
              }}
            >
              {t('experience.checkAvailability', 'Check availability')}
            </a>
          )}
        </div>
      </div>

      {/* The booking sheet: the site's panel around the Bókun calendar. A
          sibling of the bar, never inside it (the bar is lifted with a
          transform; lib/fixedBottom.ts). A multi-option activity lists its
          routes at the top (as the card does on a computer) so the guest
          sees each tour's schedule/price before the calendar. */}
      {hasBokun && (
        <BokunWidgetModal
          open={widgetOpen}
          onClose={() => setWidgetOpen(false)}
          bokunActivityId={bokunActivityId!}
          experienceName={experienceName}
          options={isMultiOption ? bokunOptions : undefined}
          whatsappHref={waHref}
          returnFocusTo={bookButtonRef}
        />
      )}
    </>
  );
}
