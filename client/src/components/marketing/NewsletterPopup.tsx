/* ==========================================================================
   NEWSLETTER POP-UP — lazy chunk, loaded by NewsletterPopupGate only after
   the trigger. No image, no new font: the chunk stays small.

   Computer: a centred dialog (Radix: focus trap, Esc, click outside, close
   button). Phone and touch tablet: a small NON-modal sheet at the bottom
   (focus moves to its title and back on close), at most 45% of the
   screen, no dark backdrop, the page stays usable behind it. That is what
   keeps it clear of Google's intrusive interstitial rule on mobile, and it
   sits above the fixed booking bar of a house page instead of covering it.
   Both close with one tap and with Esc.

   On a PA house page it speaks about that house and the server records the
   house as the interest: "Quer saber quando esta casa tiver datas livres ou
   preço de época baixa?" when the alert rule is on (houseAlerts), "Gostou
   desta casa?" otherwise; elsewhere the general promise.
   ========================================================================== */

import { useEffect, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { isNewsletterHouse, type NewsletterDevice, type NewsletterTrigger } from '@shared/newsletter';
import NewsletterForm from './NewsletterForm';

export type PopupCloseReason = 'x' | 'esc' | 'backdrop' | 'not_now' | 'navigation';

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

/** Reads the house page's own cached query: no extra request on a house page. */
function usePromotableHouse(propertySlug?: string): string | undefined {
  const property = trpc.properties.getBySlugForSite.useQuery(
    { slug: propertySlug ?? '' },
    { enabled: !!propertySlug, staleTime: Infinity },
  );
  return propertySlug && property.data && isNewsletterHouse(property.data) ? propertySlug : undefined;
}

/** Height of a fixed bar at the bottom (the house page booking bar) the sheet must sit above. */
function useBottomOffset(active: boolean): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!active) return;
    const measure = () => {
      const bar = document.querySelector('[data-nl-bottom-bar]') as HTMLElement | null;
      const visible = bar && window.getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().height : 0;
      setOffset(Math.round(visible));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active]);
  return offset;
}

function CloseButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute top-1.5 right-1.5 flex items-center justify-center w-11 h-11 text-[#6B6860] hover:text-[#1A1A18] transition-colors"
    >
      <X className="w-5 h-5" aria-hidden />
    </button>
  );
}

export default function NewsletterPopup({ open, onClose, onSubscribed, propertySlug, trigger, device, houseAlerts }: NewsletterPopupProps) {
  const { t } = useTranslation();
  const houseSlug = usePromotableHouse(propertySlug);
  const mobile = device === 'mobile';
  const bottom = useBottomOffset(open && mobile);
  const copy = houseSlug ? (houseAlerts ? 'newsletter.house' : 'newsletter.houseInterest') : 'newsletter.popup';
  const closeLabel = t('newsletter.popup.close');

  // Esc on the phone sheet (the desktop dialog handles its own).
  useEffect(() => {
    if (!open || !mobile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose('esc'); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, mobile, onClose]);

  // Phone sheet: screen readers hear it appear (focus on its title, which
  // opens no keyboard and scrolls nothing); on close, focus goes back.
  const sheetTitleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!open || !mobile) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetTitleRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [open, mobile]);

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
    return (
      <div
        data-nl-popup
        role="dialog"
        aria-modal="false"
        aria-labelledby={TITLE_ID}
        className="fixed inset-x-0 z-[95] md:max-w-[560px] md:mx-auto bg-[#FAFAF7] border-t border-[#E8E4DC] rounded-t-2xl shadow-[0_-10px_30px_-12px_rgba(26,26,24,0.35)] overflow-y-auto overscroll-contain nl-sheet"
        style={{
          bottom,
          maxHeight: '45vh',
          paddingBottom: bottom ? 12 : 'calc(12px + env(safe-area-inset-bottom, 0px))',
          fontFamily: 'var(--font-body)',
        }}
      >
        <div className="px-5 pt-4 pr-14">
          <h2 id={TITLE_ID} ref={sheetTitleRef} tabIndex={-1} className="font-display text-[19px] font-light leading-[1.3] text-[#1A1A18] mb-3 outline-none">
            {t(`${copy}.title`)}
          </h2>
          {form}
        </div>
        <CloseButton label={closeLabel} onClick={() => onClose('x')} />
        <style>{`
          .nl-sheet { animation: nlSheetUp .35s cubic-bezier(0.16,1,0.3,1); }
          @keyframes nlSheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
          @media (prefers-reduced-motion: reduce) { .nl-sheet { animation: none; } }
        `}</style>
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
