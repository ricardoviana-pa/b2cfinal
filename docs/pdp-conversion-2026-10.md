# Página da casa (PDP): redesign de 29 out 2026 e como medir o efeito

## O que entrou em produção

**PR #187 (29 out, 21h43)** — fotos primeiro, como no Airbnb:
- título compacto e galeria a toda a largura (1 grande + 4 pequenas); a 1440×900 a primeira foto começa a ~200 px (antes: 503 px);
- faixa de factos e seis amenities-chave com ícone debaixo das fotos; o cartão de reserva começa na mesma linha e cabe num ecrã de 900 px sem rolar por dentro;
- quartos antes das amenities, em cartões com um pictograma por cama;
- amenities-chave traduzidas (`amenityHighlight.*`, 9 línguas) e a lista completa num dialog; motor em `client/src/lib/amenities.ts`.

**PR seguinte (`feat/pdp-conversion-2`)**:
- uma review citada debaixo das amenities-chave (`lib/featuredReview.ts`): a de melhor classificação, a mais recente entre iguais, nunca abaixo de 4★, com as estrelas dela — não é um filtro de 5★ (desde 29 out todas as classificações são publicadas e a média junto ao título é a real; `shared/reviewStats.ts`);
- calendário de disponibilidade visível na página (`components/property/AvailabilitySection.tsx`): dois meses no computador, um no telemóvel; uma estadia escolhida aqui vai para o cartão de reserva, que a cota;
- painel das casas parceiras mais curto: os dados do hóspede e o botão só depois de haver datas;
- fotos curadas por casa (`config/propertyPhotos.ts`): a ordem das cinco da grelha e uma foto por quarto.

## Medir antes/depois (fazer a 12–13 nov, 14 dias depois)

A métrica é a taxa de **intenção de reserva por visita à página da casa**, separada por dispositivo:

1. **GA4 → Explorar → Funil** com os eventos `view_item` → `begin_checkout` (o `begin_checkout` dispara no "Reservar" do widget; `add_to_cart` quando entra um extra). Janelas: 15–28 out (antes) e 30 out–12 nov (depois). Segmentar por `device category` (desktop vs mobile) e, se houver volume, por `item_category2` (destino).
2. **Funil interno** (BD de produção, Render → Shell):
   ```bash
   SINCE=2026-10-15 npm run report:funnel
   ```
   Compara "intent criado" por semana antes e depois de 29 out. O relatório só lê (`scripts/checkout-funnel-report.ts`).
3. **Core Web Vitals**: Search Console → Experiência → Core Web Vitals, computador. A foto grande passou a servir-se a 1 440 px; confirmar que o LCP desktop não piorou. RUM próprio:
   ```bash
   npm run report:vitals
   ```
4. **Cache das fotos**: as cinco fotos da grelha de cada casa foram pré-geradas nos tamanhos novos a 29 out (1 300 URLs). Depois de mudar fotos no Guesty, repetir: o script está em `scripts/warm-image-cache.mjs`.

O que conta como sucesso: taxa `view_item → begin_checkout` ≥ +15 % em desktop sem queda em mobile, com o LCP desktop ≤ 2,5 s no P75.

## CWV mobile: o passo que continua por dar (Cloudflare, dashboard)

O maior travão do mobile continua a ser o **Google tag gateway do Cloudflare a injetar o GTM antes do consentimento** (`docs/performance_mobile.md`, passo 1). Não se corrige no código: é no dashboard do Cloudflare, zona `portugalactive.com`:

1. **Tag management → Google tag gateway** → desligar **"Inject"** (a injeção automática no HTML). O site já carrega o GTM sozinho, com consentimento (`client/src/lib/measurementConsent.ts`).
2. Se quiserem manter o domínio próprio para as tags (first-party), basta trocar o `src` do GTM em `measurementConsent.ts` para o caminho `/f3nl/` do gateway, sem injeção automática.
3. Esperar 7 dias e correr `npm run report:vitals`; confirmar no Search Console que as 135 URLs mobile "a melhorar" descem.

Quem faz: o Ricardo (acesso ao Cloudflare). Tempo: 5 minutos. É a melhoria isolada com mais impacto no LCP e no INP mobile.

## Curar as fotos de cada casa (editorial, sem código)

A grelha nova mostra as cinco primeiras fotos tal como o Guesty as ordena. Fórmula que funciona: exterior com piscina, melhor sala, melhor quarto, a vista, a mesa ou o terraço. Duas formas:

- **No Guesty**: reordenar as fotos do anúncio (a sincronização diária traz a ordem nova).
- **No site, sem tocar no Guesty**: em `client/src/config/propertyPhotos.ts`, por casa (chave = listingId do Guesty), `grid: [índices]` das cinco fotos e `rooms: [índice por quarto]`. Os índices são os da ordem do catálogo (0-based). Uma folha de contacto numerada com as 40 primeiras fotos de cada casa gera-se com o script do redesign (ver o PR) e abre-se no browser para escolher.
