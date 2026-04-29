import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function CancellationPolicy() {
  const { t } = useTranslation();
  usePageMeta({
    title: 'Cancellation Policies',
    description: 'Understand the cancellation and refund policies for Portugal Active villa rentals — Flexible, Firm, Strict, and Non-Refundable rates explained.',
    url: '/legal/cancellation-policy',
  });
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <div className="pt-[72px]" />
      <section className="section-padding">
        <div className="container max-w-[800px] mx-auto">
          <p className="overline mb-4">{t('cancellationPolicy.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-8">{t('cancellationPolicy.pageTitle')}</h1>
          <div>
            <p className="body-lg mb-6" style={{ textTransform: 'none' }}>{t('cancellationPolicy.intro')}</p>
            <h2 id="flexible" className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('cancellationPolicy.flexibleTitle')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('cancellationPolicy.flexibleBody')}</p>
            <h2 id="firm" className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('cancellationPolicy.firmTitle')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('cancellationPolicy.firmBody')}</p>
            <h2 id="strict" className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('cancellationPolicy.strictTitle')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('cancellationPolicy.strictBody')}</p>
            <h2 id="non-refundable" className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('cancellationPolicy.nonRefundableTitle')}</h2>
            <p className="body-md" style={{ textTransform: 'none' }}>{t('cancellationPolicy.nonRefundableBody')}</p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
