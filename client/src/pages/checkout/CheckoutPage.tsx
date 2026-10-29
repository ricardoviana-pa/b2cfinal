import { effectiveQuote, type CheckoutQuoteSnapshot } from "@/lib/checkoutQuote";
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
  Pencil,
  Minus,
  Plus,
  ChevronUp,
  ChevronDown,
  Tag,
  MessageCircle,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { usePageMeta } from "@/hooks/usePageMeta";
import { useVisitOriginSync } from "@/hooks/useVisitOriginSync";
import { formatQuotedEur, formatBookingDate, intlLocale, sanitizePropertyName } from "@/lib/format";
import { freeCancellationDeadline, isNonRefundablePlan, planPolicyCode, rateKind } from "@/lib/cancellation";
import { freeCancellationDays } from "@shared/cancellationPolicy";
import CancellationPolicyLine from "@/components/booking/CancellationPolicyLine";
import { hasVerifiedRefundAdvantage } from "@/lib/ratePlanRecommendation";
import { IMAGES, optimizeGuestyImage } from "@/lib/images";
import { isValidEmail, isValidPhone } from "@/lib/validation";
import { phoneIssue, phoneIssueMessage } from "@/lib/phone";
import { consentChecked, consentToSend, stayContinueAction } from "@/lib/checkoutStay";
import { flexAddsValue, flexExtraDays, flexPriceForPlan } from "@shared/flexValue";
import { conciergeWhatsAppHref, guestDetailsIssues, walletsUnlocked, type GuestField } from "@/lib/checkoutPayment";
import { checkTaxId, normalizeTaxId } from "@/lib/taxId";
import { pushDL, pushEcommerce, buildPropertyItem } from "@/lib/datalayer";
import { stashThankYou } from "@/lib/booking-api";
import AvailabilityCalendar, { type AvailabilityDay } from "@/components/booking/AvailabilityCalendar";
import CustomizeStep, {
  extraAmount,
  receptionAmount,
  type CatalogExtra,
  type ExtraSelection,
  type ReceptionConfig,
  type ReceptionChoice,
} from "./CustomizeStep";
import FlexBlock, { type FlexConfig } from "./FlexBlock";
import { MandateConsent, PaymentPlanSelector, planDate, type PaymentPlanChoice, type PaymentPlanOffer } from "./PaymentPlanSelector";
import CheckoutPaymentForm from "@/components/booking/CheckoutPaymentForm";
import PhoneInput from "@/components/booking/PhoneInput";
import PaymentMethodsNote from "@/components/booking/PaymentMethodsNote";
import TwoPartsHint from "@/components/booking/TwoPartsHint";

type Step = "stay" | "customize" | "pay";

/** Quote snapshot mirrored from the intent (euro floats, same shape as the server json column) */
type QuoteSnapshot = CheckoutQuoteSnapshot;

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
    reception: null,
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
      setDisplay(p === 1 ? value : Math.round((from + (value - from) * eased) * 100) / 100);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return display;
}

/** Máximo 2 tarifas visíveis: a reembolsável e a não reembolsável mais baratas.
 *  A tarifa reembolsável mais cara só se oferece enquanto o cancelamento
 *  gratuito do seu código Guesty ainda estiver aberto (7/14/30/60 dias antes
 *  da chegada, shared/cancellationPolicy.ts) — depois, ambas cobram a estadia
 *  toda. Códigos desconhecidos ficam (benefício da dúvida). */
function flexStillRefundable(o: { cancellationPolicy?: string[] }, checkIn?: string): boolean {
  if (!checkIn || freeCancellationDays(o.cancellationPolicy) == null) return true;
  return freeCancellationDeadline(o.cancellationPolicy, checkIn) != null;
}

function collapseRatePlans<T extends { name: string; total: number; cancellationPolicy?: string[] }>(
  options?: T[],
  checkIn?: string,
): T[] | undefined {
  if (!options || !options.length) return options;
  const cheapest = (arr: T[]) => [...arr].sort((a, b) => a.total - b.total)[0];
  const nonRef = options.filter((o) => isNonRefundableOption(o));
  const flex = options.filter((o) => !isNonRefundableOption(o) && flexStillRefundable(o, checkIn));
  const out: T[] = [];
  if (flex.length) out.push(cheapest(flex));
  if (nonRef.length) out.push(cheapest(nonRef));
  return out.length ? out : [cheapest(options)];
}

function isNonRefundableOption(o: { name: string; cancellationPolicy?: string[] }): boolean {
  return isNonRefundablePlan(o);
}

/** Campos do passo do pagamento que recebem o foco quando falta algo ao pagar. */
const GUEST_FIELD_IDS: Record<GuestField, string> = {
  firstName: "checkout-first-name",
  lastName: "checkout-last-name",
  email: "checkout-pay-email",
  phone: "checkout-phone",
};

/** Leva o hóspede a um campo ou caixa: scroll até ao meio do ecrã e foco. */
function focusField(id: string) {
  const el = typeof document !== "undefined" ? document.getElementById(id) : null;
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}

