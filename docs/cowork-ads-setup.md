# Prompt para o Cowork — ativar conversões + retargeting (Google & Meta)

Copia tudo abaixo da linha para o Cowork. Pré-requisito: estar autenticado no
browser nas contas Google (GA4, GTM, Google Ads) e Meta Business Suite da
Portugal Active.

---

## Contexto

Sou responsável pelo marketing da **Portugal Active** (www.portugalactive.com),
aluguer de casas de luxo em Portugal. O site envia agora todos os eventos de
conversão para o `dataLayer` do **GTM (container GTM-TRPCDT3)**, mas as
plataformas de ads nunca foram configuradas para os usar — as campanhas
falhavam por falta de sinal, não por targeting. A tua missão: ligar o sinal de
ponta a ponta e recomeçar APENAS com retargeting.

Eventos disponíveis no dataLayer (nomes exatos):

- **Conversões:** `purchase` (com value/currency EUR), `generate_lead`,
  `whatsapp_click`, `phone_click`
- **Funil:** `search`, `view_item`, `view_item_list`, `select_item`,
  `add_to_cart`, `begin_checkout`, `add_payment_info`, `add_contact_info`

Faz as fases por ordem. Se algo não corresponder ao descrito (nomes de tags,
contas), adapta com bom senso e regista o desvio no relatório final. Usa o
prefixo **[PA]** em tudo o que criares.

## Fase 0 — Congelar o que está a gastar

1. Google Ads: **pausa** todas as campanhas ativas (não apagar).
2. Meta Ads Manager: **pausa** todas as campanhas ativas (não apagar).
3. Anota no relatório o que estava ativo e o gasto diário de cada uma.

## Fase 1 — GTM: garantir que os eventos chegam ao GA4

No container **GTM-TRPCDT3**:

1. Confirma que existe uma tag Google (GA4 config) a disparar em todas as
   páginas; anota o Measurement ID (G-…).
2. Para cada um de `whatsapp_click`, `phone_click`, `generate_lead`: se não
   existir tag de evento GA4, cria — tag "Google Analytics: GA4 Event", nome
   do evento igual ao do dataLayer, trigger "Custom Event" com o mesmo nome.
   (`purchase` vem do ecommerce e normalmente já passa; confirma.)
3. Preview mode: abre www.portugalactive.com, clica no botão WhatsApp de uma
   página de casa e confirma que a tag dispara.
4. **Publica o container** com a descrição "PA conversions wiring".

## Fase 2 — GA4: marcar key events

Em Admin → Events (ou Data display → Events): marca como **key event**:
`purchase`, `generate_lead`, `whatsapp_click`, `phone_click`.
Se algum ainda não aparecer na lista (precisa de tráfego), cria-o em
"Create key event" com o nome exato.

## Fase 3 — Google Ads: conversões + remarketing

1. Tools → Conversions → New → **Import from GA4**: importa os 4 key events.
   Configuração:
   - `purchase`: primária, valor da transação, contar "Every".
   - `generate_lead`: primária, valor estático **€25**, contar "One".
   - `whatsapp_click`: primária, valor estático **€15**, contar "One".
   - `phone_click`: secundária, valor estático **€15**, contar "One".
2. Confirma que o linking GA4 ↔ Google Ads e o Google signals/audience
   sharing estão ativos.
3. Audience Manager: cria segmento **[PA] Visitantes 30d** (todos os
   utilizadores do site, 30 dias) e **[PA] Compradores 180d** (evento
   purchase, 180 dias).
