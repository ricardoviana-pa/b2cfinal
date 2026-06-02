# Payment Method Selector — Design Spec

**Date:** 2026-05-31  
**Status:** Approved  
**Scope:** `client/src/components/booking/CheckoutPaymentForm.tsx`

---

## Context

The checkout form currently shows two plain toggle buttons — "Card / Apple Pay / MB Way" and "PayPal" — to switch between payment paths. The goal is to replace this section with a **Large Icon Cards** selector: a 4-column grid of branded payment method cards that gives the user a clear, visually polished choice before the payment form appears below.

No new payment integrations are required. Stripe's `PaymentElement` already handles Card, Google Pay, Klarna, and Apple Pay / MB Way internally. PayPal uses the existing `PayPalCheckoutButton` redirect flow, unchanged.

---

## Payment Methods

| Card | ID | Stripe flow |
|------|----|-------------|
| Card | `card` | `Elements` with `paymentMethodTypes: ['card']` |
| Google Pay | `googlepay` | `Elements` with `paymentMethodTypes: ['google_pay']` |
| PayPal | `paypal` | Existing `PayPalCheckoutButton` component |
| Klarna | `klarna` | `Elements` with `paymentMethodTypes: ['klarna']` |

**Default:** `card` — always pre-selected on mount, never changes on re-renders.

---

## Architecture (Approach A — remount per method)

```
paymentMethod: 'card' | 'googlepay' | 'klarna' | 'paypal'   (useState, default 'card')

<PaymentMethodGrid>          ← new UI section (inline in CheckoutPaymentForm)
  [Card] [Google Pay] [PayPal] [Klarna]   ← 4 icon cards

{paymentMethod !== 'paypal' && (
  <Elements
    key={paymentMethod}                   ← forces remount on method change
    stripe={stripePromise}
    options={{ ...existing, paymentMethodTypes: [stripeType] }}
  >
    <PaymentElement />                   ← Stripe hides tabs automatically when only one method type is set
  </Elements>
)}

{paymentMethod === 'paypal' && (
  <PayPalCheckoutButton ... />           ← unchanged
)}
```

`stripeType` mapping:
- `card` → `['card']`
- `googlepay` → `['google_pay']`
- `klarna` → `['klarna']`

The `key` prop change causes React to unmount and remount the `Elements` provider, which re-initialises Stripe with the new `paymentMethodTypes`. This is the supported pattern for switching payment methods in Stripe Elements.

---

## UI Design

### Icon card grid

```
display: grid
grid-template-columns: repeat(4, 1fr)
gap: 9px
```

Each card:
- Padding: `18px 8px 15px`
- Border-radius: `12px`
- Border: `1.5px solid #E8E4DC` (inactive) → `1.5px solid #8B7355` (active)
- Background: `#FFFFFF` (inactive) → `#F5F1EB` (active)
- Hover (inactive): `box-shadow: 0 4px 14px rgba(20,20,40,.08)`, border `#D4D4DC`
- Transition: `all .16s ease`

Logo area: `height: 26px`, centred  
Label: `font-size: 12.5px`, weight `500`, color `#45433d` (inactive) → `#8B7355` weight `600` (active)

### Logos (inline SVG / styled spans — no external images)

| Method | Implementation |
|--------|---------------|
| Card | Generic credit-card SVG (dark stripe, gold chip) |
| Google Pay | 4-colour Google "G" SVG + grey "Pay" text |
| PayPal | Italic wordmark: "Pay" `#003087` + "Pal" `#009cde` |
| Klarna | Pink badge `#ffb3c7`, rounded, black "Klarna" text |

Use existing brand tokens from `client/src/index.css`:
- `--color-pa-gold: #8B7355` (active border + label)
- `--color-pa-warm: #F5F1EB` (active card background)
- `--color-pa-sand: #E8E4DC` (inactive border)
- `#45433d` (inactive label — no project CSS variable; use Tailwind arbitrary value `text-[#45433d]`)
- Hover border: `#D4D4DC`

Tailwind utility classes where possible; inline styles for one-off brand values.

### Body area (below the grid, margin-top: 20px)

**Card / Google Pay / Klarna:** Stripe `PaymentElement`. Tab bar is hidden automatically because `paymentMethodTypes` is restricted to a single method in the parent `Elements` options.  
**PayPal:** Existing `PayPalCheckoutButton` component, no changes.

### Google Pay unavailable

If `google_pay` is selected but the browser/device doesn't support it, Stripe will render a "not available" state in the `PaymentElement`. No custom fallback UI is required — Stripe handles this gracefully.

---

## State changes

```ts
// Replace existing:
const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal">("card");

// With:
type PaymentMethodId = "card" | "googlepay" | "paypal" | "klarna";
const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
```

`elementsOptions` gains a `paymentMethodTypes` field derived from the selected method:

```ts
const stripeMethodTypes: Record<Exclude<PaymentMethodId, "paypal">, string[]> = {
  card: ["card"],
  googlepay: ["google_pay"],
  klarna: ["klarna"],
};
```

The `<Elements>` wrapper receives `key={paymentMethod}` to force remount on switch. The existing `paymentMethodCreation: "manual"` and `appearance` config are preserved unchanged.

---

## What does NOT change

- `PayPalCheckoutButton` component — zero changes
- Backend mutations (`createBEInstantReservation`, `createPayPalPaymentIntent`, `confirmPayPalBooking`)
- Checkout submit logic (`handleStripeSubmit`, error handling, retry logic, timeout)
- `PaymentElement` appearance config (colours, font, border-radius)
- GA4 / data layer events
- i18n locale handling

---

## Files to modify

| File | Change |
|------|--------|
| `client/src/components/booking/CheckoutPaymentForm.tsx` | Replace toggle buttons with 4-card grid; update `paymentMethod` type; add logo SVGs inline; add `paymentMethodTypes` to `elementsOptions`; add `key` to `<Elements>` |

No new files required.

---

## Verification

1. Load the checkout flow and confirm Card is pre-selected with the card form visible below.
2. Click each card in turn — confirm the correct Stripe form / PayPal button appears with no Stripe tab bar.
3. On a Chrome/Android device (or Chrome desktop with a Google Pay wallet), confirm Google Pay button renders; on Safari/iOS confirm Apple Pay renders instead.
4. Complete a test payment on each path in Stripe test mode and confirm the booking confirmation page loads.
5. Confirm PayPal redirect still works end-to-end.
6. Confirm no TypeScript errors (`pnpm tsc --noEmit`).
