# Medição do funil — diagnóstico confirmado

16-09-2026 · Contentor público `GTM-TRPCDT3` · Website B2C

## O que foi observado

Na navegação real da PDP Beach Farm para o checkout em produção, o browser reportou:

- `Duplicate Pixel ID: 1428229772653572`.
- `CL001: Multiple Clarity tags detected`.
- Erro `Cannot read properties of undefined (reading 'unshift')` no script Clarity.
- Meta recebe `begin_checkout` através de `fbq('track', ...)`, com aviso de evento não standard.

O checkout abriu e preservou o resumo. Os erros observados são das ferramentas de medição; não provam falha na reserva. Também não permitem concluir que o número reportado de compras está correto.

## Causa identificada no contentor publicado

O JavaScript público de `https://www.googletagmanager.com/gtm.js?id=GTM-TRPCDT3` foi analisado sem alteração.

| Tag ID | Comportamento observado | Correção proposta |
| --- | --- | --- |
| 50 | Base Meta executa `init` e `PageView`; dispara em `gtm.js`, `gtm.historyChange` e como setup de tags de ecommerce. Configurada por evento. | Separar inicialização de PageView. Inicializar cada pixel uma vez por documento e manter os pageviews de navegação numa tag própria. Não resolver removendo todas as medições de mudança de página. |
| 86 | Injeta Clarity `winegcvwec` em `gtm.js` e `gtm.historyChange`, por evento. | Carregar a biblioteca uma vez por documento, respeitando o consentimento existente; retirar a reinjeção na navegação interna. |
| 90 | Usa `fbq('track','begin_checkout',...)`; tem a tag 50 como setup. | Mapear o evento GA4 `begin_checkout` para `InitiateCheckout` no Meta. Preservar o nome GA4. |
| 88, 103, 105 | Purchase e ViewContent também usam 50 como setup. | Ligar à inicialização deduplicada sem gerar um PageView adicional por evento comercial. Validar as sequências. |

O contentor inclui um mapa de pixels para B2C e `management.portugalactive.com`. Qualquer publicação tem de verificar também este segundo site; não substituir o mapa pelo pixel B2C fixo.

## Estado do acesso

A conta Google disponível não apresenta contas/contentores no GTM. Foi perguntado que conta ou agência gere o contentor. Não foi criado um contentor substituto nem alterado o snippet do site. Nenhuma configuração GTM foi publicada.

## Validação necessária após a correção

1. Exportar a versão atual e trabalhar num workspace de revisão.
2. No Tag Assistant, validar carregamento inicial, navegação interna, regresso à página, consentimento e checkout.
3. Confirmar uma inicialização por documento, um PageView por navegação prevista e um InitiateCheckout por avanço do hóspede.
4. Validar Purchase com uma transação de teste controlada e reconciliar ID/valor/moeda com a reserva. Nunca disparar uma compra falsa em produção para fazer a prova.
5. Confirmar os dois domínios e só depois publicar, guardando a versão anterior para reposição.

Referências: [Google — opções de disparo de tags](https://support.google.com/tagmanager/answer/6279951?hl=en) e [template oficial Meta para GTM](https://github.com/facebook/GoogleTagManager-WebTemplate-For-FacebookPixel/blob/main/template.tpl).
