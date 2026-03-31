/**
 * Privacy — Portugal Active
 * Design: Le Collectionist-inspired. Clean legal page.
 */
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function Privacy() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Privacy Policy', description: 'How Portugal Active collects, uses, and protects your personal data. GDPR-compliant privacy practices for all guests and visitors.', url: '/legal/privacy' });
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <div className="pt-[72px]" />
      <section className="section-padding">
        <div className="container max-w-[800px] mx-auto">
          <p className="overline mb-4">{t('privacy.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-8">{t('privacy.title')}</h1>
          <div>
            <p className="body-lg mb-6" style={{ textTransform: 'none' }}>{t('privacy.lastUpdated')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.s1Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.s1Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.s2Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.s2Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.s3Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.s3Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.s4Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.s4Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.s5Title')}</h2>
            <p className="body-md" style={{ textTransform: 'none' }}>{t('privacy.s5Body')}</p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
