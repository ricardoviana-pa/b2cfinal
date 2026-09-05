# Auditoria de setembro de 2026 — estado dos itens

Fecho técnico dos achados da auditoria externa de 4 de setembro de 2026 a portugalactive.com.
Trabalho feito em `main`, um commit por item (referência no título), com `npm run build`,
`npm run typecheck` e os testes (`npx vitest run`, 192 verdes / 6 saltados) a passar em cada commit.

Decisões do CEO respeitadas sem alteração: (a) o filtro de reviews 5★ e o `aggregateRating`
publicado ficam como estão; (b) as casas Tripwix apresentam-se como inventário Portugal Active —
sem badge, sem menção ao parceiro, sem FAQ de parceiro.

Estados: **resolvido** (alterado nesta ronda), **já resolvido** (estava fechado no código antes
da ronda; evidência registada), **aberto** (com motivo e quem decide).

---

## Bloco 0 — deploy e primeira dobra

| Item | Estado | Commit | Evidência |
|---|---|---|---|
| N2 — robots.txt/llms.txt/HTML antigos em produção | resolvido | `3198569` | Causa: nada no repo servia o robots antigo; o serviço Render estava com um build parado até ao redeploy manual de 4 set 18:04. Adicionado `purgeCdn` + `scheduleBootPurge` (90 s após o boot em produção quando existe `CLOUDFLARE_API_TOKEN`) em `server/services/cdn-purge.ts`, chamado no `listen` de `server/_core/index.ts`; `scripts/smoke-deploy.mjs` (`npm run smoke:deploy`) compara robots/llms/sitemap e o hash do bundle em produção com `dist/` até 300 s; `docs/deploy.md`. Verificado a 5 set: `robots.txt` e `llms.txt` em produção iguais a `dist/public/`. |
| N3 — jornal a abrir no separador Vídeo, sem ordenação | resolvido | `461cdd4` | `client/src/pages/Blog.tsx`: ordenação por `publishDate` desc, separador inicial `all`, destaque = artigo mais recente, `readTime` + `t('blog.minRead')`, nome do autor. SSR de `/en/blog` mostra 30 artigos editoriais, o mais recente primeiro. |

## Bloco 1 — funil de reserva e performance

| Item | Estado | Commit | Evidência |
|---|---|---|---|
| N5 — bloco de reserva direta + página de melhor tarifa | resolvido | `3e4a5ae`, `3aab3c8` | Nova página `client/src/pages/BestRateGuarantee.tsx` em `/:lang/best-rate-guarantee` (rota, `KNOWN_ROUTES`, `PAGE_META` ×9, sitemap); bloco `directBlock` no `CheckoutPage.tsx` (aside desktop + mobile); ligações na faixa de confiança do PDP, na USP 4 da home, na FAQ q9 e na página de obrigado; chaves `bestRateGuarantee.*`/`trust.guaranteeTerms` nas 9 línguas. O segundo commit tira a rota do redirect dos slugs WordPress (`server/lib/redirects.ts`), que devolvia 301 para `/en/blog`. Em produção: `/en/best-rate-guarantee` → 200, `index, follow`. |
| N1 — Checkout v2 ligado em produção | aberto — decisão humana | — | O código está pronto (`docs/go-live-runbook.md`). Ligar exige definir `CHECKOUT_V2=true` no serviço Render, que não é possível a partir do repositório (não há `render.yaml`). Passo para Ricardo: Render → Environment → `CHECKOUT_V2=true` → deploy → `npm run smoke:deploy`. |
| F2 — calendário a "saltar" ao escolher a entrada | resolvido | `e6774b5` | `AvailabilityCalendar.tsx`: a zona de avisos passa a ter altura fixa (`min-h-[46px]`) e mostra um aviso de cada vez; os dias já não mudam de posição. |
| D4 — Apple Pay no widget legacy | resolvido | `b5ce27b` | `CheckoutPaymentForm.tsx`: `wallets: { googlePay: "never", applePay: intentId ? "never" : "auto" }` — Apple Pay aparece no widget legacy enquanto o v2 não estiver ligado. |
| P1 — runtime Manus no bundle de produção | resolvido | `62c01d6` | `vite.config.ts`: plugins Manus só com `command === "serve" && !isSsrBuild`; `useAuth.ts` deixa de ler `manus-runtime-user-info`. `grep manus-runtime dist/public/assets/*.js` → 0 ficheiros. |
| P2 — chunk de 882 KB | resolvido | `c4b64bc` | O chunk era o índice principal a transportar os catálogos de destinos e experiências nas 9 línguas. Divisão em `destinations.i18n/<lang>.json` e `experienceDetails.i18n/<lang>.json` com carregamento por língua (`client/src/lib/localizeContent.ts`, `preloadContentOverrides`) e preload no SSR/hidratação. Índice principal: 1 117 278 → 237 029 bytes. Lighthouse mobile local (throttling simulado): `/en/` 46 → 69 de performance, TBT 3 350 ms → 140 ms, CLS 0. |

