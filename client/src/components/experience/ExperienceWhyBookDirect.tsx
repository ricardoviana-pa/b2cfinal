import { BadgeCheck, Tag, Headphones } from 'lucide-react';

interface Props {
  priceDirect: number;
  priceOta?: number;
}

export default function ExperienceWhyBookDirect({ priceDirect, priceOta }: Props) {
  const saving = priceOta && priceOta > priceDirect ? priceOta - priceDirect : 0;

  return (
    <section className="section-padding bg-[#F5F1EB]">
      <div className="container max-w-3xl text-center">
        <p className="text-[11px] font-medium tracking-[0.15em] uppercase text-[#8B7355] mb-3">
          Why Book Direct
        </p>
        <h2 className="headline-md text-[#1A1A18] mb-8">
          {saving > 0
            ? `Save €${saving} per person — book directly with us`
            : 'Better value when you book direct'}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
          <div className="flex gap-3 items-start">
            <Tag className="w-5 h-5 text-[#8B7355] shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium text-[#1A1A18] mb-1">Lowest price guaranteed</p>
              <p className="text-[13px] text-[#6B6860] font-light leading-snug">
                {saving > 0
                  ? `€${priceDirect}/person vs €${priceOta} on GetYourGuide or Viator.`
                  : 'No platform fees — you pay exactly what we charge.'}
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start">
            <Headphones className="w-5 h-5 text-[#8B7355] shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium text-[#1A1A18] mb-1">Direct support</p>
              <p className="text-[13px] text-[#6B6860] font-light leading-snug">
                Questions or changes? Reach your guide directly — no call centres.
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start">
            <BadgeCheck className="w-5 h-5 text-[#8B7355] shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium text-[#1A1A18] mb-1">Flexible cancellation</p>
              <p className="text-[13px] text-[#6B6860] font-light leading-snug">
                Free cancellation up to 48 hours before. No hoops, no fees.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
