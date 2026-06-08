/**
 * On-site checkout with Stripe PaymentElement (multi-payment-method support).
 * Uses "deferred intent" mode — no server-side PaymentIntent needed.
 * Guesty Booking Engine handles the actual charge; we pass a payment method token.
 *
 * Requires: BE-API + STRIPE_PUBLISHABLE_KEY (from Guesty-connected Stripe account).
 */

import { useState, useMemo, useRef, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { trpc } from "@/lib/trpc";
import { PayPalCheckoutButton } from "./PayPalCheckoutButton";
import { KlarnaCheckoutButton } from "./KlarnaCheckoutButton";

const EUR = "\u20AC";

type PaymentMethodId = "card" | "googlepay" | "paypal" | "klarna";

const STRIPE_METHOD_TYPES: Record<Exclude<PaymentMethodId, "paypal" | "klarna">, string[]> = {
  card: ["card"],
  googlepay: ["google_pay"],
};

function CardLogo() {
  return (
    <svg width="36" height="25" viewBox="0 0 36 25" fill="none" aria-label="Card" role="img">
      <rect x="0.6" y="0.6" width="34.8" height="23.8" rx="4" fill="#fff" stroke="#d9d9e1" strokeWidth="1.2" />
      <rect x="0.6" y="5" width="34.8" height="5" fill="#3a3a46" />
      <rect x="5" y="15.5" width="11" height="3" rx="1.5" fill="#cfcfd8" />
      <rect x="24" y="15" width="7" height="5" rx="1.2" fill="#f0a92e" />
    </svg>
  );
}

function GooglePayLogo() {
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: "4px", lineHeight: 1 }}
      aria-label="Google Pay"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.182l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.71H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.582C13.463.892 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
      <span style={{ fontWeight: 500, fontSize: "13px", color: "#5F6368" }}>Pay</span>
    </span>
  );
}

function PayPalLogo() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontWeight: 700,
        fontStyle: "italic",
        fontSize: "16px",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
      aria-label="PayPal"
    >
      <span style={{ color: "#003087" }}>Pay</span>
      <span style={{ color: "#009cde" }}>Pal</span>
    </span>
  );
}

function KlarnaLogo() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffb3c7",
        borderRadius: "5px",
        padding: "3px 8px",
        lineHeight: 1,
      }}
      aria-label="Klarna"
    >
      <span style={{ color: "#17120f", fontWeight: 700, fontSize: "12px" }}>Klarna</span>
    </span>
  );
}

const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; Logo: () => ReactElement }> = [
  { id: "card",      label: "Card",       Logo: CardLogo },
  { id: "googlepay", label: "Google Pay", Logo: GooglePayLogo },
  { id: "paypal",    label: "PayPal",     Logo: PayPalLogo },
  { id: "klarna",    label: "Klarna",     Logo: KlarnaLogo },
];

function parseApiError(msg: string, t: any): string {
  if (!msg) return t('payment.errors.defaultError');
  if (/Guesty auth failed:\s*429|429|rate limit|Too Many Requests/i.test(msg)) {
    return t('payment.errors.rateLimitError');
  }
  try {
    const parsed = JSON.parse(msg);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const p = parsed[0];
      if (p.path?.includes?.("guestEmail")) return t('payment.errors.invalidEmail');
      if (p.path?.includes?.("guestPhone")) return t('payment.errors.invalidPhone');
      if (p.message) return p.message;
    }
  } catch {
    /* not JSON */
  }
  if (msg.includes("invalid") && msg.toLowerCase().includes("email")) return t('payment.errors.invalidEmail');
  if (msg.includes("invalid") && msg.toLowerCase().includes("phone")) return t('payment.errors.invalidPhone');
  if (msg.length > 120) return t('payment.errors.genericError');
  return msg;
}

interface CheckoutPaymentFormProps {
  listingId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  quoteId: string;
  ratePlanId: string;
  total: number;
  currency: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  propertyName: string;
  destination?: string;
  notes?: string;
  onSuccess: (confirmationCode: string) => void;
  onCancel: () => void;
}

