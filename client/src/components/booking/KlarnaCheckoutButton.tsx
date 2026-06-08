import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { trpc } from "@/lib/trpc";

interface KlarnaCheckoutButtonProps {
  amount: number;
  currency: string;
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
  // Platform Stripe publishable key (NOT the per-listing connected account key)
  stripePublishableKey: string;
  onError: (msg: string) => void;
}

export function KlarnaCheckoutButton(props: KlarnaCheckoutButtonProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const createKlarnaPI = trpc.booking.createKlarnaPaymentIntent.useMutation();

  const handleClick = async () => {
    setIsProcessing(true);
    setStatusMsg("Preparing Klarna payment…");

    try {
      const stripe = await loadStripe(props.stripePublishableKey);
      if (!stripe) throw new Error("Stripe failed to load");

      const returnUrl = `${window.location.origin}/booking/klarna-return`;

      sessionStorage.setItem(
        "klarna_booking_data",
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
          propertyName: props.propertyName,
          destination: props.destination,
        })
      );

      const { clientSecret } = await createKlarnaPI.mutateAsync({
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
      });

      setStatusMsg("Redirecting to Klarna…");

      const { error } = await (stripe as any).confirmKlarnaPayment(clientSecret, {
        payment_method: {
          billing_details: {
            name: `${props.guestDetails.firstName} ${props.guestDetails.lastName}`,
            email: props.guestDetails.email,
            address: { country: "PT" },
          },
        },
        return_url: returnUrl,
      });

      if (error) {
        throw new Error(error.message || "Klarna payment failed");
      }
    } catch (err: any) {
      sessionStorage.removeItem("klarna_booking_data");
      setIsProcessing(false);
      setStatusMsg("");
      props.onError(err.message || "Klarna payment failed. Please try again.");
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
        background: isProcessing ? "#888" : "#17120f",
        color: "#fff",
        border: "none",
        borderRadius: "4px",
        fontSize: "15px",
        fontWeight: 600,
        cursor: isProcessing ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {isProcessing ? statusMsg : "Pay with Klarna"}
    </button>
  );
}
