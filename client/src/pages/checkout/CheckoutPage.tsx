/**
 * Checkout 2.0 — Fase 1 (docs/checkout_spec.md §3, §4, §16).
 *
 * Fullscreen checkout at /checkout/:intentId (behind the checkout_v2 flag).
 * The server-side BookingIntent is the source of truth from the moment the
 * guest lands here; every mutation is synced back via trpc.checkout.updateIntent,
 * which is what makes resume-by-link on another device work.
 *
 * Fase 1 ships two steps — "A sua estadia" (recap + rate plan + email capture)
 * and "Pagamento" (guest details + payment). Fase 2 inserts "Personalizar"
 * between them; the stepper is data-driven so that is a one-line change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  X,
  Check,
  Loader2,
  Lock,
  ShieldCheck,
  Headphones,
  BadgeCheck,
  Pencil,
  Minus,
  Plus,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { formatEur, formatBookingDate, intlLocale, sanitizePropertyName } from "@/lib/format";
import { cancellationPolicyText } from "@/lib/cancellation";
import { IMAGES, optimizeGuestyImage } from "@/lib/images";
import { isValidEmail, isValidPhone } from "@/lib/validation";
import { pushDL } from "@/lib/datalayer";
import { stashThankYou } from "@/lib/booking-api";
import AvailabilityCalendar, { type AvailabilityDay } from "@/components/booking/AvailabilityCalendar";
import CheckoutPaymentForm from "@/components/booking/CheckoutPaymentForm";
import PhoneInput from "@/components/booking/PhoneInput";

type Step = "stay" | "pay";

/** Quote snapshot mirrored from the intent (euro floats, same shape as the server json column) */
interface QuoteSnapshot {
  nightlyRate: number;
  totalNights: number;
  cleaningFee: number;
  taxesAndFees: number;
  total: number;
  nights: number;
  currency: string;
  quoteCreatedAt: number | null;
  ratePlanOptions?: Array<{
    ratePlanId: string;
    name: string;
    total: number;
    nightlyRate: number;
    cleaningFee: number;
    taxesAndFees?: number;
    cancellationPolicy?: string[];
  }>;
}

const QUOTE_EXPIRY_MS = 23 * 60 * 60 * 1000;

function isNonRefundableOption(o: { name: string; cancellationPolicy?: string[] }): boolean {
  const n = (o.name || "").toLowerCase();
  const code = (o.cancellationPolicy?.[0] || "").toLowerCase();
  return (
    (n.includes("non") && n.includes("refund")) ||
    (n.includes("não") && n.includes("reembols")) ||
    code === "super_strict" ||
    code === "strict"
  );
}

