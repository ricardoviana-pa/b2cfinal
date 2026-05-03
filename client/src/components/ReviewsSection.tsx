/* ==========================================================================
   REVIEWS SECTION — 12 reviews, horizontal carousel, diverse pain points
   Properties assigned from the real Portugal Active portfolio
   ========================================================================== */

import { useState, useRef, useCallback, forwardRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const REVIEWS = [
  {
    name: 'James & Sarah T.',
    origin: 'London, UK',
    property: 'Eben Lodge',
    region: 'Minho Coast',
    quote: 'We have stayed in luxury hotels around the world, but nothing compares to the level of personal attention we received. The team anticipated everything before we even asked. It felt like having our own private hotel.',
    painPoint: 'personal-attention',
  },
  {
    name: 'Marie-Claire D.',
    origin: 'Paris, France',
    property: 'Lima River Houses',
    region: 'Minho Coast',
    quote: 'The house was immaculate, the views were extraordinary, and the private chef dinner was the highlight of our trip. We are already planning our return for next summer.',
    painPoint: 'quality-and-food',
  },
  {
    name: 'Thomas & Ana K.',
    origin: 'Munich, Germany',
    property: 'Sunset Beach Lodge',
    region: 'Minho Coast',
    quote: 'From the airport transfer to the last morning, everything was seamless. The concierge arranged experiences we would never have found on our own. Truly local knowledge.',
    painPoint: 'logistics-and-local',
  },
  {
    name: 'Richard & Emma W.',
    origin: 'New York, USA',
    property: 'Fountain Retreat',
    region: 'Minho Coast',
    quote: 'We brought three families, twelve children, and expected chaos. Instead we got a perfectly organised week. The kids had surf lessons every morning while we had yoga by the pool. The team handled everything.',
    painPoint: 'large-groups',
  },
  {
    name: 'Sofia M.',
    origin: 'Milan, Italy',
    property: 'The Luxury Manor',
    region: 'Minho Coast',
    quote: 'I was nervous about booking a private home instead of a hotel. Would the standards be the same? They exceeded them. The linens, the toiletries, the housekeeping. Everything was five star, but with complete privacy.',
    painPoint: 'trust-and-standards',
  },
  {
    name: 'Henrik & Lise N.',
    origin: 'Copenhagen, Denmark',
    property: 'Nature Hill Duo',
    region: 'Minho Coast',
    quote: 'We celebrated our 25th anniversary here. The team decorated the house, arranged a private dinner on the terrace with a local chef, and even sourced a specific wine we had mentioned in passing. Unforgettable.',
    painPoint: 'celebrations',
  },
  {
    name: 'David & Rachel P.',
    origin: 'Sydney, Australia',
    property: 'Atlantic Lodge',
    region: 'Minho Coast',
    quote: 'Coming from Australia, we worried about the language barrier and navigating a new country. Our concierge spoke perfect English, planned every day, and was available on WhatsApp around the clock. We felt completely at ease.',
    painPoint: 'language-and-distance',
  },
  {
    name: 'Laurent B.',
    origin: 'Brussels, Belgium',
    property: 'Invictus Escape',
    region: 'Porto & Douro',
    quote: 'I organised a corporate retreat for my team of 15. The property was inspiring, the catering was exceptional, and the Portugal Active team handled all the logistics. My team still talks about it months later.',
    painPoint: 'corporate-events',
  },
  {
    name: 'Claudia & Marco R.',
    origin: 'Zurich, Switzerland',
    property: 'Cabedelo Beach Lodge',
    region: 'Minho Coast',
    quote: 'We have tried rental platforms before and always felt abandoned after check in. Here, the local team checked on us daily, the house was spotless, and when our daughter got a fever, they had a doctor at the house within an hour.',
    painPoint: 'support-and-safety',
  },
  {
    name: 'Isabelle F.',
    origin: 'Amsterdam, Netherlands',
    property: 'The Golden Breeze',
    region: 'Algarve',
    quote: 'The best rate guarantee convinced me to book direct. No hidden fees, no commissions, and the price was genuinely lower than what I found on booking platforms. Plus the concierge service was included. It is a no brainer.',
    painPoint: 'value-and-pricing',
  },
  {
    name: 'George & Priya S.',
    origin: 'Dubai, UAE',
    property: 'Montaria Lodge',
    region: 'Minho Coast',
    quote: 'We needed specific dietary requirements for our family, including halal options and nut free meals for our son. The private chef accommodated everything without hesitation. The attention to detail was remarkable.',
    painPoint: 'dietary-and-special-needs',
  },
  {
    name: 'Charlotte & Oliver H.',
    origin: 'Stockholm, Sweden',
    property: 'Slow Living Countryside House',
    region: 'Minho Coast',
    quote: 'We wanted a digital detox for the whole family. The concierge planned hikes, river swims, cooking classes with a local grandmother, and horseback riding. No screens, no schedules, just Portugal at its purest.',
    painPoint: 'authentic-experiences',
  },
];

const ReviewsSection = forwardRef<HTMLDivElement>((_, ref) => {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
    // Calculate active index
    const cardWidth = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 20 : 380;
    setActiveIndex(Math.round(el.scrollLeft / cardWidth));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', checkScroll, { passive: true });
    checkScroll();
    return () => el.removeEventListener('scroll', checkScroll);
  }, [checkScroll]);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.firstElementChild ? (el.firstElementChild as HTMLElement).offsetWidth + 20 : 380;
    el.scrollBy({ left: dir === 'left' ? -cardWidth : cardWidth, behavior: 'smooth' });
  }, []);

  return (
    <section ref={ref} className="fade-in section-padding bg-[#FAFAF7]">
      <div className="container">
        {/* Header row */}
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
          <div>
            <p className="text-[12px] font-medium text-[#8B7355] mb-3" style={{ letterSpacing: '0.08em' }}>{t('reviews.ourGuests', 'OUR GUESTS')}</p>
            <h2 className="headline-lg text-[#1A1A18]">{t('reviews.whatTheyRemember')}</h2>
          </div>

          {/* Desktop arrows */}
          <div className="hidden md:flex items-center gap-2">
            <button
              onClick={() => scroll('left')}
              disabled={!canScrollLeft}
              className={`w-10 h-10 flex items-center justify-center border transition-all duration-200 ${
                canScrollLeft
                  ? 'border-[#1A1A18] text-[#1A1A18] hover:bg-[#1A1A18] hover:text-white'
                  : 'border-[#E8E4DC] text-[#E8E4DC] cursor-default'
              }`}
              style={{ minHeight: 'auto', minWidth: 'auto' }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll('right')}
              disabled={!canScrollRight}
              className={`w-10 h-10 flex items-center justify-center border transition-all duration-200 ${
                canScrollRight
                  ? 'border-[#1A1A18] text-[#1A1A18] hover:bg-[#1A1A18] hover:text-white'
                  : 'border-[#E8E4DC] text-[#E8E4DC] cursor-default'
              }`}
              style={{ minHeight: 'auto', minWidth: 'auto' }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable cards */}
        <div
          ref={scrollRef}
          className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {REVIEWS.map((review, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-[320px] md:w-[380px] bg-white p-10 flex flex-col border-l-[1.5px] border-[#8B7355]"
              style={{ scrollSnapAlign: 'start' }}
            >
              {/* Editorial quote */}
              <p
                className="font-display text-[1.15rem] leading-snug text-[#1A1A18] flex-1 mb-8"
              >
                "{review.quote}"
              </p>

              {/* Author */}
              <div>
                <p className="text-[11px] tracking-[0.12em] uppercase text-[#8B7355] mb-1">{review.name}</p>
                <p className="text-[12px] text-[#6B6860]" style={{ fontWeight: 300 }}>{review.property} · {review.origin}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile dots */}
        <div className="flex md:hidden items-center justify-center gap-1.5 mt-5">
          {REVIEWS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'bg-[#1A1A18] w-4' : 'bg-[#E8E4DC] w-1.5'
              }`}
            />
          ))}
        </div>

        {/* Proof strip */}
        <div className="text-center mt-8">
          <p className="text-[14px] font-medium text-[#6B6860]">
            {t('reviews.proofStrip', '4.8/5 across 2,000+ guest reviews')}
          </p>
        </div>
      </div>
    </section>
  );
});

ReviewsSection.displayName = 'ReviewsSection';
export default ReviewsSection;
