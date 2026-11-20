import { isLiveSiteHostname } from "@shared/deployment";
/* ==========================================================================
   BOKUN CALENDAR WIDGET — the supplier's booking calendar, inside our panel
   Uses the official Bókun embed method (<div class="bokunWidget">) instead
   of a raw iframe. The BokunWidgetsLoader.js (loaded here, on demand) picks
   up the div, creates a managed iframe, and handles the entire
   calendar → checkout flow in a Bókun-managed modal overlay — no separate
   shopping cart page, no lost context.

   What is ours and what is theirs (decisão E14 da auditoria de design,
   20 nov 2026):
   - The calendar, the participants and the checkout live in iframes served
     by widgets.bokun.io. Nothing in our CSS reaches inside them: typeface,
     titles, colours and buttons are set in the Bókun back office
     (Settings › Booking channels › the channel › Widgets › Theme, with
     "Show advanced options" for the custom CSS/SASS box).
   - All that reaches the frame from this site is the address in data-src:
     the channel, the template (experience-calendar or experience) and the
     activity id.
   - Ours: the panel around the frame (BokunWidgetModal), the loading state
     and what the guest sees if the frame never arrives.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, MessageCircle } from 'lucide-react';
import { installBokunAnalyticsGuard } from '@/lib/bokunAnalyticsGuard';
import { cn } from '@/lib/utils';

interface BokunCalendarWidgetProps {
  bokunActivityId: number;
  experienceName?: string;
  className?: string;
  style?: React.CSSProperties;
  /**
   * 'calendar' (default) → the compact experience-calendar widget:
   *   participants, date, start time and, where a start time has more than
   *   one, the rates. Every experience uses it, the ones with several options
   *   too: on the live site (20 nov 2026) the e-bike's calendar offered its
   *   three routes by their start times (09:30, 2 h, €49 every day; 10:00,
   *   4 h, €76 on Tue, Wed, Sat and Sun), each at its own price.
   * 'experience' → Bókun's whole product page (photos, description, then the
   *   same calendar, some 4 000 px of the supplier's design). It was what the
   *   options opened until E14; pass it again to go back.
   */
  variant?: 'calendar' | 'experience';
  /** Where the guest can still book if the supplier's calendar does not load. */
  whatsappHref?: string;
}

const BOKUN_CHANNEL_UUID = import.meta.env.VITE_BOKUN_CHANNEL_UUID || 'a283fa3e-a892-41cd-a775-036ac351a454';

/** With no sign of the supplier's frame after this long, the guest is offered the other ways to book. */
const GIVE_UP_AFTER_MS = 15000;

