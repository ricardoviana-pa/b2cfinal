/* ==========================================================================
   ABOUT — V2.0 Complete Rewrite
   10 sections: Hero, Origin, Model, Standard, Social Proof,
   Regions, Values, Team, Owners CTA, Final CTA
   ========================================================================== */

import { useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight, Bed, Sparkles, Phone, Shield, Gift, UtensilsCrossed } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IMAGES } from '@/lib/images';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import destinationsData from '@/data/destinations.json';
import { trpc } from '@/lib/trpc';
import type { Property, Destination } from '@/lib/types';

const destinations = destinationsData as unknown as Destination[];

/* ── Team data ─────────────────────────────────────────────────────────── */
const TEAM = [
  {
    id: 'rv',
    name: 'Ricardo Viana',
    role: 'CEO & Founder',
    photo: '/team/ricardo-viana.webp',
    oneLiner: 'From adventure tourism to private hotels. Built PA on the coast he grew up on.',
  },
  {
    id: 'db',
    name: 'Diogo Boissel',
    role: 'Head of Staff',
    photo: '/team/diogoboissel.webp',
    oneLiner: 'Manages the in-house team across all regions.',
  },
  {
    id: 'sq',
    name: 'Susana Queirós',
    role: 'Head of Field Operations',
    photo: '/team/susana-queiros.webp',
    oneLiner: 'Runs the daily operations that guests never see but always feel.',
  },
  {
    id: 'tm',
    name: 'Tomás Matos',
    role: 'Manager of Field Operations',
    photo: '/team/tomas-matos.webp',
    oneLiner: 'On the ground, every day, in every property.',
  },
  {
    id: 'jd',
    name: 'João Dinis',
    role: 'Head of Reservations',
    photo: '/team/joao-dinis.webp',
    oneLiner: 'Your first point of contact. Knows every property personally.',
  },
  {
    id: 'jf',
    name: 'Joana Ferreira',
    role: 'Concierge Manager',
    photo: '/team/joana-ferreira.webp',
    oneLiner: 'The person who finds the restaurant before it makes the guide.',
  },
  {
    id: 'dl',
    name: 'Daniel Lima',
    role: 'B2B Sales Manager',
    photo: '/team/daniel-lima.webp',
    oneLiner: '',
  },
  {
    id: 'tf',
    name: 'Teresa Ferrador',
    role: 'HR & Office Manager',
    photo: '/team/teresa-ferrador.webp',
    oneLiner: '',
  },
  {
    id: 'er',
    name: 'Emanuel R.',
    role: 'Executive Assistant',
    photo: '/team/emanuel-riboira.webp',
    oneLiner: '',
  },
  {
    id: 'jp',
    name: 'João Porto',
    role: 'Customer Support Specialist',
    photo: '',
    oneLiner: '',
  },
  {
    id: 'sr',
    name: 'Samuel Rodrigues',
    role: 'Customer Support Specialist',
    photo: '',
    oneLiner: '',
  },
  {
    id: 'bm',
    name: 'Bruno Monteiro',
    role: 'Finance Manager',
    photo: '',
    oneLiner: '',
  },
];

/* ── The Standard — 6 items ────────────────────────────────────────────── */
const STANDARD_ITEMS = [
  {
    icon: Bed,
    title: 'Hotel-grade linens',
    desc: '300+ thread count cotton sheets, premium duvets, and full-size bath towels. Replaced on schedule.',
  },
  {
    icon: Sparkles,
    title: 'Professional housekeeping',
    desc: 'Our trained team prepares every home before arrival. Not a different cleaner each week. Our people.',
  },
  {
    icon: UtensilsCrossed,
    title: 'Private chef on request',
    desc: 'Professional chefs who shop at the morning market and cook in your kitchen. From breakfast to multi-course dinners.',
  },
  {
    icon: Phone,
    title: 'Concierge from day one',
    desc: 'Your concierge contacts you before arrival. Restaurants, transfers, surf lessons, wine tastings. One message.',
  },
  {
    icon: Shield,
    title: '47 point preparation',
    desc: 'Every home is checked against our preparation checklist before every single arrival. Every appliance, every room, every detail.',
  },
  {
    icon: Gift,
    title: 'Welcome hamper',
    desc: 'Local wine, water, seasonal fruit, and regional products. Placed in every home on the day of arrival.',
  },
];

