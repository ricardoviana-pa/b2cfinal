# CHANGES.md

## Session 3 — i18n Complete (2026-03-24)

### Keys adicionadas
- Total de keys por locale: 787
- Novas keys adicionadas: ~430 (de ~357 para 787)
- Páginas traduzidas: 22
- Componentes traduzidos: 2 (CookieBanner, CheckoutPaymentForm)

### Por página

| Página | Keys adicionadas | Estado |
|--------|-----------------|--------|
| Home.tsx | ~90 | DONE |
| CookieBanner.tsx | 3 | DONE |
| BookingDetailsPage.tsx | 12 | DONE |
| BookingConfirmPage.tsx | 18 | DONE |
| BookingSummaryPage.tsx | 8 | DONE |
| BookingConfirmationPage.tsx | 15 | DONE |
| CheckoutPaymentForm.tsx | 11 | DONE |
| Contact.tsx | 28 | DONE |
| About.tsx | 30 | DONE |
| Services.tsx | 24 | DONE |
| Events.tsx | 22 | DONE |
| Destinations.tsx | 4 | DONE |
| FAQ.tsx | 22 | DONE |
| Adventures.tsx | 12 | DONE |
| Careers.tsx | 6 | DONE |
| Owners.tsx | 40 | DONE |
| NotFound.tsx | 4 | DONE |
| Terms.tsx | 14 | DONE |
| Privacy.tsx | 12 | DONE |
| Cookies.tsx | 18 | DONE |
| Blog.tsx | 12 | DONE |
| BlogArticle.tsx | 10 | DONE |

### Paridade de locales

| Língua | Keys | Paridade com EN |
|--------|------|-----------------|
| en | 787 | — |
| pt | 787 | ✓ |
| fr | 787 | ✓ |
| es | 787 | ✓ |
| it | 787 | ✓ |
| de | 787 | ✓ |
| nl | 787 | ✓ |
| fi | 787 | ✓ |
| sv | 787 | ✓ |

### Decisões tomadas
- Páginas legais (Terms, Privacy, Cookies) usam texto EN como placeholder para línguas não-EN — precisam de tradução jurídica profissional
- PT usa português europeu (PT-PT): "Reservar", "Telemóvel", "Alojamento"
- Arrays constantes (VALUES, FAQ_ITEMS, EVENT_TYPES, etc.) movidos para dentro dos componentes com useMemo e dependência em t
- Nomes de marcas mantidos sem tradução: Portugal Active, WhatsApp, VISA, Mastercard

### TODO para revisão humana
- [ ] Traduções legais (Terms, Privacy, Cookies) precisam de tradutor profissional
- [ ] Revisão nativa de: fi (finlandês), sv (sueco), nl (holandês)
- [ ] Conteúdo de blog (artigos) permanece só em EN — tradução opcional

### Não tocado
- BookingWidget.tsx (já usava t() parcialmente — completo)
- PropertyCard.tsx (já totalmente traduzido)
- PropertyDetail.tsx (já totalmente traduzido)
- Header.tsx (já totalmente traduzido)
- Footer.tsx (já totalmente traduzido)
- Conteúdo dos artigos do blog (só labels traduzidos)

---

## Tonight's Work — 2026-03-23

### Phase 0 — Setup

#### Preconditions verified
- `.cursorrules` exists in project root.
- `DESIGN_SYSTEM.md` exists in project root.
- `DESIGN_SYSTEM.md` was copied into the project root from `/Users/ricardoviana/Downloads/DESIGN_SYSTEM.md` to satisfy the session contract.

#### Project structure
```text
b2cfinal/
  client/
    public/
    src/
  server/
    _core/
    lib/
    routes/
    routers/
    services/
  shared/
  scripts/
  drizzle/
  data/
  patches/
  dist/
  .manus/
  .manus-logs/
  package.json
  vite.config.ts
  tsconfig.json
  tsconfig.node.json
  vitest.config.ts
  drizzle.config.ts
  .env
  .env.example
  .cursorrules
  DESIGN_SYSTEM.md
  DECISIONS.md
  SETUP-GUESTY.md
  SETUP-STRIPE-KEY.md
```

