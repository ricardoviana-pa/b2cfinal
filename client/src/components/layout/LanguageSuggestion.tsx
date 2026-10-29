/**
 * "Este site também está disponível em português. [Ver em português] [×]"
 * on English pages, for a browser that prefers another of the site's
 * languages (auditoria 29 out, i18n-copy-07). See lib/languageSuggestion.ts.
 *
 * Client-only: it renders nothing on the server and in the first client
 * render (no hydration mismatch, nothing a crawler sees), and is fixed-
 * positioned, so appearing moves no content (no layout shift). It sits above
 * the cookie banner (--cookie-banner-h) and, on a home's page on a phone,
 * above the booking bar. Once per visit, on the page the visitor landed on.
 */
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { pushDL } from '@/lib/datalayer';
import {
  LANGUAGE_CHOICE_KEY, SUGGESTION_COPY, SUGGESTION_DECLINED_KEY, SUGGESTION_SESSION_KEY,
  pathInLanguage, suggestedLanguage, type SuggestedLanguage,
} from '@/lib/languageSuggestion';

function read(storage: () => Storage, key: string): string | null {
  try { return storage().getItem(key); } catch { return null; }
}
function write(storage: () => Storage, key: string, value: string) {
  try { storage().setItem(key, value); } catch { /* private mode: not remembered, still works */ }
}

export default function LanguageSuggestion() {
  const [location] = useLocation();
  const { i18n } = useTranslation();
  const [target, setTarget] = useState<SuggestedLanguage | null>(null);
  const shownOn = useRef<string | null>(null);

  useEffect(() => {
    // Once per visit: leaving the landing page without answering hides it.
    if (shownOn.current !== null) {
      if (shownOn.current !== location) setTarget(null);
      return;
    }
    if (read(() => sessionStorage, SUGGESTION_SESSION_KEY)) return;
    const next = suggestedLanguage({
      pageLang: i18n.language || 'en',
      path: location,
      stored: read(() => localStorage, LANGUAGE_CHOICE_KEY),
      declined: read(() => localStorage, SUGGESTION_DECLINED_KEY),
      browser: navigator.languages?.length ? navigator.languages : [navigator.language],
    });
    if (!next) return;
    shownOn.current = location;
    write(() => sessionStorage, SUGGESTION_SESSION_KEY, '1');
    setTarget(next);
  }, [location, i18n.language]);

  if (!target) return null;
  const copy = SUGGESTION_COPY[target];
  const href = pathInLanguage(window.location.pathname, window.location.search, window.location.hash, target);
  const onHomePage = /^\/homes\/[^/]+/.test(location);

  return (
    <div
      role="region"
      aria-label={copy.prompt}
      lang={target}
      data-testid="language-suggestion"
      className={`fixed z-[91] left-4 right-4 sm:left-6 sm:right-auto sm:max-w-sm flex items-center gap-3 rounded-xl border border-pa-sand bg-white py-3 pl-4 pr-2 shadow-[0_12px_40px_-12px_rgba(26,26,24,0.35)] ${
        onHomePage
          ? 'bottom-[calc(var(--cookie-banner-h,0px)+6rem+env(safe-area-inset-bottom,0px))] lg:bottom-[calc(var(--cookie-banner-h,0px)+1.5rem)]'
          : 'bottom-[calc(var(--cookie-banner-h,0px)+1rem+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(var(--cookie-banner-h,0px)+1.5rem)]'
      }`}
    >
      <p className="min-w-0 flex-1 font-body text-[13px] leading-snug text-pa-dark">
        {copy.prompt}{' '}
        <a
          href={href}
          onClick={() => {
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
