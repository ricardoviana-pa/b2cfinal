# HANDOFF — Bókun widget integration (Sprint 2 continuação)

> **De:** sessão local (2026-04-15)
> **Branch:** `dev` — tudo committed e pushed
> **Último commit:** `0e8d1ae fix(experiences): mobile booking bar opens Bókun widget too`

---

## Estado atual

### O que já está feito (todo em `dev`)

1. **Cliente Bókun HMAC-SHA1** — `server/lib/bokun.ts`
2. **tRPC router** — `server/routers/bokun.ts` (getAvailability, getPricing, createBooking, getBooking)
3. **Sync de conteúdo Bókun → JSON** — `scripts/sync-bokun-content.mjs`
   - Pulls 99 fotos reais de 4 atividades para `client/src/data/experienceDetails.json`
   - **NÃO promove texto** (luxury copy hand-written supera o do Bókun)
4. **Widget Bókun embebido em modal** — `client/src/components/experience/BokunWidgetModal.tsx`
   - Iframe direto (bypassa BokunWidgetsLoader para evitar race conditions)
   - Channel UUID: `a283fa3e-a892-41cd-a775-036ac351a454`
5. **Desktop + mobile wired** — both `ExperienceBookingCard.tsx` and `ExperienceMobileBookingBar.tsx` open the widget when `bokunActivityId` is set
6. **PLP fotos atualizadas** — products.json: can-am-buggy + hike-dive-dine usam keyPhoto Bókun
7. **Homepage featured pinned** — Eben Lodge, Sunset Beach Lodge, Abreu Retreat Palace, Stars View (Fafe), Majestic Villa Retreat, Quinta Carreço

### Bókun activity mapping (em experienceDetails.json)

| Slug | Bókun ID | Status |
|---|---|---|
| `hike-dive-dine` | 692747 | Live (32 photos) |
| `horseback-riding` | 692748 | Live (42 photos) |
| `stand-up-paddle` | 749994 | Live (17 photos) |
| `can-am-buggy` | 1046807 | Live (8 photos) |
| canyoning | — | Não está em Bókun |
| sailing | — | Não está em Bókun |
| ebike-tours | — | Não está em Bókun |
| surf-lessons | — | Não está em Bókun |

---

## Credenciais (em `.env.local`, gitignored)

```
BOKUN_ACCESS_KEY=155c551ed4e246348aa88560cb3d71d4
BOKUN_SECRET_KEY=627834a8e9244764ab451808d21758b6
BOKUN_VENDOR_ID=85472
VITE_BOKUN_CHANNEL_UUID=a283fa3e-a892-41cd-a775-036ac351a454
```

OCTO Bearer token (alternativa de leitura): `1fddee23080c41cabdfb7cf30bb03690`

**Para produção (Render):** adicionar `VITE_BOKUN_CHANNEL_UUID` nas env vars do dashboard — Vite faz inline da variável no build.

---

## Pendências e próximos passos

### 1. Widget customização visual (em Bókun dashboard, não no código)
- Bókun → Sales Tools → Booking Channels → channel `a283fa3e-...` → **Branding**
- Mudar primary color (botão "Book now" agora em azul) → `#1A1A18`
- Mudar accent color → `#8B7355`
- Background → `#FAFAF7`
- Subir logo Portugal Active

### 2. Template do widget
- O URL atual usa `/online-sales/{uuid}/experience/{id}` — template "booking-only" (sem foto hero, só calendar + pax + price + CTA)
- Variantes a explorar no Bókun dashboard (Products → cada activity → "Booking widget" tab):
  - "Activity widget" — com foto + descrição
  - "Product card widget" — formato grid
- Quando o Ricardo escolher um template e copiar o `data-src`, atualizar o URL em `BokunWidgetModal.tsx` linha 42

### 3. Smoke test end-to-end
- Abrir `/experiences/horseback-riding`
- Click "Check availability" (desktop e mobile)
- Verificar que o widget Bókun renderiza corretamente
- Testar booking completo no sandbox Bókun → confirmar email transacional

### 4. Adicionar restantes 4 atividades em Bókun
- canyoning, sailing, ebike-tours, surf-lessons
- Quando criadas, adicionar IDs a:
  - `MAPPING` em `scripts/sync-bokun-content.mjs`
  - `bokunActivityId` em `client/src/data/experienceDetails.json` (re-correr o script)

### 5. Stripe checkout (opcional — só se quiseres bypass do checkout Bókun)
- Atualmente Bókun fecha a transação. Se quiseres Stripe direto:
  - Wire `bokun.createBooking` no front-end → Stripe Checkout session → webhook
  - tRPC procedure já existe em `server/routers/bokun.ts`

### 6. GA4 e-commerce events (do Sprint 1 backlog)
- view_item, add_to_cart, begin_checkout, purchase
- Data layer já existe (GTM commit `f690259`)

---

## Erros conhecidos a ignorar
Pre-existentes, não relacionados:
- `BookingWidget.tsx(1059)` — TFunction type mismatch
- `BlogArticle.tsx(21)` — JSX namespace
- `PropertyDetail.tsx(845)` — implicit any
- `guesty-sync.ts(148-149)` — downlevelIteration

---

## Prompt para colar na nova sessão Cowork

```
Lê .claude/HANDOFF_BOKUN_WIDGET.md — tem o estado completo do Bókun widget integration.

Branch: dev (committed e pushed). Stack: React 19 + Vite + Express + tRPC + Drizzle.

Próximo passo: depende do Ricardo —
1. Confirmar quais cores mudou no Bókun dashboard
2. Ou trocar template do widget (passar novo URL data-src)
3. Ou avançar para os pendentes: smoke test end-to-end, novas atividades, GA4, Stripe.

Mantém paleta luxury (#1A1A18, #8B7355, #FAFAF7).
```
