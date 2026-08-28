# Guesty usage — B2C WEBSITE (portugalactive.com)

> Read-only audit. No code changed. Written 2026-08-24 against commit `a71f2f1`.
>
> **This repository is not in the four-repo list of the audit brief** (Revenue,
> Finance Copilot, Warehouse, Concierge). It is included because it is a heavy
> Guesty consumer and the only one that serves guests in real time.

## 1. Identity

| Item | Value |
|---|---|
| Repository | `ricardoviana-pa/b2cfinal` (public site + admin + booking) |
| Deploy target | **Render** (web service, auto-deploy from `main`). No `render.yaml` in the repo — service configured in the Render dashboard, so build/env settings are **unknown from code**. |
| Supabase project ref (prod) | **Not applicable** — this app does not use Supabase. Verified: no `supabase` reference anywhere in `server/`, `client/src`, `drizzle/`, `package.json`. |
| Supabase project ref (dev) | Not applicable (same check). |
| Database actually used | **MySQL** via `drizzle-orm/mysql2` (`server/db.ts`), single connection from `DATABASE_URL`. No schema qualifier is used anywhere — all tables live in the default schema of that connection. |
| Schemas written | Default MySQL schema only. Tables in §7. |
| Schemas read | Same. Plus **JSON files committed in the repo** (`client/src/data/*.json`), which are a second, git-backed store — see §7. |
| `pa_core` | **Not referenced anywhere in this repo.** |

## 2. Guesty credentials and tokens

Two independent Guesty integrations, each with its own credential pair and token.

| | Open API | Booking Engine (BE) API |
|---|---|---|
| Base URL | `GUESTY_BASE_URL` or `https://open-api.guesty.com` (`server/lib/guesty.ts:54`) | `https://booking.guesty.com` (see `guestyBEClient`) |
| Client id / secret | `GUESTY_CLIENT_ID` / `GUESTY_CLIENT_SECRET` (`guesty.ts:55-56`) | `GUESTY_BE_CLIENT_ID` / `GUESTY_BE_CLIENT_SECRET` (`guesty.ts:58-59`) |
| Token fetch | `fetchOAuthToken()` (`guesty.ts:355`), `POST /oauth2/token`, `grant_type=client_credentials` (`guesty.ts:380-390`) | `fetchBEOAuthToken()` (`guesty.ts:784`), same grant (`guesty.ts:827`) |
| Header injection | `getAuthHeaders()` (`guesty.ts:479`) | `getBEAuthHeaders()` (`guesty.ts:911`) |

**Where the token is stored — three layers, in this order** (`loadTokenCache`/`saveTokenCache`, `guesty.ts:185-207`):

1. **Process memory** — `oauthCache` / `beOauthCache` (`guesty.ts:80-82`).
2. **Database** — `site_settings` KV rows, category `guesty_auth`, keys `guesty_open_token`, `guesty_be_token`, `guesty_be_cooldown` (`guesty.ts:76-78`). This exists specifically because Render's disk is ephemeral; the comment at `guesty.ts:69-75` records the incident: deploys wiped the cache, forced new tokens, and **Guesty caps renewals at 3 per 24 h**, so a handful of deploys exhausted the quota and the API returned 429, killing live pricing site-wide.
3. **Disk** — `.cache/guesty-open-token.json`, `.cache/guesty-be-token.json` (`guesty.ts:64-67`), best-effort fallback.

**When a new token is generated**

- On **startup**: `warmUpOAuthTokens()` is called at boot (`server/_core/index.ts:556`) — but it loads the cached token first and only fetches when missing/expired.
- On **expiry**: `computeRefreshAt()` (`guesty.ts:305-319`) refreshes **5 minutes before expiry** for normal (24 h) tokens, or at 80 % of TTL for tokens under 10 minutes.
- **Never per request** — `request()` reuses the cached token.
- Concurrent refreshes are collapsed by `oauthRefreshPromise` / `beOauthRefreshPromise` (`guesty.ts:81,83`), so a burst of traffic produces one token fetch, not many.

**Caps and counters**

