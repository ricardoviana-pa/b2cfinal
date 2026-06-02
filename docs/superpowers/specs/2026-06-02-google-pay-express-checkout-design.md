# Google Pay — Express Checkout Element Design

**Date:** 2026-06-02
**Status:** Approved

## Problem

The current Google Pay implementation has a rendering conflict: `paymentMethodTypes: ["google_pay"]` (restrict the PaymentElement to Google Pay only) is set alongside `wallets: { googlePay: "never" }` (suppress the Google Pay wallet button). These cancel each other — the user sees an empty payment form when selecting Google Pay.

The Stripe documentation recommends the **Express Checkout Element (ECE)** for wallet-based payment methods.

## Goal

Replace the broken PaymentElement-based Google Pay with the Express Checkout Element, which renders the native Google Pay button and handles device authentication. No server-side changes required.

## Architecture

### What changes

| File | Change |
|------|--------|
| `client/src/components/booking/GooglePayButton.tsx` | **Create** — ECE-based component inside Elements context |
| `client/src/components/booking/CheckoutPaymentForm.tsx` | **Modify** — wire GooglePayButton, fix elementsOptions, add googlePayError state |

### What stays the same

- `server/routers/booking.ts` — `createBEInstantReservation` mutation unchanged
- PayPal and Klarna flows unchanged
- Card flow unchanged

### Payment flow (Google Pay)

```
User selects Google Pay tab
  → Elements renders GooglePayButton (ECE, wallets: { googlePay: "always" })
  → Native Google Pay sheet appears
  → User authenticates (biometric / password)
  → onConfirm fires:
      1. elements.submit() — validates
      2. stripe.createPaymentMethod({ elements }) — creates pm_xxxxx
      3. createBEInstantReservation({ ccToken: pm_.id, ...bookingData })
      4. Navigate to /booking/confirmation/:reservationId
```

This is identical to the card payment flow server-side — both produce a `pm_` token sent to Guesty.

## Component Design

### `GooglePayButton.tsx`

Lives **inside** the `<Elements>` context (unlike PayPal/Klarna which are standalone). Uses `useStripe()` and `useElements()` hooks.

**Props** (same shape as `PaymentFormInner`):

```typescript
interface GooglePayButtonProps {
  // booking context
  quoteId: string;
  ratePlanId: string;
  listingId: string;
  checkIn: string;
  checkOut: string;
  guestEmail: string;
  guestPhone?: string;
  guests?: number;
  total: number;
  currency?: string;
  propertyName?: string;
  propertyImage?: string;
  destination?: string;
  // handlers
  onCancel: () => void;
  onSuccess: (reservationId: string, confirmationCode: string) => void;
}
```

**Render:** `<ExpressCheckoutElement options={{ wallets: { googlePay: "always", applePay: "never" } }} onConfirm={handleConfirm} />`

**`onConfirm` handler:**
1. `elements.submit()` — if error: `event.paymentFailed({ reason: "fail" })`, set error state
2. `stripe.createPaymentMethod({ elements })` — if error: `event.paymentFailed({ reason: "fail" })`, set error state
3. Call `createBEInstantReservation` mutation with `ccToken: paymentMethod.id` + booking data
4. On success: navigate to confirmation
5. On Guesty error: `event.paymentFailed({ reason: "fail" })`, set error state

**Error display:** same banner pattern as PayPal/Klarna error (`bg-[#F5F1EB] border border-[#DC2626]`).

### `CheckoutPaymentForm.tsx` changes

1. **Import** `GooglePayButton` from `./GooglePayButton`
2. **`elementsOptions`** — exclude `paymentMethodTypes` for googlepay (currently it passes `["google_pay"]`, which conflicts with ECE):
   ```typescript
   // Before: paymentMethod !== "paypal" && paymentMethod !== "klarna"
   // After: paymentMethod === "card" (only card needs the explicit paymentMethodTypes)
   ...(paymentMethod === "card" ? { paymentMethodTypes: ["card"] } : {}),
   ```
3. **Render condition** — inside the `<Elements>` wrapper, render `GooglePayButton` when googlepay is selected, `PaymentFormInner` otherwise:
   ```tsx
   {paymentMethod !== "paypal" && paymentMethod !== "klarna" && (
     <Elements key={paymentMethod} stripe={stripePromise} options={elementsOptions}>
       {paymentMethod === "googlepay"
         ? <GooglePayButton {...props} onCancel={props.onCancel} onSuccess={handleSuccess} />
         : <PaymentFormInner {...props} />
       }
     </Elements>
   )}
   ```
4. **Error state** — `GooglePayButton` manages its own error state internally (no `googlePayError` in `CheckoutPaymentForm`). The `key={paymentMethod}` on `<Elements>` remounts the component on method switch, clearing any internal state automatically.

## Domain Registration (Stripe Dashboard — required)

Before Google Pay can render in production, all domains showing a Google Pay button must be registered:

1. Go to Stripe Dashboard → **Settings → Payment method domains**
2. Add domain(s): `yourdomain.com`, `www.yourdomain.com` (each subdomain is separate)
3. For local testing: also register `localhost` or use Stripe's test page

This is a one-time setup per domain. Not required for the code to compile, but required for Google Pay to appear for users.

## Testing

1. Register a test domain in Stripe Dashboard test mode (or use localhost)
2. Add a real card to a Google account to make Google Pay appear in the device wallet
3. Use Google's [Test card suite](https://developers.google.com/pay/api/android/guides/resources/test-card-suite) with Stripe test cards
4. Select Google Pay in the checkout → native sheet should appear → authorize → confirm reservation created in Guesty

## What is NOT in scope

- Apple Pay (the `applePay: "never"` option keeps it disabled)
- Server-side changes
- PayPal or Klarna changes
- Domain registration automation (manual dashboard step)
