import express, { type Express, type Request, type Response } from "express";
import { constructStripeKlarnaWebhookEvent, getPaymentIntent, updatePaymentIntentMetadata } from "../services/stripe-klarna";
import { createReservationViaOpenApi, recordExternalPayment } from "../services/guesty-openapi-paypal";
import { getOrCreateReservation } from "../lib/paypal-idempotency";
import type Stripe from "stripe";

const processedPaymentIntents = new Set<string>();

export function registerStripeKlarnaWebhookRoute(app: Express): void {
  app.post(
    "/api/webhooks/stripe-klarna",
    express.raw({ type: "*/*" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        res.status(400).json({ error: "Missing stripe-signature header" });
        return;
      }

      let event: Stripe.Event;
      try {
        event = constructStripeKlarnaWebhookEvent(
          Buffer.isBuffer(req.body) ? req.body : Buffer.from(""),
          sig
        );
      } catch (err: any) {
        console.warn(`[StripeKlarnaWebhook] Invalid signature: ${err.message}`);
        res.status(400).json({ error: "Invalid webhook signature" });
        return;
      }

      res.status(200).json({ received: true });

      if (event.type !== "payment_intent.succeeded") return;

      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.source !== "website-klarna") return;

      if (processedPaymentIntents.has(pi.id)) {
        console.info(`[StripeKlarnaWebhook] Already processed ${pi.id}, skipping`);
        return;
      }
      processedPaymentIntents.add(pi.id);
      if (processedPaymentIntents.size > 10_000) {
        const first = processedPaymentIntents.values().next().value;
        if (first) processedPaymentIntents.delete(first);
      }

      setImmediate(async () => {
        try {
          const meta = pi.metadata;
          const stripePort = {
            getMetadata: async (id: string) => (await getPaymentIntent(id)).metadata ?? {},
            setMetadata: (id: string, partial: Record<string, string>) => updatePaymentIntentMetadata(id, partial),
          };
          const reservation = await getOrCreateReservation(pi.id, stripePort, {
            createReservation: () =>
              createReservationViaOpenApi({
                listingId: meta.listingId,
                checkIn: meta.checkIn,
                checkOut: meta.checkOut,
                guestFirstName: meta.guestName.split(" ")[0] || meta.guestName,
                guestLastName: meta.guestName.split(" ").slice(1).join(" ") || meta.guestName,
                guestEmail: meta.guestEmail,
                numberOfAdults: Number(meta.numberOfAdults) || 2,
                numberOfChildren: Number(meta.numberOfChildren) || 0,
                numberOfInfants: Number(meta.numberOfInfants) || 0,
                stripePaymentIntentId: pi.id,
              }),
            recordPayment: (reservationId: string) =>
              recordExternalPayment(reservationId, pi.amount / 100, pi.currency.toUpperCase(), pi.id),
          });

          console.info(`[StripeKlarnaWebhook] Reservation ready: ${reservation.reservationId} (${reservation.confirmationCode}) for PI ${pi.id}`);
        } catch (err: any) {
          console.error("[StripeKlarnaWebhook] CRITICAL: Webhook reservation failed", {
            paymentIntentId: pi.id,
            error: err.message,
          });
        }
      });
    }
  );
}
