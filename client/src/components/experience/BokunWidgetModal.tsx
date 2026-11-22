/* ==========================================================================
   BOKUN WIDGET MODAL — the site's panel around the supplier's calendar
   One panel for the booking card (computer) and the booking bar (phone):
   a full-height sheet on a phone, a centred dialog with 12 px corners from
   640 px. The header, the close button, the list of options and the footer
   are ours; the calendar, the participants and the checkout are Bókun's
   (BokunCalendarWidget.tsx says what can and cannot be styled from here).

   Decisão E14 da auditoria de design (20 nov 2026): the moment of booking an
   experience did not look like the site. The calendar is no longer shown
   raw in the page; a button in the site's design opens it here.
   ========================================================================== */

import { useEffect, useId, useRef, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { MessageCircle, X } from 'lucide-react';
import BokunCalendarWidget from './BokunCalendarWidget';
import type { BokunOption } from './ExperienceBookingCard';
import { keepHyphens } from '@/lib/format';

interface BokunWidgetModalProps {
  open: boolean;
  onClose: () => void;
  bokunActivityId: number;
  experienceName: string;
  /** Which Bókun widget goes in the panel (BokunCalendarWidget). */
  variant?: 'calendar' | 'experience';
  /** The activity's options, listed above the calendar when the guest has
   *  not chosen one yet (the phone's bar opens the panel directly). */
  options?: BokunOption[];
  /** The option the guest chose in the card: shown alone above the calendar,
   *  as a reminder of its day, time and price. The supplier's calendar cannot
   *  be opened on an option; the guest picks the matching date and time. */
  selectedOption?: BokunOption | null;
  /** The WhatsApp link of the surface that opened the panel. */
  whatsappHref?: string;
  /** The button that opened the panel: focus goes back to it on close. */
  returnFocusTo?: RefObject<HTMLElement | null>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** One option of an activity: its name, its schedule, its price. */
function OptionRow({ option }: { option: BokunOption }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-pa-sand px-4 py-3">
      <div className="min-w-0">
        <p className="body-sm font-medium leading-tight text-pa-dark">{option.name}</p>
        {option.detail && <p className="caption mt-0.5 text-pa-stone">{option.detail}</p>}
      </div>
      {option.priceFrom ? (
        <span className="body-sm shrink-0 whitespace-nowrap font-medium tabular-nums text-pa-dark">€{option.priceFrom}</span>
      ) : null}
    </div>
  );
}

/**
 * Bókun's own checkout window: its script adds it to <body> and shows it
 * over the whole page (z-index 10000000) once the guest has chosen. While it
 * is open the keyboard belongs to it, not to the panel underneath.
 */
function supplierCheckoutOpen(): boolean {
  const el = document.getElementById('bokun-modal-container');
  return !!el && el.getClientRects().length > 0;
}

export default function BokunWidgetModal({
  open,
  onClose,
  bokunActivityId,
  experienceName,
  variant = 'calendar',
  options,
  selectedOption,
  whatsappHref,
  returnFocusTo,
}: BokunWidgetModalProps) {
  const { t } = useTranslation();
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The effect below must not start over when the parent renders again (its
  // cleanup moves the focus): the latest onClose is read from here.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // While open: the page behind does not scroll, Escape closes, Tab stays in
  // the panel, and on close the focus returns to the button that opened it.
  useEffect(() => {
    if (!open) return;
    const opener = returnFocusTo?.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

    // The lock is on <body> alone (on <html> the page's sticky card and
    // section bar let go while the panel was open). Bókun's script clears the
    // body's overflow when its checkout window closes, with this panel still
    // open under it: lock again whenever that happens.
    const body = document.body;
    const prevBodyOverflow = body.style.overflow;
    const lock = () => { if (body.style.overflow !== 'hidden') body.style.overflow = 'hidden'; };
    lock();
    const relock = new MutationObserver(lock);
    relock.observe(body, { attributes: true, attributeFilter: ['style'] });

    closeRef.current?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (supplierCheckoutOpen()) return;
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => el.getClientRects().length > 0);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      relock.disconnect();
      body.style.overflow = prevBodyOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open, returnFocusTo]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-stretch justify-center sm:items-center sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 animate-in fade-in-0 duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-label ${id}-title`}
        className="relative flex w-full flex-col overflow-hidden bg-white shadow-2xl animate-in fade-in-0 duration-200 sm:h-[760px] sm:max-h-[90vh] sm:max-w-[520px] sm:rounded-xl sm:border sm:border-pa-sand"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-pa-sand px-5 py-4">
          <div className="min-w-0">
            <p id={`${id}-label`} className="eyebrow text-pa-stone">
              {t('experience.reserve', 'Reserve')}
            </p>
            <h2 id={`${id}-title`} className="mt-1.5 line-clamp-2 font-display text-[22px] font-light leading-tight text-pa-dark">
              {experienceName}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="-mr-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-pa-stone transition-colors hover:bg-pa-warm hover:text-pa-dark"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* An activity with several options: what each one is (or the one
              the guest chose in the card), before the supplier's calendar
              asks for a date and a time. The calendar names its start times
              by hour and duration only. */}
          {selectedOption ? (
            <div className="border-b border-pa-sand px-5 py-4">
              <OptionRow option={selectedOption} />
            </div>
          ) : options && options.length > 1 ? (
            <div className="border-b border-pa-sand px-5 py-5">
              <p className="eyebrow mb-3 text-pa-stone">
                {t('experience.chooseOption', 'Choose your option')}
              </p>
              <ul className="space-y-2">
                {options.map((opt, i) => (
                  <li key={i}>
                    <OptionRow option={opt} />
                  </li>
                ))}
              </ul>
              <p className="caption mt-3 text-pa-stone">
                {t('experience.pickOptionHint', 'Select a tour to check live availability')}
              </p>
            </div>
          ) : null}

          {/* Air around the supplier's frame: its own box and border sit
              inside the panel instead of against its edges. */}
          <div className="px-3 py-3 sm:px-5 sm:py-5">
            <BokunCalendarWidget
              bokunActivityId={bokunActivityId}
              experienceName={experienceName}
              variant={variant}
              whatsappHref={whatsappHref}
            />
          </div>
        </div>

        <div
          className="flex shrink-0 items-center justify-between gap-3 border-t border-pa-sand px-5 pt-1"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)' }}
        >
          <span className="caption text-pa-stone">
            {keepHyphens(t('experience.secureBooking', 'Secure booking by Bókun'))}
          </span>
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="caption inline-flex min-h-11 shrink-0 items-center gap-1.5 text-pa-gold-aa transition-colors hover:text-pa-dark"
            >
              <MessageCircle className="h-3.5 w-3.5" aria-hidden="true" /> WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