/* ── Values ────────────────────────────────────────────────────────────── */
const VALUES = [
  {
    title: 'We say no more than we say yes.',
    body: 'Every home in our collection has been personally visited, inspected, and tested by our team. We evaluate character, functionality, and guest impact. Most properties we visit do not make the cut. The ones that do are held to a standard that gets reviewed every quarter.',
  },
  {
    title: 'We live where we operate.',
    body: 'Our team is based in the Minho, not in Lisbon. They eat at the restaurants they recommend. They surf the beaches they suggest. They know the wine producers before they win awards. Local knowledge is not a marketing line. It is our operating reality.',
  },
  {
    title: 'The best service is the kind you never notice.',
    body: 'When everything works, when the pool is clean, the wifi connects, the coffee machine is loaded, and the garden is immaculate, it feels effortless. That effortlessness is the product of preparation, checklists, training, and a team that has anticipated what you need before you think to ask.',
  },
  {
    title: 'We would rather lose a booking than disappoint a guest.',
    body: 'If a property is not right for your trip, we will tell you. If the weather in the Minho is not what you expect in January, we will tell you that too. Honest guidance before the booking is worth more than a five-star review after it.',
  },
];

/* ── Press logos (text-based, will be replaced with SVGs when available) ── */
const PRESS = [
  { name: 'FORBES', url: 'https://www.forbes.com/sites/annabel/2023/02/21/portugals-adventure-travel-paradise-away-from-the-crowds-minho-with-portugal-active/' },
  { name: 'THE TIMES', url: '' },
  { name: 'THE GUARDIAN', url: '' },
];