- No counter of tokens generated exists in the code. The only defences are the DB-persisted cache and cooldowns: `guestyAuthCooldownUntil`, `guestyBeAuthCooldownUntil`, with exponential backoff on consecutive 429s (`guestyAuthConsecutive429s`, `guesty.ts:84-87`), capped at `GUESTY_MAX_OAUTH_COOLDOWN_MS` / `GUESTY_MAX_BE_OAUTH_COOLDOWN_MS`, default **60 s** each (`guesty.ts:62-63`).
- Request pacing (not token pacing): `createPacedLimiter` (`guesty.ts:112`) — Open API 3 concurrent / 250 ms, BE API 5 concurrent / 200 ms (`guesty.ts:147-153`), matching Guesty's documented 5 req/s, 275/min, 16 500/h, 15 concurrent.

**How many tokens on a bad day**

With the DB cache healthy: **2 per 24 h per API** (one scheduled refresh each), regardless of restarts, because every instance reads the same `site_settings` row.

With the DB unavailable — the realistic bad day — the cache degrades to per-instance disk, and Render wipes disk on every deploy. Then it is **one token per API per deploy/restart/crash**. Ten deploys in a day = 10 Open + 10 BE token requests against a documented cap of **3 renewals per 24 h**, which is precisely the failure the code comments describe. There is no hard stop in code to prevent it.

## 3. Endpoints called

| API | Method | Path | Query / filters | Pagination | Caller | Trigger |
|---|---|---|---|---|---|---|
| Open | GET | `/v1/listings` | `limit=50`, `skip`, `active=true`, `listed=true`, `fields=<explicit list>` | `limit`/`skip` loop, page size 50 (`guesty-sync.ts:54-58`) | `guestyClient.getListings` (`guesty.ts:675`) → `runSync` | Cron 07:00 & 19:00 Europe/Lisbon |
| Open | GET | `/v1/listings/{id}` | `fields` optional | — | `guestyClient.getListing` (`guesty.ts:687`) | Reservation lookup (`server/routes/booking.ts`), cached 6 h |
| Open | GET | `/v1/listings/{id}/ratePlans` | — | — | `guestyClient.getListingRatePlans` (`guesty.ts:702`) | Cleaning-fee audit only |
| Open | GET | `/v1/reviews` | `limit=100`, `skip` | `limit`/`skip` loop (`guesty-sync.ts:342-350`) | `guestyClient.getReviews` (`guesty.ts:775`) | Cron, inside `runSync` |
| Open | GET | `/v1/guests/{id}` | — | — | `guesty-sync.ts:578` | Cron — resolves review author first names |
| Open | POST | `/v1/quotes` | body: `listingId`, `checkInDateLocalized`, `checkOutDateLocalized`, `guestsCount`, `numberOfGuests{...}`, `source:"OAPI"`, `ignoreTerms/Calendar/Blocks:false`, optional `ratePlanId` | — | `guestyClient.createQuote` (`guesty.ts:718`) | User action — `GET /api/listings/:id/quote` |
| Open | GET | `/v1/reservations/{id}` | `fields` varies | — | `guesty-openapi-paypal.ts:115,172,236` | PayPal/Klarna settlement |
| Open | POST | `/v1/reservations-v3` | full reservation body | — | `guesty-openapi-paypal.ts:34` | **Write** — PayPal/Klarna booking |
| Open | POST | `/v1/reservations/{id}/payments` | payment body | — | `guesty-openapi-paypal.ts:212` | **Write** |
| Open | POST | `/v1/invoice-items/reservation/{id}` | invoice item body | — | `guesty-openapi-paypal.ts:151` | **Write** — site-total delta as `AFE` item |
| Open | PUT | `/v1/reservations/{id}` | reservation patch | — | `guesty-openapi-paypal.ts:260` | **Write** |
| Open | PUT | `/v1/listings/{id}/ratePlans/{ratePlanId}` and `/v1/rate-plans/{ratePlanId}` (tries both shapes) | body `{money:{fareCleaning}}` | — | `cleaning-fee-sync.ts:173` | **Write** — cron 07:15/19:15, only if `CLEANING_FEE_SYNC_ENABLED=apply` |
| BE | GET | `/api/listings` | `checkIn`, `checkOut`, `minOccupancy`, `limit`, `fields=totalPrice …` | single call, `limit` = number of listings (max 50 per Guesty) | `guestyBEClient.getListingsWithPricing` (`guesty.ts:1068`) → `booking.getBatchQuotes` (`routers/booking.ts:325`) | User action — PLP search with dates |
| BE | GET | `/api/listings/{id}/calendar` | `from`, `to` (YYYY-MM-DD) | — | `guestyBEClient.getCalendar` (`guesty.ts:1089`) | User action — PDP calendar (`routers/booking.ts:141`), lowest-nightly (`lowest-nightly.ts:90`), search-hint (`search-hint.ts:59`) |
| BE | GET | `/api/listings/{id}/payment-provider` | — | — | `guesty-booking.ts:492` | Checkout — provider lookup |
| BE | GET | `/api/reservations/{id}/summary` | — | — | `guesty.ts:770` | Confirmation page |
| BE | POST | `/api/reservations/quotes` | body: listing, dates, guests, guest details | — | `guesty-booking.ts:344` | User action — PDP widget + checkout |
| BE | POST | `/api/reservations/quotes/{quoteId}/coupons` | `{coupons:[...]}` | — | `guesty-booking.ts:520` | **Write** — coupon applied at checkout |
| BE | POST | `/api/reservations/quotes/{quoteId}/instant` | `ratePlanId`, `ccToken`, guest details | — | `guesty-booking.ts:426` | **Write** — card booking |

