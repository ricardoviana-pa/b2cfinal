/* ==========================================================================
   COOKIE BANNER — Minimal, premium GDPR-compliant consent
   Compact bottom bar matching Portugal Active design language
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
      const timer = setTimeout(() => setVisible(true), 2000);
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
      className="fixed bottom-0 left-0 right-0 z-[60]"
      style={{
        animation: 'cookieSlideUp 0.5s cubic-bezier(0.16,1,0.3,1)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* Subtle top edge */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#8B7355]/30 to-transparent" />

      <div
        className="backdrop-blur-xl"
        style={{ background: 'rgba(26,26,24,0.92)' }}
      >
        <div className="container py-4 px-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Text — compact */}
            <div className="flex-1 min-w-0">
              <p
                className="text-[13px] text-[#C9C3B8] leading-relaxed"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
              >
                {t('cookieBanner.description')}{' '}
                <Link
                  href="/legal/cookies"
                  className="text-[#C4A87C] hover:text-white underline underline-offset-2 transition-colors"
                >
                  {t('cookieBanner.policyLink')}
                </Link>
              </p>
            </div>

            {/* Buttons — inline */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handleEssentialOnly}
                className="px-5 py-2.5 text-[11px] font-medium tracking-[0.1em] uppercase text-[#9E9A90] hover:text-white border border-[#3A3A38] hover:border-[#6B6860] transition-all whitespace-nowrap"
              >
                {t('cookieBanner.essentialOnly')}
              </button>
              <button
                onClick={handleAcceptAll}
                className="px-5 py-2.5 text-[11px] font-medium tracking-[0.1em] uppercase text-[#1A1A18] bg-[#C4A87C] hover:bg-[#D4BC96] transition-all whitespace-nowrap"
              >
                {t('cookieBanner.acceptAll')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes cookieSlideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
