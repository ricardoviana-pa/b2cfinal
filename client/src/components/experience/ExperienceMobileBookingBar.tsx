/* ==========================================================================
   EXPERIENCE MOBILE BOOKING BAR — sticky bottom + bottom sheet
   Shows after hero scrolled out of view. Tap → bottom sheet with date/pax.
   ========================================================================== */

import { useEffect, useState, useMemo } from 'react';
import { X, Minus, Plus, Calendar } from 'lucide-react';

interface ExperienceMobileBookingBarProps {
  experienceName: string;
  priceFrom: number;
  whatsappMessage: string;
  maxGroupSize?: number;
}

const WHATSAPP_NUMBER = '351927161771';

export default function ExperienceMobileBookingBar({
  experienceName,
  priceFrom,
  whatsappMessage,
  maxGroupSize = 10,
}: ExperienceMobileBookingBarProps) {
  const [visible, setVisible] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [date, setDate] = useState<string>('');
  const [adults, setAdults] = useState<number>(2);

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const estimatedTotal = priceFrom * adults;

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (sheetOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [sheetOpen]);

  const finalMessage = useMemo(() => {
    let msg = whatsappMessage || `Hi Portugal Active, I'd like to book the ${experienceName} experience.`;
    if (date) msg += `\n\nPreferred date: ${date}`;
    msg += `\nParticipants: ${adults} adult${adults > 1 ? 's' : ''}`;
    msg += `\nEstimated total: €${estimatedTotal}`;
    return msg;
  }, [whatsappMessage, experienceName, date, adults, estimatedTotal]);

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
          <button
            onClick={() => setSheetOpen(true)}
            className="bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase px-8 py-3.5"
            style={{ minHeight: '48px' }}
          >
            Check availability
          </button>
        </div>
      </div>

      {/* Bottom sheet */}
      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50" onClick={() => setSheetOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="absolute bottom-0 left-0 right-0 bg-[#FAFAF7] rounded-t-[2px] p-6 animate-slide-up"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 24px)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="headline-sm text-[#1A1A18]">Check availability</h3>
              <button
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="touch-target text-[#9E9A90]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Date */}
            <div className="mb-5">
              <label className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium mb-2 block">
                Preferred date
              </label>
              <div className="relative">
                <input
                  type="date"
                  min={todayIso}
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  onClick={e => (e.target as HTMLInputElement).showPicker?.()}
                  className="w-full bg-white border border-[#E8E4DC] px-4 py-3.5 pr-11 text-[14px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
                <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9A90] pointer-events-none" />
              </div>
            </div>

            {/* Participants */}
            <div className="mb-6">
              <label className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium mb-2 block">
                Participants
              </label>
              <div className="flex items-center justify-between bg-white border border-[#E8E4DC] px-4 py-3">
                <span className="text-[14px] text-[#1A1A18]" style={{ fontWeight: 300 }}>
                  {adults} adult{adults > 1 ? 's' : ''}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setAdults(a => Math.max(1, a - 1))}
                    disabled={adults <= 1}
                    className="w-9 h-9 flex items-center justify-center border border-[#E8E4DC] disabled:opacity-30"
                    aria-label="Decrease"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdults(a => Math.min(maxGroupSize, a + 1))}
                    disabled={adults >= maxGroupSize}
                    className="w-9 h-9 flex items-center justify-center border border-[#E8E4DC] disabled:opacity-30"
                    aria-label="Increase"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Total */}
            <div className="mb-6 flex items-baseline justify-between">
              <span className="text-[11px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium">
                Estimated total
              </span>
              <span className="text-[20px] font-display text-[#1A1A18]">
                €{estimatedTotal}
              </span>
            </div>

            {/* CTA */}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase py-4"
              style={{ minHeight: '52px' }}
            >
              Check availability
            </a>
          </div>
        </div>
      )}
    </>
  );
}