export default function CheckoutPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { intentId } = useParams<{ intentId: string }>();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  usePageMeta({ title: t("checkout.pageTitle", "Checkout"), noindex: true });

  const intentQuery = trpc.checkout.getIntent.useQuery(
    { intentId: intentId ?? "" },
    { enabled: !!intentId, refetchOnWindowFocus: false, retry: 1 },
  );
  const updateIntent = trpc.checkout.updateIntent.useMutation();
  const captureLead = trpc.checkout.captureLead.useMutation();

  const intent = intentQuery.data?.intent ?? null;

  /** Patch the server intent AND the React Query cache in lockstep — otherwise a
   *  remount within staleTime re-seeds the page from pre-edit data (stale quote). */
  const syncIntent = useCallback(
    (patch: Record<string, unknown>) => {
      if (!intentId) return;
      utils.checkout.getIntent.setData({ intentId }, (prev) =>
        prev?.intent ? { ...prev, intent: { ...prev.intent, ...patch } as typeof prev.intent } : prev,
      );
      updateIntent.mutate({ intentId, patch: patch as any });
    },
    [intentId, utils, updateIntent],
  );

  // ── Local editable state, seeded ONCE from the intent ──
  const seededRef = useRef(false);
  const [step, setStep] = useState<Step>("stay");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [quote, setQuote] = useState<QuoteSnapshot | null>(null);
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [nif, setNif] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [editingStay, setEditingStay] = useState(false);
  const [requoting, setRequoting] = useState(false);
  const [quoteStale, setQuoteStale] = useState(false);
  const [datesUnavailable, setDatesUnavailable] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const contactFiredRef = useRef(false);

  // The global CookieBanner (fixed bottom, z-60) legally must stay on top; while
  // consent is pending we lift the checkout's own bottom bar above it so the
  // total + Continue CTA stay reachable. Polls briefly until consent is given.
  const [consentPending, setConsentPending] = useState(false);
  useEffect(() => {
    const check = () => {
      try { setConsentPending(!localStorage.getItem("pa-cookies-consent")); } catch { setConsentPending(false); }
    };
    check();
    const timer = setInterval(check, 1500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!intent || seededRef.current) return;
    seededRef.current = true;
    setCheckIn(intent.checkIn);
    setCheckOut(intent.checkOut);
    setGuests(intent.guests);
    setQuote((intent.quote as QuoteSnapshot) ?? null);
    setQuoteId(intent.guestyQuoteId ?? null);
    setSelectedRatePlanId(intent.ratePlanId ?? null);
    if (intent.email) setEmail(intent.email);
    if (intent.guestFirstName) setFirstName(intent.guestFirstName);
    if (intent.guestLastName) setLastName(intent.guestLastName);
    if (intent.guestPhone) setPhone(intent.guestPhone);
    if (intent.nif) setNif(intent.nif);
    // Resume from a link (another device/session)? The widget marks the
    // session it created the intent in; absence of the marker = resume.
    let resumed = false;
    try {
      resumed = !sessionStorage.getItem(`checkout_created_${intent.id}`);
      // Mark this tab so refreshes / re-mounts don't re-fire checkout_resume
      sessionStorage.setItem(`checkout_created_${intent.id}`, "1");
    } catch { /* storage unavailable */ }
    if (intent.email) contactFiredRef.current = true;
    if (resumed) {
      pushDL({ event: "checkout_resume", property_id: intent.listingId });
      if (intent.status === "contact_captured" || intent.status === "payment_pending") setStep("pay");
    }
    // Quote freshness — the BE quote dies after ~24h; warn at 23h
    const createdAt = (intent.quote as QuoteSnapshot | null)?.quoteCreatedAt;
    if (
      intentQuery.data?.expired ||
      !intent.guestyQuoteId ||
      (createdAt != null && Date.now() - createdAt > QUOTE_EXPIRY_MS)
    ) {
      setQuoteStale(true);
    }
  }, [intent, intentQuery.data?.expired]);

  // ── Derived pricing (selected rate plan overlays the base quote) ──
  const effective = useMemo(() => {
    if (!quote) return null;
    const opt = quote.ratePlanOptions?.find((o) => o.ratePlanId === selectedRatePlanId);
    if (!opt) return { ...quote, ratePlanId: selectedRatePlanId ?? undefined, cancellationPolicy: undefined as string[] | undefined };
    return {
      ...quote,
      nightlyRate: opt.nightlyRate,
      totalNights: opt.nightlyRate * quote.nights,
      cleaningFee: opt.cleaningFee,
      taxesAndFees: opt.taxesAndFees ?? 0,
      total: opt.total,
      ratePlanId: opt.ratePlanId,
      cancellationPolicy: opt.cancellationPolicy,
    };
  }, [quote, selectedRatePlanId]);

  // ── Property (photo + slug for the back link) ──
  const propertyQuery = trpc.properties.getBySlugForSite.useQuery(
    { slug: intent?.propertySlug ?? "" },
    { enabled: !!intent?.propertySlug, staleTime: 60 * 60 * 1000 },
  );
  const property = propertyQuery.data as any;
  const heroImage = property?.images?.[0]
    ? optimizeGuestyImage(property.images[0], 800)
    : undefined;
  const displayName = sanitizePropertyName(intent?.propertyName || property?.name || "");
  const backHref = intent?.propertySlug ? `/homes/${intent.propertySlug}` : "/homes";

  // ── Calendar days for inline date editing ──
  const calendarQuery = trpc.booking.getCalendar.useQuery(
    {
      listingId: intent?.listingId ?? "",
      from: new Date().toISOString().split("T")[0],
      to: (() => { const d = new Date(); d.setMonth(d.getMonth() + 18); return d.toISOString().split("T")[0]; })(),
    },
    { enabled: !!intent?.listingId && editingStay, staleTime: 10 * 60 * 1000 },
  );
  const calendarDays: AvailabilityDay[] = calendarQuery.data?.days ?? [];

  // ── Re-quote (dates/guests changed or quote expired) ──
  const requote = useCallback(
    async (ci: string, co: string, g: number) => {
      if (!intent) return;
      setRequoting(true);
      setDatesUnavailable(false);
      try {
        const d = await utils.booking.getQuote.fetch({
          listingId: intent.listingId,
          checkIn: ci,
          checkOut: co,
          guests: g,
        });
        const liveQuoteId: string | undefined = (d as any).quoteId;
        const source = (d as any).source;
        const total = d.pricing?.total ?? 0;
        if (!liveQuoteId || (source !== "live" && source !== "cached") || total <= 0) {
          setDatesUnavailable(true);
          return;
        }
        const fresh: QuoteSnapshot = {
          nightlyRate: d.pricing?.nightlyRate ?? 0,
          totalNights: d.pricing?.totalNights ?? 0,
          cleaningFee: d.pricing?.cleaningFee ?? 0,
          taxesAndFees: (d.pricing as any)?.taxesAndFees ?? 0,
          total,
          nights: d.nights,
          currency: "EUR",
          quoteCreatedAt: Date.now(),
          ratePlanOptions: (d as any).ratePlanOptions,
        };
        // Re-resolve the plan selection: ids can change between quotes
        const stillThere = fresh.ratePlanOptions?.find((o) => o.ratePlanId === selectedRatePlanId);
        const nextPlan = stillThere?.ratePlanId ?? (d as any).ratePlanId ?? fresh.ratePlanOptions?.[0]?.ratePlanId ?? null;
        setQuote(fresh);
        setQuoteId(liveQuoteId);
        setSelectedRatePlanId(nextPlan);
        setCheckIn(ci);
        setCheckOut(co);
        setGuests(g);
        setQuoteStale(false);
        syncIntent({
          checkIn: ci,
          checkOut: co,
          guests: g,
          guestyQuoteId: liveQuoteId,
          ratePlanId: nextPlan ?? undefined,
          quote: fresh,
        });
      } catch {
        setDatesUnavailable(true);
      } finally {
        setRequoting(false);
      }
    },
    [intent, selectedRatePlanId, syncIntent, utils],
  );

  // ── Step 1 → 2: email capture ──
  const submitEmail = useCallback(() => {
    setEmailTouched(true);
    if (!intent || !isValidEmail(email)) return;
    // Sequence the two writes: batched-concurrent mutations race server-side
    // (captureLead's read-then-write vs the status update).
    captureLead
      .mutateAsync({ intentId: intent.id, email, locale: lang })
      .then(() => syncIntent({ status: "payment_pending" }))
      .catch(() => {/* fail-soft: the step advance below never blocks on persistence */});
    utils.checkout.getIntent.setData({ intentId: intent.id }, (prev) =>
      prev?.intent ? { ...prev, intent: { ...prev.intent, email } } : prev,
    );
    if (!contactFiredRef.current) {
      contactFiredRef.current = true;
      pushDL({ event: "add_contact_info", property_id: intent.listingId, source: "checkout_v2" });
    }
    setStep("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [intent, email, lang, captureLead, syncIntent, utils]);

  // Persist guest details when they become valid (debounced-ish: on blur via effect)
  const guestDetailsValid =
    firstName.trim().length > 0 && lastName.trim().length > 0 && isValidPhone(phone);
  const detailsSyncedRef = useRef("");
  useEffect(() => {
    if (!intent || !guestDetailsValid) return;
    const key = `${firstName}|${lastName}|${phone}|${nif}`;
    if (detailsSyncedRef.current === key) return;
    const timer = setTimeout(() => {
      detailsSyncedRef.current = key;
      syncIntent({
        guestFirstName: firstName.trim(),
        guestLastName: lastName.trim(),
        guestPhone: phone,
        nif: nif.trim(),
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [intent, guestDetailsValid, firstName, lastName, phone, nif, syncIntent]);

  // ── Card payment success → unified branded thank-you page ──
  const handleCardSuccess = useCallback(
    (confirmationCode: string, reservationId?: string) => {
      if (!intent) return;
      const rid = reservationId || confirmationCode;
      stashThankYou({
        reservationId: rid,
        confirmationCode,
        method: "card",
        listingName: displayName,
        location: intent.destination || "",
        checkIn,
        checkOut,
        guestsCount: guests,
        guestName: `${firstName} ${lastName}`.trim(),
        guestEmail: email,
        guestPhone: phone,
        totalCents: effective ? Math.round(effective.total * 100) : null,
        currency: "EUR",
      });
      syncIntent({
        status: "paid",
        reservationId: reservationId || undefined,
        confirmationCode,
      });
      navigate(`/booking/thank-you/${rid}?method=card`);
    },
    [intent, displayName, checkIn, checkOut, guests, firstName, lastName, email, phone, effective, syncIntent, navigate],
  );

  // ── Price-guarantee deadline label ──
  const guaranteeLabel = useMemo(() => {
    if (!intent?.expiresAt) return null;
    const d = new Date(intent.expiresAt);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return null;
    const time = d.toLocaleTimeString(intlLocale(lang), { hour: "2-digit", minute: "2-digit" });
    const pad = (n: number) => String(n).padStart(2, "0");
    const localYmd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return t("checkout.priceGuaranteed", { date: formatBookingDate(localYmd, lang), time });
  }, [intent?.expiresAt, lang, t]);

  const steps: Array<{ key: Step; label: string }> = [
    { key: "stay", label: t("checkout.stepStay", "Your stay") },
    { key: "pay", label: t("checkout.stepPay", "Payment") },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  // ── Loading / not-found states ──
  if (intentQuery.isLoading) {
    return (
      <div className="min-h-screen bg-pa-cream flex items-center justify-center">
        <div className="flex items-center gap-3 text-pa-earth text-sm">
          <Loader2 className="w-5 h-5 animate-spin text-pa-gold" />
          {t("checkout.loading", "Preparing your checkout…")}
        </div>
      </div>
    );
  }
  if (!intent) {
    return (
      <div className="min-h-screen bg-pa-cream flex items-center justify-center px-6">
        <div className="max-w-[420px] text-center space-y-4">
          <h1 className="headline-md text-pa-dark">{t("checkout.notFoundTitle", "Checkout not found")}</h1>
          <p className="body-sm">{t("checkout.notFoundBody", "This checkout link has expired or is invalid. Your dates are not lost — start again from the property page.")}</p>
          <Link href="/homes" className="btn-primary inline-flex">{t("booking.backToProperty", "Back to the property")}</Link>
        </div>
      </div>
    );
  }
  // A paid intent is terminal: reopening the resume link must NEVER re-arm the
  // payment form (double-charge risk via a second Stripe PaymentIntent).
  if (intent.status === "paid") {
    return (
      <div className="min-h-screen bg-pa-cream flex items-center justify-center px-6">
        <div className="max-w-[440px] text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-pa-dark flex items-center justify-center">
            <Check className="w-6 h-6 text-white" />
          </div>
          <h1 className="headline-md text-pa-dark">{t("checkout.alreadyPaidTitle", "This booking is already confirmed")}</h1>
          <p className="body-sm">
            {t("checkout.alreadyPaidBody", "The payment for this stay was completed. Check your email for the confirmation, or view your booking below.")}
            {intent.confirmationCode ? ` (${intent.confirmationCode})` : ""}
          </p>
          {intent.reservationId ? (
            <Link href={`/booking/thank-you/${intent.reservationId}?method=card`} className="btn-primary inline-flex">
              {t("checkout.viewBooking", "View my booking")}
            </Link>
          ) : (
            <Link href={backHref} className="btn-primary inline-flex">{t("booking.backToProperty", "Back to the property")}</Link>
          )}
        </div>
      </div>
    );
  }

  const summaryLines = effective && (
    <div className="space-y-2">
      <div className="flex justify-between text-[13px]">
        <span className="text-pa-earth">
          {formatEur(effective.nightlyRate, lang)} × {effective.nights} {t("bookingWidget.nightsLabel", "nights")}
        </span>
        <span className="text-pa-dark tabular-nums">{formatEur(effective.totalNights, lang)}</span>
      </div>
      {effective.cleaningFee > 0 && (
        <div className="flex justify-between text-[13px]">
          <span className="text-pa-earth">{t("property.cleaningFee")}</span>
          <span className="text-pa-dark tabular-nums">{formatEur(effective.cleaningFee, lang)}</span>
        </div>
      )}
      {effective.taxesAndFees > 0 && (
        <div className="flex justify-between text-[13px]">
          <span className="text-pa-earth">{t("bookingWidget.taxesAndFees", "Taxes & fees")}</span>
          <span className="text-pa-dark tabular-nums">{formatEur(effective.taxesAndFees, lang)}</span>
        </div>
      )}
      <div className="flex justify-between items-baseline border-t border-pa-sand pt-2.5">
        <span className="text-[14px] font-medium text-pa-dark">{t("property.total")}</span>
        <span className="text-[20px] font-light text-pa-dark tabular-nums">{formatEur(effective.total, lang)}</span>
      </div>
    </div>
  );

  const summaryCard = (
    <div className="bg-white border border-pa-sand rounded-lg overflow-hidden shadow-[0_4px_24px_rgba(26,26,24,0.06)]">
      {heroImage && (
        <img src={heroImage} alt={displayName} className="w-full aspect-[4/3] object-cover" width={800} height={600} />
      )}
      <div className="p-5 space-y-4">
        <div>
          <p className="text-[15px] text-pa-dark font-medium leading-snug">{displayName}</p>
          {intent.destination && <p className="text-[12px] text-pa-stone-aa mt-0.5 capitalize">{intent.destination}</p>}
        </div>
        <div className="text-[12.5px] text-pa-earth">
          {formatBookingDate(checkIn, lang, true)} → {formatBookingDate(checkOut, lang, true)} · {guests} {t("booking.guestsLabel", "guests")}
        </div>
        {summaryLines}
        {effective?.cancellationPolicy?.[0] && (
          <p className="text-[11px] text-pa-stone-aa leading-snug">
            {cancellationPolicyText(effective.cancellationPolicy[0], checkIn, t, lang)}
          </p>
        )}
        {guaranteeLabel && (
          <p className="text-[11px] text-pa-gold leading-snug">{guaranteeLabel}</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-pa-cream pb-28 lg:pb-12">
      {/* ── Minimal top bar: logo · stepper · autosave + close ── */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-pa-sand">
        <div className="max-w-[1100px] mx-auto px-4 h-[60px] flex items-center justify-between gap-4">
          <Link href="/" className="shrink-0" aria-label="Portugal Active">
            <img src={IMAGES.logoColor} alt="Portugal Active" className="h-[26px] w-auto" />
          </Link>
          <nav aria-label={t("checkout.stepsAria", "Checkout steps")} className="flex items-center gap-2 sm:gap-3">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2 sm:gap-3">
                {i > 0 && <span className="w-6 sm:w-10 h-px bg-pa-sand" />}
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "w-5 h-5 rounded-full text-[10px] flex items-center justify-center border",
                      i < stepIndex
                        ? "bg-pa-dark border-pa-dark text-white"
                        : i === stepIndex
                          ? "border-pa-dark text-pa-dark"
                          : "border-pa-sand text-pa-stone-aa",
                    )}
                  >
                    {i < stepIndex ? <Check className="w-3 h-3" /> : i + 1}
                  </span>
                  <span
                    className={cn(
                      "text-[11px] tracking-[0.06em] uppercase hidden sm:inline",
                      i === stepIndex ? "text-pa-dark font-medium" : "text-pa-stone-aa",
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden md:inline text-[11px] text-pa-stone-aa">
              {t("checkout.autosaved", "Saved automatically")}
            </span>
            <Link
              href={backHref}
              aria-label={t("checkout.closeAria", "Back to the property")}
              className="w-9 h-9 rounded-full border border-pa-sand flex items-center justify-center text-pa-earth hover:border-pa-dark hover:text-pa-dark transition-colors"
            >
              <X className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 pt-8 lg:grid lg:grid-cols-[minmax(0,640px)_380px] lg:gap-12 lg:items-start">
        {/* ══════════ CONTENT COLUMN ══════════ */}
        <section className="space-y-6">
          {/* Stale quote / unavailable banners */}
          {quoteStale && !datesUnavailable && (
            <div className="flex items-start justify-between gap-4 p-4 bg-pa-warm border border-pa-sand rounded-lg">
              <p className="text-[13px] text-pa-earth leading-snug">
                {t("checkout.quoteExpiredBanner", "This price has expired. Refresh to see the current price for your dates — your details are kept.")}
              </p>
              <button
                type="button"
                onClick={() => requote(checkIn, checkOut, guests)}
                disabled={requoting}
                className="shrink-0 text-[12px] font-medium text-pa-dark underline underline-offset-2 disabled:opacity-40"
              >
                {requoting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("checkout.refreshPrice", "Refresh price")}
              </button>
            </div>
          )}
          {datesUnavailable && (
            <div className="p-4 bg-red-50/70 border border-red-200/60 rounded-lg space-y-2" role="alert">
              <p className="text-[13px] text-red-700 leading-snug">
                {t("checkout.datesUnavailable", "These dates are no longer available. Please choose new dates below or contact our concierge.")}
              </p>
              <button
                type="button"
                onClick={() => { setStep("stay"); setEditingStay(true); setDatesUnavailable(false); }}
                className="text-[12px] font-medium text-red-700 underline underline-offset-2"
              >
                {t("bookingWidget.changeDates", "Change dates")}
              </button>
            </div>
          )}

          {/* ── PASSO 1: A SUA ESTADIA ── */}
          {step === "stay" && (
            <>
              <div>
                <h1 className="headline-md text-pa-dark mb-1">{t("checkout.stayTitle", "Your stay")}</h1>
                <p className="body-sm">{t("checkout.staySubtitle", "Confirm your dates and choose your rate.")}</p>
              </div>

              {/* Editable recap */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="grid grid-cols-3 gap-4 flex-1">
                    <div>
                      <p className="text-[10px] tracking-[0.12em] uppercase text-pa-stone-aa mb-1">{t("bookingWidget.checkInLabel")}</p>
                      <p className="text-[14px] text-pa-dark">{formatBookingDate(checkIn, lang, true)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] tracking-[0.12em] uppercase text-pa-stone-aa mb-1">{t("bookingWidget.checkOutLabel")}</p>
                      <p className="text-[14px] text-pa-dark">{formatBookingDate(checkOut, lang, true)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] tracking-[0.12em] uppercase text-pa-stone-aa mb-1">{t("booking.guestsLabel")}</p>
                      <p className="text-[14px] text-pa-dark">{guests}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingStay((v) => !v)}
                    className="shrink-0 flex items-center gap-1.5 text-[12px] text-pa-gold hover:text-pa-dark transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {editingStay ? t("checkout.doneEditing", "Done") : t("checkout.edit", "Edit")}
                  </button>
                </div>

                {editingStay && (
                  <div className="border-t border-pa-sand pt-4 space-y-4">
                    {calendarQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 text-[12px] text-pa-stone-aa">
                        <Loader2 className="w-4 h-4 animate-spin" /> {t("bookingWidget.loadingCalendar", "Loading availability...")}
                      </div>
                    ) : (
                      <AvailabilityCalendar
                        days={calendarDays}
                        checkIn={checkIn}
                        checkOut={checkOut}
                        minNights={property?.minNights}
                        onSelectRange={({ checkIn: ci, checkOut: co }) => {
                          if (ci && co) {
                            requote(ci, co, guests);
                            setEditingStay(false);
                          }
                        }}
                      />
                    )}
                    <div className="flex items-center gap-4">
                      <p className="text-[10px] tracking-[0.12em] uppercase text-pa-stone-aa">{t("booking.guestsLabel")}</p>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => { const g = Math.max(1, guests - 1); if (g !== guests) requote(checkIn, checkOut, g); }}
                          disabled={guests <= 1 || requoting}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark disabled:opacity-25 transition-colors"
                          aria-label={t("booking.decreaseGuests", "Decrease guests")}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="min-w-[2ch] text-center text-[14px] text-pa-dark tabular-nums">{guests}</span>
                        <button
                          type="button"
                          onClick={() => { const max = property?.maxGuests || 30; const g = Math.min(max, guests + 1); if (g !== guests) requote(checkIn, checkOut, g); }}
                          disabled={requoting || guests >= (property?.maxGuests || 30)}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-pa-sand text-pa-earth hover:border-pa-dark hover:text-pa-dark disabled:opacity-25 transition-colors"
                          aria-label={t("booking.increaseGuests", "Increase guests")}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      {requoting && <Loader2 className="w-4 h-4 animate-spin text-pa-gold" />}
                    </div>
                  </div>
                )}
              </div>

              {/* Rate plan choice */}
              {(quote?.ratePlanOptions?.length ?? 0) > 1 && (
                <div className="space-y-2">
                  <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold">{t("bookingWidget.ratePlan", "Rate plan")}</p>
                  {quote!.ratePlanOptions!.map((opt) => {
                    const isSelected = selectedRatePlanId === opt.ratePlanId;
                    const nonRef = isNonRefundableOption(opt);
                    const label = nonRef ? t("booking.nonRefundable") : t("booking.flexibleRate");
                    const policyLine = opt.cancellationPolicy?.[0]
                      ? cancellationPolicyText(opt.cancellationPolicy[0], checkIn, t, lang)
                      : null;
                    return (
                      <label
                        key={opt.ratePlanId}
                        className={cn(
                          "flex items-center gap-3 p-4 bg-white border rounded-lg cursor-pointer transition-all",
                          isSelected ? "border-pa-dark ring-1 ring-pa-dark" : "border-pa-sand hover:border-pa-gold",
                        )}
                      >
                        <input
                          type="radio"
                          name="checkoutRatePlan"
                          checked={isSelected}
                          onChange={() => {
                            setSelectedRatePlanId(opt.ratePlanId);
                            syncIntent({ ratePlanId: opt.ratePlanId });
                            pushDL({
                              event: "rate_plan_selected",
                              rate_plan: nonRef ? "non_refundable" : "flexible",
                              value: opt.total,
                              property_id: intent.listingId,
                            });
                          }}
                          className="accent-black w-4 h-4 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[13.5px] text-pa-dark font-medium">{label}</p>
                          <p className={cn("text-[11px] mt-0.5", nonRef ? "text-red-500/80" : "text-pa-earth")}>
                            {nonRef
                              ? t("bookingWidget.nonRefundableWarning", "No refund if you cancel or modify")
                              : policyLine}
                          </p>
                        </div>
                        <span className="text-[14.5px] text-pa-dark font-medium tabular-nums shrink-0">
                          {formatEur(opt.total, lang)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Price breakdown */}
              {effective && (
                <div className="bg-white border border-pa-sand rounded-lg p-5">{summaryLines}</div>
              )}

              {/* Email capture */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-3">
                <label htmlFor="checkout-email" className="block text-[13px] font-medium text-pa-dark">
                  {t("checkout.emailLabel", "Your email")}
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmailTouched(true)}
                  placeholder={t("checkout.emailPh", "name@email.com")}
                  className="w-full h-[48px] border border-pa-sand bg-white px-3 rounded-md text-[15px] text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none"
                />
                {emailTouched && email.length > 0 && !isValidEmail(email) && (
                  <p className="text-[11px] text-red-500">{t("bookingWidget.invalidEmail", "Please enter a valid email address")}</p>
                )}
                <p className="text-[11.5px] text-pa-stone-aa leading-relaxed">
                  {t("checkout.emailSupport", "We hold your reservation for 24 hours and email you the quote. No spam.")}
                </p>
                <button
                  type="button"
                  onClick={submitEmail}
                  disabled={!isValidEmail(email) || quoteStale || datesUnavailable}
                  className="btn-primary w-full disabled:opacity-40"
                >
                  {t("booking.continue", "Continue")}
                </button>
              </div>
            </>
          )}

          {/* ── PASSO PAGAMENTO ── */}
          {step === "pay" && (
            <>
              <div>
                <button
                  type="button"
                  onClick={() => setStep("stay")}
                  className="text-[12px] text-pa-stone-aa hover:text-pa-dark transition-colors mb-3"
                >
                  ← {t("checkout.backToStay", "Back to your stay")}
                </button>
                <h1 className="headline-md text-pa-dark mb-1">{t("checkout.payTitle", "Payment")}</h1>
                <p className="body-sm">{t("checkout.paySubtitle", "Your details, then a secure payment.")}</p>
              </div>

              {/* Guest details */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-3">
                <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold">
                  {t("bookingWidget.guestInformation", "Guest information")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    autoComplete="given-name"
                    placeholder={t("bookingWidget.firstNamePh")}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full h-[48px] border border-pa-sand bg-white px-3 rounded-md text-[14px] text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none"
                  />
                  <input
                    type="text"
                    autoComplete="family-name"
                    placeholder={t("bookingWidget.lastNamePh")}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full h-[48px] border border-pa-sand bg-white px-3 rounded-md text-[14px] text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none"
                  />
                </div>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-[48px] border border-pa-sand bg-white px-3 rounded-md text-[14px] text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none"
                />
                <PhoneInput
                  value={phone}
                  onChange={setPhone}
                  onBlur={() => setPhoneTouched(true)}
                  placeholder={t("bookingWidget.phonePh", "Phone number *")}
                />
                {phoneTouched && phone && !isValidPhone(phone) && (
                  <p className="text-[11px] text-red-500">{t("bookingWidget.invalidPhone", "Please enter a valid phone number")}</p>
                )}
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={20}
                  value={nif}
                  onChange={(e) => setNif(e.target.value)}
                  placeholder={t("checkout.nifPh", "NIF — optional, for a Portuguese invoice")}
                  className="w-full h-[48px] border border-pa-sand bg-white px-3 rounded-md text-[14px] text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none"
                />
                <label className="flex items-start gap-2 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={termsAccepted}
                    onChange={(e) => setTermsAccepted(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-black border-pa-sand rounded"
                  />
                  <span className="text-[12px] text-pa-earth leading-snug">
                    {t("bookingWidget.termsAcceptLabel", "I accept the")}{" "}
                    <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-pa-dark underline hover:text-pa-gold">{t("bookingWidget.termsLink", "Terms & Conditions")}</a>
                    {" "}{t("bookingWidget.termsAnd", "and the")}{" "}
                    <a href="/legal/cancellation-policy" target="_blank" rel="noopener noreferrer" className="text-pa-dark underline hover:text-pa-gold">{t("bookingWidget.cancellationPolicyLink")}</a>
                  </span>
                </label>
              </div>

              {/* Direct-booking assurance (audit finding D1) */}
              <div className="bg-pa-warm border border-pa-sand rounded-lg p-4">
                <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-2.5">
                  {t("checkout.directTitle", "Booking direct with Portugal Active")}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="flex items-center gap-2 text-[12px] text-pa-earth">
                    <ShieldCheck className="w-4 h-4 text-pa-gold shrink-0" strokeWidth={1.8} />
                    {t("trust.bestRate", "Best rate guaranteed")}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-pa-earth">
                    <BadgeCheck className="w-4 h-4 text-pa-gold shrink-0" strokeWidth={1.8} />
                    {t("trust.noBookingFees", "No booking fees")}
                  </div>
                  <div className="flex items-center gap-2 text-[12px] text-pa-earth">
                    <Headphones className="w-4 h-4 text-pa-gold shrink-0" strokeWidth={1.8} />
                    {t("trust.conciergeIncluded", "Concierge included")}
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-4">
                {termsAccepted && firstName.trim() && lastName.trim() && isValidEmail(email) && isValidPhone(phone) && quoteId && effective && !quoteStale ? (
                  <CheckoutPaymentForm
                    listingId={intent.listingId}
                    checkIn={checkIn}
                    checkOut={checkOut}
                    guests={guests}
                    quoteId={quoteId}
                    ratePlanId={effective.ratePlanId ?? selectedRatePlanId ?? ""}
                    total={effective.total}
                    currency="EUR"
                    propertyName={intent.propertyName || displayName}
                    destination={intent.destination || undefined}
                    guestName={`${firstName.trim()} ${lastName.trim()}`}
                    guestEmail={email}
                    guestPhone={phone}
                    intentId={intent.id}
                    onSuccess={handleCardSuccess}
                    onCancel={() => setStep("stay")}
                  />
                ) : (
                  <div className="space-y-3">
                    {quoteStale && (
                      <p className="text-[12px] text-pa-earth">{t("checkout.refreshBeforePay", "Refresh the price above before paying.")}</p>
                    )}
                    <button disabled className="btn-primary w-full opacity-40 cursor-not-allowed">
                      {t("bookingWidget.proceedToPayment", "Proceed to Payment")}
                    </button>
                  </div>
                )}
                {/* Cancellation policy repeated in human text next to the pay button (spec §7) */}
                {effective?.cancellationPolicy?.[0] && (
                  <p className="text-[11.5px] text-pa-stone-aa text-center leading-snug">
                    {cancellationPolicyText(effective.cancellationPolicy[0], checkIn, t, lang)}
                  </p>
                )}
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-pa-stone-aa">
                  <Lock className="w-3 h-3" /> {t("checkout.secureNote", "Encrypted, secure payment")}
                </p>
              </div>
            </>
          )}
        </section>

        {/* ══════════ SUMMARY COLUMN (desktop) ══════════ */}
        <aside className="hidden lg:block sticky top-[84px]">{summaryCard}</aside>
      </main>

      {/* ══════════ MOBILE: bottom bar + expandable summary sheet ══════════ */}
      <div className="lg:hidden fixed inset-x-0 z-40" style={{ bottom: consentPending ? "120px" : 0 }}>
        {sheetOpen && (
          <div className="max-h-[60vh] overflow-y-auto bg-white border-t border-pa-sand px-4 pt-4 pb-2 shadow-[0_-8px_32px_rgba(26,26,24,0.10)]">
            {summaryCard}
          </div>
        )}
        <div className="bg-white border-t border-pa-sand px-4 py-3 flex items-center justify-between gap-3" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}>
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            className="flex items-center gap-1.5 text-left"
            aria-expanded={sheetOpen}
          >
            <div>
              <p className="text-[16px] font-medium text-pa-dark tabular-nums leading-tight">
                {effective ? formatEur(effective.total, lang) : "—"}
              </p>
              <p className="text-[10.5px] text-pa-stone-aa flex items-center gap-1">
                {t("checkout.viewDetails", "View details")}
                {sheetOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </p>
            </div>
          </button>
          {step === "stay" && (
            <button
              type="button"
              onClick={submitEmail}
              disabled={!isValidEmail(email) || quoteStale || datesUnavailable}
              className="btn-primary flex-1 max-w-[220px] disabled:opacity-40"
            >
              {t("booking.continue", "Continue")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
