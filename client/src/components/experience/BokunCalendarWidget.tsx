/* ==========================================================================
   BOKUN CALENDAR WIDGET — inline booking calendar via BokunWidgetsLoader
   Uses the official Bókun embed method (<div class="bokunWidget">) instead
   of a raw iframe. The BokunWidgetsLoader.js (loaded in index.html) picks
   up the div, creates a managed iframe, and handles the entire
   calendar → checkout flow in a Bókun-managed modal overlay — no separate
   shopping cart page, no lost context.
   ========================================================================== */

import { useRef, useEffect, useCallback } from 'react';

interface BokunCalendarWidgetProps {
  bokunActivityId: number;
  experienceName?: string;
  className?: string;
  style?: React.CSSProperties;
}

const BOKUN_CHANNEL_UUID = import.meta.env.VITE_BOKUN_CHANNEL_UUID as string | undefined;

/**
 * Renders a Bókun experience-calendar widget using the official
 * BokunWidgetsLoader embed method. The loader script (in index.html)
 * watches for `.bokunWidget` elements and replaces them with managed
 * iframes that handle checkout inline.
 *
 * Falls back to a direct iframe if the loader hasn't initialized
 * within 3 seconds (e.g. ad-blocker, script-load failure).
 */
export default function BokunCalendarWidget({
  bokunActivityId,
  experienceName = 'Experience',
  className,
  style,
}: BokunCalendarWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const widgetUrl = BOKUN_CHANNEL_UUID
    ? `https://widgets.bokun.io/online-sales/${BOKUN_CHANNEL_UUID}/experience-calendar/${bokunActivityId}`
    : '';

  /* ------------------------------------------------------------------ */
  /* After mount, check if the loader processed this div. If not, try   */
  /* to re-trigger it. If it still hasn't after 3 s, drop in a direct   */
  /* iframe as a graceful fallback.                                      */
  /* ------------------------------------------------------------------ */
  const isProcessed = useCallback(
    () => containerRef.current?.querySelector('iframe') !== null,
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !widgetUrl) return;

    /* The BokunWidgetsLoader uses a MutationObserver, so dynamically
       added .bokunWidget divs are usually picked up automatically.
       But in some React render cycles the observer can miss them.
       Give it a nudge after a short delay. */
    const nudge = setTimeout(() => {
      if (isProcessed()) return;
      // The loader exposes itself on window — call init if available
      const loader = (window as any).BokunWidgetsLoader;
      if (loader) {
        if (typeof loader.initialize === 'function') loader.initialize();
        else if (typeof loader.init === 'function') loader.init();
        else if (typeof loader.start === 'function') loader.start();
      }
    }, 800);

    /* Fallback: if the loader never processes the div (e.g. blocked by
       privacy extension), inject a plain iframe so the booking still
       works. The user will get the standard Bókun page-based checkout
       instead of the modal overlay — still functional, just not ideal. */
    fallbackTimer.current = setTimeout(() => {
      if (isProcessed() || !el) return;
      const iframe = document.createElement('iframe');
      iframe.src = widgetUrl;
      iframe.title = `Book ${experienceName}`;
      iframe.className = 'w-full border-0';
      iframe.style.minHeight = '480px';
      iframe.style.height = '520px';
      iframe.setAttribute('allow', 'payment *; clipboard-write');
      iframe.setAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation',
      );
      el.innerHTML = '';
      el.appendChild(iframe);
    }, 3000);

    return () => {
      clearTimeout(nudge);
      if (fallbackTimer.current) clearTimeout(fallbackTimer.current);
    };
  }, [bokunActivityId, widgetUrl, experienceName, isProcessed]);

  if (!BOKUN_CHANNEL_UUID) return null;

  return (
    <div
      ref={containerRef}
      className={`bokunWidget ${className || ''}`}
      data-src={widgetUrl}
      style={style}
    >
      {/* Placeholder while Bókun loads */}
      <div className="flex items-center justify-center py-12 text-[12px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
        Loading booking calendar&hellip;
      </div>
    </div>
  );
}
