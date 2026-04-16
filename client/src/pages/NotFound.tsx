import { useMemo } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import PropertyCard from '@/components/property/PropertyCard';
import { trpc } from '@/lib/trpc';
import type { Property } from '@/lib/types';

export default function NotFound() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Page Not Found (404)', description: 'This page does not exist. Browse our luxury villas or contact our concierge team for help.', url: '/404' });

  const { data: propsData } = trpc.properties.listForSite.useQuery();
  const suggestions = useMemo(() => {
    const all = ((propsData ?? []) as Property[]).filter(p => p.isActive !== false);
    if (all.length <= 3) return all;
    const shuffled = [...all].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }, [propsData]);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      <section className="py-20 md:py-28 lg:py-32">
        <div className="container max-w-[1100px]">
          <div className="text-center mb-16 md:mb-20">
            <p className="overline mb-5" style={{ color: '#C4A87C' }}>{t('notFound.overline')}</p>
            <h1
              className="font-display font-light text-[#1A1A18] mb-4"
              style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)', lineHeight: 1.15 }}
            >
              {t('notFound.title')}
            </h1>
            <p className="body-lg max-w-md mx-auto mb-8" style={{ color: '#6B6860' }}>
              {t('notFound.body')}
            </p>
            <Link href="/homes" className="btn-primary inline-flex items-center">
              {t('notFound.cta')}
            </Link>
          </div>

          {suggestions.length > 0 && (
            <div>
              <p className="overline text-center mb-8">{t('notFound.suggestions')}</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                {suggestions.map(property => (
                  <PropertyCard key={property.id} property={property} />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}
