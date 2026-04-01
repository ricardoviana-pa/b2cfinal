# Booking Widget Resilience — Design Spec

**Date:** 2026-03-31  
**Branch:** VibeMerge  
**Status:** Approved

---

## Problem

The Guesty Booking Engine (BE) API is intermittently unavailable in the dev environment. When it fails:

1. `getQuote` always returns `source: "base"` (estimated price) because the BE API tier times out
2. `createBEQuote` returns HTTP 500 with a generic "overloaded" message
3. The widget sets `priceOnRequest: true` for any non-`"live"` source, forcing all users through "Request Pricing" — even when a valid estimated price is available
4. When `createBEQuote` fails, no retry mechanism exists; the user is stuck

Three issues to fix:
- **Issue #1:** Improve error logging so the root cause of BE API failures is diagnosable from server logs
- **Issue #2/#3:** When `source: "base"`, the "Reserve & Pay" button triggers a live pricing retry before proceeding to payment; failure surfaces a "Contact Concierge" escape hatch

---

## Issue #1 — Improved BE API Error Logging

### Scope

`server/services/guesty-booking.ts` and `server/lib/guesty.ts`

### Changes

Enhance existing log statements at BE API failure points to include:

1. **Full HTTP status code** — distinguishes `401` (auth), `429` (rate limit), `500` (server error)
2. **Raw response body snippet** — first 500 chars of the Guesty response body, surfacing Guesty's actual error message rather than the mapped user-facing string
3. **Credential confirmation** — log whether `GUESTY_BE_CLIENT_ID` is set and the first 6 chars of the value (enough to confirm which key is active, not enough to leak it)
4. **OAuth token acquisition failures** — in `server/lib/guesty.ts`, if the BE API token fetch fails, log the HTTP status and response body from the auth endpoint specifically

All logs use the existing structured logger pattern. Log level: `error` for failures, `warn` for fallbacks. No new dependencies.

---

## Issue #2/#3 — Reserve & Pay Live Pricing Retry

### Scope

`client/src/components/booking/BookingWidget.tsx`

### New State

```typescript
const [isRetryingForLivePrice, setIsRetryingForLivePrice] = useState(false);
const [beQuoteRetryFailed, setBeQuoteRetryFailed] = useState(false);
```

### `priceOnRequest` Gate — Narrowed

The current logic `priceOnRequest: source !== "live"` blocks "Reserve & Pay" for `source: "base"` and `source: "cached"`, making the retry unreachable. This must change to:

```typescript
priceOnRequest: source === "request"
```

`source: "request"` means the dates are genuinely unavailable (booked/blocked). `source: "base"` and `source: "cached"` have valid pricing and should show "Reserve & Pay". This is the gate that makes Issue #3 fixable.

### Reserve Button Click Handler — Modified Logic

**Condition:** `quote.source === "base"`

1. Set `isRetryingForLivePrice = true`
2. Call `createBEQuote.mutateAsync({ listingId, checkIn, checkOut, guests })`
3. **On success:**
   - Update quote state with returned `quoteId`, `ratePlanId`, `ratePlanOptions`
   - Clear `isRetryingForLivePrice`
   - Proceed to payment step (same as current happy path)
4. **On failure:**
   - Set `beQuoteRetryFailed = true`
   - Clear `isRetryingForLivePrice`
   - Do not proceed — user remains on quote step

**Condition:** `quote.source === "live"` or `"cached"` → no change, proceed normally

### UI Changes

**Reserve button during retry:**
- Label: `"Checking live pricing…"`
- Disabled while `isRetryingForLivePrice === true`

**Error banner on retry failure (`beQuoteRetryFailed === true`):**
- Shown below the price section
- Content: parsed error message + two CTAs:
  - WhatsApp link (existing contact details from `CheckoutPaymentForm.tsx`)
  - Email link to reservations address
- Styling: consistent with existing `beQuoteError` banner in the widget

**Date change resets retry state:**
- The existing date-change handler already resets quote state
- Add `setBeQuoteRetryFailed(false)` and `setIsRetryingForLivePrice(false)` in the same reset block

---

## What Is Not Changing

- `source: "request"` (genuinely unavailable dates) still results in `priceOnRequest: true` → "Request Pricing". Only the gate condition changes from `source !== "live"` to `source === "request"`.
- No changes to the server-side quote fallback tiers in `server/services/guesty.ts`
- No new tRPC procedures
- No changes to `CheckoutPaymentForm.tsx` or the payment flow

---

## Files Touched

| File | Change |
|------|--------|
| `server/services/guesty-booking.ts` | Enhanced error logging with HTTP status, response body, credential info |
| `server/lib/guesty.ts` | Enhanced OAuth failure logging |
| `client/src/components/booking/BookingWidget.tsx` | Narrow `priceOnRequest` gate to `source === "request"` only; two new state flags; modified reserve handler; retry loading state; retry-failed error banner |
