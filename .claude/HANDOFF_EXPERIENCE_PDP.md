# HANDOFF — Experience PDP Redesign (Sprint 1)

> **Purpose:** This is a handoff note from the luxury brand design audit session (April 2026) to the next session, which will redesign the Experience PDP with Claude-in-Chrome MCP for live browser access. Read this completely before starting work.

---

## Context: what just happened

A full luxury brand design audit of the Portugal Active B2C site (React 19 + Vite + Express + tRPC + Drizzle) was executed and committed as:

> `refactor(ui): luxury brand design audit pass` — commit `91be3bf` on `main`

21 files changed, 23+ design issues fixed, site now aligned with Aman / Six Senses / Le Collectionist visual language (editorial typography, single muted chips, low-noise cards, cinematic hero gradients, no gold stars / Trustpilot visuals).

**Completed items in that pass:**
- Rename Adventures → Experiences
- Fix canyoning hero image
- Clean property titles via `sanitizePropertyName`
- Fix Eben Lodge breadcrumb (Algarve → Minho)
- Footer destinations + services relabeled
- Concierge (`Services.tsx`) redesigned with `SingleServiceFeature` pattern
- Simplified experience chips (single muted overline)
- Removed dual CTAs + itinerary modal noise
- Redesigned testimonials (editorial, no stars)
- Darker hero gradients with high-contrast subtitles
- Simplified PLP meta chips, removed trust signal noise
- Restyled WhatsApp bubble brand-dark (was OTA green)
- Active nav state with 1px underline (Header.tsx)
- Rename BOOK NOW → Reserve (rectangular, editorial letterspacing)
- Contact subject default → `plan-my-stay` ("Plan my stay" / "Concierge enquiry")
- Polished Brazil "coming soon" overlay (no grayscale, cinematic veil)
- Removed Klarna from footer
- Standardized price format via `formatEurEditorial` (en-US, no decimals when whole)
- Replaced `Star` lucide icon with `Gem` in PropertyDetail included list and Home USP bar

All in commit `91be3bf`. Nothing left from that audit.

---

## Next mission: Experience PDP redesign

The user wants the Experience PDPs (currently `client/src/pages/ServiceDetail.tsx`) to match the **PropertyDetail** pattern — with full photo gallery, and to follow the conversion-focused structure of **GetYourGuide** (preferred) and **Viator**, while keeping the luxury brand voice.

### User's stated preferences (quoted)
- "as actividades tem de ser como a PDP das casas, com galeria de fotos"
- "gostaria de ligar o bokun para checkout direto"
- "temos de olhar holisticamente para o site e ver se ta optimizado para conversao"
- "gosto mais do look and feel do get your guide"

### Reference URLs the user shared
**GetYourGuide (PREFERRED):**
1. https://www.getyourguide.com/pt-pt/viana-do-castelo-l165161/passeio-a-cavalo-t546491/
2. https://www.getyourguide.com/pt-pt/viana-do-castelo-l165161/faca-caminhadas-mergulhe-e-jante-como-um-morador-local-em-um-local-secreto-t568620/

**Viator (secondary):**
3. https://www.viator.com/tours/Braga/DINNE-LIKE-A-LOCAL-and-SECRET-SPOT/d27331-63975P6
4. https://www.viator.com/tours/Braga/HORSEBACK-RIDING-TOUR/d27331-63975P4

