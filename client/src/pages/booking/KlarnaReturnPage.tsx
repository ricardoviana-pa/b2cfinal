import { useEffect, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import { trpc } from "@/lib/trpc";
import { pushPurchaseOnce } from "@/lib/datalayer";
import { stashThankYou } from "@/lib/booking-api";
import PaymentProcessing from "@/components/booking/PaymentProcessing";

let platformStripePromise: ReturnType<typeof loadStripe> | null = null;
function getPlatformStripe(publishableKey: string) {
  if (!platformStripePromise) {
    platformStripePromise = loadStripe(publishableKey);
  }
  return platformStripePromise;
}

/** Translatable status: key + interpolation params + explicit failure flag (no string sniffing). */
interface ReturnStatus {
  key: string;
  params?: Record<string, unknown>;
  failed?: boolean;
}

export default function KlarnaReturnPage() {
  const { t } = useTranslation();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<ReturnStatus>({ key: "paymentReturn.verifying" });
  const processed = useRef(false);

  const { data: stripeConfig } = trpc.booking.getStripeConfig.useQuery();
  const confirmBooking = trpc.booking.confirmKlarnaBooking.useMutation();

  useEffect(() => {
    if (processed.current || !stripeConfig?.publishableKey) return;

    const params = new URLSearchParams(search);
    const clientSecret = params.get("payment_intent_client_secret");
    const paymentIntentId = params.get("payment_intent");

    if (!clientSecret || !paymentIntentId) {
      setStatus({ key: "paymentReturn.missingInfo", failed: true });
      return;
    }

    const bookingDataRaw = sessionStorage.getItem("klarna_booking_data");
    if (!bookingDataRaw) {
      setStatus({ key: "paymentReturn.dataLost", params: { ref: paymentIntentId }, failed: true });
      return;
    }

    let bookingData: any;
    try {
      bookingData = JSON.parse(bookingDataRaw);
    } catch {
      setStatus({ key: "paymentReturn.dataCorrupted", failed: true });
      return;
    }

    processed.current = true;

    getPlatformStripe(stripeConfig.publishableKey).then(async (stripe) => {
      if (!stripe) {
        setStatus({ key: "paymentReturn.processorUnavailable", failed: true });
        return;
      }

      const { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);

      if (!paymentIntent) {
        setStatus({ key: "paymentReturn.verifyFailed", failed: true });
        return;
      }

      if (paymentIntent.status === "succeeded") {
        setStatus({ key: "paymentReturn.confirmedCreating" });
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

          // Deduped by transaction_id — the thank-you page also reports this
          // purchase, but only the first push wins (pushPurchaseOnce).
          pushPurchaseOnce(result.confirmationCode, {
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
                checkin_date: bookingData.checkIn,
                checkout_date: bookingData.checkOut,
                guests_adults: bookingData.numberOfAdults || undefined,
              }],
            },
          });

          navigate(`/booking/thank-you/${result.reservationId}?method=klarna`);
        } catch (err: any) {
          setStatus({ key: "paymentReturn.reservationFailed", params: { ref: paymentIntentId }, failed: true });
        }
      } else if (paymentIntent.status === "processing") {
        setStatus({ key: "paymentReturn.stillProcessing" });
      } else {
        setStatus({ key: "paymentReturn.notCompleted", failed: true });
      }
    });
  }, [stripeConfig?.publishableKey, search]);

  return <PaymentProcessing status={t(status.key, status.params as any) as string} failed={!!status.failed} />;
}
