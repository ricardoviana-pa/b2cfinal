# OTA Patterns — GYG + Viator + TripAdvisor (Extracted Live, April 2026)

> Captured via Claude-in-Chrome MCP from the 5 reference URLs in HANDOFF_EXPERIENCE_PDP.md.
> Purpose: grounding the Experience PDP redesign in real structure, not generic OTA knowledge.

---

## 1. Data points (live)

| Source | Product | Rating | Reviews | Price from | Provider shown |
|---|---|---|---|---|---|
| GYG #1 | Passeio a cavalo (Viana) | 4.6 | 16 | €108/pax | PortugalActive |
| GYG #2 | Hike, Dive & Dine (Minho) | 4.7 (provider rating) | n/a | €100/pax | PortugalActive |
| Viator | Viana Horseback with Transport | 4.5 visual / 4.7 aggregate | 45 | €110.30/pax | Portugal Active |
| TripAdvisor | Portugal Active – Viana do Castelo | **4.9** | **70** | — | **#2 of 34 outdoor activities** |

**Key insight:** Ricardo já é fornecedor em GYG e Viator. Tens dois preços de referência para o mesmo produto (horseback): 108 € no GYG vs 110.30 € no Viator, ambos com comissão agressiva (~25%). O objetivo de Sprint 2 (Bókun checkout direto) passa a ser uma decisão de **margem**, não só de UX — cada reserva que saia do GYG/Viator para o portugalactive.com vale ~25% de GMV adicional.

---

## 2. GYG PDP skeleton (exact section order observed)

```
1. Site nav (persistent search/favourites/cart)
2. Breadcrumb-like explorer row
3. H1 (product name)
4. Rating row (4.6 stars · 16 avaliações · Fornecedor: PortugalActive) + Favoritos/Compartilhar
5. GALLERY: 1 large (left, ~60%) + 2×2 grid (right) with "Ver tudo" overlay on last tile
6. Tagline paragraph (1 line, below gallery, left column)
7. H2 "Sobre esta atividade" — 5 benefit cards with icons:
   · Cancelamento gratuito (24h)
   · Reserve agora, pague depois
   · Duração 2,5 horas
   · Instrutor (languages: PT/FR/EN/ES)
   · Pequenos grupos (max N participants)
8. H2 "Destaques" — 3-5 bullet list
9. H2 "Descrição completa" — long text, with "Ver mais" expand
10. H2 "Inclui" — checklist (✓ icons)
11. H2 "Não indicado para" — exclusion list
12. H2 "Ponto de encontro" — address + "Abrir no Google Maps"
13. H2 "Informações importantes":
    · "O que trazer" list
    · "Não permitido" list
14. "Você encontrou o que estava procurando? Sim/Não"
15. H2 "Avaliações de clientes":
    · Average rating (big number 4.6/5 + stars)
    · Breakdown bars (5★/4★/3★/2★/1★)
    · Rating by category (Guia 5/5 · Transporte 5/5 · Custo-benefício 4.5/5)
    · Sort dropdown (Recomendadas / Mais recentes / ...)
    · Filter chips
    · Individual reviews with author, country flag, date, text, "Útil?" + Translate
    · "Todas as avaliações são de clientes verificados"
16. Footer (ID do produto 546491, Fornecedor)

STICKY RIGHT (from below gallery to end of reviews):
  · Urgency pill: "Esgota rápido" (red)
  · "A partir de 108 € por pessoa"
  · Adultos x 1 (dropdown)
  · Selecionar data (date picker)
  · Língua (dropdown)
  · CTA "Disponibilidade" (pill, full width, brand blue)
  · Trust row: Cancelamento gratuito · Reserve agora pague depois
```

---

## 3. Viator PDP skeleton (differences vs GYG)

```
1. Full breadcrumb (7 levels deep, SEO-optimized)
2. H1 (longer, more descriptive)
3. Rating row (4.5 stars · 45 Reviews · "Recommended by 91% of travelers" · City, Country)
4. "Lowest Price Guarantee" pill (right)
5. GALLERY: vertical thumbnail strip (5 tabs, left) + big main photo (right)
   · NO 2×2 grid — Viator prefers one large + vertical thumbs
   · "See More" on last thumbnail
6. Share + Add to Wishlist floating over hero
7. Urgency overlay on hero bottom-left: "Great choice — 5+ bookings last month"
8. QUICK-FACTS ROW (5 icons, below gallery): Duration · Pickup offered · Group discounts · Mobile ticket · Languages
9. Section anchors (sticky above content): Overview · What's Included · Meeting and Pickup · What To Expect · Additional Info · Cancellation Policy · Reviews
10. "Explore our promoted experiences" (cross-sell carousel, paid placement)
11. Overview (description + 4 bullet highlights)
12. What's Included (bullet list)
13. Meeting and Pickup (address + pickup details + end point + start time + "View tour option")
14. What To Expect (numbered steps, 1 per stop)
15. Additional Info (bullet list with "Show N more")
16. Cancellation Policy (bullet list with "Show more")
17. FAQ via "Questions? Visit Viator Help Centre"
18. Featured review (single highlighted)
19. Reviews block:
    · Average 4.7 (aggregate incl. TripAdvisor)
    · Breakdown bars
    · Sort dropdown (Most recent / Highest / Lowest)
    · Individual reviews, many with "Response from Host"
20. "Compare Similar Experiences" carousel (conversion recovery)
21. "Customers Who Bought This Tour Also Bought"
22. Nearby destinations + more attractions
23. Recently viewed

STICKY RIGHT:
  · "From €110.30 per person"
  · Date picker (pre-filled to today+N)
  · Travelers (stepper)
  · CTA "Check Availability" (full width, green)
  · Trust row: Free cancellation (24h) · Reserve Now and Pay Later
  · SECOND card below: "Book ahead! On average booked 23 days in advance" (urgency)
```

