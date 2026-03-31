# Booking Widget Resilience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the booking widget so that (1) BE API failures emit actionable logs, and (2) guests with an estimated price can attempt to fetch live pricing before checkout rather than being silently routed to "Request Pricing".

**Architecture:** Two independent work streams: a backend logging enhancement (no new files, targeted additions to existing catch blocks) and a frontend widget change (narrow priceOnRequest gate + retry CTA branch in BookingWidget.tsx). They touch different layers and can be reviewed independently.

**Tech Stack:** Node.js/TypeScript (Vitest for server tests), React 19 + tRPC (manual verification for frontend — no React test infra configured).

---

## File Map

| File | Change |
|------|--------|
| `server/services/guesty-booking.ts` | Replace bare `console.error` in `createBEQuote` catch with structured log including `status`, `credentialId`, `listingId`, `body` |
| `server/lib/guesty.ts` | Add credential-prefix log line at start of `fetchBEOAuthToken` |
| `server/services/guesty-booking.test.ts` | New — unit tests for `createBEQuote` error logging |
| `client/src/components/booking/BookingWidget.tsx` | Narrow `priceOnRequest` gate; add 2 state flags; add `handleRetryReserve`; add retry CTA branches; reset flags on date change |

---

## Task 1: Structured error logging in `createBEQuote`

**Files:**
- Modify: `server/services/guesty-booking.ts:113-122` (the catch block in `createBEQuote`)
- Create: `server/services/guesty-booking.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/services/guesty-booking.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/guesty", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/guesty")>();
  return {
    ...actual,
    guestyBEClient: {
      isConfigured: vi.fn().mockReturnValue(true),
      request: vi.fn(),
    },
  };
});

import { createBEQuote } from "./guesty-booking";
import { guestyBEClient, GuestyClientError } from "../lib/guesty";

describe("createBEQuote error logging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.GUESTY_BE_CLIENT_ID = "abc123xyz";
  });

  it("logs status, credential prefix, listingId, and body on 500 failure", async () => {
    vi.mocked(guestyBEClient.request).mockRejectedValue(
      new GuestyClientError({
        message: "Service unavailable",
        status: 500,
        method: "POST",
        endpoint: "/api/reservations/quotes",
        details: { reason: "overloaded" },
      })
    );

    await expect(
      createBEQuote({ listingId: "listing-123", checkIn: "2026-04-08", checkOut: "2026-04-11", guests: 2 })
    ).rejects.toThrow();

    const errorCall = vi.mocked(console.error).mock.calls.find((args) =>
      String(args[0]).includes("[BE Quote] createBEQuote FAILED")
    );
    expect(errorCall).toBeDefined();
    const msg = String(errorCall![0]);
    expect(msg).toContain("status=500");
    expect(msg).toContain("listingId=listing-123");
    expect(msg).toContain("abc123"); // credential prefix
  });

  it("logs NOT SET when GUESTY_BE_CLIENT_ID is missing", async () => {
    delete process.env.GUESTY_BE_CLIENT_ID;
    vi.mocked(guestyBEClient.request).mockRejectedValue(
      new GuestyClientError({
        message: "Auth failed",
        status: 401,
        method: "POST",
        endpoint: "/api/reservations/quotes",
      })
    );

    await expect(
      createBEQuote({ listingId: "listing-abc", checkIn: "2026-04-08", checkOut: "2026-04-11", guests: 2 })
    ).rejects.toThrow();

    const errorCall = vi.mocked(console.error).mock.calls.find((args) =>
      String(args[0]).includes("[BE Quote] createBEQuote FAILED")
    );
    expect(String(errorCall![0])).toContain("NOT SET");
  });
});
```

- [ ] **Step 2: Run the test — verify it fails**

```bash
pnpm test server/services/guesty-booking.test.ts
```

Expected: FAIL — `[BE Quote] createBEQuote FAILED` not found in console.error calls.

- [ ] **Step 3: Update the `createBEQuote` catch block**

In `server/services/guesty-booking.ts`, replace lines 115–122:

```typescript
  } catch (error: any) {
    const details = error?.details ?? null;
    if (details) console.error("[BE Quote] Raw error details:", JSON.stringify(details));
    const friendly = parseBEError(JSON.stringify(details ?? error?.message ?? ""));
    if ((error?.status ?? 0) === 429) throw new Error(GUESTY_BE_AUTH_ERROR);
    if ((error?.status ?? 0) === 422) throw new Error(friendly || "This property is not available for the selected dates.");
    throw new Error(friendly || error?.message || "Unable to get live quote from Guesty.");
  }
```