`/v1/reservations` (list form) is **never called** — this app only fetches reservations by id, so the `filters` question does not arise here. Confirmed by grep: every `/v1/reservations` call site includes an id segment.

## 4. Fields consumed

### Listing (Open API `/v1/listings`) — `server/services/guesty-sync.ts`

Requested `fields` string (`guesty-sync.ts:32,56`):
`title publicDescription publicDescriptions description pictures address accommodates bedrooms bathrooms prices terms amenities amenitiesNotIncluded customFields listingRooms propertyType defaultCheckInTime defaultCheckOutTime areaSquareFeet`

Paths actually read:

| Path | Used for |
|---|---|
| `_id` | `guestyId`, slug pinning |
| `_isPortfolio` | `isPortfolio` flag |
| `title` | name (then sanitised) |
| `publicDescription.{summary,space,neighborhood,access,transit,notes,interaction,interactionWithGuests}` | description + `descriptionSections` |
| `publicDescriptions` | fallback shape |
| `description` | legacy fallback |
| `pictures[]` | images (Cloudinary URLs) |
| `address.{address,street,city,state,region,country,zipCode,postalCode,lat,lng}` | locality, destination inference, map, JSON-LD geo |
| `accommodates` | `maxGuests` |
| `bedrooms`, `bathrooms` | specs |
| `areaSquareFeet` | m² chip |
| `propertyType` | type + PLP filter |
| `prices.{basePrice,cleaningFee,currency}` | `priceFrom`, `cleaningFee`, currency |
| `terms.{minNights,minNight}` | `minNights` |
| `amenities` | amenity groups; **`petsAllowed` is derived from the string "Pets allowed"** (`guesty-sync.ts`, added Aug 2026) |
| `amenitiesNotIncluded` | requested but **never read** |
| `customFields` | AL licence extraction (`extractLicense`, keys matching `/\b(al|rnal)\b|licen|regist/i`) |
| `listingRooms[].beds[].{type,quantity}` | bed configuration |
| `defaultCheckInTime`, `defaultCheckOutTime` | check-in/out chips + FAQ |
| `listingId` | present in mapper, defensive |

### Listing (BE API `/api/listings`) — `server/routers/booking.ts`

`_id`, `totalPrice`, `prices.{basePrice,cleaningFee,currency}`. The BE response also carries `title`, `accommodates`, `address.{city,country}`, `reviews.{avg,total}`, `picture.thumbnail` (typed in `BEListingWithPrice`, `guesty.ts:183-189`) — **typed but never read**; the app uses its own synced copies.

### Calendar (BE `/api/listings/{id}/calendar`)

