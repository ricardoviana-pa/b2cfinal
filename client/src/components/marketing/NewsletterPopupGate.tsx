/* ==========================================================================
   NEWSLETTER POP-UP GATE — mounted once in App.tsx next to the CookieBanner.
   Small and dependency-free: it decides WHEN, and only then lazy-loads the
   pop-up chunk (nothing of the pop-up is in the page HTML, so no LCP or CLS
   cost and nothing for Google to see as an interstitial on arrival).

   When (rules in shared/newsletter.ts, unit-tested on the server):
     - never before the cookie banner has an answer, never on the checkout,
       the booking pages, the legal pages, login, account or admin;
     - never to someone who subscribed (any form writes pa_nl_subscribed) or
       who saw it in the last 30 days (closing counts);
     - never in a visit that came from one of our emails;
     - never on top of another dialog, the "no availability" form, or while
       the person is typing in a field (it waits and tries again);
     - computer: after 8 s on the site, or on exit intent (pointer leaving
       through the top), whichever comes first;
     - phone or touch tablet: a small sheet at the bottom after 40% of the
       page or 15 s;
     - ?nl=1 in the landing URL (an ad that promises the sign-up): at once,
       after the cookie choice, ignoring the 30-day rule.
   The 8 s and 15 s count time on the site since the visit became eligible,
   not per page: browsing fast through pages does not reset them.
   ========================================================================== */

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { pushDL } from '@/lib/datalayer';
import { COOKIE_CHOICE_EVENT, getCookieChoice } from '@/lib/measurementConsent';
import {
  NL_POPUP_AT_KEY,
  NL_SKIP_SESSION_KEY,
  NL_SUBSCRIBED_KEY,
  hasEmailOrRecoveryUtm,
  hasPopupLinkParam,
  houseSlugFromPath,
  isExitIntent,
  pageKind,
  popupEligibility,
  remainingDelay,
  scrollProgressPct,
  type NewsletterDevice,
  type NewsletterTrigger,
} from '@shared/newsletter';
import { useNewsletterConfig } from './useNewsletterConfig';
import type { PopupCloseReason } from './NewsletterPopup';

const NewsletterPopup = lazy(() => import('./NewsletterPopup'));

// Phones, and touch tablets too: both get the small bottom sheet, never the
// centred dialog (Google's intrusive interstitial rule is about touch screens,
// and exit intent needs a mouse anyway).
const MOBILE_QUERY = '(max-width: 767px), (hover: none) and (pointer: coarse)';
const RETRY_MS = 4_000;

