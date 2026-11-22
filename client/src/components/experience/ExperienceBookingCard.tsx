/* ==========================================================================
   EXPERIENCE BOOKING CARD — sticky right rail
   The same card as a home's booking card (BookingWidget.tsx): white, a light
   border, 12 px corners, the price, one dark button, the notes in grey.
   The button opens the Bókun booking widget (calendar + participants +
   checkout) in the site's panel (BokunWidgetModal) instead of showing the
   supplier's calendar raw in the page (decisão E14 da auditoria de design,
   20 nov 2026).
   Fallback: WhatsApp prefill when Bókun not configured or no activityId.
   ========================================================================== */

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, MessageCircle, ChevronRight } from 'lucide-react';
import { preloadBokunWidgets } from './BokunCalendarWidget';
import BokunWidgetModal from './BokunWidgetModal';
import { pushDL, pushEcommerce } from '@/lib/datalayer';

export interface BokunOption {
  name: string;
  detail?: string;
  priceFrom?: number;
}

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
  /** When the Bókun activity has multiple rates/routes, list them here. The
   *  card then shows the options, each a button that opens the panel with
   *  that option above the calendar. */
  bokunOptions?: BokunOption[];
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
  bokunOptions,
  experienceSlug,
  experienceCategory,
  priceOta,
}: ExperienceBookingCardProps) {
  const { t } = useTranslation();
  const hasBokun = !!bokunActivityId && !!BOKUN_CHANNEL_UUID;
  const isMultiOption = (bokunOptions?.length ?? 0) > 1;
  const [modalOpen, setModalOpen] = useState(false);
  /** The option whose button opened the panel (activities with several). */
  const [chosenOption, setChosenOption] = useState<BokunOption | null>(null);
  /** The button that opened the panel, so the focus can go back to it. */
  const openerRef = useRef<HTMLElement | null>(null);

  // Funil (out/2026): este cartão disparava begin_checkout ao abrir a página
  // no desktop. A página da experiência já envia view_item, e o
  // begin_checkout ia para o Meta como InitiateCheckout, misturando visitas a
  // experiências com inícios de checkout de casas. Removido.

  const finalMessage = useMemo(() => {
    let msg = whatsappMessage || `Hi Portugal Active, I'd like to book the ${experienceName} experience.`;
    msg += `\nParticipants: 2 adults`;
    // No per-person price (the yacht charter): no "Estimated total: €0" in the guest's message.
    if (priceFrom > 0) msg += `\nEstimated total: €${priceFrom * 2}`;
    return msg;
  }, [whatsappMessage, experienceName, priceFrom]);

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(finalMessage)}`;

  /** The supplier's script starts loading when the guest reaches for a button that needs it. */
  const warmUp = {
    onPointerEnter: preloadBokunWidgets,
    onFocus: preloadBokunWidgets,
    onTouchStart: preloadBokunWidgets,
  };

  return (
    <div className="overflow-hidden rounded-xl border border-pa-sand bg-white shadow-sm">
      {/* Price headline. Every row of the card shares one edge: 16 px below
          1280 px (the ticks needed it for "Cancelamento gratuito até 24h
          antes"), 20 px from 1280 px. */}
      <div className="px-4 xl:px-5 pt-5 pb-4">
        {priceFrom > 0 ? (
          <>
            <p className="eyebrow text-pa-stone">{t('experience.from', 'From')}</p>
            <p className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[32px] font-light leading-none tracking-tight text-pa-dark tabular-nums">€{priceFrom}</span>
              <span className="body-sm text-pa-stone">{t('experience.perPerson', '/ person')}</span>
            </p>
          </>
        ) : (
          /* No fixed per-person price (e.g. private charter) — show the label;
             exact pricing comes from the live Bókun widget. */
          <p className="text-[22px] font-light leading-tight tracking-tight text-pa-dark">
            {priceLabel || t('experience.priceOnRequest', 'Price on request')}
          </p>
        )}
        {duration && (
          <p className="pa-dots body-sm mt-1.5 text-pa-stone">
            <span>{duration}</span><span className="whitespace-nowrap">Private experience</span>
          </p>
        )}
      </div>

      {/* Bókun booking, in the site's panel. Multi-option activities (e.g.
          ebike: City / Road / Gravel) list their routes, each a button that
          opens the calendar with that route above it. Single-option
          activities have one button that opens the calendar. */}
      <div className="px-4 xl:px-5 pb-5">
        {hasBokun && isMultiOption ? (
          <>
            <p className="eyebrow mb-3 text-pa-stone">
              {t('experience.chooseOption', 'Choose your option')}
            </p>
            <div className="mb-3 space-y-2">
              {bokunOptions!.map((opt, i) => (
                <button
                  key={i}
                  type="button"
                  {...warmUp}
                  onClick={(e) => {
                    openerRef.current = e.currentTarget;
                    setChosenOption(opt);
                    setModalOpen(true);
                    if (experienceSlug) {
                      // Abre o widget Bókun: intenção real, mas a compra acontece no
                      // Bókun. Evento próprio para não contar como checkout de casa.
                      pushEcommerce({
                        event: 'experience_booking_open',
                        ecommerce: {
                          currency: 'EUR',
                          value: opt.priceFrom || priceOta || 0,
                          items: [{ item_id: `EXP-${experienceSlug}-${i}`, item_name: `${experienceName} — ${opt.name}`, item_category: experienceCategory || '', price: opt.priceFrom || priceOta || 0, quantity: 1 }],
                        },
                      });
                    }
                  }}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-black/15 px-3 xl:px-4 py-3 text-left transition-colors hover:border-pa-dark hover:bg-pa-cream"
                >
                  <div className="min-w-0">
                    <p className="body-sm font-medium leading-tight text-pa-dark">{opt.name}</p>
                    {/* A dot list: "4 hours ·" / "Saturdays 10:00" ended its
                        first line on the dot at 1024 px. */}
                    {opt.detail && <p className="pa-dots caption mt-0.5 text-pa-stone">{opt.detail.split(' · ').map((part) => <span key={part}>{part}</span>)}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {opt.priceFrom ? (
                      <span className="body-sm whitespace-nowrap font-medium tabular-nums text-pa-dark">€{opt.priceFrom}</span>
                    ) : null}
                    <ChevronRight className="h-4 w-4 text-pa-stone transition-all group-hover:translate-x-0.5 group-hover:text-pa-dark" aria-hidden="true" />
                  </div>
                </button>
              ))}
            </div>
            <p className="caption text-center text-pa-stone text-balance">
              {t('experience.pickOptionHint', 'Select a tour to check live availability')}
            </p>
          </>
        ) : hasBokun ? (
          <button
            type="button"
            {...warmUp}
            onClick={(e) => {
              openerRef.current = e.currentTarget;
              if (experienceSlug) {
                // Abre o widget Bókun; a compra acontece lá. O mesmo evento, com
                // os mesmos campos, do botão da barra do telemóvel.
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
              setModalOpen(true);
            }}
            className="btn-primary min-h-[52px] w-full whitespace-normal px-5"
          >
            {t('experience.bookNow', 'Book now')}
          </button>
        ) : (
          <>
            {/* WhatsApp CTA fallback */}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary min-h-[52px] w-full whitespace-normal px-5"
              onClick={() => {
                if (!experienceSlug) return;
                // Abre o WhatsApp, não um checkout: conta como contacto
                pushDL({ event: 'whatsapp_click', source: 'experience_card', item_id: `EXP-${experienceSlug}`, value: priceOta || 0 });
              }}
            >
              {t('experience.checkAvailability', 'Check availability')}
            </a>
            <p className="caption mt-1 text-center text-pa-stone">
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-pa-gold-aa transition-colors hover:text-pa-dark"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> {t('experience.messageWhatsApp', 'Message us on WhatsApp to book')}
              </a>
            </p>
          </>
        )}
      </div>

      {/* Trust signals */}
      {/* The tick stays on the first line when a line needs two (the card is
          288 px wide at 1024 px). */}
      <ul className="space-y-2 border-t border-pa-sand px-4 xl:px-5 py-4">
        <li className="caption flex items-start gap-2.5 text-pa-earth">
          <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#6B8E4E]" aria-hidden="true" />
          <span>{t('experience.freeCancellation', 'Free cancellation up to {{hours}}h before', { hours: freeCancellationHours })}</span>
        </li>
        {reserveNowPayLater && (
          <li className="caption flex items-start gap-2.5 text-pa-earth">
            <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#6B8E4E]" aria-hidden="true" />
            <span>{t('experience.reserveNowPayLater', 'Reserve now, pay later')}</span>
          </li>
        )}
        <li className="caption flex items-start gap-2.5 text-pa-earth">
          <Check className="mt-[3px] h-3.5 w-3.5 shrink-0 text-[#6B8E4E]" aria-hidden="true" />
          <span>{t('experience.instantConfirmation', 'Instant confirmation')}</span>
        </li>
      </ul>

      {/* The other way to book, as discreet as the concierge line of a
          home's card. */}
      {hasBokun && (
        <p className="caption flex flex-wrap items-center justify-center gap-x-1.5 border-t border-black/[0.06] px-3 xl:px-5 py-1 text-pa-stone">
          <span>{t('experience.orLabel', 'or')}</span>
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-1.5 text-pa-gold-aa transition-colors hover:text-pa-dark"
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t('experience.messageWhatsAppShort', 'message us on WhatsApp')}
          </a>
        </p>
      )}

      {hasBokun && (
        <BokunWidgetModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          bokunActivityId={bokunActivityId!}
          experienceName={experienceName}
          selectedOption={isMultiOption ? chosenOption : null}
          whatsappHref={waHref}
          returnFocusTo={openerRef}
        />
      )}
    </div>
  );
}
