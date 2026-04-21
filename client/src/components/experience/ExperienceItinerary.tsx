/* ==========================================================================
   EXPERIENCE ITINERARY — numbered vertical timeline
   Viator-inspired "What to Expect" — luxury editorial styling
   ========================================================================== */

import type { ExperienceItineraryStep } from '@/lib/types';
import { MapPin, Mountain, Waves, UtensilsCrossed, Car, Info, Anchor, Bike, Camera, ArrowDown } from 'lucide-react';

const ICON_MAP: Record<NonNullable<ExperienceItineraryStep['icon']>, typeof MapPin> = {
  pickup: Car,
  hike: Mountain,
  swim: Waves,
  dine: UtensilsCrossed,
  ride: MapPin,
  rappel: ArrowDown,
  sail: Anchor,
  cycle: Bike,
  photo: Camera,
  brief: Info,
};

interface ExperienceItineraryProps {
  steps: ExperienceItineraryStep[];
}

export default function ExperienceItinerary({ steps }: ExperienceItineraryProps) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="relative">
      {/* Vertical taupe line */}
      <div className="absolute left-5 top-3 bottom-3 w-px bg-[#E8E4DC]" />

      <div className="space-y-8">
        {steps.map((step) => {
          const Icon = step.icon ? ICON_MAP[step.icon] : MapPin;
          return (
            <div key={step.stepNumber} className="relative flex gap-6 items-start">
              {/* Icon node */}
              <div className="relative shrink-0 w-10 h-10 rounded-full bg-[#F5F1EB] border border-[#E8E4DC] flex items-center justify-center z-10">
                <Icon className="w-4 h-4 text-[#8B7355]" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 pt-1">
                <div className="flex items-baseline gap-3 mb-1.5">
                  <span className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium">
                    Stop {step.stepNumber}
                  </span>
                  {step.time && (
                    <>
                      <span className="text-[#E8E4DC]">·</span>
                      <span className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium">
                        {step.time}
                      </span>
                    </>
                  )}
                </div>
                <h3 className="text-[18px] font-display text-[#1A1A18] mb-1.5">
                  {step.title}
                </h3>
                <p className="text-[14px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
