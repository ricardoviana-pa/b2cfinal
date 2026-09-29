/* ==========================================================================
   NEWSLETTER BLOCK — inline capture.
     origin "house": end of a house page. On a PA house the house is recorded
       as the interest; the title is "Quer saber quando esta casa tiver datas
       livres ou preço de época baixa?" when the alert rule is on
       (newsletter.config.houseAlerts), "Gostou desta casa?" otherwise.
       Partner homes (Tripwix) get the general text.
     origin "article": end of a Journal article, general text.
   Only in the languages of newsletter.config.locales. In the server render
   too (see useNewsletterConfig), so it does not push anything after hydration.
   ========================================================================== */

import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useMobile';
import NewsletterForm from './NewsletterForm';
import { useNewsletterConfig } from './useNewsletterConfig';

interface NewsletterBlockProps {
  origin: 'house' | 'article';
  propertySlug?: string;
  /** False on partner homes: general title, no house recorded. */
  promotableHouse?: boolean;
}

export default function NewsletterBlock({ origin, propertySlug, promotableHouse = false }: NewsletterBlockProps) {
  const { t, i18n } = useTranslation();
  const config = useNewsletterConfig();
  const isMobile = useIsMobile();

  const lang = (i18n.language || 'en').slice(0, 2);
  if (!config.data?.available || !config.data.locales.includes(lang)) return null;

  const houseMode = origin === 'house' && promotableHouse && !!propertySlug;
  // The alert promise only when the server says the CRM rule is on.
  const copy = houseMode ? (config.data.houseAlerts ? 'newsletter.house' : 'newsletter.houseInterest') : 'newsletter.generic';
  const titleId = `nl-block-title-${origin}`;

  return (
    <section
      className="py-12 lg:py-16 border-t border-[#E8E4DC]"
      style={{ backgroundColor: '#FAFAF7' }}
      aria-labelledby={titleId}
      data-nl-block={origin}
    >
      <div className="container">
        <div className="max-w-2xl mx-auto text-center">
          <p className="eyebrow font-semibold tracking-[0.2em] uppercase text-[#806A48] mb-3">{t(`${copy}.overline`)}</p>
          <h2 id={titleId} className="font-display headline-md font-light leading-[1.3] text-pa-dark mb-4">{t(`${copy}.title`)}</h2>
          <p className="body-sm text-pa-earth leading-relaxed font-light mb-7">{t(`${copy}.body`)}</p>
          <div className="max-w-md mx-auto text-left">
            <NewsletterForm
              origin={origin}
              propertySlug={houseMode ? propertySlug : undefined}
              device={isMobile ? 'mobile' : 'desktop'}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
