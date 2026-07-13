import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@stripe/stripe-js";
import { trpc } from "@/lib/trpc";
import { formatEur } from "@/lib/format";
import { pushEcommerce } from "@/lib/datalayer";

interface PayPalCheckoutButtonProps {
  amount: number;           // currency units (e.g. 500.00)
  currency: string;         // "eur"
  listingId: string;
  checkIn: string;
  checkOut: string;
  guestDetails: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
  };
  numberOfGuests: {
    adults: number;
    children: number;
    infants: number;
  };
  propertyName?: string;
  destination?: string;
  // Rate plan the guest selected — carried through so the Guesty reservation is
  // created on the correct plan (right price + cancellation terms).
  ratePlanId?: string;
  /** Checkout 2.0: intent id — return page marks the intent paid after confirmation */
  intentId?: string;
  /** Promo code applied to the quote — carried through for GA4 purchase attribution */
  couponCode?: string;
  // Platform Stripe publishable key (NOT the per-listing connected account key)
  stripePublishableKey: string;
  onError: (msg: string) => void;
}

export function PayPalCheckoutButton(props: PayPalCheckoutButtonProps) {
  const { t, i18n } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const createPayPalPI = trpc.booking.createPayPalPaymentIntent.useMutation();

  const handleClick = async () => {
    setIsProcessing(true);
    setStatusMsg(t("payment.preparingPaypal"));

    // GA4: add_payment_info — must fire before the redirect navigates away
    pushEcommerce({
      event: "add_payment_info",
      payment_type: "paypal",
      property_id: props.listingId,
      ecommerce: { currency: "EUR", value: props.amount },
    });

    try {
      // Load platform Stripe — do NOT pass stripeAccount option.
      // PayPal PaymentIntents live on the platform account, not the connected account.
      const stripe = await loadStripe(props.stripePublishableKey);
      if (!stripe) throw new Error("Stripe failed to load");

      const returnUrl = `${window.location.origin}/booking/paypal-return`;

      // Persist booking data before redirect so the return page can complete the reservation
      sessionStorage.setItem(
        "paypal_booking_data",
        JSON.stringify({
          listingId: props.listingId,
          checkIn: props.checkIn,
          checkOut: props.checkOut,
          guestFirstName: props.guestDetails.firstName,
          guestLastName: props.guestDetails.lastName,
          guestEmail: props.guestDetails.email,
          guestPhone: props.guestDetails.phone,
          numberOfAdults: props.numberOfGuests.adults,
          numberOfChildren: props.numberOfGuests.children,
          numberOfInfants: props.numberOfGuests.infants,
          totalAmount: props.amount,
          currency: props.currency,
          ratePlanId: props.ratePlanId,
          propertyName: props.propertyName,
          destination: props.destination,
          intentId: props.intentId,
          couponCode: props.couponCode,
        })
      );

      const { clientSecret } = await createPayPalPI.mutateAsync({
        amount: Math.round(props.amount * 100),
        currency: props.currency.toLowerCase(),
        listingId: props.listingId,
        checkIn: props.checkIn,
        checkOut: props.checkOut,
        guestEmail: props.guestDetails.email,
        guestName: `${props.guestDetails.firstName} ${props.guestDetails.lastName}`,
        numberOfAdults: props.numberOfGuests.adults,
        numberOfChildren: props.numberOfGuests.children,
        numberOfInfants: props.numberOfGuests.infants,
        ratePlanId: props.ratePlanId,
        returnUrl,
      });

      setStatusMsg(t("payment.redirecting"));

      const { error } = await (stripe as any).confirmPayPalPayment(clientSecret, {
        return_url: returnUrl,
      });

      if (error) {
        throw new Error(error.message || "PayPal payment failed");
      }
      // Normal path: confirmPayPalPayment redirects the browser to PayPal,
      // so execution doesn't continue here.
    } catch (err: any) {
      sessionStorage.removeItem("paypal_booking_data");
      setIsProcessing(false);
      setStatusMsg("");
      props.onError(err.message || "PayPal payment failed. Please try again.");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isProcessing}
      style={{
        width: "100%",
        padding: "14px 20px",
        background: isProcessing ? "#888" : "#003087",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        fontSize: "15px",
        fontWeight: 600,
        cursor: isProcessing ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {isProcessing ? statusMsg : t("payment.payWithPaypal", { amount: formatEur(props.amount, i18n.language) })}
    </button>
  );
}