**TripAdvisor (social proof — 4.9 ⭐ / 70 reviews / #2 of 34 in Viana do Castelo):**
5. https://www.tripadvisor.pt/Attraction_Review-g189185-d12850723-Reviews-Portugal_Active-Viana_do_Castelo_Viana_do_Castelo_District_Northern_Portugal.html

**Important note:** In the previous session, WebFetch was blocked (403) on GYG and Viator. The next session MUST use Claude-in-Chrome MCP (or Claude Preview) to scrape byte-accurate structure + take screenshots. Do NOT rely on generic OTA knowledge — the user wants the real patterns mirrored.

---

## Proposed architecture (from previous session, approved in principle)

### Target PDP skeleton (desktop)
```
Breadcrumb
Gallery hero (1 large left + 2x2 grid right, "Ver todas as fotos" button)
H1 + social proof row (4.9 TripAdvisor · 70 reviews · Bestseller pill)
Quick-facts row (duration · languages · free cancellation · small group · mobile ticket)
┌──────────────── + ──────────────┐
│ CONTENT (2/3)  │ STICKY CARD 1/3 │
│ Highlights     │ Price headline  │
│ About          │ Date picker     │
│ Included       │ Participants    │
│ Not included   │ Time slots      │
│ Itinerary      │ CTA (Bókun)     │
│ Meeting point  │ Trust signals   │
│ What to bring  │                 │
│ Cancellation   │                 │
│ FAQ            │                 │
└────────────────┴─────────────────┘
Reviews section (rating breakdown + filters + customer photos)
Similar experiences
```

### Mobile
Sticky bottom bar: price left + CTA right → opens bottom sheet with date/participants.

### Brand overrides (critical — do NOT use GYG coral)
- Primary CTA: `#1A1A18` (brand dark) with white text, rectangular, `letterSpacing: 0.14em`
- Secondary accent: `#8B7355` (taupe) for overlines, soft links
- "Free cancellation" tick: muted olive, NOT OTA green
- Card radius: 0 (editorial flat) or max 2px — match existing site
- Generous whitespace, `section-padding` class, `FAFAF7` backgrounds
- NO coral pills, NO orange, NO saturated OTA colors

---

## Execution plan (phased)

### Sprint 1 — Foundation (can start without Bókun credentials)
1. **Use Claude-in-Chrome to take full screenshots** (desktop + mobile) of all 4 OTA URLs + TripAdvisor. Save to `.claude/research/gyg-viator-screenshots/` for reference.
2. **Create `ExperienceGallery.tsx`** — reusable hero grid (1+4) with lightbox, mobile swipe. Reuse patterns from `PropertyDetail.tsx` gallery.
3. **Refactor `ServiceDetail.tsx` → new layout.** Consider splitting: `ExperienceDetail.tsx` for experiences, keep `ServiceDetail.tsx` minimal for concierge-only services. Or use a single component with conditional blocks.
4. **Extend product schema** in `client/src/data/services.json` and `client/src/lib/types.ts` Product type with:
   - `gallery: string[]`
   - `highlights: string[]`
   - `included: string[]`
   - `notIncluded: string[]`
   - `itinerary: { time: string; title: string; description: string }[]`
   - `meetingPoint: { address: string; lat: number; lng: number; instructions: string }`
   - `whatToBring: string[]`
   - `cancellationPolicy: string`
   - `languages: string[]`
   - `groupSize: { min: number; max: number }`
   - `difficulty: 'easy' | 'moderate' | 'challenging'`
   - `faq: { q: string; a: string }[]`
5. **Populate 2 pilot experiences** (horseback riding + dine like a local) — copy-adapt content from GYG/Viator pages via Chrome MCP.
6. **New Reviews section** — rating breakdown bars (5★→1★), filter chips (with photos / language / most recent), customer avatars + flags, "verified" implicit. Seed with top 10 from TripAdvisor if API unavailable.
7. **Sticky right-rail BookingCard** — date picker + participant stepper + time slots. Fallback CTA → WhatsApp prefill until Bókun wired.
8. **Mobile sticky bottom bar** — price + CTA → bottom sheet.

**Deliverable:** 2 fully redesigned experience PDPs, visually matching GYG's layout with the luxury brand palette. Bókun still mocked — CTA falls back to WhatsApp.

### Sprint 2 — Bókun checkout integration
Pending user decision: **A (iframe widget, 1 day)** vs **B (API headless, 3-5 days)**. Recommended: **B**.

Structure if B:
1. `server/lib/bokun.ts` — HMAC-SHA1 authenticated client (Bókun uses custom signature scheme, not OAuth)
2. tRPC router `bokun.ts` exposing `getAvailability`, `getPricing`, `createBooking`, `confirmPayment`
3. Wire BookingCard to real availability + real time slots
4. Checkout via Stripe (Bókun as source of truth) OR redirect to Bókun checkout
5. Webhook for booking confirmation → transactional email + CRM push

### Sprint 3 — Holistic conversion
- Experiences PLP with filters (destination / duration / price / difficulty / category)
- Sticky booking bar across PDPs (mobile)
- Real-time urgency ("3 spots left") via Bókun availability
- Trust row before footer
- GA4 e-commerce events (`view_item`, `add_to_cart`, `begin_checkout`, `purchase`)
- Exit intent / email capture on high-intent PDPs

---

## Open questions (user must answer before/during Sprint 1)

1. **Photos:** Where are the real experience photos? Need 6-12 per experience. If not yet available, Sprint 1 ships with placeholders and intent to swap.
2. **Bókun credentials:** Access Key + Secret Key + vendor ID. If not yet provisioned, Sprint 1 proceeds with mocked API.
3. **Checkout option A vs B** — user was leaning toward B (headless).
4. **Copy source:** OK to adapt from GYG/Viator pages for the 2 pilots, or does the user have Notion/Drive with existing copy?

---

## MCPs required in next session

- **Claude-in-Chrome** — ESSENTIAL. Bypass the 403 that blocked WebFetch and capture real GYG/Viator DOM + screenshots.
- **Claude Preview** — for side-by-side visual iteration (our site vs GYG reference).

**Verify after opening new session:** run `/mcp` — confirm both are green. If missing, install via `claude mcp add` or enable in user settings.

---

## Prompt to paste into the new session

```
Continuação do trabalho no Portugal Active. Lê primeiro o ficheiro:

.claude/HANDOFF_EXPERIENCE_PDP.md

Tem todo o contexto do que foi feito na sessão anterior (auditoria luxury, commit 91be3bf) e o plano detalhado para esta sessão: redesenhar a PDP de experiências com layout estilo GetYourGuide + paleta luxury + preparar integração Bókun.

Depois de leres:

1. Corre /mcp e confirma que Claude_in_Chrome e Claude_Preview estão ativos.
2. Abre no browser os 4 URLs de referência (2 GYG + 2 Viator) listados no handoff e tira screenshot full-page desktop + mobile de cada um. Guarda em .claude/research/.
3. Lê client/src/pages/ServiceDetail.tsx (PDP atual) e client/src/pages/PropertyDetail.tsx (para reutilizar padrão da gallery).
4. Com os screenshots reais como referência, propõe-me um plano Sprint 1 concreto: ordem de ficheiros a criar/editar, schema changes em products.json/services.json, componentes novos a extrair.
5. NÃO escrevas código ainda. Quero aprovar o plano primeiro.

Preferências já decididas:
- Look & feel GetYourGuide (skeleton + blocos de conversão)
- Paleta luxury: #1A1A18 (CTA primário), #8B7355 (accent taupe), #FAFAF7/#F5F1EB (backgrounds), zero coral/verde OTA
- Social proof: 4.9 TripAdvisor / 70 reviews / #2 de 34 em Viana do Castelo — vai no hero
- Objetivo final: checkout direto via Bókun API headless (Sprint 2)

Pendente de mim: fotos reais, credenciais Bókun, decisão A vs B. Pergunta-me no início se precisas já.
```

---

## Key files reference

| File | Role |
|---|---|
| `client/src/pages/ServiceDetail.tsx` | Current experience PDP — refactor target |
| `client/src/pages/PropertyDetail.tsx` | Gallery + sticky booking pattern to mirror |
| `client/src/pages/Adventures.tsx` | Experiences PLP |
| `client/src/pages/Services.tsx` | Concierge landing (don't confuse with experience PDP) |
| `client/src/data/services.json` | Product data (experiences + concierge services) |
| `client/src/data/products.json` | Filterable catalogue |
| `client/src/lib/types.ts` | `Product` type — extend for experience fields |
| `client/src/lib/format.ts` | `formatEurEditorial`, `sanitizePropertyName` |
| `client/src/components/property/PropertyCard.tsx` | Card pattern to echo |
| `client/src/components/ReviewsSection.tsx` | Editorial review pattern |
| `.claude/HANDOFF_EXPERIENCE_PDP.md` | THIS FILE |

---

## How to resume this exact conversation later (if needed)

```bash
claude --resume
```
Pick the `B2C WEBSITE-fresh` session from the list. Full conversation history restored.

Or to start fresh with handoff context: just run `claude` in the project directory and paste the prompt above.
