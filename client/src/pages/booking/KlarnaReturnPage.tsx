import { useEffect, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { loadStripe } from "@stripe/stripe-js";
import { trpc } from "@/lib/trpc";
import { pushEcommerce } from "@/lib/datalayer";
import { stashThankYou } from "@/lib/booking-api";

let platformStripePromise: ReturnType<typeof loadStripe> | null = null;
function getPlatformStripe(publishableKey: string) {
  if (!platformStripePromise) {
    platformStripePromise = loadStripe(publishableKey);
  }
  return platformStripePromise;
}

export default function KlarnaReturnPage() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState("Verifying your payment…");
  const processed = useRef(false);

  const { data: stripeConfig } = trpc.booking.getStripeConfig.useQuery();
  const confirmBooking = trpc.booking.confirmKlarnaBooking.useMutation();

  useEffect(() => {
    if (processed.current || !stripeConfig?.publishableKey) return;

    const params = new URLSearchParams(search);
    const clientSecret = params.get("payment_intent_client_secret");
    const paymentIntentId = params.get("payment_intent");

    if (!clientSecret || !paymentIntentId) {
      setStatus("Error: Missing payment information. Please contact support.");
      return;
    }

    const bookingDataRaw = sessionStorage.getItem("klarna_booking_data");
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

          stashThankYou({
            reservationId: result.reservationId,
            confirmationCode: result.confirmationCode,
            status: result.status,
            method: "klarna",
            listingName: bookingData.propertyName || "",
            location: bookingData.destination || "",
            checkIn: bookingData.checkIn,
            checkOut: bookingData.checkOut,
            guestsCount:
              (bookingData.numberOfAdults || 0) +
              (bookingData.numberOfChildren || 0) +
              (bookingData.numberOfInfants || 0),
            guestName: `${bookingData.guestFirstName || ""} ${bookingData.guestLastName || ""}`.trim(),
            guestEmail: bookingData.guestEmail || "",
            guestPhone: bookingData.guestPhone || "",
            totalCents:
              bookingData.totalAmount != null ? Math.round(Number(bookingData.totalAmount) * 100) : null,
            currency: (bookingData.currency || "EUR").toUpperCase(),
          });

          sessionStorage.removeItem("klarna_booking_data");

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

          navigate(`/booking/thank-you/${result.reservationId}?method=klarna`);
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
