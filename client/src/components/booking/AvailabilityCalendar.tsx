import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
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

function toDate(value: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export default function AvailabilityCalendar({
  days,
  checkIn,
  checkOut,
  onSelectRange,
}: AvailabilityCalendarProps) {
  const { t } = useTranslation("booking");
  const isMobile = useIsMobile();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unavailableMessage, setUnavailableMessage] = useState("");

  const disabledDates = useMemo(
    () =>
      days
        .filter((day) => day.status !== "available")
        .map((day) => new Date(day.date)),
    [days]
  );

  /* Status lookup — no prices needed */
  const statusMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const day of days) {
      map.set(day.date, day.status);
    }
    return map;
  }, [days]);

  const calendarNode = (
    <div className="bg-white p-3">
      <CalendarUI
        mode="range"
        numberOfMonths={isMobile ? 1 : 2}
        selected={{
          from: toDate(checkIn),
          to: toDate(checkOut),
        }}
        disabled={disabledDates}
        onSelect={(range) => {
          const from = range?.from ? range.from.toISOString().split("T")[0] : "";
          const to = range?.to ? range.to.toISOString().split("T")[0] : "";

          if (from && to) {
            const fromDate = new Date(from);
            const toDate = new Date(to);
            let isRangeValid = true;

            for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
              const dateStr = d.toISOString().split("T")[0];
              const dayInfo = days.find(day => day.date === dateStr);
              if (dayInfo && dayInfo.status !== "available") {
                isRangeValid = false;
                break;
              }
            }

            if (!isRangeValid) {
              setUnavailableMessage(t("unavailableDatesMessage", "Some dates in your selection are unavailable. Please choose another range."));
              setTimeout(() => setUnavailableMessage(""), 4000);
              return;
            }
          }

          setUnavailableMessage("");
          onSelectRange({ checkIn: from, checkOut: to });
          if (isMobile && from && to) setMobileOpen(false);
        }}
        components={{
          DayButton: ({ day, modifiers, ...props }: any) => {
            const dateKey = day.date.toISOString().split("T")[0];
            const status = statusMap.get(dateKey) || "available";
            const isBlocked = status !== "available";
            const isSelected = modifiers.selected;
            const isInRange = modifiers.range_middle;
            const isRangeStart = modifiers.range_start;
            const isRangeEnd = modifiers.range_end;
            const isToday = modifiers.today;
            const isOutside = modifiers.outside;

            if (isOutside) {
              return <button {...props} className="h-10 w-10" tabIndex={-1} />;
            }

            return (
              <button
                {...props}
                className={[
                  "relative flex h-10 w-10 items-center justify-center text-sm font-medium transition-all",
                  isBlocked
                    ? "text-black/15 cursor-not-allowed"
                    : isRangeStart || isRangeEnd
                      ? "bg-black text-white rounded-full z-10"
                      : isInRange
                        ? "bg-black/5 text-black"
                        : "text-black hover:bg-black/5 rounded-full",
                  isToday && !isSelected && !isBlocked ? "ring-1 ring-black/20 rounded-full" : "",
                ].join(" ")}
              >
                <span className={isBlocked ? "line-through decoration-black/25" : ""}>
                  {day.date.getDate()}
                </span>
              </button>
            );
          },
        }}
      />

      {/* Unavailable selection message */}
      {unavailableMessage && (
        <div className="mx-1 mt-2 p-2.5 bg-red-50 border border-red-200 rounded text-red-600 text-xs">
          {unavailableMessage}
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 pt-3 border-t border-black/5 px-1">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-black" />
          <span className="text-[11px] text-black/50">{t("calendarAvailable", "Available")}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-black/10 flex items-center justify-center text-[8px] text-black/30 line-through">—</span>
          <span className="text-[11px] text-black/50">{t("calendarUnavailable", "Unavailable")}</span>
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
        className="w-full bg-black text-white text-xs font-medium tracking-widest uppercase px-8 py-3.5 min-h-[48px] rounded-none"
      >
        {t("selectDates", "Select Dates")}
      </button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 left-0 translate-x-0 translate-y-0 rounded-none p-5 bg-white">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <p className="text-xs font-medium tracking-widest uppercase text-black/40">
                {t("calendar", "Select dates")}
              </p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-black hover:opacity-60 transition-opacity"
                aria-label={t("close", "Close")}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-auto">
              {calendarNode}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
