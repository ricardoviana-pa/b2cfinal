import { lazy, Suspense, useEffect, useState, type Ref, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/useMobile";
import { openDatePickerWithin } from "@/lib/datePicker";
import { cn } from "@/lib/utils";
import type { useDateRangePicker } from "./useDateRangePicker";

/* ==========================================================================
   SEARCH DATES: one calendar in the three places a guest chooses dates
   --------------------------------------------------------------------------
   The homepage search and the listing search used the browser's date field
   ("dd/mm/yyyy", a different picker on every phone); the home's page had the
   site's own calendar. Now all three open the same one (design audit, Nov
   2026): AvailabilityCalendar in `search` mode, which has no home behind it,
   so every future day is open and there is no availability legend.

   The native <input type="date"> stays in the page: it is what works before
   React has loaded (see lib/datePicker.ts). Once the page is interactive a
   button covers it and opens the site's calendar instead.
   ========================================================================== */

const loadCalendar = () => import("./AvailabilityCalendar");
const AvailabilityCalendar = lazy(loadCalendar);

/** Fetch the calendar's code before the first tap (pointer over a date field, focus). */
export const preloadSearchCalendar = (): void => {
  void loadCalendar().catch(() => { /* offline or a failed chunk: the tap retries it */ });
};

const NO_DAYS: never[] = [];

/** The date field that opened the calendar: the keyboard focus goes back to it on close. */
let lastOpener: HTMLElement | null = null;

/** True once React runs in the browser. Until then the native date field does the job. */
export function useSearchDatesReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  return ready;
}

/** What the native input gets once the site's calendar has taken over: still
 *  in the form (values, `required`), out of the way of the pointer and the Tab key. */
export const nativeDateInputProps = (ready: boolean) =>
  (ready ? { tabIndex: -1, "aria-hidden": true as const, style: { pointerEvents: "none" as const } } : {});

/**
 * The button that covers a date field and opens the calendar on that date.
 * Rendered only when `useSearchDatesReady()` is true.
 */
export function SearchDateButton({ label, shown, expanded, onOpen, className }: {
  /** "Check-in" / "Check-out" */
  label: string;
  /** The chosen date as the field shows it, or "" */
  shown: string;
  expanded: boolean;
  onOpen: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={expanded}
      aria-label={shown ? `${label}: ${shown}` : label}
      onClick={(e) => { lastOpener = e.currentTarget; onOpen(); }}
      onPointerEnter={preloadSearchCalendar}
      onFocus={preloadSearchCalendar}
      className={cn(
        "absolute inset-0 z-[1] h-full w-full cursor-pointer rounded-[inherit] bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pa-gold",
        className,
      )}
    />
  );
}

/**
 * One date cell of a search bar (the listing's): the date, or the field's
 * name while it is empty, in the site's type instead of the browser's
 * "dd/mm/yyyy". Underneath, the native input (until the page is interactive);
 * on top, the button that opens the site's calendar.
 */
export function SearchDateCell({
  label, value, shown, min, ready, expanded, onOpen, onNativeChange, inputRef, className, textClassName,
}: {
  label: string;
  /** ISO date or "" */
  value: string;
  /** `value` formatted for the guest, or "" */
  shown: string;
  min?: string;
  ready: boolean;
  expanded: boolean;
  onOpen: () => void;
  onNativeChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
  textClassName?: string;
}) {
  return (
    <div
      className={cn("pa-date-cell relative min-w-0 cursor-pointer", className)}
      onClick={ready ? undefined : (e) => openDatePickerWithin(e.currentTarget)}
    >
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none flex h-full items-center truncate body-sm",
          value ? "text-pa-dark" : "text-pa-stone",
          textClassName,
        )}
      >
        <span className="truncate">{shown || label}</span>
      </span>
      <input
        ref={inputRef}
        type="date"
        min={min}
        aria-label={label}
        value={value}
        onInput={(e) => onNativeChange(e.currentTarget.value)}
        onChange={(e) => onNativeChange(e.target.value)}
        className="pa-date-hit"
        {...nativeDateInputProps(ready)}
      />
      {ready && <SearchDateButton label={label} shown={shown} expanded={expanded} onOpen={onOpen} />}
    </div>
  );
}

/**
 * The calendar itself. On a computer or tablet it opens under `anchorRef`
 * (the search bar) in a floating panel; on a phone it is the same full-screen
 * picker as on a home's page.
 */
export default function SearchDatesPicker({ picker, anchorRef, checkIn, checkOut, onChange }: {
  picker: ReturnType<typeof useDateRangePicker>;
  anchorRef: RefObject<HTMLElement | null>;
  checkIn: string;
  checkOut: string;
  onChange: (next: { checkIn: string; checkOut: string }) => void;
}) {
  const isMobile = useIsMobile();
  if (!picker.open) return null;

  const calendar = (
    <Suspense
      fallback={
        <div className="flex h-[360px] items-center justify-center" aria-busy="true">
          <Loader2 className="h-4 w-4 animate-spin text-pa-stone" />
        </div>
      }
    >
      <AvailabilityCalendar
        search
        days={NO_DAYS}
        checkIn={checkIn}
        checkOut={checkOut}
        phase={picker.phase}
        onPhaseChange={picker.setPhase}
        onClose={picker.close}
        onSelectRange={({ checkIn: ci, checkOut: co, done }) => {
          onChange({ checkIn: ci, checkOut: co });
          // Closes once the check-out is chosen; changing only the check-in
          // leaves it open on the check-out, as on a home's page.
          if (done) picker.close();
        }}
      />
    </Suspense>
  );

  // Phone: the calendar brings its own full-screen dialog (a portal). Its
  // in-page "Select dates" button has no place in a search bar.
  if (isMobile) return <div hidden>{calendar}</div>;

  return (
    <Popover open onOpenChange={(open) => { if (!open) picker.close(); }}>
      <PopoverAnchor virtualRef={anchorRef as RefObject<HTMLElement>} />
      <PopoverContent
        align="center"
        sideOffset={10}
        collisionPadding={16}
        // The date fields open, switch and close the calendar themselves
        // (useDateRangePicker); a click on them is not "outside".
        onInteractOutside={(e) => {
          const target = e.target as Node | null;
          if (target && picker.containerRef.current?.contains(target)) e.preventDefault();
        }}
        // There is no popover trigger (two fields open it), so the focus is
        // handed back by hand, to the field that opened the calendar.
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (lastOpener?.isConnected) lastOpener.focus({ preventScroll: true });
        }}
        className="w-[min(680px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-pa-sand bg-white p-0 shadow-[0_12px_40px_rgba(26,26,24,0.16)]"
      >
        {calendar}
      </PopoverContent>
    </Popover>
  );
}
