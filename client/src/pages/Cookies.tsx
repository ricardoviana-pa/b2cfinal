/**
 * Cookie Policy — Portugal Active
 */
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function Cookies() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Cookie Policy' });
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header variant="solid" />
      <div className="pt-28 md:pt-36 pb-16">
        <div className="container max-w-3xl mx-auto">
          <h1 className="headline-lg mb-8" style={{ color: '#1A1A18' }}>{t('cookiesPage.title')}</h1>
          <div className="space-y-6 text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: '15px', lineHeight: 1.8 }}>
            <p>{t('cookiesPage.lastUpdated')}</p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.whatTitle')}</h2>
            <p>
              {t('cookiesPage.whatBody')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.howTitle')}</h2>
            <p>{t('cookiesPage.howBody')}</p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.essentialTitle')}</h3>
            <p>
              {t('cookiesPage.essentialBody')}
            </p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.analyticsTitle')}</h3>
            <p>
              {t('cookiesPage.analyticsBody')}
            </p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.functionalTitle')}</h3>
            <p>
              {t('cookiesPage.functionalBody')}
            </p>

            <h3 className="text-[17px] font-medium !text-[#1A1A18] mt-6">{t('cookiesPage.marketingTitle')}</h3>
            <p>
              {t('cookiesPage.marketingBody')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.managingTitle')}</h2>
            <p>
              {t('cookiesPage.managingBody')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.thirdPartyTitle')}</h2>
            <p>
              {t('cookiesPage.thirdPartyBody')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.updatesTitle')}</h2>
            <p>
              {t('cookiesPage.updatesBody')}
            </p>

            <h2 className="headline-sm !text-[#1A1A18] !mt-10">{t('cookiesPage.contactTitle')}</h2>
            <p>{t('cookiesPage.contactBody')}</p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