`date`, `status`, `minNights`, `cta`, `ctd`, `price`. Read in `lowest-nightly.ts`, `search-hint.ts`, `routers/booking.ts`. The payload also returns `maxNights`, `allotment`, `isBaseMinNights`, `blocks{…}` — **never read**.

### Review (Open `/v1/reviews`) — `guesty-sync.ts`

`listingId`, `rating`, `date`, `createdAt`, `guest`, `guestName`, `guestFirstName`, `guestId`, `_guestId`, `channel`, `channelName`, `platform`, `source`, `type`, `status`, `isPrivate`, `private`, `rawReview`.
Note: `channel`/`channelName`/`platform`/`source` are read to *filter*, and deliberately **not exposed** on the site (brand decision: no OTA attribution).

### Guest (Open `/v1/guests/{id}`)

`firstName` and the picture URL (`guestPictureUrl(g)`). Nothing else.

### Quote (BE `/api/reservations/quotes` and Open `/v1/quotes`)

`_id`, `rates.ratePlans[]`, and per plan: `ratePlan.{_id,name,cancellationPolicy,cancellationFee}`, `money.money.{fareAccommodation,fareAccommodationAdjusted,accommodationFare,fareCleaning,cleaningFee,subTotalPrice,totalPrice,total,totalAmount,hostPayout,currency,invoiceItems[]}`; invoice items read by `{normalType,type,amount,title}` for tourist tax and VAT (`extractTaxes`, `guesty.ts:587`), `coupons`.

### Reservation (Open + BE)

`_id`, `confirmationCode`, `status`, `canceled`/`cancelled`, `cancellationPolicy`, `created`, `checkIn`, `checkOut`, `checkInDateLocalized`, `checkOutDateLocalized`, `guestsCount`, `guests`, `listingId`, `listing.{_id,_idStr,title,address,address.full}`, `listingName`, `guest.{firstName,lastName,fullName,email,phone}`, `money.{fareAccommodation,fareAccommodationAdjusted,accommodationFare,fareCleaning,cleaningFee,totalPrice,total,totalAmount,hostPayout,currency,paymentStatus}`.

### Not consumed at all

No task, no owner, no expense, no financial-report entity. This app never touches those.

## 5. Sync windows and cadence

| Entity | Window | Cadence | If a run is missed |
|---|---|---|---|
| Listings | Whole active portfolio (`active=true`, `listed=true`), no date window | Cron **07:00 and 19:00 Europe/Lisbon** (`_core/index.ts:560`). Startup sync is **deliberately disabled** to avoid OAuth exhaustion on deploys. | No visible breakage: the site serves `client/src/data/properties.json`, committed to git by the previous run. Data ages silently — new photos/prices/text appear up to 12 h late. |
| Reviews | All reviews, all listings, paginated 100 at a time | Same cron, inside `runSync` | Same fallback. Partial-fetch protection exists (`reviewsArePartial`) so a truncated run does not wipe existing reviews. |
| Guests | Only ids referenced by fetched reviews | Same cron | Reviews fall back to stored display names. |
| Calendar | **Live, no cache window** — fetched per request | On demand. `lowest-nightly` scans **today → +90 days**, sampling every 7 days (`lowest-nightly.ts:26-28`); `search-hint` validates up to **120 nights** and scans **21 days** of arrivals for up to 5 listings (`search-hint.ts:21-26`); PDP calendar fetches by month (`routes/booking.ts:612`). | Prices and availability disappear from the UI within the 60 s cache TTL. This is the hard real-time dependency. |
| Quotes | Live per request; anonymous quotes cached **8 min** (`guesty-booking.ts:23`); Guesty guarantees the price 24 h | On demand | Checkout cannot proceed. |

**What the app considers "current"**: listings/reviews may be up to 12 h stale (accepted); calendar and quotes must be live — the 60 s calendar cache and 8 min quote cache are the maximum tolerated staleness, because a wrong price is a wrong booking.

## 6. Writes to Guesty

Six write paths. All are **user-triggered transactions except the last**.

