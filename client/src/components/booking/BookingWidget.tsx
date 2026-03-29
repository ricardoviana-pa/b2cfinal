import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Calendar, Users, Shield, ChevronDown, ChevronUp, Loader2, Check, ShoppingBag, Minus, Plus } from "lucide-react";
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
type SuccessMode = "confirmed" | "request" | "payment-fallback";

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
  const [priceExpanded, setPriceExpanded] = useState(false);
  const [selectedUpsells, setSelectedUpsells] = useState<Set<string>>(new Set());

  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [successMode, setSuccessMode] = useState<SuccessMode>("request");
  const [beQuoteError, setBeQuoteError] = useState("");
  const quoteRequestRef = useRef(0);
  const lastQuoteKeyRef = useRef("");
  /** Avoids unstable `fetchQuote` when `quote` updates (prevents auto-quote useEffect loops). */
  const quoteRef = useRef<QuoteData | null>(null);

  const checkInRef = useRef<HTMLInputElement>(null);
  const checkOutRef = useRef<HTMLInputElement>(null);
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
  const createReservation = trpc.booking.createReservation.useMutation();

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

  // Scroll widget into view when advancing to a new step so content is visible
  useEffect(() => {
    if (step === "dates") return;
    widgetRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [step]);

  const handleSubmitBooking = useCallback(async () => {
    if (!guestFirstName || !guestLastName || !guestEmail || !guestPhone) {
      setError(t("bookingWidget.fillRequired"));
      return;
    }
    if (!isValidEmail(guestEmail)) {
      setError(t("errors.invalidEmail"));
      return;
    }
    if (!isValidPhone(guestPhone)) {
      setError(t("errors.invalidPhone"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await createReservation.mutateAsync({
        listingId: guestyId, checkIn, checkOut, guests,
        guestName: `${guestFirstName} ${guestLastName}`,
        guestEmail, guestPhone,
        notes: (notes + upsellNote).trim() || undefined,
      });
      setConfirmation(data.confirmationCode);
      setSuccessMode("request");
      setStep("success");
    } catch (err: any) {
      setError(parseBookingError(err?.message || i18n.t("errors.unableCompleteReservation")));
    } finally {
      setLoading(false);
    }
  }, [guestyId, checkIn, checkOut, guests, guestFirstName, guestLastName, guestEmail, guestPhone, notes, createReservation, t]);

  const handlePaymentSuccess = useCallback((code: string) => {
    setConfirmation(code);
    setSuccessMode("confirmed");
    setStep("success");
  }, []);

  const handleFallbackRequestSuccess = useCallback((code: string) => {
    setConfirmation(code);
    setSuccessMode("payment-fallback");
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

  // ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ SUCCESS ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
  if (step === "success") {
    return (
      <div className="bg-white border border-[#E8E4DC] overflow-hidden">
        <div className="bg-[#1A1A18] px-6 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-[#8B7355] flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-white" />
          </div>
          <p className="text-white text-[18px]" style={{ fontFamily: "var(--font-display)" }}>
            {successMode === "confirmed"
              ? t("bookingWidget.confirmed")
              : t("bookingWidget.requestSent")}
          </p>
        </div>
        <div className="p-6 space-y-4 text-center">
          <p className="text-[#1A1A18] font-medium text-lg">{confirmation}</p>
          {successMode === "payment-fallback" && (
            <div className="bg-[#F5F1EB] border border-[#E8E4DC] p-3 rounded-lg">
              <p className="text-[13px] text-[#1A1A18] font-medium">
                {/* TODO: i18n */}
                Payment was not processed
              </p>
              <p className="text-[12px] text-[#6B6860] mt-1 leading-relaxed">
                {/* TODO: i18n */}
                Our team will contact you to finalise the reservation and arrange payment.
              </p>
            </div>
          )}
          <p className="text-[13px] text-[#6B6860] leading-relaxed">
            {successMode === "confirmed"
              ? t("bookingWidget.confirmedBody")
              : t("bookingWidget.requestBody")}
          </p>
          <div className="bg-[#F5F1EB] p-4 text-left space-y-1">
            <p className="text-[12px] text-[#9E9A90]">{t("bookingWidget.propertyLabel")}</p>
            <p className="text-[14px] text-[#1A1A18] font-medium">{propertyName}</p>
            <div className="flex gap-4 mt-2">
              <div>
                <p className="text-[11px] text-[#9E9A90]">{t("bookingWidget.checkInLabel")}</p>
                <p className="text-[13px] text-[#1A1A18]">{new Date(checkIn).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <div>
                <p className="text-[11px] text-[#9E9A90]">{t("bookingWidget.checkOutLabel")}</p>
                <p className="text-[13px] text-[#1A1A18]">{new Date(checkOut).toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" })}</p>
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

  // ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ MAIN WIDGET ÃÂ¢ÃÂÃÂÃÂ¢ÃÂÃÂ
  return (
    <div ref={widgetRef} className="bg-white border border-[#E8E4DC] overflow-hidden">
      {/* Price header ÃÂ¢ÃÂÃÂ shows total when quote exists, per-night otherwise */}
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
          <>
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
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              <span className="text-[28px] text-[#1A1A18]" style={{ fontFamily: "var(--font-display)" }}>
                {displayRate > 0 ? formatEur(displayRate) : "ÃÂ¢ÃÂÃÂ"}
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

      {/* Date selection ÃÂ¢ÃÂÃÂ Airbnb style stacked inputs */}
      <div className="mx-4 border border-[#1A1A18] rounded-lg overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-[#1A1A18]">
          <div
            className="p-3 cursor-pointer hover:bg-[#F5F1EB] transition-colors"
            onClick={() => checkInRef.current?.showPicker?.()}
          >
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#1A1A18] mb-0.5">{t("bookingWidget.checkInLabel")}</p>
            <input
              ref={checkInRef}
              type="date"
              value={checkIn}
              min={today}
              onChange={(e) => {
                setCheckIn(e.target.value);
                setQuote(null);
                setError("");
                setBeQuoteError("");
                setStep("dates");
                setTimeout(() => checkOutRef.current?.showPicker?.(), 50);
              }}
              className="w-full bg-transparent text-[14px] text-[#1A1A18] focus:outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute"
            />
          </div>
          <div
            className="p-3 cursor-pointer hover:bg-[#F5F1EB] transition-colors"
            onClick={() => checkOutRef.current?.showPicker?.()}
          >
            <p className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#1A1A18] mb-0.5">{t("bookingWidget.checkOutLabel")}</p>
            <input
              ref={checkOutRef}
              type="date"
              value={checkOut}
              min={minCheckOut}
              onChange={(e) => {
                setCheckOut(e.target.value);
                setQuote(null);
                setError("");
                setBeQuoteError("");
                setStep("dates");
              }}
              className="w-full bg-transparent text-[14px] text-[#1A1A18] focus:outline-none cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:absolute"
            />
          </div>
        </div>
        <div className="border-t border-[#1A1A18] p-3">
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
        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-[#F5F1EB] border border-[#DC2626] rounded-md text-[13px]" role="alert">
            <span className="text-[#DC2626] mt-0.5 shrink-0">!</span>
            <p className="text-[#DC2626] leading-snug">{error}</p>
          </div>
        )}

        {/* Step: DATES ÃÂ¢ÃÂÃÂ show CTA to check price */}
        {step === "dates" && (
          <div className="space-y-2">
            <button
              onClick={fetchQuote}
              disabled={!checkIn || !checkOut || loading || nights < minNights}
              className={cn(
                "w-full min-h-[48px] rounded-full px-8 text-[11px] font-medium tracking-[0.12em] uppercase transition-colors",
                "bg-[#8B7355] text-[#FAFAF7] hover:bg-[#7A6548]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("bookingWidget.checkingPrices")}
                </span>
              ) : nights > 0 ? t("bookingWidget.checkPrice", { count: nights }) : t("property.checkAvailability")}
            </button>
            {error && checkIn && checkOut && (
              <div className="text-[13px] text-[#6B6860]">
                <p className="font-medium text-[#1A1A18] mb-1">{t("bookingWidget.priceOnRequestTitle")}</p>
                <p className="text-[12px]">{t("bookingWidget.priceOnRequestBody")}</p>
                <div className="flex flex-col gap-2 mt-2">
                  <button
                    type="button"
                    onClick={fetchQuote}
                    className="text-[11px] font-medium text-[#8B7355] tracking-[0.12em] uppercase underline-offset-2 hover:underline text-left"
                  >
                    {t("property.retry")}
                  </button>
                  <button
                    onClick={() => { setError(""); setStep("details"); }}
                    className="w-full rounded-full border border-[#E8E4DC] text-[#1A1A18] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 min-h-[48px] hover:bg-[#F5F1EB]"
                  >
                    {t("bookingWidget.sendRequestWithoutPrice")}
                  </button>
                </div>
              </div>
            )}
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
            </div>
            <button
              onClick={() => { setError(""); setStep("details"); }}
              className="w-full rounded-full bg-[#1A1A18] text-white text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 hover:bg-[#333] transition-colors"
            >
              {t("bookingWidget.sendRequestWithoutPrice")}
            </button>
            <button
              onClick={() => setStep("dates")}
              className="w-full rounded-full border border-[#E8E4DC] text-[#1A1A18] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 mt-2 hover:bg-[#F5F4F0] transition-colors"
            >
              {t("bookingWidget.changeDates")}
            </button>
          </>
        )}

        {/* Step: QUOTE ÃÂ¢ÃÂÃÂ show price breakdown + CTA to book */}
        {step === "quote" && effectiveQuote && !quote?.priceOnRequest && (
          <>
            {/* Price summary ÃÂ¢ÃÂÃÂ collapsible */}
            <div className="bg-[#FAFAF7] rounded-lg border border-[#E8E4DC] overflow-hidden">
              <button
                type="button"
                onClick={() => setPriceExpanded(!priceExpanded)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div>
                  <p className="text-[20px] text-[#1A1A18] font-medium" style={{ fontFamily: "var(--font-display)" }}>
                    {formatEur(effectiveQuote.total + upsellsTotal)}
                  </p>
                  <p className="text-[12px] text-[#9E9A90]">
                    {t("bookingWidget.nightsLine", {
                      count: effectiveQuote.nights,
                      rate: formatEur(effectiveQuote.nightlyRate),
                    })}
                  </p>
                </div>
                {priceExpanded ? <ChevronUp className="w-4 h-4 text-[#9E9A90]" /> : <ChevronDown className="w-4 h-4 text-[#9E9A90]" />}
              </button>
              {priceExpanded && (
                <div className="px-4 pb-4 space-y-2 border-t border-[#E8E4DC] pt-3">
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[#6B6860]">{t("bookingWidget.rentNightsLine", { rate: formatEur(effectiveQuote.nightlyRate), count: effectiveQuote.nights })}</span>
                    <span className="text-[#1A1A18]">{formatEur(effectiveQuote.totalNights)}</span>
                  </div>
                  <div className="flex justify-between text-[13px]">
                    <span className="text-[#6B6860]">{t("property.cleaningFee")}</span>
                    <span className="text-[#1A1A18]">
                      {effectiveQuote.cleaningFee > 0 ? formatEur(effectiveQuote.cleaningFee) : t("bookingWidget.included")}
                    </span>
                  </div>
                  {upsellsTotal > 0 && (
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#6B6860]">{t("bookingWidget.enhanceStay")}</span>
                      <span className="text-[#1A1A18]">{formatEur(upsellsTotal)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[14px] font-medium pt-2 border-t border-[#E8E4DC]">
                    <span className="text-[#1A1A18]">{t("property.total")}</span>
                    <span className="text-[#1A1A18]">{formatEur(effectiveQuote.total + upsellsTotal)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Rate plan options */}
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
                      <p className="text-[13px] text-[#1A1A18] font-medium">{opt.name}</p>
                      {opt.cancellationPolicy?.[0] && (
                        <p className="text-[11px] text-[#9E9A90] mt-0.5 truncate">{opt.cancellationPolicy[0]}</p>
                      )}
                    </div>
                    <span className="text-[14px] text-[#1A1A18] font-medium whitespace-nowrap">{formatEur(opt.total)}</span>
                  </label>
                ))}
              </div>
            )}

            {/* Upsells */}
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
                    <span className="text-[12px] text-[#8B7355] whitespace-nowrap">
                      {item.priceFrom ? `+ÃÂ¢ÃÂÃÂ¬${item.priceFrom}` : t("bookingWidget.free")}
                    </span>
                  </label>
                ))}
              </div>
            )}

            {/* Upsell note when paying online — services billed separately */}
            {upsellsTotal > 0 && canPayOnSite && (
              <p className="text-[11px] text-[#9E9A90] italic">
                {t("bookingWidget.upsellsArrangedSeparately", { defaultValue: "Selected services will be arranged separately by our concierge team." })}
              </p>
            )}

            {/* CTA */}
            {canPayOnSite && quote?.quoteId ? (
              <div className="space-y-2">
                <button
                  onClick={() => { setError(""); setStep("payment"); }}
                  className="w-full min-h-[48px] rounded-full bg-[#8B7355] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 hover:bg-[#7A6548] transition-colors"
                >
                  RESERVE & PAY {formatEur(effectiveQuote.total)}
                </button>
                <button
                  onClick={() => { setError(""); setStep("details"); }}
                  className="w-full text-[12px] text-[#8B7355] hover:text-[#1A1A18] transition py-1"
                >
                  Or request without payment
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {canPayOnSite && beQuoteError && (
                  <div className="flex items-start gap-2 p-3 bg-[#FFF8F0] border border-[#D97706]/30 rounded-md" role="alert">
                    <span className="text-[#D97706] shrink-0 mt-0.5 text-[13px]">ⓘ</span>
                    <div>
                      <p className="text-[12px] text-[#92400E] font-medium leading-snug">{t("bookingWidget.onlinePaymentUnavailable", { defaultValue: "Online payment not available" })}</p>
                      <p className="text-[11px] text-[#92400E]/80 mt-0.5 leading-snug">{beQuoteError}</p>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => { setError(""); setStep("details"); }}
                  className="w-full min-h-[48px] rounded-full bg-[#8B7355] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 hover:bg-[#7A6548] transition-colors"
                >
                  {t("bookingWidget.reserveNow")}
                </button>
                {canPayOnSite && beQuoteError && (
                  <p className="text-[11px] text-[#9E9A90] text-center leading-snug">
                    {t("bookingWidget.reserveRequestNote", { defaultValue: "Your request will be reviewed by our team." })}
                  </p>
                )}
              </div>
            )}

            <button onClick={resetDates} className="w-full text-[12px] text-[#9E9A90] hover:text-[#1A1A18] transition py-1">
              {t("bookingWidget.changeDates")}
            </button>
          </>
        )}

        {/* Step: DETAILS ÃÂ¢ÃÂÃÂ guest info form */}
        {step === "details" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-[#8B7355] flex items-center justify-center">
                <Users className="w-3 h-3 text-white" />
              </div>
              <p className="text-[14px] text-[#1A1A18] font-medium">{t("bookingWidget.guestDetailsTitle")}</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder={t("bookingWidget.firstNamePh")}
                value={guestFirstName}
                onChange={e => setGuestFirstName(e.target.value)}
                className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light"
              />
              <input
                type="text"
                placeholder={t("bookingWidget.lastNamePh")}
                value={guestLastName}
                onChange={e => setGuestLastName(e.target.value)}
                className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light"
              />
            </div>
            <input
              type="email"
              placeholder={t("bookingWidget.emailPh")}
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className="w-full h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light"
            />
            <PhoneInput value={guestPhone} onChange={setGuestPhone} />
            <textarea
              placeholder={t("bookingWidget.specialRequestsOptional")}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light resize-none"
            />

            {/* Compact price reminder */}
            {effectiveQuote && (
              <div className="flex items-center justify-between py-2 px-3 bg-[#F5F1EB] rounded-lg">
                <span className="text-[13px] text-[#6B6860]">{t("bookingWidget.nightsCountShort", { count: effectiveQuote.nights })}</span>
                <span className="text-[16px] text-[#1A1A18] font-medium" style={{ fontFamily: "var(--font-display)" }}>
                  {formatEur(effectiveQuote.total + upsellsTotal)}
                </span>
              </div>
            )}

            <button
              onClick={handleSubmitBooking}
              disabled={loading || !guestFirstName || !guestLastName || !guestEmail || !guestPhone}
              className={cn(
                "w-full min-h-[48px] rounded-full px-8 py-3.5 text-[11px] font-medium tracking-[0.12em] uppercase transition-colors",
                "bg-[#1A1A18] text-[#FAFAF7] hover:bg-[#333330]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("bookingWidget.processing")}
                </span>
              ) : t("booking.confirmBooking")}
            </button>

            <button
              onClick={() => { setError(""); setStep("quote"); }}
              className="w-full text-[12px] text-[#9E9A90] hover:text-[#1A1A18] transition py-1"
            >
              {t("bookingWidget.backToSummary")}
            </button>
          </div>
        )}

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
              guestName={`${guestFirstName} ${guestLastName}`}
              guestEmail={guestEmail}
              guestPhone={guestPhone}
              notes={(notes + upsellNote).trim() || undefined}
              onSuccess={handlePaymentSuccess}
              onRequestFallbackSuccess={handleFallbackRequestSuccess}
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
            <span className="block mt-1 text-[#9E9A90]">{effectiveQuote?.cancellationPolicy?.[0]}</span>
          )}
        </p>
      </div>
    </div>
  );
}
