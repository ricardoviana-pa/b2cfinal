import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { pushDL, pushEcommerce, ADDON_PREFIX } from "@/lib/datalayer";
import { Calendar, Shield, Loader2, Check, ShoppingBag, Minus, Plus, UtensilsCrossed, Sparkles, Dumbbell, ShoppingCart, Baby, Car, SprayCanIcon, ChevronDown } from "lucide-react";
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
  source?: "live" | "cached" | "base" | "request";
  /** Timestamp when the BE quote was created — valid for 24h */
  quoteCreatedAt?: number;
}

/** BE quotes expire after 24h; warn at 23h to give buffer */
const QUOTE_EXPIRY_MS = 23 * 60 * 60 * 1000;

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

/** Map Guesty policy code to cancellation-policy page anchor, or null if no dedicated section */
function policyPageAnchor(raw: string): string | null {
  const map: Record<string, string> = {
    super_strict: '#non-refundable',
    firm: '#firm',
  };
  return map[raw.toLowerCase()] ?? null;
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
  .sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));

/** Map slug to Lucide icon */
const SERVICE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "private-chef": UtensilsCrossed,
  "in-villa-spa": Sparkles,
  "private-yoga": Sparkles,
  "personal-training": Dumbbell,
  "grocery-delivery": ShoppingCart,
  "babysitter": Baby,
  "airport-shuttle": Car,
  "daily-housekeeping": SprayCanIcon,
};

