/* ==========================================================================
   EXPERIENCE QUICK FACTS — 5-icon row, GYG-inspired
   ========================================================================== */

import { Clock, Users, Globe, CheckCircle2, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const items: { icon: typeof Clock; label: string; value: string }[] = [];

  if (duration) {
    items.push({ icon: Clock, label: t('experience.duration', 'Duration'), value: duration });
  }
  if (freeCancellationHours) {
    items.push({
      icon: CheckCircle2,
      label: t('experience.freeCancellationLabel', 'Free cancellation'),
      value: t('experience.upToHoursBefore', 'Up to {{hours}}h before', { hours: freeCancellationHours }),
    });
  }
  if (groupSize) {
    items.push({
      icon: Users,
      label: t('experience.groupSize', 'Group size'),
      value: t('experience.maxGuests', 'Max {{max}} guests', { max: groupSize.max }),
    });
  }
  if (languages && languages.length > 0) {
    items.push({
      icon: Globe,
      label: t('experience.languages', 'Languages'),
      value: languages.slice(0, 3).join(' · '),
    });
  }
  if (mobileTicket) {
    items.push({
      icon: Smartphone,
      label: t('experience.mobileTicket', 'Mobile ticket'),
      value: t('experience.scanFromPhone', 'Scan from phone'),
    });
  }
  if (pickupIncluded) {
    items.push({
      icon: CheckCircle2,
      label: t('experience.pickup', 'Pickup'),
      value: t('experience.fromYourVilla', 'From your villa'),
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