export default function About() {
  const { t } = useTranslation();
  usePageMeta({
    title: 'About Portugal Active | Private Hotels in Portugal Since 2017',
    description: 'From adventure tourism in Viana do Castelo to 50+ operated homes across Portugal. How Portugal Active transforms private homes into private hotels. Featured in Forbes.',
    url: '/about',
  });
  const scrollRef = useRef<HTMLDivElement>(null);

  /* Live property counts per destination */
  const { data: propsData } = trpc.properties.listForSite.useQuery();
  const allProperties = ((propsData ?? []) as Property[]).filter(p => p.isActive);
  const countByDest = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of allProperties) {
      map[p.destination] = (map[p.destination] || 0) + 1;
    }
    return map;
  }, [allProperties]);
  const totalHomes = allProperties.length;

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
  };

  /* Active + coming soon regions */
  const activeRegions = destinations.filter(d => ['minho', 'porto', 'algarve'].includes(d.slug));
  const comingSoonRegions = destinations.filter(d => ['lisbon', 'alentejo'].includes(d.slug));

  const regionDescriptions: Record<string, string> = {
    minho: 'Wild Atlantic beaches, Vinho Verde vineyards, and Portugal\'s only national park. Our home base since 2017.',
    porto: 'Port wine country, UNESCO heritage, and the city that rivals Lisbon without trying.',
    algarve: 'Golden cliffs, warm water, and 300 days of sun. Our newest and fastest growing region.',
    lisbon: 'Portugal\'s capital. Coming 2026.',
    alentejo: 'Rolling plains and cork oaks. Coming 2026.',
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <Header />

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 1: HERO
          Full-width image, left-aligned text, gradient overlay
          ══════════════════════════════════════════════════════════════════ */}
      <section className="relative h-[70vh] min-h-[440px] lg:min-h-[520px] flex items-center overflow-hidden">
        <img
          src={IMAGES.aboutStory}
          alt="Interior of a luxury private villa managed by Portugal Active"
          className="absolute inset-0 w-full h-full object-cover"
          width={1600} height={900}
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 to-transparent" />
        <div className="relative container z-10 max-w-[1200px] mx-auto">
          <p className="text-[13px] font-medium uppercase tracking-[2px] text-white/70 mb-5" style={{ fontFamily: 'var(--font-body)' }}>
            Private Hotels in Portugal
          </p>
          <h1
            className="text-white leading-[1.15] mb-5 max-w-[600px]"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(32px, 5vw, 48px)' }}
          >
            We do not rent homes. We operate private hotels.
          </h1>
          <p
            className="text-white/85 max-w-[480px]"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'clamp(15px, 2vw, 17px)', lineHeight: 1.6 }}
          >
            One team. One standard. {totalHomes > 0 ? `${totalHomes}+` : 'Fifty'} homes across Portugal, each managed end to end by our people.
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 2: THE ORIGIN (Our Story)
          Two-column: text left, sticky image right
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24">
        <div className="container max-w-[1200px] mx-auto">
          <div className="lg:flex lg:gap-16">
            {/* Text column */}
            <div className="lg:w-[55%]">
              <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                OUR STORY
              </p>
              <h2
                className="text-[#1A1A18] mb-8"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
              >
                We started by showing people Portugal. Then we changed how they stay in it.
              </h2>

              {[
                'Portugal Active began in 2017 as an adventure and activity tourism company in Viana do Castelo. Bike tours through Minho\'s vineyards. Horseback riding along Atlantic beaches. Canyoning in the gorges of Peneda Geres. Surf guiding on Cabedelo. Founded by Ricardo Viana, a sports scientist and researcher who had become the youngest professor invited to teach at Viana do Castelo\'s polytechnic, and who decided to build something of his own on the coast he grew up on.',
                'The adventure business grew fast. But it was a single property that changed everything. We took on one lodge connected to our operations. A place where guests could sleep, eat, and walk to the beach. And we ran it the way we ran our adventure experiences: with obsessive preparation, personal attention, and a team that was present from the first moment to the last. The linens were hotel-grade. The coffee was fresh. Someone met you at the door.',
                'Guests noticed. Not because the property was the most luxurious they had ever seen. Because of how it made them feel. Taken care of. Anticipated. Like someone had thought about their stay before they arrived. We started hearing the same thing: "Why can\'t every rental be like this?"',
                'That question became the company. We looked at how holiday homes were rented across Portugal and saw the same pattern everywhere. Beautiful properties, handed over with a set of keys and a phone number for emergencies. No preparation standard. No team on the ground. No one who stood behind the experience after check-in. The entire industry had accepted that renting a home meant giving up the service you expect from a hotel. We refused to accept that.',
                'So we redesigned the experience from the ground up. We took the operational discipline we had built in adventure tourism (where preparation is not a preference, it is a safety requirement) and applied it to every home we operate. A full-time housekeeping team. Maintenance crews. A concierge who knows the region because they live in it. A preparation checklist that runs before every single arrival. We did not just add service to a rental. We built an entirely new model: the private hotel.',
                `From one property to five. From five to twenty. From twenty to over ${totalHomes > 0 ? totalHomes : 'fifty'}. Each managed end to end by our own people. Forbes featured us. The Times UK and The Guardian wrote about what we were building. The adventure experiences that started it all are still at the heart of what we offer. But today, Portugal Active is something larger: a hospitality company that believes renting a home should feel like checking in to the best hotel you have ever stayed at, except the entire place is yours.`,
                'We are still based in Viana do Castelo. We are still independent. We are still growing at over 100% per year. And we are still driven by the same conviction that started everything: that the way people experience a holiday home is broken, and that we are the ones fixing it.',
              ].map((para, i) => (
                <p
                  key={i}
                  className="text-[#6B6860] mb-5"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
                >
                  {para}
                </p>
              ))}
            </div>

            {/* Sticky image column */}
            <div className="hidden lg:block lg:w-[45%]">
              <div className="sticky top-[120px]">
                <div className="overflow-hidden" style={{ aspectRatio: '3/4' }}>
                  <img
                    src="/team/ricardo-viana.webp"
                    alt="Ricardo Viana, CEO and Founder of Portugal Active"
                    className="w-full h-full object-cover object-top"
                    loading="lazy"
                  />
                </div>
                <p className="text-[13px] text-[#9E9A90] mt-3" style={{ fontFamily: 'var(--font-body)' }}>
                  Ricardo Viana, Founder. Viana do Castelo.
                </p>
              </div>
            </div>
          </div>

          {/* Mobile: Ricardo photo */}
          <div className="lg:hidden mt-8 mb-8">
            <div className="overflow-hidden" style={{ aspectRatio: '3/4', maxWidth: '360px' }}>
              <img
                src="/team/ricardo-viana.webp"
                alt="Ricardo Viana, CEO and Founder of Portugal Active"
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
            </div>
            <p className="text-[13px] text-[#9E9A90] mt-3" style={{ fontFamily: 'var(--font-body)' }}>
              Ricardo Viana, Founder. Viana do Castelo.
            </p>
          </div>

          {/* Press logo strip */}
          <div className="border-t border-[#E8E4DC] pt-10 mt-4">
            <div className="flex items-center justify-center gap-12 lg:gap-14 flex-wrap">
              {PRESS.map(p => (
                p.url ? (
                  <a
                    key={p.name}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#9E9A90] opacity-60 hover:opacity-100 transition-opacity"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', letterSpacing: '3px' }}
                  >
                    {p.name}
                  </a>
                ) : (
                  <span
                    key={p.name}
                    className="text-[#9E9A90] opacity-60"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', letterSpacing: '3px' }}
                  >
                    {p.name}
                  </span>
                )
              ))}
            </div>
            <p className="text-center text-[12px] text-[#9E9A90] mt-4" style={{ fontFamily: 'var(--font-body)' }}>
              Featured press
            </p>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 3: WHAT WE ACTUALLY DO (The Model)
          Surface background, two-column reversed
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24 bg-[#F5F1EB]">
        <div className="container max-w-[1200px] mx-auto">
          <div className="lg:flex lg:gap-16 lg:items-start">
            {/* Text */}
            <div className="lg:w-[55%]">
              <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
                THE MODEL
              </p>
              <h2
                className="text-[#1A1A18] mb-8"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
              >
                Private hospitality. Not a marketplace.
              </h2>
              {[
                'We are not a listing platform. We do not aggregate properties from different owners and hope the experience is good. We partner with homeowners who share our standards, and then we take over the entire operation. Housekeeping, maintenance, guest communication, concierge, quality audits. Everything.',
                'When you book a Portugal Active home, you are not trusting an unknown owner in another city. You are trusting our team. The same team that inspected the property last week, that stocked the kitchen this morning, and that will answer your WhatsApp message within minutes.',
                'This is what we mean by "Private Hotels." The privacy and space of a home, with the reliability and service depth of a hotel. One brand. One operating standard. Regardless of which property you choose.',
              ].map((para, i) => (
                <p
                  key={i}
                  className="text-[#6B6860] mb-5"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
                >
                  {para}
                </p>
              ))}
            </div>
            {/* Image */}
            <div className="lg:w-[45%] mt-8 lg:mt-0">
              <div className="overflow-hidden" style={{ aspectRatio: '4/3' }}>
                <img
                  src={IMAGES.aboutStory}
                  alt="Portugal Active team preparing a luxury villa for guest arrival"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 4: THE STANDARD (What's Included)
          Icon grid, 3 columns
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24">
        <div className="container max-w-[1200px] mx-auto">
          <div className="text-center max-w-[600px] mx-auto mb-14">
            <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
              WHAT IS INCLUDED
            </p>
            <h2
              className="text-[#1A1A18]"
              style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
            >
              Every stay. Every home. No exceptions.
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-[960px] mx-auto">
            {STANDARD_ITEMS.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx}>
                  <Icon size={32} className="text-[#8B7355] mb-4" strokeWidth={1.5} />
                  <h3
                    className="text-[#1A1A18] mb-2"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '15px' }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="text-[#6B6860]"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px', lineHeight: 1.6 }}
                  >
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/services"
              className="inline-flex items-center gap-2 border border-[#1A1A18] text-[#1A1A18] text-[12px] font-medium px-8 py-4 hover:bg-[#1A1A18] hover:text-white transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              DISCOVER OUR EXPERIENCES <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 5: SOCIAL PROOF
          Dark band with press logos + guest quote
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 bg-[#1A1A18]">
        <div className="container max-w-[1200px] mx-auto text-center">
          {/* Press logos */}
          <div className="flex items-center justify-center gap-14 flex-wrap">
            {PRESS.map(p => (
              p.url ? (
                <a
                  key={p.name}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white opacity-70 hover:opacity-100 transition-opacity"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', letterSpacing: '3px' }}
                >
                  {p.name}
                </a>
              ) : (
                <span
                  key={p.name}
                  className="text-white opacity-70"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '14px', letterSpacing: '3px' }}
                >
                  {p.name}
                </span>
              )
            ))}
          </div>

          {/* Divider */}
          <div className="mx-auto mt-8 mb-8 h-px bg-white/15 max-w-[400px]" />

          {/* Guest quote */}
          <blockquote
            className="text-white max-w-[680px] mx-auto italic"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(18px, 3vw, 22px)', lineHeight: 1.5 }}
          >
            "From the airport transfer to the last morning, everything was seamless. The concierge arranged experiences we would never have found on our own. Truly local knowledge."
          </blockquote>
          <p
            className="text-white/60 mt-4"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 400, fontSize: '13px' }}
          >
            Verified guest review
          </p>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 6: WHERE WE OPERATE
          Region cards with live property counts
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24">
        <div className="container max-w-[1200px] mx-auto">
          <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
            OUR REGIONS
          </p>
          <h2
            className="text-[#1A1A18] mb-12"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
          >
            Three regions live. More on the way.
          </h2>

          {/* Active regions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {activeRegions.map(region => (
              <Link key={region.slug} href={`/destinations/${region.slug}`} className="group block">
                <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={region.coverImage}
                    alt={region.name}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <h3
                      className="text-white mb-1"
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px' }}
                    >
                      {region.name}
                    </h3>
                    <p className="text-white/80 text-[13px]" style={{ fontFamily: 'var(--font-body)' }}>
                      {countByDest[region.slug] || 0} homes
                    </p>
                  </div>
                </div>
                <p
                  className="text-[#6B6860] py-4"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px' }}
                >
                  {regionDescriptions[region.slug]}
                </p>
              </Link>
            ))}
          </div>

          {/* Coming soon regions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[calc(66.666%-12px)]">
            {comingSoonRegions.map(region => (
              <div key={region.slug} className="relative">
                <div className="relative overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={region.coverImage}
                    alt={region.name}
                    className="w-full h-full object-cover grayscale-[40%]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  <span
                    className="absolute top-4 left-4 bg-[#8B7355] text-white px-2.5 py-1"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '11px', letterSpacing: '1px' }}
                  >
                    COMING SOON
                  </span>
                  <div className="absolute bottom-4 left-4">
                    <h3
                      className="text-white"
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 400, fontSize: '22px' }}
                    >
                      {region.name}
                    </h3>
                  </div>
                </div>
                <p
                  className="text-[#6B6860] py-4"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '14px' }}
                >
                  {regionDescriptions[region.slug]}
                </p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/destinations"
              className="inline-flex items-center gap-2 border border-[#1A1A18] text-[#1A1A18] text-[12px] font-medium px-8 py-4 hover:bg-[#1A1A18] hover:text-white transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              EXPLORE ALL DESTINATIONS <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 7: VALUES
          Surface background, 2x2 grid
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24 bg-[#F5F1EB]">
        <div className="container max-w-[1200px] mx-auto">
          <p className="text-[12px] font-medium uppercase tracking-[2.5px] text-[#8B7355] mb-4" style={{ fontFamily: 'var(--font-body)' }}>
            HOW WE WORK
          </p>
          <h2
            className="text-[#1A1A18] mb-10"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
          >
            Four commitments.
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {VALUES.map((value, idx) => (
              <div key={idx} className="bg-white border border-[#E8E4DC] p-8">
                <h3
                  className="text-[#1A1A18] mb-3"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: '17px' }}
                >
                  {value.title}
                </h3>
                <p
                  className="text-[#6B6860]"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', lineHeight: 1.65 }}
                >
                  {value.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 8: THE TEAM
          Horizontal scroll carousel with one-liners
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-20 lg:py-24">
        <div className="container max-w-[1200px] mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <h2
                className="text-[#1A1A18] mb-3"
                style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 4vw, 36px)', lineHeight: 1.2 }}
              >
                The people behind every stay.
              </h2>
              <p
                className="max-w-2xl text-[#6B6860]"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
              >
                Our team is not in a call centre. They live in the regions where our homes are located. They know the best restaurants because they eat there. They know the hidden beaches because they swim there. When you message your concierge, you are talking to someone who drove past your property this morning.
              </p>
            </div>
            <div className="hidden md:flex gap-2 shrink-0 ml-8">
              <button
                onClick={() => scroll('left')}
                className="w-10 h-10 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scroll('right')}
                className="w-10 h-10 flex items-center justify-center border border-[#E8E4DC] text-[#6B6860] hover:border-[#1A1A18] hover:text-[#1A1A18] transition-colors"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex gap-5 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0 snap-x snap-mandatory"
          >
            {TEAM.map(member => {
              const initials = member.name
                .split(' ')
                .map(w => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();
              return (
                <div key={member.id} className="group flex-shrink-0 w-[260px] snap-start cursor-default">
                  <div className="relative overflow-hidden mb-4" style={{ aspectRatio: '3/4' }}>
                    {member.photo ? (
                      <>
                        <img
                          src={member.photo}
                          alt={member.name}
                          className="w-full h-full object-cover object-top grayscale transition-all duration-700 ease-out group-hover:grayscale-0 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-[#8B7355]/10 mix-blend-multiply transition-opacity duration-700 group-hover:opacity-0 pointer-events-none" />
                      </>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#F0ECE4] to-[#E8E0D4] flex items-center justify-center">
                        <span className="font-display text-[3.5rem] text-[#8B7355]/30 select-none tracking-wide">{initials}</span>
                      </div>
                    )}
                  </div>
                  <div className="pt-1">
                    <h4 className="text-[15px] font-display text-[#1A1A18] mb-0.5 tracking-wide">{member.name}</h4>
                    <p className="text-[12px] text-[#8B7355] tracking-wider uppercase">{member.role}</p>
                    {member.oneLiner && (
                      <p
                        className="text-[#9E9A90] mt-1"
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '13px', lineHeight: 1.4 }}
                      >
                        {member.oneLiner}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 9: FOR PROPERTY OWNERS (Bridge to B2B)
          Surface background, centered
          ══════════════════════════════════════════════════════════════════ */}
      <section className="py-16 lg:py-20 bg-[#F5F1EB]">
        <div className="container max-w-[640px] mx-auto text-center">
          <h2
            className="text-[#1A1A18] mb-4"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(26px, 4vw, 32px)', lineHeight: 1.2 }}
          >
            Own a property in Portugal?
          </h2>
          <p
            className="text-[#6B6860] max-w-[520px] mx-auto mb-8"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '16px', lineHeight: 1.7 }}
          >
            We partner with homeowners who want their property managed to the highest standard. Full operation, zero involvement, and returns that reflect the quality of your home. If you are curious about what we do for owners, we would enjoy the conversation.
          </p>
          <a
            href="https://management.portugalactive.com/?utm_source=b2c_site&utm_medium=about_page&utm_campaign=about_cta"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-[#1A1A18] text-[#1A1A18] text-[12px] font-medium px-8 py-4 hover:bg-[#1A1A18] hover:text-white transition-colors"
            style={{ letterSpacing: '1.5px' }}
          >
            LEARN ABOUT PROPERTY MANAGEMENT <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════════════
          SECTION 10: FINAL CTA
          Dark band, two buttons
          ══════════════════════════════════════════════════════════════════ */}
      <section className="relative py-20 lg:py-24 bg-[#1A1A18] overflow-hidden">
        {/* Subtle property image overlay */}
        <img
          src={IMAGES.aboutStory}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-[0.08] pointer-events-none"
          aria-hidden="true"
        />
        <div className="relative container max-w-[640px] mx-auto text-center z-10">
          <h2
            className="text-white mb-10"
            style={{ fontFamily: 'var(--font-display)', fontWeight: 300, fontSize: 'clamp(28px, 5vw, 40px)', lineHeight: 1.2 }}
          >
            Ready to experience Portugal differently?
          </h2>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/homes"
              className="inline-flex items-center justify-center gap-2 bg-white text-[#1A1A18] text-[12px] font-medium px-8 py-4 hover:bg-[#F5F1EB] transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              EXPLORE OUR HOMES <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 border border-white/40 text-white text-[12px] font-medium px-8 py-4 hover:border-white hover:bg-white/10 transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              TALK TO OUR CONCIERGE <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
