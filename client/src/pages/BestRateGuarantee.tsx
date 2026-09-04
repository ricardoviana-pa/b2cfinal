/**
 * Best Rate Guarantee — the terms behind every "Best rate guaranteed" badge.
 *
 * Every badge on the site (home USP bar, PDP trust strip, checkout summary,
 * FAQ, thank-you page) links here, so the claim has a page that names its
 * mechanism (auditoria set/2026, N5). Copy lives in the 9 locale files under
 * bestRateGuarantee.*; the server injects the matching PAGE_META.
 */
import { useTranslation } from 'react-i18next';
import { ShieldCheck, MessageCircle } from 'lucide-react';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

const WHATSAPP_URL = 'https://wa.me/351927161771';

export default function BestRateGuarantee() {
  const { t } = useTranslation();
  usePageMeta({
    title: t('bestRateGuarantee.metaTitle'),
    description: t('bestRateGuarantee.metaDescription'),
    url: '/best-rate-guarantee',
  });
  const steps = [1, 2, 3, 4].map((n) => t(`bestRateGuarantee.step${n}`));
  const terms = [1, 2, 3, 4, 5, 6].map((n) => t(`bestRateGuarantee.term${n}`));

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <div className="pt-[72px]" />
      <section className="section-padding">
        <div className="container max-w-[800px] mx-auto">
          <p className="overline mb-4">{t('bestRateGuarantee.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-6">{t('bestRateGuarantee.title')}</h1>
          <p className="body-lg mb-10" style={{ textTransform: 'none' }}>{t('bestRateGuarantee.intro')}</p>

          <h2 className="headline-sm text-[#1A1A18] mb-5">{t('bestRateGuarantee.howTitle')}</h2>
          <ol className="space-y-4 mb-12">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E8E4DC] bg-white text-[12px] font-medium text-[#806A48]">
                  {i + 1}
                </span>
                <p className="body-md" style={{ textTransform: 'none' }}>{s}</p>
              </li>
            ))}
          </ol>

          <h2 className="headline-sm text-[#1A1A18] mb-5">{t('bestRateGuarantee.termsTitle')}</h2>
          <ul className="space-y-3 mb-12">
            {terms.map((term, i) => (
              <li key={i} className="flex items-start gap-3">
                <ShieldCheck size={16} className="text-[#806A48] shrink-0 mt-1" />
                <p className="body-md" style={{ textTransform: 'none' }}>{term}</p>
              </li>
            ))}
          </ul>

          <div className="border border-[#E8E4DC] bg-white p-6 md:p-8">
            <h2 className="headline-sm text-[#1A1A18] mb-3">{t('bestRateGuarantee.contactTitle')}</h2>
            <p className="body-md mb-5" style={{ textTransform: 'none' }}>{t('bestRateGuarantee.contactBody')}</p>
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary inline-flex items-center gap-2"
            >
              <MessageCircle size={16} />
              {t('bestRateGuarantee.cta')}
            </a>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
