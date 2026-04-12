/* ==========================================================================
   EXPERIENCE WHY BOOK DIRECT — trust section with 4 benefit cards
   2x2 grid (desktop) / 1 column (mobile)
   Editorial luxury styling with taupe accents
   ========================================================================== */

import { DollarSign, MessageCircle, RotateCw, MapPin } from 'lucide-react';

interface ExperienceWhyBookDirectProps {
  priceOta?: number;
  priceDirect: number;
}

const BENEFITS = [
  {
    id: 'savings',
    title: 'Save up to 15%',
    description: 'Book direct and skip the OTA commission. Same experience, same guides — a better price.',
    icon: DollarSign,
  },
  {
    id: 'support',
    title: 'Direct line to our team',
    description: 'Message us on WhatsApp anytime. No call centres, no bots — real people who know every experience.',
    icon: MessageCircle,
  },
  {
    id: 'flexibility',
    title: 'Flexible by default',
    description: 'Free cancellation up to 24 hours. Reserve now, pay later. Change dates with one message.',
    icon: RotateCw,
  },
  {
    id: 'curated',
    title: 'Curated by locals',
    description: "Every experience is designed, tested, and led by our team. We don't resell — we operate.",
    icon: MapPin,
  },
];

export default function ExperienceWhyBookDirect({ priceOta, priceDirect }: ExperienceWhyBookDirectProps) {
  const savings = priceOta ? priceOta - priceDirect : null;

  return (
    <section className="bg-[#F5F1EB] py-16 md:py-24 px-6 md:px-12">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-12 md:mb-16">
          <h2 className="text-[32px] md:text-[40px] font-display text-[#1A1A18] leading-tight">
            Why book direct with Portugal Active
          </h2>
          {savings !== null && (
            <p className="text-[15px] text-[#6B6860] mt-4" style={{ fontWeight: 300 }}>
              Save €{savings} per person vs GetYourGuide
            </p>
          )}
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-10">
          {BENEFITS.map(benefit => {
            const IconComponent = benefit.icon;
            return (
              <div
                key={benefit.id}
                className="bg-white border border-[#E8E4DC] p-8 md:p-10 flex flex-col"
              >
                {/* Icon */}
                <div className="mb-6">
                  <div className="w-14 h-14 flex items-center justify-center bg-[#F5F1EB] border border-[#E8E4DC]">
                    <IconComponent className="w-7 h-7 text-[#8B7355]" strokeWidth={1.5} />
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-[18px] font-display text-[#1A1A18] mb-3 leading-snug">
                  {benefit.title}
                </h3>

                {/* Description */}
                <p className="text-[14px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
                  {benefit.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