const read = (storage: 'local' | 'session', key: string): string | null => {
  try {
    return (storage === 'local' ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
};

/** Another dialog, a lead form that must not be covered, or a field being typed in. */
function busy(): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return true;
  const nodes = document.querySelectorAll('[role="dialog"], [aria-modal="true"], [data-nl-suppress]');
  for (const el of Array.from(nodes)) {
    if (el.closest('[data-nl-popup]') || el.closest('[inert]') || el.closest('[aria-hidden="true"]')) continue;
    const rect = (el as HTMLElement).getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    const style = window.getComputedStyle(el as HTMLElement);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    return true;
  }
  return false;
}

export default function NewsletterPopupGate() {
  const [location] = useLocation();
  const { i18n } = useTranslation();
  const config = useNewsletterConfig();
  const [cookieChoice, setCookieChoice] = useState<string | null>(null);
  const [visibilityTick, setVisibilityTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [loadPopup, setLoadPopup] = useState(false);
  const [shownWith, setShownWith] = useState<{ trigger: NewsletterTrigger; device: NewsletterDevice; slug?: string }>({ trigger: 'timer', device: 'desktop' });
  const shownRef = useRef(false);
  const forcedRef = useRef(false);
  const armedAtRef = useRef<number | null>(null);
  const pageStartRef = useRef(0);
  const subscribedRef = useRef(false);

  const path = location.split('?')[0] || '/';
  const lang = (i18n.language || 'en').slice(0, 2);

  // First load only: the landing URL decides the session (SPA navigation loses the query).
  useEffect(() => {
    try {
      if (hasEmailOrRecoveryUtm(window.location.search)) window.sessionStorage.setItem(NL_SKIP_SESSION_KEY, '1');
    } catch { /* storage unavailable */ }
    forcedRef.current = hasPopupLinkParam(window.location.search);
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

  useEffect(() => { pageStartRef.current = Date.now(); }, [path]);

  useEffect(() => {
    const data = config.data;
    if (!data || shownRef.current || open) return;
    const mobile = window.matchMedia(MOBILE_QUERY).matches;
    const evaluate = () => popupEligibility({
      enabled: data.popup,
      locales: data.locales,
      lang,
      path,
      subscribed: read('local', NL_SUBSCRIBED_KEY),
      lastShownAt: read('local', NL_POPUP_AT_KEY),
      skipSession: read('session', NL_SKIP_SESSION_KEY),
      cookieChoice,
      visible: document.visibilityState === 'visible',
      now: Date.now(),
      forced: forcedRef.current,
      cooldownDays: data.timings.cooldownDays,
    });
    if (!evaluate().eligible) return;
    if (armedAtRef.current === null) armedAtRef.current = Date.now();

    let armed = true;
    const timers: number[] = [];
    const show = (why: NewsletterTrigger) => {
      if (!armed || shownRef.current) return;
      if (!evaluate().eligible) return;
      if (busy()) {
        timers.push(window.setTimeout(() => show(why), RETRY_MS));
        return;
      }
      armed = false;
      shownRef.current = true;
      forcedRef.current = false;
      try { window.localStorage.setItem(NL_POPUP_AT_KEY, String(Date.now())); } catch { /* storage unavailable */ }
      const device: NewsletterDevice = mobile ? 'mobile' : 'desktop';
      setShownWith({ trigger: why, device, slug: houseSlugFromPath(path) });
      pushDL({ event: 'newsletter_popup_shown', newsletter_trigger: why, newsletter_device: device, page_kind: pageKind(path) });
      setLoadPopup(true);
      setOpen(true);
    };

    if (forcedRef.current) {
      timers.push(window.setTimeout(() => show('link'), 800));
    }
    const delay = mobile ? data.timings.mobileDelayMs : data.timings.desktopDelayMs;
    timers.push(window.setTimeout(() => show('timer'), remainingDelay(delay, armedAtRef.current, Date.now())));

    const onScroll = () => {
      const doc = document.documentElement;
      if (scrollProgressPct(window.scrollY, window.innerHeight, doc.scrollHeight) >= data.timings.mobileScrollPct) show('scroll');
    };
    const onMouseOut = (e: MouseEvent) => {
      if (isExitIntent(e, Date.now() - pageStartRef.current)) show('exit');
    };
    if (mobile) window.addEventListener('scroll', onScroll, { passive: true });
    else document.addEventListener('mouseout', onMouseOut);

    return () => {
      armed = false;
      timers.forEach(t => window.clearTimeout(t));
      window.removeEventListener('scroll', onScroll);
      document.removeEventListener('mouseout', onMouseOut);
    };
  }, [config.data, cookieChoice, visibilityTick, path, lang, open]);

  const handleClose = useCallback((reason: PopupCloseReason) => {
    setOpen(false);
    pushDL({
      event: 'newsletter_popup_closed',
      close_reason: reason,
      newsletter_trigger: shownWith.trigger,
      newsletter_device: shownWith.device,
      after_signup: subscribedRef.current,
    });
  }, [shownWith]);

  const handleSubscribed = useCallback(() => { subscribedRef.current = true; }, []);

  // The phone sheet does not block the page: a tap on a link navigates with it
  // open. Any navigation closes it (and the checkout never shows it).
  const openedPathRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) { openedPathRef.current = null; return; }
    if (openedPathRef.current === null) { openedPathRef.current = path; return; }
    if (openedPathRef.current !== path) handleClose('navigation');
  }, [open, path, handleClose]);

  if (!loadPopup) return null;
  return (
    <Suspense fallback={null}>
      <NewsletterPopup
        open={open}
        onClose={handleClose}
        onSubscribed={handleSubscribed}
        propertySlug={shownWith.slug}
        trigger={shownWith.trigger}
        device={shownWith.device}
        houseAlerts={!!config.data?.houseAlerts}
      />
    </Suspense>
  );
}