| What | When | Where |
|---|---|---|
| `POST /api/reservations/quotes` | Guest opens the booking widget or checkout | `guesty-booking.ts:344` (`createBEQuote`) |
| `POST /api/reservations/quotes/{id}/coupons` | Guest applies a promo code | `guesty-booking.ts:520` (`applyCouponToBEQuote`) |
| `POST /api/reservations/quotes/{id}/instant` | Guest pays by card — creates the reservation | `guesty-booking.ts:426` (`createBEInstantReservation`) |
| `POST /v1/reservations-v3` | Guest pays via PayPal or Klarna | `guesty-openapi-paypal.ts:34` |
| `POST /v1/reservations/{id}/payments` + `POST /v1/invoice-items/reservation/{id}` + `PUT /v1/reservations/{id}` | Settlement of the PayPal/Klarna booking; the invoice item carries the site-total delta as an `AFE` line | `guesty-openapi-paypal.ts:151,212,260` |
| `PUT` rate plan `{money:{fareCleaning}}` | **Cron 07:15 / 19:15**, only when `CLEANING_FEE_SYNC_ENABLED=apply`; defaults to dry-run | `cleaning-fee-sync.ts:173` |

The last one is the only write that is not driven by a guest, and the only one that mutates configuration rather than creating a transaction. Its production mode is **unknown from code** — it depends on the Render env var.

## 7. Local storage of Guesty data

This app has **two stores**, and the git-backed one is the source of truth for the public site.

### A. Git-backed JSON (primary for the site)

| File | Written by | Read by |
|---|---|---|
| `client/src/data/properties.json` | `runSync` → also **committed to GitHub** via the API (`GITHUB_PAT`, repo `ricardoviana-pa/b2cfinal`, branch `main`, commit message `[auto-sync]`) — `guesty-sync.ts:13-16` | `properties-store.ts` → every public page, SSR meta, sitemap, collections, PLP, PDP |
| `data/properties-synced.json` | `runSync` (runtime copy, freshest) | `properties-store.ts:31` — preferred over the committed file |
| `client/src/data/descriptions.overrides.json` | Humans + `scripts/generate-descriptions.mjs` | `runSync` — overrides Guesty copy |
| `client/src/data/licenses.json`, `data/licenses.json` | Humans | `runSync` — manual AL numbers |
| `client/src/data/reviews`/`properties.json` review arrays | `runSync` | `ReviewsSection` |

Raw Guesty JSON is **not** kept: the sync maps to the site's own shape and discards the rest.

### B. MySQL (transactional only)

| `table` | Guesty-derived columns | PK | Written by | Read by |
|---|---|---|---|---|
| `booking_intents` | `listingId`, `guestyQuoteId`, `checkIn`, `checkOut`, `guests`, `ratePlanId`, `ratePlanType`, `nightlyRate`, `totalNights`, `cleaningFee`, `taxesAndFees`, `total`, `nights`, `currency`, `quoteCreatedAt`, plus guest contact and extras | `id` (uuid) | checkout router | checkout, recovery sweep |
| `customer_trips` | `guestyReservationId`, confirmation code, dates, listing name, price | `id` | booking success handler | `/account` |
| `site_settings` | `guesty_open_token`, `guesty_be_token`, `guesty_be_cooldown` (category `guesty_auth`) | `id` | `guesty.ts` token layer | same |
| `properties` (MySQL) | legacy table with the same shape | `id` | **nothing** — the sync does not write it | `properties.list` / `getPropertyBySlug` tRPC procedures, admin only |
| `reviews` (MySQL) | legacy | `id` | nothing | admin |
| `leads` | not Guesty data, but `metadata.listingId/checkIn/checkOut` come from Guesty context | `id` | checkout `captureLead`, forms | `/admin/leads` |

**No cross-schema function, trigger or view exists.** Nothing named `fn_sync_guesty_tasks` or similar is present; grep for `pa_core` returns nothing.

## 8. Webhooks

One endpoint: **`POST /api/webhooks/guesty`** (`server/routes/booking.ts:161`).