4. Cria UMA campanha **Demand Gen** chamada **[PA] Retargeting**:
   - Audiência: só [PA] Visitantes 30d, com exclusão de [PA] Compradores 180d.
     **Desliga qualquer expansão de audiência/targeting otimizado.**
   - Orçamento: **€8/dia**. Bidding: maximizar conversões.
   - Idioma: todos; localização: Europa.
   - Criativos: usa 3–5 imagens de casas retiradas de
     www.portugalactive.com/en/homes (casas com piscina, título tipo
     "Private homes in Portugal — book direct, no fees", link para
     https://www.portugalactive.com/en/homes).
   - Deixa a campanha **ativa**.

## Fase 4 — Meta: pixel + eventos

1. Events Manager: verifica se existe um pixel/dataset da Portugal Active com
   tráfego recente. **Se não existir**, cria um ("Portugal Active Website") e
   instala-o via GTM: no GTM-TRPCDT3, template "Facebook Pixel" da Community
   Gallery, tag base PageView em All Pages com o Pixel ID.
2. No GTM, cria tags Meta (mesmo template, referindo o Pixel ID):
   - `Lead` — trigger custom event `whatsapp_click` E outro trigger
     `generate_lead`.
   - `Purchase` — trigger `purchase`, com value e currency lidos do dataLayer
     (variáveis Data Layer `ecommerce.value` e `ecommerce.currency`; se não
     existirem com esses nomes, inspeciona o dataLayer no preview e usa os
     caminhos corretos).
   - `InitiateCheckout` — trigger `begin_checkout`.
   - `ViewContent` — trigger `view_item`.
3. Publica o GTM ("PA meta pixel wiring") e valida em Events Manager → Test
   Events com um clique real no site.

## Fase 5 — Meta: audiências + campanha de retargeting

1. Audiences: cria
   - **[PA] Site 30d** — todos os visitantes do site, 30 dias;
   - **[PA] Viu casa 30d** — evento ViewContent, 30 dias;
   - **[PA] Checkout 14d** — InitiateCheckout, 14 dias;
   - **[PA] Compradores 180d** — Purchase, 180 dias.
2. Verifica no Commerce Manager se existe um catálogo de hotéis da Portugal
   Active com itens ativos.
   - **Se existir:** cria campanha **[PA] Retargeting Catálogo** (objetivo
     Vendas, Advantage+ catalog ads), audiência = retargeting "viewed or
     added to cart but not purchased" 30 dias, orçamento **€12/dia**.
   - **Se não existir:** cria campanha manual **[PA] Retargeting** (objetivo
     Vendas), audiência = [PA] Site 30d excluindo [PA] Compradores 180d,
     **sem Advantage audience expansion**, orçamento **€12/dia**, 3–5
     criativos de imagem das casas do site com texto "Reserva direta — sem
     taxas de serviço, melhor preço online" (EN: "Book direct — no service
     fees, best rate online"), link https://www.portugalactive.com/en/homes.
     Anota no relatório que falta carregar o catálogo (o Ricardo gera os
     feeds com scripts/meta-catalog.mjs).
3. Deixa a campanha **ativa**. Eventos de otimização: Purchase; se a Meta
   avisar que Purchase tem volume insuficiente, otimiza para Lead.

## Fase 6 — Verificação e relatório

1. GA4 Realtime: faz um clique de teste no WhatsApp do site e confirma o
   evento; confirma os 4 key events marcados.
2. Google Ads: as 4 conversões com estado "Recording conversions" (ou
   equivalente); campanha [PA] Retargeting ativa.
3. Meta: Test Events a receber; audiências a preencher; campanha ativa.
4. Relatório final: o que foi pausado (e gasto/dia), o que foi criado em cada
   plataforma, IDs relevantes (Measurement ID, Pixel ID), desvios ao plano, e
   o que ficou pendente para o Ricardo.

## Guardrails (não negociar)

- NÃO ativar prospecção fria, lookalikes ou Performance Max nesta fase.
- NÃO aceitar recomendações automáticas das plataformas (auto-apply,
  "aumentar orçamento", expansão de audiência) — recusa todas.
- NÃO mexer em métodos de pagamento nem faturação.
- NÃO apagar nada — pausar apenas.
- Orçamento total novo máximo: **€20/dia** (Google €8 + Meta €12).
- Moeda sempre EUR; conversões sempre com os nomes de evento exatos acima.
