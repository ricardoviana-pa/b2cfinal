import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { pushDL } from '@/lib/datalayer';
import {
  BF_EXIT_CODE,
  BF_EXIT_IDLE_MS,
  BF_EXIT_MIN_DWELL_MS,
  BF_EXIT_SESSION_KEY,
  bfExitCopy,
  bfTimeLeft,
  formatBfTimeLeft,
  isBfExitActive,
} from '@/lib/blackFridayExit';

interface Props {
  /** Never offer while true (e.g. the payment step, where the card form lives). */
  blocked?: boolean;
  /** The 15% is already on the quote. */
  couponApplied: boolean;
  /** The checkout shows the promo field (CHECKOUT_PROMO). Without it we do not point to a code. */
  promoEnabled: boolean;
  /** Pre-fills and opens the promo field. It never applies the code by itself. */
  onUseCode: () => void;
}

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(BF_EXIT_SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function markSeen() {
  try {
    sessionStorage.setItem(BF_EXIT_SESSION_KEY, '1');
  } catch {
    /* private mode: it may show again on reload, which is acceptable */
  }
}

/**
 * Black Friday 2026 exit message for /checkout/:intentId.
 * Shown once per browser session, only while the offer is live.
 * Desktop: mouse leaves through the top of the page (after a short dwell).
 * Touch: no interaction for a while. No history tricks, no beforeunload.
 */
export default function BlackFridayExitIntent({ blocked, couponApplied, promoEnabled, onUseCode }: Props) {
  const { i18n } = useTranslation();
  const copy = bfExitCopy(i18n.language);
  const [open, setOpen] = useState(false);
  const [timerText, setTimerText] = useState<string | null>(null);
  const mountedAt = useRef(Date.now());

  // Listeners live only while the offer is live and nothing blocks the message.
  useEffect(() => {
    // Without the promo field (CHECKOUT_PROMO off) and without the code already on the quote
    // the guest has no way to use the offer, so we do not announce it.
    const canUseOffer = couponApplied || promoEnabled;
    if (blocked || open || !canUseOffer || !isBfExitActive() || seenThisSession()) return;

    const show = () => {
      if (!isBfExitActive() || seenThisSession()) return;
      markSeen();
      setOpen(true);
      pushDL({ event: 'bf_exit_shown', coupon_applied: couponApplied });
    };

    const onMouseOut = (e: MouseEvent) => {
      // relatedTarget null = the pointer left the document, clientY <= 0 = through the top edge.
      if (e.relatedTarget === null && e.clientY <= 0 && Date.now() - mountedAt.current >= BF_EXIT_MIN_DWELL_MS) {
        show();
      }
    };

    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const resetIdle = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(show, BF_EXIT_IDLE_MS);
    };
    // Only touch devices get the idle trigger; a desktop guest reading the page is not leaving.
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const idleEvents: Array<keyof WindowEventMap> = ['touchstart', 'scroll', 'keydown'];
    if (coarse) {
      resetIdle();
      idleEvents.forEach((ev) => window.addEventListener(ev, resetIdle, { passive: true }));
    }
    document.addEventListener('mouseout', onMouseOut);
    return () => {
      clearTimeout(idleTimer);
      idleEvents.forEach((ev) => window.removeEventListener(ev, resetIdle));
      document.removeEventListener('mouseout', onMouseOut);
    };
  }, [blocked, open, couponApplied, promoEnabled]);

  // The countdown exists only from 29 Nov, and only ticks while the message is open.
  useEffect(() => {
    if (!open) return;
    const tick = () => {
      const left = bfTimeLeft();
      setTimerText(left ? formatBfTimeLeft(left) : null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [open]);

  const close = useCallback((cta: boolean) => {
    setOpen(false);
    pushDL({ event: cta ? 'bf_exit_cta' : 'bf_exit_dismiss', coupon_applied: couponApplied });
    if (cta && !couponApplied) onUseCode();
  }, [couponApplied, onUseCode]);

  const showCodeCopy = !couponApplied;
  const body = couponApplied ? copy.bodyApplied : copy.body.replace('{code}', BF_EXIT_CODE);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(false); }}>
      <DialogContent className="max-w-[440px] rounded-md bg-white p-6 sm:p-8 gap-0 border-pa-sand">
        <DialogTitle className="font-display text-[26px] leading-tight font-normal text-pa-dark">
          {copy.title}
        </DialogTitle>
        <DialogDescription className="mt-3 body-sm text-pa-stone-aa">
          {body}
        </DialogDescription>
        {timerText && (
          <div className="mt-4" role="timer" aria-live="off">
            <p className="eyebrow">{copy.timeLeft}</p>
            <p className="mt-1 font-display text-[34px] leading-none text-pa-dark tabular-nums">{timerText}</p>
          </div>
        )}
        <button
          type="button"
          onClick={() => close(true)}
          className="btn-primary mt-6 w-full"
        >
          {showCodeCopy ? copy.ctaUseCode : copy.ctaContinue}
        </button>
        <button
          type="button"
          onClick={() => close(false)}
          className="btn-text mt-2 w-full min-h-[44px] text-pa-stone-aa hover:text-pa-dark transition-colors"
        >
          {copy.later}
        </button>
      </DialogContent>
    </Dialog>
  );
}
