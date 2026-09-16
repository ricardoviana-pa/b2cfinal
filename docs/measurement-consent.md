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
