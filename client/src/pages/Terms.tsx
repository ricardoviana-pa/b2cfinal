/**
 * Terms — Portugal Active
 * Design: Le Collectionist-inspired. Clean legal page.
 */
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function Terms() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Terms of Service' });
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <div className="pt-[72px]" />
      <section className="section-padding">
        <div className="container max-w-[800px] mx-auto">
          <p className="overline mb-4">{t('terms.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-8">{t('terms.title')}</h1>
          <div>
            <p className="body-lg mb-6" style={{ textTransform: 'none' }}>{t('terms.lastUpdated')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s1Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s1Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s2Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s2Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s3Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s3Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s4Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s4Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s5Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s5Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s6Title')}</h2>
            <p className="body-md" style={{ textTransform: 'none' }}>{t('terms.s6Body')}</p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
