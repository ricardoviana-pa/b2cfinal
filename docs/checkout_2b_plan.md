# Phase 2b — Single Platform Charge: implementation plan

Decision context: `docs/HANDOVER.md` §3 + `docs/checkout_pending.md` section A banner.
**Foundation SHIPPED:** `server/services/checkout-pricing.ts` — canonical server-side money math (`computeChargeBreakdown`), unit-tested: stay/reception/extras/flex in cents, day-clamp vs nights, on_request excluded, client-amount divergence detection. **Every step below MUST charge/validate with this function — never a client value.**

## Wiring (build on the hardened Klarna rails — commits 33d2d80/c66f647)

1. **PI creation** — new tRPC mutation `booking.createCardCheckoutIntent({ intentId })`:
   - Load intent server-side; require status ≠ paid; `computeChargeBreakdown(intent)` → `totalCents`.
   - Model on `createKlarnaPaymentIntent` (`server/services/stripe-klarna.ts:41`) with `payment_method_types: ['card']` (+ `automatic_payment_methods` later for wallets), platform account.
   - Metadata: `{ flow: 'card_v2', intentId, listingId, quoteId, stayCents, extrasCents, receptionCents, flexCents }`.
   - Return `clientSecret`.
2. **Client** — `CheckoutPaymentForm.tsx`: when `intentId` present (v2), swap the deferred-pm→Guesty path for standard `stripe.confirmPayment({ elements, clientSecret })`. Legacy widget (no intentId) keeps the Guesty `/instant` path untouched — same flag discipline as the rest of v2.
3. **Webhook** — clone `server/routes/stripe-klarna-webhook.ts` → `stripe-card-webhook.ts` (raw body, registered before `express.json()` in `server/_core`): on `payment_intent.succeeded` with `metadata.flow === 'card_v2'`:
   - Re-run `computeChargeBreakdown` from the intent and **verify `pi.amount === totalCents`** (defense vs stale PI after a requote — mismatch → refund PI, mark intent `payment_pending`, alert).
   - Create the Guesty reservation via the existing Open API path (`guesty-openapi-paypal.ts`) with **the STAY amount only** + `recordExternalPayment` (capped to balanceDue — helper already exists) + reservation note with the ops manifest.
   - Patch intent → `paid` (fires the existing paid hook: CS manifest + guest confirmation + Guesty note). Reuse the idempotency layers from `server/lib/paypal-idempotency.ts`.
4. **Requote invalidation** — any requote/coupon change after PI creation must void the old PI (`stripe.paymentIntents.cancel`) or recreate; simplest: create the PI lazily at pay-click, not at step-3 mount.
5. **Partial refund** — helper `refundCheckoutLine(intentId, sku)`: `stripe.refunds.create({ payment_intent, amount: lineCents })` using `breakdown.lines`; used by ops when a `needs_confirmation` line fails (interim: manual via Stripe dashboard is acceptable at launch).
6. **Copy** — step 3 already promises a single charge; once this lands the promise is TRUE. Remove the interim "charged after confirmation" note for fixed-price extras.

## Test plan (dev, Stripe TEST keys)
- Card 4242… on dev with 1 extra + reception + Flex → ONE PI for the exact `computeChargeBreakdown` total; Guesty reservation shows STAY only, marked externally paid; CS email itemizes everything; owner statement unaffected by extras.
- Requote after PI created → old PI unusable, new total charged.
- Divergent client amount (tamper) → charge still equals server math.
- Partial refund of one line → guest gets exactly that line back.

## Explicitly out of scope here
Wallets via ExpressCheckoutElement (next, easy on platform PI), Multibanco/MB Way, invoice emission for the services charge (accountant question pending).
