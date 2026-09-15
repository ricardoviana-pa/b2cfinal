/* ==========================================================================
   DESTINATION DETAIL — 2026-05 redesign
   ========================================================================

   Composes the 11-section <DestinationPage /> template defined by the
   destinations strategy doc (May 2026, hub-and-spoke editorial). This page
   is now a thin data-resolution layer: it looks the destination up by slug,
   filters the properties / adventures / related destinations, builds the
   schema graph, and hands everything to the template.

   The FAQPage schema is emitted with the visible destination FAQs.
   ========================================================================== */

import { useState, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useParams, Link } from 'wouter';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
const AddToItineraryModal = lazy(() => import('@/components/itinerary/AddToItineraryModal'));
import destinationsData from '@/data/destinations.json';
import { localizeDestination, useDestinationOverrides, useContentOverrides, localizeProduct } from '@/lib/localizeContent';
import journalIndex from '@/data/journal-index/en.json';
import destinationJournal from '@/data/destination-journal.json';
import destinationJournalImages from '@/data/destination-journal-images.json';
import productsData from '@/data/products.json';
import { trpc } from '@/lib/trpc';
import { StructuredData } from '@/components/seo/StructuredData';
import { DestinationPage, buildDestinationGraph } from '@/components/destinations';
import type { Destination, Property, Product } from '@/lib/types';
import { uniqueByImage } from '@/lib/destinationImagery';

const destinations = destinationsData as unknown as Destination[];
const allProducts = productsData as unknown as Product[];

export default function DestinationDetail() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  // Homes for this page come from the server (own + partner, by region),
  // SSR-prefetched — the count and the cards are in the served HTML.
  const { data: destHomes } = trpc.properties.forDestination.useQuery(
    { slug: slug ?? '' },
    { enabled: !!slug, staleTime: 5 * 60 * 1000 },
  );

  const journalOverrides = useContentOverrides('journal', i18n.language);
  const destOverrides = useDestinationOverrides(i18n.language);
  const dest = localizeDestination(destinations.find(d => d.slug === slug), destOverrides);

  usePageMeta({
    title: dest?.seoTitle ?? (dest ? `${dest.name} Portugal | Luxury Villas and Experiences` : undefined),
    description: dest?.seoDescription ?? (dest ? `Discover ${dest.name}. Private villas with pool, concierge, and curated experiences.`.slice(0, 155) : undefined),
    image: dest?.regionImage || dest?.coverImage,
    url: dest ? `/destinations/${dest.slug}` : undefined,
    // Drafts (copy still "[TBD]") and coming-soon entries stay out of the index.
    noindex: !!dest && (dest.status !== 'active' || !!dest.comingSoon),
  });

  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const destProperties = useMemo<Property[]>(() => (dest ? ((destHomes ?? []) as Property[]) : []), [dest, destHomes]);

  const adventures = useMemo<Product[]>(() => {
    if (!dest) return [];
    return allProducts.filter(
      p => p.type === 'adventure' && p.isActive && p.destinations.includes(dest.region),
    ).map(p => localizeProduct(p, i18n.language)!);
  }, [dest, i18n.language]);

  const related = useMemo<Destination[]>(() => {
    if (!dest) return [];
    // Prefer the explicit relatedDestinations list (Cowork editorial shape);
    // fall back to the legacy relatedSlugs alias; finally siblings in the
    // same region, excluding self.
    const explicit = dest.relatedDestinations ?? dest.relatedSlugs;
    const slugs = explicit && explicit.length > 0
      ? explicit
      : destinations
          .filter(d => d.region === dest.region && d.slug !== dest.slug && !d.comingSoon)
          .map(d => d.slug);
    const ordered = slugs
      .map(s => localizeDestination(destinations.find(d => d.slug === s), destOverrides))
      .filter((d): d is Destination => !!d && !d.comingSoon && d.status === 'active');
    return ordered.slice(0, 3);
  }, [dest, destOverrides]);

  const graph = useMemo(() => (dest ? buildDestinationGraph(dest, destProperties, 'https://www.portugalactive.com', i18n.language.split('-')[0]) : null), [
    dest,
    destProperties, i18n.language,
  ]);

  if (!dest) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header variant="solid" />
        <div className="container pt-32 pb-20 text-center">
          <h1 className="headline-lg text-[#1A1A18] mb-4">{t('destinationsPage.notFound')}</h1>
          <Link href="/destinations" className="text-[#8B7355] hover:underline">
            {t('destinationsPage.backToDestinations')}
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const index = { ...journalIndex, ...journalOverrides } as Record<string, {slug: string; title: string; excerpt?: string; coverImage?: string}>;
  const articles = uniqueByImage(
    ((destinationJournal as Record<string, string[]>)[dest.slug] || [])
      .map(slug => {
        const article = index[slug];
        if (!article) return null;
        const curatedImage = (destinationJournalImages as Record<string, string>)[slug];
        return curatedImage ? { ...article, coverImage: curatedImage } : article;
      })
      .filter((article): article is NonNullable<typeof article> => !!article),
    [dest.regionImage, dest.coverImage],
    3,
  );

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {graph && <StructuredData id={`destination-${dest.slug}`} data={graph} />}
      <Header />

      <DestinationPage
        destination={dest}
        properties={destProperties}
        articles={articles}
        adventures={adventures}
        related={related}
        onAddToItinerary={p => setModalProduct(p)}
      />



      {modalProduct && (
        <Suspense fallback={null}>
          <AddToItineraryModal
            product={modalProduct}
            isOpen={!!modalProduct}
            onClose={() => setModalProduct(null)}
          />
        </Suspense>
      )}

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
