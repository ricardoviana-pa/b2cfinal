/* ==========================================================================
   DESTINATION DETAIL — 2026-05 redesign (Pass 3)
   ========================================================================

   Thin data-resolution layer that hands data to <DestinationPage />.
   Looks the destination up by slug, filters properties + adventures by
   region, resolves related destinations (preferring the explicit
   relatedDestinations array, falling back to same-region siblings),
   builds the JSON-LD schema graph, and renders.

   The previous QAPage AnswerCapsule was removed in Pass 3 — the rich
   11-item FAQPage emitted by the template + the editorial body now
   carry the AI-engine citation load, and the bottom-of-page AnswerCapsule
   was awkward visually against the dual-funnel CTA below the related
   destinations.
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
import productsData from '@/data/products.json';
import { trpc } from '@/lib/trpc';
import { StructuredData } from '@/components/seo/StructuredData';
import { DestinationPage, buildDestinationGraph } from '@/components/destinations';
import type { Destination, Property, Product } from '@/lib/types';

const destinations = destinationsData as unknown as Destination[];
const allProducts = productsData as unknown as Product[];

export default function DestinationDetail() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const { data: propsData } = trpc.properties.listForSite.useQuery();
  const allProperties = ((propsData ?? []).filter(
    (p: any) => p.isActive !== false,
  )) as Property[];

  const dest = destinations.find(d => d.slug === slug);

  usePageMeta({
    title: dest?.seoTitle ?? (dest ? `${dest.name} Portugal | Luxury Villas and Experiences` : undefined),
    description: dest?.seoDescription ?? (dest ? `Discover ${dest.name}. Private villas with pool, concierge, and curated experiences.`.slice(0, 155) : undefined),
    image: dest?.coverImage,
    url: dest ? `/destinations/${dest.slug}` : undefined,
  });

  const [modalProduct, setModalProduct] = useState<Product | null>(null);

  const destProperties = useMemo(() => {
    if (!dest) return [];
    return allProperties.filter(p => p.destination === dest.region);
  }, [dest, allProperties]);

  const adventures = useMemo<Product[]>(() => {
    if (!dest) return [];
    return allProducts.filter(
      p => p.type === 'adventure' && p.isActive && p.destinations.includes(dest.region),
    );
  }, [dest]);

  const related = useMemo<Destination[]>(() => {
    if (!dest) return [];
    const explicit = dest.relatedDestinations ?? dest.relatedSlugs;
    const slugs = explicit && explicit.length > 0
      ? explicit
      : destinations
          .filter(d => d.region === dest.region && d.slug !== dest.slug && !d.comingSoon)
          .map(d => d.slug);
    const ordered = slugs
      .map(s => destinations.find(d => d.slug === s))
      .filter((d): d is Destination => !!d && !d.comingSoon);
    return ordered.slice(0, 3);
  }, [dest]);

  const graph = useMemo(() => (dest ? buildDestinationGraph(dest, destProperties) : null), [
    dest,
    destProperties,
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

  // Blog tagging by destination is not yet wired up site-side. When the
  // blog gets a `destinations: DestinationSlug[]` field, populate this from
  // the blog data source. Until then, section 4 (TheJournal) self-suppresses.
  const articles: never[] = [];

  // Per-destination WhatsApp link — fed into the sticky bottom CTA so the
  // concierge button has a real target on mobile.
  const whatsappUrl = `https://wa.me/351258358434?text=${encodeURIComponent(
    `Hi Portugal Active concierge, I'd like to learn more about a stay in ${dest.name}.`,
  )}`;

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
        whatsappUrl={whatsappUrl}
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
