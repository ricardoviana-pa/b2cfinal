/**
 * Cancellation Policy — Portugal Active
 * Design: Le Collectionist-inspired. Clean legal page.
 *
 * Lists exactly the policies Guesty uses on our direct rates. Every rule and
 * sentence comes from shared/cancellationPolicy.ts (the single source of
 * truth), so this page can never disagree with the checkout or the emails.
 */
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import {
  POLICY_ANCHORS,
  POLICY_CODES,
  cancellationPolicyCopy,
  cancellationPolicyMetaDescription,
  policyRuleSentence,
} from '@shared/cancellationPolicy';

export default function CancellationPolicy() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const copy = cancellationPolicyCopy(lang);
  usePageMeta({
    title: 'Cancellation Policies',
    description: cancellationPolicyMetaDescription(lang),
    url: '/legal/cancellation-policy',
  });
  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <div className="pt-[72px]" />
      <section className="section-padding">
        <div className="container max-w-[800px] mx-auto">
          <p className="eyebrow mb-4">{t('cancellationPolicy.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-8">{t('cancellationPolicy.pageTitle')}</h1>
          <div>
            <p className="body-lg mb-6" style={{ textTransform: 'none' }}>{copy.pageIntro}</p>
            {POLICY_CODES.map((code) => (
              <div key={code}>
                <h2 id={POLICY_ANCHORS[code]} className="headline-sm text-[#1A1A18] mb-4 mt-10">{copy.names[code]}</h2>
                <p className="body-md mb-4" style={{ textTransform: 'none' }}>{policyRuleSentence(code, lang)}</p>
              </div>
            ))}
            <h2 id="other-platforms" className="headline-sm text-[#1A1A18] mb-4 mt-10">{copy.otherPlatformsTitle}</h2>
            <p className="body-md" style={{ textTransform: 'none' }}>{copy.otherPlatformsBody}</p>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
