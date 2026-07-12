# Checkout 2.0 — Engineering Handover

**Audience:** the engineer/AI taking over this work.
**Branch:** all work lives on `dev` (→ dev.portugalactive.com). `main` = production, untouched by this work.
**Scope of this document:** everything the checkout rebuild changed, with a deliberate deep-dive on the payment ↔ Guesty path, because that is the part most likely to be misunderstood.
**Repo:** ricardoviana-pa/b2cfinal. 49 commits on `dev` since it diverged from `main` at `2380a3d`.

---

## 0. READ THIS FIRST — the payment "needle"

There is a widespread worry that "we broke payments / Guesty sync." Here is the precise, verifiable truth:

1. **Production payments are NOT affected.** The new checkout (`checkout_v2`) is **feature-flagged to dev-only** (`server/routers/checkout.ts` → `checkout.isEnabled`: on when host starts with `dev.`/`localhost`, or env `CHECKOUT_V2=true`). Production (`www.`) still runs the **legacy in-widget** payment flow, behaviorally unchanged. If prod payments look wrong, it is NOT this work.

2. **The actual charge logic was NOT rewritten.** The three charge paths — card (Guesty tokenization), Klarna, PayPal — are the same functions they were before. `stripe-klarna.ts` was never touched. `guesty-booking.ts` and `guesty-openapi-paypal.ts` were touched only to **add** helper functions (coupon application, a reservation-note writer), not to change the existing charge/reservation calls.

3. **The single most invasive payment-adjacent change** — the one place to look first if quotes/amounts seem off — is commit `12b332b` in `server/services/guesty-booking.ts`: the Guesty BE quote-parsing block was **extracted** from `_createBEQuoteImpl` into a shared `parseBEQuote()` so it could be reused by coupon application. If a quote or charged amount is wrong, diff `parseBEQuote` against the pre-`12b332b` inline version first. Everything else in that file is unchanged.

4. **The most likely source of "payment info not connecting right"** is not a bug — it is a **deliberately incomplete feature**: the new checkout **displays a combined total** (stay + extras + reception + Flex) but the card path **still charges only the stay** (the Guesty quote). Charging the extras in one payment is **Phase 2b, not yet built** — it is blocked on a human-run spike (see §7). So on dev, if you add extras and pay by card, the guest is charged the stay only and the extras ride as "confirmed & charged later by the concierge." This is expected, documented, and gated to dev. Do not "fix" it by inflating the card charge — read §3 to understand why that cannot work without the spike.

If you read nothing else, read §2 and §3.

> **Everything still pending is in a single companion file: [`docs/checkout_pending.md`](./checkout_pending.md)** — the complete backlog by owner (critical path, product decisions, engineering queue) and inviolable rules. §7 below is a condensed version of it.

---

## 1. What this project is

A fullscreen 3-step checkout for luxury villa rentals, replacing the in-widget booking flow. Steps: **(1) Your stay** (dates recap, rate plan, email capture) → **(2) Personalize** (services/experiences, mandatory reception choice, Flex) → **(3) Payment**. A server-side `BookingIntent` (MySQL) is the source of truth once the guest enters `/:lang/checkout/:intentId`.

Full product spec: `docs/checkout_spec.md` (v1.2, Portuguese). Additional briefs: `docs/checkout_fase2_1_polish.md`, `docs/checkout_prompt_completo.md`, `docs/checkout_fixes_12jul.md`. Payment survey: `docs/wallets-survey.md`. Guesty/CS/invoicing flow: `docs/checkout_integration_flow.md`. Pending work by owner: `docs/checkout_pendentes.md`. Marketing events: `docs/marketing-tracking.md`.

---

## 2. Payment architecture (unchanged by this work — reference)

Three live methods, **two different capture architectures**, both on Stripe:

| Method | Who charges | Stripe account | Guesty reservation |
|---|---|---|---|
| **Card** | **Guesty** (BE API `POST /api/reservations/quotes/{quoteId}/instant` with a `ccToken`) | Per-listing **connected** account | Created AND charged by Guesty |
| **Klarna** | **Stripe** PaymentIntent | Platform account | Created via Open API `reservations-v3` + `recordExternalPayment` (paid outside) |
| **PayPal** | **Stripe** PaymentIntent | Platform account | Same as Klarna |

