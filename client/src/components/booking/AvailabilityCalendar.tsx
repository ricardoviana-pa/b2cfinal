import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/useMobile";
import { intlLocale } from "@/lib/format";
import {
  applyDayClick,
  buildRangeRules,
  dayRole,
  effectivePhase,
  minNightsFor,
  type SelectionPhase,
} from "@/lib/dateRangeSelection";

export type { SelectionPhase };

export interface AvailabilityDay {
  date: string;
  status: string;
  minNights?: number;
  price?: number;
  /** Closed to arrival — cannot be selected as a check-in date */
  cta?: boolean;
  /** Closed to departure — cannot be selected as a check-out date */
  ctd?: boolean;
}

interface AvailabilityCalendarProps {
  days: AvailabilityDay[];
  /** Sidebar mode: render one month with both nav arrows (two side-by-side
   *  months don't fit a 400px column and blow up the widget height). */
  singleMonth?: boolean;
  checkIn: string;
  checkOut: string;
  /** Global fallback minimum stay for days Guesty did not annotate */
  minNights?: number;
  /** `done` is true when the click picked the check-out — the selection is
   *  complete and a picker may close. Changing only the check-in is not done:
   *  the guest is mid-change and the calendar should stay open. */
  onSelectRange: (next: { checkIn: string; checkOut: string; done: boolean }) => void;
  /** Which date the next click sets. Pass with onPhaseChange to let outside
   *  controls (the widget's Check-in / Check-out fields) drive it. */
  phase?: SelectionPhase;
  onPhaseChange?: (phase: SelectionPhase) => void;
  /** The guest dismissed the picker (phone dialog closed, Confirm pressed). */
  onClose?: () => void;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Monday-first short weekday labels for the active site locale (all 9 languages).
 *  timeZone MUST stay pinned to UTC — the reference instants are UTC midnights;
 *  formatting them in the browser zone shifts the whole row for UTC-negative visitors.
 *  Labels are clamped to 3 chars: CLDR pt-PT "abbreviated" weekdays are the FULL
 *  names ("segunda", "terça"…) and overflow the 7-column grid. */
function buildWeekdays(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  // 2024-01-01 is a Monday
  return Array.from({ length: 7 }, (_, i) =>
    capitalize(fmt.format(new Date(Date.UTC(2024, 0, 1 + i))).replace(/\.$/, "").slice(0, 3)),
  );
}

/** Full month names for the active site locale. */
function buildMonths(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) =>
    capitalize(fmt.format(new Date(Date.UTC(2024, i, 15)))),
  );
}

/** YYYY-MM-DD from Date — uses local date parts to avoid UTC timezone shift */
function toIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Normalize a date to midnight UTC for clean comparisons */
function startOfDay(dateStr: string): number {
  return new Date(dateStr + "T00:00:00Z").getTime();
}

/** Build grid of days for a given month (Mon-start week) */
function buildMonthGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  // Monday = 0, Tuesday = 1, ... Sunday = 6
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6;

  const weeks: (Date | null)[][] = [];
  let week: (Date | null)[] = [];

  // Fill empty cells before the 1st
  for (let i = 0; i < startDow; i++) week.push(null);

  for (let d = 1; d <= lastDay.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  // Fill remaining cells
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }

  return weeks;
}

