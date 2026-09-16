/* ==========================================================================
   COOKIE BANNER — Optional measurement preferences
   Compact bottom bar matching Portugal Active design language
   ========================================================================== */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { COOKIE_CHOICE_EVENT, COOKIE_PREFERENCES_EVENT, consumeCookiePreferencesRequest, getCookieChoice, saveCookieChoice, willReloadForEssential } from '@/lib/measurementConsent';

export default function CookieBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [reloadNotice, setReloadNotice] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const open = () => {
      clearTimeout(timer);
      consumeCookiePreferencesRequest();
      setReloadNotice(willReloadForEssential() || getCookieChoice() === 'all');
      setVisible(true);
    };
    const sync = () => { clearTimeout(timer); setVisible(!getCookieChoice()); };
    window.addEventListener(COOKIE_PREFERENCES_EVENT, open);
    window.addEventListener(COOKIE_CHOICE_EVENT, sync);
    if (consumeCookiePreferencesRequest()) open();
    else if (!getCookieChoice()) timer = setTimeout(open, 2000);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(COOKIE_PREFERENCES_EVENT, open);
      window.removeEventListener(COOKIE_CHOICE_EVENT, sync);
    };
  }, []);

  // Publish the banner's real height as --cookie-banner-h so fixed/bottom UI
  // elsewhere (e.g. the checkout bottom bar) can sit above it instead of
  // being covered by this z-[60] overlay.
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !wrapperRef.current) {
      root.style.setProperty('--cookie-banner-h', '0px');
      return;
    }
    const el = wrapperRef.current;
    const update = () => root.style.setProperty('--cookie-banner-h', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty('--cookie-banner-h', '0px');
    };
  }, [visible]);

  const handleAcceptAll = () => {
    saveCookieChoice('all');
    setVisible(false);
  };

  const handleEssentialOnly = () => {
    saveCookieChoice('essential');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      ref={wrapperRef}
      role="region"
      aria-label={t('cookieBanner.title')}
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
              {reloadNotice && <p className="mt-2 text-xs text-[#C9C3B8]">{t('cookieBanner.reloadNotice')}</p>}
            </div>

            {/* Buttons — inline */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={handleEssentialOnly}
                className="pa-action px-5 py-2.5 text-[11px] font-medium tracking-[0.1em] uppercase text-[#C9C3B8] hover:text-white border border-[#3A3A38] hover:border-[#6B6860] transition-all whitespace-nowrap"
              >
                {t('cookieBanner.essentialOnly')}
              </button>
              <button
                onClick={handleAcceptAll}
                className="pa-action px-5 py-2.5 text-[11px] font-medium tracking-[0.1em] uppercase text-[#1A1A18] bg-[#C4A87C] hover:bg-[#D4BC96] transition-all whitespace-nowrap"
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