- **Signature**: HMAC-SHA256 over the raw body with `GUESTY_WEBHOOK_SECRET`, accepting hex or base64 (`routes/booking.ts:166-177`). Invalid signature → 401.
- **Events handled**: `listing.updated`, `reservation.created`, `reservation.updated`, `reservation.canceled`, `reservation.cancelled` (`routes/booking.ts:212-227`).
- **Processing**: responds 200 immediately, then works in `setImmediate` — logs a structured line and **invalidates the listing cache**; reservation events update trip status via `updateTripStatusByReservationId`.
- **Storage**: payloads are **not stored**. Only the structured log line survives.
- **Whether Guesty is actually configured to call this URL is unknown from code** — registration happens in the Guesty dashboard.

## 9. Dependencies on other apps

**Produced by this app, consumed elsewhere**

- `client/src/data/properties.json`, auto-committed to GitHub twice a day. Any other repo or script that reads that file (directly or via a clone) depends on this app's sync. `scripts/meta-catalog.mjs` in this repo builds the Meta catalogue feeds from it.
- Reservations created in Guesty by this app (card, PayPal, Klarna) are what Revenue/Finance see downstream.
- The `AFE` invoice item written at settlement changes what Finance reads for those bookings.

**Consumed from other apps**

- None in code. This app reads Guesty directly and no other app's database.

**Unknown**: whether Warehouse/Concierge/Revenue read this repo's `properties.json` or the MySQL tables. Nothing in this repository declares such a consumer.

## 10. What would break if this app read `pa_core` instead

| Area | Breaks because |
|---|---|
| **PLP with dates** (`getBatchQuotes`) | Needs `totalPrice` for the exact requested stay, computed by Guesty per rate plan. A cached nightly table cannot answer "what does 11–18 Sep cost for 4 guests". **Live call must stay.** |
| **PDP price + calendar** | Same. Also needs `cta`/`ctd`/`minNights` per day, current to the minute. |
| **Checkout** (quote → coupon → instant) | Writes. Must stay in this app (§6). |
| **"From €X" on cards** (`lowest-nightly`) | Could read `pa_core` **only if** the shared table stores per-day nightly price for a 90-day horizon with ≤24 h freshness. Today it samples every 7 days over 90 days. |
| **Search hint / availability suggestions** | Needs per-day `status`, `cta`, `minNights` up to **120 nights ahead** — the widest window in this app. |
| **Property pages, SEO, sitemap, collections** | Safe to migrate: they already read a 12 h-old JSON snapshot. Needs every listing field in §4, including `customFields` (AL licence) and the amenity strings used to derive `petsAllowed` and the pool filters. |
| **Reviews section** | Safe to migrate, but the shared table must keep `channel`/`platform` so the 5★-only, no-attribution rule still works, and `guest.firstName` resolved from `/v1/guests`. |
| **Confirmation page + `/account` trips** | Reads a single reservation by id right after payment. A shared table would have to be written within seconds of the booking, or this must stay live. |
| **Webhook cache invalidation** | If Guesty points its webhook at the shared worker instead, this app loses its listing-cache invalidation and stale-price signal unless the worker re-broadcasts. |
| **Cleaning-fee sync** | A write. Stays here, or moves wholesale to the shared layer — it must not run in two places. |

## 11. Open questions

1. **Why is this repo not in the four-app list?** It is the largest Guesty consumer and the only real-time one. Was the omission deliberate?
2. **Render env values are invisible from code**: is `CLEANING_FEE_SYNC_ENABLED` set to `apply` in production? If yes, this app is writing rate-plan cleaning fees twice a day and the shared layer must not duplicate it.
3. **Is the Guesty webhook actually registered** against `/api/webhooks/guesty`, and with which events? Only the handler is visible here.
4. **Does any other app read `client/src/data/properties.json`** (or a clone of this repo)? If so, the auto-commit is a de facto integration contract.
5. **Is the MySQL database intended to survive** the move to a shared Supabase project, or should `booking_intents`/`customer_trips` migrate too? They hold Guesty ids but are transactional, not cached Guesty data.
6. **Token quota**: with four apps plus this one, do they share one Guesty client id or five? At 3 renewals/24 h per credential, a shared credential across apps would collide; separate credentials multiply the OAuth surface.
7. **`/v1/reservations` list with `filters`** — not used here, so this audit cannot answer the brief's question about it. Expect the answer from Revenue/Finance.