/** Policy acceptance object sent to Guesty BE API instant booking */
function buildPolicyPayload() {
  return {
    termsAndConditions: { accepted: true, acceptedAt: new Date().toISOString() },
    cancellationPolicy: { accepted: true, acceptedAt: new Date().toISOString() },
    privacyPolicy: { accepted: true, acceptedAt: new Date().toISOString() },
  };
}

function PaymentFormInner({
  listingId,
  checkIn,
  checkOut,
  guests,
  quoteId,
  ratePlanId,
  total,
  guestName,
  guestEmail,
  guestPhone,
  onSuccess,
  onCancel,
  notes,
  propertyName,
  destination,
}: Omit<CheckoutPaymentFormProps, "currency">) {
  const { t, i18n } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submittedRef = useRef(false);
  const createReservation = trpc.booking.createBEInstantReservation.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittedRef.current) return;
    if (!stripe || !elements || !guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
      setError(t('payment.errors.requiredFields'));
      return;
    }

    submittedRef.current = true;
    setLoading(true);
    setError("");

    // Step 1: Validate the PaymentElement form (safe to retry — no charge yet)
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || t('payment.errors.cardValidationFailed'));
      setLoading(false);
      submittedRef.current = false; // Safe: no payment method created yet
      return;
    }

    // Step 2: Create payment method from PaymentElement (safe to retry — no charge yet)
    let paymentMethod;
    try {
      const { error: stripeError, paymentMethod: pm } = await stripe.createPaymentMethod({
        elements,
        params: {
          billing_details: {
            address: { country: "PT", postal_code: "" },
          },
        },
      });

      if (stripeError) {
        setError(stripeError.message || t('payment.errors.cardValidationFailed'));
        setLoading(false);
        submittedRef.current = false;
        return;
      }

      if (!pm?.id) {
        setError(t('payment.errors.couldNotCreatePaymentMethod'));
        setLoading(false);
        submittedRef.current = false;
        return;
      }

      paymentMethod = pm;
    } catch (stripeException: any) {
      setError(stripeException?.message || t('payment.errors.cardValidationFailed'));
      setLoading(false);
      submittedRef.current = false;
      return;
    }

    // ═══════════════════════════════════════════════════════════════
    // Step 3: POINT OF NO RETURN — Send PM to Guesty for charging
    // After this point, the card MAY be charged. We NEVER reset
    // submittedRef unless the error clearly indicates no charge.
    // ═══════════════════════════════════════════════════════════════
    try {
      const response = await Promise.race([
        createReservation.mutateAsync({
          quoteId,
          ratePlanId,
          ccToken: paymentMethod.id,
          guestName,
          guestEmail,
          guestPhone,
          policy: buildPolicyPayload(),
          listingId,
          propertyName,
          destination,
          checkIn,
          checkOut,
          guests,
          totalPrice: total,
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("Payment provider timeout")), 45000);
        }),
      ]);
      onSuccess(response.confirmationCode);
    } catch (err: any) {
      const message = parseApiError(err?.message || t('payment.errors.defaultError'), t);
      const rawMsg = String(err?.message || "").toLowerCase();

      // Only allow retry if we're confident the card was NOT charged:
      // - Validation errors (email, phone, dates)
      // - Rate limiting (request didn't reach Guesty's payment processor)
      // - Dates already booked by someone else
      const safeToRetry =
        rawMsg.includes("invalid") ||
        rawMsg.includes("email") ||
        rawMsg.includes("phone") ||
        rawMsg.includes("429") ||
        rawMsg.includes("rate limit") ||
        rawMsg.includes("just been booked") ||
        rawMsg.includes("not available") ||
        rawMsg.includes("check your details");

      if (safeToRetry) {
        submittedRef.current = false;
        setError(message);
      } else {
        // Potentially charged — do NOT allow retry.
        // Show error with contact info so guest can verify.
        setError(
          message + "\n\n" +
          t('payment.errors.contactSupport', {
            defaultValue: "If you were charged, please contact us at reservations@portugalactive.com or WhatsApp +351 927 161 771. Do not attempt to pay again."
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 bg-white border border-[#E8E4DC] rounded">
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: { googlePay: "never", applePay: "never" },
            fields: { billingDetails: { address: { country: "never", postalCode: "never" } } },
          }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-[#F5F1EB] border border-[#DC2626] rounded-md">
          <span className="text-[#DC2626] mt-0.5 shrink-0" aria-hidden>&#9888;</span>
          <p className="text-[#DC2626] text-sm leading-snug">{error}</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={!stripe || loading || !guestName.trim() || !guestEmail.trim() || !guestPhone.trim()}
          className="btn-primary w-full disabled:opacity-50"
        >
          {loading ? t('payment.processing') : t('payment.payButton', { currency: EUR, amount: total })}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          {t('payment.cancelButton')}
        </button>
      </div>
    </form>
  );
}

export default function CheckoutPaymentForm(props: CheckoutPaymentFormProps) {
  const { t, i18n } = useTranslation();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
  const [hoveredMethod, setHoveredMethod] = useState<PaymentMethodId | null>(null);
  const [paypalError, setPaypalError] = useState("");
  const [klarnaError, setKlarnaError] = useState("");
  const { data: stripeConfig, isLoading: stripeConfigLoading } = trpc.booking.getStripeConfig.useQuery();
  // Per-listing payment provider: fetch the Stripe connected account for this property
  const { data: paymentProvider, isLoading: providerLoading } = trpc.booking.getPaymentProvider.useQuery(
    { listingId: props.listingId },
    { enabled: !!props.listingId },
  );

  // Per-listing Stripe connected account is the ONLY source of truth.
  // Never fall back to stripeConfig.stripeAccountId (env var may be wrong/stale).
  const stripeAccountId = paymentProvider?.providerAccountId || null;

  // Hooks must be called unconditionally before any early returns.
  const stripePromise = useMemo(
    () => {
      if (!stripeConfig?.publishableKey) return null;
      return loadStripe(
        stripeConfig.publishableKey,
        stripeAccountId ? { stripeAccount: stripeAccountId } : undefined,
      );
    },
    [stripeConfig?.publishableKey, stripeAccountId],
  );

  // Deferred intent mode: PaymentElement without a client secret.
  // We pass mode + amount + currency so Stripe knows the context.
  const elementsOptions = useMemo(
    () => ({
      mode: "payment" as const,
      amount: Math.round(props.total * 100), // Stripe expects cents
      currency: (props.currency || "eur").toLowerCase(),
      paymentMethodCreation: "manual" as const,
      locale: i18n.language as any,
      ...(paymentMethod !== "paypal" && paymentMethod !== "klarna"
        ? { paymentMethodTypes: STRIPE_METHOD_TYPES[paymentMethod] }
        : {}),
      appearance: {
        theme: "stripe" as const,
        variables: {
          colorPrimary: "#1A1A18",
          colorBackground: "#ffffff",
          colorText: "#1A1A18",
          fontFamily: "var(--font-body), Arial, sans-serif",
          borderRadius: "4px",
        },
        rules: {
          // Hide Stripe's built-in payment method tab selector — we use our own selector UI
          ".p-PaymentMethodSelector": { display: "none" },
        },
      },
    }),
    [props.total, props.currency, i18n.language, paymentMethod],
  );

  // CRITICAL: Wait for BOTH queries to settle before rendering Stripe Elements.
  // Without this, the component renders with the wrong Stripe account (from env var)
  // and then re-mounts when the per-listing account loads, breaking the PaymentElement.
  if (stripeConfigLoading || providerLoading) {
    return (
      <div className="flex items-center justify-center py-8 gap-2 text-sm text-black/40">
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
        Preparing secure payment...
      </div>
    );
  }

  if (!stripeConfig?.publishableKey || !stripePromise) {
    return null;
  }

  const nameParts = props.guestName.trim().split(/\s+/);
  const guestFirstName = nameParts[0] || props.guestName;
  const guestLastName = nameParts.slice(1).join(" ") || guestFirstName;

  return (
    <div className="space-y-4">
      {/* Payment method selector — 3 icon cards (Google Pay hidden) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "9px" }}>
        {PAYMENT_METHODS.filter(({ id }) => id !== "googlepay").map(({ id, label, Logo }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setPaymentMethod(id); setPaypalError(""); setKlarnaError(""); }}
            onMouseEnter={() => setHoveredMethod(id)}
            onMouseLeave={() => setHoveredMethod(null)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "11px",
              padding: "18px 8px 15px",
              borderRadius: "12px",
              cursor: "pointer",
              background: paymentMethod === id ? "#F5F1EB" : "#ffffff",
              border: `1.5px solid ${
                paymentMethod === id
                  ? "#8B7355"
                  : hoveredMethod === id
                  ? "#D4D4DC"
                  : "#E8E4DC"
              }`,
              boxShadow: hoveredMethod === id && paymentMethod !== id
                ? "0 4px 14px rgba(20,20,40,.08)"
                : "none",
              transition: "all .16s ease",
              fontFamily: "inherit",
            }}
          >
            <div style={{ height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Logo />
            </div>
            <span
              style={{
                fontSize: "12.5px",
                fontWeight: paymentMethod === id ? 600 : 500,
                color: paymentMethod === id ? "#8B7355" : "#45433d",
                textAlign: "center",
              }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      {paymentMethod !== "paypal" && paymentMethod !== "klarna" && (
        <Elements key={paymentMethod} stripe={stripePromise} options={elementsOptions}>
          <PaymentFormInner {...props} />
        </Elements>
      )}

      {paymentMethod === "paypal" && (
        <div className="space-y-3">
          {paypalError && (
            <div className="flex items-start gap-2 p-3 bg-[#F5F1EB] border border-[#DC2626] rounded-md">
              <span className="text-[#DC2626] mt-0.5 shrink-0" aria-hidden>&#9888;</span>
              <p className="text-[#DC2626] text-sm leading-snug">{paypalError}</p>
            </div>
          )}
          <PayPalCheckoutButton
            amount={props.total}
            currency={props.currency || "eur"}
            listingId={props.listingId}
            checkIn={props.checkIn}
            checkOut={props.checkOut}
            guestDetails={{
              firstName: guestFirstName,
              lastName: guestLastName,
              email: props.guestEmail,
              phone: props.guestPhone || undefined,
            }}
            numberOfGuests={{
              adults: props.guests || 2,
              children: 0,
              infants: 0,
            }}
            propertyName={props.propertyName}
            destination={props.destination}
            stripePublishableKey={stripeConfig.publishableKey}
            onError={(msg) => setPaypalError(msg)}
          />
          <button type="button" onClick={props.onCancel} className="btn-ghost w-full">
            {t('payment.cancelButton')}
          </button>
        </div>
      )}

      {paymentMethod === "klarna" && (
        <div className="space-y-3">
          {klarnaError && (
            <div className="flex items-start gap-2 p-3 bg-[#F5F1EB] border border-[#DC2626] rounded-md">
              <span className="text-[#DC2626] mt-0.5 shrink-0" aria-hidden>&#9888;</span>
              <p className="text-[#DC2626] text-sm leading-snug">{klarnaError}</p>
            </div>
          )}
          <KlarnaCheckoutButton
            amount={props.total}
            currency={props.currency || "eur"}
            listingId={props.listingId}
            checkIn={props.checkIn}
            checkOut={props.checkOut}
            guestDetails={{
              firstName: guestFirstName,
              lastName: guestLastName,
              email: props.guestEmail,
              phone: props.guestPhone || undefined,
            }}
            numberOfGuests={{
              adults: props.guests || 2,
              children: 0,
              infants: 0,
            }}
            propertyName={props.propertyName}
            destination={props.destination}
            stripePublishableKey={stripeConfig.publishableKey}
            onError={(msg) => setKlarnaError(msg)}
          />
          <button type="button" onClick={props.onCancel} className="btn-ghost w-full">
            {t('payment.cancelButton')}
          </button>
        </div>
      )}
    </div>
  );
}
