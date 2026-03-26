/**
 * Privacy — Portugal Active
 * Design: Le Collectionist-inspired. Clean legal page.
 */
import { useTranslation } from 'react-i18next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function Privacy() {
  const { t } = useTranslation();
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
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.section1.title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.section1.body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.section2.title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.section2.body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.section3.title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.section3.body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.section4.title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('privacy.section4.body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('privacy.section5.title')}</h2>
            <p className="body-md" style={{ textTransform: 'none' }}>{t('privacy.section5.body')}</p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
