/* ==========================================================================
   DESTINATIONS — V1.6 Redesign
   6 destination cards: Minho, Porto, Lisbon, Alentejo, Algarve, Brazil (faded)
   ========================================================================== */

import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import destinationsData from '@/data/destinations.json';
import { trpc } from '@/lib/trpc';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { IMAGES } from '@/lib/images';
import type { Destination, Property } from '@/lib/types';

const destinations = destinationsData as unknown as Destination[];

export default function Destinations() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Destinations in Portugal | Minho, Porto, Algarve & More', description: 'Explore our luxury villa destinations across Portugal — Minho Coast, Porto & Douro, Algarve, Lisbon, Alentejo. Find your perfect region.', url: '/destinations' });
  const { data: propsData } = trpc.properties.listForSite.useQuery();
  const properties = ((propsData ?? []).filter((p: any) => p.isActive !== false)) as Property[];
  const active = destinations.filter(d => !d.comingSoon);
  const comingSoon = destinations.filter(d => d.comingSoon);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img
          src={IMAGES.destinationMinho}
          alt="Portugal destinations"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <h1 className="headline-xl text-white mb-3">{t('destinationsPage.title')}</h1>
          <p className="body-lg max-w-lg" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {t('destinationsPage.subtitle')}
          </p>
        </div>
      </section>

      {/* Destination cards — 3 columns */}
      <section className="section-padding">
        <div className="container">
          <h2 className="sr-only">Portugal Destinations</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {active.map(dest => {
              const homeCount = properties.filter(p => p.destination === dest.slug).length;
              return (
                <Link
                  key={dest.slug}
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
                    <p className="text-[14px] text-white/70 mb-1" style={{ fontWeight: 300 }}>{dest.tagline}</p>
                    <p className="text-[13px] text-white/50">{homeCount > 0 ? t('destinationsPage.home', { count: homeCount }) : t('common.comingSoon')}</p>
                  </div>
                </Link>
              );
            })}

            {/* Brazil — faded */}
            {comingSoon.map(dest => (
              <div
                key={dest.slug}
                className="relative overflow-hidden opacity-50"
                style={{ aspectRatio: '3/4' }}
              >
                {dest.coverImage ? (
                  <img
                    src={dest.coverImage}
                    alt={dest.name}
                    className="absolute inset-0 w-full h-full object-cover grayscale-[40%]"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 placeholder-image" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute top-5 right-5 bg-white/90 backdrop-blur-sm px-3 py-1.5">
                  <span className="text-[11px] font-medium tracking-[0.02em] text-[#1A1A18]">{t('common.comingSoon')}</span>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-6 lg:p-8">
                  <h3 className="headline-md text-white mb-1">{dest.name}</h3>
                  <p className="text-[14px] text-white/70" style={{ fontWeight: 300 }}>{dest.tagline}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
