/* ==========================================================================
   CAREERS — Placeholder page
   ========================================================================== */

import { useTranslation } from 'react-i18next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

export default function Careers() {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header variant="solid" />

      {/* Hero */}
      <section className="pt-28 pb-12 bg-[#FAFAF7]">
        <div className="container max-w-2xl">
          <h1 className="headline-lg text-[#1A1A18] mb-4">{t('careers.title')}</h1>
          <p className="body-lg">
            {t('careers.body')}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="pb-20 bg-[#FAFAF7]">
        <div className="container max-w-2xl">
          <div className="bg-white border border-[#E8E4DC] p-8 md:p-12 text-center">
            <h2 className="headline-md text-[#1A1A18] mb-4">{t('careers.lookingTitle')}</h2>
            <p className="body-lg mb-6">
              {t('careers.lookingBody')}
            </p>
            <p className="text-[15px] text-[#6B6860] mb-8" style={{ fontWeight: 300 }}>
              {t('careers.sendCv')}
            </p>
            <a
              href="mailto:careers@portugalactive.com"
              className="btn-primary"
            >
              {t('careers.sendApplication')}
            </a>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
