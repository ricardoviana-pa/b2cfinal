/**
 * "Este site também está disponível em português. [Ver em português] [×]"
 * on English pages, for a browser that prefers another of the site's
 * languages (auditoria 29 out, i18n-copy-07). See lib/languageSuggestion.ts.
 *
 * Client-only: it renders nothing on the server and in the first client
 * render (no hydration mismatch, nothing a crawler sees), and is fixed-
 * positioned, so appearing moves no content (no layout shift). It sits above
 * the cookie banner, rising with it by a transform (lib/fixedBottom.ts), and,
 * on a phone, above the booking bar of a home or an experience. Once per
 * visit — across tabs — on the first page that exists in the visitor's
 * language (lib/languageSuggestion.ts, SUGGESTION_SHOWN_KEY).
 *
 * Layer z-[45]: over the page's own floats and bars (z-40: the listing
 * WhatsApp button, the booking bars), under every modal layer — the dialogs,
 * drawers and sheets (z-50), the mobile menu (z-54/55), the cookie banner
 * (z-60) and the overlays above them. An open Filters sheet or menu covers
 * the card instead of the card covering their buttons (revisão do PR #175, R2).
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { pushDL } from '@/lib/datalayer';
import { COOKIE_BANNER_OPEN_ATTR, HOME_HERO_ATTR, LANGUAGE_CARD_ATTR, RISE_ABOVE_COOKIE_BANNER } from '@/lib/fixedBottom';
import { COOKIE_CHOICE_EVENT, getCookieChoice } from '@/lib/measurementConsent';
import { LANGUAGE_CHOICE_KEY, SUGGESTION_COPY, SUGGESTION_DECLINED_KEY, SUGGESTION_SHOWN_KEY, hasBottomBookingBar, languageCardWaits, pageOffersLanguage, pathInLanguage, shownThisVisit, suggestedLanguage, type SuggestedLanguage, homeHeroOnScreen } from '@/lib/languageSuggestion';

function read(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key); } catch { return null; }
}
function write(storage: () => Storage, key: string, value: string) {
  try { storage().setItem(key, value); } catch { /* private mode: not remembered, still works */ }
}
// Once per visit, in every tab (localStorage): written when the card is on the
// page, and kept fresh by each later page of the visit, so a tab opened later
// in the visit stays quiet.
const keepVisit = () => write(() => localStorage, SUGGESTION_SHOWN_KEY, String(Date.now()));

/** Must the card wait right now (lib/languageSuggestion.ts, languageCardWaits), read from the page? */
function cardWaitsNow(): boolean {
  const root = document.documentElement;
  return languageCardWaits({
    viewportWidth: window.innerWidth,
    homeHeroOnScreen: homeHeroOnScreen({ pathname: window.location.pathname, scrollY: window.scrollY, innerHeight: window.innerHeight, heroAttr: root.hasAttribute(HOME_HERO_ATTR) }),
    cookieChoice: getCookieChoice(),
    cookieBannerOpen: root.hasAttribute(COOKIE_BANNER_OPEN_ATTR),
  });
}

/** hreflang of every alternate in the head, as the server (or usePageMeta) wrote them. */
function pageAlternates(): string[] {
  return Array.from(document.querySelectorAll('link[rel="alternate"][hreflang]'), (link) => link.getAttribute('hreflang') ?? '');
}

function isAlternateLink(node: Node): boolean {
  return node instanceof HTMLLinkElement && node.rel === 'alternate' && node.hasAttribute('hreflang');
}

/** How long after arriving on a page its alternates may still change (a lazily loaded page writes them late). */
const ALTERNATES_SETTLE_MS = 5000;

