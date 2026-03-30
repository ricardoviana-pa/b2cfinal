import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Calendar, Shield, Loader2, Check, ShoppingBag, Minus, Plus } from "lucide-react";
import AvailabilityCalendar from "./AvailabilityCalendar";
import type { AvailabilityDay } from "./AvailabilityCalendar";
import CheckoutPaymentForm from "./CheckoutPaymentForm";
import PhoneInput from "./PhoneInput";
import productsData from "@/data/products.json";
import { isValidEmail, isValidPhone } from "@/lib/validation";
import { formatEur } from "@/lib/format";

interface BookingWidgetProps {
  guestyId: string;
  propertyName: string;
  pricePerNight: number;
  maxGuests: number;
  minNights?: number;
  cleaningFee?: number;
  currency?: string;
  destination?: string;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
}

interface RatePlanOption {
  ratePlanId: string;
  name: string;
  total: number;
  nightlyRate: number;
  cleaningFee: number;
  cancellationPolicy?: string[];
  priceOnRequest?: boolean;
  fallbackMessage?: string;
}

interface QuoteData {
  nightlyRate: number;
  totalNights: number;
  cleaningFee: number;
  total: number;
  nights: number;
  quoteId?: string;
  ratePlanId?: string;
  currency?: string;
  cancellationPolicy?: string[];
  ratePlanOptions?: RatePlanOption[];
  priceOnRequest?: boolean;
  fallbackMessage?: string;
}

type Step = "dates" | "quote" | "details" | "payment" | "success";
type SuccessMode = "confirmed";

function parseBookingError(msg: string): string {
  if (!msg) return i18n.t("errors.generic");
  if (/429|rate limit|Too Many Requests/i.test(msg))
    return i18n.t("errors.rateLimited");
  if (/minimum stay|min nights/i.test(msg))
    return i18n.t("errors.minStay");
  if (/advance notice/i.test(msg)) {
    // Try to extract the number of days from the error message
    const daysMatch = msg.match(/(\d+)\s*(?:day|days|hora|horas|hour|hours)/i);
    if (daysMatch) {
      return i18n.t("errors.advanceNoticeWithDays", { days: daysMatch[1] });
    }
    return i18n.t("errors.advanceNotice");
  }
  if (/only available by request|available by request/i.test(msg))
    return i18n.t("errors.requestOnly");
  if (/400|bad request/i.test(msg))
    return i18n.t("errors.datesNotAvailable");
  try {
    const parsed = JSON.parse(msg);
    if (Array.isArray(parsed) && parsed[0]) {
      const p = parsed[0];
      if (p.path?.includes?.("guestEmail")) return i18n.t("errors.invalidEmail");
      if (p.message) return p.message;
    }
  } catch { /* not JSON */ }
  if (msg.length > 150) return i18n.t("errors.messageTooLong");
  return msg;
}

/** Humanize raw Guesty rate-plan name */
function humanizeRatePlanName(raw: string): string {
  const lower = raw.toLowerCase();
  if ((lower.includes('non') && lower.includes('refund')) || (lower.includes('não') && lower.includes('reembols'))) return 'Non-Refundable';
  if (lower.includes('refund') || lower.includes('reembols')) return 'Flexible';
  if (lower.includes('standard')) return 'Standard';
  if (lower.includes('moderate')) return 'Moderate';
  return raw;
}

/** Humanize raw Guesty cancellation policy code */
function humanizeCancellationPolicy(raw: string): string {
  const policyMap: Record<string, string> = {
    'super_strict': 'Non-refundable',
    'strict': 'Strict cancellation',
    'moderate': 'Free cancellation (14+ days before)',
    'flexible': 'Free cancellation (24h before)',
    'firm': 'Firm cancellation policy',
  };
  return policyMap[raw.toLowerCase()] || raw;
}

/** Format date with zero-padded day and month name (e.g., "08 Apr") */
function formatDateDisplay(dateStr: string, locale: string = "en-US", includeYear: boolean = false): string {
  const date = new Date(dateStr + "T12:00:00");
  const day = String(date.getDate()).padStart(2, '0');
  const options: Intl.DateTimeFormatOptions = { month: 'short' };
  if (includeYear) options.year = 'numeric';
  const formatted = date.toLocaleDateString(locale, options);
  // formatted is like "Apr" or "Apr 2026", prepend the zero-padded day
  return `${day} ${formatted}`;
}

