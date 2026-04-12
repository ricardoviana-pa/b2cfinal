# HANDOFF — Sprint 2: Bókun Checkout + Sprint 1 Polish

> **Para:** Claude Code session
> **De:** Cowork session (2026-04-12)
> **Branch:** `feat/experience-pdp-sprint-1` (uncommitted changes — commit first!)

---

## Estado atual — o que está feito mas NÃO commitado

A branch `feat/experience-pdp-sprint-1` tem todo o Sprint 1 original (PDP redesign, componentes, 2 experiências piloto) mas ainda faltam os commits da sessão Cowork de hoje. **Primeiro passo obrigatório: commit.**

### Ficheiros modificados (unstaged):
```
M  client/src/App.tsx
M  client/src/components/layout/Footer.tsx
M  client/src/components/layout/Header.tsx
M  client/src/data/products.json
M  client/src/data/services.json
M  client/src/lib/types.ts
M  client/src/pages/Adventures.tsx
```

### Ficheiros novos (untracked):
```
??  .claude/SPRINT_1_COMPLETE.md
??  .claude/research/
??  client/src/components/experience/  (7 componentes)
??  client/src/data/experienceDetails.json
??  client/src/pages/ExperienceDetail.tsx
```

### Commit sugerido (corre ANTES de qualquer outra coisa):

```bash
git add \
  client/src/App.tsx \
  client/src/lib/types.ts \
  client/src/components/experience/ \
  client/src/components/layout/Footer.tsx \
  client/src/components/layout/Header.tsx \
  client/src/data/experienceDetails.json \
  client/src/data/products.json \
  client/src/data/services.json \
  client/src/pages/Adventures.tsx \
  client/src/pages/ExperienceDetail.tsx \
  .claude/SPRINT_1_COMPLETE.md \
  .claude/HANDOFF_SPRINT_2.md \
  .claude/research/

git commit -m "feat(experiences): sprint 1 complete — PDP redesign + 8 rich experiences + PLP conversion

Sprint 1 PDP (GYG-inspired, luxury palette):
- ExperienceDetail.tsx with gallery, booking card, itinerary, reviews, FAQ, JSON-LD
- 7 new components in client/src/components/experience/
- experienceDetails.json with 8 full rich experiences (horseback, hike-dive-dine, canyoning, SUP, can-am, sailing, ebike, surf)
- Inline Vimeo video embeds on PDP for activities with video

Sprint 1 PLP conversion quick-wins:
- Rating badges, duration, free cancellation, video badge on adventure cards
- Mobile booking bar triggers at 100px scroll, CTA unified to 'Check availability'
- Mini-review snippet near booking card (>=4★ filter)

Data consistency:
- Slugs standardized across products.json, services.json, experienceDetails.json (can-am-buggy, stand-up-paddle, ebike-tours)
- Prices aligned across all 3 data files
- videoUrl field added to Product type and all adventure entries in products.json

Header/Footer:
- YouTube URL corrected to @portugalactivechannel
- Vimeo icon added (Header + Footer)
- Facebook icon added to Header mobile menu"

git push -u origin feat/experience-pdp-sprint-1
```

---

## O que foi feito no Sprint 1 (completo)

### Componentes novos (`client/src/components/experience/`)
| Ficheiro | Função |
|---|---|
| `ExperienceGallery.tsx` | Hero 1+4 grid (desktop) + swipe carousel (mobile) + lightbox |
| `ExperienceQuickFacts.tsx` | Row de ícones (duration, cancellation, group, languages, mobile ticket) |
| `ExperienceBookingCard.tsx` | Sticky right rail — date picker, participant stepper, CTA WhatsApp (Bókun em Sprint 2) |
| `ExperienceItinerary.tsx` | Timeline vertical numerada com ícones Lucide |
| `ExperienceReviews.tsx` | Rating breakdown + filter chips + country flags (>=4★ enforced) |
| `ExperienceStickyNav.tsx` | Section nav sticky após 600px scroll |
| `ExperienceMobileBookingBar.tsx` | Sticky bottom bar + bottom sheet (trigger 100px) |

### Dados
- `experienceDetails.json` — 8 experiências completas com: aboutParagraphs, highlights, included, notIncluded, whatToBring, notAllowed, itinerary (5 steps cada), meetingPoint (GPS), cancellationPolicy, FAQ (5 perguntas), 3+ reviews (>=5★), aggregateRating, relatedSlugs, whatsappMessage, videoUrl
- `products.json` — videoUrl adicionado a todas as 8 aventuras, slug `can-am-buggy` normalizado
- `services.json` — slugs normalizados (can-am-buggy, stand-up-paddle, ebike-tours), preços alinhados

### Slugs canónicos (SEO-optimized, consistentes nos 3 ficheiros):
```
canyoning | stand-up-paddle | horseback-riding | hike-dive-dine
can-am-buggy | sailing | ebike-tours | surf-lessons
```

### Preços canónicos (alinhados nos 3 ficheiros):
| Experiência | Preço |
|---|---|
| canyoning | €65 |
| stand-up-paddle | €45 |
| horseback-riding | €75 |
| hike-dive-dine | €95 |
| can-am-buggy | €120/buggy |
| sailing | €85 |
| ebike-tours | €55 |
| surf-lessons | €60 |

### Brand palette (NÃO MUDAR):
- CTA primário: `#1A1A18` retangular, `letterSpacing: 0.14em`
- Accent: `#8B7355` (taupe)
- Backgrounds: `#FAFAF7` / `#F5F1EB`
- Free cancellation: `#6B8E4E` (olive muted)
- Zero coral, zero verde OTA, zero pills coloridas

---

## Sprint 2 — Scope