export default function LanguageSuggestion() {
  const [location] = useLocation();
  const { i18n } = useTranslation();
  const [target, setTarget] = useState<SuggestedLanguage | null>(null);
  // The card waits while it would land on the page's own buttons (the hero
  // on a phone or a tablet, the open banner on a phone): decided, not shown.
  const [waits, setWaits] = useState(false);
  const shownOn = useRef<string | null>(null);
  const answered = useRef(false);
  const landingPage = useRef(location);
  const leftLandingPage = useRef(false);

  useEffect(() => {
    const update = () => setWaits(cardWaitsNow());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: [HOME_HERO_ATTR, COOKIE_BANNER_OPEN_ATTR] });
    window.addEventListener(COOKIE_CHOICE_EVENT, update);
    window.addEventListener('resize', update);
    // The hero rule reads the scroll (see homeHeroOnScreen): re-check as the visitor scrolls, one check per frame.
    let frame = 0;
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; update(); }); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener(COOKIE_CHOICE_EVENT, update);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (location !== landingPage.current) leftLandingPage.current = true;
    // Leaving the page it appeared on without answering hides it.
    if (shownOn.current !== null) {
      if (shownOn.current !== location) setTarget(null);
      keepVisit();
      return;
    }
    if (shownThisVisit(read(() => localStorage, SUGGESTION_SHOWN_KEY), Date.now())) {
      keepVisit();
      return;
    }
    // A language decided for the previous page while the card waited there is
    // not this page's: decide again from this page's alternates.
    setTarget(null);
    const next = suggestedLanguage({
      pageLang: i18n.language || 'en',
      path: location,
      stored: read(() => localStorage, LANGUAGE_CHOICE_KEY),
      declined: read(() => localStorage, SUGGESTION_DECLINED_KEY),
      browser: navigator.languages?.length ? navigator.languages : [navigator.language],
    });
    if (!next) return;
    // Only where the page exists in that language (R4), read from its hreflang
    // alternates. On the page the visitor landed on, the server wrote them.
    // After a client-side navigation the head holds the previous page's until
    // this page writes its own — in its own effect, after this one, or once a
    // lazily loaded page's code has arrived. So wait for new alternates, then
    // decide; keep following them for a few seconds.
    let ownAlternates = !leftLandingPage.current;
    const decide = () => {
      if (!ownAlternates || answered.current) return;
      const offered = pageOffersLanguage(pageAlternates(), next);
      if (offered === null) return;
      setTarget(offered ? next : null);
    };
    const first = window.setTimeout(decide, 0);
    const observer = new MutationObserver((records) => {
      if (records.some((record) => Array.from(record.addedNodes).some(isAlternateLink))) ownAlternates = true;
      decide();
    });
    observer.observe(document.head, { childList: true });
    const settle = window.setTimeout(() => observer.disconnect(), ALTERNATES_SETTLE_MS);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(settle);
      observer.disconnect();
    };
  }, [location, i18n.language]);

  const aboveBookingBar = hasBottomBookingBar(location);
  const visible = target !== null && !waits;
  // While on the page: this is the visit's one card (SUGGESTION_SHOWN_KEY),
  // on this page; and <html> says where (LANGUAGE_CARD_ATTR): over a booking
  // bar, on a phone, the card covers the place of "back to top", which steps
  // aside. A card that only waited was never shown: the next page decides anew.
  useEffect(() => {
    if (!visible) return;
    if (shownOn.current === null) {
      shownOn.current = location;
      keepVisit();
    }
    const root = document.documentElement;
    root.setAttribute(LANGUAGE_CARD_ATTR, aboveBookingBar ? 'above-bar' : 'bottom');
    return () => root.removeAttribute(LANGUAGE_CARD_ATTR);
  }, [visible, aboveBookingBar, location]);

  if (!visible) return null;
  const copy = SUGGESTION_COPY[target];
  const href = pathInLanguage(window.location.pathname, window.location.search, window.location.hash, target);

  // Above the cookie banner while it is open, rising with it like the bars and
  // the floats (RISE_ABOVE_COOKIE_BANNER), with the banner's own curve: a
  // transform, so the banner opening is no layout shift (with `bottom` it was
  // 0.05–0.08 of CLS on a phone, revisão do PR #178).
  return (
    <div
      role="region"
      aria-label={copy.prompt}
      lang={target}
      data-testid="language-suggestion"
      className={`fixed z-[45] left-4 right-4 sm:left-6 sm:right-auto sm:max-w-sm flex items-center gap-3 rounded-xl border border-pa-sand bg-white py-3 pl-4 pr-2 shadow-[0_12px_40px_-12px_rgba(26,26,24,0.35)] transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        aboveBookingBar
          ? 'bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] lg:bottom-6'
          : 'bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-6'
      }`}
      style={{ transform: RISE_ABOVE_COOKIE_BANNER }}
    >
      <p className="min-w-0 flex-1 font-body text-[13px] leading-snug text-pa-dark">
        {copy.prompt}{' '}
        <a
          href={href}
          onClick={() => {
            answered.current = true;
            write(() => localStorage, LANGUAGE_CHOICE_KEY, target);
            pushDL({ event: 'language_suggestion', suggestion_action: 'switch', suggested_language: target });
          }}
          className="font-medium underline underline-offset-4 decoration-pa-gold hover:text-pa-gold-aa"
        >
          {copy.action}
        </a>
      </p>
      <button
        type="button"
        onClick={() => {
          answered.current = true;
          write(() => localStorage, SUGGESTION_DECLINED_KEY, target);
          pushDL({ event: 'language_suggestion', suggestion_action: 'dismiss', suggested_language: target });
          setTarget(null);
        }}
        aria-label={copy.dismiss}
        title={copy.dismiss}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-pa-stone hover:bg-pa-warm hover:text-pa-dark"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
