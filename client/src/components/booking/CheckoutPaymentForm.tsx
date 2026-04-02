/**
 * On-site checkout with Stripe PaymentElement (multi-payment-method support).
 * Uses "deferred intent" mode — no server-side PaymentIntent needed.
 * Guesty Booking Engine handles the actual charge; we pass a payment method token.
 *
 * Requires: BE-API + STRIPE_PUBLISHABLE_KEY (from Guesty-connected Stripe account).
 */

import { useState, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { trpc } from "@/lib/trpc";

const EUR = "\u20AC";

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
  const { t } = useTranslation();
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
      appearance: {
        theme: "stripe" as const,
        variables: {
          colorPrimary: "#1A1A18",
          colorBackground: "#ffffff",
          colorText: "#1A1A18",
          fontFamily: "var(--font-body), Arial, sans-serif",
          borderRadius: "4px",
        },
      },
    }),
    [props.total, props.currency],
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

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentFormInner {...props} />
    </Elements>
  );
}