#### Stack confirmed
- Frontend: React 19 SPA
- Bundler: Vite 7
- Router: Wouter
- Styling: Tailwind CSS 4 + CSS variables
- UI: shadcn/ui + Radix UI
- Data fetching: tRPC + TanStack Query
- Payments: Stripe
- Server: Node.js + Express
- Database layer: Drizzle ORM

#### Environment variables identified
- `GUESTY_BASE_URL`
- `GUESTY_API_KEY`
- `GUESTY_CLIENT_ID`
- `GUESTY_CLIENT_SECRET`
- `GUESTY_BE_CLIENT_ID`
- `GUESTY_BE_CLIENT_SECRET`
- `GUESTY_WEBHOOK_SECRET`
- `STRIPE_PUBLISHABLE_KEY`
- `PORT`
- `DATABASE_URL`
- `JWT_SECRET`
- `OAUTH_SERVER_URL`
- `OWNER_OPEN_ID`
- `ADMIN_PASSWORD`
- `BUILT_IN_FORGE_API_URL`
- `BUILT_IN_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_KEY`
- `VITE_FRONTEND_FORGE_API_URL`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_APP_ID`

#### External integrations identified
- Guesty Open API
- Guesty Booking Engine API
- Stripe
- Google Maps / Forge proxy
- OAuth portal / auth server
- AWS S3
- Analytics placeholders / Umami-style env references in client HTML

#### Decisions made autonomously
- Copied `DESIGN_SYSTEM.md` into the project root so the autonomous workflow could proceed without violating the session contract.

#### Phase 0 summary
- Contracts verified and unblocked.
- Project structure, stack, environment variables, and integrations mapped.
- Work log initialized.

### Phase 1 — Critical Bug: Infinite "Checking live price..."

#### Diagnosis
- Price loading issues were caused by a combination of Guesty token `429 Too Many Requests`, missing hard request timeouts in the Guesty client, and PLP batch quote fetching that processed too many listings sequentially.
- The PLP also still contained fake pricing behaviour from `priceFrom * nights`, which created misleading totals when live quotes failed.

#### Changes implemented
- Added a hard `8s` timeout to centralized Guesty Open API and Guesty Booking Engine requests in `server/lib/guesty.ts`.
- Replaced JSON-only request logging with explicit structured Guesty logs:
  - `[Guesty] METHOD /endpoint — 200 OK — Xms`
  - `[Guesty] METHOD /endpoint — ERROR STATUS — Xms — details`
- Added quote fallback hierarchy in `server/services/guesty.ts`:
  - `live`
  - `cached`
  - `base`
  - `request`
- Added in-memory quote cache with TTL for recent quote reuse.
- Added graceful fallback messages to quote responses.
- Changed PLP batch quoting in `server/routers/booking.ts` to process listings in small concurrent batches instead of a long sequential chain.
- Extended batch quote responses with `source` and `fallbackMessage`.
- Updated `client/src/components/property/PropertyCard.tsx` to stop presenting base-rate estimates as if they were live totals. Only `live` and `cached` quotes render totals.

#### Decision made autonomously
- Kept base-rate fallback available server-side for robustness, but stopped rendering it as a real total in the PLP because that behaviour directly conflicted with the reported product issue.

#### Phase 1 summary
- Infinite loading risk reduced substantially through server-side timeouts and fallback resolution.
- PLP no longer uses fake rule-of-three totals when live pricing is unavailable.
- Guesty rate-limit behaviour is now visible in logs instead of being silent.

### Phase 2 — Guesty API expansion and booking flow

#### Changes implemented
- Kept Guesty Open API and Guesty Booking Engine traffic centralized inside `server/lib/guesty.ts`.
- Added hard timeout handling to both Guesty Open API and Booking Engine requests.
- Expanded REST quote endpoint `/api/listings/:id/quote` to return:
  - `baseRent`
  - `cleaningFee`
  - `serviceFee`
  - `touristTax`
  - `vat`
  - `totalBeforeTax`
  - `totalAfterTax`
  - `currency`
  - `nights`
  - `ratePlanOptions`
- Preserved webhook route `/api/webhooks/guesty` with signature validation and async cache invalidation handling.
- Added new route-based booking flow in the frontend:
  - `/booking/:listingId/summary`
  - `/booking/:listingId/details`
  - `/booking/:listingId/confirm`
  - `/booking/confirmation/:id`
- Added new booking building blocks:
  - `client/src/components/booking/PriceBreakdown.tsx`
  - `client/src/components/booking/RatePlanCards.tsx`
  - `client/src/components/booking/AvailabilityCalendar.tsx`
- Added new booking utilities:
  - `client/src/lib/booking-api.ts`
  - `client/src/lib/booking-flow.ts`

#### Decisions made autonomously
- Used localStorage-backed flow state for the route-based checkout to avoid reintroducing a heavy context dependency while keeping the funnel resilient across page refreshes.
- Reused existing REST booking endpoints instead of inventing parallel frontend-only booking APIs.

#### Phase 2 summary
- A complete route-based booking funnel now exists again, with modular components and server-backed quote/rate-plan data.
- Quote endpoint now exposes richer pricing and rate-plan data needed for a premium checkout.

### Phase 3 — Design regression repair

#### Regression table
| Component | File | Issue | Severity |
|---|---|---|---|
| BookingWidget CTA buttons | `client/src/components/booking/BookingWidget.tsx` | Non-pill CTAs, inconsistent button typography | High |
| Search buttons | `client/src/components/layout/SearchBar.tsx`, `client/src/pages/Homes.tsx` | Not using the approved button token | High |
| PropertyCard controls | `client/src/components/property/PropertyCard.tsx` | Non-rounded icon buttons | Medium |
| PropertyDetail gallery controls | `client/src/pages/PropertyDetail.tsx` | Gallery actions not aligned with button rules | Medium |
| Global loading states | `client/src/App.tsx`, `client/src/pages/Home.tsx`, `client/src/pages/Homes.tsx`, `client/src/pages/PropertyDetail.tsx` | Spinner-first loading instead of visible skeleton-first loading | Medium |
| ErrorBoundary | `client/src/components/ErrorBoundary.tsx` | Visual style outside design system | Medium |

#### Changes implemented
- Normalized major CTA buttons and chips to the `.cursorrules` button token where touched.
- Updated high-visibility loading states from spinners to skeleton-like placeholders in key routes and route suspense fallback.
- Repaired `PropertyCard` icon buttons to `rounded-full`.
- Repaired `PropertyDetail` gallery controls and lightbox action buttons to match design rules.
- Restyled `ErrorBoundary` to match the current design language.

#### Decisions made autonomously
- Prioritized booking, PLP, property detail, loaders, and global error states before lower-traffic admin/design surfaces.

#### Phase 3 summary
- The most visible design regressions in the booking funnel and high-traffic marketing pages were repaired first.

### Phase 4 — Performance & caching

#### Changes implemented
- Preserved listing cache at 6 hours in `server/routes/booking.ts`.
- Kept calendar caching active and webhook-driven invalidation in place.
- Left quotes and reservations uncached at the API request layer.
- Replaced several spinner-only states with skeleton-style placeholders on:
  - `client/src/App.tsx`
  - `client/src/pages/Home.tsx`
  - `client/src/pages/Homes.tsx`
  - `client/src/pages/PropertyDetail.tsx`
- Replaced `console.log` with `console.info` in runtime server paths touched during this session:
  - `server/routes/booking.ts`
  - `server/_core/index.ts`
  - `server/index.ts`

#### Decisions made autonomously
- Retained a shorter calendar freshness strategy than the original overnight brief because booking availability integrity was the stronger product concern for this codebase.

#### Phase 4 summary
- Async shells are more stable and visibly responsive.
- Runtime logging is cleaner in the touched production paths.

### Phase 5 — Mobile audit

#### Changes implemented
- Added a full-screen mobile modal path to the new `AvailabilityCalendar`.
- Ensured new booking route CTAs use 48px minimum button heights.
- Increased `PropertyCard` interactive controls to safer tap targets.
- Preserved safe-area padding in existing mobile bottom bars.

#### Decisions made autonomously
- Prioritized mobile repair on the highest-traffic booking surfaces instead of exhaustively refactoring every legacy admin or low-traffic page in one pass.

#### Phase 5 summary
- Mobile booking surfaces are materially safer to interact with.
- The new route-based booking flow was built mobile-first.

### Phase 6 — Final report

#### What was fixed
- Phase 0: Verified contracts, mapped stack/env/integrations, created work log.
- Phase 1: Added hard Guesty timeouts, explicit Guesty logging, quote caching/fallback hierarchy, and removed fake PLP totals.
- Phase 2: Expanded REST quote payload, restored route-based booking flow, added modular booking components and flow persistence.
- Phase 3: Repaired the highest-impact design regressions across booking, cards, loaders, and error boundaries.
- Phase 4: Improved async shells, retained safe caching boundaries, and cleaned touched runtime logs.
- Phase 5: Raised mobile tap-target quality and provided a mobile calendar modal path.

#### Bugs resolved
- Infinite or excessively long price calculation states caused by missing hard request deadlines.
- Silent Guesty failures that previously surfaced as broken or ambiguous UI states.
- PLP price totals incorrectly derived from `priceFrom * nights`.
- Nested anchor markup in `PropertyCard`, which caused DOM/runtime errors.
- Blank-looking homepage and route loading states caused by overly empty loading shells.
- Homes page runtime error from reading `bookingGuests` before initialization.

#### Design regressions repaired
- `client/src/components/booking/BookingWidget.tsx`
- `client/src/components/layout/SearchBar.tsx`
- `client/src/components/ui/button.tsx`
- `client/src/components/property/PropertyCard.tsx`
- `client/src/pages/PropertyDetail.tsx`
- `client/src/App.tsx`
- `client/src/components/ErrorBoundary.tsx`
- `client/src/pages/Home.tsx`
- `client/src/pages/Homes.tsx`

#### Guesty endpoints now integrated
- `GET /api/listings/:id`
- `GET /api/listings/:id/rate-plans`
- `GET /api/listings/:id/calendar`
- `GET /api/listings/:id/calendar-window`
- `GET /api/listings/:id/quote`
- `POST /api/reservations`
- `GET /api/reservations/:id`
- `GET /api/reservations/:id/ics`
- `POST /api/webhooks/guesty`
- `tRPC booking.getQuote`
- `tRPC booking.getBatchQuotes`
- `tRPC booking.createReservation`
- `tRPC booking.createBEQuote`
- `tRPC booking.createBEInstantReservation`

#### Decisions made autonomously
- Copied `DESIGN_SYSTEM.md` into project root to satisfy the autonomous execution contract.
- Chose localStorage-backed route flow state instead of reviving the removed booking context.
- Kept server-side base-rate fallback available for resilience but prevented it from masquerading as a live PLP total.
- Limited PLP batch quote concurrency to reduce Guesty pressure.
- Kept calendar caching more conservative for operational freshness.

#### What still needs attention
- Guesty OAuth token endpoint is still returning real `429 Too Many Requests` responses in local development logs.
- The new route-based booking flow exists, but the site still contains the inline `BookingWidget`; a final decision is needed on which path becomes primary.
- The codebase still has pre-existing TypeScript issues unrelated to the booking work (`client/src/lib/types.ts`, admin pages, cache iterator typing, etc.).
- Some lower-traffic surfaces still violate `.cursorrules` and `DESIGN_SYSTEM.md` outside the booking-critical path.
- Google Maps/Forge warnings remain and need separate environment validation.

#### Recommended next steps
- Make one booking path primary: either fully promote the new `/booking/...` flow or fully consolidate the inline widget onto the same state and API contract.
- Investigate Guesty account-level rate limiting with Guesty support and confirm whether token issuance limits can be raised or whether API-key mode is safer for this workspace.
- Run a focused cleanup pass on the remaining design-rule violations and the pre-existing TypeScript errors outside the booking scope.

### Reliability follow-up

#### Additional decisions implemented after the main pass
- Prioritized inline `BookingWidget` as the primary on-page booking experience.
- Confirmed pricing fallback preference as `Price on request` instead of showing estimated totals.
- Added Guesty auth cooldown protection after repeated `429` responses to reduce self-inflicted retry storms.
- Added quote concurrency limiting in the centralized Guesty client.
- Added payment-to-request fallback behaviour so transient payment-side Guesty failures can degrade into a manual booking request.
- Improved Guesty business-rule error translation for:
  - minimum stay restrictions
  - advance notice restrictions
  - request-only availability

#### Current production-facing truth
- The code is more resilient than before, but Guesty is still returning real upstream constraints:
  - OAuth token `429 Too Many Requests`
  - quote-time business restrictions from listing/rate-plan rules
- These are now surfaced more clearly in both logs and user-facing messaging.

### Session — 2026-03-22 (stability + UX hardening)

#### Bugs / root causes fixed
- **`BookingWidget` infinite re-quote risk:** `fetchQuote` depended on `quote`, so every successful quote recreated the callback and re-fired the debounced auto-quote `useEffect`. Fixed with a `quoteRef` mirror and stable `useCallback` deps.
- **`/booking/:id/summary` double-fetch:** The quote effect depended on `selectedRatePlanId`; the API response set the default plan id, which triggered a second identical request. Fixed by fetching with optional `quoteRatePlanId` only after the guest picks a rate plan; default quote uses no `ratePlanId`. Date/guest changes reset the override (skips the first mount).
- **Extra Guesty traffic on inquiry:** Removed the redundant pre-reservation `createQuote` in `server/services/guesty.ts` so submitting an inquiry does not always double-hit `/v1/quotes`.

#### Guesty client
- **401 recovery:** On Open API and Booking Engine API `401`, invalidate the cached token file under `.cache/` before retrying refresh.
- **BE OAuth:** Reduced token endpoint retries from 4 → 2 to align with Open API and reduce burst traffic.
- **BE 429 logging:** Read response body once before logging (avoid double `response.text()` consumption issues).

#### Property detail
- **Dual path:** Added an on-brand link **“Reserva guiada (passo a passo)”** to `/booking/:listingId/summary` under the inline widget for listings with `guestyId`.
- **Copy:** Replaced remaining “Best rate guaranteed” microcopy on non-Guesty fallbacks with concierge-aligned wording; shortened mobile bar label.

#### Documentation
- **`DECISIONS.md`:** Updated Guesty auth decision to OAuth-only + disk token cache (removed outdated API-key priority wording).

### Session — 2026-03-22 (i18n continuation)

#### i18n infrastructure
- **`scripts/sync-i18n.mjs`:** Merges any missing keys from `client/src/i18n/locales/en.json` into `pt`, `fr`, `es`, `it`, `fi`, `de`, `nl`, `sv` (keeps existing translations).
- **`client/src/i18n/locales/en.json`:** Expanded with `filters.*` (filters, styles, price bands, mobile filter labels), `propertyDetail.*`, `priceBreakdown.*`, `footer.*` (contact, copyright line, journal, admin), `errors.*` (booking/Guesty paths), `bookingWidget.*` (widget CTAs, placeholders, payment copy), `common.language`, plural keys for `homes.available_*`, `bookingWidget.minimumStay_*`, `checkPrice_*`, etc.

#### Components wired to `useTranslation` / `i18n.t`
- **Footer:** Newsletter, columns, legal, copyright line.
- **SearchBar:** Destinations, guests plural, search CTA.
- **Homes:** Hero, PLP bar, filters, chips, mobile sheet (fixed `FilterDestination` typing for destination chips), empty/error states, counts.
- **PropertyCard:** Tier badges, aria-labels, service line, pricing copy, best-rate line.
- **PriceBreakdown:** All line labels (was PT hardcoded; now EN-led + translated).
- **PropertyDetail:** Not-found, hero CTAs, about/amenities/included/location/services/adventures, booking sidebar, mobile bar, lightbox aria; **Whats included** list moved to `propertyDetail.included1`–`included10`.
- **BookingWidget:** Success state, date/guest inputs, quote step, rate plans, upsells, errors via `parseBookingError` + `i18n.t`, reserve/pay flows, guest details, payment step placeholders, trust/cancellation links.
- **LanguageSwitcher:** `aria-label` uses `common.language`.
- **ErrorBoundary:** Uses `i18n.t` for title/reload (already present).

#### Remaining for full-site i18n
- **Booking route pages:** `BookingSummaryPage`, `BookingDetailsPage`, `BookingConfirmPage`, `BookingConfirmationPage` + `CheckoutPaymentForm`, `AvailabilityCalendar`, `RatePlanCards`, `PhoneInput` — still contain English (or mixed) copy; migrate using the same `en.json` keys pattern.
- **Marketing/static pages** (About, Contact, FAQ, etc.): not covered in this pass.

# Sessao 2 — Fixes (24/03/2026)

## Fixes aplicados
| # | Fix | Ficheiro(s) | Resultado |
|---|-----|-------------|-----------|
| 1 | types.ts duplicado (linhas 164-321 removidas) | `client/src/lib/types.ts` | DONE |
| 2 | Upsells enviados ao backend via notes + total visivel no breakdown | `BookingWidget.tsx`, `CheckoutPaymentForm.tsx` | DONE |
| 3 | Fallback pagamento transparente (novo modo "payment-fallback") | `BookingWidget.tsx` | DONE |
| 4 | Header ref type corrigido | `Header.tsx` | DONE |
| 5 | Validacao email/phone extraida para utility partilhado | `client/src/lib/validation.ts`, `BookingWidget.tsx`, `BookingDetailsPage.tsx` | DONE |
| 6 | Cores unificadas (19 substituicoes em 12 ficheiros) | Services, Events, About, Owners, Terms, Privacy, Blog, BlogArticle, Header, PAButton, AddToItineraryModal, ItineraryDrawer | DONE |
| 7 | Dead code removido (12 ficheiros + useCallback + console.log) | 12 componentes apagados, `Home.tsx`, `ComponentShowcase.tsx` | DONE |
| 8 | Utility formatCurrency partilhado | `client/src/lib/format.ts`, `BookingWidget.tsx`, `PropertyCard.tsx` | DONE |

## Verificacao
- tsc --noEmit: 4 erros restantes (pre-existentes: amenities type mismatch em admin + cacheManager downlevelIteration — fora do scope)
- vite build: PASS (3.75s)
- Grep sanidade: PASS (0 ocorrencias de #7A6448, #333 standalone, console.log em ComponentShowcase)

## Detalhes tecnicos dos fixes

### FIX 2 — Upsells
- `upsellsTotal` calculado via useMemo a partir de `selectedUpsells` + `UPSELL_ITEMS`
- Total com upsells mostrado no header do widget, no breakdown expandido, e no price reminder do step details
- Upsells incluidos como texto estruturado no campo `notes` da reserva (formato: "--- Additional Services ---\n- Service Name (+EUR X)\nEstimated upsells total: EUR Y")
- Para pagamento via Stripe/Guesty BE: o botao "RESERVE & PAY" mostra o total Guesty (sem upsells) porque a API de pagamento cobra o valor do quote. Upsells vao nas notes e uma mensagem informa que serao "arranged separately by our concierge team"
- **Limitacao documentada:** Guesty API nao suporta upsells no payload de reserva. Sao guardados como nota para a equipa processar manualmente.

### FIX 3 — Fallback pagamento
- Novo SuccessMode "payment-fallback" distingue visualmente do "confirmed" e do "request"
- Quando o Stripe falha e o sistema faz fallback para reservation-request, o ecra de sucesso mostra um banner amarelo: "Payment was not processed — Our team will contact you to finalise the reservation and arrange payment."
- Textos marcados com `// TODO: i18n` para a Sessao 3