## Bloco 2 — marca e posicionamento

| Item | Estado | Commit | Evidência |
|---|---|---|---|
| I1/T1 — números da marca inconsistentes (50+/60+, 47 pontos, 1 h/24 h) | resolvido | `07cf923` | Fonte única `shared/brandFacts.ts` (`HOME_COUNT_LABEL` "90+", `CHECKLIST_POINTS` 147, `CONCIERGE_SLA_HOURS` 2, `LANGUAGES` 9, `FOUNDED` 2017, `REGIONS` Minho→Algarve) + `brandFacts.generated.json` gerado por `scripts/brand-facts.ts` no `prebuild` (contagem real das casas públicas; regenera `llms.txt`). Tokens `{{homes}}`/`{{points}}` nos locales e no `PAGE_META`. Greps a zero em `client/src`, `server`, `shared`: "60+", "50+", "47-point", "47 point", "within 1h", "within 24 hours" (as duas únicas ocorrências de "50+/60+" são o comentário explicativo em `brandFacts.ts`). |
| N6 — posicionamento ("holiday rentals" vs "Private Hotels") | resolvido | `e0be7d9` | `client/index.html` (title, descrições, og/twitter, schema `Organization` com logo `/brand/pa-logo-dark.png`, `sameAs` Instagram/Facebook/YouTube/LinkedIn, `knowsAbout`), `usePageMeta.ts`, `PAGE_META` `/`, `/homes`, `/about` nas 9 línguas, `footerTagline` dos emails. Em produção: `<title>Private Hotels in Portugal \| Portugal Active</title>`; greps "holiday rentals", "Premium Holiday Homes", "Adventure Experiences" → 0. |
| T4 — "Firm" traduzido como "Moderada" | resolvido | `a70151a` | `cancellationPolicy.firmTitle` → Firme / Ferme / Ferma / Feste / Vast / Fast / Kiinteä nas 8 traduções. |
| N7 — paridade das casas Tripwix | resolvido | `4fc27b9`, `d459f6a` | `PropertyDetail.tsx`: removidos 4 condicionais `tripwix` e o ramo de FAQ de parceiro; bloco de anfitrião com `getConcierge(destination, locality)`; `servicesSubtitleRequest` ×9 para `bookingMode === 'request'`; check-in/out por defeito 16:00/11:00 (`withPartnerDefaults` em `server/services/tripwix.ts`); "confirmação em 2 horas" nos emails. Último resto encontrado na verificação final: as fotos eram servidas de `/homes/tripwix/<ref>/…`, visível no HTML — pasta renomeada para `/homes/photos/` (680 ficheiros, `git mv`) e caminhos actualizados em `tripwix-properties.json`, `content/tripwix-images.json`, `destinations.json`, `scripts/tripwix-images.py`. SSR do PDP `quinta-da-lameirinha`: 0 ocorrências de "tripwix" no HTML visível (o que resta são os campos `id: "tripwix-PTxxxx"` e `source: "tripwix"` dentro do JSON de estado desidratado do react-query, invisível na página e necessário ao router de reservas e ao painel de pedido — renomear seria uma decisão à parte); as ocorrências de "partner" no site são copy legítimo ("we partner with homeowners", "local partners"). |

## Bloco 3 — inventário e destinos