Card detail: it's Stripe **PaymentElement in deferred-intent mode** (`paymentMethodCreation: "manual"`, no PaymentIntent client-side) producing a `pm_` token, handed to Guesty's Booking Engine, which charges on the **listing's connected Stripe account**. The publishable key comes from tRPC `booking.getStripeConfig`; the connected account from `booking.getPaymentProvider` (Guesty BE `/api/listings/{id}/payment-provider`) — **never** an env fallback. **The amount charged is the server-side Guesty quote, not any client value.** This is why you cannot make the card charge extras just by changing a number on the client — Guesty charges what its quote says (see §3).

Klarna/PayPal detail: amount is client-computed (`Math.round(amount*100)`), server validates range only; reservation is created via Guesty **Open API** with `recordExternalPayment` (method OTHER, capped to `balanceDue`); idempotency via `server/lib/paypal-idempotency.ts` (4 layers) + webhooks `POST /api/webhooks/stripe-klarna` and `/api/webhooks/stripe-paypal` (raw body, registered before `express.json()`).

Key payment files (all pre-existing; see §5 for what changed):
`client/src/components/booking/CheckoutPaymentForm.tsx` (card), `KlarnaCheckoutButton.tsx`, `PayPalCheckoutButton.tsx`, `server/services/guesty-booking.ts` (BE quote + `/instant`), `server/services/stripe-klarna.ts`, `server/services/guesty-openapi-paypal.ts` (Open API reservation + recordExternalPayment), `server/lib/guesty.ts` (BE OAuth client), return pages `client/src/pages/booking/{Klarna,PayPal}ReturnPage.tsx`.

---

## 3. THE SINGLE-CHARGE GAP (Phase 2b) — the thing most likely to confuse

The new checkout sells **extras, reception, and Flex** and shows a **single combined "Total"** in the summary. But:

- **Card path (Guesty):** the `/instant` charge amount is locked to the Guesty quote = **the stay only**. Guesty BE reservations **cannot** carry arbitrary extra line items at creation (verified — see `docs/spike-invoice-items.md`). So extras are NOT charged by the card path today.
- **Klarna/PayPal:** amount is client-computed, so they *could* charge the combined total, but the Guesty reservation is still created for the stay and the extras aren't itemized there.

**Current interim behavior (deliberate):** extras/Flex/reception are captured on the intent, shown to the guest, sent to operations (CS email + Guesty reservation note), and **charged later by the concierge** ("confirmed & charged after concierge confirmation"). The `todayTotal` shown in the summary is the **design target** for when 2b lands, not what the card actually captures today. On the **demo** (`/checkout/demo`) nothing is ever charged.

**The two ways to close this (Phase 2b), blocked on a human-run spike:**
- **Path A — invoice items:** `POST /v1/invoice-items/reservation/{id}` (Open API, `normalType AFE`, `isUpsellFee:true`) **before** `POST /v1/reservations/{id}/payments` (payments rejected above `balanceDue`). Raises the Guesty reservation total → one charge. Preferred **if** Hostkit imports the itemized lines (see §7).
- **Path B — external single charge (spec §7 "fallback"):** one Stripe PaymentIntent for the whole total, reservation marked paid-outside — the pattern Klarna already uses. `needs_confirmation` lines refunded via partial PaymentIntent refund if the concierge can't deliver.

The spike (`node scripts/spike-invoice-items.mjs --reservation <TEST_ID> --execute`, **IRREVERSIBLE**, test reservation only) decides A vs B. Until then, do not open real traffic with paid extras.

---

## 4. What the checkout rebuild ADDED (the intent layer)

The new architecture inserts a server-side state layer between the widget and payment:

- **`booking_intents` table** (MySQL, `drizzle/schema.ts`). Migrations are **NOT** drizzle-migrate — they run as **idempotent boot SQL** in `server/_core/index.ts` (`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` wrapped in try/catch for "duplicate column"). Columns added over time: `reception` (json), `flex` (bool), `recovery_stage` (int). If you add a column, follow this same pattern — do not run drizzle migrate.
- **`checkout` tRPC router** (`server/routers/checkout.ts`): `isEnabled` (flag), `createIntent`, `getIntent`, `updateIntent` (paid-immutable guard), `getExtras` (curated catalog + reception config + defaultAirport + `promoEnabled` + Flex config), `captureLead`. `updateIntent` has a **hook**: when status flips to `paid`, it fires the CS ops-manifest email and writes the manifest into the Guesty reservation note (fire-and-forget). `booking.applyCoupon` lives in `server/routers/booking.ts` (Guesty coupon endpoint).
- **Intent = capability URL:** the id is a UUID (holds guest PII, goes in resume links) — never enumerable. Immutable once `paid`.
- **The widget** (`client/src/components/booking/BookingWidget.tsx`) branches on `checkoutV2Active`: in v2 it only collects dates/guests/quote and creates the intent, then navigates to `/checkout/:intentId`; the rate-plan radios and in-widget payment steps only render in the **legacy** (flag-off) path. Any widget failure falls back to the legacy flow.