### 2A. Bókun headless checkout (core)

Opção B (headless API, recomendada). Estrutura:

1. **`server/lib/bokun.ts`** — Cliente autenticado HMAC-SHA1
   - Bókun usa assinatura custom, NÃO OAuth
   - Headers: `X-Bokun-Date`, `X-Bokun-AccessKey`, `X-Bokun-Signature`
   - Signature = HMAC-SHA1(secretKey, date + accessKey + method + path)
   - Base URL: `https://api.bokun.io`

2. **tRPC router `server/routes/bokun.ts`**
   - `bokun.getAvailability` — input: { activityId, date } → available time slots + remaining capacity
   - `bokun.getPricing` — input: { activityId, date, participants } → breakdown + total
   - `bokun.createBooking` — input: { activityId, date, timeSlot, participants, customer } → bookingId + payment session
   - `bokun.confirmPayment` — webhook handler for Stripe/Bókun confirmation

3. **Wire `ExperienceBookingCard.tsx`**
   - Replace mocked WhatsApp CTA with real flow:
   - Date picker → calls `getAvailability` → shows time slots + remaining spots
   - Participant stepper → calls `getPricing` → shows real total
   - CTA "Book now" → calls `createBooking` → redirect to Stripe checkout OR Bókun checkout page
   - Fallback: if Bókun unavailable or no activityId mapped, keep WhatsApp CTA

4. **Stripe checkout integration**
   - Bókun as source of truth for pricing (prevents manipulation)
   - Create Stripe checkout session server-side with Bókun booking reference
   - Success → confirm booking via Bókun API
   - Webhook: `checkout.session.completed` → update booking status

5. **Booking confirmation pipeline**
   - Webhook: booking confirmed → transactional email (guest) + notification (ops team)
   - CRM push: booking data → Pipedrive deal (or Notion DB)
   - Optional: Guesty calendar block for property-linked experiences

### 2B. Bókun activity mapping

Preciso de saber os Bókun activity IDs para cada experiência. Adicionar campo `bokunActivityId` a:
- `experienceDetails.json` (para lookup no PDP)
- Ou criar um mapping file separado `server/data/bokun-mapping.json`

### 2C. Pendentes do Sprint 1 (polish)

1. **Fotos reais** — substituir Unsplash placeholders em experienceDetails.json (6-12 por experiência). Ricardo precisa de fornecer.
2. **GA4 e-commerce events** — `view_item` (PDP load), `add_to_cart` (date selected), `begin_checkout` (CTA click), `purchase` (confirmation). Implementar via data layer já existente (GTM configurado em commit `f690259`).
3. **Playwright smoke test** — `/experiences/horseback-riding` basic render + booking card visibility.

---

## Credenciais necessárias ANTES de começar

| Item | Estado | Onde configurar |
|---|---|---|
| Bókun Access Key | ❓ Perguntar ao Ricardo | `.env` → `BOKUN_ACCESS_KEY` |
| Bókun Secret Key | ❓ Perguntar ao Ricardo | `.env` → `BOKUN_SECRET_KEY` |
| Bókun Vendor ID | ❓ Perguntar ao Ricardo | `.env` → `BOKUN_VENDOR_ID` |
| Bókun Activity IDs | ❓ Mapear no painel Bókun | `experienceDetails.json` ou mapping file |
| Stripe keys | ✅ Já no Render env | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY` |

**Se não tiver credenciais Bókun:** avança com 2C (fotos, GA4, testes) e prepara toda a infra server-side com mocks.

---

## Ficheiros-chave para Sprint 2

| File | Role |
|---|---|
| `client/src/components/experience/ExperienceBookingCard.tsx` | Wire to real Bókun availability/pricing |
| `client/src/pages/ExperienceDetail.tsx` | PDP principal — adicionar GA4 events |
| `client/src/data/experienceDetails.json` | Adicionar bokunActivityId a cada experiência |
| `server/lib/bokun.ts` | **CRIAR** — Bókun API client (HMAC-SHA1) |
| `server/routes/bokun.ts` | **CRIAR** — tRPC router |
| `server/routes/index.ts` | Registar bokun router |
| `client/src/lib/types.ts` | Adicionar BookingSession, AvailabilitySlot types |
| `.env` | Bókun credentials |

---

## Erros TypeScript pré-existentes (ignorar)

Estes erros já existiam antes do Sprint 1 e não estão relacionados:
- `BookingWidget.tsx(1059)` — TFunction type mismatch (i18n)
- `BlogArticle.tsx(21)` — JSX namespace
- `PropertyDetail.tsx(845)` — implicit any on room/bed params
- `guesty-sync.ts(148-149)` — downlevelIteration + implicit any

Zero erros nos ficheiros do Sprint 1/2.

---

## Prompt para colar no Claude Code

```
Lê .claude/HANDOFF_SPRINT_2.md — tem o contexto completo do Sprint 1 (feito) e o plano do Sprint 2.

Passos:
1. Faz o commit do Sprint 1 (comando está no handoff — tudo unstaged)
2. Pergunta-me pelas credenciais Bókun (Access Key, Secret Key, Vendor ID, Activity IDs)
3. Se eu tiver as credenciais: avança com o Bókun client + tRPC router + wiring
4. Se eu NÃO tiver: avança com GA4 events, Playwright smoke test, e prepara o server-side com mocks
5. Em qualquer caso: mantém a paleta luxury (#1A1A18, #8B7355, #FAFAF7) — zero mudanças visuais

Contexto: Portugal Active, B2C luxury holiday rentals. React 19 + Vite + Express + tRPC + Drizzle. Branch: feat/experience-pdp-sprint-1.
```
