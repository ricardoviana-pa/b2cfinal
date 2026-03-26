# Decisions Log

## 2026-03-23

### 1) Route Layer Choice
- **Decision:** Implemented required booking/webhook endpoints as Express REST routes in `server/routes/booking.ts` (TypeScript) and mounted them in `server/_core/index.ts`.
- **Why:** Existing server architecture is TypeScript + tRPC + Express. Adding TypeScript REST routes avoids introducing JS-only files and keeps type safety.
- **Impact:** Meets `/api/listings/*`, `/api/reservations/*`, `/api/webhooks/guesty` requirements without breaking current tRPC stack.

### 2) Guesty Auth Compatibility
- **Decision:** Production integration uses **OAuth2 client credentials only** (`GUESTY_CLIENT_ID` / `GUESTY_CLIENT_SECRET`) for the Open API; tokens are cached in-memory and on disk under `.cache/` to reduce token endpoint traffic.
- **Why:** Guesty Open API expects OAuth; rotating API-key shortcuts bypass refresh semantics and contributed to rate-limit issues during development.
- **Impact:** `GUESTY_API_KEY` is not used by the centralized client — configure OAuth credentials in `.env`.

### 3) Money Handling Model
- **Decision:** New centralized Guesty client normalizes money to integer cents internally for quote breakdown fields.
- **Why:** Requirement states "never floats" on server.
- **Impact:** Existing legacy flows still use major units in some old paths, but all new REST pricing endpoints return cents.

### 4) Webhook Security
- **Decision:** Webhook route enforces `X-Guesty-Signature` validation using HMAC SHA-256 against `GUESTY_WEBHOOK_SECRET` (hex/base64 support).
- **Why:** Requirement mandates signature validation.
- **Impact:** If secret/signature is missing/invalid, endpoint returns `401` and does not process payload.

### 5) Booking Flow Migration Strategy
- **Decision:** Added new premium multi-step flow under `/booking/:listingId/*` and connected it from property pages, while keeping the legacy inline widget as fallback/manual path.
- **Why:** Safer rollout without hard-breaking existing conversion path.
- **Impact:** Primary UX is premium flow; legacy widget remains available as backup.

### 6) Calendar Rendering Approach
- **Decision:** Used `react-day-picker` range mode with a custom day button that shows nightly price when available from Guesty calendar payload.
- **Why:** Reuses existing design system calendar component and meets dual-month + mobile modal requirements quickly.
- **Impact:** If Guesty calendar doesn't include day price for a date, cell still renders as available but without amount.

### 7) Step 1 UX Interpretation
- **Decision:** Step 1 contains a read-only summary card plus interactive calendar/rate-plan controls.
- **Why:** Booking URL starts at summary route without guaranteed preselected dates from previous page.
- **Impact:** Keeps intended summary section while allowing first-time users to select dates/rate directly there.

### 8) Rate Plan Price Display
- **Decision:** Rate plan cards show totals by requesting one quote per rate plan for selected dates.
- **Why:** `GET /listings/{id}/ratePlans` typically provides policy/adjustment metadata, not guaranteed final totals for a date range.
- **Impact:** Slightly more API calls, but cards display realistic totals for "Flexivel" vs "Nao reembolsavel".

### 9) Webhook Signature Format
- **Decision:** Signature check accepts HMAC SHA-256 in either hex or base64 from `X-Guesty-Signature`.
- **Why:** Guesty integrations vary by workspace/docs examples; accepting both avoids false negatives.
- **Impact:** Strict validation remains enforced while improving interoperability.

### 10) Rate Plan Endpoint Fallback
- **Decision:** If `GET /v1/listings/{id}/ratePlans` returns `404`, API responds with an empty rate-plan list instead of hard failure.
- **Why:** Some Guesty tenants expose rate plans only through quote flow or different entitlements.
- **Impact:** Booking flow still works; UI hides selectable rate cards when unavailable.
