/* ==========================================================================
   NEWSLETTER POP-UP — lazy chunk, loaded by NewsletterPopupGate only after
   the trigger. No image, no new font: the chunk stays small.

   Computer: a centred dialog (Radix: focus trap, Esc, click outside, close
   button).

   Phone and touch tablet: a NON-modal strip at the bottom, 60 px: one short
   line, the "Subscrever" button and the X. No dark backdrop, the page stays
   usable. The form with the consent sentence opens only when the person
   taps "Subscrever" (the consent is always read before sending). The gate
   shows the strip only while it and the fixed booking bar of a house page
   fit in 30% of the visible height; the opened form may take more, because
   the person asked for it, and scrolls inside with the X fixed at the top.
   That is what keeps it clear of Google's intrusive interstitial rule on
   mobile, and it sits above the booking bar instead of covering it, below
   every overlay (z-45: above the bar, z-40; under the drawers, dialogs, menu
   and cookie banner, z-50 and up). It closes with the X, Esc, any
   navigation, a tap on the booking bar, and as soon as another overlay
   opens (a drawer, a dialog, the menu, the cookie banner): never on top of
   another dialog, and never frozen under one.

   On a PA house page it speaks about that house and the server records the
   house as the interest: "Quer saber quando esta casa tiver datas livres ou
   preço de época baixa?" when the alert rule is on (houseAlerts), "Gostou
   desta casa?" otherwise; elsewhere the general promise.
   ========================================================================== */

import { useCallback, useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { isNewsletterHouse, type NewsletterDevice, type NewsletterTrigger } from '@shared/newsletter';
import NewsletterForm from './NewsletterForm';
import { bottomBarHeight, overlayMutation, overlayOpen } from './newsletterBrowser';

export type PopupCloseReason = 'x' | 'esc' | 'backdrop' | 'not_now' | 'navigation' | 'yield';

interface NewsletterPopupProps {
  open: boolean;
  onClose: (reason: PopupCloseReason) => void;
  onSubscribed: () => void;
  /** Present on a house page. */
  propertySlug?: string;
  trigger: NewsletterTrigger;
  device: NewsletterDevice;
  /** newsletter.config.houseAlerts: on a house page, promise the alert or only record the interest. */
  houseAlerts: boolean;
}

const TITLE_ID = 'nl-popup-title';
const DESC_ID = 'nl-popup-desc';
/** Room left above the opened form for the site header (it never covers the whole screen). */
const HEADER_ROOM_PX = 64;

/** Reads the house page's own cached query: no extra request on a house page. */
function usePromotableHouse(propertySlug?: string): string | undefined {
  const property = trpc.properties.getBySlugForSite.useQuery(
    { slug: propertySlug ?? '' },
    { enabled: !!propertySlug, staleTime: Infinity },
  );
  return propertySlug && property.data && isNewsletterHouse(property.data) ? propertySlug : undefined;
}

/** The booking bar the sheet sits above, and the visible height (innerHeight: the dynamic viewport, not `vh`). */
function useSheetGeometry(active: boolean): { bottom: number; viewport: number } {
  const [geometry, setGeometry] = useState({ bottom: 0, viewport: 0 });
  useEffect(() => {
    if (!active) return;
    const measure = () => setGeometry({ bottom: bottomBarHeight(), viewport: window.innerHeight });
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);
  return geometry;
}

/**
 * The phone sheet is not modal, so nothing stops the page from opening
 * another overlay under it. It closes ("yield") when one opens: a Radix
 * drawer or dialog (they also set pointer-events:none on the body, which
 * would leave the sheet visible and dead to taps), the header menu, the
 * cookie banner reopened from the footer, a lead form marked
 * data-nl-suppress. It also closes on a tap on the booking bar, before the
 * booking drawer opens. Mutations are filtered, then checked once per frame.
 */
function useYieldToOverlays(active: boolean, onYield: () => void): void {
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const check = () => {
      frame = 0;
      if (overlayOpen()) onYield();
    };
    const observer = new MutationObserver((records) => {
      if (!frame && records.some(overlayMutation)) frame = window.requestAnimationFrame(check);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'data-state', 'aria-modal', 'hidden', 'role'],
    });
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (target?.closest?.('[data-nl-bottom-bar]')) onYield();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    check();
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [active, onYield]);
}

function SheetStyle() {
  return (
    <style>{`
      .nl-sheet { animation: nlSheetUp .35s cubic-bezier(0.16,1,0.3,1); }
      @keyframes nlSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      @media (prefers-reduced-motion: reduce) { .nl-sheet { animation: none; } }
    `}</style>
  );
}

