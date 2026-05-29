import express, { type Express, type Request, type Response } from "express";
import { constructStripePayPalWebhookEvent } from "../services/stripe-paypal";
import { createReservationViaOpenApi, recordExternalPayment } from "../services/guesty-openapi-paypal";
import type Stripe from "stripe";

// In-memory idempotency guard — prevents duplicate reservations when the
// return page and the webhook both try to create the same reservation.
const processedPaymentIntents = new Set<string>();

export function registerStripePayPalWebhookRoute(app: Express): void {
  app.post(
    "/api/webhooks/stripe-paypal",
    express.raw({ type: "*/*" }),
    async (req: Request, res: Response) => {
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        res.status(400).json({ error: "Missing stripe-signature header" });
        return;
      }

      let event: Stripe.Event;
      try {
        event = constructStripePayPalWebhookEvent(
          Buffer.isBuffer(req.body) ? req.body : Buffer.from(""),
          sig
        );
      } catch (err: any) {
        console.warn(`[StripePayPalWebhook] Invalid signature: ${err.message}`);
        res.status(400).json({ error: "Invalid webhook signature" });
        return;
      }

      res.status(200).json({ received: true });

      if (event.type !== "payment_intent.succeeded") return;

      const pi = event.data.object as Stripe.PaymentIntent;
      if (pi.metadata?.source !== "website-paypal") return;

      if (processedPaymentIntents.has(pi.id)) {
        console.info(`[StripePayPalWebhook] Already processed ${pi.id}, skipping`);
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
          const reservation = await createReservationViaOpenApi({
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
          });

          await recordExternalPayment(
            reservation.reservationId,
            pi.amount / 100,
            pi.currency.toUpperCase(),
            pi.id
          );

          console.info(`[StripePayPalWebhook] Reservation created: ${reservation.reservationId} (${reservation.confirmationCode}) for PI ${pi.id}`);
        } catch (err: any) {
          console.error("[StripePayPalWebhook] CRITICAL: Webhook reservation failed", {
            paymentIntentId: pi.id,
            error: err.message,
          });
        }
      });
    }
  );
}
