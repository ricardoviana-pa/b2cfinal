/* ==========================================================================
   NEWSLETTER BLOCK — inline capture at the end of a home page (origin
   "house", title names the house) and at the end of a Journal article
   (origin "article"). Server-rendered like the sections around it, no image,
   same #FAFAF7 / #E8E4DC palette. Only shown in the languages the server
   lists in newsletter.config.locales (Portuguese until ES and EN have native
   review): the query resolves on the client, so the block appears below the
   fold after hydration and never shifts visible content.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import NewsletterForm from './NewsletterForm';

interface NewsletterBlockProps {
  origin: 'house' | 'article';
  propertySlug?: string;
  propertyName?: string;
}

export default function NewsletterBlock({ origin, propertySlug, propertyName }: NewsletterBlockProps) {
  const { t, i18n } = useTranslation();
  // Client-only: the server render has no config and would fetch a relative URL.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const config = trpc.newsletter.config.useQuery(undefined, {
    enabled: mounted,
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const lang = (i18n.language || 'en').slice(0, 2);
  if (!config.data || !config.data.locales.includes(lang)) return null;

  const title = origin === 'house' && propertyName
    ? t('newsletter.block.titleHouse', { house: propertyName })
    : t('newsletter.block.titleArticle');

  return (
    <section
      className="py-12 lg:py-16 border-t border-b border-[#E8E4DC]"
      style={{ backgroundColor: '#FAFAF7' }}
      aria-labelledby="newsletter-block-title"
      data-nl-block={origin}
    >
      <div className="container">
        <div className="max-w-2xl mx-auto text-center">
          <p className="eyebrow font-semibold tracking-[0.2em] uppercase text-pa-gold mb-3">{t('newsletter.block.overline')}</p>
          <h2 id="newsletter-block-title" className="font-display headline-md font-light leading-[1.3] text-pa-dark mb-4">{title}</h2>
          <p className="body-sm text-pa-earth leading-relaxed font-light mb-7">{t('newsletter.block.body')}</p>
          <div className="max-w-md mx-auto text-left">
            <NewsletterForm origin={origin} propertySlug={origin === 'house' ? propertySlug : undefined} />
            <p className="mt-3 text-[11px] text-[#78756F] text-center" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
              {t('newsletter.block.note')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
