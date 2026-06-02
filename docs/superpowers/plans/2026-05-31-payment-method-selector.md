# Payment Method Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-button payment toggle in `CheckoutPaymentForm` with a 4-card Large Icon Cards selector (Card, Google Pay, PayPal, Klarna), Card always pre-selected, each card showing only that method's Stripe form or PayPal button below.

**Architecture:** Single-file change in `client/src/components/booking/CheckoutPaymentForm.tsx`. State type expands from `"card"|"paypal"` to `"card"|"googlepay"|"paypal"|"klarna"`. A new `STRIPE_METHOD_TYPES` constant maps each Stripe-handled method to its `paymentMethodTypes` array. The `<Elements>` wrapper gains a `key={paymentMethod}` prop so React remounts Stripe with the correct single method type whenever the selection changes — Stripe hides the tab bar automatically when `paymentMethodTypes` is restricted to one entry. The PayPal branch is unchanged.

**Tech Stack:** React 18, TypeScript, `@stripe/react-stripe-js`, Tailwind CSS v4, inline styles for one-off design token values

---

## File map

| File | Action |
|------|--------|
| `client/src/components/booking/CheckoutPaymentForm.tsx` | Modify — all changes land here |

---

### Task 1: Add type, constant, logo components, and method list

**Files:**
- Modify: `client/src/components/booking/CheckoutPaymentForm.tsx`

This task adds only new code — nothing is deleted yet. All additions go at module scope, above `PaymentFormInner`.

- [ ] **Step 1: Insert `PaymentMethodId` type and `STRIPE_METHOD_TYPES` constant after the `EUR` constant (line 16)**

Open `client/src/components/booking/CheckoutPaymentForm.tsx`. After:

```ts
const EUR = "€";
```

Insert:

```ts
type PaymentMethodId = "card" | "googlepay" | "paypal" | "klarna";

const STRIPE_METHOD_TYPES: Record<Exclude<PaymentMethodId, "paypal">, string[]> = {
  card: ["card"],
  googlepay: ["google_pay"],
  klarna: ["klarna"],
};
```

- [ ] **Step 2: Add four logo components after `STRIPE_METHOD_TYPES`**

Insert immediately after the constant:

```tsx
function CardLogo() {
  return (
    <svg width="36" height="25" viewBox="0 0 36 25" fill="none" aria-label="Card">
      <rect x="0.6" y="0.6" width="34.8" height="23.8" rx="4" fill="#fff" stroke="#d9d9e1" strokeWidth="1.2" />
      <rect x="0.6" y="5" width="34.8" height="5" fill="#3a3a46" />
      <rect x="5" y="15.5" width="11" height="3" rx="1.5" fill="#cfcfd8" />
      <rect x="24" y="15" width="7" height="5" rx="1.2" fill="#f0a92e" />
    </svg>
  );
}

function GooglePayLogo() {
  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap: "4px", lineHeight: 1 }}
      aria-label="Google Pay"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.182l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.71H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853" />
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.346l2.582-2.582C13.463.892 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
      </svg>
      <span style={{ fontWeight: 500, fontSize: "13px", color: "#5F6368" }}>Pay</span>
    </span>
  );
}

function PayPalLogo() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontWeight: 700,
        fontStyle: "italic",
        fontSize: "16px",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
      aria-label="PayPal"
    >
      <span style={{ color: "#003087" }}>Pay</span>
      <span style={{ color: "#009cde" }}>Pal</span>
    </span>
  );
}

function KlarnaLogo() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffb3c7",
        borderRadius: "5px",
        padding: "3px 8px",
        lineHeight: 1,
      }}
      aria-label="Klarna"
    >
      <span style={{ color: "#17120f", fontWeight: 700, fontSize: "12px" }}>Klarna</span>
    </span>
  );
}

const PAYMENT_METHODS: Array<{ id: PaymentMethodId; label: string; Logo: () => JSX.Element }> = [
  { id: "card",      label: "Card",       Logo: CardLogo },
  { id: "googlepay", label: "Google Pay", Logo: GooglePayLogo },
  { id: "paypal",    label: "PayPal",     Logo: PayPalLogo },
  { id: "klarna",    label: "Klarna",     Logo: KlarnaLogo },
];
```

- [ ] **Step 3: Verify TypeScript is happy with the new additions**

