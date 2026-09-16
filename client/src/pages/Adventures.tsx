/* ==========================================================================
   ADVENTURES — V1.6 Redesign
   Adventure catalogue filtered by destination, with itinerary integration
   ========================================================================== */

import { useState, useMemo, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { MapPin, Clock, ArrowRight, Search, X } from 'lucide-react';
import productsData from '@/data/products.json';
import experienceDetailsData from '@/data/experienceDetails.json';
import { cdnResize, cdnSrcSet } from '@/lib/images';
import type { Product, DestinationSlug } from '@/lib/types';
import { formatEurEditorial } from '@/lib/format';
import { localizeProduct } from '@/lib/localizeProduct';
import EditorialHero from '@/components/marketing/EditorialHero';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildFaqPageSchema } from '@/components/seo/StructuredData';
import { pushEcommerce } from '@/lib/datalayer';
import { localizeDuration } from '@/lib/duration';

const allProducts = productsData as unknown as Product[];
const adventures = allProducts.filter(p => p.type === 'adventure' && p.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

// Build per-slug lookups from experienceDetails.json in a single pass
const experienceData: Record<string, { experienceCategory: string; priceOta: number }> = {};
((experienceDetailsData as any).experiences || []).forEach((exp: any) => {
  if (!exp.slug) return;
  experienceData[exp.slug] = {
    experienceCategory: exp.experienceCategory || '',
    priceOta: exp.priceOta || 0,
  };
});

export default function Adventures() {
  const { t, i18n } = useTranslation();
  usePageMeta({ title: t('adventures.title') + ' | ' + t('services.adventureTitle'), description: t('adventures.subtitle'), url: '/experiences' });

  // Card name/tagline come from products.json (English). Overlay the active
  // language's overrides (products.i18n.json) so cards read in the user's
  // locale instead of always English.
  const localizedAdventures = useMemo(
    () => adventures.map(a => localizeProduct(a, i18n.language) as Product),
    [i18n.language],
  );

  const faqs = useMemo(() => [1, 2].map(n => ({ question: t(`editorial.faq${n}Q`), answer: t(`editorial.faq${n}A`) })), [t]);
  const adventuresGraph = useMemo(() => [{
    '@context': 'https://schema.org', '@type': 'ItemList', name: t('adventures.title'),
    url: `https://www.portugalactive.com/${i18n.language}/experiences`, numberOfItems: localizedAdventures.length,
    itemListElement: localizedAdventures.map((a, i) => ({ '@type': 'ListItem', position: i + 1, name: a.name,
      description: a.tagline || a.name, url: `https://www.portugalactive.com/${i18n.language}/experiences/${a.slug}`,
      ...(a.image && { image: a.image.startsWith('http') ? a.image : `https://www.portugalactive.com${a.image}` }),
    })),
  }, buildFaqPageSchema(faqs)], [localizedAdventures, i18n.language, t, faqs]);
  const [destination, setDestination] = useState('all');
  const [query, setQuery] = useState('');
  const DESTINATIONS = useMemo(() => [
    { label: t('adventures.allDestinations'), value: 'all' },
    ...(['minho', 'porto', 'lisbon', 'alentejo', 'algarve'] as const).map(value => ({ label: t(`destinations.${value}`), value })),
  ], [t]);
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const filtered = useMemo(() => localizedAdventures.filter(a =>
    (destination === 'all' || a.destinations.includes(destination as DestinationSlug)) &&
    normalize(`${a.name} ${a.tagline || ''}`).includes(normalize(query.trim()))
  ), [destination, localizedAdventures, query]);

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
      <EditorialHero image="/experiences/horseback-riding/01.webp" alt={t('adventures.heroAlt')}
        eyebrow={t('services.adventureOverline')} title={t('adventures.title')} description={t('adventures.subtitle')}>
        <a href="#experiences-list" className="btn-white">{t('services.browseExperiences')} <ArrowRight className="h-4 w-4" /></a>
        <Link href="/homes" className="hero-text-link">{t('siteUx.findStay')} <ArrowRight className="h-4 w-4" /></Link>
      </EditorialHero>

      {/* Adventures Grid */}
      <section id="experiences-list" className="section-padding scroll-mt-40">
        <div className="container">
          <div className="catalog-heading">
            <div><p className="editorial-eyebrow text-pa-gold">{t('adventures.allDestinations')}</p>
              <h2 className="headline-lg">{t('services.browseExperiences')}</h2></div>
            <label className="catalog-search"><Search className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sr-only">{t('editorial.searchExperiences')}</span>
              <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('editorial.searchExperiences')} />
            </label>
          </div>
          <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label={t('home.searchDestination')}>
            {DESTINATIONS.map(d => <button key={d.value} type="button" onClick={() => setDestination(d.value)} aria-pressed={destination === d.value}
              className={`pa-action px-4 py-2 text-sm border ${destination === d.value ? 'bg-pa-dark text-white border-pa-dark' : 'bg-white text-pa-dark border-pa-sand hover:border-pa-gold'}`}>{d.label}</button>)}
          </div>
          <div className="flex items-center justify-between gap-4 mb-6 min-h-11">
            <p className="text-sm text-pa-stone" role="status" aria-live="polite">{t('adventures.available', { count: filtered.length })}</p>
            {(destination !== 'all' || query) && <button type="button" className="pa-action inline-flex items-center gap-2 text-sm px-3" onClick={() => { setQuery(''); setDestination('all'); }}><X className="w-4 h-4" />{t('filters.clearAll')}</button>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((adventure, index) => {
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
                    className="catalog-card group h-full"
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
                    <div className="relative aspect-[4/3] overflow-hidden bg-pa-sand">
                      {adventure.image && <img src={cdnResize(adventure.image, 800)} srcSet={cdnSrcSet(adventure.image, [400, 640, 800])}
                        sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw" alt={adventure.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" loading="lazy" width={800} height={600} decoding="async" />}
                    </div>
                    <div className="catalog-card-content">
                      <p className="flex items-start gap-1.5 text-xs text-pa-stone mb-3"><MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                        {adventure.destinations.map(d => t(`destinations.${d}`)).join(' · ')}</p>
                      <h3 className="font-display text-2xl text-pa-dark">{adventure.name}</h3>
                      <p className="body-md mt-2 flex-1">{adventure.tagline}</p>
                      {adventure.duration && <p className="flex items-center gap-2 text-sm text-pa-stone mt-4"><Clock className="w-4 h-4" aria-hidden="true" />{localizeDuration(adventure.duration, t)}</p>}
                      <div className="catalog-card-footer">
                        <p className="text-sm">{(adventure.priceFrom ?? 0) > 0 && <><strong className="font-medium">{t('common.from')} {formatEurEditorial(adventure.priceFrom ?? 0)}</strong> <span className="text-pa-stone">{adventure.priceSuffix}</span></>}</p>
                        <span className="catalog-card-link">{t('siteUx.viewService')} <ArrowRight className="h-4 w-4 shrink-0" /></span>
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
                {t('editorial.noExperiences')}
              </p>
              <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2">
                {t('adventures.talkToTeam')}
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="container pb-16 lg:pb-24 max-w-4xl">
        <h2 className="headline-md mb-6">{t('experienceDetail.beforeYouGo')}</h2>
        {faqs.map(faq => <details key={faq.question} className="site-faq"><summary>{faq.question}</summary><div className="faq-answer body-md">{faq.answer}</div></details>)}
      </section>
      {/* CTA */}
      <section className="section-padding text-center bg-[#F5F1EB]">
        <div className="container max-w-lg mx-auto">
          <h2 className="headline-lg mb-4 text-[#1A1A18]">{t('adventures.customTitle')}</h2>
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
