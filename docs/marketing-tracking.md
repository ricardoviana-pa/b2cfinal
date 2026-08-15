# Tracking de marketing — funil do checkout 2.0

Estado: implementado no código (dataLayer) a 11 jul 2026. Container GTM: **GTM-TRPCDT3**.
Todos os eventos são empurrados para o `window.dataLayer` através dos helpers de
`client/src/lib/datalayer.ts` (`pushDL`, `pushEcommerce`, `pushPurchaseOnce`). Os eventos
de ecommerce limpam sempre o objeto `ecommerce` anterior antes do push (padrão GA4).

O objetivo deste documento é ser a fonte única para configurar as tags no GTM e o mapeamento
para o Pixel da Meta, de forma a alimentar o algoritmo de ads com o funil completo.

## 1. Tabela de eventos do funil

Ordem aproximada do funil, do primeiro preço visto até à compra.

| Evento dataLayer | Quando dispara | Parâmetros | Tag GTM a criar (GTM-TRPCDT3) | Evento Meta (Pixel) |
|---|---|---|---|---|
| `quote_viewed` | O widget mostra um preço vivo e reservável para as datas escolhidas (`BookingWidget.tsx`) | `property_id`, `ecommerce.currency`, `ecommerce.value` (total), `ecommerce.items[]` (item PROP-, `checkin_date`, `checkout_date`, `guests_adults`) | Trigger custom event `quote_viewed` → tag GA4 event + tag Meta | `ViewContent` (com `value`, `currency`, `content_ids=[PROP-id]`) |
| `quote_unavailable` | Pedido de preço sem quote reservável (`reason`: `no_price`, `no_bookable_quote`, `error`) | `reason`, `property_id`, `checkin_date`, `checkout_date`, `guests_adults` | Trigger `quote_unavailable` → tag GA4 event (diagnóstico de funil; sem Meta) | — |
| `begin_checkout` | Clique no CTA do widget, imediatamente antes de criar o intent e navegar para `/checkout/{id}` (`BookingWidget.tsx` ~linha 1208) | `ecommerce.currency`, `ecommerce.value` (total), `ecommerce.items[]` (PROP-, `price` nightly, `quantity` noites, datas, hóspedes) | Trigger `begin_checkout` → tag GA4 event + tag Meta | `InitiateCheckout` (com `value`, `currency`, `content_ids`) |
| `checkout_resume` | O hóspede reabre um intent existente por link de retoma (emails CRM, outro dispositivo) (`CheckoutPage.tsx`) | `property_id` | Trigger `checkout_resume` → tag GA4 event | — (opcional: `InitiateCheckout` de novo; recomendado NÃO, para não duplicar) |
| `add_contact_info` | Email capturado no passo 1 do checkout (`CheckoutPage.tsx`, `source: "checkout_v2"`) e no flow legacy do widget | `property_id`, `source` | Trigger `add_contact_info` → tag GA4 event + tag Meta | `Lead` (o email entra no funil CRM de recuperação) |
| `reception_selected` | Escolha obrigatória da receção no passo Personalizar | `reception_type` (`self`/`hosted`), `reception_late` (bool), `property_id` | Trigger `reception_selected` → tag GA4 event | — (micro-passo; não alimenta ads) |
| `add_to_cart` | Extra adicionado no passo Personalizar (`CheckoutPage.tsx` toggleExtra) | `property_id`, `ecommerce.currency`, `ecommerce.value` (valor do extra), `ecommerce.items[]` (`item_id`=sku, `item_category`="extra", `item_category2`=capítulo) | Trigger `add_to_cart` → tag GA4 event + tag Meta | `AddToCart` (com `value`, `currency`, `content_ids=[sku]`) |
| `remove_from_cart` | Extra removido no passo Personalizar | Igual a `add_to_cart` | Trigger `remove_from_cart` → tag GA4 event | — |
| `flex_viewed` | O bloco Flex fica visível no checkout (`FlexBlock.tsx`) | `property_id`, `value` (preço do Flex) | Trigger `flex_viewed` → tag GA4 event | — |
| `flex_added` / `flex_removed` | Toggle do Flex (bloco principal ou last-call do passo 3, `source: "step3"`) | `property_id`, `value`, `source` (opcional) | Trigger `flex_added` → tag GA4 event + tag Meta | `AddToCart` (content_ids=["flex"]) |
| `rate_plan_selected` | Troca entre plano flexível e não reembolsável | `rate_plan` (`flexible`/`non_refundable`), `value` (total do plano), `property_id` | Trigger `rate_plan_selected` → tag GA4 event | — |
| `coupon_applied` | Código promocional aplicado com sucesso à quote | `coupon`, `property_id` | Trigger `coupon_applied` → tag GA4 event | — |
| `add_payment_info` | Submissão de dados de pagamento: cartão (`CheckoutPaymentForm.tsx`), PayPal e Klarna (antes do redirect) | `payment_type` (`card`/`paypal`/`klarna`), `property_id`, `ecommerce.currency`, `ecommerce.value` | Trigger `add_payment_info` → tag GA4 event + tag Meta | `AddPaymentInfo` (com `value`, `currency`) |
| `purchase` | Reserva confirmada. Dispara nas return pages (PayPal/Klarna), na thank-you page e na confirmação legacy; **deduplicado por `transaction_id`** via `pushPurchaseOnce` (guard em localStorage) | `ecommerce.transaction_id` (código de confirmação), `ecommerce.value`, `ecommerce.currency`, `ecommerce.coupon` (quando a quote tinha código promocional), `ecommerce.items[]` | Trigger `purchase` → tag GA4 event + tag Meta. No GTM usar variável dataLayer `ecommerce.transaction_id` como `event_id` da Meta para dedupe futuro com CAPI | `Purchase` (com `value`, `currency`, `content_ids`, `event_id=transaction_id`) |
| `whatsapp_click` | Clique em qualquer CTA de WhatsApp do funil (`source`: `booking_widget`, `pricing_unavailable`, `booking_success`, `booking_confirmation`) | `source`, `property_id` | Trigger `whatsapp_click` → tag GA4 event + tag Meta | `Contact` |
| `generate_lead` | Formulários de lead fora do checkout (contacto, newsletter) | conforme a superfície | Já coberto pelas tags existentes | `Lead` |
| `ai_referral` | Visita vinda de uma fonte AI (ChatGPT, Perplexity, Claude, AI Overview) | `ai_source`, `ai_referrer`, `ai_landing_page` | Trigger `ai_referral` → tag GA4 event (atribuição; sem Meta) | — |

