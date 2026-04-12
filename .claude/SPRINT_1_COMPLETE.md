# Sprint 1 Experience PDP — Implementação completa

**Branch:** `feat/experience-pdp-sprint-1`
**Data:** 2026-04-11

---

## O que foi feito

### 1. Tipos (types.ts) — limpeza + extensão
- Consolidei o `client/src/lib/types.ts` que tinha duplicação integral das definições (pre-existente em HEAD — bloqueava tsc).
- Adicionei `ExperienceItineraryStep`, `ExperienceMeetingPoint`, `ExperienceFaq`, `ExperienceGroupSize`, `ExperienceReview`, `ExperienceAggregateRating`, `ExperienceCategory`.
- O `Product` ganhou todos os campos opcionais da PDP nova (highlights, itinerary, meetingPoint, faq, aggregateRating, reviewsList, etc). Services concierge continuam compatíveis.

### 2. Dados-piloto
- `client/src/data/experienceDetails.json` — dois produtos populados com copy adaptada dos extractos reais GYG/Viator/TripAdvisor:
  - **horseback-riding** — Viana do Castelo, 4.9★/70 reviews, €95/pax (undercut vs €108 GYG)
  - **hike-dive-dine** — Serra D'Arga, €89/pax (vs €100 GYG)
- Ambos incluem itinerário numerado, meeting point, FAQ, 5+ reviews com country flags, aggregate rating e schema completo.

### 3. Componentes novos (`client/src/components/experience/`)
| Ficheiro | Função |
|---|---|
| `ExperienceGallery.tsx` | Hero 1+4 grid (desktop) + swipe carousel (mobile) + lightbox |
| `ExperienceQuickFacts.tsx` | Row de 5 ícones (duration, cancellation, group, languages, mobile ticket/pickup) |
| `ExperienceBookingCard.tsx` | Sticky right rail com date picker, participant stepper, estimated total, CTA (WhatsApp prefill — Bókun em Sprint 2) |
| `ExperienceItinerary.tsx` | Timeline vertical numerada com ícones Lucide e linha taupe |
| `ExperienceReviews.tsx` | Rating breakdown bars + filter chips + verified badges + country flags + sort dropdown |
| `ExperienceStickyNav.tsx` | Section nav sticky que aparece após 600px de scroll (desktop) |
| `ExperienceMobileBookingBar.tsx` | Sticky bottom bar + bottom sheet modal (mobile) |

### 4. Página
- `client/src/pages/ExperienceDetail.tsx` — compõe tudo, inclui breadcrumb, social proof hero (rating/count/rank via TripAdvisor), content sections (overview, highlights, itinerary, included, meeting, FAQ), reviews editorial.
- Fallback automático para `services.json` legacy se um slug não existir ainda em `experienceDetails.json`.
- **JSON-LD Schema.org** injectado dinamicamente (`Product` + `AggregateRating` + `Review[]` + `BreadcrumbList`) para lift imediato de SEO.

### 5. Routing (`App.tsx`)
- `/experiences/:slug` → agora aponta para `ExperienceDetail` (switch directo, sem /v2).
- `/activities/:slug` também redirigido para `ExperienceDetail`.
- `/services/:slug` continua no `ServiceDetail` legacy (concierge services).

---

## Brand overrides aplicados

| Elemento | OTA (GYG/Viator) | PA agora |
|---|---|---|
| CTA primário | Pill azul/verde | Retângulo `#1A1A18` com letterSpacing 0.14em |
| Urgência | Pill vermelha "Esgota rápido" | Trust row sereno (cancelamento, pay later, instant) |
| Rating stars | Estrelas amarelas/verdes | Número italic + fonte display |
| Booking card bg | Branco | `#F5F1EB` warm stone + border `#E8E4DC` |
| Cancellation tick | Verde OTA | Azeitona muted `#6B8E4E` |
| Gallery | 1 big + 2×2 (GYG) | Igual — mantive por preferência do Ricardo |
| Section nav | Sticky (Viator) | Sticky com underline 1px `#1A1A18` |

---

## Como fazer commit (1 comando manual)

O sandbox Cowork permite criar ficheiros mas bloqueia `rm` em `.git/`, o que impede o `git add` (git precisa de limpar `index.lock`). Abre o Terminal no projecto e executa:

```bash
cd ~/Documents/Claude/Projects/B2C\ WEBSITE-fresh
rm -f .git/index.lock

git add \
  client/src/App.tsx \
  client/src/lib/types.ts \
  client/src/components/experience/ \
  client/src/data/experienceDetails.json \
  client/src/pages/ExperienceDetail.tsx \
  .claude/research/ \
  .claude/SPRINT_1_COMPLETE.md

git commit -m "feat(experience-pdp): sprint 1 — GYG/Viator-inspired PDP with luxury brand

- New ExperienceDetail page replacing ServiceDetail for /experiences/:slug
- 7 new components in client/src/components/experience/ (gallery, quick facts, booking card, itinerary, reviews, sticky nav, mobile bar)
- experienceDetails.json with 2 pilot experiences (horseback, hike-dive-dine) populated from real OTA copy
- JSON-LD schema.org injection (Product + AggregateRating + Review + BreadcrumbList)
- types.ts consolidated (removed pre-existing duplicate declarations) and extended with experience fields
- Bokun integration mocked for Sprint 2 — CTAs fall back to WhatsApp with prefilled booking details"

git push -u origin feat/experience-pdp-sprint-1
```

Depois abre o PR no GitHub (ou com `gh pr create`).

---

## Ficheiros a rever localmente

1. `http://localhost:5173/experiences/horseback-riding`
2. `http://localhost:5173/experiences/hike-dive-dine`

Slugs antigos continuam a funcionar via fallback automático ao `services.json` (canyoning, ebike-tour, sup-experience, bike-tour, canam-experience), embora sem a riqueza da copy nova.

---

## Pendente para Sprint 2

1. **Fotos reais** — 6-12 por experiência. Substituir Unsplash placeholders.
2. **Bokun headless** — `server/lib/bokun.ts` (HMAC-SHA1), tRPC router `bokun.ts` (getAvailability, getPricing, createBooking), wiring em `ExperienceBookingCard`.
3. **Stripe checkout** — via Bokun webhook ou redirect.
4. **Populate restantes slugs** — canyoning, ebike-tour, sup-experience, bike-tour, canam-experience (template copy em `.claude/research/OTA_PATTERNS_EXTRACTED.md`).
5. **GA4 e-commerce events** — `view_item`, `add_to_cart`, `begin_checkout`, `purchase`.

---

## Notas técnicas

- **Typecheck**: zero erros em ficheiros tocados. Os erros pre-existentes (`BookingWidget.tsx`, `PropertyDetail.tsx`, `BlogArticle.tsx`, `guesty-sync.ts`) não foram mexidos.
- **Build**: não corri local devido a sandbox rollup binary mismatch — corre tu `pnpm build` antes do push.
- **Testes**: zero testes existentes na codebase para esta área. Recomendado adicionar um Playwright smoke test para `/experiences/horseback-riding` em Sprint 2.
