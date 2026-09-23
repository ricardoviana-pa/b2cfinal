import { useEffect, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { loadStripe } from "@/lib/stripeLoader";
import { trpc } from "@/lib/trpc";
import { pushPurchaseOnce } from "@/lib/datalayer";
import { stashThankYou } from "@/lib/booking-api";
import PaymentProcessing from "@/components/booking/PaymentProcessing";

// Platform Stripe instance (NO stripeAccount — platform key, not per-listing connected account).
// Klarna PaymentIntents live on the platform account, so we must NOT pass stripeAccount here.
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
  /** Dinheiro capturado, reserva pendente — título próprio, nunca "não concluído" */
  paidPending?: boolean;
}

export default function KlarnaReturnPage() {
  const { t, i18n } = useTranslation();
  const search = useSearch();
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<ReturnStatus>({ key: "paymentReturn.verifying" });
  const processed = useRef(false);

  const { data: stripeConfig } = trpc.booking.getStripeConfig.useQuery();
  const confirmBooking = trpc.booking.confirmKlarnaBooking.useMutation();
  const utils = trpc.useUtils();

  const params = new URLSearchParams(search);
  const intentParam = params.get("intent");
  const lang = (i18n.language || "en").slice(0, 2);
  const checkoutHref = intentParam ? `/${lang}/checkout/${intentParam}` : `/${lang}/homes`;

  useEffect(() => {
    if (processed.current || !stripeConfig?.publishableKey) return;

    const params = new URLSearchParams(search);
    const clientSecret = params.get("payment_intent_client_secret");
    const paymentIntentId = params.get("payment_intent");
    const intentId = params.get("intent");

    if (!clientSecret || !paymentIntentId) {
      setStatus({ key: "paymentReturn.missingInfo", failed: true });
      return;
    }

    /** H9: sem sessionStorage (Klarna abriu na app/nova tab) mas com o intent
     *  no URL, o webhook do servidor fecha a reserva — aqui só se espera por
     *  ela, perguntando ao intent, e segue-se para o obrigado. */
    const pollIntentPaid = (piRef: string) => {
      processed.current = true;
      setStatus({ key: "paymentReturn.webhookFallback" });
      let tries = 0;
      const iv = window.setInterval(async () => {
        tries++;
        try {
          const r = await utils.checkout.getIntent.fetch({ intentId: intentId! });
          const it: any = r?.intent;
          if (it?.status === "paid" && it.reservationId) {
            window.clearInterval(iv);
            navigate(`/booking/thank-you/${it.reservationId}?method=klarna`);
            return;
          }
        } catch { /* rede — tentar de novo no próximo tick */ }
        if (tries >= 24) {
          window.clearInterval(iv);
          setStatus({ key: "paymentReturn.webhookTimeout", params: { ref: piRef }, failed: true });
        }
      }, 5_000);
    };

    const bookingDataRaw = sessionStorage.getItem("klarna_booking_data");
    if (!bookingDataRaw) {
      if (intentId) {
        pollIntentPaid(paymentIntentId);
      } else {
        setStatus({ key: "paymentReturn.dataLost", params: { ref: paymentIntentId }, failed: true });
      }
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

      let { paymentIntent } = await stripe.retrievePaymentIntent(clientSecret);

      if (!paymentIntent) {
        setStatus({ key: "paymentReturn.verifyFailed", failed: true });
        return;
      }

      // "processing" não é terminal: o Klarna liquida em segundos — sondar em
      // vez de girar para sempre (auditoria set/2026, H9).
      if (paymentIntent.status === "processing") {
        setStatus({ key: "paymentReturn.stillProcessing" });
        for (let tries = 0; tries < 24 && paymentIntent.status === "processing"; tries++) {
          await new Promise((r) => setTimeout(r, 5_000));
          const again = await stripe.retrievePaymentIntent(clientSecret);
          if (again.paymentIntent) paymentIntent = again.paymentIntent;
        }
        if (paymentIntent.status === "processing") {
          setStatus({ key: "paymentReturn.webhookTimeout", params: { ref: paymentIntentId }, failed: true });
          return;
        }
      }

      if (paymentIntent.status === "succeeded") {
        setStatus({ key: "paymentReturn.confirmedCreating" });
        try {
          const result = await confirmBooking.mutateAsync({
            paymentIntentId,
            ...bookingData,
          });

          const totalPaidCents = result.totalPaidCents ?? paymentIntent.amount;

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
            totalCents: totalPaidCents,
            currency: (bookingData.currency || "EUR").toUpperCase(),
            couponCode: bookingData.couponCode || undefined,
          });

          sessionStorage.removeItem("klarna_booking_data");

          // Deduped by transaction_id — the thank-you page also reports this
          // purchase, but only the first push wins (pushPurchaseOnce).
          pushPurchaseOnce(result.confirmationCode, {
            event: "purchase",
            ecommerce: {
              transaction_id: result.confirmationCode,
              value: totalPaidCents / 100,
              currency: (bookingData.currency || "EUR").toUpperCase(),
              ...(bookingData.couponCode ? { coupon: bookingData.couponCode } : {}),
              items: [{
                item_id: `PROP-${bookingData.listingId}`,
                item_name: bookingData.propertyName || "Portugal Active Home",
                item_category: "villa",
                price: totalPaidCents / 100,
                quantity: 1,
                checkin_date: bookingData.checkIn,
                checkout_date: bookingData.checkOut,
                guests_adults: bookingData.numberOfAdults || undefined,
              },
              // Bloco 6: serviços comprados (extras, receção, Flex) — o
              // purchase leva o carrinho completo em todos os métodos
              ...(Array.isArray(bookingData.purchaseItems) ? bookingData.purchaseItems : [])],
            },
          });

          navigate(`/booking/thank-you/${result.reservationId}?method=klarna`);
        } catch (err: any) {
          // Dinheiro capturado, reserva pendente: o webhook do servidor fecha.
          // Com intent no URL, esperar por ele; sem, dizer a verdade (pago,
          // em confirmação) em vez de "Payment Not Completed".
          if (intentId) {
            processed.current = false;
            pollIntentPaid(paymentIntentId);
          } else {
            setStatus({ key: "paymentReturn.reservationFailed", params: { ref: paymentIntentId }, failed: true, paidPending: true });
          }
        }
      } else {
        setStatus({ key: "paymentReturn.notCompleted", failed: true });
      }
    });
  }, [stripeConfig?.publishableKey, search]);

  return (
    <PaymentProcessing
      status={t(status.key, status.params as any) as string}
      failed={!!status.failed}
      title={status.paidPending ? (t("paymentReturn.paidPendingTitle") as string) : undefined}
      action={
        status.failed ? (
          <a href={checkoutHref} className="btn-primary inline-flex px-6">
            {intentParam
              ? t("paymentReturn.backToCheckout", "Back to your checkout")
              : t("paymentReturn.backToHomes", "Browse homes")}
          </a>
        ) : undefined
      }
    />
  );
}