Notas de implementação confirmadas no código:

- `begin_checkout` já dispara com `value` = total e `items[]` no clique do CTA do widget,
  antes de `createIntent` + navegação. Nada a adicionar.
- `purchase` inclui agora `coupon` quando a quote tem código promocional. O código viaja:
  `CheckoutPage` (quote.couponCode) → `CheckoutPaymentForm` → botões PayPal/Klarna
  (sessionStorage) → return pages → `stashThankYou` → thank-you page. No flow de cartão vai
  direto do `handleCardSuccess` para a stash.

## 2. Tags GTM a criar (checklist)

Para cada linha da tabela com "tag Meta", criar no container GTM-TRPCDT3:

1. **Variáveis dataLayer** (se ainda não existirem): `ecommerce.value`, `ecommerce.currency`,
   `ecommerce.transaction_id`, `ecommerce.coupon`, `ecommerce.items`, `property_id`,
   `payment_type`, `coupon`, `reception_type`, `source`, `reason`.
2. **Triggers** de custom event com o nome exato do evento dataLayer.
3. **Tags GA4 event** (uma por evento) apontadas à measurement ID de produção, mapeando os
   parâmetros acima.
4. **Tags Meta Pixel** (custom HTML ou template Meta) para: `quote_viewed→ViewContent`,
   `begin_checkout→InitiateCheckout`, `add_contact_info→Lead`, `add_to_cart→AddToCart`,
   `flex_added→AddToCart`, `add_payment_info→AddPaymentInfo`, `purchase→Purchase`,
   `whatsapp_click→Contact`.
5. No `Purchase` da Meta, passar `event_id` = `ecommerce.transaction_id`. É isto que permite
   a deduplicação browser/servidor quando a CAPI entrar (ver §4).

## 3. Atribuição dos emails CRM (recuperação de carrinho)

Os emails de recuperação (Fase 4) usam links de retoma com UTMs fixos:

```
https://dev.portugalactive.com/{locale}/checkout/{intentId}
  ?utm_source=crm
  &utm_medium=email
  &utm_campaign=cart_recovery
  &utm_content=1h   (email 1, ~1h)
  &utm_content=20h  (email 2, ~20h)
```

- No GA4 estes cliques aparecem como `crm / email`, campanha `cart_recovery`, e o
  `utm_content` distingue o toque (1h vs 20h). O evento `checkout_resume` dispara na
  landing, por isso a taxa de retoma por toque = `checkout_resume` com sessão `cart_recovery`
  segmentada por `utm_content`.
- Conversão fechada = `purchase` na mesma sessão/atribuição. Como o `purchase` é deduplicado
  por `transaction_id`, não há dupla contagem entre o clique do email e a compra.
- Recomendado criar em GA4 uma exploração "cart_recovery" com funil
  `checkout_resume → add_payment_info → purchase` segmentado por `utm_content`.
- Estes UTMs NÃO devem ser reutilizados noutras campanhas de email; `cart_recovery` é o
  identificador do circuito automático.

## 4. Fase seguinte: Meta Conversions API (server-side)

O Pixel browser perde eventos (adblockers, ITP, consent). A fase seguinte é enviar os
mesmos eventos pelo servidor via **Meta CAPI**:

- O ponto natural de emissão server-side do `Purchase` é o hook paid do
  `checkout.updateIntent` (`server/routers/checkout.ts`), que já dispara a ficha do CS e o
  email de confirmação: o intent tem email, telefone, valor, moeda e código de confirmação.
- Enviar com `event_id` = código de confirmação (igual ao browser) para a Meta deduplicar
  os dois canais.
- Hash SHA-256 de email/telefone (advanced matching) — o intent já guarda ambos.
- `Lead` server-side pode sair do `captureLead` (mesmo router) com o mesmo princípio.
- Requisitos: access token do pixel (Business Manager), env var nova (ex.
  `META_CAPI_TOKEN`), fire-and-forget com try/catch como os emails (nunca travar o funil).

## 5. Validação

1. GTM Preview (Tag Assistant) em dev.portugalactive.com: percorrer o funil completo com a
   casa demo e confirmar cada evento da tabela no dataLayer.
2. Meta Events Manager → Test Events: confirmar `ViewContent`, `InitiateCheckout`, `Lead`,
   `AddToCart`, `AddPaymentInfo`, `Purchase` com os valores certos.
3. Compra de teste com código promocional: o `purchase` deve trazer `ecommerce.coupon`.
4. Clicar num link de email de recuperação: sessão GA4 com `utm_campaign=cart_recovery` e
   evento `checkout_resume`.
