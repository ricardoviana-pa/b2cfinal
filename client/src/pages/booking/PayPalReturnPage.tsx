import { useEffect, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { trpc } from "@/lib/trpc";
import { pushEcommerce } from "@/lib/datalayer";

// Platform Stripe instance (NO stripeAccount — platform key, not per-listing connected account).
// PayPal PaymentIntents live on the platform account, so we must NOT pass stripeAccount here.
let platformStripePromise: ReturnType<typeof loadStripe> | null = null;
function getPlatformStripe(publishableKey: string) {
  if (!platformStripePromise) {
    platformStripePromise = loadStripe(publishableKey);
  }
  return platformStripePromise;
}

export default function PayPalReturnPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState("Verifying your payment…");
  const processed = useRef(false);

  const { data: stripeConfig } = trpc.booking.getStripeConfig.useQuery();
  const confirmBooking = trpc.booking.confirmPayPalBooking.useMutation();

  useEffect(() => {
    if (processed.current || !stripeConfig?.publishableKey) return;

    const params = new URLSearchParams(search);
    const clientSecret = params.get("payment_intent_client_secret");
    const paymentIntentId = params.get("payment_intent");

    if (!clientSecret || !paymentIntentId) {
      setStatus("Error: Missing payment information. Please contact support.");
      return;
    }

    const bookingDataRaw = sessionStorage.getItem("paypal_booking_data");
    if (!bookingDataRaw) {
      setStatus(`Error: Booking data was lost. Please contact support with reference: ${paymentIntentId}`);
      return;
    }

    let bookingData: any;
    try {
      bookingData = JSON.parse(bookingDataRaw);
    } catch {
      setStatus("Error: Corrupted booking data. Please contact support.");
      return;
    }

    processed.current = true;

    getPlatformStripe(stripeConfig.publishableKey).then(async (stripe) => {
      if (!stripe) {
        setStatus("Error: Payment processor unavailable.");
        return;
      }

      const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);

      if (!paymentIntent) {
        setStatus("Error: Could not verify payment status.");
        return;
      }

      if (paymentIntent.status === "succeeded") {
        setStatus("Payment confirmed! Creating your reservation…");
        try {
          const result = await confirmBooking.mutateAsync({
            paymentIntentId,
            ...bookingData,
          });

          sessionStorage.removeItem("paypal_booking_data");

          pushEcommerce({
            event: "purchase",
            ecommerce: {
              transaction_id: result.confirmationCode,
              value: bookingData.totalAmount,
              currency: (bookingData.currency || "EUR").toUpperCase(),
              items: [{
                item_id: `PROP-${bookingData.listingId}`,
                item_name: bookingData.propertyName || "Portugal Active Home",
                item_category: "villa",
                price: bookingData.totalAmount,
                quantity: 1,
              }],
            },
          });

          navigate(`/booking/confirmation/${result.reservationId}`);
        } catch (err: any) {
          setStatus(
            `Payment received but reservation failed. Our team has been notified. Reference: ${paymentIntentId}`
          );
        }
      } else if (paymentIntent.status === "processing") {
        setStatus("Payment is still processing. Please wait a moment and refresh.");
      } else {
        setStatus("Payment was not completed. Please try again or use a different payment method.");
      }
    });
  }, [stripeConfig?.publishableKey, search]);

  return (
    <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>Processing Your Booking</h1>
      <p style={{ color: "#6B6860", fontSize: "16px" }}>{status}</p>
    </div>
  );
}
