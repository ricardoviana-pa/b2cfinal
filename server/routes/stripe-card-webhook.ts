/**
 * 2b: rede de segurança do cartao de plataforma — se o cliente morrer antes do
 * finalize, o webhook cria a reserva e marca o intent pago (sem emails; o
 * caminho normal e o finalize sincrono do cliente, que dispara os hooks).
 */
import type { Express, Request, Response } from "express";
import express from "express";
import { cardWebhookSecretFromSetup } from "../services/stripe-card-webhook-setup";

export function registerStripeCardWebhookRoute(app: Express) {
  app.post("/api/webhooks/stripe-card", express.raw({ type: "application/json" }), async (req: Request, res: Response) => {
    try {
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") return res.status(400).send("missing signature");
      const secret =
        process.env.STRIPE_CARD_WEBHOOK_SECRET ||
        cardWebhookSecretFromSetup() ||
        process.env.STRIPE_KLARNA_WEBHOOK_SECRET;
      if (!secret) return res.status(500).send("webhook secret not configured");
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
      const event = stripe.webhooks.constructEvent(req.body, sig, secret);
      if (event.type === "payment_intent.succeeded") {
        const pi = event.data.object as any;
        if (pi.metadata?.flow === "card_v2" && pi.metadata?.intentId) {
          const { settleCardCharge } = await import("../services/checkout-card-charge");
          const { updateBookingIntent, getBookingIntent } = await import("../db");
          const r = await settleCardCharge(pi.metadata.intentId, pi.id);
          const m = await getBookingIntent(pi.metadata.intentId);
          if (m && (m as any).status !== "paid") {
            await updateBookingIntent(pi.metadata.intentId, { status: "paid" } as any);
            console.info(`[Card2b] webhook finalizou intent ${pi.metadata.intentId} → ${r.confirmationCode}`);
          }
        }
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error("[Card2b] webhook error:", err?.message);
      res.status(400).send(`Webhook Error: ${err?.message}`);
    }
  });
}
