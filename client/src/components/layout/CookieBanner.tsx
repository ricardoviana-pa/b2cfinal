/* ==========================================================================
   COOKIE BANNER — Enhanced GDPR-compliant with clear cookie categories
   Dark premium design (Portugal Active brand language) with dual-action buttons
   ========================================================================== */

import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';

const COOKIE_KEY = 'pa-cookies-consent';

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_KEY);
    if (!consent) {
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem(COOKIE_KEY, 'all');
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    localStorage.setItem(COOKIE_KEY, 'essential');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] bg-[#1A1A18] border-t border-[#D4AF37]/20 shadow-2xl"
      style={{ animation: 'slideUp 0.4s ease-out', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="container py-6 px-4">
        <div className="max-w-2xl">
          <h3 className="text-sm font-semibold text-[#D4AF37] mb-2 tracking-[0.08em] uppercase">
            {t('cookieBanner.title')}
          </h3>

          <p className="text-[14px] text-[#E8E4DC] leading-relaxed mb-3" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
            {t('cookieBanner.description')}
          </p>

          <div className="text-[13px] text-[#C9C3B8] mb-4 space-y-1">
            <p>
              <span className="text-[#D4AF37] font-medium">{t('cookieBanner.essential')}</span>
              {' '}{t('cookieBanner.essentialDesc')}
            </p>
            <p>
              <span className="text-[#D4AF37] font-medium">{t('cookieBanner.analytics')}</span>
              {' '}{t('cookieBanner.analyticsDesc')}
            </p>
          </div>

          <p className="text-[12px] text-[#9A9490] mb-4">
            {t('cookieBanner.learnMore')}{' '}
            <Link href="/legal/cookies" className="text-[#D4AF37] hover:text-[#E8D9B8] underline underline-offset-2 transition-colors font-medium">
              {t('cookieBanner.policyLink')}
            </Link>.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAcceptAll}
              className="px-6 py-3 rounded-full text-[12px] font-semibold tracking-[0.12em] uppercase text-[#1A1A18] bg-[#D4AF37] hover:bg-[#E8D9B8] transition-colors whitespace-nowrap"
              style={{ minHeight: '44px' }}
            >
              {t('cookieBanner.acceptAll')}
            </button>
            <button
              onClick={handleEssentialOnly}
              className="px-6 py-3 rounded-full text-[12px] font-semibold tracking-[0.12em] uppercase text-[#D4AF37] border border-[#D4AF37] hover:bg-[#D4AF37]/10 transition-colors whitespace-nowrap"
              style={{ minHeight: '44px' }}
            >
              {t('cookieBanner.essentialOnly')}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
