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
  Clock3,
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
import { cancellationPolicyText, freeCancellationDeadline } from "@/lib/cancellation";
import { IMAGES, optimizeGuestyImage } from "@/lib/images";
import { isValidEmail, isValidPhone } from "@/lib/validation";
import { pushDL, pushEcommerce } from "@/lib/datalayer";
import { stashThankYou } from "@/lib/booking-api";
import AvailabilityCalendar, { type AvailabilityDay } from "@/components/booking/AvailabilityCalendar";
import CustomizeStep, { extraAmount, type CatalogExtra, type ExtraSelection } from "./CustomizeStep";
import FlexBlock, { type FlexConfig } from "./FlexBlock";
import CheckoutPaymentForm from "@/components/booking/CheckoutPaymentForm";
import PhoneInput from "@/components/booking/PhoneInput";

type Step = "stay" | "customize" | "pay";

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

/**
 * Design/demo mode: /checkout/demo renders the full checkout with mock data,
 * no server round-trips and no possible charge (the fake quoteId fails the
 * server's 24-hex validation). Used for UX iteration and stakeholder review.
 */
function buildDemoIntent(): any {
  const d = (offset: number) => {
    const x = new Date();
    x.setDate(x.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  };
  return {
    id: "demo",
    listingId: "demo-listing",
    propertyName: "Abreu Retreat Palace – Luxury, Elegance & Leisure",
    propertySlug: "abreu-retreat-palace-luxury-elegance-leisure-e914e2",
    destination: "minho",
    guestyQuoteId: "demo",
    checkIn: d(30),
    checkOut: d(35),
    guests: 4,
    ratePlanId: "demo-flex",
    email: "",
    guestFirstName: "",
    guestLastName: "",
    guestPhone: "",
    nif: "",
    quote: {
      nightlyRate: 500,
      totalNights: 2500,
      cleaningFee: 200,
      taxesAndFees: 0,
      total: 2700,
      nights: 5,
      currency: "EUR",
      quoteCreatedAt: Date.now(),
      ratePlanOptions: [
        { ratePlanId: "demo-flex", name: "Flexible", total: 2700, nightlyRate: 500, cleaningFee: 200, taxesAndFees: 0, cancellationPolicy: ["moderate"] },
        { ratePlanId: "demo-nr", name: "Non-refundable", total: 2430, nightlyRate: 446, cleaningFee: 200, taxesAndFees: 0, cancellationPolicy: ["super_strict"] },
      ],
    },
    extras: [],
    flex: false,
    status: "draft",
    locale: null,
    reservationId: null,
    confirmationCode: null,
    expiresAt: new Date(Date.now() + QUOTE_EXPIRY_MS),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Animated count-up for money totals (spec §9: "total com contagem animada"). */
function useCountUp(value: number, duration = 400): number {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const from = prevRef.current;
    if (from === value) return;
    prevRef.current = value;
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

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

  const isDemo = intentId === "demo";
  const demoIntent = useMemo(() => (isDemo ? buildDemoIntent() : null), [isDemo]);

  const intentQuery = trpc.checkout.getIntent.useQuery(
    { intentId: intentId ?? "" },
    { enabled: !!intentId && !isDemo, refetchOnWindowFocus: false, retry: 1 },
  );
  const updateIntent = trpc.checkout.updateIntent.useMutation();
  const captureLead = trpc.checkout.captureLead.useMutation();

  const intent = isDemo ? demoIntent : (intentQuery.data?.intent ?? null);

  /** Patch the server intent AND the React Query cache in lockstep — otherwise a
   *  remount within staleTime re-seeds the page from pre-edit data (stale quote). */
  const syncIntent = useCallback(
    (patch: Record<string, unknown>) => {
      if (!intentId || isDemo) return;
      utils.checkout.getIntent.setData({ intentId }, (prev) =>
        prev?.intent ? { ...prev, intent: { ...prev.intent, ...patch } as typeof prev.intent } : prev,
      );
      updateIntent.mutate({ intentId, patch: patch as any });
    },
    [intentId, isDemo, utils, updateIntent],
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
  const [extraSel, setExtraSel] = useState<Record<string, ExtraSelection>>({});
  const [flexSelected, setFlexSelected] = useState(false);

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
    if (intent.flex) setFlexSelected(true);
    if (Array.isArray(intent.extras)) {
      const seeded: Record<string, ExtraSelection> = {};
      for (const e of intent.extras as Array<Record<string, unknown>>) {
        if (typeof e?.sku === "string") {
          seeded[e.sku] = {
            qty: typeof e.qty === "number" ? e.qty : undefined,
            people: typeof e.people === "number" ? e.people : undefined,
            sessions: typeof e.sessions === "number" ? e.sessions : undefined,
            days: typeof e.days === "number" ? e.days : undefined,
          };
        }
      }
      setExtraSel(seeded);
    }
    if (resumed && !isDemo) {
      pushDL({ event: "checkout_resume", property_id: intent.listingId });
      if (intent.status === "contact_captured") setStep("customize");
      if (intent.status === "payment_pending") setStep("pay");
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

  // ── Extras catalog (Fase 2 — Personalizar) ──
  const extrasQuery = trpc.checkout.getExtras.useQuery(undefined, { staleTime: 60 * 60 * 1000 });
  const catalog: CatalogExtra[] = (extrasQuery.data?.extras as CatalogExtra[]) ?? [];
  const flexConfig: FlexConfig | null = (extrasQuery.data as any)?.flex ?? null;

  // Animated money totals (spec §9)
  const animatedTotal = useCountUp(effective?.total ?? 0);

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
    if (!isDemo) {
      captureLead
        .mutateAsync({ intentId: intent.id, email, locale: lang })
        .catch(() => {/* fail-soft: the step advance below never blocks on persistence */});
    }
    utils.checkout.getIntent.setData({ intentId: intent.id }, (prev) =>
      prev?.intent ? { ...prev, intent: { ...prev.intent, email } } : prev,
    );
    if (!contactFiredRef.current && !isDemo) {
      contactFiredRef.current = true;
      pushDL({ event: "add_contact_info", property_id: intent.listingId, source: "checkout_v2" });
    }
    setStep("customize");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [intent, email, lang, captureLead, utils, isDemo]);

  // ── Extras handlers (Fase 2) ──
  const toggleExtra = useCallback(
    (item: CatalogExtra) => {
      setExtraSel((prev) => {
        const next = { ...prev };
        const adding = !(item.sku in next);
        if (adding) {
          next[item.sku] =
            item.pricingModel === "per_day"
              ? { days: Math.max(1, quote?.nights ?? 1) }
              : item.pricingModel === "per_person"
                ? { people: Math.max(item.minPeople ?? 1, Math.min(guests, 30)) }
                : item.pricingModel === "per_person_per_unit"
                  ? { people: 1, sessions: 1 }
                  : item.pricingModel === "per_unit"
                    ? { qty: item.minQty ?? 1 }
                    : {};
        } else {
          delete next[item.sku];
        }
        const amount = adding ? extraAmount(item, next[item.sku] ?? {}) : extraAmount(item, prev[item.sku] ?? {});
        pushEcommerce({
          event: adding ? "add_to_cart" : "remove_from_cart",
          property_id: intent?.listingId,
          ecommerce: {
            currency: "EUR",
            value: amount ?? 0,
            items: [{ item_id: item.sku, item_name: item.sku, item_category: "extra", item_category2: item.category, price: item.unitPrice ?? 0, quantity: 1 }],
          },
        });
        return next;
      });
    },
    [guests, quote?.nights, intent?.listingId],
  );
  const adjustExtra = useCallback((sku: string, patch: ExtraSelection) => {
    setExtraSel((prev) => ({ ...prev, [sku]: { ...prev[sku], ...patch } }));
  }, []);

  const selectedExtras = useMemo(() => {
    return Object.entries(extraSel)
      .map(([sku, sel]) => {
        const item = catalog.find((c) => c.sku === sku);
        if (!item) return null;
        return { item, sel, amount: extraAmount(item, sel) };
      })
      .filter(Boolean) as Array<{ item: CatalogExtra; sel: ExtraSelection; amount: number | null }>;
  }, [extraSel, catalog]);
  const extrasTotal = useMemo(
    () => selectedExtras.reduce((sum, e) => sum + (e.amount ?? 0), 0),
    [selectedExtras],
  );

  // Flex contextual copy inputs: which rate family is selected + the concrete
  // free-cancellation date of the CURRENT selection (coherence with the policy)
  const selectedPlanOption = quote?.ratePlanOptions?.find((o) => o.ratePlanId === selectedRatePlanId);
  const nonRefundableSelected = selectedPlanOption ? isNonRefundableOption(selectedPlanOption) : false;
  const freeCancelUntil = freeCancellationDeadline(
    selectedPlanOption?.cancellationPolicy?.[0],
    checkIn,
  );

  /** Customize → Pay: persist the selection and flip the intent to payment_pending */
  const continueToPay = useCallback(() => {
    if (!intent) return;
    syncIntent({
      status: "payment_pending",
      flex: flexSelected,
      extras: selectedExtras.map(({ item, sel, amount }) => ({
        sku: item.sku,
        qty: sel.qty,
        people: sel.people,
        sessions: sel.sessions,
        days: sel.days,
        amount,
        fulfillment: item.fulfillment,
      })),
    });
    setStep("pay");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [intent, selectedExtras, flexSelected, syncIntent]);

  /** Ops manifest (PT, staff-facing) appended to the Guesty reservation notes —
   *  same pattern the legacy widget uses, so operations see the requests. */
  const extrasNote = useMemo(() => {
    if (!selectedExtras.length) return "";
    const lines = selectedExtras.map(({ item, sel, amount }) => {
      const parts = [
        `- ${item.sku}`,
        sel.qty ? `x${sel.qty}` : "",
        sel.days ? `${sel.days} dias` : "",
        sel.people ? `${sel.people} pessoas` : "",
        sel.sessions ? `${sel.sessions} sessões` : "",
        amount != null ? `≈ ${amount} EUR` : "(sob pedido)",
        item.fulfillment === "needs_confirmation" ? "[CONFIRMAR 24H]" : "",
      ].filter(Boolean);
      return parts.join(" ");
    });
    return `\n\n⚠️ EXTRAS PEDIDOS NO CHECKOUT (confirmar e cobrar após confirmação):\n${lines.join("\n")}`;
  }, [selectedExtras]);

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
    { key: "customize", label: t("checkout.stepCustomize", "Personalize") },
    { key: "pay", label: t("checkout.stepPay", "Payment") },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  // ── Loading / not-found states ──
  if (intentQuery.isLoading && !isDemo) {
    return (
      <div className="min-h-screen bg-pa-cream">
        <div className="sticky top-0 bg-white/95 border-b border-pa-sand h-[60px]" />
        <div className="max-w-[1100px] mx-auto px-4 pt-8 lg:grid lg:grid-cols-[minmax(0,640px)_380px] lg:gap-12">
          <div className="space-y-5">
            <div className="skeleton-shimmer h-8 w-56 rounded" />
            <div className="skeleton-shimmer h-[110px] w-full rounded-lg" />
            <div className="skeleton-shimmer h-[72px] w-full rounded-lg" />
            <div className="skeleton-shimmer h-[72px] w-full rounded-lg" />
            <div className="skeleton-shimmer h-[170px] w-full rounded-lg" />
          </div>
          <div className="hidden lg:block">
            <div className="skeleton-shimmer w-full rounded-lg" style={{ aspectRatio: "4/3" }} />
            <div className="skeleton-shimmer h-[140px] w-full rounded-lg mt-3" />
          </div>
        </div>
        <p className="sr-only">{t("checkout.loading", "Preparing your checkout…")}</p>
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
        <span className="text-[20px] font-light text-pa-dark tabular-nums">{formatEur(animatedTotal, lang)}</span>
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
          <p className="font-display text-[18px] text-pa-dark leading-snug">{displayName}</p>
          {intent.destination && <p className="text-[11px] tracking-[0.08em] uppercase text-pa-stone-aa mt-1">{intent.destination}</p>}
        </div>
        <div className="text-[12.5px] text-pa-earth">
          {formatBookingDate(checkIn, lang, true)} → {formatBookingDate(checkOut, lang, true)} · {guests} {t("booking.guestsLabel", "guests")}
        </div>
        {summaryLines}
        {flexSelected && flexConfig && (
          <div className="border-t border-pa-sand pt-3 flex justify-between text-[12.5px] checkout-row-in">
            <span className="text-pa-gold font-medium">{t("checkout.flex.title", "Flex — guaranteed rebooking")}</span>
            <span className="text-pa-dark tabular-nums">{formatEur(flexConfig.price, lang)}</span>
          </div>
        )}
        {selectedExtras.length > 0 && (
          <div className="border-t border-pa-sand pt-3 space-y-1.5">
            <p className="text-[10px] tracking-[0.12em] uppercase text-pa-stone-aa">
              {t("checkout.extrasSummary", "Extras — confirmed by your concierge")}
            </p>
            {selectedExtras.map(({ item, amount }) => (
              <div key={item.sku} className="flex justify-between text-[12.5px] checkout-row-in">
                <span className="text-pa-earth">{t(`checkout.extras.${item.sku}.name`)}</span>
                <span className="text-pa-dark tabular-nums">
                  {amount != null ? formatEur(amount, lang) : t("checkout.onRequestShort", "on request")}
                </span>
              </div>
            ))}
            {(extrasTotal > 0 || flexSelected) && (
              <p className="text-[10.5px] text-pa-stone-aa leading-snug pt-0.5">
                {t("checkout.extrasChargedLater", "Charged after concierge confirmation — not included in today's payment.")}
              </p>
            )}
          </div>
        )}
        {effective?.cancellationPolicy?.[0] && (
          <p className="text-[11px] text-pa-stone-aa leading-snug">
            {cancellationPolicyText(effective.cancellationPolicy[0], checkIn, t, lang)}
          </p>
        )}
        {guaranteeLabel && (
          <p className="flex items-start gap-1.5 text-[11px] text-pa-gold leading-snug">
            <Clock3 className="w-3 h-3 shrink-0 mt-[1px]" /> {guaranteeLabel}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="checkout-page min-h-screen bg-pa-cream pb-28 lg:pb-12">
      {/* Discreet motion (spec §9): 200ms step transitions, rows sliding toward the summary */}
      <style>{`
        /* The global 44px touch-target rule inflates radios/checkboxes — scope them back */
        .checkout-page input[type="radio"],
        .checkout-page input[type="checkbox"] {
          min-height: 16px; min-width: 16px; height: 16px; width: 16px;
        }
        @keyframes checkoutStepIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .checkout-step-in { animation: checkoutStepIn 220ms ease-out; }
        @keyframes checkoutRowIn { from { opacity: 0; transform: translateX(-6px); } to { opacity: 1; transform: none; } }
        .checkout-row-in { animation: checkoutRowIn 200ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .checkout-step-in, .checkout-row-in { animation: none; }
        }
      `}</style>
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
                      "text-[11px] tracking-[0.06em] uppercase",
                      i === stepIndex ? "inline text-pa-dark font-medium" : "hidden sm:inline text-pa-stone-aa",
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
        <section key={step} className="space-y-6 checkout-step-in">
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
                  {(() => { const maxTotal = Math.max(...quote!.ratePlanOptions!.map(o => o.total)); return quote!.ratePlanOptions!.map((opt) => {
                    const isSelected = selectedRatePlanId === opt.ratePlanId;
                    const nonRef = isNonRefundableOption(opt);
                    const label = nonRef ? t("booking.nonRefundable") : t("booking.flexibleRate");
                    const savings = maxTotal - opt.total;
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
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[13.5px] text-pa-dark font-medium">{label}</p>
                            {!nonRef && (
                              <span className="text-[9px] font-medium tracking-wider uppercase px-1.5 py-0.5 bg-pa-warm text-pa-gold border border-pa-sand rounded-sm">
                                {t("bookingWidget.recommended", "Recommended")}
                              </span>
                            )}
                          </div>
                          <p className={cn("text-[11px] mt-0.5", nonRef ? "text-red-500/80" : "text-pa-earth")}>
                            {nonRef
                              ? t("bookingWidget.nonRefundableWarning", "No refund if you cancel or modify")
                              : policyLine}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-[14.5px] text-pa-dark font-medium tabular-nums">
                            {formatEur(opt.total, lang)}
                          </span>
                          {savings > 0 && (
                            <p className="text-[10px] text-green-700 font-medium mt-0.5">
                              {t("bookingWidget.save", "Save")} {formatEur(savings, lang)}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  }); })()}
                </div>
              )}

              {/* Price breakdown */}
              {effective && (
                <div className="bg-white border border-pa-sand rounded-lg p-5">{summaryLines}</div>
              )}

              {/* Email capture */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-3">
                <h2 className="font-display text-[19px] text-pa-dark leading-snug">
                  {t("checkout.emailTitle", "Where should we send your booking?")}
                </h2>
                <label htmlFor="checkout-email" className="block text-[12px] font-medium text-pa-earth">
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

          {/* ── PASSO 2: PERSONALIZAR (Fase 2) ── */}
          {step === "customize" && (
            <>
              <div>
                <button
                  type="button"
                  onClick={() => setStep("stay")}
                  className="text-[12px] text-pa-stone-aa hover:text-pa-dark transition-colors mb-3"
                >
                  ← {t("checkout.backToStay", "Back to your stay")}
                </button>
                <h1 className="headline-md text-pa-dark mb-1">{t("checkout.customizeTitle", "Personalize your stay")}</h1>
                <p className="body-sm">{t("checkout.customizeSubtitle", "Add services and experiences — or continue as is. Nothing is pre-selected.")}</p>
              </div>
              {extrasQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 text-[12px] text-pa-stone-aa">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("checkout.loading", "Preparing your checkout…")}
                </div>
              ) : (
                <CustomizeStep
                  catalog={catalog}
                  selection={extraSel}
                  nights={quote?.nights ?? 1}
                  guests={guests}
                  lang={lang}
                  onToggle={toggleExtra}
                  onAdjust={adjustExtra}
                />
              )}
              {/* Flex closes the Personalizar step (spec §5/§6) — protection, not a service */}
              {flexConfig && effective && (
                <FlexBlock
                  config={flexConfig}
                  selected={flexSelected}
                  stayTotal={effective.total}
                  nonRefundableSelected={nonRefundableSelected}
                  freeCancelUntil={freeCancelUntil}
                  lang={lang}
                  listingId={intent.listingId}
                  demo={isDemo}
                  onToggle={(next) => {
                    setFlexSelected(next);
                    syncIntent({ flex: next });
                  }}
                />
              )}
              <button type="button" onClick={continueToPay} className="btn-primary w-full">
                {selectedExtras.length > 0
                  ? t("checkout.continueWithExtras", { count: selectedExtras.length })
                  : t("checkout.continueWithoutExtras", "Continue without extras")}
              </button>
            </>
          )}

          {/* ── PASSO PAGAMENTO ── */}
          {step === "pay" && (
            <>
              <div>
                <button
                  type="button"
                  onClick={() => setStep("customize")}
                  className="text-[12px] text-pa-stone-aa hover:text-pa-dark transition-colors mb-3"
                >
                  ← {t("checkout.backToCustomize", "Back to personalization")}
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
                    notes={extrasNote || undefined}
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
          <div className="max-h-[60vh] overflow-y-auto bg-white border-t border-pa-sand px-5 pt-4 pb-3 shadow-[0_-8px_32px_rgba(26,26,24,0.10)] space-y-4 checkout-step-in">
            <div className="flex items-center gap-3">
              {heroImage && (
                <img src={heroImage} alt="" className="w-14 h-14 rounded-md object-cover shrink-0" width={56} height={56} />
              )}
              <div className="min-w-0">
                <p className="font-display text-[15px] text-pa-dark leading-snug truncate">{displayName}</p>
                <p className="text-[11.5px] text-pa-earth mt-0.5">
                  {formatBookingDate(checkIn, lang)} → {formatBookingDate(checkOut, lang)} · {guests} {t("booking.guestsLabel", "guests")}
                </p>
              </div>
            </div>
            {summaryLines}
            {flexSelected && flexConfig && (
              <div className="border-t border-pa-sand pt-3 flex justify-between text-[12.5px]">
                <span className="text-pa-gold font-medium">{t("checkout.flex.title", "Flex — guaranteed rebooking")}</span>
                <span className="text-pa-dark tabular-nums">{formatEur(flexConfig.price, lang)}</span>
              </div>
            )}
            {selectedExtras.length > 0 && (
              <div className="border-t border-pa-sand pt-3 space-y-1.5">
                <p className="text-[10px] tracking-[0.12em] uppercase text-pa-stone-aa">
                  {t("checkout.extrasSummary", "Extras — confirmed by your concierge")}
                </p>
                {selectedExtras.map(({ item, amount }) => (
                  <div key={item.sku} className="flex justify-between text-[12.5px]">
                    <span className="text-pa-earth">{t(`checkout.extras.${item.sku}.name`)}</span>
                    <span className="text-pa-dark tabular-nums">
                      {amount != null ? formatEur(amount, lang) : t("checkout.onRequestShort", "on request")}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {guaranteeLabel && (
              <p className="flex items-start gap-1.5 text-[11px] text-pa-gold leading-snug">
                <Clock3 className="w-3 h-3 shrink-0 mt-[1px]" /> {guaranteeLabel}
              </p>
            )}
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
                {effective ? formatEur(animatedTotal, lang) : "—"}
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
          {step === "customize" && (
            <button type="button" onClick={continueToPay} className="btn-primary flex-1 max-w-[220px]">
              {t("booking.continue", "Continue")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
