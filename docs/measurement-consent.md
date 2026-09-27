# Consentimento e medição — 16 setembro 2026

## Comportamento

O banner anterior gravava a escolha, mas o HTML carregava sempre o GTM. O novo
bootstrap inicia o consentimento Google como `denied` e só carrega o container
GTM-TRPCDT3 depois de `all`. Sem escolha ou com `essential`, os eventos de marketing
não são enviados nem guardados para reprodução posterior. O GTM não tem entrada
alternativa através de iframe `noscript`.

Preferências existentes válidas são preservadas. O link **Gerir cookies** no
rodapé e na página de cookies permite mudar de escolha. Recusar depois de carregar
as bibliotecas sinaliza a retirada a Google, Meta e Clarity, apaga apenas cookies
conhecidos destas ferramentas e recarrega a página para parar as bibliotecas já
ativas. O banner avisa que o recarregamento pode perder campos ainda não guardados.
Alterações entre separadores também são respeitadas.

A pesquisa, disponibilidade, orçamento e checkout não dependem da autorização
de marketing. Esta alteração não apaga armazenamento de reservas, login ou
carrinho e não altera serviços de pagamento. Não constitui uma auditoria completa
de todos os fornecedores/cookies do site.

## Eventos após a escolha

- Uma aceitação na PDP permite reportar a casa atualmente visível.
- As listas passam a observar cartões visíveis após a autorização.
- `quote_viewed` reporta o orçamento reservável visível, uma vez por quote, com o
  preço do plano apresentado. Orçamentos anteriores/ocultos não são reproduzidos.
- A origem AI, se detetável, mantém o caminho e UTMs da entrada inicial, mesmo que
  a autorização só aconteça noutra rota.
- `purchase` continua deduplicado por transação. Uma compra sem autorização não
  recebe um marcador de envio. Não se reproduzem compras passadas ao aceitar.

## Origem da visita na reserva (27 setembro 2026)

O checkout 2.0 escreve na nota da reserva do Guesty uma linha `Origem:` ao lado
da linha `Cupao:`, na mesma escrita. Serve a atribuição do marketing
(pa-marketing, `b-crm/jobs/campaign_bookings.py`) e o email interno `[Venda direta]`.

- **Interruptor da nota:** a linha só vai para a nota com `VISIT_ORIGIN_NOTE=1`
  no Render. Desligada por defeito, porque o `campaign_bookings.py` procura os
  códigos das campanhas em toda a nota e os links das campanhas 1 e 4b levam
  `utm_content=codigo_pa2027` e `utm_content=codigo_voltar27`. Liga-se só
  depois de o pa-marketing retirar as linhas `Origem:` antes de procurar
  códigos. A captura, a tabela e o email `[Venda direta]` funcionam sempre.
- **Cobertura:** só as reservas de quem escolheu "Aceitar tudo" levam canal. As
  outras levam `Origem: sem consentimento` e aparecem assim no cockpit; a
  cobertura acompanha a taxa de aceitação do banner.

- **O que se capta** na página de entrada de cada carregamento completo
  (`shared/visit-origin.ts`, `client/src/lib/visitOrigin.ts`): `utm_source`,
  `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, o tipo de
  identificador de clique (`gclid`, `gbraid`, `wbraid`, `msclkid`, `fbclid`,
  nunca o valor), o domínio de origem e o caminho de entrada sem query, com os
  ids trocados por `:id`. Primeira e última visita, com hora. Uma entrada direta
  não apaga a última visita de campanha; recarregar, voltar atrás e os regressos
  da Stripe, Klarna e PayPal não contam.
- **Consentimento:** só com `all` se escreve `localStorage["pa-origin"]`, com
  30 dias por toque (a janela mais longa do marketing). Sem `all` nada é escrito
  e a reserva leva só `Origem: sem consentimento`. Retirar a autorização apaga a
  chave, também noutros separadores. A leitura da página de entrada fica em
  memória até haver escolha, como a origem AI acima.
- **Duração no aparelho:** o `localStorage` não expira sozinho. Cada toque vale
  30 dias e o que passou desse prazo é apagado na primeira visita seguinte
  (qualquer página). Se o visitante não voltar, o registo fica no navegador dele
  sem ser lido nem enviado, até limpar os dados do site. É isto que a política
  de cookies deve dizer ("apagado na primeira visita depois de 30 dias"). No
  Safari, o ITP apaga-o antes, ao fim de 7 dias sem visita.
- **Servidor:** `checkout.createIntent` recebe a origem e `checkout.setOrigin`
  atualiza-a a partir do checkout, só com uma escolha explícita no banner: ao
  abrir a página e a cada escolha, "Aceitar tudo" junta a origem deste aparelho
  (por exemplo um link de recuperação aberto no telemóvel) e "Apenas
  essenciais" apaga a origem do intent, também quando a retirada foi feita
  noutra página. Sem escolha não se manda nada: uma origem recolhida com
  consentimento noutro aparelho não é apagada. Lista fechada de chaves, até 100
  caracteres, só `[A-Za-z0-9._~-]`, valores com `@` ou com muitos algarismos
  seguidos passam a `removido`. Guarda em `booking_intent_origins` (tabela à
  parte); cada registo sai 31 dias depois da última atualização, numa limpeza
  a cada 6 horas.
- **Nunca sai para terceiros:** nem Stripe, nem CAPI da Meta, nem dataLayer.
- **Formato da linha e testes:** `server/services/visit-origin.ts`,
  `server/visit-origin.test.ts`, `server/visit-origin-consent.test.ts`,
  `server/checkout-sandbox/checkout-flow.test.ts`.

## Impacto na análise

GA4/Meta passam a refletir visitantes que autorizaram medição. Uma descida nos
eventos relativamente ao período em que a recusa era ignorada não prova uma
descida nas vendas. Receita e reservas operacionais devem ser conciliadas com
Guesty/pagamentos; não inferir ocupação nem ROAS só pelos eventos do browser.

O container publicado v25 já contém as reparações de inicialização Meta, PageView,
Clarity e InitiateCheckout preparadas em 16/09. A existência de um evento no código
não confirma uma tag GA4 configurada ou um evento recebido. Faltam validar a
receção no GA4/Meta e completar o mapeamento de eventos descrito em
`marketing-tracking.md`, evitando duplicar `purchase`.

## Verificação e limites

- Testes isolados cobrem ausência de scripts antes de autorização, restauro da
  preferência, corrida entre aceitar/recusar, retirada, sincronização entre
  separadores, armazenamento indisponível, SSR, atribuição AI e deduplicação.
- Verificar no browser: recusar → navegar/pedir preço; aceitar → um único GTM;
  abrir preferências → recusar → recarregamento sem GTM.
- Não finalizar uma reserva de teste em DEV enquanto Guesty e emails não tiverem
  isolamento confirmado. Stripe TEST por si só não isola esses serviços.
- Tag Assistant apresentou perda de ligação; o header COOP `same-origin` é uma
  causa possível. A proteção não foi reduzida para resolver a ferramenta.

Referências técnicas: [Google Consent Mode](https://developers.google.com/tag-platform/security/guides/consent),
[Clarity Consent API v2](https://learn.microsoft.com/en-us/clarity/setup-and-installation/clarity-consent-api-v2).