function CloseButton({ label, onClick, inline = false }: { label: string; onClick: () => void; inline?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${inline ? 'shrink-0' : 'absolute top-1.5 right-1.5 z-10'} flex items-center justify-center w-11 h-11 text-[#6B6860] hover:text-[#1A1A18] transition-colors`}
    >
      <X className="w-5 h-5" aria-hidden />
    </button>
  );
}

export default function NewsletterPopup({ open, onClose, onSubscribed, propertySlug, trigger, device, houseAlerts }: NewsletterPopupProps) {
  const { t } = useTranslation();
  const houseSlug = usePromotableHouse(propertySlug);
  const mobile = device === 'mobile';
  const sheetActive = open && mobile;
  const { bottom, viewport } = useSheetGeometry(sheetActive);
  const [expanded, setExpanded] = useState(false);
  const copy = houseSlug ? (houseAlerts ? 'newsletter.house' : 'newsletter.houseInterest') : 'newsletter.popup';
  const closeLabel = t('newsletter.popup.close');

  const yieldSheet = useCallback(() => onClose('yield'), [onClose]);
  useYieldToOverlays(sheetActive, yieldSheet);

  // Esc on the phone sheet (the desktop dialog handles its own).
  useEffect(() => {
    if (!sheetActive) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose('esc'); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheetActive, onClose]);

  // Phone sheet: screen readers hear it appear (focus on its line, which
  // opens no keyboard and scrolls nothing), and hear the form when it opens;
  // on close, focus goes back.
  const stripTitleRef = useRef<HTMLParagraphElement>(null);
  const formTitleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!sheetActive) return;
    const previous = document.activeElement as HTMLElement | null;
    stripTitleRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [sheetActive]);
  useEffect(() => {
    if (sheetActive && expanded) formTitleRef.current?.focus({ preventScroll: true });
  }, [sheetActive, expanded]);
  useEffect(() => { if (!open) setExpanded(false); }, [open]);

  const form = (
    <NewsletterForm
      origin="popup"
      propertySlug={houseSlug}
      trigger={trigger}
      device={device}
      compact={mobile}
      autoFocus={!mobile}
      onSubscribed={onSubscribed}
    />
  );

  if (mobile) {
    if (!open) return null;
    const shell = 'fixed inset-x-0 z-[45] md:max-w-[560px] md:mx-auto bg-[#FAFAF7] border-t border-[#E8E4DC] rounded-t-2xl shadow-[0_-10px_30px_-12px_rgba(26,26,24,0.35)] nl-sheet';
    const padBottom = bottom ? 0 : 'env(safe-area-inset-bottom, 0px)';
    if (!expanded) {
      return (
        <div
          data-nl-popup
          role="dialog"
          aria-modal="false"
          aria-labelledby={TITLE_ID}
          className={shell}
          style={{ bottom, paddingBottom: padBottom, fontFamily: 'var(--font-body)' }}
        >
          <div className="flex items-center gap-2 h-[60px] pl-4 pr-1">
            <p
              id={TITLE_ID}
              ref={stripTitleRef}
              tabIndex={-1}
              className="flex-1 min-w-0 font-display text-[15px] font-light leading-tight text-[#1A1A18] line-clamp-2 outline-none"
            >
              {t('newsletter.footer.title')}
            </p>
            <button
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              className="pa-action shrink-0 h-11 px-4 bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-semibold uppercase hover:bg-[#333330] transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('newsletter.form.cta')}
            </button>
            <CloseButton inline label={closeLabel} onClick={() => onClose('x')} />
          </div>
          <SheetStyle />
        </div>
      );
    }
    // Opened by the person: the form with the consent sentence. It may take
    // more room than the strip (never the header's), scrolls inside, and the
    // X stays at the top, outside the scrolling part.
    const maxHeight = viewport ? Math.max(200, viewport - bottom - HEADER_ROOM_PX) : undefined;
    return (
      <div
        data-nl-popup
        role="dialog"
        aria-modal="false"
        aria-labelledby={TITLE_ID}
        className={shell}
        style={{ bottom, maxHeight, display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-body)' }}
      >
        <div
          className="overflow-y-auto overscroll-contain px-5 pt-4 pr-14"
          style={{ paddingBottom: bottom ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))' }}
        >
          <h2 id={TITLE_ID} ref={formTitleRef} tabIndex={-1} className="font-display text-[19px] font-light leading-[1.3] text-[#1A1A18] mb-3 outline-none">
            {t(`${copy}.title`)}
          </h2>
          {form}
        </div>
        <CloseButton label={closeLabel} onClick={() => onClose('x')} />
      </div>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose('x'); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[95] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-nl-popup
          aria-labelledby={TITLE_ID}
          aria-describedby={DESC_ID}
          onEscapeKeyDown={(e) => { e.preventDefault(); onClose('esc'); }}
          onPointerDownOutside={(e) => { e.preventDefault(); onClose('backdrop'); }}
          className="fixed top-1/2 left-1/2 z-[96] w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 bg-[#FAFAF7] border border-[#E8E4DC] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          <div className="px-8 pt-9 pb-7">
            <p className="eyebrow font-semibold tracking-[0.2em] uppercase text-[#806A48] mb-3">{t(`${copy}.overline`)}</p>
            <DialogPrimitive.Title id={TITLE_ID} className="font-display text-[26px] font-light leading-[1.25] text-[#1A1A18] mb-3">
              {t(`${copy}.title`)}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description id={DESC_ID} className="text-[14px] leading-relaxed text-[#6B6860] font-light mb-5">
              {t(`${copy}.body`)}
            </DialogPrimitive.Description>
            {form}
            <button
              type="button"
              onClick={() => onClose('not_now')}
              className="mt-3 min-h-[44px] text-[12px] text-[#6B6860] hover:text-[#1A1A18] underline underline-offset-2 transition-colors"
            >
              {t('newsletter.popup.notNow')}
            </button>
          </div>
          <CloseButton label={closeLabel} onClick={() => onClose('x')} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
