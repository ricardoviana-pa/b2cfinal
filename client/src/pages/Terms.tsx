/**
 * Terms — Portugal Active
 * Design: Le Collectionist-inspired. Clean legal page.
 */
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { cancellationPolicyCopy, cancellationPolicySummary } from '@shared/cancellationPolicy';
import { legalPageMeta } from '@shared/legalPageMeta';
import { COMPANY_LEGAL_NAME, COMPANY_NIPC, companyAddressLine } from '@shared/company';

export default function Terms() {
  const { t, i18n } = useTranslation();
  // Same title and description as the server's head, in the page language.
  usePageMeta({ ...legalPageMeta('/legal/terms', i18n.language), url: '/legal/terms' });
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <div className="pt-[72px]" />
      <section className="section-padding">
        <div className="container max-w-[800px] mx-auto">
          <p className="eyebrow mb-4">{t('terms.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-8">{t('terms.title')}</h1>
          <div>
            <p className="body-lg mb-6" style={{ textTransform: 'none' }}>{t('terms.lastUpdated')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s1Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s1Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s2Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s2Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s3Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>
              {cancellationPolicySummary(i18n.language)}{' '}
              <a href={`/${i18n.language}/legal/cancellation-policy`} className="underline underline-offset-2 hover:opacity-70">
                {cancellationPolicyCopy(i18n.language).termsLink}
              </a>
            </p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s4Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s4Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s5Title')}</h2>
            <p className="body-md mb-4" style={{ textTransform: 'none' }}>{t('terms.s5Body')}</p>
            <h2 className="headline-sm text-[#1A1A18] mb-4 mt-10">{t('terms.s6Title')}</h2>
            <p className="body-md" style={{ textTransform: 'none' }}>{t('terms.s6Body')}</p>
            {/* Identidade legal: saiu do rodapé e vive aqui, a um clique do
                link "Termos" que o rodapé já tem em todas as páginas. */}
            <p className="body-md mt-10 text-pa-stone-aa" style={{ textTransform: 'none' }} data-testid="terms-legal-identity">
              {t('legalFooter.operatedBy', { company: COMPANY_LEGAL_NAME, nipc: COMPANY_NIPC })}
              {companyAddressLine() ? ` · ${companyAddressLine()}` : ''}
            </p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