const UPSELL_ITEMS = (productsData as any[])
  .filter(p => p.type === "service" && p.isActive)
  .slice(0, 3);

export default function BookingWidget({
  guestyId,
  propertyName,
  pricePerNight,
  maxGuests,
  minNights = 1,
  cleaningFee: baseCleaningFee = 0,
  currency = "EUR",
  destination,
  initialCheckIn = "",
  initialCheckOut = "",
  initialGuests = 0,
}: BookingWidgetProps) {
  const { t } = useTranslation();
  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [guests, setGuests] = useState(initialGuests > 0 ? initialGuests : 2);
  const [step, setStep] = useState<Step>("dates");
  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedUpsells, setSelectedUpsells] = useState<Set<string>>(new Set());

  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [successMode, setSuccessMode] = useState<SuccessMode>("confirmed");
  const [beQuoteError, setBeQuoteError] = useState("");
  const quoteRequestRef = useRef(0);
  const lastQuoteKeyRef = useRef("");
  /** Avoids unstable `fetchQuote` when `quote` updates (prevents auto-quote useEffect loops). */
  const quoteRef = useRef<QuoteData | null>(null);

  const [calendarDays, setCalendarDays] = useState<AvailabilityDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split("T")[0];
  const minCheckOut = useMemo(() => {
    if (!checkIn) return today;
    const d = new Date(checkIn);
    d.setDate(d.getDate() + Math.max(minNights, 1));
    return d.toISOString().split("T")[0];
  }, [checkIn, minNights, today]);

  const nights = useMemo(() => {
    if (!checkIn || !checkOut) return 0;
    const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
    return diff > 0 ? Math.ceil(diff / 86400000) : 0;
  }, [checkIn, checkOut]);

  const utils = trpc.useUtils();
  const { data: isBECheckoutAvailable } = trpc.booking.isBECheckoutAvailable.useQuery();
  const { data: stripeConfig } = trpc.booking.getStripeConfig.useQuery();
  const canPayOnSite = isBECheckoutAvailable && !!stripeConfig?.publishableKey;
  const createBEQuote = trpc.booking.createBEQuote.useMutation();

  useEffect(() => {
    quoteRef.current = quote;
  }, [quote]);

  const effectiveQuote = useMemo(() => {
    if (!quote) return null;
    if (selectedRatePlanId && quote.ratePlanOptions?.length) {
      const opt = quote.ratePlanOptions.find(o => o.ratePlanId === selectedRatePlanId);
      if (opt) return {
        ...quote,
        nightlyRate: opt.nightlyRate,
        totalNights: opt.nightlyRate * quote.nights,
        cleaningFee: opt.cleaningFee,
        total: opt.total,
        ratePlanId: opt.ratePlanId,
        cancellationPolicy: opt.cancellationPolicy,
      };
    }
    return quote;
  }, [quote, selectedRatePlanId]);

  const fetchQuote = useCallback(async () => {
    if (!checkIn || !checkOut) return;
    if (nights < minNights) {
      setError(i18n.t("bookingWidget.minimumStay", { count: minNights }));
      setQuote(null);
      return;
    }
    const quoteKey = `${guestyId}|${checkIn}|${checkOut}|${guests}|${canPayOnSite ? 1 : 0}`;
    // Prevent re-fetching when we already have a result for these params
    if (lastQuoteKeyRef.current === quoteKey && quoteRef.current) {
      setStep("quote");
      return;
    }
    lastQuoteKeyRef.current = quoteKey;

    const requestId = ++quoteRequestRef.current;
    setLoading(true);
    setError("");
    setBeQuoteError("");
    try {
      // Always use Open API for pricing (reliable, same as PLP)
      const d = await Promise.race([
        utils.booking.getQuote.fetch({
          listingId: guestyId, checkIn, checkOut, guests,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(i18n.t("errors.quoteTimeout"))), 20000);
        }),
      ]);
      if (quoteRequestRef.current !== requestId) return;

      const effectiveNightly = d.pricing?.nightlyRate ?? 0;
      const effectiveTotal = d.pricing?.total ?? 0;
      const cleaning = d.pricing?.cleaningFee ?? 0;

      if (effectiveTotal <= 0 || effectiveNightly <= 0) {
        // Price not available — show request-only flow
        setQuote({
          nightlyRate: 0, totalNights: 0, cleaningFee: 0, total: 0,
          nights: d.nights,
          priceOnRequest: true,
          fallbackMessage: (d as any).fallbackMessage || t("bookingWidget.priceOnRequestTitle"),
        });
        setStep("quote");
        setLoading(false);
        return;
      }

      const quoteData: QuoteData = {
        nightlyRate: effectiveNightly,
        totalNights: d.pricing?.totalNights ?? effectiveNightly * d.nights,
        cleaningFee: cleaning,
        total: effectiveTotal,
        nights: d.nights,
      };

      setQuote(quoteData);

      // If BE checkout is available, fetch BE quote in background for payment data
      if (canPayOnSite) {
        createBEQuote.mutateAsync({
          listingId: guestyId, checkIn, checkOut, guests,
          guestEmail: "guest@example.com",
        }).then((be: any) => {
          if (quoteRequestRef.current !== requestId || !be?.quoteId) return;
          setQuote(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              quoteId: be.quoteId,
              ratePlanId: be.ratePlanId,
              currency: be.currency || prev.currency,
              cancellationPolicy: be.cancellationPolicy,
              ratePlanOptions: be.ratePlanOptions?.map((opt: any) => ({
                ...opt,
                total: opt.total > 0 ? opt.total : prev.total,
                nightlyRate: opt.nightlyRate > 0 ? opt.nightlyRate : prev.nightlyRate,
                cleaningFee: opt.cleaningFee > 0 ? opt.cleaningFee : prev.cleaningFee,
              })),
            };
          });
          if (be.ratePlanId) setSelectedRatePlanId(be.ratePlanId);
        }).catch((err) => {
          if (quoteRequestRef.current !== requestId) return;
          setBeQuoteError(parseBookingError(err?.message || i18n.t("errors.pricingUnavailable")));
        });
      }

      setStep("quote");
    } catch (err: any) {
      if (quoteRequestRef.current !== requestId) return;
      // Keep lastQuoteKeyRef set to prevent infinite retry loop for the same params
      setError(parseBookingError(err?.message || i18n.t("errors.pricingUnavailable")));
      setQuote(null);
    } finally {
      if (quoteRequestRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [checkIn, checkOut, guests, guestyId, minNights, canPayOnSite, utils, createBEQuote, nights]);

  const fetchQuoteRef = useRef(fetchQuote);
  fetchQuoteRef.current = fetchQuote;

  useEffect(() => {
    if (!checkIn || !checkOut || nights < minNights || step !== "dates") return;
    const timer = setTimeout(() => {
      fetchQuoteRef.current();
    }, 450);
    return () => clearTimeout(timer);
  }, [checkIn, checkOut, guests, nights, minNights, step]);

  // Fetch calendar availability on mount (and when guestyId changes)
  useEffect(() => {
    let cancelled = false;
    setCalendarLoading(true);
    const from = today;
    // Fetch 18 months of calendar data (reservations extend into 2027+)
    const toDate = new Date();
    toDate.setMonth(toDate.getMonth() + 18);
    const to = toDate.toISOString().split("T")[0];
    utils.booking.getCalendar.fetch({ listingId: guestyId, from, to })
      .then((res) => {
        if (!cancelled && res?.days) {
          setCalendarDays(res.days);
        }
      })
      .catch(() => { /* calendar fetch failed — fallback to basic inputs */ })
      .finally(() => { if (!cancelled) setCalendarLoading(false); });
    return () => { cancelled = true; };
  }, [guestyId, today, utils.booking.getCalendar]);

  // Scroll widget into view when advancing to a new step so content is visible
  useEffect(() => {
    if (step === "dates") return;
    widgetRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step]);


  const handlePaymentSuccess = useCallback((code: string) => {
    setConfirmation(code);
    setSuccessMode("confirmed");
    setStep("success");
  }, []);

  const resetDates = () => {
    setCheckIn("");
    setCheckOut("");
    setQuote(null);
    setError("");
    setBeQuoteError("");
    setStep("dates");
  };

  // Upsell total from selected items
  const upsellsTotal = useMemo(() => {
    let sum = 0;
    selectedUpsells.forEach(id => {
      const item = UPSELL_ITEMS.find((u: any) => u.id === id);
      if (item?.priceFrom) sum += item.priceFrom;
    });
    return sum;
  }, [selectedUpsells]);

  // Build upsell note for reservation payload
  const upsellNote = useMemo(() => {
    if (selectedUpsells.size === 0) return "";
    const lines = Array.from(selectedUpsells).map(id => {
      const item = UPSELL_ITEMS.find((u: any) => u.id === id);
      if (!item) return null;
      return `- ${item.name}${item.priceFrom ? ` (+${formatEur(item.priceFrom)})` : ""}`;
    }).filter(Boolean);
    return `\n\n--- Additional Services ---\n${lines.join("\n")}\nEstimated upsells total: ${formatEur(upsellsTotal)}`;
  }, [selectedUpsells, upsellsTotal]);

  const displayRate = effectiveQuote?.nightlyRate || pricePerNight || 0;

  // ── SUCCESS ──
  if (step === "success") {
    return (
      <div className="bg-white border border-[#E8E4DC] overflow-hidden">
        <div className="bg-[#1A1A18] px-6 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-[#8B7355] flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-white" />
          </div>
          <p className="text-white text-[18px]" style={{ fontFamily: "var(--font-display)" }}>
            {t("bookingWidget.confirmed")}
          </p>
        </div>
        <div className="p-6 space-y-4 text-center">
          <p className="text-[#1A1A18] font-medium text-lg">{confirmation}</p>
          <p className="text-[13px] text-[#6B6860] leading-relaxed">
            {t("bookingWidget.confirmedBody")}
          </p>
          <div className="bg-[#F5F1EB] p-4 text-left space-y-1">
            <p className="text-[12px] text-[#9E9A90]">{t("bookingWidget.propertyLabel")}</p>
            <p className="text-[14px] text-[#1A1A18] font-medium">{propertyName}</p>
            <div className="flex gap-4 mt-2">
              <div>
                <p className="text-[11px] text-[#9E9A90]">{t("bookingWidget.checkInLabel")}</p>
                <p className="text-[13px] text-[#1A1A18]">{formatDateDisplay(checkIn, "pt-PT", true)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#9E9A90]">{t("bookingWidget.checkOutLabel")}</p>
                <p className="text-[13px] text-[#1A1A18]">{formatDateDisplay(checkOut, "pt-PT", true)}</p>
              </div>
            </div>
          </div>
          <button onClick={resetDates} className="text-[#8B7355] text-[13px] hover:underline">
            {t("bookingWidget.makeAnother")}
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN WIDGET ──
  return (
    <div ref={widgetRef} className="bg-white border border-[#E8E4DC] overflow-hidden">
      {/* Price header */}
      <div className="px-6 pt-5 pb-4">
        {effectiveQuote && effectiveQuote.total > 0 ? (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] text-[#1A1A18]" style={{ fontFamily: "var(--font-display)" }}>
                {formatEur(effectiveQuote.total + upsellsTotal)}
              </span>
              <span className="text-[14px] text-[#9E9A90]">{t("property.totalLabel")}</span>
            </div>
            <p className="text-[13px] text-[#6B6860] mt-0.5">
              {t("bookingWidget.nightsLine", {
                count: effectiveQuote.nights,
                rate: formatEur(effectiveQuote.nightlyRate),
              })}
            </p>
          </>
        ) : loading && checkIn && checkOut ? (
          <div className="space-y-2 animate-pulse w-full">
            <div className="h-4 bg-[#F5F1EB] rounded-md w-3/4" />
            <div className="h-4 bg-[#F5F1EB] rounded-md w-1/2" />
            <div className="h-6 bg-[#F5F1EB] rounded-md w-full mt-2" />
          </div>
        ) : error && checkIn && checkOut ? (
          <div className="text-[13px] text-[#6B6860]">
            <p className="font-medium text-[#1A1A18] mb-1">{t("bookingWidget.priceOnRequestTitle")}</p>
            <p className="text-[12px]">{t("bookingWidget.priceOnRequestBody")}</p>
            <button
              type="button"
              onClick={fetchQuote}
              className="mt-2 text-[11px] font-medium text-[#8B7355] tracking-[0.12em] uppercase underline-offset-2 hover:underline"
            >
              {t("property.retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] text-[#1A1A18]" style={{ fontFamily: "var(--font-display)" }}>
                {displayRate > 0 ? formatEur(displayRate) : "---"}
              </span>
              <span className="text-[14px] text-[#9E9A90]">{t("property.perNight")}</span>
            </div>
            {minNights > 1 && (
              <p className="text-[11px] text-[#8B7355] mt-1 flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {t("bookingWidget.minNightMinimum", { count: minNights })}
              </p>
            )}
          </>
        )}
      </div>

      {/* Date selection — Airbnb-style with availability calendar */}
      <div className="mx-4">
        {/* Date display / toggle */}
        <div
          className="border border-[#1A1A18] rounded-lg overflow-hidden cursor-pointer"
          onClick={() => setShowCalendar(!showCalendar)}
        >
          <div className="grid grid-cols-2 divide-x divide-[#1A1A18]">
            <div className="p-3 hover:bg-[#F5F1EB] transition-colors">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#1A1A18] mb-0.5">{t("bookingWidget.checkInLabel")}</p>
              <p className="text-[14px] text-[#1A1A18]">
                {checkIn ? formatDateDisplay(checkIn, "pt-PT", false) : t("bookingWidget.selectDate", "Select")}
              </p>
            </div>
            <div className="p-3 hover:bg-[#F5F1EB] transition-colors">
              <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#1A1A18] mb-0.5">{t("bookingWidget.checkOutLabel")}</p>
              <p className="text-[14px] text-[#1A1A18]">
                {checkOut ? formatDateDisplay(checkOut, "pt-PT", false) : t("bookingWidget.selectDate", "Select")}
              </p>
            </div>
          </div>
        </div>

        {/* Availability Calendar dropdown */}
        {showCalendar && (
          <div className="mt-2">
            {calendarLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#8B7355]" />
                <span className="ml-2 text-[12px] text-[#9E9A90]">{t("bookingWidget.loadingCalendar", "Loading availability...")}</span>
              </div>
            ) : calendarDays.length > 0 ? (
              <AvailabilityCalendar
                days={calendarDays}
                checkIn={checkIn}
                checkOut={checkOut}
                onSelectRange={({ checkIn: ci, checkOut: co }) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                  setQuote(null);
                  setError("");
                  setBeQuoteError("");
                  setStep("dates");
                  if (ci && co) setShowCalendar(false);
                }}
              />
            ) : (
              /* Fallback: HTML5 date inputs when calendar data unavailable */
              <div className="border border-[#E8E4DC] rounded-lg p-3 space-y-3">
                <div>
                  <label className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#1A1A18] mb-0.5 block">{t("bookingWidget.checkInLabel")}</label>
                  <input type="date" value={checkIn} min={today}
                    onChange={(e) => { setCheckIn(e.target.value); setQuote(null); setError(""); setBeQuoteError(""); setStep("dates"); }}
                    className="w-full bg-transparent text-[14px] text-[#1A1A18] border border-[#E8E4DC] rounded-md px-3 py-2 focus:outline-none focus:border-[#8B7355]" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#1A1A18] mb-0.5 block">{t("bookingWidget.checkOutLabel")}</label>
                  <input type="date" value={checkOut} min={minCheckOut}
                    onChange={(e) => { setCheckOut(e.target.value); setQuote(null); setError(""); setBeQuoteError(""); setStep("dates"); }}
                    className="w-full bg-transparent text-[14px] text-[#1A1A18] border border-[#E8E4DC] rounded-md px-3 py-2 focus:outline-none focus:border-[#8B7355]" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Min nights info */}
        {minNights > 1 && (
          <p className="text-[11px] text-[#8B7355] mt-2 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {t("bookingWidget.minNightMinimum", { count: minNights })}
          </p>
        )}

        {/* Guests selector */}
        <div className="border border-[#1A1A18] rounded-lg mt-3 p-3">
          <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#1A1A18] mb-1.5">{t("booking.guestsLabel")}</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setGuests(g => Math.max(1, g - 1));
                if (quote) setStep("dates");
                setError("");
              }}
              disabled={guests <= 1}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
              aria-label={t("booking.decreaseGuests", "Decrease guests")}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="min-w-[3ch] text-center text-[14px] text-[#1A1A18] tabular-nums" aria-live="polite" aria-atomic="true">{guests}</span>
            <button
              type="button"
              onClick={() => {
                setGuests(g => Math.min(maxGuests > 0 ? maxGuests : 30, g + 1));
                if (quote) setStep("dates");
                setError("");
              }}
              disabled={guests >= (maxGuests > 0 ? maxGuests : 30)}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
              aria-label={t("booking.increaseGuests", "Increase guests")}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Action area */}
      <div className="px-4 pt-4 pb-5 space-y-3">
        {/* Advance notice warning — check-in too soon */}
        {checkIn && (() => {
          const daysUntilCheckIn = Math.ceil((new Date(checkIn).getTime() - Date.now()) / 86400000);
          if (daysUntilCheckIn >= 0 && daysUntilCheckIn <= 2) {
            return (
              <div className="flex items-start gap-2.5 p-3 bg-[#FFF8F0] border border-[#D97706]/30 rounded-lg">
                <span className="text-[#D97706] text-[16px] shrink-0 leading-none mt-0.5">!</span>
                <div>
                  <p className="text-[12px] text-[#92400E] font-medium leading-snug">
                    {daysUntilCheckIn === 0
                      ? t("bookingWidget.checkInToday", "Check-in is today")
                      : daysUntilCheckIn === 1
                        ? t("bookingWidget.checkInTomorrow", "Check-in is tomorrow")
                        : t("bookingWidget.checkInSoon", "Check-in is in 2 days")}
                  </p>
                  <p className="text-[11px] text-[#92400E]/70 mt-0.5 leading-snug">
                    {t("bookingWidget.advanceNoticeNote", "Some properties require advance notice. Instant confirmation may not be available.")}
                  </p>
                </div>
              </div>
            );
          }
          return null;
        })()}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-[#F5F1EB] border border-[#DC2626]/30 rounded-lg text-[13px]" role="alert">
            <span className="text-[#DC2626] mt-0.5 shrink-0 font-medium">!</span>
            <p className="text-[#DC2626] leading-snug">{error}</p>
          </div>
        )}

        {/* Step: DATES */}
        {step === "dates" && (
          <div className="space-y-2">
            <button
              onClick={fetchQuote}
              disabled={!checkIn || !checkOut || loading || nights < minNights}
              className={cn(
                "w-full min-h-[52px] rounded-full px-8 text-[12px] font-medium tracking-[0.12em] uppercase transition-colors",
                "bg-[#1A1A18] text-[#FAFAF7] hover:bg-[#2A2A28]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("bookingWidget.checkingPrices")}
                </span>
              ) : nights > 0 ? t("bookingWidget.checkPrice", { count: nights }) : t("property.checkAvailability")}
            </button>
          </div>
        )}

        {/* Step: PRICE ON REQUEST */}
        {step === "quote" && quote?.priceOnRequest && (
          <>
            <div className="bg-[#FAFAF7] rounded-lg border border-[#E8E4DC] p-5 mb-4">
              <p className="text-[18px] font-display font-light text-[#1A1A18] mb-2">
                {quote.fallbackMessage || t("bookingWidget.priceOnRequestTitle")}
              </p>
              <p className="text-[12px] text-[#9E9A90]">
                {t("bookingWidget.priceOnRequestBody")}
              </p>
              {pricePerNight > 0 && nights > 0 && (
                <div className="mt-4 pt-4 border-t border-[#E8E4DC]">
                  <p className="text-[14px] font-medium text-[#1A1A18] mb-1">
                    {t("bookingWidget.estimatedPrice", "Estimated from €{{amount}} for {{nights}} night{{plural}}", {
                      amount: formatEur(pricePerNight * nights),
                      nights,
                      plural: nights !== 1 ? 's' : ''
                    })}
                  </p>
                  <p className="text-[12px] text-[#9E9A90]">
                    {t("bookingWidget.estimatedNote", "Final price confirmed after review")}
                  </p>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-col">
              <p className="text-[11px] text-[#9E9A90] text-center leading-snug">
                {t("bookingWidget.contactConcierge", { defaultValue: "Please contact our concierge team for custom pricing and booking assistance" })}
              </p>
              <button
                onClick={() => setStep("dates")}
                className="w-full rounded-full border border-[#E8E4DC] text-[#1A1A18] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 hover:bg-[#F5F4F0] transition-colors"
              >
                {t("bookingWidget.changeDates")}
              </button>
            </div>
          </>
        )}

        {/* Step: QUOTE — price breakdown + booking */}
        {step === "quote" && effectiveQuote && !quote?.priceOnRequest && (
          <>
            {/* ── Price Breakdown Card (always expanded) ── */}
            <div className="bg-[#FAFAF7] rounded-lg border border-[#E8E4DC] overflow-hidden">
              <div className="p-5 space-y-3">
                {/* Line items */}
                <div className="space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] text-[#6B6860]">
                      {formatEur(effectiveQuote.nightlyRate)} x {effectiveQuote.nights} {t("bookingWidget.nightsLabel", "nights")}
                    </span>
                    <span className="text-[13px] text-[#1A1A18] tabular-nums">{formatEur(effectiveQuote.totalNights)}</span>
                  </div>
                  {effectiveQuote.cleaningFee > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-[#6B6860]">{t("property.cleaningFee")}</span>
                      <span className="text-[13px] text-[#1A1A18] tabular-nums">{formatEur(effectiveQuote.cleaningFee)}</span>
                    </div>
                  )}
                  {upsellsTotal > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-[13px] text-[#6B6860]">{t("bookingWidget.enhanceStay")}</span>
                      <span className="text-[13px] text-[#1A1A18] tabular-nums">{formatEur(upsellsTotal)}</span>
                    </div>
                  )}
                </div>

                {/* Divider + Total */}
                <div className="border-t border-[#E8E4DC] pt-3 flex justify-between items-baseline">
                  <span className="text-[15px] font-medium text-[#1A1A18]">{t("property.total")}</span>
                  <span className="text-[22px] font-medium text-[#1A1A18] tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                    {formatEur(effectiveQuote.total + upsellsTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Rate Plan Options ── */}
            {quote?.ratePlanOptions && quote.ratePlanOptions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#9E9A90]">{t("bookingWidget.ratePlan")}</p>
                {quote.ratePlanOptions.map(opt => (
                  <label
                    key={opt.ratePlanId}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      selectedRatePlanId === opt.ratePlanId
                        ? "border-[#8B7355] bg-[#FAFAF7] ring-1 ring-[#8B7355]"
                        : "border-[#E8E4DC] hover:border-[#8B7355]/50"
                    )}
                  >
                    <input
                      type="radio"
                      name="ratePlan"
                      checked={selectedRatePlanId === opt.ratePlanId}
                      onChange={() => setSelectedRatePlanId(opt.ratePlanId)}
                      className="accent-[#8B7355] w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#1A1A18] font-medium">{humanizeRatePlanName(opt.name)}</p>
                      {opt.cancellationPolicy?.[0] && (
                        <p className="text-[11px] text-[#9E9A90] mt-0.5 truncate">{humanizeCancellationPolicy(opt.cancellationPolicy[0])}</p>
                      )}
                    </div>
                    <span className="text-[14px] text-[#1A1A18] font-medium whitespace-nowrap tabular-nums">{formatEur(opt.total)}</span>
                  </label>
                ))}
              </div>
            )}

            {/* ── Upsell Add-ons ── */}
            {UPSELL_ITEMS.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-[#9E9A90] flex items-center gap-1">
                  <ShoppingBag className="w-3 h-3" /> {t("bookingWidget.enhanceStay")}
                </p>
                {UPSELL_ITEMS.map((item: any) => (
                  <label
                    key={item.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all",
                      selectedUpsells.has(item.id)
                        ? "border-[#8B7355] bg-[#FAFAF7]"
                        : "border-[#E8E4DC] hover:border-[#8B7355]/30"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUpsells.has(item.id)}
                      onChange={() => {
                        setSelectedUpsells(prev => {
                          const next = new Set(prev);
                          next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                          return next;
                        });
                      }}
                      className="accent-[#8B7355] w-4 h-4 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] text-[#1A1A18]">{item.name}</p>
                      <p className="text-[11px] text-[#9E9A90] truncate">{item.tagline}</p>
                    </div>
                    <span className="text-[12px] text-[#8B7355] font-medium whitespace-nowrap tabular-nums">
                      {item.priceFrom ? `+${formatEur(item.priceFrom)}` : t("bookingWidget.free")}
                    </span>
                  </label>
                ))}
                <p className="text-[11px] text-[#9E9A90] italic leading-relaxed">
                  {t("bookingWidget.servicesNote", "Services confirmed separately by our concierge after booking.")}
                </p>
              </div>
            )}

            {/* ── CTA Section ── */}
            {canPayOnSite && quote?.quoteId ? (
              /* Primary: Online payment available */
              <button
                onClick={() => { setError(""); setStep("payment"); }}
                className="w-full min-h-[52px] rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[12px] font-medium tracking-[0.12em] uppercase px-8 py-4 hover:bg-[#2A2A28] transition-colors shadow-sm"
              >
                {t("bookingWidget.reserveAndPay", "Reserve & Pay")} {formatEur(effectiveQuote.total + upsellsTotal)}
              </button>
            ) : canPayOnSite && !quote?.quoteId && !beQuoteError ? (
              /* Loading: BE quote still being fetched in background */
              <button
                disabled
                className="w-full min-h-[52px] rounded-full bg-[#1A1A18]/60 text-[#FAFAF7] text-[12px] font-medium tracking-[0.12em] uppercase px-8 py-4 cursor-wait"
              >
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("bookingWidget.preparingPayment", "Preparing secure payment...")}
                </span>
              </button>
            ) : (
              /* Fallback: Online payment unavailable — offer WhatsApp + email */
              <div className="space-y-3">
                <a
                  href={`https://wa.me/351927161771?text=${encodeURIComponent(
                    `Hi, I'd like to book ${propertyName} from ${checkIn} to ${checkOut} for ${guests} guests. Total: ${formatEur(effectiveQuote.total)}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[52px] rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[12px] font-medium tracking-[0.12em] uppercase px-8 py-4 hover:bg-[#2A2A28] transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {t("bookingWidget.requestToBook", "Request to Book")}
                </a>
                <p className="text-[11px] text-[#9E9A90] text-center leading-relaxed">
                  {t("bookingWidget.conciergeWillConfirm", "Our concierge will confirm availability and send you a secure payment link within 1 hour.")}
                </p>
              </div>
            )}

            <button onClick={resetDates} className="w-full text-[12px] text-[#9E9A90] hover:text-[#1A1A18] transition py-1">
              {t("bookingWidget.changeDates")}
            </button>
          </>
        )}


        {/* Step: DETAILS — guest info form */}
        {/* Step: PAYMENT */}
        {step === "payment" && quote?.quoteId && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-[#8B7355] flex items-center justify-center">
                <Shield className="w-3 h-3 text-white" />
              </div>
              <p className="text-[14px] text-[#1A1A18] font-medium">{t("bookingWidget.securePayment")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder={t("bookingWidget.firstNamePh")} value={guestFirstName}
                onChange={e => setGuestFirstName(e.target.value)}
                className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light"
              />
              <input type="text" placeholder={t("bookingWidget.lastNamePh")} value={guestLastName}
                onChange={e => setGuestLastName(e.target.value)}
                className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light"
              />
            </div>
            <input type="email" placeholder={t("bookingWidget.emailShortPh")} value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light"
            />
            <PhoneInput value={guestPhone} onChange={setGuestPhone} />
            <CheckoutPaymentForm
              listingId={guestyId}
              checkIn={checkIn}
              checkOut={checkOut}
              guests={guests}
              quoteId={quote.quoteId}
              ratePlanId={effectiveQuote?.ratePlanId ?? quote.ratePlanId ?? ""}
              total={effectiveQuote?.total ?? quote.total}
              currency={quote.currency || currency}
              propertyName={propertyName}
              destination={destination}
              guestName={`${guestFirstName} ${guestLastName}`}
              guestEmail={guestEmail}
              guestPhone={guestPhone}
              notes={(notes + upsellNote).trim() || undefined}
              onSuccess={handlePaymentSuccess}
              onCancel={() => setStep("quote")}
            />
          </div>
        )}

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <div className="flex items-center gap-1 text-[11px] text-[#9E9A90]">
            <Shield className="w-3 h-3" /> {t("bookingWidget.secureBooking")}
          </div>
        </div>

        {/* Cancellation policy */}
        <p className="text-[11px] text-[#9E9A90] text-center">
          <a href="/faq#cancellation" className="text-[#8B7355] hover:underline">{t("bookingWidget.cancellationPolicyLink")}</a>
          {(effectiveQuote?.cancellationPolicy?.length ?? 0) > 0 && (
            <span className="block mt-1 text-[#9E9A90]">{humanizeCancellationPolicy(effectiveQuote?.cancellationPolicy?.[0] || '')}</span>
          )}
        </p>
      </div>
    </div>
  );
}