The checkout page itself is `client/src/pages/checkout/CheckoutPage.tsx` (~1600 lines, the orchestrator: state, summary, promo, Flex, payment mount), `CustomizeStep.tsx` (chapters, option rows, reception, transfer airport selector, experiences carousel, price formula), `FlexBlock.tsx`.

---

## 5. Change inventory (what actually changed, by area)

**Payment files (minimal, additive):**
- `CheckoutPaymentForm.tsx`: gained an `intentId` prop and coupon threading into the GA4 purchase event; wallets option is `never` (an earlier `auto` created duplicate "Card / Google Pay" tabs inside the element — reverted in `b19c0c8`; real Apple/Google Pay is Express Checkout Element in 2b). **Charge logic unchanged.**
- `guesty-booking.ts` (`12b332b`): extracted `parseBEQuote()` from the inline quote parser; added `applyCouponToBEQuote()`. **`_createBEQuoteImpl` and `/instant` charge unchanged** (now call the extracted parser). ← **inspect here first if amounts look wrong.**
- `guesty-openapi-paypal.ts` (`334818f`): added `appendReservationNote()` (writes ops manifest to the reservation). Existing reservation creation unchanged.
- `Klarna/PayPalCheckoutButton.tsx` + return pages: coupon code now threads through to the purchase event; payload plumbing only.

**New checkout UI/logic:** the whole `client/src/pages/checkout/*` tree, the `checkout` router, the intent table, ~500 i18n keys across 9 locales (`client/src/i18n/locales/*.json`, `checkout.*`), the extras catalog + curation (`server/config/checkout-extras.ts`).

**CRM / ops (new, all fire-and-forget, never block a payment):**
- `server/services/transactional-email.ts`: `sendCheckoutOpsManifest` (CS action-oriented email on paid), `sendCheckoutGuestConfirmation` (branded guest confirmation on paid), `sendCheckoutRecovery` (abandonment 1h/20h). `wrapTemplate` gained the dark brand band + logo (applies to all legacy transactional emails too). Default sender is now `booking@portugalactive.com` (env `EMAIL_FROM` overrides).
- `server/services/checkout-recovery.ts`: 10-min scheduler sweeping abandoned intents; kill switch `CHECKOUT_RECOVERY=false`.
- Preview emails without sending: `npx tsx scripts/preview-emails.ts` → `/tmp/pa-emails/*.html`.

**Global fixes worth knowing (touched shared code):**
- `client/src/index.css`: `overflow-x: hidden` → `clip` on `body`/`#root` (the `hidden` value was silently breaking ALL `position: sticky` site-wide, including the site header). If sticky behavior regresses anywhere, this is why.
- `client/src/lib/format.ts`: `formatBookingDate` composes the month alone (pt-PT degraded `{month:'short',year}` to "08/2026"); `formatEur` rounds to whole euros.
- `client/src/components/booking/AvailabilityCalendar.tsx`: weekday labels clamped to 3 chars (pt-PT CLDR returns full names); single-month mode for the widget.

---

## 6. Config, flags, kill switches (env on Render)

- `CHECKOUT_V2=true` → force new checkout everywhere (else dev-host-only). **Leave unset in prod until go-live.**
- `CHECKOUT_PROMO=true` → show the promo-code field in prod (default hidden in prod, always shown on dev). Empty promo field is a known conversion leak.
- `CHECKOUT_RECOVERY=false` → silence the abandonment-email scheduler.
- `EMAIL_FROM` → transactional sender (default `booking@portugalactive.com`; the domain must be Resend-verified).
- `PUBLIC_BASE_URL`/`PUBLIC_URL`/`APP_URL` → base for email links (default `https://dev.portugalactive.com`).
- Payment envs (names only, unchanged): `STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_KLARNA_WEBHOOK_SECRET`, `STRIPE_PAYPAL_WEBHOOK_SECRET`, `GUESTY_BE_CLIENT_ID/SECRET`, `GUESTY_CLIENT_ID/SECRET`, `GUESTY_BASE_URL`, `GUESTY_WEBHOOK_SECRET`. No `VITE_*` payment envs. `RESEND_API_KEY` absent → emails log to console (`[EMAIL SERVICE - DEV MODE]`).
- Client override for testing: `?checkoutv2=1` (24h TTL in localStorage).

