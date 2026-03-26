/**
 * Cookie Policy — Portugal Active
 */
import { useTranslation } from 'react-i18next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function Cookies() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header variant="solid" />
      <div className="pt-28 md:pt-36 pb-16">
        <div className="container max-w-3xl mx-auto">
          <h1 className="headline-lg mb-8" style={{ color: '#1A1A18' }}>{t('cookiesPage.title')}</h1>
          <div className="space-y-6 text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', lineHeight: 1.8 }}>
            <p>{t('cookiesPage.lastUpdated')}</p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.section1.title')}</h2>
            <p>
              {t('cookiesPage.section1.body')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.section2.title')}</h2>
            <p>{t('cookiesPage.section2.intro')}</p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.section2.essential.title')}</h3>
            <p>
              {t('cookiesPage.section2.essential.body')}
            </p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.section2.analytics.title')}</h3>
            <p>
              {t('cookiesPage.section2.analytics.body')}
            </p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.section2.functional.title')}</h3>
            <p>
              {t('cookiesPage.section2.functional.body')}
            </p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.section2.marketing.title')}</h3>
            <p>
              {t('cookiesPage.section2.marketing.body')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.section3.title')}</h2>
            <p>
              {t('cookiesPage.section3.body')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.section4.title')}</h2>
            <p>
              {t('cookiesPage.section4.body')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.section5.title')}</h2>
            <p>
              {t('cookiesPage.section5.body')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.section6.title')}</h2>
            <p>
              {t('cookiesPage.section6.intro')}{' '}
              <a href="mailto:info@portugalactive.com" className="text-[#8B7355] hover:text-[#1A1A18] transition-colors">
                {t('cookiesPage.section6.email')}
              </a>.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