export default function AvailabilityCalendar({
  singleMonth,
  days,
  checkIn,
  checkOut,
  minNights,
  onSelectRange,
  phase: phaseProp,
  onPhaseChange,
  onClose,
}: AvailabilityCalendarProps) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  // On a phone the calendar only mounts once the guest has tapped the date
  // field, so open the full-screen picker straight away: the intermediate
  // "Select dates" button was a second tap for nothing (it stays as the way
  // back in if the picker is dismissed without choosing).
  useEffect(() => { if (isMobile) setMobileOpen(true); }, [isMobile]);
  const closeMobile = () => { setMobileOpen(false); onClose?.(); };
  const [hoverDate, setHoverDate] = useState<string>("");

  // Month/weekday labels come from Intl for the SITE locale (F6) — all 9 languages
  const locale = intlLocale(i18n.language);
  const weekdays = useMemo(() => buildWeekdays(locale), [locale]);
  const months = useMemo(() => buildMonths(locale), [locale]);

  const now = new Date();
  const todayStr = toIso(now);
  const todayMs = startOfDay(todayStr);

  const rules = useMemo(() => buildRangeRules(days, minNights, todayStr), [days, minNights, todayStr]);
  const dayMap = rules.dayMap;

  // Which date the next click sets. Controlled by the parent when it passes
  // `phase` (its Check-in / Check-out fields); otherwise kept here. Opening on a
  // half-chosen stay continues with the check-out.
  const [ownPhase, setOwnPhase] = useState<SelectionPhase>(
    () => phaseProp ?? (checkIn && !checkOut ? "check-out" : "check-in"),
  );
  const phase = effectivePhase({ checkIn, checkOut, phase: phaseProp ?? ownPhase });
  const selection = { checkIn, checkOut, phase };

  // Open on the month of the date being edited, not on today: a guest
  // changing an August stay in October was sent back ten months.
  const monthOf = (iso: string) => {
    const d = iso && iso >= todayStr ? new Date(iso + "T00:00:00") : now;
    return { year: d.getFullYear(), month: d.getMonth() };
  };
  const anchorFor = (p: SelectionPhase) => (p === "check-out" ? checkOut || checkIn : checkIn || checkOut);
  const [view, setView] = useState(() => monthOf(anchorFor(phase)));
  const viewYear = view.year;
  const viewMonth = view.month;
  const atFirstMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();

  // Phase changes made here (a click moving on to the check-out) must not move
  // the view; a change from outside (the guest clicked the other field) shows
  // that field's month.
  const ownPhaseChangeRef = useRef<SelectionPhase | null>(null);
  const setPhase = useCallback((next: SelectionPhase) => {
    ownPhaseChangeRef.current = next;
    setOwnPhase(next);
    onPhaseChange?.(next);
  }, [onPhaseChange]);
  const focusPhase = (next: SelectionPhase) => {
    setPhase(next);
    const anchor = anchorFor(next);
    if (anchor) setView(monthOf(anchor));
  };
  useEffect(() => {
    if (phaseProp === undefined) return;
    if (ownPhaseChangeRef.current === phaseProp) { ownPhaseChangeRef.current = null; return; }
    ownPhaseChangeRef.current = null;
    const anchor = anchorFor(phaseProp);
    if (anchor) setView(monthOf(anchor));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseProp]);

  /** Check if a date string is blocked/unavailable */
  const isBlocked = useCallback((dateStr: string) => {
    const status = dayMap.get(dateStr)?.status;
    return status !== undefined && status !== "available";
  }, [dayMap]);

  /** Minimum stay required for the currently selected check-in (1 if none chosen) */
  const requiredMinNights = checkIn ? minNightsFor(rules, checkIn) : 1;

  const handleDayClick = (dateStr: string) => {
    const next = applyDayClick(rules, selection, dateStr);
    if (!next) return;
    onSelectRange({ checkIn: next.checkIn, checkOut: next.checkOut, done: next.done });
    setPhase(next.phase);
  };

  const navigateMonth = useCallback((dir: -1 | 1) => {
    setView(v => {
      const d = new Date(v.year, v.month + dir, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const shortDate = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }),
    [locale],
  );
  const fmtShort = (iso: string) => shortDate.format(new Date(iso + "T00:00:00Z"));

  /** Render a single month */
  const renderMonth = (year: number, month: number, showNav: boolean) => {
    const grid = buildMonthGrid(year, month);
    const checkInMs = checkIn ? startOfDay(checkIn) : 0;
    const checkOutMs = checkOut ? startOfDay(checkOut) : 0;
    // Hover preview: pointing at a valid check-out shows the stay it would make
    // (also when a check-out is already chosen — that is how a guest sees the
    // change before clicking).
    const hoverMs = hoverDate && dayRole(rules, selection, hoverDate) === "check-out" ? startOfDay(hoverDate) : 0;
    const previewing = hoverMs > 0 && hoverMs !== checkOutMs;
    const rangeEndMs = previewing ? hoverMs : checkOutMs;

    return (
      <div className="flex-1 min-w-0">
        {/* Month header */}
        <div className="flex items-center justify-between px-1 mb-4">
          {showNav ? (
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              disabled={atFirstMonth}
              className="w-8 h-8 flex items-center justify-center text-black/40 hover:text-black transition-colors disabled:opacity-0 disabled:pointer-events-none"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : <div className="w-8" />}
          <span className="text-[13px] font-medium tracking-wide text-black">
            {months[month]} {year}
          </span>
          {showNav || !isMobile ? (
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              className="w-8 h-8 flex items-center justify-center text-black/40 hover:text-black transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : <div className="w-8" />}
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-1">
          {weekdays.map(wd => (
            <div key={wd} className="text-center text-[10px] font-medium tracking-wider uppercase text-black/30 py-1">
              {wd}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {grid.flat().map((date, i) => {
            if (!date) {
              return <div key={`empty-${i}`} className="h-11" />;
            }

            const dateStr = toIso(date);
            const dateMs = startOfDay(dateStr);
            const blocked = isBlocked(dateStr);
            const role = dayRole(rules, selection, dateStr);
            const isDisabled = role === "disabled";
            // The turnover day is booked but a valid departure — don't strike it.
            const isTurnoverCheckout = blocked && role === "check-out";
            const isToday = dateStr === todayStr;
            const isCheckIn = checkIn && dateStr === checkIn;
            const isCheckOut = checkOut && dateStr === checkOut;
            const isEndpoint = isCheckIn || isCheckOut;

            // Between check-in and the (chosen or previewed) check-out
            const inRange = !!checkInMs && !!rangeEndMs && dateMs > checkInMs && dateMs < rangeEndMs;
            const isHoverEnd = previewing && dateMs === hoverMs;

            // Range edge styling (left/right rounding)
            let rangeBg = "";
            if (inRange) rangeBg = previewing ? "bg-black/[0.03]" : "bg-black/[0.04]";
            // Check-in has right range bg, check-out has left range bg
            if (isCheckIn && rangeEndMs > checkInMs) {
              rangeBg = "bg-gradient-to-l from-black/[0.04] via-transparent to-transparent";
            }
            if ((isCheckOut && !previewing) || isHoverEnd) {
              rangeBg = "bg-gradient-to-r from-black/[0.04] via-transparent to-transparent";
            }

            return (
              <div
                key={dateStr}
                className={`relative h-11 flex items-center justify-center ${rangeBg}`}
              >
                <button
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleDayClick(dateStr)}
                  // Mouse only: a tap fires an emulated hover that never
                  // leaves, which would pin a preview on the tapped day.
                  onPointerEnter={(e) => { if (e.pointerType === "mouse" && !isDisabled) setHoverDate(dateStr); }}
                  onPointerLeave={() => setHoverDate("")}
                  className={[
                    "relative z-10 w-10 h-10 flex items-center justify-center text-[13px] transition-all select-none",
                    // Endpoint (check-in or check-out selected)
                    isEndpoint
                      ? "bg-black text-white rounded-full font-medium"
                      : isHoverEnd
                        ? "bg-black/10 text-black rounded-full"
                        : "",
                    // Disabled states
                    isDisabled && !isEndpoint
                      ? blocked
                        ? "text-black/15 cursor-not-allowed"
                        : "text-black/20 cursor-not-allowed"
                      : "",
                    // Normal available day
                    !isEndpoint && !isDisabled && !isHoverEnd
                      ? "text-black hover:bg-black/[0.06] rounded-full cursor-pointer font-normal"
                      : "",
                    // Today indicator
                    isToday && !isEndpoint ? "font-semibold" : "",
                  ].filter(Boolean).join(" ")}
                  aria-label={dateStr}
                >
                  <span className={blocked && !isTurnoverCheckout ? "line-through decoration-black/20 decoration-1" : ""}>
                    {date.getDate()}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Second month for desktop view
  const secondMonth = viewMonth === 11 ? 0 : viewMonth + 1;
  const secondYear = viewMonth === 11 ? viewYear + 1 : viewYear;

  /**
   * Booking rules for the month being viewed, stated UP FRONT.
   *
   * In high season Guesty closes most days to arrival (`cta`) and raises the
   * minimum stay — e.g. July/August: 7 nights, Saturdays only. The grid honours
   * that, but silently: a guest sees a wall of unselectable days and concludes
   * the property is unavailable (this is exactly what happened with the Aug-2027
   * pre-approvals). So when arrivals are restricted to a few weekdays, say so
   * before they start clicking.
   */
  const monthRule = useMemo(() => {
    if (phase !== "check-in") return null;
    const arrivals: { weekday: number; minNights: number }[] = [];
    let anyClosed = false;
    dayMap.forEach((info, dateStr) => {
      const d = new Date(dateStr + "T00:00:00Z");
      if (d.getUTCFullYear() !== viewYear || d.getUTCMonth() !== viewMonth) return;
      if (info.status !== "available" || startOfDay(dateStr) < todayMs) return;
      if (info.cta) { anyClosed = true; return; }
      arrivals.push({ weekday: d.getUTCDay(), minNights: info.minNights ?? 1 });
    });
    if (!arrivals.length) return null;

    const weekdays = Array.from(new Set(arrivals.map(a => a.weekday))).sort();
    // Only state a minimum when EVERY arrival day in the month shares it.
    // Quoting the longest (e.g. September has a handful of 4-night days among
    // 2-night ones) would overstate the restriction and talk guests out of a
    // stay they could actually book.
    const nightsSet = Array.from(new Set(arrivals.map(a => a.minNights)));
    const uniformMinNights = nightsSet.length === 1 ? nightsSet[0] : null;
    // Worth calling out when arrivals are genuinely restricted, or the whole
    // month carries a minimum longer than a casual booker would assume.
    const restrictedArrivals = anyClosed && weekdays.length > 0 && weekdays.length <= 3;
    if (!restrictedArrivals && !(uniformMinNights && uniformMinNights >= 3)) return null;
    const minNights = uniformMinNights ?? 0;

    const fmtDay = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    // 2024-01-07 is a Sunday, so +weekday lands on the right day name.
    const dayNames = weekdays.map(w => fmtDay.format(new Date(Date.UTC(2024, 0, 7 + w))));
    return { restrictedArrivals, minNights, dayNames };
  }, [phase, dayMap, viewYear, viewMonth, todayMs, locale]);

  const calendarNode = (
    <div className="bg-white">
      {/* Selection phase — the pills pick which date the next click changes.
          On a phone the picker covers the date fields, so the pills carry the
          dates too. */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <button
          type="button"
          onClick={() => focusPhase("check-in")}
          aria-pressed={phase === "check-in"}
          className={`flex items-center gap-1.5 px-2.5 py-1 whitespace-nowrap rounded-full text-[11px] font-medium tracking-wide transition-all cursor-pointer ${
            phase === "check-in"
              ? "bg-black text-white"
              : "bg-black/[0.04] text-black/50 hover:bg-black/[0.08] hover:text-black/70"
          }`}
        >
          {t("bookingWidget.checkInLabel")}
          {isMobile && checkIn && <span className="font-normal opacity-80">· {fmtShort(checkIn)}</span>}
        </button>
        <svg className="w-3 h-3 text-black/20 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <button
          type="button"
          onClick={() => { if (checkIn) focusPhase("check-out"); }}
          disabled={!checkIn}
          aria-pressed={phase === "check-out"}
          className={`flex items-center gap-1.5 px-2.5 py-1 whitespace-nowrap rounded-full text-[11px] font-medium tracking-wide transition-all ${
            !checkIn ? "cursor-not-allowed" : "cursor-pointer"
          } ${
            phase === "check-out"
              ? "bg-black text-white"
              : "bg-black/[0.04] text-black/50" + (checkIn ? " hover:bg-black/[0.08] hover:text-black/70" : "")
          }`}
        >
          {t("bookingWidget.checkOutLabel")}
          {isMobile && checkOut && <span className="font-normal opacity-80">· {fmtShort(checkOut)}</span>}
        </button>
        {checkIn && (
          <button
            type="button"
            onClick={() => { onSelectRange({ checkIn: "", checkOut: "", done: false }); setPhase("check-in"); }}
            className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium text-black/60 bg-black/[0.04] hover:bg-black/[0.08] hover:text-black transition-all"
          >
            <X className="w-3 h-3" />
            {t("bookingWidget.clearDates")}
          </button>
        )}
      </div>

      {/* Notice slot — fixed height, always rendered, so a notice that appears
          after the first click (minimum stay for the chosen check-in) never
          pushes the grid under the pointer and the next click lands on another
          day (auditoria set/2026, F2). One notice at a time: the rule for the
          chosen check-in wins over the month's general rule. */}
      <div className="mx-4 mb-1 min-h-[46px] flex items-stretch">
        {phase === "check-out" && requiredMinNights > 1 ? (
          <div className="flex-1 flex items-start gap-2 px-3 py-2 bg-amber-50/80 border border-amber-200/60">
            <span className="text-amber-600 text-sm shrink-0 leading-none mt-0.5">!</span>
            <p className="text-[11px] text-amber-800 font-medium leading-snug">
              {t("booking.minStayNotice", { count: requiredMinNights })}
            </p>
          </div>
        ) : monthRule ? (
          <div className="flex-1 flex items-start gap-2 px-3 py-2 bg-[#F5F1EB] border border-[#E8E4DC]">
            <span className="text-[#806A48] text-sm shrink-0 leading-none mt-0.5">i</span>
            <p className="text-[11px] text-[#1A1A18] font-medium leading-snug">
              {monthRule.restrictedArrivals
                ? monthRule.minNights > 1
                  ? t("booking.arrivalDaysNotice", {
                      days: monthRule.dayNames.join(", "),
                      count: monthRule.minNights,
                      defaultValue: "Check-in on {{days}} only · minimum {{count}} nights",
                    })
                  : t("booking.arrivalDaysOnlyNotice", {
                      days: monthRule.dayNames.join(", "),
                      defaultValue: "Check-in on {{days}} only",
                    })
                : t("booking.minStayMonthNotice", {
                    count: monthRule.minNights,
                    defaultValue: "Minimum stay of {{count}} nights this month",
                  })}
            </p>
          </div>
        ) : null}
      </div>

      {/* Calendar grid */}
      <div className={`px-3 pb-3 pt-1 ${isMobile || singleMonth ? "" : "flex gap-6"}`}>
        {renderMonth(viewYear, viewMonth, true)}
        {!isMobile && !singleMonth && renderMonth(secondYear, secondMonth, false)}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-4 pb-4 pt-1 border-t border-black/[0.04]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-black" />
          <span className="text-[10px] text-black/40 tracking-wide">{t("bookingWidget.availableLabel")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-black/10 flex items-center justify-center">
            <span className="block w-1.5 h-px bg-black/25" />
          </span>
          <span className="text-[10px] text-black/40 tracking-wide">{t("bookingWidget.unavailableLabel")}</span>
        </div>
        {/* After changing only the check-in the calendar stays open on the
            check-out; this closes it keeping the stay as shown. */}
        {!isMobile && onClose && checkIn && checkOut && (
          <button
            type="button"
            onClick={onClose}
            className="pa-action ml-auto min-h-[36px] px-4 bg-black text-white text-[11px] font-medium tracking-widest uppercase hover:bg-black/85 transition-colors"
          >
            {t("bookingWidget.confirmDates")}
          </button>
        )}
      </div>
    </div>
  );

  if (!isMobile) return calendarNode;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="pa-action w-full bg-black text-white text-xs font-medium tracking-widest uppercase px-8 py-3.5 min-h-[48px]"
      >
        {t("booking.selectDates")}
      </button>
      <Dialog open={mobileOpen} onOpenChange={(open) => (open ? setMobileOpen(true) : closeMobile())}>
        <DialogContent showCloseButton={false} className="max-w-none w-screen h-screen top-0 left-0 translate-x-0 translate-y-0 rounded-none p-0 bg-white">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <DialogTitle className="text-[13px] font-medium tracking-wide text-black leading-normal">
                {t("booking.selectDates")}
              </DialogTitle>
              <button
                type="button"
                onClick={closeMobile}
                className="text-black/40 hover:text-black transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto pb-safe">
              {calendarNode}
            </div>
            {checkIn && checkOut && (
              <div className="px-5 pb-5 pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={closeMobile}
                  className="pa-action w-full bg-black text-white text-xs font-medium tracking-widest uppercase py-4"
                >
                  {t("bookingWidget.confirmDates")}
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