**Known non-secrets:** `server/routers/booking.ts` logs the first 10 chars of the publishable key (intentional). `scripts/guesty-sync.mjs` has hardcoded LIVE credentials — **never copy that bootstrap**; use the env-var style of `scripts/guesty-test.mjs`. Guesty OAuth is capped at 3 renewals/24h, shared with prod.

---

## 7. Pending work & the 3 human blockers

**Human blockers (nobody can proceed without these):**
1. **Spike** — `node scripts/spike-invoice-items.mjs --reservation <TEST_ID> --execute` → decides Phase 2b path A vs B. IRREVERSIBLE; test reservation only.
2. **Hostkit test** — add a €1 invoice item to a Guesty test reservation, check if the Hostkit-generated (AT-certified) invoice shows it as a **discriminated line with correct VAT**. Decides whether extras invoice automatically (A) or need our own Hostkit API call.
3. **End-to-end test booking** on dev (cheap house, real card, then refund) — validates funnel + CS email + Guesty note + confirmation email + lead row.

**Engineering queue (ordered):**
- **Phase 2b — real single charge** (after spike): extras/Flex/reception actually captured in one payment + partial-refund tested. *This is the gap in §3.*
- **Block B (catalog):** per-house-type pricing (housekeeping/linen resolved from listing bedroom count); distance-based transfer engine (replaces the interim north/south airport filter — currently a Porto/Lisbon selector per row); private chauffeur; chef pre-booking base price (configurable); "The table before The home" chapter reorder (spec B8, not yet done).
- Children field in guest selector → curation promotes crib/high-chair/babysitter.
- Phase 3: `flex_credits` ledger. Phase 4: pre-arrival email (10 days). Purchase event with full `items[]`. CRM emails in 9 languages (today PT/EN). Multibanco/MB Way. Bókun real-time availability. CAPI server-side (emission point = the paid hook). GTM tags for the new events (container GTM-TRPCDT3).
- **Go-live:** merge `dev`→`main` (prod stays legacy behind the flag), then set `CHECKOUT_V2=true` when ready.

**Product decisions owned by Ricardo (values tuned last):** chef base price, reception 50/90€, all extra prices (with Susana/Diogo), Flex 250€/1500€ threshold/7d/18m + copy validated by **André Feiteiro** (mandatory before prod — legal), arrival bundle discount, early check-in yes/no, deposit-waiver decision.

---

## 8. Inviolable rules (project memory — do not break)

- **Flex is NEVER called "insurance"/"seguro"** in any language (ASF insurance-distribution law — it is structured as a tariff option; copy validated by André before prod).
- **Before payment we promise the PRICE, never the dates.** Dates are only held after payment (card creates the Guesty reservation at charge time; Klarna/PayPal after). The intent never touches the Guesty calendar. All copy must reflect this.
- **Voice (PT):** no em-dash used as a comma/parenthesis; hyphens inside words stay (check-in, Bem-estar). The i18n script has a banned-vocabulary check.
- **Images:** own-domain or Bókun CDN only; no stock, no generated. Sku without an approved asset renders as a typographic line, never an empty box.
- **Max two protections in the funnel** (Flex in step 2; deposit-waiver in step 3 if/when it exists). Never stack fears.
- **Honesty:** within the free-cancellation window we refund money, never credit.

---

## 9. Run, verify, preview

- **Build:** `npm install --legacy-peer-deps` (mandatory — an ERESOLVE otherwise) then `npm run build`. Baseline `tsc --noEmit` errors (chart.tsx, entry-server, i18n, ReviewsSection regex, guesty-booking param) are **pre-existing from `main`**, not from this work.
- **Local QA:** `npm run dev` does NOT render correctly — use a **prod build** + the `prod` config in `.claude/launch.json` (`JWT_SECRET=local-qa-throwaway npm run start`), then browse `http://localhost:3000/pt/checkout/demo`. Restart the server after each rebuild (it caches `index.html`). `.env.local` with `NODE_ENV` poisons local prod builds with the dev React bundle — the build script now pins `NODE_ENV=production`.
- **Demo mode:** `/checkout/demo` renders the full checkout from a mock intent — no server writes, no analytics, charge impossible (fake quoteId fails server 24-hex validation). Best surface for UI review. The demo listing is marked pet-friendly on purpose so the pet circuit is visible.
- **Adversarial review harness:** the funnel was audited by a 43-agent multi-agent review (each finding verified by an independent refuter). If you make broad changes, re-run that style of review before merging.

---

*Written 12 Jul 2026 at commit `b385f70`+ on `dev`. When in doubt about intent vs. bug, grep the commit message — every change is committed with a Portuguese rationale.*
