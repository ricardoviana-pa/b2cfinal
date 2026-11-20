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
      {/* One column on a phone, three from 640 px, and from 1280 px five
          columns as wide as their own text. In two columns on a phone each
          fact had 115 px beside its icon, and at 12 / 15 px the labels and
          values broke in two ("FREE / CANCELLATION", "Up to 24h / before");
          in five equal columns "CANCELAMENTO GRATUITO" missed by 3 px.
          A single fact (the yacht's duration) takes the whole row. */}
      <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-3 xl:grid-cols-[repeat(5,auto)] gap-x-6 gap-y-4 sm:gap-y-5">
        {items.slice(0, 5).map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className={`flex items-start gap-3 ${items.length === 1 ? 'col-span-full' : ''}`}>
              <div className="shrink-0 w-9 h-9 flex items-center justify-center rounded-lg bg-[#F5F1EB]">
                <Icon className="w-4 h-4 text-pa-gold-aa" />
              </div>
              <div className="min-w-0">
                <p className="text-[12px] tracking-[0.08em] uppercase text-pa-stone font-medium mb-0.5">
                  {item.label}
                </p>
                <p className="text-[15px] leading-snug text-[#1A1A18]" style={{ fontWeight: 400 }}>
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