```bash
cd "/Users/fabiofreitas/Documents/VIsual Studio Projects/b2cfinal-VibeMerge"
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to the new type/constant/components (there will likely still be errors elsewhere in the project — ignore those; only fix errors in `CheckoutPaymentForm.tsx`).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/booking/CheckoutPaymentForm.tsx
git commit -m "feat: add PaymentMethodId type, STRIPE_METHOD_TYPES, and logo components"
```

---

### Task 2: Update state type and `elementsOptions`

**Files:**
- Modify: `client/src/components/booking/CheckoutPaymentForm.tsx`

- [ ] **Step 1: Change the `paymentMethod` state type in `CheckoutPaymentForm`**

Find (around line 248 after earlier additions):

```ts
const [paymentMethod, setPaymentMethod] = useState<"card" | "paypal">("card");
```

Replace with:

```ts
const [paymentMethod, setPaymentMethod] = useState<PaymentMethodId>("card");
```

- [ ] **Step 2: Add `paymentMethod` to `elementsOptions` dependencies and include `paymentMethodTypes`**

Find the `elementsOptions` useMemo block. Its current content is:

```ts
const elementsOptions = useMemo(
  () => ({
    mode: "payment" as const,
    amount: Math.round(props.total * 100), // Stripe expects cents
    currency: (props.currency || "eur").toLowerCase(),
    paymentMethodCreation: "manual" as const,
    locale: i18n.language as any,
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#1A1A18",
        colorBackground: "#ffffff",
        colorText: "#1A1A18",
        fontFamily: "var(--font-body), Arial, sans-serif",
        borderRadius: "4px",
      },
    },
  }),
  [props.total, props.currency, i18n.language],
);
```

Replace with:

```ts
const elementsOptions = useMemo(
  () => ({
    mode: "payment" as const,
    amount: Math.round(props.total * 100), // Stripe expects cents
    currency: (props.currency || "eur").toLowerCase(),
    paymentMethodCreation: "manual" as const,
    locale: i18n.language as any,
    ...(paymentMethod !== "paypal" && {
      paymentMethodTypes: STRIPE_METHOD_TYPES[paymentMethod as Exclude<PaymentMethodId, "paypal">],
    }),
    appearance: {
      theme: "stripe" as const,
      variables: {
        colorPrimary: "#1A1A18",
        colorBackground: "#ffffff",
        colorText: "#1A1A18",
        fontFamily: "var(--font-body), Arial, sans-serif",
        borderRadius: "4px",
      },
    },
  }),
  [props.total, props.currency, i18n.language, paymentMethod],
);
```

- [ ] **Step 3: Verify TypeScript**

```bash
pnpm tsc --noEmit 2>&1 | grep "CheckoutPaymentForm"
```

Expected: no output (no errors in this file).

- [ ] **Step 4: Commit**

```bash
git add client/src/components/booking/CheckoutPaymentForm.tsx
git commit -m "feat: expand paymentMethod state to 4 methods, add paymentMethodTypes to Elements options"
```

---

### Task 3: Replace toggle buttons with 4-card grid and update `<Elements>` wrapper

**Files:**
- Modify: `client/src/components/booking/CheckoutPaymentForm.tsx`

This task replaces the two inline-styled toggle buttons with the icon card grid, and updates the conditional rendering so Card / Google Pay / Klarna all use `<Elements>` and PayPal shows `<PayPalCheckoutButton>`.

- [ ] **Step 1: Replace the two-button toggle div with the 4-card grid**

Find the entire payment method toggle block (the `{/* Payment method toggle */}` comment through the closing `</div>`):

```tsx
      {/* Payment method toggle */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button
          type="button"
          onClick={() => { setPaymentMethod("card"); setPaypalError(""); }}
          style={{
            flex: 1,
            padding: "10px",
            border: `2px solid ${paymentMethod === "card" ? "#1A1A18" : "#E8E4DC"}`,
            background: paymentMethod === "card" ? "#1A1A18" : "#fff",
            color: paymentMethod === "card" ? "#fff" : "#1A1A18",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          Card / Apple Pay / MB Way
        </button>
        <button
          type="button"
          onClick={() => { setPaymentMethod("paypal"); setPaypalError(""); }}
          style={{
            flex: 1,
            padding: "10px",
            border: `2px solid ${paymentMethod === "paypal" ? "#003087" : "#E8E4DC"}`,
            background: paymentMethod === "paypal" ? "#003087" : "#fff",
            color: paymentMethod === "paypal" ? "#fff" : "#1A1A18",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "13px",
          }}
        >
          PayPal
        </button>
      </div>
```

