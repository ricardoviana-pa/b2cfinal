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

  const prices = useMemo(() => {
    const map = new Map<string, number>();
    for (const day of days) {
      if (day.price) map.set(day.date, day.price);
    }
    return map;
  }, [days]);

  const calendarNode = (
    <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-4">
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

          // Check if any date in the range is unavailable
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
              setUnavailableMessage(t("unavailableDatesMessage", "Some dates in your selection are unavailable. Please select another range."));
              setTimeout(() => setUnavailableMessage(""), 3000);
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
            const nightlyPrice = prices.get(dateKey);
            return (
              <button
                {...props}
                className={`flex h-full min-h-[56px] w-full flex-col items-center justify-center rounded-md border text-[11px] ${
                  modifiers.disabled
                    ? "border-transparent bg-[#F5F1EB] text-[#9E9A90]"
                    : modifiers.selected
                      ? "border-[#8B7355] bg-[#8B7355] text-[#FAFAF7]"
                      : "border-transparent bg-white text-[#1A1A18] hover:bg-[#F5F1EB]"
                }`}
              >
                <span>{day.date.getDate()}</span>
                {!modifiers.disabled && nightlyPrice ? (
                  <span className="text-[10px] opacity-70">{Math.round(nightlyPrice)}€</span>
                ) : null}
              </button>
            );
          },
        }}
      />
    </div>
  );

  if (!isMobile) return calendarNode;

  return (
    <>
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="w-full rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 min-h-[48px]"
      >
        {t("selectDates", "Select Dates")}
      </button>
      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent className="max-w-none w-screen h-screen top-0 left-0 translate-x-0 translate-y-0 rounded-none p-5 bg-[#FAFAF7]">
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-6">
              <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] flex-1">
                {t("calendar", "Calendar")}
              </p>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                aria-label={t("close", "Close")}
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {unavailableMessage && (
              <div className="mb-4 p-3 bg-red-100 border border-red-300 rounded-md text-red-700 text-[12px]">
                {unavailableMessage}
              </div>
            )}

            <div className="flex-1 overflow-auto">
              {calendarNode}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
