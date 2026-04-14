/* ==========================================================================
   EXPERIENCE BOOKING CARD — sticky right rail
   Date picker + participant stepper + CTA
   When bokunActivityId is set: real availability + pricing via tRPC
   Fallback: WhatsApp prefill when Bókun not configured or no activityId
   ========================================================================== */

import { useState, useMemo, useEffect } from 'react';
import { Check, Minus, Plus, MessageCircle, Calendar, Loader2, AlertCircle, Clock } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import BokunWidgetModal from './BokunWidgetModal';

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
  const [date, setDate] = useState<string>('');
  const [adults, setAdults] = useState<number>(2);
  const [selectedSlot, setSelectedSlot] = useState<string>('');
  const [widgetOpen, setWidgetOpen] = useState<boolean>(false);

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);

  // Bókun availability query — only fires when we have activityId + date
  const availabilityQuery = trpc.bokun.getAvailability.useQuery(
    { activityId: bokunActivityId!, date },
    { enabled: !!bokunActivityId && !!date, staleTime: 60_000, retry: 1 }
  );

  // Bókun pricing query — fires when we have slot selected
  const pricingQuery = trpc.bokun.getPricing.useQuery(
    { activityId: bokunActivityId!, date, adults },
    { enabled: !!bokunActivityId && !!date && adults > 0, staleTime: 60_000, retry: 1 }
  );

  const hasBokun = !!bokunActivityId;
  const slots = availabilityQuery.data?.slots ?? [];
  const isLoadingSlots = availabilityQuery.isLoading;
  const slotsError = availabilityQuery.error;
  const bokunPrice = pricingQuery.data?.total;
  const estimatedTotal = bokunPrice ?? priceFrom * adults;

  // Auto-select first slot when slots load
  useEffect(() => {
    if (slots.length > 0 && !selectedSlot) {
      setSelectedSlot(slots[0].time || slots[0].id || '');
    }
  }, [slots, selectedSlot]);

  // Reset slot when date changes
  useEffect(() => {
    setSelectedSlot('');
  }, [date]);

  const finalMessage = useMemo(() => {
    let msg = whatsappMessage || `Hi Portugal Active, I'd like to book the ${experienceName} experience.`;
    if (date) msg += `\n\nPreferred date: ${date}`;
    if (selectedSlot) msg += `\nTime: ${selectedSlot}`;
    msg += `\nParticipants: ${adults} adult${adults > 1 ? 's' : ''}`;
    msg += `\nEstimated total: €${estimatedTotal}`;
    return msg;
  }, [whatsappMessage, experienceName, date, selectedSlot, adults, estimatedTotal]);

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(finalMessage)}`;

  return (
    <div className="bg-[#F5F1EB] border border-[#E8E4DC] p-7">
      {/* Price headline */}
      <div className="mb-6 pb-5 border-b border-[#E8E4DC]">
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

      {/* Date picker */}
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
            className="w-full bg-white border border-[#E8E4DC] px-4 py-3.5 pr-11 text-[14px] text-[#1A1A18] focus:border-[#8B7355] focus:outline-none transition-colors cursor-pointer"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
          />
          <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9E9A90] pointer-events-none" />
        </div>
      </div>

      {/* Time slots — only shown when Bókun is active and date is selected */}
      {hasBokun && date && (
        <div className="mb-5">
          <label className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium mb-2 block">
            Available times
          </label>
          {isLoadingSlots ? (
            <div className="flex items-center gap-2 py-3 text-[12px] text-[#9E9A90]">
              <Loader2 size={14} className="animate-spin" /> Checking availability...
            </div>
          ) : slotsError ? (
            <div className="flex items-center gap-2 py-3 text-[12px] text-[#9E9A90]">
              <AlertCircle size={14} /> Could not load times. Use WhatsApp below.
            </div>
          ) : slots.length === 0 ? (
            <p className="text-[12px] text-[#9E9A90] py-2" style={{ fontWeight: 300 }}>
              No availability for this date. Try another date.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {slots.map((slot: any) => {
                const slotId = slot.time || slot.id || '';
                const isSelected = selectedSlot === slotId;
                return (
                  <button
                    key={slotId}
                    type="button"
                    onClick={() => setSelectedSlot(slotId)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-[12px] border transition-colors ${
                      isSelected
                        ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
                        : 'bg-white text-[#1A1A18] border-[#E8E4DC] hover:border-[#8B7355]'
                    }`}
                  >
                    <Clock size={12} />
                    {slotId}
                    {slot.remaining != null && slot.remaining <= 4 && (
                      <span className="text-[10px] text-[#8B7355] ml-1">
                        {slot.remaining} left
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Participants stepper */}
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
              className="w-8 h-8 flex items-center justify-center border border-[#E8E4DC] text-[#1A1A18] hover:border-[#1A1A18] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Decrease"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setAdults(a => Math.min(maxGroupSize, a + 1))}
              disabled={adults >= maxGroupSize}
              className="w-8 h-8 flex items-center justify-center border border-[#E8E4DC] text-[#1A1A18] hover:border-[#1A1A18] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Increase"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Estimated total */}
      <div className="mb-6 flex items-baseline justify-between">
        <span className="text-[11px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium">
          {pricingQuery.isLoading ? 'Calculating...' : 'Estimated total'}
        </span>
        <span className="text-[18px] font-display text-[#1A1A18]">
          €{estimatedTotal}
        </span>
      </div>

      {/* Primary CTA — opens Bókun widget when available, else WhatsApp */}
      {hasBokun ? (
        <button
          type="button"
          onClick={() => setWidgetOpen(true)}
          className="w-full flex items-center justify-center gap-2 bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase py-4 hover:bg-black transition-colors mb-3"
          style={{ minHeight: '52px' }}
        >
          Check availability
        </button>
      ) : (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center justify-center gap-2 bg-[#1A1A18] text-white text-[11px] tracking-[0.14em] font-medium uppercase py-4 hover:bg-black transition-colors mb-3"
          style={{ minHeight: '52px' }}
        >
          Check availability
        </a>
      )}

      {hasBokun && (
        <BokunWidgetModal
          open={widgetOpen}
          onClose={() => setWidgetOpen(false)}
          experienceName={experienceName}
          bokunActivityId={bokunActivityId!}
        />
      )}

      {/* Secondary: WhatsApp text link */}
      <p className="text-center text-[12px] text-[#9E9A90] mb-5" style={{ fontWeight: 300 }}>
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

      {/* Trust signals */}
      <div className="space-y-2.5 pt-5 border-t border-[#E8E4DC]">
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
    </div>
  );
}
