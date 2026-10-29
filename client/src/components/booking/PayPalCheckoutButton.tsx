import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@/lib/stripeLoader";
import { trpc } from "@/lib/trpc";
import { formatQuotedEur } from "@/lib/format";
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
  /** Bloco 6: items GA4 dos serviços (extras, receção, Flex) para o purchase da return page */
  purchaseItems?: Array<Record<string, unknown>>;
  /** Analytics only; never sent to the payment or reservation API. */
  paymentItems?: Array<Record<string, unknown>>;
  // Platform Stripe publishable key (NOT the per-listing connected account key)
  stripePublishableKey: string;
  /** Termos (checkout 2.0) por aceitar: o botão fica inativo. */
  disabled?: boolean;
  /** Checkout 2.0: valida nome, email e telefone no clique; false = nada é criado. */
  onBeforeStart?: () => boolean;
  /** Grava o estado pendente do intent antes de criar o pagamento. */
  onBeforePay?: () => Promise<void>;
  /** O erro original (com o code da Stripe, quando o há) e onde falhou. */
  onError: (error: unknown, stage: "server" | "confirm") => void;
  /** /checkout/demo: nunca cria pagamento nem eventos. */
  demo?: boolean;
  onDemo?: () => void;
}

export function PayPalCheckoutButton(props: PayPalCheckoutButtonProps) {
  const { t, i18n } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const createPayPalPI = trpc.booking.createPayPalPaymentIntent.useMutation();

  const handleClick = async () => {
    if (isProcessing || props.disabled) return;
    if (props.demo) { props.onDemo?.(); return; }
    // Checkout 2.0: dados do hóspede validados antes de qualquer pagamento
    if (props.onBeforeStart && !props.onBeforeStart()) return;
    setIsProcessing(true);
    setStatusMsg(t("payment.preparingPaypal"));

    // GA4: add_payment_info — must fire before the redirect navigates away
    pushEcommerce({
      event: "add_payment_info",
      payment_type: "paypal",
      property_id: props.listingId,
      ecommerce: { currency: "EUR", value: props.amount, items: props.paymentItems },
    });

    let stage: "server" | "confirm" = "server";
    try {
      // Estado pendente (extras, dados do hóspede) gravado ANTES de criar o
      // pagamento: o servidor valida o valor contra o que está na BD.
      await props.onBeforePay?.();
      // Load platform Stripe — do NOT pass stripeAccount option.
      // PayPal PaymentIntents live on the platform account, not the connected account.
      const stripe = await loadStripe(props.stripePublishableKey);
      if (!stripe) throw new Error("Stripe failed to load");

      // intent no URL de retorno: se o PayPal/Klarna abrir noutra tab ou na app,
      // o sessionStorage não viaja — o intent permite à return page retomar
      // via servidor (auditoria set/2026, H9)
      const returnUrl = `${window.location.origin}/booking/paypal-return${props.intentId ? `?intent=${props.intentId}` : ""}`;

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
          purchaseItems: props.purchaseItems,
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
        // Checkout 2.0: o servidor valida o amount contra o breakdown canónico
        // do intent (tolerância 1 EUR) e cobra sempre a matemática do servidor
        intentId: props.intentId,
      });

      setStatusMsg(t("payment.redirecting"));

      stage = "confirm";
      const { error } = await (stripe as any).confirmPayPalPayment(clientSecret, {
        return_url: returnUrl,
      });

      if (error) {
        // Mantém o code/decline_code da Stripe para o aviso traduzido e o payment_failed
        throw Object.assign(new Error(error.message || "PayPal payment failed"), {
          type: error.type, code: error.code, decline_code: error.decline_code,
        });
      }
      // Normal path: confirmPayPalPayment redirects the browser to PayPal,
      // so execution doesn't continue here.
    } catch (err: unknown) {
      sessionStorage.removeItem("paypal_booking_data");
      setIsProcessing(false);
      setStatusMsg("");
      props.onError(err, stage);
    }
  };

  const inactive = isProcessing || !!props.disabled;
  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={inactive}
      style={{
        width: "100%",
        padding: "14px 20px",
        background: isProcessing ? "#888" : "#003087",
        color: "#fff",
        opacity: props.disabled && !isProcessing ? 0.5 : 1,
        border: "none",
        borderRadius: "4px",
        fontSize: "15px",
        fontWeight: 600,
        cursor: inactive ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {isProcessing ? statusMsg : t("payment.payWithPaypal", { amount: formatQuotedEur(props.amount, i18n.language) })}
    </button>
  );
}
