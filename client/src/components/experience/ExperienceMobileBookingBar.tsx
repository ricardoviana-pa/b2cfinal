/* ==========================================================================
   EXPERIENCE MOBILE BOOKING BAR — sticky bottom
   Tap → opens full-screen Bókun widget (no redundant date/pax sheet).
   Fallback: WhatsApp when Bókun is not configured.
   ========================================================================== */

import { useEffect, useState, useMemo } from 'react';
import { X, MessageCircle } from 'lucide-react';

interface ExperienceMobileBookingBarProps {
  experienceName: string;
  priceFrom: number;
  whatsappMessage: string;
  maxGroupSize?: number;
  bokunActivityId?: number;
}

const WHATSAPP_NUMBER = '351927161771';
const BOKUN_CHANNEL_UUID = import.meta.env.VITE_BOKUN_CHANNEL_UUID as string | undefined;

export default function ExperienceMobileBookingBar({
  experienceName,
  priceFrom,
  whatsappMessage,
  maxGroupSize = 10,
  bokunActivityId,
}: ExperienceMobileBookingBarProps) {
  const [visible, setVisible] = useState(false);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const hasBokun = !!bokunActivityId && !!BOKUN_CHANNEL_UUID;

  const widgetSrc = hasBokun
    ? `https://widgets.bokun.io/online-sales/${BOKUN_CHANNEL_UUID}/experience-calendar/${bokunActivityId}`
    : '';

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (widgetOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [widgetOpen]);

  const finalMessage = useMemo(() => {
    let msg = whatsappMessage || `Hi Portugal Active, I'd like to book the ${experienceName} experience.`;
    msg += `\nParticipants: 2 adults`;
    return msg;
  }, [whatsappMessage, experienceName]);

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(finalMessage)}`;

  return (
    <>
      {/* Sticky bottom bar */}
      <div
        className={`lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FAFAF7] border-t border-[#E8E4DC] transition-transform duration-300 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium">
              From
            </p>
            <p className="text-[18px] font-display text-[#1A1A18] leading-none mt-0.5">
              €{priceFrom}
              <span className="text-[11px] text-[#9E9A90] ml-1" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                / person
              </span>
            </p>
          </div>
          {hasBokun ? (
            <button
              onClick={() => setWidgetOpen(true)}
              className="bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase px-8 py-3.5"
              style={{ minHeight: '48px' }}
            >
              Book now
            </button>
          ) : (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase px-8 py-3.5 flex items-center"
              style={{ minHeight: '48px' }}
            >
              Check availability
            </a>
          )}
        </div>
      </div>

      {/* Full-screen Bókun widget overlay (mobile) */}
      {widgetOpen && hasBokun && (
        <div className="lg:hidden fixed inset-0 z-[100] bg-[#FAFAF7] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4DC] bg-white shrink-0">
            <div>
              <p className="text-[10px] tracking-[0.14em] uppercase text-[#9E9A90] font-medium">
                Reserve
              </p>
              <p className="text-[14px] font-display text-[#1A1A18] mt-0.5 leading-tight truncate max-w-[260px]">
                {experienceName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWidgetOpen(false)}
              aria-label="Close"
              className="w-9 h-9 flex items-center justify-center border border-[#E8E4DC]"
            >
              <X className="w-4 h-4 text-[#1A1A18]" />
            </button>
          </div>

          {/* Widget iframe — fills remaining space */}
          <div className="flex-1 bg-white">
            <iframe
              key={`mobile-${bokunActivityId}-${BOKUN_CHANNEL_UUID}`}
              src={widgetSrc}
              title={`Book ${experienceName}`}
              className="w-full h-full border-0"
              allow="payment *; clipboard-write"
            />
          </div>

          {/* Footer */}
          <div className="px-5 py-3 flex items-center justify-between border-t border-[#E8E4DC] bg-white shrink-0"
               style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
            <span className="text-[11px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
              Secure booking by Bókun
            </span>
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-[#8B7355]"
            >
              <MessageCircle className="w-3 h-3" /> WhatsApp
            </a>
          </div>
        </div>
      )}
    </>
  );
}