function EnhanceYourStay({
  items, selectedUpsells, setSelectedUpsells, t,
}: {
  items: any[];
  selectedUpsells: Set<string>;
  setSelectedUpsells: React.Dispatch<React.SetStateAction<Set<string>>>;
  t: (key: string, fallback?: string | Record<string, unknown>) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, 4);

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-black/30 flex items-center gap-1.5">
        <ShoppingBag className="w-3 h-3" /> {t("bookingWidget.enhanceStay", "Enhance your stay")}
      </p>

      <div className="grid grid-cols-2 gap-2">
        {visible.map((item: any) => {
          const selected = selectedUpsells.has(item.id);
          const Icon = SERVICE_ICONS[item.slug] || ShoppingBag;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                const isAdding = !selectedUpsells.has(item.id);
                setSelectedUpsells(prev => {
                  const next = new Set(prev);
                  next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                  return next;
                });
                const prefix = ADDON_PREFIX[item.slug] || 'ADDON';
                pushEcommerce({
                  event: isAdding ? 'add_to_cart' : 'remove_from_cart',
                  ecommerce: {
                    currency: 'EUR',
                    value: item.priceFrom || 0,
                    items: [
                      {
                        item_id: `${prefix}-${item.id}`,
                        item_name: item.name,
                        item_category: 'addon',
                        item_category2: (item.slug as string).replace(/-/g, '_'),
                        price: item.priceFrom || 0,
                        quantity: 1,
                      },
                    ],
                  },
                });
              }}
              className={cn(
                "relative flex flex-col items-start p-3 rounded-lg border text-left transition-all group",
                selected
                  ? "border-black bg-white ring-1 ring-black/30"
                  : "border-black/10 hover:border-black/40"
              )}
            >
              {selected && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-black flex items-center justify-center">
                  <Check className="w-2.5 h-2.5 text-white" />
                </div>
              )}
              <Icon className={cn("w-4 h-4 mb-1.5", selected ? "text-black/50" : "text-black/30")} />
              <p className="text-[12px] text-black font-medium leading-tight">{item.name}</p>
              <p className="text-[10px] text-black/50 mt-1 tabular-nums">
                {t("bookingWidget.fromPrice", "from")} {formatEur(item.priceFrom)}
                <span className="text-black/30 font-normal"> / {item.priceSuffix}</span>
              </p>
            </button>
          );
        })}
      </div>

      {items.length > 4 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full flex items-center justify-center gap-1 text-[11px] text-black/50 font-medium tracking-[0.04em] py-1.5 hover:underline"
        >
          {t("bookingWidget.showAllServices", "Show all services")} ({items.length})
          <ChevronDown className="w-3 h-3" />
        </button>
      )}

      <p className="text-[10px] text-black/30 leading-relaxed">
        {t("bookingWidget.servicesNote", "Services confirmed separately by our concierge after booking. No charge now.")}
      </p>
    </div>
  );
}

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
  const [isRetryingForLivePrice, setIsRetryingForLivePrice] = useState(false);
  const [beQuoteRetryFailed, setBeQuoteRetryFailed] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const quoteRequestRef = useRef(0);
  const lastQuoteKeyRef = useRef("");
  /** Avoids unstable `fetchQuote` when `quote` updates (prevents auto-quote useEffect loops). */
  const quoteRef = useRef<QuoteData | null>(null);

  const [calendarDays, setCalendarDays] = useState<AvailabilityDay[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showCalendar, setShowCalendar] = useState(true);

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

  const isBelow = nights > 0 && nights < minNights;

  const utils = trpc.useUtils();
  const { data: isBECheckoutAvailable } = trpc.booking.isBECheckoutAvailable.useQuery();
  const { data: stripeConfig } = trpc.booking.getStripeConfig.useQuery();
  const canPayOnSite = isBECheckoutAvailable && !!stripeConfig?.publishableKey;
  const createBEQuote = trpc.booking.createBEQuote.useMutation();

  const handleRetryReserve = useCallback(async () => {
    setIsRetryingForLivePrice(true);
    setBeQuoteRetryFailed(false);
    setBeQuoteError("");
    try {
      const be = await createBEQuote.mutateAsync({
        listingId: guestyId, checkIn, checkOut, guests,
        guestEmail: "guest@example.com",
      });
      if (!be?.quoteId) throw new Error("No quote ID returned");
      setQuote(prev => prev ? {
        ...prev,
        quoteId: be.quoteId,
        quoteCreatedAt: Date.now(),
        ratePlanId: be.ratePlanId,
        source: "live" as const,
        priceOnRequest: false,
        fallbackMessage: undefined,
        currency: be.currency || prev.currency,
        cancellationPolicy: be.cancellationPolicy,
        ratePlanOptions: be.ratePlanOptions?.map((opt: any) => ({
          ...opt,
          total: opt.total > 0 ? opt.total : prev.total,
          nightlyRate: opt.nightlyRate > 0 ? opt.nightlyRate : prev.nightlyRate,
          cleaningFee: opt.cleaningFee > 0 ? opt.cleaningFee : prev.cleaningFee,
        })),
      } : null);
      if (be.ratePlanId) setSelectedRatePlanId(be.ratePlanId);
      setError("");
      setTermsAccepted(false);
      setStep("payment");
    } catch (err: any) {
      setBeQuoteRetryFailed(true);
      setBeQuoteError(parseBookingError(err?.message || "Live pricing unavailable. Please contact our concierge."));
    } finally {
      setIsRetryingForLivePrice(false);
    }
  // createBEQuote intentionally omitted — tRPC useMutation returns a new object reference
  // on every render; including it would invalidate this callback every render (defeating memoization).
  // The mutateAsync function itself is stable per tRPC's contract.
  }, [checkIn, checkOut, guests, guestyId]);

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
    if (nights > 0 && nights < minNights) {
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

      const isLivePrice = (d as any).source === "live";

      if (effectiveTotal <= 0 || effectiveNightly <= 0) {
        // No price at all — show request-only flow
        setQuote({
          nightlyRate: 0, totalNights: 0, cleaningFee: 0, total: 0,
          nights: d.nights,
          priceOnRequest: true,
          source: (d as any).source || "request",
          fallbackMessage: (d as any).fallbackMessage || t("bookingWidget.priceOnRequestTitle"),
        });
        setStep("quote");
        setLoading(false);
        return;
      }

      // quoteId is now returned directly from getQuote when source is "live" or "cached".
      // No background createBEQuote call needed — eliminates a redundant BE API round-trip.
      const beQuoteId: string | undefined = (d as any).quoteId;
      const quoteData: QuoteData = {
        nightlyRate: effectiveNightly,
        totalNights: d.pricing?.totalNights ?? effectiveNightly * d.nights,
        cleaningFee: cleaning,
        total: effectiveTotal,
        nights: d.nights,
        source: (d as any).source || "base",
        priceOnRequest: (d as any).source === "request",
        fallbackMessage: !isLivePrice ? ((d as any).fallbackMessage || "Price on request") : undefined,
        quoteId: beQuoteId,
        quoteCreatedAt: beQuoteId ? Date.now() : undefined,
        ratePlanId: (d as any).ratePlanId,
        ratePlanOptions: (d as any).ratePlanOptions,
      };

      setQuote(quoteData);
      if ((d as any).ratePlanId) setSelectedRatePlanId((d as any).ratePlanId);

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
  }, [checkIn, checkOut, guests, guestyId, minNights, canPayOnSite, utils, nights]);

  const fetchQuoteRef = useRef(fetchQuote);
  fetchQuoteRef.current = fetchQuote;

  useEffect(() => {
    if (!checkIn || !checkOut || (nights > 0 && nights < minNights) || step !== "dates") return;
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
    pushEcommerce({
      event: 'purchase',
      ecommerce: {
        transaction_id: code,
        value: effectiveQuote?.total ?? undefined,
        currency: effectiveQuote?.currency || currency,
        items: [
          {
            item_id: `PROP-${guestyId}`,
            item_name: propertyName,
            item_category: 'villa',
            price: effectiveQuote?.nightlyRate ?? undefined,
            quantity: nights || undefined,
            checkin_date: checkIn || undefined,
            checkout_date: checkOut || undefined,
            guests_adults: guests,
          },
        ],
      },
    });
  }, [effectiveQuote, currency, guestyId, propertyName, nights, checkIn, checkOut, guests]);

  const resetDates = () => {
    setCheckIn("");
    setCheckOut("");
    setQuote(null);
    setError("");
    setBeQuoteError("");
    setIsRetryingForLivePrice(false);
    setBeQuoteRetryFailed(false);
    setPhoneTouched(false);
    setStep("dates");
  };

  // Upsell total from selected items
  // Build upsell note for reservation payload (no pricing — varies per person/date)
  const upsellNote = useMemo(() => {
    if (selectedUpsells.size === 0) return "";
    const lines = Array.from(selectedUpsells).map(id => {
      const item = UPSELL_ITEMS.find((u: any) => u.id === id);
      if (!item) return null;
      return `- ${item.name} (from ${formatEur(item.priceFrom)}/${item.priceSuffix})`;
    }).filter(Boolean);
    return `\n\n⚠️ AÇÃO NECESSÁRIA — SERVIÇOS PEDIDOS PELO HÓSPEDE:\n${lines.join("\n")}\n\nContactar hóspede nas primeiras 2h após reserva para confirmar detalhes, datas e orçamento final de cada serviço.`;
  }, [selectedUpsells]);

  const displayRate = effectiveQuote?.nightlyRate || pricePerNight || 0;

  // ── SUCCESS ──
  if (step === "success") {
    const waConfirmLink = `https://wa.me/351927161771?text=${encodeURIComponent(
      [
        `Hi! I just confirmed my booking at ${propertyName}.`,
        `Confirmation: ${confirmation}`,
        `Dates: ${checkIn} → ${checkOut} (${guests} guests)`,
        guestyId ? `Ref: ${guestyId}` : "",
        `Looking forward to my stay!`,
      ].filter(Boolean).join("\n")
    )}`;
    const successQuote = effectiveQuote || quote;
    return (
      <div className="bg-white border border-black/10 overflow-hidden">
        <div className="bg-black px-6 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-white" />
          </div>
          <p className="text-white text-[18px]" style={{ fontFamily: "var(--font-display)" }}>
            {t("bookingWidget.confirmed")}
          </p>
          <p className="text-white/50 text-[13px] mt-1">{confirmation}</p>
        </div>
        <div className="p-6 space-y-4">
          {/* Email confirmation notice */}
          {guestEmail && (
            <div className="bg-green-50/60 border border-green-200/40 px-4 py-3 text-center">
              <p className="text-[12px] text-green-700">
                {t("bookingWidget.confirmationEmailSent", { defaultValue: "Confirmation email sent to" })} <span className="font-medium">{guestEmail}</span>
              </p>
            </div>
          )}

          {/* Property + dates */}
          <div className="bg-black/[0.02] p-4 space-y-3">
            <p className="text-[15px] text-black font-medium">{propertyName}</p>
            {destination && <p className="text-[12px] text-black/40">{destination}</p>}
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div>
                <p className="text-[10px] text-black/30 uppercase tracking-wider">{t("bookingWidget.checkInLabel")}</p>
                <p className="text-[13px] text-black mt-0.5">{formatDateDisplay(checkIn, "pt-PT", true)}</p>
              </div>
              <div>
                <p className="text-[10px] text-black/30 uppercase tracking-wider">{t("bookingWidget.checkOutLabel")}</p>
                <p className="text-[13px] text-black mt-0.5">{formatDateDisplay(checkOut, "pt-PT", true)}</p>
              </div>
              <div>
                <p className="text-[10px] text-black/30 uppercase tracking-wider">{t("booking.guestsLabel", "Guests")}</p>
                <p className="text-[13px] text-black mt-0.5">{guests}</p>
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          {successQuote && successQuote.total > 0 && (
            <div className="bg-black/[0.02] p-4 space-y-2">
              <p className="text-[10px] text-black/30 uppercase tracking-wider">{t("bookingWidget.priceSummary", { defaultValue: "Price summary" })}</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-black/50">{formatEur(successQuote.nightlyRate)} x {successQuote.nights} {t("bookingWidget.nightsLabel", "nights")}</span>
                  <span className="text-black tabular-nums">{formatEur(successQuote.totalNights)}</span>
                </div>
                {successQuote.cleaningFee > 0 && (
                  <div className="flex justify-between text-[13px]">
                    <span className="text-black/50">{t("property.cleaningFee")}</span>
                    <span className="text-black tabular-nums">{formatEur(successQuote.cleaningFee)}</span>
                  </div>
                )}
                <div className="border-t border-black/10 pt-2 flex justify-between">
                  <span className="text-[14px] text-black font-medium">{t("property.total")}</span>
                  <span className="text-[16px] text-black font-medium tabular-nums">{formatEur(successQuote.total)}</span>
                </div>
              </div>
              {/* Cancellation policy */}
              {successQuote.cancellationPolicy?.[0] && (
                <p className="text-[11px] text-black/30 pt-1">
                  {humanizeCancellationPolicy(successQuote.cancellationPolicy[0])}
                </p>
              )}
            </div>
          )}

          {/* Guest info */}
          <div className="bg-black/[0.02] p-4 space-y-1">
            <p className="text-[10px] text-black/30 uppercase tracking-wider">{t("bookingWidget.bookedBy", { defaultValue: "Booked by" })}</p>
            <p className="text-[13px] text-black">{guestFirstName} {guestLastName}</p>
            <p className="text-[12px] text-black/50">{guestEmail}{guestPhone ? ` · ${guestPhone}` : ""}</p>
          </div>

          {/* Upsells */}
          {selectedUpsells.size > 0 && (
            <div className="bg-black/[0.02] p-4 space-y-2">
              <p className="text-[10px] text-black/30 uppercase tracking-wider">{t("bookingWidget.servicesRequested", { defaultValue: "Services requested" })}</p>
              <div className="space-y-1">
                {Array.from(selectedUpsells).map(id => {
                  const item = UPSELL_ITEMS.find((u: any) => u.id === id);
                  return item ? (
                    <p key={id} className="text-[13px] text-black">{item.name}</p>
                  ) : null;
                })}
              </div>
              <p className="text-[11px] text-black/40 leading-relaxed">
                {t("bookingWidget.servicesConfirmNote", { defaultValue: "Our concierge will contact you within 2 hours to confirm details and pricing." })}
              </p>
            </div>
          )}

          {/* Concierge CTA */}
          <a
            href={waConfirmLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 min-h-[48px] bg-black text-white text-[12px] font-medium tracking-[0.12em] uppercase px-6 py-3.5 hover:bg-black/85 transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.725-1.217A11.947 11.947 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.318-.722-6.004-1.948l-.42-.312-2.833.73.756-2.753-.343-.453A9.963 9.963 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
            {t("bookingWidget.chatConcierge", { defaultValue: "Chat with your concierge" })}
          </a>

          <p className="text-[11px] text-black/30 text-center leading-relaxed">
            {t("bookingWidget.conciergeReachOut", { defaultValue: "Your dedicated concierge will reach out within 24 hours to help plan your stay." })}
          </p>
        </div>
      </div>
    );
  }

  // ── MAIN WIDGET ──
  return (
    <div ref={widgetRef} className="bg-white border border-black/10 overflow-hidden shadow-sm">
      {/* Price header */}
      <div className="px-6 pt-6 pb-4">
        {effectiveQuote && effectiveQuote.total > 0 ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-light tracking-tight text-black tabular-nums">
                {quote?.source && quote.source !== "live" ? "~" : ""}{formatEur(effectiveQuote.total)}
              </span>
              <span className="text-sm text-black/40 font-normal">{t("property.totalLabel")}</span>
            </div>
            <p className="text-sm text-black/50 mt-1 tracking-wide">
              {quote?.source && quote.source !== "live"
                ? t("bookingWidget.estimatedNightsLine", "~{{rate}} / night · {{count}} nights", {
                    count: effectiveQuote.nights,
                    rate: formatEur(effectiveQuote.nightlyRate),
                  })
                : t("bookingWidget.nightsLine", {
                    count: effectiveQuote.nights,
                    rate: formatEur(effectiveQuote.nightlyRate),
                  })}
            </p>
          </>
        ) : loading && checkIn && checkOut ? (
          <div className="space-y-2 animate-pulse w-full">
            <div className="h-5 bg-black/5 rounded w-3/4" />
            <div className="h-4 bg-black/5 rounded w-1/2" />
          </div>
        ) : error && checkIn && checkOut ? (
          <div className="text-sm text-black/60">
            <p className="font-medium text-black mb-1">{t("bookingWidget.priceOnRequestTitle")}</p>
            <p className="text-xs">{t("bookingWidget.priceOnRequestBody")}</p>
            <button
              type="button"
              onClick={fetchQuote}
              className="mt-2 text-xs font-medium text-black/60 tracking-widest uppercase hover:text-black transition-colors"
            >
              {t("property.retry")}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-1">
              {quote?.priceOnRequest && quote.source !== "live" ? (
                <>
                  <span className="text-[22px] text-[#1A1A18]" style={{ fontFamily: "var(--font-display)" }}>
                    {t("bookingWidget.priceOnRequestLabel", "Price on request")}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-[28px] text-[#1A1A18]" style={{ fontFamily: "var(--font-display)" }}>
                    {displayRate > 0 ? formatEur(displayRate) : "---"}
                  </span>
                  <span className="text-[14px] text-[#9E9A90]">{t("property.perNight")}</span>
                </>
              )}
            </div>
            {minNights > 1 && (
              <p className="text-xs text-black/40 mt-1.5 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" />
                {t("bookingWidget.minNightMinimum", { count: minNights })}
              </p>
            )}
          </>
        )}
      </div>

      {/* Date selection */}
      <div className="mx-5">
        {/* Date display / toggle — clicking either box opens calendar */}
        <div
          className={`border overflow-hidden cursor-pointer transition-colors ${
            showCalendar ? "border-black" : "border-black/15 hover:border-black/30"
          }`}
          onClick={() => setShowCalendar(true)}
        >
          <div className="grid grid-cols-2 divide-x divide-black/10">
            <div className={`px-4 py-3.5 transition-colors ${
              showCalendar && checkIn && !checkOut ? "bg-black/[0.03]" : "hover:bg-black/[0.02]"
            }`}>
              <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-1">{t("bookingWidget.checkInLabel")}</p>
              <p className={`text-[15px] font-normal ${checkIn ? "text-black" : "text-black/30"}`}>
                {checkIn ? formatDateDisplay(checkIn, "pt-PT", false) : t("bookingWidget.selectDate", "Select")}
              </p>
            </div>
            <div className={`px-4 py-3.5 transition-colors ${
              showCalendar && checkIn && !checkOut ? "hover:bg-black/[0.02]" : showCalendar && !checkIn ? "hover:bg-black/[0.02]" : "hover:bg-black/[0.02]"
            }`}>
              <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-1">{t("bookingWidget.checkOutLabel")}</p>
              <p className={`text-[15px] font-normal ${checkOut ? "text-black" : "text-black/30"}`}>
                {checkOut ? formatDateDisplay(checkOut, "pt-PT", false) : t("bookingWidget.selectDate", "Select")}
              </p>
            </div>
          </div>
        </div>

        {/* Availability Calendar — always custom, never native date inputs */}
        {showCalendar && (
          <div className="border border-black/10 border-t-0 overflow-hidden">
            {calendarLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-4 h-4 animate-spin text-black/30" />
                <span className="ml-2 text-xs text-black/40">{t("bookingWidget.loadingCalendar", "Loading availability...")}</span>
              </div>
            ) : (
              <AvailabilityCalendar
                days={calendarDays}
                checkIn={checkIn}
                checkOut={checkOut}
                onSelectRange={({ checkIn: ci, checkOut: co }) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                  setQuote(null);
                  setIsRetryingForLivePrice(false);
                  setBeQuoteRetryFailed(false);
                  setError("");
                  setBeQuoteError("");
                  setStep("dates");
                  if (ci && co) setShowCalendar(false);
                }}
              />
            )}
          </div>
        )}

        {/* Min nights info */}
        {minNights > 1 && (
          <p className="text-[11px] text-black/50 mt-2 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            {t("bookingWidget.minNightMinimum", { count: minNights })}
          </p>
        )}

        {isBelow && (
          <div className="flex items-start gap-2.5 p-3 mt-2 bg-amber-50/80 border border-amber-200/60">
            <span className="text-amber-600 text-sm shrink-0 leading-none mt-0.5">!</span>
            <p className="text-xs text-amber-800 font-medium leading-snug">
              {t("bookingWidget.belowMinNightsWarning", { count: minNights })}
            </p>
          </div>
        )}

        {/* Guests selector */}
        <div className="border border-black/15 mt-3 px-4 py-3">
          <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-2">{t("booking.guestsLabel")}</p>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => {
                setGuests(g => Math.max(1, g - 1));
                if (quote) setStep("dates");
                setError("");
              }}
              disabled={guests <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-black/40 transition-colors hover:border-black hover:text-black disabled:opacity-20"
              aria-label={t("booking.decreaseGuests", "Decrease guests")}
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="min-w-[3ch] text-center text-[15px] text-black tabular-nums font-normal" aria-live="polite" aria-atomic="true">{guests}</span>
            <button
              type="button"
              onClick={() => {
                setGuests(g => Math.min(maxGuests > 0 ? maxGuests : 30, g + 1));
                if (quote) setStep("dates");
                setError("");
              }}
              disabled={guests >= (maxGuests > 0 ? maxGuests : 30)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-black/40 transition-colors hover:border-black hover:text-black disabled:opacity-20"
              aria-label={t("booking.increaseGuests", "Increase guests")}
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Action area */}
      <div className="px-5 pt-5 pb-6 space-y-3">
        {/* Advance notice warning — check-in too soon */}
        {checkIn && (() => {
          const daysUntilCheckIn = Math.ceil((new Date(checkIn).getTime() - Date.now()) / 86400000);
          if (daysUntilCheckIn >= 0 && daysUntilCheckIn <= 2) {
            return (
              <div className="flex items-start gap-2.5 p-3 bg-amber-50/80 border border-amber-200/60">
                <span className="text-amber-600 text-sm shrink-0 leading-none mt-0.5">!</span>
                <div>
                  <p className="text-xs text-amber-800 font-medium leading-snug">
                    {daysUntilCheckIn === 0
                      ? t("bookingWidget.checkInToday", "Check-in is today")
                      : daysUntilCheckIn === 1
                        ? t("bookingWidget.checkInTomorrow", "Check-in is tomorrow")
                        : t("bookingWidget.checkInSoon", "Check-in is in 2 days")}
                  </p>
                  <p className="text-[11px] text-amber-700/60 mt-0.5 leading-snug">
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
          <div className="flex items-start gap-2 p-3 bg-red-50/70 border border-red-200/50 text-sm" role="alert">
            <span className="text-red-500 mt-0.5 shrink-0 font-medium text-xs">!</span>
            <p className="text-red-600 leading-snug text-xs">{error}</p>
          </div>
        )}

        {/* Step: DATES */}
        {step === "dates" && (
          <div className="space-y-2">
            <button
              onClick={fetchQuote}
              disabled={!checkIn || !checkOut || loading || isBelow}
              className={cn(
                "w-full min-h-[52px] px-8 text-xs font-medium tracking-[0.15em] uppercase transition-all",
                "bg-black text-white hover:bg-black/85",
                "disabled:opacity-30 disabled:cursor-not-allowed",
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

        {/* Step: PRICE ON REQUEST — live price unavailable */}
        {step === "quote" && quote?.priceOnRequest && (
          <>
            {/* Price on Request card */}
            <div className="bg-[#FAFAF7] rounded-lg border border-[#E8E4DC] overflow-hidden mb-4">
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-[#8B7355]/10 flex items-center justify-center">
                    <span className="text-[10px] text-[#8B7355]">i</span>
                  </div>
                  <p className="text-[14px] font-medium text-[#1A1A18]">
                    {t("bookingWidget.priceOnRequestLabel", "Price on request")}
                  </p>
                </div>
                <p className="text-[12px] text-[#9E9A90] leading-relaxed">
                  {t("bookingWidget.priceOnRequestExplain", "Our team will confirm the exact price and availability for your dates and send you a secure payment link.")}
                </p>
                {/* Show estimate if we have base rate data */}
                {quote.total > 0 && (
                  <div className="mt-4 pt-4 border-t border-[#E8E4DC]">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[12px] text-[#9E9A90] uppercase tracking-[0.06em]">
                        {t("bookingWidget.estimateLabel", "Estimate")}
                      </span>
                      <span className="text-[12px] text-[#8B7355] font-medium">
                        {t("bookingWidget.subjectToConfirmation", "Subject to confirmation")}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[13px] text-[#6B6860]">
                        {formatEur(quote.nightlyRate)} x {quote.nights} {t("bookingWidget.nightsLabel", "nights")}
                        {quote.cleaningFee > 0 && ` + ${formatEur(quote.cleaningFee)}`}
                      </span>
                      <span className="text-[18px] text-[#9E9A90] line-through tabular-nums" style={{ fontFamily: "var(--font-display)" }}>
                        ~{formatEur(quote.total)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Upsells still available for price-on-request */}
            {UPSELL_ITEMS.length > 0 && (
              <EnhanceYourStay
                items={UPSELL_ITEMS}
                selectedUpsells={selectedUpsells}
                setSelectedUpsells={setSelectedUpsells}
                t={t as any}
              />
            )}

            {/* WhatsApp CTA */}
            <a
              href={`https://wa.me/351927161771?text=${encodeURIComponent(
                `Hi Portugal Active! I'd like to request pricing for:\n\n` +
                `🏠 ${propertyName}\n` +
                `📅 ${checkIn} → ${checkOut} (${nights} nights)\n` +
                `👥 ${guests} guests\n` +
                (quote.total > 0 ? `💰 Estimated ~${formatEur(quote.total)}\n` : '') +
                (selectedUpsells.size > 0 ? `\n✨ Interested in: ${UPSELL_ITEMS.filter(u => selectedUpsells.has(u.id)).map(u => u.name).join(', ')}\n` : '') +
                `\nPlease confirm availability and final pricing.`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full min-h-[52px] rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[12px] font-medium tracking-[0.12em] uppercase px-8 py-4 hover:bg-[#2A2A28] transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {t("bookingWidget.requestPricing", "Request Pricing")}
            </a>
            <p className="text-[11px] text-[#9E9A90] text-center leading-relaxed">
              {t("bookingWidget.conciergeWillConfirm", "Our concierge will confirm availability and send you a secure payment link within 1 hour.")}
            </p>
            <button onClick={resetDates} className="w-full text-[12px] text-[#9E9A90] hover:text-[#1A1A18] transition py-1">
              {t("bookingWidget.changeDates")}
            </button>
          </>
        )}

        {/* Step: QUOTE — price breakdown + booking */}
        {step === "quote" && effectiveQuote && !quote?.priceOnRequest && (
          <>
            {/* ── Estimate notice when price is not live ── */}
            {quote?.source && quote.source !== "live" && (
              <div className="bg-amber-50/60 border border-amber-200/40 px-4 py-2.5 mb-1">
                <p className="text-xs text-amber-700/80">
                  {t("bookingWidget.estimatedNotice", "Estimated price — final price confirmed upon booking")}
                </p>
              </div>
            )}

            {/* ── Price Breakdown Card ── */}
            <div className="bg-black/[0.02] border border-black/10 overflow-hidden">
              <div className="p-5 space-y-3">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-black/50">
                      {formatEur(effectiveQuote.nightlyRate)} x {effectiveQuote.nights} {t("bookingWidget.nightsLabel", "nights")}
                    </span>
                    <span className="text-sm text-black tabular-nums">{formatEur(effectiveQuote.totalNights)}</span>
                  </div>
                  {effectiveQuote.cleaningFee > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-black/50">{t("property.cleaningFee")}</span>
                      <span className="text-sm text-black tabular-nums">{formatEur(effectiveQuote.cleaningFee)}</span>
                    </div>
                  )}
                </div>

                <div className="border-t border-black/10 pt-3 flex justify-between items-baseline">
                  <span className="text-[15px] font-medium text-black">{t("property.total")}</span>
                  <span className="text-[24px] font-light text-black tabular-nums tracking-tight">
                    {quote?.source && quote.source !== "live" ? "~" : ""}{formatEur(effectiveQuote.total)}
                  </span>
                </div>
                {selectedUpsells.size > 0 && (
                  <p className="text-[11px] text-black/35 pt-1">
                    + {selectedUpsells.size} {selectedUpsells.size === 1 ? 'service' : 'services'} requested — confirmed after booking
                  </p>
                )}
              </div>
            </div>

            {/* ── Rate Plan Options ── */}
            {quote?.ratePlanOptions && quote.ratePlanOptions.length > 1 && (() => {
              const maxTotal = Math.max(...quote.ratePlanOptions!.map(o => o.total));
              return (
                <div className="space-y-2">
                  <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-black/30">{t("bookingWidget.ratePlan")}</p>
                  {quote.ratePlanOptions!.map(opt => {
                    const isSelected = selectedRatePlanId === opt.ratePlanId;
                    const savings = maxTotal - opt.total;
                    const isNonRefundable = opt.name.toLowerCase().includes("non") && opt.name.toLowerCase().includes("refund");
                    const isFlexible = opt.name.toLowerCase().includes("flex") || opt.name.toLowerCase().includes("free");
                    const policyAnchor = opt.cancellationPolicy?.[0] ? policyPageAnchor(opt.cancellationPolicy[0]) : null;
                    return (
                      <label
                        key={opt.ratePlanId}
                        className={cn(
                          "flex items-center gap-3 p-3.5 border cursor-pointer transition-all",
                          isSelected
                            ? "border-black bg-white ring-1 ring-black"
                            : "border-black/10 hover:border-black/30"
                        )}
                      >
                        <input
                          type="radio"
                          name="ratePlan"
                          checked={isSelected}
                          onChange={() => setSelectedRatePlanId(opt.ratePlanId)}
                          className="accent-black w-4 h-4 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isNonRefundable && policyAnchor ? (
                              <a
                                href={`/legal/cancellation-policy${policyAnchor}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                aria-label={`${humanizeRatePlanName(opt.name)} – opens cancellation policy in a new tab`}
                                className="text-[13px] text-black font-medium underline underline-offset-2 hover:text-black/70 transition-colors"
                              >
                                {humanizeRatePlanName(opt.name)}
                              </a>
                            ) : (
                              <p className="text-[13px] text-black font-medium">{humanizeRatePlanName(opt.name)}</p>
                            )}
                            {isFlexible && (
                              <span className="text-[9px] font-semibold tracking-wider uppercase px-1.5 py-0.5 bg-green-50 text-green-700 border border-green-200/50">{t("bookingWidget.recommended", { defaultValue: "Recommended" })}</span>
                            )}
                          </div>
                          {opt.cancellationPolicy?.[0] && (
                            policyAnchor ? (
                              <a
                                href={`/legal/cancellation-policy${policyAnchor}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                aria-label={`${humanizeCancellationPolicy(opt.cancellationPolicy[0])} – opens cancellation policy in a new tab`}
                                className="text-[11px] text-black/40 mt-0.5 underline underline-offset-2 hover:text-black/70 transition-colors block"
                              >
                                {humanizeCancellationPolicy(opt.cancellationPolicy[0])}
                              </a>
                            ) : (
                              <p className="text-[11px] text-black/40 mt-0.5">{humanizeCancellationPolicy(opt.cancellationPolicy[0])}</p>
                            )
                          )}
                          {isNonRefundable && (
                            <p className="text-[10px] text-red-500/70 mt-0.5">{t("bookingWidget.nonRefundableWarning", { defaultValue: "No refund if you cancel or modify" })}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[14px] text-black font-medium whitespace-nowrap tabular-nums">{formatEur(opt.total)}</span>
                          {savings > 0 && (
                            <p className="text-[10px] text-green-600 font-medium mt-0.5">
                              {t("bookingWidget.save", { defaultValue: "Save" })} {formatEur(savings)}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Enhance Your Stay — Full Service Grid ── */}
            {UPSELL_ITEMS.length > 0 && (
              <EnhanceYourStay
                items={UPSELL_ITEMS}
                selectedUpsells={selectedUpsells}
                setSelectedUpsells={setSelectedUpsells}
                t={t as any}
              />
            )}

            {/* ── CTA Section ── */}
            {canPayOnSite && quote?.quoteId ? (
              /* Primary: Online payment available — direct booking */
              <button
                onClick={() => {
                  // GA4: begin_checkout
                  pushEcommerce({
                    event: 'begin_checkout',
                    ecommerce: {
                      currency: quote.currency || currency,
                      value: effectiveQuote?.total ?? quote.total,
                      items: [
                        {
                          item_id: `PROP-${guestyId}`,
                          item_name: propertyName,
                          item_category: 'villa',
                          item_variant: destination || '',
                          price: effectiveQuote?.nightlyRate ?? quote.nightlyRate,
                          quantity: effectiveQuote?.nights ?? quote.nights,
                          checkin_date: checkIn,
                          checkout_date: checkOut,
                          guests_adults: guests,
                        },
                      ],
                    },
                  });
                  // Check if BE quote has expired (24h validity)
                  if (quote.quoteCreatedAt && (Date.now() - quote.quoteCreatedAt > QUOTE_EXPIRY_MS)) {
                    // Auto-retry: clear expired quote and re-fetch
                    setQuote(prev => prev ? { ...prev, quoteId: undefined, quoteCreatedAt: undefined } : null);
                    setBeQuoteError("");
                    setError("");
                    // Trigger new BE quote fetch
                    const beRefreshTimeout = setTimeout(() => {
                      setBeQuoteError(t("bookingWidget.quoteExpired", { defaultValue: "Quote expired. Please try again." }));
                    }, 12000);
                    createBEQuote.mutateAsync({
                      listingId: guestyId, checkIn, checkOut, guests,
                      guestEmail: "guest@example.com",
                    }).then((be: any) => {
                      clearTimeout(beRefreshTimeout);
                      if (!be?.quoteId) return;
                      setQuote(prev => prev ? {
                        ...prev,
                        quoteId: be.quoteId,
                        quoteCreatedAt: Date.now(),
                        ratePlanId: be.ratePlanId,
                        currency: be.currency || prev.currency,
                        cancellationPolicy: be.cancellationPolicy,
                        ratePlanOptions: be.ratePlanOptions?.map((opt: any) => ({
                          ...opt,
                          total: opt.total > 0 ? opt.total : prev.total,
                          nightlyRate: opt.nightlyRate > 0 ? opt.nightlyRate : prev.nightlyRate,
                          cleaningFee: opt.cleaningFee > 0 ? opt.cleaningFee : prev.cleaningFee,
                        })),
                      } : null);
                      if (be.ratePlanId) setSelectedRatePlanId(be.ratePlanId);
                      // Auto-proceed to payment after refresh
                      setError("");
                      setTermsAccepted(false);
                      setStep("payment");
                    }).catch(() => {
                      clearTimeout(beRefreshTimeout);
                      setBeQuoteError(t("bookingWidget.quoteRefreshFailed", { defaultValue: "Could not refresh pricing. Please contact our concierge." }));
                    });
                    return;
                  }
                  setError("");
                  setTermsAccepted(false);
                  setStep("payment");
                }}
                className="w-full min-h-[52px] bg-black text-white text-xs font-medium tracking-[0.15em] uppercase px-8 py-4 hover:bg-black/85 transition-colors"
              >
                {t("bookingWidget.reserveAndPay", "Reserve & Pay")} {formatEur(effectiveQuote.total)}
              </button>
            ) : canPayOnSite && quote?.source === "base" && isRetryingForLivePrice ? (
              /* Retry in progress */
              <button
                disabled
                className="w-full min-h-[52px] bg-black/50 text-white text-xs font-medium tracking-[0.15em] uppercase px-8 py-4 cursor-wait"
              >
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("bookingWidget.checkingLivePricing", "Checking live pricing…")}
                </span>
              </button>
            ) : canPayOnSite && quote?.source === "base" && !quote?.quoteId && !isRetryingForLivePrice && !beQuoteRetryFailed ? (
              /* Estimated price — show Reserve & Pay immediately; clicking triggers live pricing retry */
              <button
                onClick={() => {
                  pushEcommerce({
                    event: 'begin_checkout',
                    ecommerce: {
                      currency,
                      value: effectiveQuote?.total ?? 0,
                      items: [
                        {
                          item_id: `PROP-${guestyId}`,
                          item_name: propertyName,
                          item_category: 'villa',
                          item_variant: destination || '',
                          price: effectiveQuote?.nightlyRate ?? 0,
                          quantity: effectiveQuote?.nights ?? nights,
                          checkin_date: checkIn,
                          checkout_date: checkOut,
                          guests_adults: guests,
                        },
                      ],
                    },
                  });
                  handleRetryReserve();
                }}
                className="w-full min-h-[52px] bg-black text-white text-xs font-medium tracking-[0.15em] uppercase px-8 py-4 hover:bg-black/85 transition-colors"
              >
                {t("bookingWidget.reserveAndPay", "Reserve & Pay")} {formatEur(effectiveQuote?.total ?? 0)}
              </button>
            ) : canPayOnSite && !quote?.quoteId && !beQuoteError && quote?.source !== "base" ? (
              /* Loading: BE quote still being fetched (live/cached source) — 8s timeout then show concierge */
              <button
                disabled
                className="w-full min-h-[52px] bg-black/50 text-white text-xs font-medium tracking-[0.15em] uppercase px-8 py-4 cursor-wait"
              >
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("bookingWidget.preparingPayment", "Preparing secure payment...")}
                </span>
              </button>
            ) : (
              /* Fallback: Payment unavailable — concierge contact only, NO prices */
              <div className="space-y-3">
                {beQuoteRetryFailed && beQuoteError && (
                  <div className="bg-red-50/60 border border-red-200/40 px-4 py-2.5 text-[11px] text-red-700">
                    {beQuoteError}
                  </div>
                )}
                <a
                  href={`https://wa.me/351927161771?text=${encodeURIComponent(
                    [
                      `Hi, I'd like to book ${propertyName}.`,
                      `Dates: ${checkIn} → ${checkOut} (${nights} nights)`,
                      `Guests: ${guests}`,
                      guestyId ? `Ref: ${guestyId}` : "",
                      beQuoteError ? `Note: Online checkout unavailable` : "",
                      `Could you help me complete this reservation?`,
                    ].filter(Boolean).join("\n")
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[52px] bg-black text-white text-[12px] font-medium tracking-[0.12em] uppercase px-8 py-4 hover:bg-black/85 transition-colors flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.612.638l4.725-1.217A11.947 11.947 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.24 0-4.318-.722-6.004-1.948l-.42-.312-2.833.73.756-2.753-.343-.453A9.963 9.963 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/></svg>
                  {t("bookingWidget.contactConcierge", "Contact Concierge")}
                </a>
                {/* Mini summary so guest sees what they're requesting */}
                <div className="bg-black/[0.02] border border-black/5 p-3 space-y-1">
                  <p className="text-[12px] text-black">{propertyName}</p>
                  <p className="text-[11px] text-black/40">
                    {formatDateDisplay(checkIn, "pt-PT")} → {formatDateDisplay(checkOut, "pt-PT")} · {nights} {t("bookingWidget.nightsLabel", "nights")} · {guests} {t("booking.guestsLabel", "guests")}
                  </p>
                </div>
                <p className="text-[11px] text-black/30 text-center leading-relaxed">
                  {t("bookingWidget.conciergeHelp", "Our team will check real-time availability and send you a secure payment link within minutes.")}
                </p>
              </div>
            )}

            <button onClick={resetDates} className="w-full text-[12px] text-black/30 hover:text-black transition py-1">
              {t("bookingWidget.changeDates")}
            </button>
          </>
        )}


        {/* Step: DETAILS — guest info form */}
        {/* Step: PAYMENT */}
        {step === "payment" && quote?.quoteId && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center">
                <Shield className="w-2.5 h-2.5 text-white" />
              </div>
              <p className="text-sm text-black font-medium">{t("bookingWidget.securePayment")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder={t("bookingWidget.firstNamePh")} value={guestFirstName}
                onChange={e => setGuestFirstName(e.target.value)}
                className="w-full h-[48px] border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:ring-1 focus:ring-black focus:border-black font-normal"
              />
              <input type="text" placeholder={t("bookingWidget.lastNamePh")} value={guestLastName}
                onChange={e => setGuestLastName(e.target.value)}
                className="w-full h-[48px] border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:ring-1 focus:ring-black focus:border-black font-normal"
              />
            </div>
            <input type="email" placeholder={t("bookingWidget.emailShortPh")} value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              className="w-full h-[48px] border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:ring-1 focus:ring-black focus:border-black font-normal"
            />
            <PhoneInput value={guestPhone} onChange={setGuestPhone} onBlur={() => setPhoneTouched(true)} />
            {/* Terms & Cancellation Policy acceptance */}
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={e => setTermsAccepted(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-black border-black/20 rounded"
              />
              <span className="text-[12px] text-black/60 leading-snug">
                {t("bookingWidget.termsAcceptLabel", {
                  defaultValue: "I accept the"
                })}{" "}
                <a href="/terms" target="_blank" className="text-black underline hover:text-black/70">{t("bookingWidget.termsLink", { defaultValue: "Terms & Conditions" })}</a>
                {" "}{t("bookingWidget.termsAnd", { defaultValue: "and" })}{" "}
                <a href="/faq#cancellation" target="_blank" className="text-black underline hover:text-black/70">{t("bookingWidget.cancellationPolicyLink")}</a>
              </span>
            </label>

            {/* Inline validation feedback */}
            {guestEmail && !isValidEmail(guestEmail) && (
              <p className="text-[11px] text-red-500">{t("bookingWidget.invalidEmail", { defaultValue: "Please enter a valid email address" })}</p>
            )}
            {phoneTouched && guestPhone && !isValidPhone(guestPhone) && (
              <p className="text-[11px] text-red-500">{t("bookingWidget.invalidPhone", { defaultValue: "Please enter a valid phone number" })}</p>
            )}

            {/* Payment form only renders when ALL guest details are valid + terms accepted */}
            {termsAccepted && guestFirstName.trim() && guestLastName.trim() && isValidEmail(guestEmail) && isValidPhone(guestPhone) ? (
              <>
                {/* Booking summary confirmation before payment */}
                <div className="bg-black/[0.02] border border-black/10 p-4 space-y-1.5">
                  <p className="text-[11px] font-semibold tracking-[0.06em] uppercase text-black/30">{t("bookingWidget.bookingSummary", { defaultValue: "Booking summary" })}</p>
                  <p className="text-[13px] text-black">{propertyName}</p>
                  <p className="text-[12px] text-black/50">
                    {formatDateDisplay(checkIn, "pt-PT")} → {formatDateDisplay(checkOut, "pt-PT")} · {effectiveQuote?.nights || nights} {t("bookingWidget.nightsLabel", "nights")} · {guests} {t("booking.guestsLabel", "guests")}
                  </p>
                  <p className="text-[15px] text-black font-medium tabular-nums">{t("property.total")}: {formatEur(effectiveQuote?.total ?? quote.total)}</p>
                  <p className="text-[11px] text-black/30">{guestFirstName} {guestLastName} · {guestEmail}</p>
                </div>
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
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <button disabled className="btn-primary w-full opacity-40 cursor-not-allowed">
                  {t("bookingWidget.proceedToPayment", { defaultValue: "Proceed to Payment" })}
                </button>
                <button type="button" onClick={() => setStep("quote")} className="btn-ghost">
                  {t("payment.cancelButton", { defaultValue: "Back" })}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Trust signals */}
        <div className="flex items-center justify-center gap-4 pt-3">
          <div className="flex items-center gap-1 text-[11px] text-black/25">
            <Shield className="w-3 h-3" /> {t("bookingWidget.secureBooking")}
          </div>
        </div>

        {/* Cancellation policy */}
        <p className="text-[11px] text-black/30 text-center">
          <a href="/faq#cancellation" className="text-black/50 hover:underline">{t("bookingWidget.cancellationPolicyLink")}</a>
          {(effectiveQuote?.cancellationPolicy?.length ?? 0) > 0 && (
            <span className="block mt-1 text-black/30">{humanizeCancellationPolicy(effectiveQuote?.cancellationPolicy?.[0] || '')}</span>
          )}
        </p>
      </div>
    </div>
  );
}
