/* ==========================================================================
   DESTINATIONS HUB — 2026-05 redesign
   ========================================================================

   Hub-and-spoke entry point per the destinations strategy doc (May 2026).
   Destinations are grouped visually by region (Minho, Porto & Douro,
   Lisbon, Alentejo, Algarve) — the URLs themselves stay flat
   (/destinations/[slug]) per the doc's SEO scheme. Coming-soon destinations
   sit in their own block at the bottom with a darker veil.
   ========================================================================== */

import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import destinationsData from '@/data/destinations.json';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import { IMAGES } from '@/lib/images';
import type { Destination, DestinationRegion } from '@/lib/types';

const destinations = destinationsData as unknown as Destination[];

const REGION_LABEL: Record<DestinationRegion, string> = {
  minho: 'Minho',
  porto: 'Porto & Douro',
  lisbon: 'Lisbon',
  alentejo: 'Alentejo',
  algarve: 'Algarve',
  brazil: 'Brazil',
};

const REGION_ORDER: DestinationRegion[] = ['minho', 'porto', 'lisbon', 'alentejo', 'algarve'];

function DestinationCard({ dest }: { dest: Destination }) {
  return (
    <Link
      href={`/destinations/${dest.slug}`}
      className="group relative overflow-hidden block"
      style={{ aspectRatio: '3/4' }}
    >
      {dest.coverImage ? (
        <img
          src={dest.coverImage}
          alt={dest.name}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 placeholder-image" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8">
        <h3 className="headline-md text-white mb-1">{dest.name}</h3>
        <p className="text-[14px] text-white/70" style={{ fontWeight: 300 }}>{dest.tagline}</p>
      </div>
    </Link>
  );
}

export default function Destinations() {
  const { t } = useTranslation();
  usePageMeta({
    title: 'Destinations in Portugal | Minho, Porto, Algarve & More',
    description: 'Explore our luxury villa destinations across Portugal — Minho Coast, Porto & Douro, Algarve, Lisbon, Alentejo. Find your perfect region.',
    url: '/destinations',
  });

  const active = destinations.filter(d => !d.comingSoon);
  // Brazil is excluded from the "Coming soon" strip too — we're not ready
  // to reveal the expansion publicly. The entry still exists in
  // destinations.json so /destinations/brazil keeps working for direct
  // links; once we launch, flip its `status` to 'active' and
  // `comingSoon` to false in destinations.json — no code change needed.
  const comingSoon = destinations.filter(d => d.comingSoon && d.slug !== 'brazil');

  // Hub policy (HOT FIX 2026-05-25): the public destinations hub shows ONLY
  // region-hub entries (slug === region slug). City-level spokes
  // (viana-do-castelo, caminha, esposende, douro) still have live pages and
  // appear in sitemap/SSR/related-destinations cross-links, but they are
  // intentionally hidden from the hub grid until their editorial content
  // and photography are production-ready. Promote a spoke by adding
  // `publicHub: true` to its destinations.json entry once it is ready.
  const hubItems = active.filter(d => d.slug === d.region || (d as any).publicHub === true);

  const byRegion = REGION_ORDER.map(region => {
    const items = hubItems
      .filter(d => d.region === region)
      .sort((a, b) => {
        if (a.slug === region) return -1;
        if (b.slug === region) return 1;
        return a.name.localeCompare(b.name);
      });
    return { region, items };
  }).filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <StructuredData
        id="destinations-breadcrumb"
        data={buildBreadcrumbSchema([
          { name: 'Home', item: '/' },
          { name: 'Destinations' },
        ])}
      />
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img
          src={IMAGES.destinationMinho}
          alt="Portugal destinations"
          className="absolute inset-0 w-full h-full object-cover"
          width={1600}
          height={900}
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <h1 className="headline-xl text-white mb-3">{t('destinationsPage.title')}</h1>
          <p className="body-lg max-w-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('destinationsPage.subtitle')}
          </p>
        </div>
      </section>

      {/* Destination grid — flat (one card per region hub). Region grouping
          re-engages automatically once we promote city-level spokes via
          `publicHub: true` on individual destinations.json entries. */}
      <section className="section-padding">
        <div className="container">
          <h2 className="sr-only">{t('destinationsPage.titleFull')}</h2>

          {byRegion.length === 1 || byRegion.every(g => g.items.length <= 1) ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {byRegion.flatMap(g => g.items).map(d => (
                <DestinationCard key={d.slug} dest={d} />
              ))}
            </div>
          ) : (
            byRegion.map(group => (
              <div key={group.region} className="mb-16 last:mb-0">
                <div className="flex items-baseline justify-between mb-6 border-b border-[#E8E4DC] pb-3">
                  <h3 className="text-[12px] font-medium tracking-[0.14em] uppercase text-[#8B7355]">
                    {REGION_LABEL[group.region]}
                  </h3>
                  <span className="text-[12px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
                    {group.items.length} destination{group.items.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {group.items.map(d => <DestinationCard key={d.slug} dest={d} />)}
                </div>
              </div>
            ))
          )}

          {/* Coming soon — Brazil et al. */}
          {comingSoon.length > 0 && (
            <div className="mt-16 border-t border-[#E8E4DC] pt-10">
              <h3 className="text-[12px] font-medium tracking-[0.14em] uppercase text-[#9E9A90] mb-6">
                {t('common.comingSoon')}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {comingSoon.map(dest => (
                  <div
                    key={dest.slug}
                    className="relative overflow-hidden"
                    style={{ aspectRatio: '3/4' }}
                  >
                    {dest.coverImage ? (
                      <img
                        src={dest.coverImage}
                        alt={dest.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="absolute inset-0 placeholder-image" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30" />
                    <div className="absolute top-5 left-5">
                      <span className="text-[10px] font-medium tracking-[0.14em] uppercase text-white/90">
                        {t('common.comingSoon')}
                      </span>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8">
                      <h3 className="headline-md text-white mb-1">{dest.name}</h3>
                      <p className="text-[14px] text-white/80" style={{ fontWeight: 300 }}>
                        {dest.tagline}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