/* ------------------------------------------------------------------ */
/* Lazy-load the BokunWidgetsLoader script only when a Bokun widget    */
/* is actually wanted: the guest opens the booking panel, or is about  */
/* to (preloadBokunWidgets). It used to load with every experience     */
/* page, phones included, ~1.3MB of JS before anyone asked to book.    */
/* ------------------------------------------------------------------ */
let bokunLoaderPromise: Promise<boolean> | null = null;
/** Resolves to whether the supplier's script is on the page. */
function ensureBokunLoader(): Promise<boolean> {
  if (!isLiveSiteHostname(window.location.hostname)) return Promise.resolve(false);
  if (bokunLoaderPromise) return bokunLoaderPromise;
  // Tem de ficar antes do script (os listeners da window correm pela ordem de
  // registo): os eventos GA4 que o widget reencaminha para esta página não
  // chegam às tags de conversão das casas (lib/bokunAnalyticsGuard.ts).
  installBokunAnalyticsGuard();
  bokunLoaderPromise = new Promise((resolve) => {
    if ((window as any).BokunWidgets || (window as any).BokunWidgetsLoader) { resolve(true); return; }
    const s = document.createElement('script');
    s.src = `https://widgets.bokun.io/assets/javascripts/apps/build/BokunWidgetsLoader.js?bookingChannelUUID=${BOKUN_CHANNEL_UUID}`;
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => {
      // fallback iframe will handle it; "Try again" may ask for the script anew
      bokunLoaderPromise = null;
      s.remove();
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return bokunLoaderPromise;
}

/**
 * Starts fetching the supplier's script before the panel opens: called when
 * the guest points at, focuses or touches a button that opens it, so the
 * calendar is closer to ready by the time the panel is on screen.
 */
export function preloadBokunWidgets(): void {
  if (typeof window === 'undefined' || !BOKUN_CHANNEL_UUID) return;
  void ensureBokunLoader();
}

/**
 * Does the supplier answer at all? A frame that cannot load still fires
 * `load` in Chrome, for the browser's own error page, so the plain iframe is
 * only offered when the two hosts it needs can be reached (the frame's
 * document and its scripts). An opaque answer is enough: any answer.
 */
async function supplierReachable(widgetUrl: string): Promise<boolean> {
  try {
    await Promise.all([widgetUrl, 'https://static.bokun.io/'].map((url) =>
      fetch(url, { method: 'HEAD', mode: 'no-cors', cache: 'no-store' })));
    return true;
  } catch {
    return false;
  }
}

type Status = 'loading' | 'ready' | 'failed';

/**
 * Renders a Bókun widget using the official BokunWidgetsLoader embed
 * method. The loader script watches for `.bokunWidget` elements and puts a
 * managed iframe inside them (it renders into the div itself, so the div has
 * no children of ours: the loading state sits beside it, not in it).
 *
 * Falls back to a direct iframe if the loader hasn't processed the div
 * 3 seconds after its script arrived (e.g. ad-blocker, script-load failure),
 * and to the WhatsApp path if the supplier cannot be reached or no frame has
 * loaded at all.
 */
export default function BokunCalendarWidget({
  bokunActivityId,
  experienceName = 'Experience',
  className,
  style,
  variant = 'calendar',
  whatsappHref,
}: BokunCalendarWidgetProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  /** "Try again" mounts a fresh div, which the loader picks up as a new widget. */
  const [attempt, setAttempt] = useState(0);
  const frameTitle = useRef(experienceName);
  frameTitle.current = experienceName;

  const template = variant === 'experience' ? 'experience' : 'experience-calendar';
  const widgetUrl = BOKUN_CHANNEL_UUID
    ? `https://widgets.bokun.io/online-sales/${BOKUN_CHANNEL_UUID}/${template}/${bokunActivityId}`
    : '';
  /* One div per address and per attempt: the loader sets a widget up once,
     so another activity, another template or "Try again" needs a new div. */
  const frameKey = `${widgetUrl}#${attempt}`;

  const isProcessed = useCallback(
    () => !!containerRef.current?.querySelector('iframe'),
    [],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !widgetUrl) return;
    setStatus('loading');
    // Só o site ao vivo carrega serviços de terceiros (shared/deployment.ts):
    // num preview ou em local o calendário nunca chega, e quem lá está vê logo
    // o caminho alternativo.
    if (!isLiveSiteHostname(window.location.hostname)) {
      setStatus('failed');
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];
    const markReady = () => { if (!cancelled) setStatus('ready'); };

    /* Load the Bokun script dynamically (only on first widget render). The
       analytics guard is installed in there, before anything of ours below
       listens to the frame. */
    const loader = ensureBokunLoader();

    /* The frame is ready when its document has loaded, or as soon as it
       talks to this page (the supplier's frame reports its height by
       postMessage). Either may come late: the div stays mounted, so the
       calendar still appears if it arrives after the guest was offered the
       other ways to book. */
    const watched = new WeakSet<HTMLIFrameElement>();
    const watchFrame = () => {
      const frame = el.querySelector('iframe');
      if (!frame || watched.has(frame)) return;
      watched.add(frame);
      // The supplier names its frame with an internal id; a screen reader
      // should hear what the frame is for.
      frame.title = frameTitle.current;
      frame.addEventListener('load', markReady, { once: true });
    };
    const observer = new MutationObserver(watchFrame);
    observer.observe(el, { childList: true, subtree: true });
    watchFrame();
    const onMessage = (event: MessageEvent) => {
      const frame = el.querySelector('iframe');
      if (frame && event.source === frame.contentWindow) markReady();
    };
    window.addEventListener('message', onMessage);

    /* Nudge the loader to process this widget div, in case it missed it. */
    const nudge = () => {
      if (cancelled || isProcessed()) return;
      const widgets = (window as any).BokunWidgetsLoader;
      if (widgets) {
        if (typeof widgets.initialize === 'function') widgets.initialize();
        else if (typeof widgets.init === 'function') widgets.init();
        else if (typeof widgets.start === 'function') widgets.start();
      }
    };

    /* Fallback: if the loader never processes the div (e.g. blocked by
       privacy extension), inject a plain iframe so the booking still
       works. The user will get the standard Bókun page-based checkout
       instead of the modal overlay — still functional, just not ideal.
       Not when the supplier cannot be reached: the frame would only show
       the browser's error page, so the guest gets the other ways to book. */
    let directFrameAsked = false;
    const directFrame = async () => {
      if (cancelled || directFrameAsked || isProcessed()) return;
      directFrameAsked = true;
      const reachable = await supplierReachable(widgetUrl);
      if (cancelled || isProcessed()) return;
      if (!reachable) {
        // Not before the loading line has been on screen for a moment: an
        // answer in a few milliseconds made the panel (and "Try again") blink.
        timers.push(setTimeout(() => {
          if (!cancelled && !isProcessed()) setStatus('failed');
        }, Math.max(0, 700 - (Date.now() - startedAt))));
        return;
      }
      const iframe = document.createElement('iframe');
      iframe.src = widgetUrl;
      iframe.title = frameTitle.current;
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
    };

    /* The clock for the fallback starts when the script has arrived: the
       panel asks for it on demand, and on a slow connection 3 seconds from
       mount would put the plain iframe in first and then have the loader
       replace it. A script that failed will not process anything: the
       fallback is tried at once. If the script neither arrives nor fails,
       it is tried after 8 seconds all the same. */
    loader.then((scriptLoaded) => {
      if (cancelled) return;
      if (!scriptLoaded) {
        void directFrame();
        return;
      }
      nudge();
      timers.push(setTimeout(nudge, 1500));
      timers.push(setTimeout(directFrame, 3000));
    });
    timers.push(setTimeout(directFrame, 8000));
    timers.push(setTimeout(() => {
      if (!cancelled) setStatus((current) => (current === 'loading' ? 'failed' : current));
    }, GIVE_UP_AFTER_MS));

    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener('message', onMessage);
      timers.forEach(clearTimeout);
    };
  }, [frameKey, widgetUrl, isProcessed]);

  if (!BOKUN_CHANNEL_UUID) return null;

  return (
    <div className={cn('relative', status === 'loading' && 'min-h-[200px]', className)} style={style}>
      {/* While the supplier's frame loads: the same quiet line the calendar
          of a home shows (BookingWidget.tsx). */}
      {status === 'loading' && (
        <div className="absolute inset-x-0 top-0 flex items-center justify-center gap-2 px-5 py-16" role="status">
          <Loader2 className="w-4 h-4 animate-spin text-pa-stone" aria-hidden="true" />
          <span className="caption text-pa-stone">{t('bookingWidget.loadingCalendar', 'Loading availability...')}</span>
        </div>
      )}

      {/* The frame did not arrive: try once more, or book the way an
          experience without a calendar is booked. */}
      {status === 'failed' && (
        <div className="px-5 py-12 text-center sm:px-8" role="alert">
          <p className="body-sm text-pa-earth">{t('errors.generic', 'Something went wrong. Please try again.')}</p>
          <div className="mx-auto mt-6 flex max-w-[360px] flex-col gap-2">
            <button
              type="button"
              onClick={() => { setStatus('loading'); setAttempt((n) => n + 1); }}
              className="btn-ghost w-full px-5"
            >
              {t('bookingWidget.tryAgain', 'Try again')}
            </button>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary w-full whitespace-normal px-5"
              >
                <MessageCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                {t('experience.messageWhatsApp', 'Message us on WhatsApp to book')}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Opacity, not display or visibility: a hidden frame is throttled by
          the browser and cannot measure itself. */}
      <div
        key={frameKey}
        ref={containerRef}
        className={cn(
          'bokunWidget transition-opacity duration-300',
          status === 'ready' ? 'opacity-100' : 'opacity-0 pointer-events-none',
          status === 'failed' && 'h-0 overflow-hidden',
        )}
        data-src={widgetUrl}
      />
    </div>
  );
}