| Item | Estado | Commit | Evidência |
|---|---|---|---|
| N9 — nomes de listagem crus (Guesty) | resolvido | `cc3787f`, `d0ebd60` | `shared/displayName.ts` (`getDisplayName`, `sanitizePropertyName`) + `client/src/data/displayNames.json` com 46 nomes curados das casas próprias (São Julião Retreat, Gerês Gateway, Hábitos Lodge, Buganvílias House, Filigree Plaza…). Aplicado no cliente (cards, PDP, blog) e no servidor (`buildPropertyGraph`, `buildPropertySeoBody`, título — nunca o `seoTitle` cru, sem marca dupla), emails transacionais e índice de links SSR. Propostas para as 35 Tripwix em `docs/tripwix-display-names-proposal.md` (não activas — decisão humana). |
| N10 — amenities do parceiro e listagem de teste | resolvido | `c452769` | `normalizePartnerAmenities` em `server/services/tripwix.ts` mapeia 338 termos do parceiro para 124 do vocabulário do site; `EXCLUDED_SLUG_PATTERNS += "test-guesty-test"` (o filtro por nome `/test/i` já existia; em produção o slug de teste devolve 404). |
| N4 — licenças AL no schema | parcial — falta dados | `e04b7e2` | `identifier` (PropertyValue "AL") em `buildPropertyGraph` (servidor) e em `StructuredData.tsx` (cliente), alimentado por `client/src/data/licenses.json`. O ficheiro continua vazio: os números RNAL têm de vir de Ricardo (decisão/dados humanos). |
| I2 — destinos: contagens, rascunhos, Brasil, fotos stock | resolvido | `e0d828d` | `getPropertiesForDestination(slug)` no servidor + `properties.forDestination` (tRPC) com prefetch em `/destinations/:slug`; `DestinationDetail` usa a lista do servidor; `caminha`, `esposende`, `douro`, `brazil` com `status: "draft"` (X-Robots-Tag e meta `noindex`, fora do sitemap via `publishedDestinationSlugs()`); Brasil fora do SearchBar; capas Unsplash substituídas por fotografia própria (lista no commit). |
| N11 — textos de destino curtos (Minho, Algarve) | resolvido | `3f8a777` | `destinations.json` e os 8 catálogos `destinations.i18n/<lang>.json` com entradas completas (~2 800 palavras cada em EN: porquê, destaques, o que fazer em 3–4 grupos, estações, transportes, 6 restaurantes + 4 especialidades, 6 experiências, 6 eventos, imprensa, 8 FAQ, CTA proprietários). Traduções nativas PT (registo formal europeu), ES, FR, IT, DE, NL, SV, FI. SSR verificado nas 16 páginas (8 línguas × 2 destinos): texto próprio da língua, 10 secções `h2`, zero fuga de inglês. |

## Bloco 4 — línguas e copy

