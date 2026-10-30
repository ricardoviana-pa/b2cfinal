import { useState } from "react";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@/lib/stripeLoader";
import { trpc } from "@/lib/trpc";
import { formatQuotedEur } from "@/lib/format";
import { pushEcommerce } from "@/lib/datalayer";
import { klarnaBillingCountry } from "@shared/klarna";

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
  /** País de faturação do hóspede (shared/klarna.ts: telefone → língua → PT).
   *  Vai ao servidor, que o valida e devolve o país com que se confirma. */
  billingCountry?: string;
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

export function KlarnaCheckoutButton(props: KlarnaCheckoutButtonProps) {
  const { t, i18n } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const createKlarnaPI = trpc.booking.createKlarnaPaymentIntent.useMutation();

  const handleClick = async () => {
    if (isProcessing || props.disabled) return;
    if (props.demo) { props.onDemo?.(); return; }
    // Checkout 2.0: dados do hóspede validados antes de qualquer pagamento
    if (props.onBeforeStart && !props.onBeforeStart()) return;
    setIsProcessing(true);
    setStatusMsg(t("payment.preparingKlarna"));

    // GA4: add_payment_info — must fire before the redirect navigates away
    pushEcommerce({
      event: "add_payment_info",
      payment_type: "klarna",
      property_id: props.listingId,
      ecommerce: { currency: "EUR", value: props.amount, items: props.paymentItems },
    });

    let stage: "server" | "confirm" = "server";
    try {
      // Estado pendente (extras, dados do hóspede) gravado ANTES de criar o
      // pagamento: o servidor valida o valor contra o que está na BD.
      await props.onBeforePay?.();
      const stripe = await loadStripe(props.stripePublishableKey);
      if (!stripe) throw new Error("Stripe failed to load");

      // intent no URL de retorno: se o PayPal/Klarna abrir noutra tab ou na app,
      // o sessionStorage não viaja — o intent permite à return page retomar
      // via servidor (auditoria set/2026, H9)
      const returnUrl = `${window.location.origin}/booking/klarna-return${props.intentId ? `?intent=${props.intentId}` : ""}`;

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
          ratePlanId: props.ratePlanId,
          propertyName: props.propertyName,
          destination: props.destination,
          intentId: props.intentId,
          couponCode: props.couponCode,
          purchaseItems: props.purchaseItems,
        })
      );

      // País de faturação real do hóspede (até 29 out 2026 ia sempre "PT", e
      // quem não era cliente Klarna em Portugal era recusado em qualquer valor).
      const billingCountry = props.billingCountry ?? klarnaBillingCountry({ siteLang: i18n.language });
      const created = await createKlarnaPI.mutateAsync({
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
        // Checkout 2.0: o servidor valida o amount contra o breakdown canónico
        // do intent (tolerância 1 EUR) e cobra sempre a matemática do servidor
        intentId: props.intentId,
        billingCountry,
        locale: i18n.language,
      });
      const { clientSecret } = created;
      // O servidor decide o país (valida-o, e pode forçar PT pelo interruptor
      // de emergência): confirma-se com o que ele devolveu.
      const confirmCountry = (created as { billingCountry?: string }).billingCountry || billingCountry;

      setStatusMsg(t("payment.redirecting"));

      stage = "confirm";
      const { error } = await (stripe as any).confirmKlarnaPayment(clientSecret, {
        payment_method: {
          billing_details: {
            name: `${props.guestDetails.firstName} ${props.guestDetails.lastName}`,
            email: props.guestDetails.email,
            address: { country: confirmCountry },
          },
        },
        return_url: returnUrl,
      });

      if (error) {
        // Mantém o code/decline_code da Stripe para o aviso traduzido e o payment_failed
        throw Object.assign(new Error(error.message || "Klarna payment failed"), {
          type: error.type, code: error.code, decline_code: error.decline_code,
        });
      }
    } catch (err: unknown) {
      sessionStorage.removeItem("klarna_booking_data");
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
        background: "#FFA8CD",
        color: "#0B051D",
        opacity: isProcessing ? 0.65 : props.disabled ? 0.5 : 1,
        border: "none",
        borderRadius: "4px",
        fontSize: "15px",
        fontWeight: 600,
        cursor: inactive ? "not-allowed" : "pointer",
        letterSpacing: "0.04em",
      }}
    >
      {isProcessing ? statusMsg : t("payment.payWithKlarna", { amount: formatQuotedEur(props.amount, i18n.language) })}
    </button>
  );
}