const INPUT_CLASS =
  "w-full h-[48px] border bg-white px-3 rounded-md body-sm text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none";

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
  const [saveIssue, setSaveIssue] = useState(false);
  const updateIntent = trpc.checkout.updateIntent.useMutation({
    onError: () => setSaveIssue(true),
    // ok:false (BD em baixo, intent pago, etc.) é uma gravação FALHADA — antes
    // limpava o aviso e o "Saved automatically" mentia (auditoria set/2026)
    onSuccess: (r) => setSaveIssue(!(r as { ok?: boolean } | undefined)?.ok),
  });
  const captureLead = trpc.checkout.captureLead.useMutation();

  const intent = isDemo ? demoIntent : (intentQuery.data?.intent ?? null);
  // Origem da visita: link de recuperação com UTM, ou consentimento mudado aqui
  useVisitOriginSync(isDemo ? undefined : intentId, !!intent, intent?.status === "paid");

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
  // Latest quote for callbacks that do not list `quote` as a dependency (requote reads the live code).
  const quoteRef = useRef<QuoteSnapshot | null>(null);
  quoteRef.current = quote;
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [contactSaveError, setContactSaveError] = useState(false);
  const contactSavingRef = useRef(false);
  // Consentimento de marketing — por omissão desligado (RGPD: opt-in tem de
  // ser um acto afirmativo). Sem ele o email só serve a recuperação
  // transacional do checkout; com ele o lead entra no segmento da newsletter.
  const [newsletterOptIn, setNewsletterOptIn] = useState(false);
  // Auditoria do funil (n.º 2, crítico): a caixa nunca era reposta e um
  // segundo Continuar mandava consent:false, retirando o hóspede da lista sem
  // ele mexer. Agora vem do servidor e só se envia o que é conhecido — e o
  // valor reposto só vale para o email para o qual foi lido (revisão do PR
  // #176: trocar o email no passo 1 não pode levar o consentimento de outro).
  const [newsletterTouched, setNewsletterTouched] = useState(false);
  const [consentRestoredFor, setConsentRestoredFor] = useState<string | null>(null);
  // "Continuar" sem email válido: o campo recebe o foco e a dica fica em evidência
  const [emailNudge, setEmailNudge] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [nif, setNif] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  // Passo do pagamento (auditoria do funil, n.º 1 e 11): os erros dos dados do
  // hóspede só aparecem depois de um clique em Pagar; o email do passo 1 é uma
  // linha "Confirmação para … · alterar" até o hóspede o querer mudar.
  const [showGuestErrors, setShowGuestErrors] = useState(false);
  const [emailEditing, setEmailEditing] = useState(false);
  const [editingStay, setEditingStay] = useState(false);
  // Datas a meio de mudar: o calendário precisa de mostrar a nova entrada antes
  // de haver saída (sem isto, escolher uma entrada que não servia a saída antiga
  // não fazia nada — 10 out 2026). Só vira requote quando a estadia fecha.
  const [stayDraft, setStayDraft] = useState<{ checkIn: string; checkOut: string } | null>(null);
  const [requoting, setRequoting] = useState(false);
  const [quoteStale, setQuoteStale] = useState(false);
  const [datesUnavailable, setDatesUnavailable] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const contactFiredRef = useRef(false);
  const [extraSel, setExtraSel] = useState<Record<string, ExtraSelection>>({});
  const [flexSelected, setFlexSelected] = useState(false);
  const [receptionChoice, setReceptionChoice] = useState<ReceptionChoice>(null);
  const [receptionNudge, setReceptionNudge] = useState(false);
  // Código promocional (cupões do Revenue Management do Guesty — 12 jul)
  const [couponOpen, setCouponOpen] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState(false);
  /** M14: código que deixou de se aplicar depois de mudar datas — nota visível */
  const [couponDropped, setCouponDropped] = useState<string | null>(null);
  const applyCouponMut = trpc.booking.applyCoupon.useMutation();

  // Visitante que clicou na PromoBar (announcement bar): o código ficou em
  // localStorage — pré-preenche e abre o campo para o Apply ser um toque.
  useEffect(() => {
    if (!intent || intent.quote?.couponCode) return;
    try {
      const saved = localStorage.getItem("pa_promo_code");
      if (saved && !couponInput) {
        setCouponInput(saved.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40));
        setCouponOpen(true);
      }
    } catch { /* storage indisponível */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.id]);

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
    // Consentimento de marketing tal como o hóspede o deixou (null = não se
    // sabe), lido para o email do intent e só válido para esse email
    const savedConsent = (intentQuery.data as { newsletterOptIn?: boolean | null } | undefined)?.newsletterOptIn;
    if (typeof savedConsent === "boolean" && intent.email) {
      setNewsletterOptIn(savedConsent);
      setConsentRestoredFor(intent.email);
    }
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
    if (intent.reception?.type) setReceptionChoice(intent.reception as ReceptionChoice);
    if (intent.quote?.couponCode) setCouponInput(String(intent.quote.couponCode));
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
    // O passo restaura SEMPRE do estado do intent — um refresh não pode
    // atirar o hóspede para o início (bug 12 jul). O evento checkout_resume
    // continua a disparar só em retoma real (outro dispositivo/sessão).
    if (intent.status === "contact_captured") setStep("customize");
    if (intent.status === "payment_pending") setStep("pay");
    if (resumed && !isDemo) {
      pushDL({ event: "checkout_resume", property_id: intent.listingId });
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

  // H7 (auditoria set/2026): a expiração era avaliada só no load — quem ficava
  // na página via o erro ao clicar Pagar. Um timer acende o banner de refresh
  // no MOMENTO em que a quote morre.
  useEffect(() => {
    const expMs = intent?.expiresAt ? new Date(intent.expiresAt as any).getTime() : NaN;
    if (!Number.isFinite(expMs)) return;
    const delta = expMs - Date.now();
    if (delta <= 0) { setQuoteStale(true); return; }
    const tm = window.setTimeout(() => setQuoteStale(true), Math.min(delta, 2 ** 31 - 1));
    return () => window.clearTimeout(tm);
  }, [intent?.expiresAt]);

  // ── Derived pricing (selected rate plan overlays the base quote; lib/checkoutQuote.ts) ──
  const effective = useMemo(() => effectiveQuote(quote, selectedRatePlanId), [quote, selectedRatePlanId]);

  // ── Extras catalog (Fase 2 — Personalizar), curado no servidor pelo contexto ──
  const checkInMonth = checkIn ? Number(checkIn.slice(5, 7)) : undefined;
  const extrasQuery = trpc.checkout.getExtras.useQuery(
    {
      listingId: intent?.listingId ?? undefined,
      destination: intent?.destination ?? undefined,
      nights: quote?.nights ?? 1,
      guests,
      month: checkInMonth,
    },
    { staleTime: 30 * 60 * 1000, enabled: !!intent },
  );
  const catalog: CatalogExtra[] = (extrasQuery.data?.extras as CatalogExtra[]) ?? [];

  // Modo apresentação do demo (?case=full[&step=pay]): pré-carrega o caso
  // completo de add-ons para revisão da equipa e capturas — só no demo.
  const caseSeeded = useRef(false);
  useEffect(() => {
    if (!isDemo || caseSeeded.current || !extrasQuery.data) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("case") !== "full") return;
    caseSeeded.current = true;
    setReceptionChoice({ type: "hosted", late: true });
    setExtraSel({
      "transfer-porto": { qty: 1 },
      "grocery-setup": { qty: 1 },
      "daily-cleaning": { qty: 3 },
      "breakfast-box": { people: 4, days: 5 },
      "pet-fee": { qty: 2 },
      "travel-crib": { qty: 1 },
      "private-chef": { people: 4 },
      "exp-canyoning": {},
    });
    setFlexSelected(true);
    setStep(params.get("step") === "pay" ? "pay" : "customize");
  }, [isDemo, extrasQuery.data]);
  const flexConfig: FlexConfig | null = (extrasQuery.data as any)?.flex ?? null;
  const receptionConfig: ReceptionConfig | null = (extrasQuery.data as any)?.reception ?? null;
  // C6: campo de promo vazio convida a sair à procura de códigos — só com campanha ativa
  const promoEnabled: boolean = (extrasQuery.data as any)?.promoEnabled ?? false;
  const includedKeys: string[] = (extrasQuery.data as any)?.included ?? [];

  // ── Property (photo + slug for the back link) ──
  const propertyQuery = trpc.properties.getBySlugForSite.useQuery(
    { slug: intent?.propertySlug ?? "" },
    { enabled: !!intent?.propertySlug, staleTime: 60 * 60 * 1000 },
  );
  const property = propertyQuery.data as any;
  const heroImage = property?.images?.[0]
    ? optimizeGuestyImage(property.images[0], 800)
    : undefined;
  // Miniatura do telemóvel (48-56 px; 160 px chega para ecrãs 3x)
  const thumbImage = property?.images?.[0]
    ? optimizeGuestyImage(property.images[0], 160)
    : undefined;
  const displayName = sanitizePropertyName(intent?.propertyName || property?.name || "");
  const backParams = new URLSearchParams();
  if (checkIn) backParams.set('checkin', checkIn);
  if (checkOut) backParams.set('checkout', checkOut);
  if (guests) backParams.set('guests', String(guests));
  const backHref = intent?.propertySlug ? `/homes/${intent.propertySlug}?${backParams}` : "/homes";

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
          // Colapsa a 2 tarifas (1 flexível + 1 não reembolsável, as mais
          // baratas de cada balde) — o Guesty pode devolver variantes
          // duplicadas e o requote mostrava-as todas (bug 12 jul)
          ratePlanOptions: collapseRatePlans((d as any).ratePlanOptions, ci),
        };
        // AUDIT A3: menos noites → clamp dos dias selecionados nos extras
        setExtraSel((prev) => {
          const next: typeof prev = {};
          for (const [sku, sel] of Object.entries(prev)) {
            next[sku] = sel.days ? { ...sel, days: Math.min(sel.days, Math.max(1, fresh.nights)) } : sel;
          }
          return next;
        });
        // AUDIT A4: estadia caiu abaixo do limiar do Flex → desmarcar (o bloco
        // desaparece e deixava o valor preso no total sem forma de o tirar)
        if (flexConfig && fresh.total < flexConfig.minTotal && flexSelected) {
          setFlexSelected(false);
          syncIntent({ flex: false });
        }
        // AUDIT A5: o cupão vivia na quote antiga — re-aplicar na nova; se o
        // código já não for válido, o campo reaparece em vez de fingir desconto.
        // The re-apply is awaited BEFORE the screen and the intent change: setting the undiscounted
        // quote first let the two answers cross, so the page showed the full price while Guesty held
        // the discount and the payment check refused the mismatch (production, 23 Sep 2026).
        let next: QuoteSnapshot = fresh;
        const prevCoupon = quoteRef.current?.couponCode;
        if (prevCoupon) {
          const dropCoupon = () => {
            // M14 (auditoria set/2026): o desconto caía em silêncio — o
            // campo reabre com o código e uma nota diz porquê.
            setCouponDropped(prevCoupon);
            setCouponInput(prevCoupon);
            setCouponOpen(true);
          };
          try {
            const r = await applyCouponMut.mutateAsync({
              quoteId: liveQuoteId,
              listingId: intent.listingId,
              checkIn: ci,
              checkOut: co,
              coupon: prevCoupon,
            });
            if (r.ok) {
              setCouponDropped(null);
              next = {
                ...fresh,
                nightlyRate: r.pricing.nightlyRate,
                totalNights: r.pricing.totalNights,
                cleaningFee: r.pricing.cleaningFee,
                taxesAndFees: r.pricing.taxesAndFees ?? 0,
                total: r.total,
                couponCode: r.coupons?.[0]?.code || undefined,
                ratePlanOptions: collapseRatePlans(r.ratePlanOptions as any, ci),
              };
            } else {
              dropCoupon();
            }
          } catch {
            dropCoupon();
          }
        }
        // Re-resolve the plan selection on the quote that will be shown
        const planStill = next.ratePlanOptions?.find((o) => o.ratePlanId === selectedRatePlanId);
        const planNext = planStill?.ratePlanId ?? (d as any).ratePlanId ?? next.ratePlanOptions?.[0]?.ratePlanId ?? null;
        setQuote(next);
        setQuoteId(liveQuoteId);
        setSelectedRatePlanId(planNext);
        setCheckIn(ci);
        setCheckOut(co);
        setGuests(g);
        setQuoteStale(false);
        syncIntent({
          checkIn: ci,
          checkOut: co,
          guests: g,
          guestyQuoteId: liveQuoteId,
          ratePlanId: planNext ?? undefined,
          quote: next,
        });
      } catch {
        setDatesUnavailable(true);
      } finally {
        setRequoting(false);
      }
    },
    [intent, selectedRatePlanId, syncIntent, utils, applyCouponMut],
  );

  /** Fecha a edição de datas: re-cota se a estadia mudou e ficou completa. */
  const finishStayEdit = (draft = stayDraft) => {
    if (draft?.checkIn && draft.checkOut && (draft.checkIn !== checkIn || draft.checkOut !== checkOut)) {
      requote(draft.checkIn, draft.checkOut, guests);
    }
    setStayDraft(null);
    setEditingStay(false);
  };

  // ── Step 1 → 2: email capture ──
  const submitEmail = useCallback(async () => {
    setEmailTouched(true);
    if (!intent || !isValidEmail(email) || contactSavingRef.current) return;
    setContactSaveError(false);
    contactSavingRef.current = true;
    try {
      if (!isDemo) {
        const consent = consentToSend({ checked: newsletterOptIn, touched: newsletterTouched, restoredFor: consentRestoredFor, email });
        const saved = await captureLead.mutateAsync({ intentId: intent.id, email, locale: lang, consent });
        if (!saved.ok) throw new Error("Contact not saved");
      }
    } catch {
      setContactSaveError(true);
      return;
    } finally {
      contactSavingRef.current = false;
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
  }, [intent, email, lang, captureLead, utils, isDemo, newsletterOptIn, newsletterTouched, consentRestoredFor]);

  /** O "Continuar" do passo 1 (barra do telemóvel e cartão do email) nunca
   *  fica parado: sem email válido leva ao campo, foca-o e mostra a dica; com
   *  o preço expirado ou as datas ocupadas leva ao aviso que diz o que fazer. */
  const continueFromStay = () => {
    const action = stayContinueAction({
      emailValid: isValidEmail(email),
      quoteStale,
      datesUnavailable,
      saving: captureLead.isPending || contactSavingRef.current,
    });
    if (action === "busy") return;
    setSheetOpen(false);
    if (action === "submit") {
      void submitEmail();
    } else if (action === "focus_email") {
      setEmailTouched(true);
      setEmailNudge(true);
      focusField("checkout-email");
    } else if (action === "refresh_price") {
      focusField("checkout-refresh-price");
    } else {
      focusField("checkout-change-dates");
    }
  };

  /**
   * Aplica/remove o código promocional na quote BE existente (o quoteId
   * mantém-se válido para a reserva). Demo: só DEMO10 funciona, 10 por cento.
   */
  const applyCoupon = useCallback(
    async (code: string) => {
      if (!intent) return;
      setCouponBusy(true);
      setCouponError(false);
      try {
        if (isDemo) {
          if (code && code !== "DEMO10") { setCouponError(true); return; }
          const base = buildDemoIntent().quote as QuoteSnapshot;
          const f = code ? 0.9 : 1;
          const adj = (n: number) => Math.round(n * f);
          setQuote({
            ...base,
            nightlyRate: adj(base.nightlyRate),
            totalNights: adj(base.totalNights),
            total: adj(base.total - base.cleaningFee) + base.cleaningFee,
            couponCode: code || undefined,
            ratePlanOptions: base.ratePlanOptions?.map((o) => ({
              ...o,
              nightlyRate: adj(o.nightlyRate),
              total: adj(o.total - o.cleaningFee) + o.cleaningFee,
            })),
          });
          if (!code) setCouponInput("");
          setCouponOpen(!!code);
          return;
        }
        if (!quoteId) { setCouponError(true); return; }
        const r = await applyCouponMut.mutateAsync({
          quoteId,
          listingId: intent.listingId,
          checkIn,
          checkOut,
          coupon: code,
        });
        if (!r.ok) { setCouponError(true); return; }
        const fresh: QuoteSnapshot = {
          nightlyRate: r.pricing.nightlyRate,
          totalNights: r.pricing.totalNights,
          cleaningFee: r.pricing.cleaningFee,
          taxesAndFees: r.pricing.taxesAndFees ?? 0,
          total: r.total,
          nights: r.nights,
          currency: "EUR",
          // o quoteId mantém-se: preservar o relógio de expiração original
          quoteCreatedAt: quote?.quoteCreatedAt ?? Date.now(),
          couponCode: r.coupons?.[0]?.code || undefined,
          ratePlanOptions: collapseRatePlans(r.ratePlanOptions as any, checkIn),
        };
        const stillThere = fresh.ratePlanOptions?.find((o) => o.ratePlanId === selectedRatePlanId);
        setQuote(fresh);
        setSelectedRatePlanId(stillThere?.ratePlanId ?? r.ratePlanId ?? fresh.ratePlanOptions?.[0]?.ratePlanId ?? null);
        syncIntent({ quote: fresh });
        if (!code) setCouponInput("");
        if (code) pushDL({ event: "coupon_applied", coupon: code, property_id: intent.listingId });
      } catch {
        setCouponError(true);
      } finally {
        setCouponBusy(false);
      }
    },
    [intent, isDemo, quoteId, checkIn, checkOut, selectedRatePlanId, applyCouponMut, syncIntent],
  );

  // ── Reception: mandatory choice (§5.2). Persisted on the intent. ──
  const chooseReception = useCallback(
    (choice: ReceptionChoice) => {
      setReceptionChoice(choice);
      setReceptionNudge(false);
      syncIntent({ reception: choice });
      if (choice && !isDemo) {
        pushDL({
          event: "reception_selected",
          reception_type: choice.type,
          reception_late: !!choice.late,
          property_id: intent?.listingId,
        });
      }
    },
    [syncIntent, isDemo, intent?.listingId],
  );

  // ── Extras handlers (Fase 2). Stepper defaults come from the server curation
  //    (suggestedDays/suggestedQty) — the "stepper certo à partida" of §5.3. ──
  const defaultSelectionFor = useCallback(
    (item: CatalogExtra): ExtraSelection =>
      item.pricingModel === "per_day"
        ? { days: item.suggestedDays ?? Math.max(1, quote?.nights ?? 1) }
        : item.pricingModel === "per_person"
          ? { people: Math.max(item.minPeople ?? 1, Math.min(guests, 30)) }
          : item.pricingModel === "per_person_per_unit"
            ? { people: 1, sessions: 1 }
            : item.pricingModel === "per_person_per_day"
              ? { people: Math.min(guests, 30), days: Math.max(1, quote?.nights ?? 1) }
              : item.pricingModel === "per_unit" || item.pricingModel === "included_selectable"
                ? { qty: item.suggestedQty ?? item.minQty ?? 1 }
                : {},
    [guests, quote?.nights],
  );
  const toggleExtra = useCallback(
    (item: CatalogExtra) => {
      const adding = !(item.sku in extraSel);
      const sel = adding ? defaultSelectionFor(item) : (extraSel[item.sku] ?? {});
      setExtraSel((prev) => {
        const next = { ...prev };
        if (adding) {
          next[item.sku] = sel;
        } else {
          delete next[item.sku];
          // Cascata (§5.0): remover o pai remove os filhos revelados por ele
          for (const child of catalog) {
            if (child.parentSku === item.sku) delete next[child.sku];
          }
        }
        return next;
      });
      // M11 (auditoria set/2026): eventos FORA do setter (o Strict Mode
      // duplicava o push), pedidos sob orçamento têm evento próprio
      // (request_created, spec §13) em vez de add_to_cart com valor 0, e o
      // item leva nome humano e quantidade real.
      if (isDemo) return;
      const amount = extraAmount(item, sel);
      if (amount == null) {
        if (adding) {
          pushDL({
            event: "request_created",
            property_id: intent?.listingId,
            item_id: item.sku,
            item_chapter: item.chapter,
          });
        }
        return;
      }
      const quantity = sel.qty ?? sel.sessions ?? sel.days ?? sel.people ?? 1;
      pushEcommerce({
        event: adding ? "add_to_cart" : "remove_from_cart",
        property_id: intent?.listingId,
        ecommerce: {
          currency: "EUR",
          value: amount ?? 0,
          items: [{
            item_id: item.sku,
            item_name: t(`checkout.extras.${item.sku}.name`, item.sku),
            item_category: "extra",
            item_category2: item.chapter,
            price: item.unitPrice ?? 0,
            quantity,
          }],
        },
      });
    },
    [extraSel, defaultSelectionFor, intent?.listingId, catalog, isDemo, t],
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
  // Priced add-ons enter today's total; on-request items go to "Pedidos ao
  // concierge" without a value (§7).
  const paidExtras = useMemo(() => selectedExtras.filter((e) => e.amount != null), [selectedExtras]);
  const requestExtras = useMemo(() => selectedExtras.filter((e) => e.amount == null), [selectedExtras]);
  const extrasTotal = useMemo(() => paidExtras.reduce((sum, e) => sum + (e.amount ?? 0), 0), [paidExtras]);

  const receptionAmt = receptionConfig ? receptionAmount(receptionConfig, receptionChoice) : 0;
  // Flex dinâmico: 10% do valor das noites DA TARIFA ESCOLHIDA (piso:
  // config.price). Auditoria do funil, n.º 14 (c): usava as noites da cotação
  // com que o hóspede chegou (quote.totalNights, a tarifa por omissão); ao
  // trocar de tarifa o servidor cobrava sobre as novas noites e o botão
  // mostrava outro valor (o PayPal/Klarna recusavam com "o preço mudou").
  // A mesma conta do servidor: shared/flexValue.ts, teste de paridade em
  // server/services/flex-value.test.ts.
  const flexUnit = flexConfig ? flexPriceForPlan(effective, flexConfig) : 0;
  // Flex oferecido pelo funil de recuperação (contacto 3): o servidor cobra 0
  // enquanto flexGiftUntil for válido; o ecrã tem de dizer o mesmo
  const flexGifted = !!(intent as any)?.flexGiftUntil && new Date((intent as any).flexGiftUntil).getTime() > Date.now();
  const flexPrice = flexSelected && flexConfig && !flexGifted ? flexUnit : 0;
  // M2 (auditoria set/2026): mudar para um plano mais barato abaixo do limiar
  // escondia o bloco do Flex mas deixava os 250 € presos no total — e o
  // servidor cobrava-os. Abaixo do limiar, o Flex sai sozinho.
  useEffect(() => {
    if (!flexSelected || !flexConfig || !effective) return;
    if (effective.total < flexConfig.minTotal) {
      setFlexSelected(false);
      syncIntent({ flex: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flexSelected, flexConfig?.minTotal, effective?.total]);
  // Total de hoje: tudo o que tem preço fixo num só número (§7)
  const todayTotal = (effective?.total ?? 0) + receptionAmt + extrasTotal + flexPrice;

  // ── Pagamento em duas partes (Fase 3; spec 4.1, ponto 4) ──
  // A oferta e os valores vêm do servidor (getIntent.paymentPlan). Sem oferta
  // (flag desligada, tarifa NR, estadia abaixo do mínimo, datas perto) nada
  // muda: o checkout de sempre, sem `plan` no createCardCharge.
  // ?twoParts=1 no checkout demo mostra o seletor com valores de exemplo (QA).
  const demoOffer = useMemo<PaymentPlanOffer | null>(() => {
    if (!isDemo || typeof window === "undefined" || !new URLSearchParams(window.location.search).has("twoParts")) return null;
    const at = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    // As datas seguem a regra real para o check-in da demo (daqui a 30 dias,
    // "moderate" = 7 dias): D = +23, C = D−10, retentativas C+1 e C+3, H = D−1.
    return {
      available: true, policyCode: "moderate", incentive: "none",
      fullTodayCents: 270_000, depositCents: 135_000, depositStayCents: 135_000, balanceCents: 135_000,
      chargeAt: at(13), retryAt: [at(14), at(16)], freeCancelDeadlineAt: at(23), hardStopAt: at(22),
      mandate: {
        lang: "en", version: "demo",
        checkbox: "I authorize Portugal Active to charge the second part on the date shown to the card I am using now.",
        text: "Demo: the authorization text comes from the server, exactly as recorded.",
      },
    };
  }, [isDemo]);
  const planData = (intentQuery.data as { paymentPlan?: unknown } | undefined)?.paymentPlan as
    | (PaymentPlanOffer | { available: false })
    | null
    | undefined;
  const offer: PaymentPlanOffer | null = demoOffer ?? (planData && planData.available ? planData : null);
  const [plan, setPlan] = useState<PaymentPlanChoice>("full");
  const [mandateAccepted, setMandateAccepted] = useState(false);
  // Outra oferta (valores ou datas mudaram, ou deixou de haver): a caixa volta
  // a desmarcada e, sem oferta, o plano volta a "tudo agora".
  const offerKey = offer ? `${offer.depositCents}|${offer.balanceCents}|${offer.chargeAt}|${offer.mandate.version}` : "";
  useEffect(() => {
    setMandateAccepted(false);
    if (!offerKey) setPlan("full");
  }, [offerKey]);
  const twoParts = !!offer && plan === "two_parts";
  // Com "tudo agora" e o incentivo Flex, o Flex vai incluído (0 €).
  // Só no passo do pagamento, depois de o hóspede ver a escolha: antes disso a
  // linha "Flex · incluído" aparecia no resumo sem explicação.
  const flexIncludedByPlan = !!offer && step === "pay" && plan === "full" && offer.incentive === "flex";
  // O que se cobra hoje: o servidor manda (é ele que cobra).
  const payTotal = !offer
    ? todayTotal
    : twoParts
      ? offer.depositCents / 100
      : flexIncludedByPlan
        ? offer.fullTodayCents / 100
        : todayTotal;
  const planLaterDate = offer ? planDate(offer.chargeAt, lang) : "";
  // Spec (Fase 1 → ecrã): depois de mudar algo, volta a ler a oferta do
  // servidor; ele pode tê-la retirado ou mudado os valores.
  useEffect(() => {
    if (step !== "pay" || isDemo || !intentId) return;
    const h = setTimeout(() => { void intentQuery.refetch(); }, 1200);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, todayTotal]);
  const animatedTotal = useCountUp(twoParts ? todayTotal : payTotal);

  // Flex contextual copy inputs: which rate family is selected + the concrete
  // free-cancellation date of the CURRENT selection (coherence with the policy)
  const selectedPlanOption = quote?.ratePlanOptions?.find((o) => o.ratePlanId === selectedRatePlanId);
  const nonRefundableSelected = selectedPlanOption ? isNonRefundableOption(selectedPlanOption) : false;
  // One classification for the chosen plan (planPolicyCode) — the same one
  // its rate card uses — for the summary, the pay button, the Flex block and
  // the thank-you page, so a plan never reads two different ways.
  const selectedPolicyCode = planPolicyCode(selectedPlanOption);
  const freeCancelUntil = freeCancellationDeadline(selectedPolicyCode, checkIn);

  // Flex onde não acrescenta nada (auditoria do funil, n.º 14 a): remarca até
  // 7 dias antes, o mesmo prazo do cancelamento gratuito da tarifa moderate,
  // e a menos de 7 dias da chegada já não serve. Aí o bloco não aparece e um
  // Flex pago que tinha sido escolhido (noutra tarifa) sai sozinho, como
  // abaixo do limiar (M2). Um Flex oferecido (recuperação, 0 €) fica.
  // Política desconhecida: null, o Flex mantém-se como até aqui.
  const flexExtra = flexConfig
    ? flexExtraDays({ policyCode: selectedPolicyCode, checkIn, rescheduleDaysBefore: flexConfig.rescheduleDaysBefore })
    : null;
  const flexOffered = flexAddsValue(flexExtra);
  useEffect(() => {
    if (!flexSelected || flexGifted || !flexConfig || flexOffered) return;
    setFlexSelected(false);
    syncIntent({ flex: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flexSelected, flexGifted, !!flexConfig, flexOffered]);

  // AUDIT A1: extras/flex sincronizam com o intent a cada alteração (debounce
  // 600ms) — antes só persistiam no continueToPay: um refresh no Personalizar
  // perdia a seleção toda e remoções no passo 3 nunca chegavam ao manifesto.
  const extrasSyncReady = useRef(false);
  useEffect(() => {
    if (!intent || isDemo) return;
    if (!extrasSyncReady.current) { extrasSyncReady.current = true; return; }
    const t = window.setTimeout(() => {
      syncIntent({
        flex: flexSelected,
        extras: selectedExtras.map(({ item, sel, amount }) => ({
          sku: item.sku, qty: sel.qty, people: sel.people, sessions: sel.sessions, days: sel.days,
          amount, fulfillment: item.fulfillment,
        })),
      });
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraSel, flexSelected]);

  /** Customize → Pay: reception is mandatory (§5.2); persist everything.
   *  Without the reception choice the CTA stays clickable but nudges the
   *  guest to the missing decision instead of silently doing nothing. */
  const continueToPay = useCallback((override?: ReceptionChoice) => {
    if (!intent) return;
    const choice = override ?? receptionChoice;
    if (!choice) {
      setReceptionNudge(true);
      document.getElementById("reception-choice")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    syncIntent({
      status: "payment_pending",
      flex: flexSelected,
      reception: choice,
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
  }, [intent, receptionChoice, selectedExtras, flexSelected, syncIntent]);

  /** "Saltar personalização": saltar tem de saltar. Sem escolha de receção,
   *  assume o self check-in (incluído, sem custo) e segue para pagamento; a
   *  escolha fica visível no resumo e pode ser mudada com "voltar". */
  const skipCustomize = useCallback(() => {
    const choice: ReceptionChoice = receptionChoice ?? { type: "self" };
    if (!receptionChoice) {
      setReceptionChoice(choice);
      // M11: o caminho por omissão (a maioria) nunca emitia reception_selected
      // — o attach rate da receção presencial media contra um denominador errado
      if (!isDemo) {
        pushDL({
          event: "reception_selected",
          reception_type: "self",
          reception_late: false,
          reception_default: true,
          property_id: intent?.listingId,
        });
      }
    }
    continueToPay(choice);
  }, [receptionChoice, continueToPay, isDemo, intent?.listingId]);

  /** H3 (auditoria set/2026): os debounces de extras (600ms) e dados do
   *  hóspede (800ms) podem ainda não ter gravado quando o Pagar é clicado — e
   *  o servidor cobra o que está na BD. Este flush grava o estado ATUAL de
   *  forma síncrona antes de criar a cobrança; se a gravação falhar, o
   *  pagamento aborta em vez de cobrar o estado antigo. */
  const flushPendingSaves = useCallback(async () => {
    if (!intentId || isDemo || !intent) return;
    const patch: Record<string, unknown> = {
      flex: flexSelected,
      extras: selectedExtras.map(({ item, sel, amount }) => ({
        sku: item.sku, qty: sel.qty, people: sel.people, sessions: sel.sessions, days: sel.days,
        amount, fulfillment: item.fulfillment,
      })),
      ...(receptionChoice ? { reception: receptionChoice } : {}),
      ...(isValidEmail(email) ? { email } : {}),
      ...(firstName.trim() && lastName.trim() && isValidPhone(phone)
        ? {
            guestFirstName: firstName.trim(),
            guestLastName: lastName.trim(),
            guestPhone: phone,
            nif: normalizeTaxId(nif),
          }
        : {}),
    };
    utils.checkout.getIntent.setData({ intentId }, (prev) =>
      prev?.intent ? { ...prev, intent: { ...prev.intent, ...patch } as typeof prev.intent } : prev,
    );
    const r = await updateIntent.mutateAsync({ intentId, patch: patch as any });
    if (!(r as { ok?: boolean } | undefined)?.ok) {
      throw new Error("checkout state could not be saved");
    }
  }, [intentId, isDemo, intent, flexSelected, selectedExtras, receptionChoice, email, firstName, lastName, phone, nif, utils, updateIntent]);

  /** Ops manifest (PT, staff-facing) appended to the Guesty reservation notes —
   *  same pattern the legacy widget uses, so operations see the requests. */
  const extrasNote = useMemo(() => {
    const blocks: string[] = [];
    if (receptionChoice) {
      blocks.push(
        receptionChoice.type === "hosted"
          ? `\n\n✔ RECEÇÃO: presencial${receptionChoice.late ? ` (após as ${receptionConfig?.lateFromHour ?? 21}h, ${receptionConfig?.hostedLatePrice ?? 90} EUR)` : ` (${receptionConfig?.hostedPrice ?? 50} EUR)`}`
          : `\n\n✔ RECEÇÃO: self check-in (incluído)`,
      );
    }
    if (selectedExtras.length) {
      const lines = selectedExtras.map(({ item, sel, amount }) => {
        const parts = [
          `- ${item.sku}`,
          sel.qty ? `x${sel.qty}` : "",
          sel.days ? `${sel.days} dias` : "",
          sel.people ? `${sel.people} pessoas` : "",
          sel.sessions ? `${sel.sessions} sessoes` : "",
          amount != null ? `≈ ${amount} EUR` : "(sob pedido)",
          item.fulfillment === "needs_confirmation" ? "[CONFIRMAR 24H]" : "",
        ].filter(Boolean);
        return parts.join(" ");
      });
      blocks.push(`\n\n⚠️ EXTRAS PEDIDOS NO CHECKOUT:\n${lines.join("\n")}`);
    }
    return blocks.join("");
  }, [receptionChoice, receptionConfig, selectedExtras]);

  // Persist guest details when they become valid (debounced-ish: on blur via effect)
  const guestDetailsValid =
    firstName.trim().length > 0 && lastName.trim().length > 0 && isValidPhone(phone);
  const detailsSyncedRef = useRef("");
  useEffect(() => {
    if (!intent || !guestDetailsValid) return;
    // NIF sem espaços nem pontos, em maiúsculas (é o que o CS copia para a fatura)
    const nifClean = normalizeTaxId(nif);
    const key = `${firstName}|${lastName}|${phone}|${nifClean}`;
    if (detailsSyncedRef.current === key) return;
    const timer = setTimeout(() => {
      detailsSyncedRef.current = key;
      syncIntent({
        guestFirstName: firstName.trim(),
        guestLastName: lastName.trim(),
        guestPhone: phone,
        nif: nifClean,
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [intent, guestDetailsValid, firstName, lastName, phone, nif, syncIntent]);

  // ── Bloco 6: items[] GA4 do purchase — todos os extras pagos, receção e
  // Flex (sku, nome, preço, quantidade). price × quantity = valor da linha;
  // on_request fica de fora (não é comprado, é um pedido sob orçamento).
  // Viaja com todos os métodos: stash do cartão/wallets e sessionStorage
  // do Klarna/PayPal, e é anexado ao item da casa no evento purchase.
  const purchaseItems = useMemo(() => {
    const items: Array<Record<string, unknown>> = [];
    for (const { item, sel, amount } of paidExtras) {
      const qty = Math.max(1, Number(sel.qty ?? 1));
      items.push({
        item_id: `EXTRA-${item.sku}`,
        item_name: t(`checkout.extras.${item.sku}.name`, item.sku),
        item_category: "extra",
        item_category2: item.chapter,
        price: Math.round(((amount ?? 0) / qty) * 100) / 100,
        quantity: qty,
      });
    }
    if (receptionChoice?.type === "hosted" && receptionAmt > 0) {
      items.push({
        item_id: receptionChoice.late ? "RECEPTION-HOSTED-LATE" : "RECEPTION-HOSTED",
        item_name: t("checkout.reception.hosted.name", "Hosted reception"),
        item_category: "reception",
        price: receptionAmt,
        quantity: 1,
      });
    }
    if (flexSelected && flexPrice > 0) {
      items.push({
        item_id: "FLEX",
        item_name: t("checkout.flex.title", "Flex, guaranteed rebooking"),
        item_category: "protection",
        price: flexPrice,
        quantity: 1,
      });
    }
    return items;
  }, [paidExtras, receptionChoice, receptionAmt, flexSelected, flexPrice, t]);

  // ── Card payment success → unified branded thank-you page ──
  const handleCardSuccess = useCallback(
    (confirmationCode: string, reservationId?: string) => {
      if (!intent) return;
      const rid = reservationId || confirmationCode;
      stashThankYou({
        reservationId: rid,
        confirmationCode,
        method: "card",
        listingId: intent.listingId,
        listingName: displayName,
        location: intent.destination || "",
        checkIn,
        checkOut,
        guestsCount: guests,
        guestName: `${firstName} ${lastName}`.trim(),
        guestEmail: email,
        guestPhone: phone,
        // 2b: o cartão v2 cobra o que é devido hoje (estadia + serviços; em
        // duas partes só a 1.ª; com o Flex incluído, sem o Flex)
        totalCents: Math.round(payTotal * 100),
        ...(twoParts && offer ? { paymentPlan: { amountLaterCents: offer.balanceCents, chargeAt: offer.chargeAt } } : {}),
        // Valor do purchase nos anúncios: só a estadia (extras à parte)
        stayTotalCents: effective ? Math.round(effective.total * 100) : null,
        // M12 (auditoria set/2026): sem isto o item da casa ia sem preço nem
        // quantidade no purchase do cartão
        nightlyRateCents: effective ? Math.round(effective.nightlyRate * 100) : undefined,
        nights: quote?.nights,
        currency: "EUR",
        couponCode: quote?.couponCode || undefined,
        purchaseItems,
        // Política da tarifa paga (mesma classificação do cartão) para a confirmação
        cancellationPolicy: selectedPolicyCode ? [selectedPolicyCode] : undefined,
      });
      // The server records payment and reservation confirmation after settlement.
      void utils.checkout.getIntent.invalidate({ intentId: intent.id });
      navigate(`/booking/thank-you/${rid}?method=card`);
    },
    [intent, displayName, checkIn, checkOut, guests, firstName, lastName, email, phone, todayTotal, payTotal, twoParts, offer, effective, selectedPolicyCode, quote?.nights, quote?.couponCode, purchaseItems, syncIntent, navigate],
  );

  // M5 (auditoria set/2026): regresso de um redirect 3DS do banco. O Stripe
  // devolve ?payment_intent&redirect_status; antes a página mostrava o
  // formulário vazio outra vez e o hóspede não sabia se tinha pago. Agora:
  // finalizar já (cria a reserva) e seguir para o obrigado; se o finalize
  // falhar, o webhook/sweep completam — dizer isso em vez de silêncio.
  const finalize3ds = trpc.checkout.finalizeCardCharge.useMutation();
  const [redirectFinalizing, setRedirectFinalizing] = useState(false);
  const redirect3dsHandled = useRef(false);
  useEffect(() => {
    if (redirect3dsHandled.current || !intent || isDemo) return;
    const sp = new URLSearchParams(window.location.search);
    const piParam = sp.get("payment_intent");
    const rs = sp.get("redirect_status");
    if (!piParam || !rs) return;
    redirect3dsHandled.current = true;
    // Limpar os params: um refresh não deve repetir o finalize
    sp.delete("payment_intent"); sp.delete("payment_intent_client_secret"); sp.delete("redirect_status");
    const qs = sp.toString();
    window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
    if (rs !== "succeeded" && rs !== "processing") return; // falhou no banco: o form volta, sem cobrança
    setStep("pay");
    setRedirectFinalizing(true);
    finalize3ds
      .mutateAsync({ intentId: intent.id, paymentIntentId: piParam })
      .then((fin) => handleCardSuccess(fin.confirmationCode, fin.reservationId))
      .catch(() => setRedirectFinalizing(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent?.id]);

  // ── Price-guarantee deadline label ──
  const priceHold = useMemo(() => {
    if (!intent?.expiresAt) return null;
    const d = new Date(intent.expiresAt);
    if (Number.isNaN(d.getTime()) || d.getTime() < Date.now()) return null;
    const time = d.toLocaleTimeString(intlLocale(lang), { hour: "2-digit", minute: "2-digit" });
    const pad = (n: number) => String(n).padStart(2, "0");
    const localYmd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return { date: formatBookingDate(localYmd, lang), time };
  }, [intent?.expiresAt, lang]);
  const guaranteeLabel = priceHold ? t("checkout.priceGuaranteed", priceHold) : null;

  // ── Passo do pagamento (auditoria do funil, out/2026, n.º 1, 4 e 11) ──
  // Nome, email e telefone validam-se no clique em Pagar: o erro fica no campo,
  // o primeiro em falta recebe o foco e nada é criado nem cobrado.
  const guestIssues = guestDetailsIssues({ firstName, lastName, email, phone });
  const walletsReady = walletsUnlocked({ guestIssues, termsAccepted });
  const validateGuestForPay = useCallback((): boolean => {
    const issues = guestDetailsIssues({ firstName, lastName, email, phone });
    if (!issues.length) return true;
    setShowGuestErrors(true);
    if (issues.includes("email")) setEmailEditing(true);
    const id = GUEST_FIELD_IDS[issues[0]];
    // O campo do email pode só aparecer neste render
    window.requestAnimationFrame(() => focusField(id));
    return false;
  }, [firstName, lastName, email, phone]);
  // "Pagar em duas partes" depois de uma recusa: muda o plano e leva à autorização.
  const focusMandateRef = useRef(false);
  useEffect(() => {
    if (!twoParts || !focusMandateRef.current) return;
    focusMandateRef.current = false;
    window.requestAnimationFrame(() => focusField("checkout-mandate"));
  }, [twoParts]);
  // Demo (?declined=insufficient_funds): simula uma recusa para rever o aviso.
  const demoDecline = useMemo(
    () => (isDemo && typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("declined") : null),
    [isDemo],
  );

  const steps: Array<{ key: Step; label: string }> = [
    { key: "stay", label: t("checkout.stepStay", "Your stay") },
    { key: "customize", label: t("conversion.optionalStep") },
    { key: "pay", label: t("checkout.stepPay", "Payment") },
  ];
  const stepIndex = steps.findIndex((s) => s.key === step);

  // ── Loading / not-found states ──
  if (intentQuery.isLoading && !isDemo) {
    return (
      <div className="min-h-screen bg-white">
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
  // M9 (auditoria set/2026): um erro de rede/servidor NÃO é um link inválido —
  // dizê-lo afugentava hóspedes com o checkout perfeitamente válido.
  if (intentQuery.isError && !isDemo) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-[420px] text-center space-y-4">
          <h1 className="headline-md text-pa-dark">{t("checkout.loadErrorTitle", "We couldn't load your checkout")}</h1>
          <p className="body-sm">{t("checkout.loadErrorBody", "This looks like a connection problem, not a problem with your booking. Check your internet and try again.")}</p>
          <button type="button" onClick={() => intentQuery.refetch()} className="btn-primary inline-flex">
            {t("bookingWidget.tryAgain", "Try again")}
          </button>
        </div>
      </div>
    );
  }
  if (!intent) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
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
      <div className="min-h-screen bg-white flex items-center justify-center px-6">
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

  // Resumo com hierarquia única (§7/§8): Estadia · Receção · Extras · Flex ·
  // Total de hoje. Tudo o que tem preço fixo entra no total; os pedidos sob
  // orçamento vivem numa secção própria (renderizada no summaryCard).
  const summaryLines = effective && (
    <div className="space-y-2">
      <div className="flex justify-between body-sm text-inherit">
        <span className="text-pa-earth">
          {effective.nights} {t("bookingWidget.nightsLabel", "nights")}
        </span>
        <span className="text-pa-dark tabular-nums">{formatQuotedEur(effective.totalNights, lang)}</span>
      </div>
      {effective.cleaningFee > 0 && (
        <div className="flex justify-between body-sm text-inherit">
          <span className="text-pa-earth">{t("property.cleaningFee")}</span>
          <span className="text-pa-dark tabular-nums">{formatQuotedEur(effective.cleaningFee, lang)}</span>
        </div>
      )}
      {effective.taxesAndFees > 0 && (
        <div className="flex justify-between body-sm text-inherit">
          <span className="text-pa-earth">{t("bookingWidget.taxesAndFees", "Taxes & fees")}</span>
          <span className="text-pa-dark tabular-nums">{formatQuotedEur(effective.taxesAndFees, lang)}</span>
        </div>
      )}
      {/* Receção (escolha obrigatória). Uma receção presencial só mostra valor
          quando a config do catálogo já carregou — evita rotular como "Incluído"
          e somar 0€ durante o loading numa retoma a frio. */}
      {receptionChoice && (receptionChoice.type === "self" || receptionConfig) && (
        <div className="flex justify-between body-sm text-inherit checkout-row-in">
          <span className="text-pa-earth">
            {receptionChoice.type === "hosted" ? t("checkout.reception.hosted.name") : t("checkout.reception.self.name")}
          </span>
          <span className={cn("tabular-nums", receptionAmt > 0 ? "text-pa-dark" : "text-pa-gold")}>
            {receptionAmt > 0 ? formatQuotedEur(receptionAmt, lang) : t("checkout.included.badge")}
          </span>
        </div>
      )}
      {/* Extras com preço fixo — com remover inline (spec §8) */}
      {paidExtras.map(({ item, sel, amount }) => (
        <div key={item.sku} className="flex justify-between items-center gap-2 body-sm text-inherit checkout-row-in">
          <span className="flex items-center gap-1.5 text-pa-earth min-w-0">
            <button
              type="button"
              onClick={() => toggleExtra(item)}
              aria-label={`${t("checkout.remove", "Remove")}: ${t(`checkout.extras.${item.sku}.name`)}`}
              className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-pa-stone-aa hover:text-pa-dark hover:bg-pa-sand transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            <span className="truncate">
              {t(`checkout.extras.${item.sku}.name`)}
              {(() => {
                const bits: string[] = [];
                if (sel.people) bits.push(`${sel.people}p`);
                if (sel.days) bits.push(`${sel.days}d`);
                if (sel.qty && sel.qty > 1) bits.push(`×${sel.qty}`);
                if (sel.sessions && sel.sessions > 1) bits.push(`×${sel.sessions}`);
                return bits.length ? <span className="text-pa-stone-aa"> · {bits.join(" · ")}</span> : null;
              })()}
            </span>
          </span>
          <span className={cn("tabular-nums shrink-0", amount === 0 ? "text-pa-gold eyebrow uppercase tracking-[0.08em]" : "text-pa-dark")}>
            {amount === 0 ? t("checkout.included.badge") : formatQuotedEur(amount!, lang)}
          </span>
        </div>
      ))}
      {/* Flex */}
      {flexSelected && flexConfig && (
        <div className="flex justify-between items-center gap-2 body-sm text-inherit checkout-row-in">
          <span className="flex items-center gap-1.5 text-pa-gold font-medium min-w-0">
            {/* M2 (auditoria set/2026): a linha do Flex não tinha remover — se o
                bloco desaparecesse (total abaixo do limiar) os 250 € ficavam
                presos no total sem forma de sair */}
            <button
              type="button"
              onClick={() => { setFlexSelected(false); syncIntent({ flex: false }); }}
              aria-label={`${t("checkout.remove", "Remove")}: ${t("checkout.flex.title", "Flex")}`}
              className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-pa-stone-aa hover:text-pa-dark hover:bg-pa-sand transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            <span className="truncate">{t("checkout.flex.title", "Flex — guaranteed rebooking")}</span>
          </span>
          {flexGifted || flexIncludedByPlan ? (
            <span className="tabular-nums shrink-0"><s className="text-pa-stone-aa">{formatQuotedEur(flexUnit, lang)}</s> <span className="text-pa-gold">{flexIncludedByPlan ? t("checkout.summary.flexIncludedShort", "Included") : t("checkout.flex.gifted", "Offered")}</span></span>
          ) : (
            <span className="text-pa-dark tabular-nums shrink-0">{formatQuotedEur(flexUnit, lang)}</span>
          )}
        </div>
      )}
      {/* Flex incluído por pagar tudo agora, sem o hóspede o ter escolhido */}
      {flexIncludedByPlan && !flexSelected && flexConfig && (
        <div className="flex justify-between items-center gap-2 body-sm text-inherit checkout-row-in">
          <span className="text-pa-gold font-medium truncate">{t("checkout.summary.flexIncluded", "Flex · included")}</span>
          <span className="text-pa-gold tabular-nums shrink-0">{formatQuotedEur(0, lang)}</span>
        </div>
      )}
      <div className="flex justify-between items-baseline border-t border-pa-sand pt-2.5">
        <span className="body-sm font-medium text-pa-dark">{twoParts ? t("checkout.summary.total", "Total") : t("checkout.todayTotal", "Total today")}</span>
        <span className="text-[20px] font-light text-pa-dark tabular-nums">{formatQuotedEur(animatedTotal, lang)}</span>
      </div>
      {twoParts && offer && (
        <div className="space-y-1">
          <div className="flex justify-between items-baseline body-sm">
            <span className="font-medium text-pa-dark">{t("checkout.summary.today", "Today")}</span>
            <span className="text-pa-dark tabular-nums">{formatQuotedEur(offer.depositCents / 100, lang)}</span>
          </div>
          <div className="flex justify-between items-baseline body-sm gap-2">
            <span className="text-pa-earth">
              {t("checkout.summary.later", { date: planLaterDate })} · {t("checkout.summary.sameCard", "same card")}
            </span>
            <span className="text-pa-earth tabular-nums shrink-0">{formatQuotedEur(offer.balanceCents / 100, lang)}</span>
          </div>
        </div>
      )}

    </div>
  );

  // Código promocional estilo Shopify: campo sempre visível no cartão do
  // resumo; aplicado → pill com remover (12 jul).
  const couponRow = !promoEnabled && !quote?.couponCode ? null : (
    <div className="border-t border-pa-sand pt-3">
      {!quote?.couponCode && !couponOpen ? (
        <button
          type="button"
          onClick={() => setCouponOpen(true)}
          className="caption text-pa-stone-aa hover:text-pa-dark underline underline-offset-2 transition-colors"
        >
          {t("checkout.coupon.have", "Have a promo code?")}
        </button>
      ) : quote?.couponCode ? (
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 caption text-pa-dark bg-pa-warm border border-pa-sand rounded-full px-2.5 py-1">
            <Tag className="w-3 h-3 text-pa-gold" /> {quote.couponCode}
          </span>
          <button
            type="button"
            onClick={() => applyCoupon("")}
            disabled={couponBusy}
            aria-label={t("checkout.remove", "Remove")}
            className="caption text-pa-stone-aa hover:text-pa-dark underline underline-offset-2 transition-colors"
          >
            {t("checkout.remove", "Remove")}
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input
              value={couponInput}
              onChange={(e) => { setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "")); setCouponError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && couponInput.trim()) applyCoupon(couponInput.trim()); }}
              placeholder={t("checkout.coupon.field", "Promo code")}
              maxLength={40}
              className="flex-1 min-w-0 h-[38px] border border-pa-sand bg-white px-3 rounded-md body-sm tracking-[0.04em] text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none"
            />
            <button
              type="button"
              onClick={() => applyCoupon(couponInput.trim())}
              disabled={couponBusy || !couponInput.trim() || (!isDemo && !quoteId)}
              className="pa-action shrink-0 h-[38px] px-4 rounded-md border border-pa-sand eyebrow font-medium tracking-[0.08em] uppercase text-pa-earth hover:border-pa-dark hover:text-pa-dark transition-colors disabled:opacity-40"
            >
              {couponBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : t("checkout.coupon.apply", "Apply")}
            </button>
          </div>
          {couponError && (
            <p className="caption text-pa-earth">{t("checkout.coupon.invalid", "Code not recognized. Check it and try again.")}</p>
          )}
          {couponDropped && !couponError && (
            <p className="caption text-pa-earth" role="status">
              {t("checkout.coupon.dropped", { code: couponDropped, defaultValue: "Code {{code}} no longer applies to these dates." })}
            </p>
          )}
        </div>
      )}
    </div>
  );

  // "Pedidos ao concierge" — itens sob orçamento, sem valores somados (§7/§8)
  const conciergeRequests = requestExtras.length > 0 && (
    <div className="border-t border-pa-sand pt-3 space-y-1.5">
      <p className="eyebrow tracking-[0.12em] uppercase text-pa-stone-aa">
        {t("checkout.conciergeRequests", "Concierge requests")}
      </p>
      {requestExtras.map(({ item }) => (
        <div key={item.sku} className="flex justify-between items-center gap-2 body-sm text-inherit">
          <span className="flex items-center gap-1.5 text-pa-earth min-w-0">
            <button
              type="button"
              onClick={() => toggleExtra(item)}
              aria-label={`${t("checkout.remove", "Remove")}: ${t(`checkout.extras.${item.sku}.name`)}`}
              className="shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-pa-stone-aa hover:text-pa-dark hover:bg-pa-sand transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
            <span className="truncate">{t(`checkout.extras.${item.sku}.name`)}</span>
          </span>
          <span className="text-pa-stone-aa shrink-0">{t("checkout.onRequestShort", "on request")}</span>
        </div>
      ))}
      <p className="caption text-pa-stone-aa leading-snug pt-0.5">
        {t("checkout.conciergeRequestsNote", "Quoted individually by your concierge — not part of today's payment.")}
      </p>
    </div>
  );

  const summaryCard = (
    <div className="bg-white border border-pa-sand rounded-lg overflow-hidden shadow-[0_4px_24px_rgba(26,26,24,0.06)]">
      {heroImage && (
        <img src={heroImage} alt={displayName} className="w-full aspect-[4/3] object-cover" width={800} height={600} />
      )}
      <div className="p-5 space-y-4">
        <div>
          <p className="font-display body-lg text-pa-dark leading-snug">{displayName}</p>
          {intent.destination && <p className="eyebrow tracking-[0.08em] uppercase text-pa-stone-aa mt-1">{intent.destination}</p>}
        </div>
        <div className="body-sm text-pa-earth">
          {formatBookingDate(checkIn, lang, true)} → {formatBookingDate(checkOut, lang, true)} · {guests} {t("booking.guestsLabel", "guests")}
        </div>
        {summaryLines}
        {step === "pay" && <p className="caption text-pa-earth leading-relaxed">{t('securityDeposit.notice')}</p>}
        {couponRow}
        {conciergeRequests}
        {/* Sem frase de política no resumo (auditoria do funil, n.º 11): uma
            só por ecrã, junto à decisão — no cartão da tarifa (passo 1) e
            mesmo acima do botão de pagar (passo 3, obrigatória). */}
        {guaranteeLabel && (
          <p className="flex items-start gap-1.5 caption text-pa-gold leading-snug">
            <Clock3 className="w-3 h-3 shrink-0 mt-[1px]" /> {guaranteeLabel}
          </p>
        )}
      </div>
    </div>
  );

  // Reserva direta — os mesmos três argumentos do PDP ("Why book direct"),
  // fixos na coluna de resumo nos três passos: quem chegou de uma OTA ainda
  // tem essa aba aberta na hora de pagar (auditoria set/2026, N5). As chaves
  // trust.* são as do PDP; nada de copy duplicado.
  // Uma linha, só no passo 1 (28 out 2026: o bloco de 3 pontos em todos os
  // passos era ruído). Quem chega de uma OTA decide aqui, não a pagar.
  const directBlock = step !== "stay" ? null : (
    <div className="bg-white border border-pa-sand rounded-lg px-5 py-3.5 flex items-start gap-2">
      <ShieldCheck className="w-3.5 h-3.5 text-pa-gold-aa shrink-0 mt-0.5" />
      <p className="caption text-pa-dark leading-snug">
        {t("trust.compactLine", "Best rate guaranteed · no booking fees · WhatsApp concierge")}{" "}
        <Link href="/best-rate-guarantee" className="text-pa-gold-aa underline underline-offset-2 hover:text-pa-dark whitespace-nowrap">
          {t("trust.guaranteeTerms", "How the guarantee works")}
        </Link>
      </p>
    </div>
  );

  const rateChoice = (
(quote?.ratePlanOptions?.length ?? 0) > 1 && (
                <div className="space-y-2">
                  <p className="eyebrow font-medium tracking-[0.12em] uppercase text-pa-gold">{t("bookingWidget.ratePlan", "Rate plan")}</p>
                  {(() => { const maxTotal = Math.max(...quote!.ratePlanOptions!.map(o => o.total)); return quote!.ratePlanOptions!.map((opt) => {
                    const isSelected = selectedRatePlanId === opt.ratePlanId;
                    // "Reembolsável" só quando o Guesty o diz (código conhecido ou
                    // nome "Reembolsável"); senão o neutro "Tarifa" (rateKind)
                    const kind = rateKind(opt);
                    const nonRef = kind === "non_refundable";
                    const label =
                      kind === "non_refundable"
                        ? t("booking.nonRefundable")
                        : kind === "refundable"
                          ? t("booking.flexibleRate")
                          : t("bookingConfirm.rate");
                    const savings = maxTotal - opt.total;
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
                            // A demo não manda eventos (como os outros pushDL deste ficheiro).
                            if (!isDemo) {
                              pushDL({
                                event: "rate_plan_selected",
                                rate_plan: nonRef ? "non_refundable" : "flexible",
                                value: opt.total,
                                property_id: intent.listingId,
                              });
                            }
                          }}
                          className="accent-black w-4 h-4 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="body-sm text-pa-dark font-medium">{label}</p>
                            {!nonRef && hasVerifiedRefundAdvantage(opt, quote!.ratePlanOptions!, checkIn) && (
                              <span className="eyebrow font-medium tracking-wider uppercase px-1.5 py-0.5 bg-pa-warm text-pa-gold border border-pa-sand rounded-sm">
                                {t("bookingWidget.recommended", "Recommended")}
                              </span>
                            )}
                          </div>
                          <CancellationPolicyLine
                            code={planPolicyCode(opt)}
                            checkIn={checkIn}
                            lang={lang}
                            className="caption mt-0.5 text-pa-earth"
                          />
                          {!nonRef && (
                            <TwoPartsHint
                              variant="rate"
                              checkIn={checkIn}
                              policyCode={planPolicyCode(opt)}
                              stayTotal={opt.total}
                              className="caption mt-1 text-pa-dark leading-snug"
                            />
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="body-sm text-pa-dark font-medium tabular-nums">
                            {formatQuotedEur(opt.total, lang)}
                          </span>
                          {savings > 0 && (
                            <p className="caption text-pa-gold font-medium mt-0.5">
                              {t("bookingWidget.save", "Save")} {formatQuotedEur(savings, lang)}
                            </p>
                          )}
                        </div>
                      </label>
                    );
                  }); })()}
                </div>
              )
  );

  // ── Passo do pagamento: erros nos campos (só depois de um clique em Pagar,
  // ou do hóspede sair do campo), linha do email e aviso suave do NIF ──
  const firstNameError = showGuestErrors && !firstName.trim();
  const lastNameError = showGuestErrors && !lastName.trim();
  const emailInvalid = !isValidEmail(email);
  const showEmailField = emailEditing || emailInvalid;
  const emailError = emailInvalid && (showGuestErrors || (emailTouched && email.length > 0));
  const phoneError = !isValidPhone(phone) && (showGuestErrors || (phoneTouched && !!phone));
  // A razão junto ao campo (auditoria do funil, n.º 7): "um número +351 tem 9
  // algarismos…", "retire o 0 depois de +44", nunca recusar sem dizer porquê.
  const phoneErrorText = phoneError ? phoneIssueMessage(phoneIssue(phone), t) : "";
  const nifIssue = checkTaxId(nif) === "pt_invalid";

  // Autorização (duas partes), Termos e a frase de política: mesmo acima do
  // botão final, que só fica ativo com as caixas marcadas (spec 4.1, pontos 4
  // e 5, validada pelo André). Nenhuma vem pré-marcada; a dica fica junto à
  // caixa por marcar.
  const consentBlock = (
    <div className="space-y-3">
      {twoParts && offer && (
        <MandateConsent offer={offer} accepted={mandateAccepted} onChange={setMandateAccepted} />
      )}
      <div className="space-y-1">
        <label className="flex items-start gap-2 cursor-pointer select-none">
          <input
            id="checkout-terms"
            type="checkbox"
            checked={termsAccepted}
            onChange={(e) => setTermsAccepted(e.target.checked)}
            aria-describedby={termsAccepted ? undefined : "checkout-terms-hint"}
            className="mt-0.5 w-4 h-4 accent-black border-pa-sand rounded"
          />
          <span className="caption text-pa-earth leading-snug">
            {t("bookingWidget.termsAcceptLabel", "I accept the")}{" "}
            <a href={`/${lang}/legal/terms`} target="_blank" rel="noopener noreferrer" className="text-pa-dark underline hover:text-pa-gold-aa">{t("bookingWidget.termsLink", "Terms & Conditions")}</a>
            {" "}{t("bookingWidget.termsAnd", "and the")}{" "}
            <a href={`/${lang}/legal/cancellation-policy`} target="_blank" rel="noopener noreferrer" className="text-pa-dark underline hover:text-pa-gold-aa">{t("bookingWidget.cancellationPolicyLink")}</a>
          </span>
        </label>
        {!termsAccepted && (
          <p id="checkout-terms-hint" className="caption text-pa-earth leading-snug pl-6">{t("payment.termsHint")}</p>
        )}
      </div>
      {/* Política em texto humano junto ao botão (spec §7, DL 24/2014): a única do passo */}
      {selectedPolicyCode || effective?.cancellationPolicy?.length ? (
        <CancellationPolicyLine
          code={selectedPolicyCode}
          checkIn={checkIn}
          lang={lang}
          className="caption text-pa-earth leading-snug"
        />
      ) : null}
    </div>
  );

  // Aviso de pagamento falhado: o concierge por WhatsApp, já com a casa e as
  // datas (nunca dados do cartão), e as duas partes como saída para uma recusa.
  const conciergeHref = conciergeWhatsAppHref(
    t("payment.errorActions.whatsappMessage", {
      property: displayName,
      checkIn: formatBookingDate(checkIn, lang, true),
      checkOut: formatBookingDate(checkOut, lang, true),
      guests,
    }),
  );
  // Contacto humano em todos os passos (auditoria do funil, crítico): o único
  // WhatsApp do checkout estava no aviso de datas ocupadas. A mensagem já leva
  // a casa e as datas; o clique conta como whatsapp_click pelo
  // data-track-source (installContactClickTracking), com o passo.
  const conciergeQuestionHref = conciergeWhatsAppHref(
    t("checkout.conciergeMessage", {
      property: displayName,
      checkIn: formatBookingDate(checkIn, lang, true),
      checkOut: formatBookingDate(checkOut, lang, true),
      guests,
    }),
  );

  // Telemóvel: a casa (nome e foto) no topo de cada passo. O resumo com a foto
  // só existe no computador e a folha "Ver detalhes" vem fechada; numa compra
  // de milhares de euros falta o "estou a reservar a casa certa" (crítico).
  const mobileContext = (
    <div className="lg:hidden flex items-center gap-3" data-testid="checkout-mobile-context">
      {thumbImage ? (
        <img src={thumbImage} alt="" className="w-12 h-12 rounded-md object-cover shrink-0 bg-pa-warm" width={48} height={48} />
      ) : null}
      <div className="min-w-0">
        <p className="font-display body-sm text-pa-dark leading-snug truncate">{displayName}</p>
        {intent.destination && (
          <p className="eyebrow tracking-[0.08em] uppercase text-pa-stone-aa truncate">{intent.destination}</p>
        )}
      </div>
    </div>
  );

  const twoPartsSwitch = offer && plan === "full"
    ? {
        amountNow: formatQuotedEur(offer.depositCents / 100, lang),
        onSelect: () => {
          focusMandateRef.current = true;
          setPlan("two_parts");
        },
      }
    : null;

  return (
    <div className="checkout-page min-h-screen bg-white pb-28 lg:pb-12">
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
        <div className="max-w-[1100px] mx-auto px-4 h-[60px] flex items-center justify-between gap-3 sm:gap-4">
          <Link href="/" className="shrink-0" aria-label="Portugal Active">
            <img src={IMAGES.logoColor} alt="Portugal Active" className="h-[26px] w-auto" />
          </Link>
          {/* O WhatsApp do cabeçalho tira espaço aos passos (revisão do PR
              #176: o círculo do passo atual chegava a 2 px a 360 px em DE e
              FI). Os círculos nunca encolhem; as linhas entre eles aparecem a
              partir de sm e os nomes dos outros passos só no computador (lg);
              o nome do passo atual passa a duas linhas quando falta largura e
              sai abaixo de 360 px (o título do passo, logo abaixo, diz-o). */}
          <nav aria-label={t("checkout.stepsAria", "Checkout steps")} className="flex min-w-0 items-center gap-2 sm:gap-3">
            {steps.map((s, i) => (
              <div key={s.key} className={cn("flex items-center gap-2 sm:gap-3", i === stepIndex ? "min-w-0" : "shrink-0")}>
                {i > 0 && <span aria-hidden className="hidden sm:block w-10 h-px bg-pa-sand" />}
                <button
                  type="button"
                  disabled={i >= stepIndex}
                  onClick={() => {
                    // C3: retroceder por clique no indicador, mantendo o estado
                    if (i < stepIndex) {
                      setStep(s.key as Step);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className={cn("flex min-w-0 items-center gap-1.5", i < stepIndex && "cursor-pointer")}
                >
                  <span
                    className={cn(
                      "w-5 h-5 shrink-0 rounded-full caption text-inherit flex items-center justify-center border",
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
                      "eyebrow text-inherit tracking-[0.06em] uppercase",
                      i === stepIndex
                        ? "min-w-0 line-clamp-2 leading-[1.15] break-words text-left text-pa-dark font-medium max-[359px]:hidden!"
                        : "hidden lg:inline text-pa-stone-aa",
                    )}
                  >
                    {s.label}
                  </span>
                </button>
              </div>
            ))}
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            {/* L1: em mobile o aviso de reconexão era invisível — quando há
                problema de gravação, mostra-se em todos os tamanhos */}
            {/* Só quando há problema: "Guardado automaticamente" sempre à vista
                era ruído (28 out 2026). */}
            {saveIssue && (
              <span className="caption text-pa-earth">{t("checkout.saveIssue", "Reconnecting, changes pending")}</span>
            )}
            <a
              href={conciergeQuestionHref}
              target="_blank"
              rel="noopener noreferrer"
              data-track-source={`checkout_header_${step}`}
              aria-label={t("property.needHelpConcierge", "Need help? Talk to concierge")}
              title={t("property.needHelpConcierge", "Need help? Talk to concierge")}
              className="w-9 h-9 rounded-full border border-pa-sand flex items-center justify-center text-pa-earth hover:border-pa-dark hover:text-pa-dark transition-colors"
            >
              <MessageCircle className="w-4 h-4" aria-hidden />
            </a>
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
          {mobileContext}
          {isDemo && <p role="status" className="rounded-lg border border-pa-gold bg-pa-warm p-3 body-sm text-pa-dark">{t('conversion.demoNotice')}</p>}
          {/* Stale quote / unavailable banners */}
          {quoteStale && !datesUnavailable && (
            <div className="flex items-start justify-between gap-4 p-4 bg-pa-warm border border-pa-sand rounded-lg">
              <p className="body-sm text-pa-earth leading-snug">
                {t("checkout.quoteExpiredBanner", "This price has expired. Refresh to see the current price for your dates — your details are kept.")}
              </p>
              <button
                id="checkout-refresh-price"
                type="button"
                onClick={() => requote(checkIn, checkOut, guests)}
                disabled={requoting}
                className="shrink-0 caption font-medium text-pa-dark underline underline-offset-2 disabled:opacity-40"
              >
                {requoting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("checkout.refreshPrice", "Refresh price")}
              </button>
            </div>
          )}
          {datesUnavailable && (
            <div className="p-4 bg-red-50/70 border border-red-200/60 rounded-lg space-y-2" role="alert">
              <p className="body-sm text-inherit text-red-700 leading-snug">
                {t("checkout.datesUnavailable", "These dates are no longer available. Please choose new dates below or contact our concierge.")}
              </p>
              <div className="flex items-center gap-4">
                <button
                  id="checkout-change-dates"
                  type="button"
                  onClick={() => { setStep("stay"); setEditingStay(true); setDatesUnavailable(false); }}
                  className="caption text-inherit font-medium text-red-700 underline underline-offset-2"
                >
                  {t("bookingWidget.changeDates", "Change dates")}
                </button>
                <a
                  href={`https://wa.me/351927161771?text=${encodeURIComponent(`${displayName} · ${checkIn} → ${checkOut} · ${guests}p`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => { if (!isDemo) pushDL({ event: "whatsapp_click", source: "checkout_unavailable", property_id: intent?.listingId }); }}
                  className="caption text-inherit font-medium text-red-700 underline underline-offset-2"
                >
                  {t("bookingWidget.contactConcierge", "Contact Concierge")}
                </a>
              </div>
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
                      <p className="eyebrow tracking-[0.12em] uppercase text-pa-stone-aa mb-1">{t("bookingWidget.checkInLabel")}</p>
                      <p className="body-sm text-pa-dark">{formatBookingDate(checkIn, lang, true)}</p>
                    </div>
                    <div>
                      <p className="eyebrow tracking-[0.12em] uppercase text-pa-stone-aa mb-1">{t("bookingWidget.checkOutLabel")}</p>
                      <p className="body-sm text-pa-dark">{formatBookingDate(checkOut, lang, true)}</p>
                    </div>
                    <div>
                      <p className="eyebrow tracking-[0.12em] uppercase text-pa-stone-aa mb-1">{t("booking.guestsLabel")}</p>
                      <p className="body-sm text-pa-dark">{guests}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => (editingStay ? finishStayEdit() : setEditingStay(true))}
                    className="shrink-0 flex items-center gap-1.5 caption text-pa-gold hover:text-pa-dark transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    {editingStay ? t("checkout.doneEditing", "Done") : t("checkout.edit", "Edit")}
                  </button>
                </div>

                {editingStay && (
                  <div className="border-t border-pa-sand pt-4 space-y-4">
                    {calendarQuery.isLoading ? (
                      <div className="flex items-center justify-center py-8 gap-2 caption text-pa-stone-aa">
                        <Loader2 className="w-4 h-4 animate-spin" /> {t("bookingWidget.loadingCalendar", "Loading availability...")}
                      </div>
                    ) : (
                      <AvailabilityCalendar
                        days={calendarDays}
                        checkIn={stayDraft?.checkIn ?? checkIn}
                        checkOut={stayDraft?.checkOut ?? checkOut}
                        minNights={property?.minNights}
                        onClose={() => finishStayEdit()}
                        onSelectRange={({ checkIn: ci, checkOut: co, done }) => {
                          setStayDraft({ checkIn: ci, checkOut: co });
                          if (done) finishStayEdit({ checkIn: ci, checkOut: co });
                        }}
                      />
                    )}
                    <div className="flex items-center gap-4">
                      <p className="eyebrow tracking-[0.12em] uppercase text-pa-stone-aa">{t("booking.guestsLabel")}</p>
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
                        <span className="min-w-[2ch] text-center body-sm text-pa-dark tabular-nums">{guests}</span>
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

              {/* Sem o resumo de preço só do telemóvel (auditoria do funil,
                  n.º 2): repetia o "Ver detalhes" da barra e empurrava o email
                  para baixo da dobra. A ordem da spec §4 fica: resumo da
                  estadia, tarifa, email (as duas partes vivem no cartão da
                  tarifa reembolsável). */}
              {rateChoice}
              {/* Uma só tarifa (sem cartões para escolher): a frase da política
                  fica aqui, a única do ecrã (auditoria do funil, n.º 11). */}
              {!rateChoice && (selectedPolicyCode || effective?.cancellationPolicy?.length) ? (
                <CancellationPolicyLine
                  code={selectedPolicyCode}
                  checkIn={checkIn}
                  lang={lang}
                  className="caption text-pa-earth leading-snug"
                />
              ) : null}

              {/* Email capture. Título e rótulo como estão em produção: o
                  título novo ("O seu email") e a nota do preço guardado e dos
                  lembretes (auditoria do funil, n.º 2) esperam o OK do André
                  (revisão do PR #176); ver as chaves checkout.emailHoldNote e
                  checkout.emailReminderNote. */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-3">
                <h2 className="font-display text-[19px] text-pa-dark leading-snug">
                  {t("checkout.emailTitle", "Where should we send your booking?")}
                </h2>
                <label htmlFor="checkout-email" className="block caption font-medium text-pa-earth">
                  {t("checkout.emailLabel", "Your email")}
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (isValidEmail(e.target.value)) setEmailNudge(false);
                  }}
                  onBlur={() => setEmailTouched(true)}
                  placeholder={t("checkout.emailPh", "name@email.com")}
                  aria-describedby={isValidEmail(email) ? undefined : "checkout-email-hint"}
                  aria-invalid={(emailTouched && email.length > 0 && !isValidEmail(email)) || undefined}
                  className={cn(
                    "w-full h-[48px] border bg-white px-3 rounded-md body-sm text-pa-dark placeholder:text-pa-stone-aa focus:ring-1 focus:ring-pa-dark focus:border-pa-dark outline-none",
                    emailNudge && !isValidEmail(email) ? "border-pa-dark ring-1 ring-pa-dark" : "border-pa-sand",
                  )}
                />
                {emailTouched && email.length > 0 && !isValidEmail(email) && (
                  <p className="caption text-inherit text-red-500">{t("bookingWidget.invalidEmail", "Please enter a valid email address")}</p>
                )}
                {/* Opt-in sóbrio: sem "ofertas"/"newsletter", que leem como
                    spam e travam a entrada no funil logo no passo 1. Lidera
                    pela reserva, mas TEM de nomear o contacto futuro — é isso
                    que o torna consentimento válido para marketing (RGPD:
                    informado e específico). Sem essa parte a caixa só descreve
                    o email transacional e não autoriza campanhas. */}
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecked({ checked: newsletterOptIn, touched: newsletterTouched, restoredFor: consentRestoredFor, email })}
                    onChange={(e) => {
                      setNewsletterOptIn(e.target.checked);
                      setNewsletterTouched(true);
                    }}
                    className="mt-[1px] h-[14px] w-[14px] shrink-0 accent-pa-dark cursor-pointer"
                  />
                  <span className="caption text-pa-stone-aa leading-relaxed">
                    {t("checkout.newsletterOptIn", "Keep me updated by email.")}
                  </span>
                </label>
                {/* Nunca parado (auditoria do funil, n.º 2): sem email válido
                    leva ao campo e mostra a dica, em vez de não fazer nada. */}
                <button
                  type="button"
                  onClick={continueFromStay}
                  aria-busy={captureLead.isPending || undefined}
                  className="hidden lg:inline-flex btn-primary w-full"
                >
                  {captureLead.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : t("booking.continue", "Continue")}
                </button>
                {contactSaveError && (
                  <p className="caption text-red-600" role="alert">
                    {t("payment.errors.saveFailed")}
                  </p>
                )}
                {/* L2: o botão desativado sem dica era um toque morto */}
                {!isValidEmail(email) && !quoteStale && !datesUnavailable && (
                  <p
                    id="checkout-email-hint"
                    className={cn("caption", emailNudge ? "text-pa-dark font-medium" : "text-pa-stone-aa")}
                    role="status"
                  >
                    {email
                      ? t("checkout.emailInvalidHint", "That email doesn't look right — check it to continue.")
                      : t("checkout.emailNeededHint", "Enter your email above to continue.")}
                  </p>
                )}
                {/* Antes do portão do email: como se pode pagar e que ainda
                    não se cobra nada (auditoria do funil, crítico). */}
                <PaymentMethodsNote className="border-t border-pa-sand pt-3" total={todayTotal} />
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
                  className="caption text-pa-stone-aa hover:text-pa-dark transition-colors"
                >
                  ← {t("checkout.backToStay", "Back to your stay")}
                </button>
              </div>
              {/* Sem o painel "Rever tarifa e condições de cancelamento": a
                  tarifa escolhe-se no passo 1 (← acima) e a política já não se
                  repete aqui (auditoria do funil, n.º 11). */}

              {extrasQuery.isLoading ? (
                <div className="flex items-center justify-center py-10 gap-2 caption text-pa-stone-aa">
                  <Loader2 className="w-4 h-4 animate-spin" /> {t("checkout.loading", "Preparing your checkout…")}
                </div>
              ) : (
                <CustomizeStep
                  catalog={catalog}
                  included={includedKeys}
                  reception={receptionConfig}
                  receptionChoice={receptionChoice}
                  selection={extraSel}
                  nights={quote?.nights ?? 1}
                  guests={guests}
                  propertyName={displayName}
                  lang={lang}
                  destination={intent.destination ?? undefined}
                  defaultAirport={(extrasQuery.data as any)?.defaultAirport}
                  onToggle={toggleExtra}
                  onAdjust={adjustExtra}
                  onChooseReception={chooseReception}
                  onSkip={skipCustomize}
                  receptionNudge={receptionNudge}
                />
              )}
              {/* Flex closes the Personalizar step (spec §5/§6) — protection, not a
                  service. Rendered in full, never collapsed: hiding it behind a
                  <details> killed the attach rate (regressão de a4c2b55).
                  Só onde acrescenta dias à tarifa (flexOffered, n.º 14). */}
              {flexConfig && effective && flexOffered && (
                <FlexBlock
                  config={{ ...flexConfig, price: flexUnit }}
                  gifted={flexGifted}
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
              <button
                type="button"
                onClick={skipCustomize}
                className="hidden lg:inline-flex btn-primary w-full"
              >
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
                  className="caption text-pa-stone-aa hover:text-pa-dark transition-colors"
                >
                  ← {t("checkout.backToCustomize", "Back to personalization")}
                </button>
                <h1 className="headline-md text-pa-dark mb-1">{t("checkout.payTitle", "Payment")}</h1>
                <p className="body-sm">{t("checkout.paySubtitle", "Your details, then a secure payment.")}</p>
              </div>

              {/* Guest details */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-3">
                <p className="eyebrow font-medium tracking-[0.12em] uppercase text-pa-gold">
                  {t("bookingWidget.guestInformation", "Guest information")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="min-w-0">
                    <input
                      id={GUEST_FIELD_IDS.firstName}
                      type="text"
                      autoComplete="given-name"
                      aria-label={t("bookingWidget.firstNamePh")}
                      aria-invalid={firstNameError || undefined}
                      aria-describedby={firstNameError ? "checkout-first-name-error" : undefined}
                      placeholder={t("bookingWidget.firstNamePh")}
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className={cn(INPUT_CLASS, firstNameError ? "border-red-400" : "border-pa-sand")}
                    />
                    {firstNameError && (
                      <p id="checkout-first-name-error" className="caption text-red-600 mt-1">{t("checkout.fieldErrors.firstName")}</p>
                    )}
                  </div>
                  <div className="min-w-0">
                    <input
                      id={GUEST_FIELD_IDS.lastName}
                      type="text"
                      autoComplete="family-name"
                      aria-label={t("bookingWidget.lastNamePh")}
                      aria-invalid={lastNameError || undefined}
                      aria-describedby={lastNameError ? "checkout-last-name-error" : undefined}
                      placeholder={t("bookingWidget.lastNamePh")}
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={cn(INPUT_CLASS, lastNameError ? "border-red-400" : "border-pa-sand")}
                    />
                    {lastNameError && (
                      <p id="checkout-last-name-error" className="caption text-red-600 mt-1">{t("checkout.fieldErrors.lastName")}</p>
                    )}
                  </div>
                </div>
                {/* O email do passo 1 não se pede outra vez: uma linha, e o campo
                    só abre se o hóspede o quiser mudar (ou se não for válido). */}
                {showEmailField ? (
                  <div>
                    <input
                      id={GUEST_FIELD_IDS.email}
                      type="email"
                      autoComplete="email"
                      aria-label={t("bookingWidget.emailPh")}
                      aria-invalid={emailError || undefined}
                      aria-describedby={emailError ? "checkout-pay-email-error" : undefined}
                      placeholder={t("bookingWidget.emailPh")}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      className={cn(INPUT_CLASS, emailError ? "border-red-400" : "border-pa-sand")}
                    />
                    {emailError && (
                      <p id="checkout-pay-email-error" className="caption text-red-600 mt-1">{t("bookingWidget.invalidEmail", "Please enter a valid email address")}</p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-0 body-sm">
                    <span className="text-pa-earth shrink-0">{t("checkout.emailLineLabel")}</span>
                    <span className="text-pa-dark font-medium truncate min-w-0">{email}</span>
                    <span aria-hidden className="text-pa-stone-aa shrink-0">·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailEditing(true);
                        window.requestAnimationFrame(() => document.getElementById(GUEST_FIELD_IDS.email)?.focus());
                      }}
                      className="shrink-0 inline-flex items-center text-pa-gold-aa underline underline-offset-2 hover:text-pa-dark transition-colors"
                    >
                      {t("checkout.emailChange")}
                    </button>
                  </div>
                )}
                <div>
                  <PhoneInput
                    id={GUEST_FIELD_IDS.phone}
                    value={phone}
                    onChange={setPhone}
                    onBlur={() => setPhoneTouched(true)}
                    placeholder={t("bookingWidget.phonePh", "Phone number *")}
                    describedBy={phoneError ? "checkout-phone-error" : undefined}
                    invalid={phoneError}
                  />
                  {phoneError && (
                    <p id="checkout-phone-error" className="caption text-red-600 mt-1" role="alert">{phoneErrorText}</p>
                  )}
                </div>
                <div>
                  {/* Teclado de texto: um nº de IVA de outro país tem letras (DE…, ESB…, NL…B01) */}
                  <input
                    id="checkout-nif"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={20}
                    aria-label={t("checkout.nifPh")}
                    aria-describedby={nifIssue ? "checkout-nif-hint" : undefined}
                    value={nif}
                    onChange={(e) => setNif(e.target.value)}
                    placeholder={t("checkout.nifPh", "NIF — optional, for a Portuguese invoice")}
                    className={cn(INPUT_CLASS, "border-pa-sand")}
                  />
                  {/* Só um NIF português tem dígito de controlo; o aviso é suave e nunca bloqueia o pagamento */}
                  {nifIssue && (
                    <p id="checkout-nif-hint" className="caption text-pa-earth mt-1 leading-snug" role="status">{t("checkout.nifInvalid")}</p>
                  )}
                </div>
              </div>

              {offer && !redirectFinalizing && (
                <PaymentPlanSelector
                  offer={offer}
                  plan={plan}
                  onPlanChange={(p) => { setPlan(p); if (p === "full") setMandateAccepted(false); }}
                  lang={lang}
                />
              )}

              {/* Payment: monta logo que há preço. Os Termos (e a autorização da
                  2.ª parte) e a frase da política ficam mesmo acima do botão. */}
              <div className="bg-white border border-pa-sand rounded-lg p-5 space-y-4">
                {redirectFinalizing ? (
                  <div className="flex items-center justify-center gap-3 py-8" role="status">
                    <Loader2 className="w-5 h-5 animate-spin text-pa-gold" />
                    <p className="body-sm text-pa-dark">{t("checkout.confirmingPayment", "Payment received — confirming your booking…")}</p>
                  </div>
                ) : quoteId && effective && !quoteStale ? (
                  <CheckoutPaymentForm
                    demo={isDemo}
                    demoDecline={demoDecline}
                    termsAccepted={termsAccepted}
                    consent={consentBlock}
                    validateGuest={validateGuestForPay}
                    walletsReady={walletsReady}
                    conciergeHref={conciergeHref}
                    twoPartsSwitch={twoPartsSwitch}
                    onTwoPartsUnavailable={() => {
                      setPlan("full");
                      setMandateAccepted(false);
                      if (!isDemo) void intentQuery.refetch();
                    }}
                    onMandateMissing={() => focusField("checkout-mandate")}
                    onBeforePay={flushPendingSaves}
                    onQuoteExpired={() => setQuoteStale(true)}
                    listingId={intent.listingId}
                    checkIn={checkIn}
                    checkOut={checkOut}
                    guests={guests}
                    quoteId={quoteId}
                    ratePlanId={effective.ratePlanId ?? selectedRatePlanId ?? ""}
                    total={payTotal}
                    currency="EUR"
                    plan={offer ? plan : undefined}
                    mandateAccepted={mandateAccepted}
                    payLaterCaption={twoParts && offer ? t("payment.payNowAfter", { amountLater: formatQuotedEur(offer.balanceCents / 100, lang), date: planLaterDate }) : undefined}
                    otherMethodsTotal={todayTotal}
                    propertyName={intent.propertyName || displayName}
                    destination={intent.destination || undefined}
                    guestName={`${firstName.trim()} ${lastName.trim()}`}
                    guestEmail={email}
                    guestPhone={phone}
                    notes={extrasNote || undefined}
                    intentId={intent.id}
                    couponCode={quote?.couponCode || undefined}
                    purchaseItems={purchaseItems}
                    paymentItems={[buildPropertyItem({
                      id: intent.listingId, name: intent.propertyName || displayName,
                      destination: intent.destination || undefined,
                      priceFrom: effective.nightlyRate,
                    }, { nights: quote?.nights, checkinDate: checkIn, checkoutDate: checkOut, guests }), ...purchaseItems]}
                    onSuccess={handleCardSuccess}
                  />
                ) : (
                  // Sem preço confirmado não há botão: o banner acima diz como o atualizar.
                  <p className="caption text-pa-earth" role="status">{t("checkout.refreshBeforePay", "Refresh the price above before paying.")}</p>
                )}
                <p className="flex items-center justify-center gap-1.5 caption text-pa-stone-aa">
                  <Lock className="w-3 h-3" /> {t("checkout.secureNote", "Encrypted, secure payment")}
                </p>
              </div>
            </>
          )}
        </section>

        {/* Reserva direta (mobile): no fim de cada passo, sempre visível */}
        <div className="lg:hidden mt-8">{directBlock}</div>

        {/* ══════════ SUMMARY COLUMN (desktop) ══════════ */}
        <aside className="hidden lg:block sticky top-[84px] space-y-4">{summaryCard}{directBlock}</aside>
      </main>

      {/* Keeps in-flow content (desktop Continue CTA) scrollable clear of the
          fixed cookie banner; collapses to 0 the moment consent is given. */}
      <div aria-hidden style={{ height: "var(--cookie-banner-h, 0px)" }} />

      {/* ══════════ MOBILE: bottom bar + expandable summary sheet ══════════ */}
      {/* Sits directly on top of the cookie banner while consent is pending. */}
      <div className="lg:hidden fixed inset-x-0 z-40" style={{ bottom: "var(--cookie-banner-h, 0px)" }}>
        {sheetOpen && (
          <div className="max-h-[60vh] overflow-y-auto bg-white border-t border-pa-sand px-5 pt-4 pb-3 shadow-[0_-8px_32px_rgba(26,26,24,0.10)] space-y-4 checkout-step-in">
            <div className="flex items-center gap-3">
              {thumbImage && (
                <img src={thumbImage} alt="" className="w-14 h-14 rounded-md object-cover shrink-0" width={56} height={56} />
              )}
              <div className="min-w-0">
                <p className="font-display body-sm text-pa-dark leading-snug truncate">{displayName}</p>
                <p className="caption text-pa-earth mt-0.5">
                  {formatBookingDate(checkIn, lang)} → {formatBookingDate(checkOut, lang)} · {guests} {t("booking.guestsLabel", "guests")}
                </p>
              </div>
            </div>
            {summaryLines}
            {couponRow}
            {conciergeRequests}
            {guaranteeLabel && (
              <p className="flex items-start gap-1.5 caption text-pa-gold leading-snug">
                <Clock3 className="w-3 h-3 shrink-0 mt-[1px]" /> {guaranteeLabel}
              </p>
            )}
          </div>
        )}
        {/* Com o banner de cookies por baixo, a barra não repete a margem da
            zona segura (o banner já a tem): menos ecrã tapado no passo 1. */}
        <div className="bg-white border-t border-pa-sand px-4 py-3 flex items-center justify-between gap-3" style={{ paddingBottom: "calc(0.75rem + max(0px, env(safe-area-inset-bottom, 0px) - var(--cookie-banner-h, 0px)))" }}>
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            className="flex items-center gap-1.5 text-left"
            aria-expanded={sheetOpen}
          >
            <div>
              <p className="body-lg font-medium text-pa-dark tabular-nums leading-tight">
                {!effective ? "—" : twoParts && offer
                  ? t("checkout.bar.todayLabel", { amountNow: formatQuotedEur(offer.depositCents / 100, lang) })
                  : formatQuotedEur(animatedTotal, lang)}
              </p>
              {twoParts && offer && (
                <p className="caption text-pa-earth tabular-nums leading-tight">
                  {t("checkout.bar.laterLabel", { amountLater: formatQuotedEur(offer.balanceCents / 100, lang), date: planLaterDate })}
                </p>
              )}
              <p className="caption text-pa-stone-aa flex items-center gap-1">
                {t("checkout.viewDetails", "View details")}
                {sheetOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
              </p>
            </div>
          </button>
          {step === "stay" && (
            // Nunca parado (auditoria do funil, n.º 2): era o único botão do
            // passo no telemóvel e, sem email, um toque não fazia nada.
            <button
              type="button"
              onClick={continueFromStay}
              aria-busy={captureLead.isPending || undefined}
              className="btn-primary flex-1 max-w-[220px]"
            >
              {captureLead.isPending ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : t("booking.continue", "Continue")}
            </button>
          )}
          {step === "customize" && (
            <button
              type="button"
              onClick={skipCustomize}
              className="btn-primary flex-1 max-w-[220px]"
            >
              {t("booking.continue", "Continue")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
