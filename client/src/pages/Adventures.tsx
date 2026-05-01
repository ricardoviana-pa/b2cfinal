/* ==========================================================================
   ADVENTURES — V1.6 Redesign
   Adventure catalogue filtered by destination, with itinerary integration
   ========================================================================== */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { MapPin, Clock, Check, Play } from 'lucide-react';
import productsData from '@/data/products.json';
import experienceDetailsData from '@/data/experienceDetails.json';
import type { Product, DestinationSlug } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildFaqPageSchema } from '@/components/seo/StructuredData';
import { pushEcommerce } from '@/lib/datalayer';

const allProducts = productsData as unknown as Product[];
const adventures = allProducts.filter(p => p.type === 'adventure' && p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

// Build per-slug lookups from experienceDetails.json in a single pass
const experienceRatings: Record<string, { value: number; count: number }> = {};
const experienceData: Record<string, { experienceCategory: string; priceOta: number }> = {};
((experienceDetailsData as any).experiences || []).forEach((exp: any) => {
  if (!exp.slug) return;
  if (exp.aggregateRating) {
    experienceRatings[exp.slug] = { value: exp.aggregateRating.value, count: exp.aggregateRating.count };
  }
  experienceData[exp.slug] = {
    experienceCategory: exp.experienceCategory || '',
    priceOta: exp.priceOta || 0,
  };
});

export default function Adventures() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Experiences in Portugal | Horseback Riding, Canyoning & Surfing', description: 'Guided experiences across Portugal — horseback riding, canyoning, surfing, hiking, wine tours & more. Book direct in Minho, Porto or Algarve.', url: '/experiences' });

  const adventuresGraph = useMemo(
    () => [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: 'Adventure Activities in Portugal',
        description: 'Guided outdoor adventures across Portugal including horseback riding, canyoning, surfing and more.',
        url: 'https://www.portugalactive.com/adventures',
        numberOfItems: adventures.length,
        itemListElement: adventures.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: a.name,
          description: a.tagline || a.name,
          url: 'https://www.portugalactive.com/adventures',
          ...(a.image && { image: a.image }),
          ...(a.priceFrom && { offers: { '@type': 'Offer', priceCurrency: 'EUR', price: a.priceFrom } }),
        })),
      },
      buildFaqPageSchema([
        {
          question: 'What adventure activities are available in Portugal?',
          answer: 'Portugal Active offers horseback riding, canyoning, surfing lessons, guided hiking, e-bike tours, stand-up paddleboarding, wine tastings, and coasteering. Activities are available across Minho, Porto & Douro, Lisbon, Alentejo and the Algarve.',
        },
        {
          question: 'Do I need prior experience to join your adventure activities?',
          answer: 'Most activities are suitable for all levels. Our guides tailor each experience to the group. Beginners are welcome for surfing, horseback riding, and hiking. Some activities like canyoning have basic fitness requirements — our team will advise when you enquire.',
        },
        {
          question: 'Can I book adventure activities as part of my villa stay?',
          answer: 'Yes. All adventure activities can be booked alongside your villa stay with Portugal Active. Our concierge team will build a bespoke itinerary combining your villa, activities, private chef, and transfers into a single plan.',
        },
        {
          question: 'Where in Portugal do your adventures take place?',
          answer: 'Activities are available across Portugal — Minho Coast (Viana do Castelo area), Porto & Douro Valley, Lisbon & Sintra, Alentejo, and the Algarve. Location depends on the specific activity; our team will confirm the meeting point when you book.',
        },
      ]),
    ],
    [],
  );
  const [destination, setDestination] = useState('all');

  const DESTINATIONS = useMemo(() => [
    { label: t('adventures.allDestinations'), value: 'all' },
    { label: t('destinations.minho'), value: 'minho' },
    { label: t('destinations.porto'), value: 'porto' },
    { label: t('destinations.lisbon'), value: 'lisbon' },
    { label: t('destinations.alentejo'), value: 'alentejo' },
    { label: t('destinations.algarve'), value: 'algarve' },
  ], [t]);

  const filtered = useMemo(() => {
    if (destination === 'all') return adventures;
    return adventures.filter(a => a.destinations.includes(destination as DestinationSlug));
  }, [destination]);

  // GA4 view_item_list refs — same pattern as Homes.tsx
  const cardDataRef = useRef<Map<string, { adventure: Product; index: number }>>(new Map());
  const slugToElementRef = useRef<Map<string, Element>>(new Map());
  const elementToSlugRef = useRef<Map<Element, string>>(new Map());
  const pendingItemsRef = useRef<Map<string, { adventure: Product; index: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  // GA4: view_item_list — fires only for adventure cards that enter the viewport
  useEffect(() => {
    observerRef.current?.disconnect();
    pendingItemsRef.current.clear();

    observerRef.current = new IntersectionObserver((entries) => {
      let hasNew = false;
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const slug = elementToSlugRef.current.get(entry.target);
          if (slug) {
            const data = cardDataRef.current.get(slug);
            if (data) {
              pendingItemsRef.current.set(slug, data);
              hasNew = true;
            }
          }
        }
      }
      if (!hasNew) return;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(() => {
        if (pendingItemsRef.current.size === 0) return;
        const items = Array.from(pendingItemsRef.current.values())
          .sort((a, b) => a.index - b.index)
          .map(({ adventure, index }) => {
            const expData = experienceData[adventure.slug];
            return {
              item_id: `EXP-${adventure.slug}`,
              item_name: adventure.name,
              item_category: expData?.experienceCategory || '',
              price: expData?.priceOta || adventure.priceFrom || 0,
              quantity: 1,
              index,
            };
          });
        pushEcommerce({
          event: 'view_item_list',
          ecommerce: {
            item_list_id: 'experiences_listing',
            item_list_name: 'Experiences',
            items,
          },
        });
        pendingItemsRef.current.clear();
      }, 200);
    }, { threshold: 0.5 });

    slugToElementRef.current.forEach((el) => observerRef.current!.observe(el));

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      pendingItemsRef.current.clear();
    };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <StructuredData id="adventures-graph" data={adventuresGraph} />
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img src="https://images.unsplash.com/photo-1598535110134-69469a0e71e3?w=1600&q=80" alt="Ponta da Piedade cliffs in Lagos, Algarve – adventure experiences in Portugal" className="absolute inset-0 w-full h-full object-cover" width={1600} height={1067} fetchPriority="high" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <h1 className="headline-xl text-white mb-4">{t('adventures.title')}</h1>
          <p className="body-lg max-w-lg text-white/95">
            {t('adventures.subtitle')}
          </p>
        </div>
      </section>

      {/* Filter Bar */}
      <div className="sticky top-16 md:top-20 z-30 bg-[#FAFAF7]/95 backdrop-blur-md border-b border-[#E8E4DC]">
        <div className="container py-3 md:py-4">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0">
            <MapPin className="w-4 h-4 text-[#9E9A90] shrink-0" />
            {DESTINATIONS.map(d => (
              <button
                key={d.value}
                onClick={() => setDestination(d.value)}
                className={`px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-all border shrink-0 ${
                  destination === d.value
                    ? 'bg-[#1A1A18] text-white border-[#1A1A18]'
                    : 'bg-transparent text-[#6B6860] border-[#E8E4DC] hover:border-[#1A1A18] hover:text-[#1A1A18]'
                }`}
                style={{ minHeight: '44px', minWidth: 'auto' }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Adventures Grid */}
      <section className="section-padding">
        <div className="container">
          <h2 className="sr-only">{t('adventures.availableAdventures')}</h2>
          <p className="text-[13px] text-[#9E9A90] mb-6">
            {t('adventures.available', { count: filtered.length })}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((adventure, index) => {
              const rating = experienceRatings[adventure.slug];
              return (
                <div
                  key={adventure.id}
                  ref={(el) => {
                    if (el) {
                      cardDataRef.current.set(adventure.slug, { adventure, index: index + 1 });
                      elementToSlugRef.current.set(el, adventure.slug);
                      slugToElementRef.current.set(adventure.slug, el);
                      observerRef.current?.observe(el);
                    } else {
                      const existing = slugToElementRef.current.get(adventure.slug);
                      if (existing) {
                        observerRef.current?.unobserve(existing);
                        elementToSlugRef.current.delete(existing);
                        slugToElementRef.current.delete(adventure.slug);
                      }
                      cardDataRef.current.delete(adventure.slug);
                    }
                  }}
                >
                  <Link
                    href={`/experiences/${adventure.slug}`}
                    className="group block"
                    onClick={() => {
                      const expData = experienceData[adventure.slug];
                      pushEcommerce({
                        event: 'select_item',
                        ecommerce: {
                          item_list_id: 'experiences_listing',
                          item_list_name: 'Experiences',
                          items: [{
                            item_id: `EXP-${adventure.slug}`,
                            item_name: adventure.name,
                            item_category: expData?.experienceCategory || '',
                            price: expData?.priceOta || adventure.priceFrom || 0,
                            quantity: 1,
                            index: index + 1,
                          }],
                        },
                      });
                    }}
                  >
                    <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '4/5' }}>
                      {adventure.image ? (
                        <img src={adventure.image} alt={`${adventure.name} – guided experience in Portugal`} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" loading="lazy" />
                      ) : (
                        <div className="w-full h-full placeholder-image" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                      {adventure.destinations.length > 0 && (
                        <span className="absolute top-4 left-4 max-w-[60%] text-[10px] tracking-[0.12em] uppercase text-white/90 font-medium leading-relaxed">
                          {adventure.destinations.join(' · ')}
                        </span>
                      )}
                      {(adventure as any).videoUrl && (
                        <span className="absolute top-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-[10px] tracking-[0.08em] uppercase font-medium px-2.5 py-1.5">
                          <Play className="w-3 h-3 fill-current" /> {t('adventures.videoLabel')}
                        </span>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <h3 className="font-display text-[1.5rem] text-white leading-tight mb-1">
                          {adventure.name}
                        </h3>
                        <p className="text-[13px] text-white/80 font-light line-clamp-2">{adventure.tagline}</p>
                      </div>
                    </div>

                    {/* Card metadata row — price, duration, rating, free cancellation */}
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        {(adventure.priceFrom ?? 0) > 0 && (
                          <p className="text-[13px] text-[#1A1A18] font-medium">
                            {t('common.from')} {formatEurEditorial(adventure.priceFrom ?? 0)} <span className="text-[12px] text-[#9E9A90] font-light">{adventure.priceSuffix}</span>
                          </p>
                        )}
                        {rating && (
                          <span className="text-[12px] text-[#8B7355] italic" style={{ fontWeight: 400 }}>
                            {rating.value.toFixed(1)}/5
                            <span className="text-[#9E9A90] not-italic ml-1" style={{ fontWeight: 300 }}>({rating.count})</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 flex-wrap">
                        {adventure.duration && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-[#6B6860]" style={{ fontWeight: 300 }}>
                            <Clock className="w-3 h-3 text-[#9E9A90]" />
                            {adventure.duration}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#6B8E4E]" style={{ fontWeight: 300 }}>
                          <Check className="w-3 h-3" />
                          {t('adventures.freeCancellation')}
                        </span>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-20">
              <p className="text-[#6B6860] text-lg mb-6">
                {t('adventures.noAdventures')}
              </p>
              <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
                {t('adventures.talkToTeam')}
              </a>
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="section-padding text-center bg-[#F5F1EB]">
        <div className="container max-w-lg mx-auto">
          <h3 className="headline-md mb-4 text-[#1A1A18]">{t('adventures.customTitle')}</h3>
          <p className="body-md mb-8">
            {t('adventures.customBody')}
          </p>
          <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
            {t('adventures.customCta')}
          </a>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
