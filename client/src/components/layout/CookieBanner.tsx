/* ==========================================================================
   COOKIE BANNER — Optional measurement preferences
   Compact bottom bar matching Portugal Active design language
   ========================================================================== */

import { useState, useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { COOKIE_CHOICE_EVENT, COOKIE_PREFERENCES_EVENT, consumeCookiePreferencesRequest, getCookieChoice, saveCookieChoice, willReloadForEssential } from '@/lib/measurementConsent';
import { COOKIE_BANNER_OPEN_ATTR } from '@/lib/fixedBottom';

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
  // being covered by this z-[60] overlay — and mark <html> while it is open,
  // for what steps aside instead (lib/fixedBottom.ts, COOKIE_BANNER_OPEN_ATTR).
  useEffect(() => {
    const root = document.documentElement;
    if (!visible || !wrapperRef.current) {
      root.style.setProperty('--cookie-banner-h', '0px');
      root.removeAttribute(COOKIE_BANNER_OPEN_ATTR);
      return;
    }
    const el = wrapperRef.current;
    const update = () => root.style.setProperty('--cookie-banner-h', `${el.offsetHeight}px`);
    update();
    root.setAttribute(COOKIE_BANNER_OPEN_ATTR, '');
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty('--cookie-banner-h', '0px');
      root.removeAttribute(COOKIE_BANNER_OPEN_ATTR);
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
      data-cookie-banner=""
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
        {/* On a phone the banner is as short as its text allows: smaller,
            tighter text and the two buttons side by side. The two choices
            look the same on every screen: "accept all" was gold and
            "essential only" a dim outline (decisão E12 do Ricardo, 20 nov
            2026). The text itself is the consent notice and is not cut. */}
        <div className="container py-3 md:py-4 px-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
            {/* Text — compact */}
            <div className="flex-1 min-w-0">
              <p
                className="text-[13px] leading-snug md:text-[14px] md:leading-relaxed text-[#C9C3B8]"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
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

            {/* Buttons — inline. On a phone each takes the width its label
                needs and the two share what is left: in two equal columns
                "ESSENTIELS UNIQUEMENT" (French) broke in two inside its
                button beside a one-line "ACCEPTER TOUT". */}
            <div className="flex gap-2 md:items-center md:gap-3 flex-shrink-0">
              <button
                onClick={handleEssentialOnly}
                className="pa-action flex-1 basis-auto md:flex-none px-2 md:px-5 py-2 text-[12px] leading-tight font-medium max-md:tracking-[0.04em]! uppercase text-white border border-white/50 hover:bg-white hover:text-[#1A1A18] transition-colors md:whitespace-nowrap"
              >
                {t('cookieBanner.essentialOnly')}
              </button>
              <button
                onClick={handleAcceptAll}
                className="pa-action flex-1 basis-auto md:flex-none px-2 md:px-5 py-2 text-[12px] leading-tight font-medium max-md:tracking-[0.04em]! uppercase text-white border border-white/50 hover:bg-white hover:text-[#1A1A18] transition-colors md:whitespace-nowrap"
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
