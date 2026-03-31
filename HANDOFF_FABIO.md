# Handoff para o Fábio — `main` vs branch do checkout

**Repo:** `ricardoviana-pa/b2cfinal`  
**Data do documento:** 29 de março de 2026  
**Para:** alinhar o trabalho feito na `main` com o checkout que guardaste noutra branch.

---

## 1. Contexto (o mal-entendido)

Desde **26 de março (quinta)** a equipa esteve a trabalhar em cima da **`main`**, assumindo que era a mesma linha que a tua branch com o checkout a funcionar. Na prática:

- O checkout está associado à branch **`check-out-working`** (no remoto: `origin/check-out-working`).
- Tudo o que se segue na secção 3 foi integrado na **`main`**, não necessariamente na tua branch.

---

## 2. Estado actual dos branches (remoto)

| Branch | Último commit (no momento de gerar isto) | Notas |
|--------|------------------------------------------|--------|
| **`origin/main`** | `d9b71e3` — *feat: comprehensive UX, SEO, accessibility & performance overhaul* | Linha onde a maior parte do trabalho recente está. |
| **`origin/check-out-working`** | `159e4fc` — *fix: add missing destinations.json and scope data/ ignore to repo root* | Contém pelo menos **um** commit que **ainda não está na `main`** (ficheiros `destinations.json` + ajuste de `.gitignore` em `data/`). |

**Divergência:**

- A **`main` tem ~34 commits** que **não** estão em `check-out-working` (trabalho acumulado desde o ponto comum de merge).
- A **`check-out-working` tem 1 commit** que **não** está na `main` (o fix dos `destinations.json` / `data/`).

Antes do próximo release, convém **integrar as duas linhas** (merge ou rebase) e resolver conflitos com calma, sobretudo em booking, Guesty, Stripe e ficheiros em `client/src/data/`.

---

## 3. O que foi feito na `main` desde 26 de março (resumo por tema)

Ordem aproximada do mais antigo ao mais recente dentro do período; vários temas sobrepõem-se no tempo.

### Booking, Stripe e Guesty

- Fluxo **Stripe + Guesty** (booking, rate plan, melhorias na página da propriedade).
- **Stripe checkout:** remoção do parâmetro `stripeAccount` para permitir pagamento directo.
- **CTAs de reserva:** apenas internos — sem URLs externas de booking.
- Ajustes de **sync Guesty** (delays no arranque, desactivação parcial/total para não esgotar rate limits, comparação de conteúdo antes de commit no GitHub, logging BE, etc.).
- **OAuth Guesty:** tratamento de **429**, cooldowns, caps, rota de debug para limpar cooldown (ver código em `server/lib/guesty.ts`, `server/routes/booking.ts`), `.env.example` alargado.

### Infra e integrações

- **Cloudflare:** `trust proxy` + uso de **`SITE_URL`**.
- **Email/CRM:** substituição do Resend por **ActiveCampaign**.
- **Dados estáticos:** ficheiros JSON em `client/src/data/`, regras de `.gitignore` para não os bloquear.

### Produto / área de cliente

- **Área de cliente**, **Google OAuth**, **pontos / referrals**, melhorias de UI.
- Correcções de **sessão OAuth** (cookies `sameSite`, validação JWT).
- **Reservas** ligadas ao portal + programa de referral de propriedades; migração automática de tabela `property_referrals` no deploy.

### Go-live em fases (28 mar)

- **Fase 1:** segurança, formulários, SEO, fixes de build.
- **Fase 2:** rate limiting, analytics, títulos de página, hardening.
- **Fase 3:** emails, dados estruturados, cache, i18n, performance, SEO.

### UX, SEO, a11y e performance (29 mar)

- **A11y:** HTML semântico, skip link, focus rings, `aria-live`, armadilhas de foco em modais/menu.
- **UI:** PropertyCard com carrossel; hero de `/homes` alinhado à homepage.
- Pacote maior de **UX, SEO, acessibilidade e performance** (commit `d9b71e3`).

### Dados Guesty gerados

