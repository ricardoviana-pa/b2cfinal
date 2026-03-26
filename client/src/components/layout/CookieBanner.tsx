/* ==========================================================================
   COOKIE BANNER — Minimal, brand-consistent
   Copy: "We use cookies to improve your experience. By continuing,
   you agree to our cookie policy."
   ========================================================================== */

import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';

const COOKIE_KEY = 'pa-cookies-accepted';

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const accepted = localStorage.getItem(COOKIE_KEY);
    if (!accepted) {
      // Small delay so it doesn't flash on load
      const timer = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[60] bg-white border-t border-[#E8E4DC] shadow-lg"
      style={{ animation: 'slideUp 0.4s ease-out' }}
    >
      <div className="container py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
          {t('cookieBanner.message')}{' '}
          <Link href="/legal/cookies" className="text-[#8B7355] hover:text-[#1A1A18] underline underline-offset-2 transition-colors">
            {t('cookieBanner.policyLink')}
          </Link>.
        </p>
        <button
          onClick={accept}
          className="rounded-full text-[11px] tracking-[0.12em] font-medium text-white bg-[#1A1A18] px-6 py-2.5 hover:bg-[#333330] transition-colors whitespace-nowrap flex-shrink-0"
          style={{ minHeight: '40px', textTransform: 'uppercase' }}
        >
          {t('cookieBanner.accept')}
        </button>
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