| Item | Estado | Commit | Evidência |
|---|---|---|---|
| N12 — 225 chaves só em inglês; `sync-i18n` a copiar EN | resolvido | `a59db04` | `scripts/i18n-missing.mjs` (plural-aware) extraiu 190 chaves para `en.json` e traduziu-as nas 8 línguas; `scripts/sync-i18n.mjs` deixa de copiar EN e passa a falhar o build com a lista (`--fix` explícito), corre no `prebuild`; `npm run i18n:check`. Build actual: 0 chaves em falta. |
| T3 — português (registo, "Você", "Alojamentos Privados", "cesta") | resolvido | `6826f12`, `a7f8468`, `09fbe6c` | `pt.json`: "Hotéis Privados", sem "Você", "as suas datas", "a pedido", "cabaz"; `client/src/lib/duration.ts` (`localizeDuration`, `localizeRoomName`) para "Bedroom 1"/"Half day"; FAQ PT do SSR em `vite.ts` com "as suas datas" e "Avise-nos". Greps "Alojamentos Privados", "Você apenas", "tuas datas", "sob demanda" → 0. |
| FR — "collection curée", "room service" | resolvido | `7e6abd1` | `fr.json` home.*: "sélectionnée", "Assistance 24h/24", "ménage". Grep "curée" → 0. |
| T2 — hifenização em inglês | resolvido | `eb64fe5` | `en.json`: in-house, end-to-end, five-star, on-site, check-in/check-out como substantivo; "Welcome pack" ×9; `checkout.confirm24h` → 2 horas ×9. |
| N13 — vocabulário de OTA (urgência, "Most chosen", "No spam", ratings falsos) | resolvido | `01970e0`, `d99880b` | `Adventures.tsx` sem rating/"free cancellation"/badge de vídeo; nomes das experiências encurtados nas 9 línguas; `CustomizeStep` sem "mostChosen"/"scarcityNote"; `CheckoutPage` sem bloco "flex last call"; chaves mortas `checkout.mostChosen` e `home.newsletterBody` removidas ×9. Greps "Most chosen", "No spam" → 0. O código promocional já era um link discreto. |
| N8 — pessoas sem nome/cara, testemunho fictício | resolvido | `dad009a` | `shared/concierges.ts` (concierge por região, `confirmed`, `getEmailSigner` com fallback "Sara"); autor com foto no `BlogArticle`; secção de testemunhos removida de `Events.tsx`. |
| Emails legacy só em inglês | resolvido | `fa29c42` | `LEGACY_I18N` (9 línguas) em `email-i18n.ts`; `sendBookingConfirmation`/`sendPreArrival`/`sendPostStay` com `conciergeSignature(lang, destination, locality)` e parâmetros opcionais `locale/destination/locality`. Os chamadores ainda passam só o defeito (EN) — ver decisões. |

## Bloco 5 — SEO técnico

| Item | Estado | Commit | Evidência |
|---|---|---|---|
| N19/G3 — 35 casas Tripwix em `noindex` e fora do sitemap | resolvido | `d320cd5` | `PARTNER_HOMES_NOINDEX = false`; bloco X-Robots de parceiro e `isPartnerHome` removidos de `vite.ts`; `server/lib/sitemap.ts` e `server/index.ts` (mortos) apagados. Em produção: `/en/homes/quinta-da-lameirinha` → 200, `index, follow`, sem X-Robots; sitemap com as 35 casas (99 URLs por casa = 9 línguas × 11 alternates). |
| G1 — robots.txt em produção | já resolvido | — | O robots em produção é o do build (`diff` vazio a 5 set), permite os caminhos antigos e aponta para o sitemap. A discrepância da auditoria era o build parado (N2). |
| N20/G5 — títulos do servidor reescritos em inglês pelo cliente | resolvido | `be6bfad`, `e0721cd` | `usePageMeta.ts` salta a primeira execução quando existe `meta[name="pa-ssr-meta"]`; o marcador é injectado uma só vez e removido por inteiro. `/pt/` mantém "Hotéis Privados em Portugal \| Portugal Active" após hidratar. |
| N18 — Open Graph (imagens relativas, descrições cortadas, entidades) | resolvido | `dbb65b5` | `buildOg(meta)` em `vite.ts`: imagem absoluta, `og:image:secure_url` igual, descrição cortada por palavra a 155, `decodeEntities` no título, `DEFAULT_OG_IMAGE`. SSR: `og:image` absoluto em todas as páginas verificadas. |
| G4 — `.env.example` incompleto | resolvido | `7351c0f` | `SSR_ENABLED`, `CHECKOUT_RECOVERY`, `TRIPWIX_INVENTORY`, `CLOUDFLARE_*`. |

## Bloco 6 — código

