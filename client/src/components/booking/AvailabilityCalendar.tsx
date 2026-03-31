import { useMemo, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/useMobile";

export interface AvailabilityDay {
  date: string;
  status: string;
  minNights?: number;
  price?: number;
}

interface AvailabilityCalendarProps {
  days: AvailabilityDay[];
  checkIn: string;
  checkOut: string;
  onSelectRange: (next: { checkIn: string; checkOut: string }) => void;
}

type SelectionPhase = "check-in" | "check-out";

const WEEKDAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_PT = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** YYYY-MM-DD from Date */
function toIso(d: Date): string {
  return d.toISOString().split("T")[0];
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
  days,
  checkIn,
  checkOut,
  onSelectRange,
}: AvailabilityCalendarProps) {
  const { t, i18n } = useTranslation("booking");
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hoverDate, setHoverDate] = useState<string>("");

  const isPt = i18n.language?.startsWith("pt");
  const weekdays = isPt ? WEEKDAYS_PT : WEEKDAYS_EN;
  const months = isPt ? MONTHS_PT : MONTHS_EN;

  // Current view: start from the current month
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [viewYear, setViewYear] = useState(now.getFullYear());

  // Selection phase
  const phase: SelectionPhase = checkIn && !checkOut ? "check-out" : "check-in";

  // Status lookup
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of days) {
      map.set(day.date, day.status);
    }
    return map;
  }, [days]);

  const todayStr = toIso(now);
  const todayMs = startOfDay(todayStr);

  /** Check if a date string is blocked/unavailable */
  const isBlocked = useCallback((dateStr: string) => {
    const status = statusMap.get(dateStr);
    return status !== undefined && status !== "available";
  }, [statusMap]);

  /** Check if selecting a range would cross blocked dates */
  const rangeHasBlockedDates = useCallback((from: string, to: string) => {
    const fromMs = startOfDay(from);
    const toMs = startOfDay(to);
    const d = new Date(from + "T00:00:00Z");
    while (d.getTime() <= toMs) {
      const ds = toIso(d);
      if (startOfDay(ds) > fromMs && startOfDay(ds) < toMs && isBlocked(ds)) {
        return true;
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return false;
  }, [isBlocked]);

  /** Handle clicking a day */
  const handleDayClick = useCallback((dateStr: string) => {
    if (isBlocked(dateStr)) return;
    if (startOfDay(dateStr) < todayMs) return;

    if (phase === "check-in") {
      // First click: set check-in, clear check-out
      onSelectRange({ checkIn: dateStr, checkOut: "" });
    } else {
      // Second click: set check-out
      if (startOfDay(dateStr) <= startOfDay(checkIn)) {
        // Clicked before check-in — restart with new check-in
        onSelectRange({ checkIn: dateStr, checkOut: "" });
        return;
      }
      // Check if range crosses blocked dates
      if (rangeHasBlockedDates(checkIn, dateStr)) {
        // Reset — don't allow crossing blocked dates
        onSelectRange({ checkIn: dateStr, checkOut: "" });
        return;
      }
      onSelectRange({ checkIn, checkOut: dateStr });
    }
  }, [phase, checkIn, onSelectRange, isBlocked, todayMs, rangeHasBlockedDates]);

  const navigateMonth = useCallback((dir: -1 | 1) => {
    setViewMonth(prev => {
      const next = prev + dir;
      if (next < 0) { setViewYear(y => y - 1); return 11; }
      if (next > 11) { setViewYear(y => y + 1); return 0; }
      return next;
    });
  }, []);

  /** Render a single month */
  const renderMonth = (year: number, month: number, showNav: boolean) => {
    const grid = buildMonthGrid(year, month);
    const checkInMs = checkIn ? startOfDay(checkIn) : 0;
    const checkOutMs = checkOut ? startOfDay(checkOut) : 0;
    // For hover preview
    const hoverMs = hoverDate && phase === "check-out" && checkIn ? startOfDay(hoverDate) : 0;

    return (
      <div className="flex-1 min-w-0">
        {/* Month header */}
        <div className="flex items-center justify-between px-1 mb-4">
          {showNav ? (
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              className="w-8 h-8 flex items-center justify-center text-black/40 hover:text-black transition-colors"
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
            const isPast = dateMs < todayMs;
            const blocked = isBlocked(dateStr);
            const isDisabled = isPast || blocked;
            const isToday = dateStr === todayStr;
            const isCheckIn = checkIn && dateStr === checkIn;
            const isCheckOut = checkOut && dateStr === checkOut;
            const isEndpoint = isCheckIn || isCheckOut;

            // In range (between check-in and check-out)
            let inRange = false;
            if (checkInMs && checkOutMs && dateMs > checkInMs && dateMs < checkOutMs) {
              inRange = true;
            }

            // Hover preview range
            let inHoverRange = false;
            if (hoverMs && checkInMs && !checkOutMs && dateMs > checkInMs && dateMs <= hoverMs && hoverMs > checkInMs) {
              inHoverRange = true;
            }
            const isHoverEnd = hoverMs && dateMs === hoverMs && phase === "check-out" && !checkOut && hoverMs > checkInMs;

            // Range edge styling (left/right rounding)
            let rangeBg = "";
            if (inRange || inHoverRange) {
              rangeBg = inRange ? "bg-black/[0.04]" : "bg-black/[0.02]";
            }
            // Check-in has right range bg, check-out has left range bg
            if (isCheckIn && (checkOut || (hoverMs && hoverMs > checkInMs))) {
              rangeBg = "bg-gradient-to-l from-black/[0.04] via-transparent to-transparent";
            }
            if (isCheckOut) {
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
                  onMouseEnter={() => !isDisabled && setHoverDate(dateStr)}
                  onMouseLeave={() => setHoverDate("")}
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
                  <span className={blocked ? "line-through decoration-black/20 decoration-1" : ""}>
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

  const calendarNode = (
    <div className="bg-white">
      {/* Selection phase indicator */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide transition-all ${
          phase === "check-in"
            ? "bg-black text-white"
            : "bg-black/[0.04] text-black/40"
        }`}>
          {isPt ? "Entrada" : "Check-in"}
        </div>
        <svg className="w-3 h-3 text-black/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide transition-all ${
          phase === "check-out"
            ? "bg-black text-white"
            : "bg-black/[0.04] text-black/40"
        }`}>
          {isPt ? "Saída" : "Check-out"}
        </div>
        {checkIn && (
          <button
            type="button"
            onClick={() => onSelectRange({ checkIn: "", checkOut: "" })}
            className="ml-auto text-[11px] text-black/30 hover:text-black transition-colors"
          >
            {isPt ? "Limpar" : "Clear"}
          </button>
        )}
      </div>

      {/* Calendar grid */}
      <div className={`px-3 pb-3 pt-1 ${isMobile ? "" : "flex gap-6"}`}>
        {renderMonth(viewYear, viewMonth, true)}
        {!isMobile && renderMonth(secondYear, secondMonth, false)}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 px-4 pb-4 pt-1 border-t border-black/[0.04]">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-black" />
          <span className="text-[10px] text-black/40 tracking-wide">{isPt ? "Disponível" : "Available"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-black/10 flex items-center justify-center">
            <span className="block w-1.5 h-px bg-black/25" />
          </span>
          <span className="text-[10px] text-black/40 tracking-wide">{isPt ? "Indisponível" : "Unavailable"}</span>
        </div>
      </div>
    </div>
  );

  if (!isMobile) return calendarNode;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="w-full bg-black text-white text-xs font-medium tracking-widest uppercase px-8 py-3.5 min-h-[48px]"
      >
        {isPt ? "Selecionar datas" : "Select Dates"}
      </button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 left-0 translate-x-0 translate-y-0 rounded-none p-0 bg-white">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <p className="text-[13px] font-medium tracking-wide text-black">
                {isPt ? "Selecionar datas" : "Select dates"}
              </p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
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
                  onClick={() => setMobileOpen(false)}
                  className="w-full bg-black text-white text-xs font-medium tracking-widest uppercase py-4"
                >
                  {isPt ? "Confirmar" : "Confirm"}
                </button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
