/* ==========================================================================
   EXPERIENCES — Activity hub page
   Browse all bookable experiences, filter by category and region
   ========================================================================== */

import { useState, useMemo } from 'react';
import { Link } from 'wouter';
import { MapPin, Clock, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import activitiesData from '@/data/activities.json';
import { useSEO } from '@/hooks/useSEO';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

interface Activity {
  id: string;
  slug: string;
  title: string;
  category: string;
  description: string;
  shortDescription: string;
  duration: string;
  priceFrom: number;
  currency: string;
  location: string;
  region: string;
  regions: string[];
  images: string[];
  difficulty: string;
  bookingType: string;
}

const activities = activitiesData as Activity[];

const CATEGORIES = [
  { label: 'All', value: 'all' },
  { label: 'Adventure', value: 'adventure' },
  { label: 'Gastronomy', value: 'gastronomy' },
  { label: 'Culture', value: 'culture' },
  { label: 'Wellness', value: 'wellness' },
];

const REGIONS = [
  { label: 'All destinations', value: 'all' },
  { label: 'Minho Coast', value: 'minho' },
  { label: 'Porto and Douro', value: 'porto' },
  { label: 'Algarve', value: 'algarve' },
];

export default function Experiences() {
  const { t } = useTranslation();

  useSEO({
    title: 'Experiences & Activities in Portugal',
    description: 'Surf lessons, wine tastings, canyoning, cooking classes and more. Curated activities across Portugal open to everyone. Book with Portugal Active.',
    canonical: '/experiences',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Portugal Active Experiences',
      description: 'Curated activities and adventures across Portugal.',
      url: 'https://www.portugalactive.com/experiences',
      numberOfItems: activities.length,
      itemListElement: activities.map((a, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `https://www.portugalactive.com/experiences/${a.slug}`,
        name: a.title,
      })),
    },
  });

  const [category, setCategory] = useState('all');
  const [region, setRegion] = useState('all');

  const filtered = useMemo(() => {
    return activities.filter(a => {
      const matchCategory = category === 'all' || a.category === category;
      const matchRegion = region === 'all' || a.regions.includes(region);
      return matchCategory && matchRegion;
    });
  }, [category, region]);

  const scrollToGrid = () => {
    document.getElementById('experiences-grid')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1400&q=80"
          alt="Experiences in Portugal"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <p className="text-[11px] font-medium text-white/60 mb-3" style={{ letterSpacing: '0.08em' }}>
            EXPERIENCES IN PORTUGAL
          </p>
          <h1 className="headline-xl text-white mb-4">Adventure, culture, and flavour. Open to everyone.</h1>
          <p className="body-lg max-w-xl" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Every experience is led by local professionals. Book online or contact our team.
          </p>
          <div className="flex gap-3 mt-8">
            <button
              onClick={scrollToGrid}
              className="inline-flex items-center gap-2 bg-white text-[#1A1A18] text-[12px] tracking-[0.08em] font-medium px-6 py-3.5 hover:bg-[#F5F1EB] transition-colors"
            >
              BROWSE EXPERIENCES
            </button>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border border-white/40 text-white text-[12px] tracking-[0.08em] font-medium px-6 py-3.5 hover:bg-white/10 transition-colors"
            >
              TALK TO OUR TEAM
            </Link>
          </div>
        </div>
      </section>

      {/* Filter Bar */}
      <div className="sticky top-16 md:top-20 z-30 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-[#E8E4DC]">
        <div className="container py-3 md:py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Category filters */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  onClick={() => setCategory(c.value)}
                  className={`px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-all border shrink-0 ${
                    category === c.value
                      ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
                      : 'bg-transparent text-[#6B6860] border-[#E8E4DC] hover:border-[#1A1A18] hover:text-[#1A1A18]'
                  }`}
                  style={{ minHeight: '40px' }}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {/* Region filters */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
              <MapPin className="w-4 h-4 text-[#9E9A90] shrink-0" />
              {REGIONS.map(r => (
                <button
                  key={r.value}
                  onClick={() => setRegion(r.value)}
                  className={`px-3 py-1.5 text-[12px] font-medium whitespace-nowrap transition-all border shrink-0 ${
                    region === r.value
                      ? 'bg-[#8B7355] text-white border-[#8B7355]'
                      : 'bg-transparent text-[#9E9A90] border-[#E8E4DC] hover:border-[#8B7355] hover:text-[#8B7355]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Experiences Grid */}
      <section id="experiences-grid" className="section-padding">
        <div className="container">
          <p className="text-[13px] text-[#9E9A90] mb-6">
            {filtered.length} experience{filtered.length !== 1 ? 's' : ''} available
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((activity) => (
              <Link
                key={activity.id}
                href={`/experiences/${activity.slug}`}
                className="bg-white border border-[#E8E4DC] overflow-hidden group block"
              >
                {/* Image */}
                <div className="relative overflow-hidden" style={{ aspectRatio: '4/3' }}>
                  <img
                    src={activity.images[0]}
                    alt={activity.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  {/* Category tag */}
                  <span className="absolute top-3 left-3 bg-[#1A1A18]/80 backdrop-blur-sm text-white text-[10px] tracking-[0.04em] font-medium px-2.5 py-1 capitalize">
                    {activity.category}
                  </span>
                  {/* Region tags */}
                  <div className="absolute top-3 right-3 flex gap-1.5">
                    {activity.regions.map(r => (
                      <span key={r} className="bg-white/90 backdrop-blur-sm text-[10px] font-medium text-[#6B6860] px-2 py-1 capitalize">
                        {r}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-display text-[20px] text-[#1A1A18] mb-1 group-hover:text-[#8B7355] transition-colors">
                    {activity.title}
                  </h3>
                  <p className="text-[14px] text-[#6B6860] font-light mb-3 line-clamp-2">
                    {activity.shortDescription}
                  </p>

                  {/* Duration + Price */}
                  <div className="flex items-center gap-3 text-[13px] text-[#1A1A18] mb-2">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-[#9E9A90]" />
                      {activity.duration}
                    </span>
                    <span className="text-[#E8E4DC]">·</span>
                    <span className="font-medium">From {activity.priceFrom} € per person</span>
                  </div>

                  {/* Location */}
                  <p className="text-[12px] text-[#9E9A90] flex items-center gap-1 mb-4">
                    <MapPin className="w-3 h-3" />
                    {activity.location}
                  </p>

                  {/* CTA */}
                  <span className="inline-flex items-center gap-1.5 text-[12px] tracking-[0.04em] font-medium text-[#8B7355] group-hover:text-[#1A1A18] transition-colors">
                    VIEW DETAILS <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-[#6B6860] text-lg mb-6">No experiences match your filters.</p>
              <button
                onClick={() => { setCategory('all'); setRegion('all'); }}
                className="inline-flex items-center gap-2 bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium px-6 py-3.5 hover:bg-[#333330] transition-colors"
              >
                SHOW ALL EXPERIENCES
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Bridge to Concierge */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-2xl mx-auto text-center">
          <h2 className="headline-md text-[#1A1A18] mb-4">Staying in one of our homes?</h2>
          <p className="body-md mb-8" style={{ color: '#6B6860' }}>
            Our concierge team arranges these experiences for you, plus exclusive guest services like private chef, in-villa spa, and airport transfers.
          </p>
          <Link
            href="/concierge"
            className="inline-flex items-center gap-2 bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#333330] transition-colors"
          >
            DISCOVER CONCIERGE SERVICES <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