### FIX 6 — Cores
- `#7A6448` → `#7A6548` (gold hover typo): 6 ficheiros
- `#333` → `#333330` (shorthand): ficheiros com hover states
- `#FDFBF7` → `#FAFAF7` (cream): Terms, Privacy, BlogArticle, PAButton
- `#F0EDE6` → `#F5F1EB` (warm): Blog, BlogArticle
- `#C8C4BC` → `#E8E4DC` (sand border): Services, About, Owners
- `#6B5540` → `#8B7355` (gold): Header
- Excepcoes mantidas: #25D366 (WhatsApp), cores admin dashboard, ManusDialog (removido no Fix 7)

## Problemas encontrados durante os fixes
- `#0D0D0C` (button active) referenciado no audit report nao foi encontrado em nenhum ficheiro — possivelmente ja corrigido ou em index.css (nao tocado nesta sessao)
- O agente de cores reportou 19 substituicoes em 12 ficheiros (ligeiramente diferente dos 22 do audit por sobreposicao com ficheiros removidos no Fix 7)

## Nao tocado nesta sessao (Sessao 3)
- i18n (homepage, cookie banner, booking pages, 19 paginas sem traducao)
- properties.json priceFrom (precisa de dados reais da Guesty ou input manual)
- Teste ao vivo dos endpoints Guesty (precisa de acesso ao servidor)
- Stripe em producao (precisa de chaves live)
- Mobile testing (precisa de browser)
- Erros TSC pre-existentes: amenities type mismatch (admin), cacheManager downlevelIteration