---

## 4. Schema.org JSON-LD (Viator ships it — PA should too)

Viator injects a `TouristTrip`/`Product` JSON-LD with:
- `productID`, `sku`, `mpn`, `url`, `name`, `image[]` (5 URLs)
- `description`
- `offers` (price, priceCurrency, priceValidUntil, availability)
- `aggregateRating` (ratingValue, bestRating, reviewCount)
- `review[]` (full body, author, datePublished, rating)
- `itinerary.itemListElement[]` (`TouristAttraction`)
- `tripOrigin[]` (`Place` with PostalAddress)

And a separate `BreadcrumbList`.

**Action for PA:** mirror this exact schema in our PDPs via `usePageMeta` + `<script type="application/ld+json">` injection in the hero. Immediate SEO lift.

---

## 5. Copy that can be adapted for PA pilot PDPs

### Pilot 1: Horseback Riding (existing slug: horseback-riding)

- **Title (existing):** Horseback Riding
- **H1 (new):** Viana do Castelo Horseback Ride — Beach, Mountain, Flower Fields
- **Tagline (new, adapted from GYG):** A horseback ride through flower fields, mountain trails and paradise beaches — crafted for any level, from first-timer to experienced rider.
- **Highlights bullets (from GYG):**
  - Supervised by an experienced instructor
  - Ride through the stunning landscapes of Viana do Castelo
  - All levels welcome, from beginner to professional
- **Included (from GYG+Viator):**
  - Professional horse riding instructors
  - Full equipment
  - Insurance
  - Round-trip transport from Porto / Braga (on request)
- **Not suitable for:**
  - Children under 10
  - Guests over 100 kg
- **Quick facts:**
  - Duration: 2h 30m
  - Languages: PT · EN · FR · ES
  - Group size: up to 8
  - Meeting point: Rua do Condominha, 4900 Viana do Castelo
  - Difficulty: easy/moderate
- **Price (harmonise):** starting from €95/pax (undercut GYG/Viator by ~€15 to reward direct bookings)
- **Seed reviews (top 3 from TripAdvisor/Viator, real):**
  1. Jaclyn_D: "We came back again in March 2023. The horses are verifiable SAINTS. Carolina and Mariana are highly skilled equestrians…"
  2. Clare_H: "Diana matched us really well with our horses and got the balance between safety and allowing us to ride just right…"
  3. Christine_S: "Our guide Claudia made this ride the trip of a lifetime. I genuinely felt like I was in a dream."

### Pilot 2: Hike, Dive and Dine (existing slug: hike-dive-dine)

- **H1 (new):** Hike, Dive & Dine — A Secret Spot in the Minho
- **Tagline (from GYG):** Discover the Minho's best-kept secrets. End with a Portuguese beer in one hand and a table of the region's finest traditional food.
- **Itinerary steps (from GYG, numbered — Viator format):**
  1. Hotel pickup (Viana do Castelo area, 10-min lobby wait)
  2. Transfer to Serra D'Arga, where the adventure begins
  3. Hike to a hidden waterfall and secret lagoon
  4. Refreshing swim in crystal-clear water
  5. Tapas portuguesas at a secret mountain restaurant
- **Included:** Snacks · Insurance · Traditional Portuguese meal · Polaroid souvenir · Travel guide · Round-trip transfer
- **Not suitable for:** Pregnant travellers · Reduced mobility
- **What to bring:** Towel · Comfortable clothing · Sports shoes
- **Dietary:** Vegetarian, vegan, pescatarian-free options available
- **Quick facts:**
  - Duration: 3h 30m
  - Languages: PT · EN · ES
  - Meeting point: Hotel lobby (Viana do Castelo)
- **Price:** starting from €89/pax (vs €100 GYG)

---

## 6. Recommended brand-over-OTA overrides (critical)

| Element | GYG | Viator | PA (our brand) |
|---|---|---|---|
| Primary CTA colour | Blue pill | Green rectangle | #1A1A18 rectangle, letterSpacing 0.14em |
| Urgency pill colour | Red "Esgota rápido" | Purple "Great choice" | **Taupe #8B7355**, subtle copy: "Limited availability this week" |
| Rating stars | Yellow filled | Green dots | **Editorial: no stars**. Use italic "4.9 from 70 reviews · TripAdvisor #2 of 34" |
| Booking card background | White | White | #F5F1EB (warm stone) with 1px border #E8E4DC |
| Cancellation tick | Green | Green | Muted olive #6B8E4E |
| Typography | Sans system | Sans system | Display serif for H1/H2, sans for body (already in design system) |
| Gallery layout | 1 big + 2×2 | 1 big + vertical thumbs | **GYG (per Ricardo's preference)** |
| Anchored nav | No | Yes (sticky) | **Yes — sticky section nav**, brand-dark underline on active |

---

## 7. Files where the screenshots are referenced (not saved to disk as images due to Chrome MCP limitations; IDs logged for reference):

- ss_22331flva — GYG Horseback hero (desktop 1440×900)
- ss_1031qmhun — GYG Hike-Dive-Dine hero (desktop 1440×900)
- ss_35587boq3 — Viator Horseback hero (desktop 1440×900)
- ss_8878ywxpt — TripAdvisor Portugal Active profile (desktop 1440×900)

Raw page text for GYG#1, GYG#2, Viator#1, TripAdvisor#1 is preserved in the session transcript and can be reloaded via `claude --resume` or re-fetched on demand.
