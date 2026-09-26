/* ==========================================================================
   NEWSLETTER POP-UP GATE — mounted once in App.tsx next to the CookieBanner.
   Client-only and dependency-free: it decides eligibility (route, language,
   localStorage, email UTMs, cookie banner closed) and only after the trigger
   (delay or 50% scroll) lazy-loads the pop-up chunk. Once per 30 days per
   visitor (closing counts), never after subscribing (pa_nl_subscribed, also
   written by the inline block and the footer). The rules themselves are
   pure functions in shared/newsletterPopup.ts, unit-tested on the server.
   ========================================================================== */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { pushDL } from '@/lib/datalayer';
import { COOKIE_CHOICE_EVENT, getCookieChoice } from '@/lib/measurementConsent';
import {
  NL_POPUP_AT_KEY,
  NL_SKIP_SESSION_KEY,
  NL_SUBSCRIBED_KEY,
  hasEmailOrRecoveryUtm,
  popupEligibility,
} from '@shared/newsletterPopup';
import type { PopupCloseReason } from './NewsletterPopup';

const NewsletterPopup = lazy(() => import('./NewsletterPopup'));

const read = (storage: 'local' | 'session', key: string): string | null => {
  try {
    return (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
};

export default function NewsletterPopupGate() {
  const [location] = useLocation();
  const { i18n } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const [cookieChoice, setCookieChoice] = useState<string | null>(null);
  const [visibilityTick, setVisibilityTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [loadPopup, setLoadPopup] = useState(false);
  const shownRef = useRef(false);

  // First load only: a visitor arriving from one of our emails (or the checkout
  // recovery) is remembered for the whole session, because SPA navigation loses
  // the query string.
  useEffect(() => {
    setMounted(true);
    try {
      if (hasEmailOrRecoveryUtm(window.location.search)) window.sessionStorage.setItem(NL_SKIP_SESSION_KEY, '1');
    } catch { /* storage unavailable */ }
    const syncCookie = () => setCookieChoice(getCookieChoice());
    syncCookie();
    window.addEventListener(COOKIE_CHOICE_EVENT, syncCookie);
    const onVisibility = () => setVisibilityTick(n => n + 1);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(COOKIE_CHOICE_EVENT, syncCookie);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const config = trpc.newsletter.config.useQuery(undefined, {
    enabled: mounted,
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const path = location.split('?')[0] || '/';
  const lang = (i18n.language || 'en').slice(0, 2);
  const propertySlug = /^\/homes\/([^/]+)\/?$/.exec(path)?.[1];

  useEffect(() => {
    const data = config.data;
    if (!data || shownRef.current || open) return;
    const evaluate = () => popupEligibility({
      enabled: data.enabled,
      locales: data.locales,
      lang,
      path,
      subscribed: read('local', NL_SUBSCRIBED_KEY),
      lastShownAt: read('local', NL_POPUP_AT_KEY),
      skipSession: read('session', NL_SKIP_SESSION_KEY),
      cookieChoice,
      visible: document.visibilityState === 'visible',
      now: Date.now(),
      cooldownDays: data.popup.cooldownDays,
    });
    if (!evaluate().eligible) return;

    let armed = true;
    const show = () => {
      if (!armed || shownRef.current) return;
      if (!evaluate().eligible) return;
      // The listing's "no availability" form is a lead form of its own: never
      // put the pop-up on top of it.
      if (document.querySelector('[data-nl-suppress]')) return;
      armed = false;
      shownRef.current = true;
      try { window.localStorage.setItem(NL_POPUP_AT_KEY, String(Date.now())); } catch { /* storage unavailable */ }
      pushDL({ event: 'newsletter_popup_shown', page: path });
      setLoadPopup(true);
      setOpen(true);
    };
    const timer = window.setTimeout(show, data.popup.delayMs);
    const onScroll = () => {
      const doc = document.documentElement;
      if (window.scrollY + window.innerHeight >= (doc.scrollHeight * data.popup.scrollPct) / 100) show();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      armed = false;
      window.clearTimeout(timer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [config.data, cookieChoice, visibilityTick, path, lang, open]);

  const handleClose = useCallback((reason: PopupCloseReason) => {
    setOpen(false);
    pushDL({ event: 'newsletter_popup_closed', reason, page: path });
  }, [path]);

  if (!loadPopup) return null;
  return (
    <Suspense fallback={null}>
      <NewsletterPopup open={open} onClose={handleClose} propertySlug={propertySlug} />
    </Suspense>
  );
}
