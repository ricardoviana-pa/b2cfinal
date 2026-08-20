/* ==========================================================================
   COLLECTION — programmatic SEO landing pages built from live catalogue data
   ("Villas with private pool", "Sea-view villas", …). One config entry in
   collections.json = one indexable page: real listings, localized intro,
   ItemList JSON-LD, and cross-links between collections. The acquisition
   channel this site can grow without buying a single click.
   ========================================================================== */
import { useMemo } from 'react';
import { Link, useParams } from 'wouter';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { usePageMeta } from '@/hooks/usePageMeta';
import type { Property } from '@/lib/types';
import { isChildUnit } from '@/config/propertyGroups';
import collectionsData from '@/data/collections.json';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import NotFound from '@/pages/NotFound';

interface CollectionDef {
  slug: string;
  filter: { type: string; pattern?: string; min?: number };
  excludeApartments?: boolean;
  en: { title: string; metaDescription: string; intro: string };
  pt: { title: string; metaDescription: string; intro: string };
}
const COLLECTIONS = collectionsData as CollectionDef[];

function matches(p: Property, def: CollectionDef): boolean {
  if (def.excludeApartments && (p as any).propertyType === 'Apartment') return false;
  const f = def.filter;
  if (f.type === 'minGuests') return (p.maxGuests ?? 0) >= (f.min ?? 0);
  if (f.type === 'amenity' && f.pattern) {
    const re = new RegExp(f.pattern, 'i');
    const all = Object.values((p.amenities ?? {}) as Record<string, string[]>)
      .flatMap(v => (Array.isArray(v) ? v : []));
    return all.some(a => re.test(a));
  }
  return false;
}

export default function Collection() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const def = COLLECTIONS.find(c => c.slug === slug);

  const { data: propsData } = trpc.properties.listForSite.useQuery();
  const lang = (i18n.language || 'en').split('-')[0];
  const copy = def ? (lang === 'pt' ? def.pt : def.en) : null;

  const homes = useMemo(() => {
    if (!def || !propsData) return [] as Property[];
    return (propsData as Property[])
      .filter(p => p.isActive !== false && !isChildUnit(p.guestyId))
      .filter(p => matches(p, def));
  }, [propsData, def]);

  const fromIds = useMemo(() => homes.filter(h => h.guestyId).map(h => h.guestyId!), [homes]);
  const { data: fromPrices } = trpc.booking.lowestNightlyBatch.useQuery(
    { listingIds: fromIds },
    { enabled: fromIds.length > 0, staleTime: 5 * 60 * 1000 },
  );

  usePageMeta({
    title: copy ? `${copy.title} | Portugal Active` : 'Collection | Portugal Active',
    description: copy?.metaDescription ?? '',
    url: `/collections/${slug}`,
  });

  const graph = useMemo(() => {
    if (!def || !copy || !homes.length) return null;
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        name: copy.title,
        numberOfItems: homes.length,
        itemListElement: homes.slice(0, 30).map((p, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: p.name,
          url: `https://www.portugalactive.com/homes/${p.slug}`,
        })),
      },
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Homes', item: '/homes' },
        { name: copy.title },
      ]),
    ];
  }, [def, copy, homes]);

  if (!def || !copy) return <NotFound />;

  const others = COLLECTIONS.filter(c => c.slug !== slug);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {graph && <StructuredData id={`collection-${slug}`} data={graph} />}
      <Header />
      <section className="container pt-28 md:pt-32 pb-6">
        <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#806A48] mb-3">
          {t('collections.eyebrow', 'Curated collection')}
        </p>
        <h1 className="font-display text-[clamp(1.8rem,4vw,2.6rem)] font-light text-[#1A1A18] mb-3" style={{ textWrap: 'balance' as any }}>
          {copy.title}
        </h1>
        <p className="text-[15px] text-[#726D63] max-w-[62ch] leading-relaxed" style={{ fontWeight: 300 }}>
          {copy.intro}
        </p>
        {homes.length > 0 && (
          <p className="text-[13px] text-[#726D63] mt-3">
            {t('collections.count', '{{count}} homes in this collection', { count: homes.length })}
          </p>
        )}
      </section>

      <section className="container pb-12 md:pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
          {homes.map((property, idx) => (
            <PropertyCard
              key={property.id}
              property={property}
              listId={`collection_${slug}`}
              listName={copy.title}
              itemIndex={idx}
              fromPrice={fromPrices?.[property.guestyId ?? '']}
            />
          ))}
        </div>
      </section>

      {/* Cross-links — internal linking is the point of a programmatic set */}
      <section className="container pb-16">
        <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#806A48] mb-4">
          {t('collections.more', 'More collections')}
        </p>
        <div className="flex flex-wrap gap-2">
          {others.map(c => (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="min-h-[40px] inline-flex items-center px-4 border border-[#E8E4DC] bg-white text-[13px] text-[#1A1A18] hover:border-[#8B7355] transition-colors"
            >
              {(lang === 'pt' ? c.pt : c.en).title}
            </Link>
          ))}
        </div>
      </section>
      <Footer />
    </div>
  );
}