| Item | Estado | Commit | Evidência |
|---|---|---|---|
| N16/S2/S3 — hex e `text-[px]` fora dos tokens no funil | resolvido | `6f6ada2` | `scripts/codemod-tokens.mjs` (paleta hex → tokens incl. `pa-gold-aa`; `style` fontFamily/fontWeight/textTransform → classes; `text-[9–18px]` → escala tipográfica com `text-inherit`; `clamp` → `headline-*`); `.caption` e `--color-pa-gold-aa` em `index.css`; `eslint.config.js` com `no-restricted-syntax` (erro no funil, aviso no resto). Funil: hex 343 → 12, px 348 → 18, `style` 90 → 44, fontFamily 38 → 0, clamp 11 → 0; `npm run lint` 0 erros. Revisão visual humana recomendada (ver decisões). |
| S5 — código morto | resolvido | `7a607a1` | Apagados `ComponentShowcase`, `AIChatBox`, `AdminLayout`, `DashboardLayout`, `Map.tsx`, 13 ficheiros `ui/` sem uso, 19 classes CSS, dependência `tailwindcss-animate`, `server/_core/public` (54 ficheiros de build antigos), `properties.backup-*.json`. |
| N17 — imagens Unsplash | resolvido | `8c0b81c`, `5900e5d`, `80cfbf0` | `products.json`/`services.json`, 5 capas do jornal, fallbacks por categoria, hero de Owners, CTA de Events, mapa `PROPERTY_IMAGES` (77 URLs para slugs inexistentes), `dns-prefetch` e handler de resize. Grep "images.unsplash.com" em `client/src`, `server`, `shared`, `index.html` → 1 ficheiro: `destinations.json`, apenas a capa do destino **Brazil** (rascunho, `noindex`, sem fotografia própria — decisão humana). |

## Bloco 7 — verificação final (5 set 2026, build local `80cfbf0`+`fix(n7)`)

- `npm run build` ✓ (prebuild: brand-facts + sync-i18n sem chaves em falta) · `npm run typecheck` ✓ · `npx vitest run` 192 ✓ / 6 saltados · `npm run lint` 0 erros.
- Greps a zero em `client/src`, `server`, `shared`, `client/index.html`, `llms.txt`: "47-point", "47 point", "within 1h", "within 24 hours", "holiday rentals", "Premium Holiday Homes", "Adventure Experiences", "Most chosen", "No spam", "curée", "Alojamentos Privados", "Você apenas", "tuas datas", "sob demanda", "manus-runtime" (fonte e `dist`). "60+"/"50+" só no comentário de `brandFacts.ts`.
- SSR local (curl, sem JS) de `/en/`, `/en/homes`, `/en/blog`, PDP própria (São Julião Retreat), PDP Tripwix (Quinta da Lameirinha), `/pt/`, `/pt/homes/<slug>`, `/en/best-rate-guarantee`, `/en/destinations/algarve`: 200, título e descrição localizados, `og:image` absoluto, `canonical` certo, `index, follow`, um único marcador `pa-ssr-meta`, sem vocabulário proibido, sem "tripwix".
- Produção (5 set, antes deste último push): `robots.txt` e `llms.txt` iguais a `dist/`, sitemap com 1 557 URLs incluindo as 35 Tripwix e a página de garantia; título N6 no ar; PDP Tripwix indexável. Após o deploy deste push correr `npm run smoke:deploy` e confirmar `/en/destinations/algarve` com o título novo.
- Lighthouse mobile (local, throttling simulado; "antes" = relatório local de 22 mai `lighthouse-cv.json` no mesmo URL): `/en/` performance 46 → 69, LCP 4,7 s → 5,8 s (rede simulada; a home carrega o hero completo), TBT 3 350 ms → 140 ms, CLS 0. PDP São Julião Retreat (sem relatório anterior comparável): performance 56, FCP 4,2 s, LCP 7,6 s, TBT 390 ms, CLS 0 — o LCP é a foto hero do Guesty a 1600 px; próximo passo de performance é servir o hero em AVIF/WebP redimensionado no servidor.
- Checkout v2 em produção: **não** — depende de `CHECKOUT_V2=true` no Render (N1).

## Decisões e dados que só Ricardo pode dar

