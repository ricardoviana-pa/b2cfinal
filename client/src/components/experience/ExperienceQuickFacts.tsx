/* ==========================================================================
   EXPERIENCE QUICK FACTS — 5-icon row, GYG-inspired
   ========================================================================== */

import { Clock, Users, Globe, CheckCircle2, Smartphone } from 'lucide-react';

interface ExperienceQuickFactsProps {
  duration?: string;
  groupSize?: { min: number; max: number };
  languages?: string[];
  freeCancellationHours?: number;
  mobileTicket?: boolean;
  pickupIncluded?: boolean;
}

export default function ExperienceQuickFacts({
  duration,
  groupSize,
  languages,
  freeCancellationHours,
  mobileTicket,
  pickupIncluded,
}: ExperienceQuickFactsProps) {
  const items: { icon: typeof Clock; label: string; value: string }[] = [];

  if (duration) {
    items.push({ icon: Clock, label: 'Duration', value: duration });
  }
  if (freeCancellationHours) {
    items.push({
      icon: CheckCircle2,
      label: 'Free cancellation',
      value: `Up to ${freeCancellationHours}h before`,
    });
  }
  if (groupSize) {
    items.push({
      icon: Users,
      label: 'Group size',
      value: `Max ${groupSize.max} guests`,
    });
  }
  if (languages && languages.length > 0) {
    items.push({
      icon: Globe,
      label: 'Languages',
      value: languages.slice(0, 3).join(' · '),
    });
  }
  if (mobileTicket) {
    items.push({
      icon: Smartphone,
      label: 'Mobile ticket',
      value: 'Scan from phone',
    });
  }
  if (pickupIncluded) {
    items.push({
      icon: CheckCircle2,
      label: 'Pickup',
      value: 'From your villa',
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="border-y border-[#E8E4DC] py-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6 gap-y-5">
        {items.slice(0, 5).map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 flex items-center justify-center bg-[#F5F1EB]">
                <Icon className="w-4 h-4 text-[#8B7355]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] tracking-[0.08em] uppercase text-[#9E9A90] font-medium mb-0.5">
                  {item.label}
                </p>
                <p className="text-[13px] text-[#1A1A18]" style={{ fontWeight: 300 }}>
                  {item.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