Replace with:

```tsx
      {/* Payment method selector — 4 icon cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "9px" }}>
        {PAYMENT_METHODS.map(({ id, label, Logo }) => (
          <button
            key={id}
            type="button"
            onClick={() => { setPaymentMethod(id); setPaypalError(""); }}
            onMouseEnter={(e) => {
              if (paymentMethod !== id) {
                e.currentTarget.style.boxShadow = "0 4px 14px rgba(20,20,40,.08)";
                e.currentTarget.style.borderColor = "#D4D4DC";
              }
            }}
            onMouseLeave={(e) => {
              if (paymentMethod !== id) {
                e.currentTarget.style.boxShadow = "";
                e.currentTarget.style.borderColor = "#E8E4DC";
              }
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "11px",
              padding: "18px 8px 15px",
              borderRadius: "12px",
              cursor: "pointer",
              background: paymentMethod === id ? "#F5F1EB" : "#ffffff",
              border: `1.5px solid ${paymentMethod === id ? "#8B7355" : "#E8E4DC"}`,
              boxShadow: "none",
              transition: "all .16s ease",
              fontFamily: "inherit",
            }}
          >
            <div style={{ height: "26px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Logo />
            </div>
            <span
              style={{
                fontSize: "12.5px",
                fontWeight: paymentMethod === id ? 600 : 500,
                color: paymentMethod === id ? "#8B7355" : "#45433d",
                textAlign: "center",
              }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>
```

- [ ] **Step 2: Update the `<Elements>` condition to cover Card / Google Pay / Klarna, and add `key` prop**

Find:

```tsx
      {paymentMethod === "card" && (
        <Elements stripe={stripePromise} options={elementsOptions}>
          <PaymentFormInner {...props} />
        </Elements>
      )}
```

Replace with:

```tsx
      {paymentMethod !== "paypal" && (
        <Elements key={paymentMethod} stripe={stripePromise} options={elementsOptions}>
          <PaymentFormInner {...props} />
        </Elements>
      )}
```

- [ ] **Step 3: Verify TypeScript — no errors in `CheckoutPaymentForm.tsx`**

```bash
pnpm tsc --noEmit 2>&1 | grep "CheckoutPaymentForm"
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/booking/CheckoutPaymentForm.tsx
git commit -m "feat: replace payment toggle buttons with 4-card Large Icon Cards selector"
```

---

### Task 4: Visual verification

- [ ] **Step 1: Start the dev server**

```bash
cd "/Users/fabiofreitas/Documents/VIsual Studio Projects/b2cfinal-VibeMerge"
pnpm dev
```

- [ ] **Step 2: Navigate to the checkout form**

Open a property listing, go through the booking flow until you reach the payment step.

- [ ] **Step 3: Verify Card is pre-selected**

The Card icon card should have brand-brown border (`#8B7355`) and warm cream background (`#F5F1EB`). The Stripe PaymentElement should appear below showing only the card form (no tab bar).

- [ ] **Step 4: Click each card in turn and confirm correct body**

| Card clicked | Expected body |
|---|---|
| Card | Stripe PaymentElement — card number / expiry / CVC fields |
| Google Pay | Stripe PaymentElement — Google Pay button (or "not available" if browser unsupported) |
| PayPal | PayPal branded button + "You'll be redirected to PayPal…" note + Cancel button |
| Klarna | Stripe PaymentElement — Klarna "Pay later" UI |

- [ ] **Step 5: Verify hover state on inactive cards**

Hovering an unselected card should show a subtle shadow and slightly darker border (`#D4D4DC`). The active card should not change on hover.

- [ ] **Step 6: Verify PayPal end-to-end still works**

Select PayPal → click the PayPal button → confirm redirect to PayPal sandbox → complete payment → confirm return to booking confirmation page.

- [ ] **Step 7: Run TypeScript check one final time**

```bash
pnpm tsc --noEmit 2>&1 | grep "CheckoutPaymentForm"
```

Expected: no output.