1. **N1** — ligar `CHECKOUT_V2=true` no Render e correr `npm run smoke:deploy` (runbook em `docs/go-live-runbook.md`).
2. **N9** — aprovar (ou não) os nomes propostos para as 35 casas Tripwix em `docs/tripwix-display-names-proposal.md`; hoje mostram o nome do parceiro tal como vem.
3. **N4** — números RNAL/AL de cada casa para `client/src/data/licenses.json` (o schema já os publica quando existirem).
4. **N8** — confirmar os concierges por região em `shared/concierges.ts` (`confirmed: false` onde falta confirmação; a assinatura cai em "Sara") e decidir se Events volta a ter testemunhos, agora reais.
5. **I2/N17** — validar as fotos de capa escolhidas para destinos, serviços, jornal, Owners e Events (lista em cada commit); o destino Brazil (rascunho) continua com foto stock por não haver fotografia própria.
6. **N6** — URL do perfil Google Business para o `sameAs` do schema `Organization`.
7. **N8** — autoria dos 33 artigos assinados "Portugal Active Team" e biografia/foto do segundo fundador.
8. **N16** — revisão visual das páginas do funil depois do codemod (Home, PLP, PDP, checkout, obrigado) em desktop e mobile; a conversão para tokens preservou cores e tamanhos, mas a olho humano é obrigatória antes de dar por fechado.
9. **N19** — submeter no Search Console as 35 URLs Tripwix (ou pedir reindexação do sitemap).
10. **Emails legacy** — passar `locale`, `destination` e `locality` nos chamadores de `sendBookingConfirmation`/`sendPreArrival`/`sendPostStay` (hoje saem em inglês com assinatura por defeito); depende de saber onde cada fluxo tem a língua do hóspede.
11. **Tripwix** — o outro trabalho em curso nesta branch (painel de parceiro, IVA, importação) é de outra sessão e não foi tocado; se o script de importação voltar a escrever em `/homes/tripwix/`, actualizar para `/homes/photos/`.

## Revisão visual do funil (5 set 2026, desktop 1440 e mobile 390)

Capturas por ecrã em local (build de `main`) e tentativa de reserva em produção até ao passo de pagamento (São Julião Retreat, 16→20 set, sem pagar).

| Achado | Estado | Commit |
|---|---|---|
| Linha por cima de todos os rótulos em maiúsculas (passos do checkout, check-in/out, "Why book direct", eyebrows das secções). Causa: a classe `.overline` colidia com a utility `overline` do Tailwind (`text-decoration-line: overline`), que ganha por estar na camada utilities. Já existia nos ~120 usos anteriores; o codemod do n16 levou-a ao funil. | resolvido — classe renomeada para `.eyebrow` (62 usos + codemod) | `9118ca4` |
| Nome cru do Guesty no widget de reserva, na mensagem de WhatsApp e no checkout ("Sao Juliao Retreat" sem acentos) | resolvido — o PDP passa o nome curado ao widget, ao painel de pedido e à lightbox | `5f887a6` |
| Nome cru nos `alt` das fotos (cards e galeria do PDP) | resolvido | `a8cfcb3` |
| "Secure booking" repetido no PDP (widget e bloco "porquê reservar direto"); link "How the guarantee works" com vazio por baixo em mobile (zona de toque de 44 px) | resolvido | `187c51e` |
| Faixa de estatísticas da home com "70" ao lado de "90+" no hero; hero da lista de casas com "90+" por cima de "78 homes available" | resolvido — faixa lê `HOME_COUNT_LABEL`; subtítulo da lista sem número nas 9 línguas | `fa933a1` |
| Faixa de 4 USPs a 4 colunas em mobile (ilegível); rótulo "Our homes" fora do estilo eyebrow | resolvido — 2 colunas em mobile; `.eyebrow` | `4bd79d2` |

Fica por decidir (não alterei):
- **Checkout, passo 2:** "Skip personalization" não salta — obriga a escolher a chegada (self check-in vs. recepção) antes de avançar. É comportamento do checkout v2 anterior à auditoria; se o "skip" deve assumir self check-in, é uma decisão de produto.
- **Checkout mobile, passo 1:** dois botões CONTINUE visíveis ao mesmo tempo (dentro do cartão e na barra fixa). Anterior à auditoria.
- **PDP:** o subtítulo do preço ("Direct price — no service fees, best rate online") repete duas linhas do bloco "Why book direct" logo abaixo. Ambos anteriores à auditoria (commit `8d24d88`); sugiro tirar o subtítulo.
- **PDP Tripwix:** o bloco "Why book direct" omite "best rate" e "no service fees" nas casas parceiras (regra de honestidade F1, comentário no código: a tarifa é do fornecedor). Não é menção ao parceiro, mas é a única diferença visível entre PDPs próprios e Tripwix.
- **Home, "How it works":** os numerais 01/02/03 quase invisíveis (bege sobre bege). Anterior à auditoria; escolha de design.
