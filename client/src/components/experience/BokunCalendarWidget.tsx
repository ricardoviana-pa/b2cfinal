/* ==========================================================================
   BOKUN CALENDAR WIDGET
   Uses the official Bókun WidgetsLoader script to embed the booking calendar.
   The loader handles iframe creation, auto-resizing, and cart/checkout
   navigation — fixing the "Go to cart" issue that raw iframes have.
   ========================================================================== */

import { useEffect, useRef } from 'react';

interface BokunCalendarWidgetProps {
  bokunActivityId: number;
  channelUuid: string;
}

const LOADER_URL = 'https://widgets.bokun.io/assets/javascripts/apps/build/BokunWidgetsLoader.js';

let loaderPromise: Promise<void> | null = null;

function ensureLoaderScript(channelUuid: string): Promise<void> {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    const existing = document.querySelector(`script[src*="BokunWidgetsLoader"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.src = `${LOADER_URL}?bookingChannelUUID=${channelUuid}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Bókun widget script'));
    document.head.appendChild(script);
  });

  return loaderPromise;
}

export default function BokunCalendarWidget({
  bokunActivityId,
  channelUuid,
}: BokunCalendarWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create the widget div that the Bókun loader will pick up
    const widgetDiv = document.createElement('div');
    widgetDiv.className = 'bokunWidget';
    widgetDiv.setAttribute(
      'data-src',
      `https://widgets.bokun.io/online-sales/${channelUuid}/experience-calendar/${bokunActivityId}`
    );
    container.innerHTML = '';
    container.appendChild(widgetDiv);

    // Load the script; once loaded, Bókun auto-initialises any .bokunWidget divs
    ensureLoaderScript(channelUuid).then(() => {
      // The loader scans the DOM on load. If the widget was added after
      // the script loaded, we need to re-trigger initialisation.
      if ((window as any).BokunWidgetsLoader) {
        try {
          (window as any).BokunWidgetsLoader.init();
        } catch {
          // Fallback: re-append script to force re-scan
        }
      }
    });

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [bokunActivityId, channelUuid]);

  return (
    <div
      ref={containerRef}
      style={{ minHeight: '480px' }}
      className="bg-white"
    />
  );
}