with:

```typescript
  } catch (error: any) {
    const status = error?.status ?? 0;
    const details = error?.details ?? null;
    const rawBody = typeof details === "string"
      ? details.slice(0, 500)
      : JSON.stringify(details ?? {}).slice(0, 500);
    const credentialId = process.env.GUESTY_BE_CLIENT_ID
      ? process.env.GUESTY_BE_CLIENT_ID.slice(0, 6) + "..."
      : "NOT SET";
    console.error(`[BE Quote] createBEQuote FAILED — status=${status}, credentialId=${credentialId}, listingId=${input.listingId}, body=${rawBody}`);
    const friendly = parseBEError(JSON.stringify(details ?? error?.message ?? ""));
    if (status === 429) throw new Error(GUESTY_BE_AUTH_ERROR);
    if (status === 422) throw new Error(friendly || "This property is not available for the selected dates.");
    throw new Error(friendly || error?.message || "Unable to get live quote from Guesty.");
  }
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
pnpm test server/services/guesty-booking.test.ts
```

Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add server/services/guesty-booking.ts server/services/guesty-booking.test.ts
git commit -m "fix: structured error logging in createBEQuote with status, credential, body"
```

---

## Task 2: Credential log in `fetchBEOAuthToken`

**Files:**
- Modify: `server/lib/guesty.ts:679` — `fetchBEOAuthToken` function

No unit test needed here — `fetchBEOAuthToken` is unexported; the credential prefix log is a simple observability line whose correctness is verified by running the server and observing logs.

- [ ] **Step 1: Add credential info log at the start of `fetchBEOAuthToken`**

In `server/lib/guesty.ts`, locate `fetchBEOAuthToken` (line 679). After the cooldown check block (after line 696, before `const maxAttempts = 2;`), add:

```typescript
  const beCredentialId = GUESTY_BE_CLIENT_ID
    ? GUESTY_BE_CLIENT_ID.slice(0, 6) + "..."
    : "NOT SET (GUESTY_BE_CLIENT_ID missing)";
  console.info(`[BE OAuth] Token request — credentialId: ${beCredentialId}`);