- Vários commits **`[auto-sync] Update properties from Guesty`** — actualização de dados/cache de propriedades (ficheiros gerados pela sync).

---

## 4. Lista completa de commits na `main` desde 26 de março de 2026

*(Mais recente primeiro — saída típica de `git log origin/main --since=2026-03-26`.)*

| Data | Hash | Mensagem |
|------|------|----------|
| 2026-03-29 | `d9b71e3` | feat: comprehensive UX, SEO, accessibility & performance overhaul |
| 2026-03-29 | `c1dda38` | fix: auto-migrate property_referrals table on deploy startup |
| 2026-03-29 | `62d1377` | feat: auto-save bookings to client portal + property referral program |
| 2026-03-29 | `41db7f3` | fix(guesty): stop retrying OAuth on 429, increase cooldown to 5min |
| 2026-03-29 | `ea1f2b0` | fix(sync): disable startup sync entirely to break rate-limit cycle |
| 2026-03-29 | `bdcc570` | fix(sync): delay startup sync to 10min to preserve OAuth rate budget |
| 2026-03-29 | `e1e78ef` | fix(sync): prevent deploy loop by comparing content before GitHub commit |
| 2026-03-29 | `a565de7` | fix(booking): faster sync, UTF-8 fixes, BE diagnostic logging, i18n gap |
| 2026-03-29 | *vários* | `[auto-sync] Update properties from Guesty (2026-03-29)` |
| 2026-03-29 | `b6b7933` | Guesty OAuth cooldown caps, debug reset route; expand .env.example |
| 2026-03-29 | `fca46d4` | fix(booking): internal CTAs only — no external booking URLs |
| 2026-03-29 | `8e7999b` | fix(ui): PropertyCard carousel everywhere; /homes hero search matches homepage |
| 2026-03-29 | `9ca74a8` | feat(a11y): semantic HTML, skip link, focus rings, aria-live, keyboard traps |
| 2026-03-28 | `951d501` | SEO, performance & admin enhancements for production readiness |
| 2026-03-28 | `f767da7` | Add Cloudflare proxy support: trust proxy + SITE_URL env var |
| 2026-03-28 | `c7de044` | Replace Resend with ActiveCampaign CRM integration |
| 2026-03-28 | `86f63f0` | Phase 3: emails, structured data, cache, i18n, performance, SEO |
| 2026-03-28 | `99c60ee` | Phase 2: rate limiting, analytics, page titles, security hardening |
| 2026-03-28 | `36e5b3f` | Phase 1 go-live: security, forms, SEO, and build fixes |
| 2026-03-28 | `f6e19f3` | Fix Google OAuth session: cookie sameSite policy and JWT validation |
| 2026-03-28 | `8affcce` | Add client area, Google OAuth, loyalty points, referrals, and UI improvements |
| 2026-03-28 | `e4472c0` | Delay startup Guesty sync to 5 minutes to avoid rate limit exhaustion |
| 2026-03-28 | `58c9f41` | Add missing data JSON files and fix .gitignore to allow client/src/data/ |
| 2026-03-28 | `4d276f9` | Fix Stripe checkout: remove stripeAccount param to allow direct payment |
| 2026-03-26 | `beedcb0` | Add Stripe/Guesty booking flow with rate plan fix and PDP improvements |

*(Commits `[auto-sync]` repetidos omitidos na tabela por linha única; estão no histórico completo.)*

---

## 5. Comandos úteis para ti (Fábio)

```bash
git fetch origin

# Ver tudo o que entrou na main desde 26 Mar
git log origin/main --since="2026-03-26" --oneline

# O que está na main e não na tua branch
git log origin/check-out-working..origin/main --oneline

# O que está na tua branch e não na main (ex.: o teu commit dos destinations)
git log origin/main..origin/check-out-working --oneline
```

---

## 6. Variáveis de ambiente

A lista de nomes está em **`.env.example`** no repo. Valores reais **não** vão no Git; alinhar com **Render** / `.env` local.

---

*Documento gerado para partilha interna. Actualiza hashes se o remoto avançar depois desta data.*
