/* ==========================================================================
   DESTINATION DETAIL — 2026-05 redesign
   ========================================================================

   Composes the 11-section <DestinationPage /> template defined by the
   destinations strategy doc (May 2026, hub-and-spoke editorial). This page
   is now a thin data-resolution layer: it looks the destination up by slug,
   filters the properties / adventures / related destinations, builds the
   schema graph, and hands everything to the template.

   AnswerCapsule remains above the editorial content as the AI-engine TL;DR
   (QAPage schema). The full FAQPage schema lives inside the template, in
   the FAQ section, only when faqs are populated for that destination.
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
import AnswerCapsule from '@/components/seo/AnswerCapsule';
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

  // Blog tagging by destination is not yet wired up site-side. Once the
  // blog gets a `destinations: DestinationSlug[]` field, populate this from
  // the blog data source. Until then, section 4 (TheJournal) self-suppresses.
  const articles: never[] = [];

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {graph && <StructuredData id={`destination-${dest.slug}`} data={graph} />}
      <Header />

      {/* AnswerCapsule sits between hero and editorial body — its role is to
          give AI engines (ChatGPT, Perplexity, Claude, Gemini) a citable
          TL;DR with QAPage schema. The full FAQPage schema lives in the
          FAQ section inside <DestinationPage />. */}
      <DestinationPage
        destination={dest}
        properties={destProperties}
        articles={articles}
        adventures={adventures}
        related={related}
        onAddToItinerary={p => setModalProduct(p)}
      />

      <section className="py-10 bg-[#FAFAF7]">
        <div className="container max-w-3xl mx-auto">
          <AnswerCapsule
            question={`Why stay in ${dest.name} with Portugal Active?`}
            answer={`${dest.name} is one of Portugal Active's curated destinations, featuring ${destProperties.length} private hotel${destProperties.length !== 1 ? 's' : ''} managed to five-star standards. ${dest.tagline || dest.description || ''} Every property includes a dedicated concierge, daily housekeeping, and access to private chef and curated local experiences. Book direct for the best rate and a fully managed stay.`}
            lastUpdated="2026-05-23"
            author="Portugal Active concierge team"
            emitSchema={!dest.faqs || dest.faqs.length === 0}
            schemaId={`qa-dest-${dest.slug}`}
            cite={[
              { label: `${dest.name} properties`, href: `/homes?destination=${dest.region}` },
              { label: 'All destinations', href: '/destinations' },
              { label: 'Concierge services', href: '/concierge' },
            ]}
          />
        </div>
      </section>

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