```

The result should look like:

```typescript
async function fetchBEOAuthToken(): Promise<string> {
  if (!GUESTY_BE_CLIENT_ID || !GUESTY_BE_CLIENT_SECRET) {
    throw new Error("Guesty Booking Engine auth not configured.");
  }
  if (Date.now() < guestyBeAuthCooldownUntil) {
    const remaining = guestyBeAuthCooldownUntil - Date.now();
    if (remaining > MAX_GUESTY_BE_OAUTH_COOLDOWN_MS) {
      guestyBeAuthCooldownUntil = 0;
    } else {
      throw new GuestyClientError({ ... });
    }
  }

  // NEW:
  const beCredentialId = GUESTY_BE_CLIENT_ID
    ? GUESTY_BE_CLIENT_ID.slice(0, 6) + "..."
    : "NOT SET (GUESTY_BE_CLIENT_ID missing)";
  console.info(`[BE OAuth] Token request — credentialId: ${beCredentialId}`);

  const maxAttempts = 2;
  // ... rest of function unchanged
```

- [ ] **Step 2: Run full test suite to confirm no regressions**

```bash
pnpm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Commit**

```bash
git add server/lib/guesty.ts
git commit -m "fix: log BE OAuth credential prefix on every token request"
```

---

## Task 3: Narrow `priceOnRequest` gate

**Files:**
- Modify: `client/src/components/booking/BookingWidget.tsx:361`

Currently `priceOnRequest: !isLivePrice` means `source: "base"` → "Request Pricing" button. Change the gate so only `source: "request"` (genuinely unavailable dates) triggers the request-only flow.

- [ ] **Step 1: Change the gate condition**

In `BookingWidget.tsx`, find line 361:

```typescript
        priceOnRequest: !isLivePrice,
```

Replace with:

```typescript
        priceOnRequest: (d as any).source === "request",
```

- [ ] **Step 2: Verify manually — `source: "base"` now shows quote step**

Start the dev server (`pnpm dev`). Open any property page and select dates. With BE API down (returning 500), the widget should:
- Show the "QUOTE" step (price breakdown panel) — NOT the "PRICE ON REQUEST" card
- Show the amber estimate notice ("Live pricing temporarily unavailable…")
- Show the CTA loading spinner briefly while the initial background `createBEQuote` fires, then show the concierge fallback (because the initial attempt fails)

If it shows the concierge fallback CTA immediately after the loading spinner disappears, the gate change is working. The retry CTA will be wired in Task 4.

- [ ] **Step 3: Commit**

```bash
git add client/src/components/booking/BookingWidget.tsx
git commit -m "fix: narrow priceOnRequest gate — source:base shows quote step, not request flow"
```

---

## Task 4: Add retry state flags and `handleRetryReserve`

**Files:**
- Modify: `client/src/components/booking/BookingWidget.tsx`

- [ ] **Step 1: Add the two new state flags**

In `BookingWidget.tsx`, find line 247 (the `beQuoteError` state declaration):

```typescript
  const [beQuoteError, setBeQuoteError] = useState("");
```

Add the two new flags immediately after it:

```typescript
  const [beQuoteError, setBeQuoteError] = useState("");
  const [isRetryingForLivePrice, setIsRetryingForLivePrice] = useState(false);
  const [beQuoteRetryFailed, setBeQuoteRetryFailed] = useState(false);
```

- [ ] **Step 2: Add `handleRetryReserve` callback**

Find line 279 (the `createBEQuote` mutation):

```typescript
  const createBEQuote = trpc.booking.createBEQuote.useMutation();
```

Add `handleRetryReserve` immediately after it:

```typescript
  const createBEQuote = trpc.booking.createBEQuote.useMutation();

  const handleRetryReserve = useCallback(async () => {
    setIsRetryingForLivePrice(true);
    setBeQuoteRetryFailed(false);
    setBeQuoteError("");
    try {
      const be = await createBEQuote.mutateAsync({
        listingId: guestyId, checkIn, checkOut, guests,
        guestEmail: "guest@example.com",
      });
      if (!be?.quoteId) throw new Error("No quote ID returned");
      setQuote(prev => prev ? {
        ...prev,
        quoteId: be.quoteId,
        quoteCreatedAt: Date.now(),
        ratePlanId: be.ratePlanId,
        source: "live" as const,
        priceOnRequest: false,
        fallbackMessage: undefined,
        currency: be.currency || prev.currency,
        cancellationPolicy: be.cancellationPolicy,
        ratePlanOptions: be.ratePlanOptions?.map((opt: any) => ({
          ...opt,
          total: opt.total > 0 ? opt.total : prev.total,
          nightlyRate: opt.nightlyRate > 0 ? opt.nightlyRate : prev.nightlyRate,
          cleaningFee: opt.cleaningFee > 0 ? opt.cleaningFee : prev.cleaningFee,
        })),
      } : null);
      if (be.ratePlanId) setSelectedRatePlanId(be.ratePlanId);
      setError("");
      setTermsAccepted(false);
      setStep("payment");
    } catch (err: any) {
      setBeQuoteRetryFailed(true);
      setBeQuoteError(parseBookingError(err?.message || "Live pricing unavailable. Please contact our concierge."));
    } finally {
      setIsRetryingForLivePrice(false);
    }
  }, [checkIn, checkOut, guests, guestyId, createBEQuote]);
```

`useCallback` is already imported — check the import line near the top of the file and confirm `useCallback` is in the React import. If not, add it.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
pnpm --filter client tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/booking/BookingWidget.tsx
git commit -m "feat: add handleRetryReserve — retry live BE quote before proceeding to payment"
```

---

## Task 5: Retry CTA branches + error banner + date reset

**Files:**
- Modify: `client/src/components/booking/BookingWidget.tsx`

- [ ] **Step 1a: Insert two new ternary branches into the CTA chain**

The existing CTA chain (starting line 1029) has three conditions:
```
canPayOnSite && quote?.quoteId          → primary Reserve & Pay button
canPayOnSite && !quote?.quoteId && !beQuoteError  → loading spinner
else                                    → concierge fallback
```

Insert two new conditions between the primary button and the loading spinner.

Find this exact string (the junction between the primary button's closing `</button>` and the loading branch):

```typescript
              </button>
            ) : canPayOnSite && !quote?.quoteId && !beQuoteError ? (
```

Replace with:

```typescript
              </button>
            ) : canPayOnSite && quote?.source === "base" && isRetryingForLivePrice ? (
              /* Retry in progress */
              <button
                disabled
                className="w-full min-h-[52px] bg-black/50 text-white text-xs font-medium tracking-[0.15em] uppercase px-8 py-4 cursor-wait"
              >
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t("bookingWidget.checkingLivePricing", "Checking live pricing…")}
                </span>
              </button>
            ) : canPayOnSite && quote?.source === "base" && beQuoteError && !beQuoteRetryFailed ? (
              /* Estimated price — retry for live on click */
              <button
                onClick={handleRetryReserve}
                className="w-full min-h-[52px] bg-black text-white text-xs font-medium tracking-[0.15em] uppercase px-8 py-4 hover:bg-black/85 transition-colors"
              >
                {t("bookingWidget.reserveAndPay", "Reserve & Pay")} {formatEur(effectiveQuote?.total ?? 0)}
              </button>
            ) : canPayOnSite && !quote?.quoteId && !beQuoteError ? (
```

The primary button JSX and everything from the loading spinner onward remain untouched.

- [ ] **Step 1b: Add error banner inside the concierge fallback**

Inside the existing concierge fallback `<div className="space-y-3">` (the else branch), add the error banner as its first child.

Find this exact string (the opening of the concierge fallback div, followed by the WhatsApp link):

```typescript
              <div className="space-y-3">
                <a
                  href={`https://wa.me/351927161771
```

Replace with:

```typescript
              <div className="space-y-3">
                {beQuoteRetryFailed && beQuoteError && (
                  <div className="bg-red-50/60 border border-red-200/40 px-4 py-2.5 text-[11px] text-red-700">
                    {beQuoteError}
                  </div>
                )}
                <a
                  href={`https://wa.me/351927161771
```

All other concierge fallback content remains untouched.

- [ ] **Step 2: Reset new flags on date change**

Find `resetDates` (around line 464):

```typescript
  const resetDates = () => {
    setCheckIn("");
    setCheckOut("");
    setQuote(null);
    setError("");
    setBeQuoteError("");
    setPhoneTouched(false);
```

Add the two resets after `setBeQuoteError("")`:

```typescript
  const resetDates = () => {
    setCheckIn("");
    setCheckOut("");
    setQuote(null);
    setError("");
    setBeQuoteError("");
    setIsRetryingForLivePrice(false);
    setBeQuoteRetryFailed(false);
    setPhoneTouched(false);
```

Find the `onSelectRange` handler (around line 726):

```typescript
                onSelectRange={({ checkIn: ci, checkOut: co }) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                  setQuote(null);
```

Add the two resets after `setQuote(null)`:

```typescript
                onSelectRange={({ checkIn: ci, checkOut: co }) => {
                  setCheckIn(ci);
                  setCheckOut(co);
                  setQuote(null);
                  setIsRetryingForLivePrice(false);
                  setBeQuoteRetryFailed(false);
```

- [ ] **Step 3: TypeScript check**

```bash
pnpm --filter client tsc --noEmit
```

Expected: no type errors.

- [ ] **Step 4: Manual verification — happy retry path**

When BE API works:
1. Select dates on any property
2. Widget loads quote with `source: "base"` (estimated) — amber notice visible
3. "Reserve & Pay €X" button appears
4. Click it → button changes to "Checking live pricing…" spinner
5. If retry succeeds → payment step opens directly
6. Change dates → amber notice gone, flow resets cleanly

When BE API is still down:
1. Select dates → estimated price shown, "Reserve & Pay €X" button
2. Click → "Checking live pricing…" spinner → retry fails → red error banner appears above concierge CTA
3. Change dates → error banner gone, state fully reset

- [ ] **Step 5: Commit**

```bash
git add client/src/components/booking/BookingWidget.tsx
git commit -m "feat: Reserve & Pay retries live pricing for estimated quotes, concierge fallback on failure"
```

---

## Task 6: Final check

- [ ] **Step 1: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass including the two new `guesty-booking.test.ts` tests.

- [ ] **Step 2: TypeScript check across both workspaces**

```bash
pnpm --filter client tsc --noEmit && pnpm --filter server tsc --noEmit 2>/dev/null || npx tsc --noEmit
```

Expected: no errors.
