# Levantamento de pagamentos e wallets — Fase 0

Deliverable da Fase 0 (checkout_spec.md, secção 16: "Wallets: apenas levantar onde estão configurados hoje; a ativação decide na Fase 2"). Levantado a 10 de julho de 2026, branch `dev`, commit base `da0008d`.

## Resumo

Três métodos de pagamento vivos, todos assentes em Stripe mas com **duas arquiteturas de captura diferentes**:

| Método | Quem cobra | Conta Stripe | Reserva Guesty |
|---|---|---|---|
| Cartão | **Guesty** (BE API `/instant` com `ccToken`) | Conta conectada por listing | Criada e cobrada pelo Guesty |
| Klarna | **Stripe** (PaymentIntent) | Conta da plataforma | Criada via Open API + `recordExternalPayment` (pago fora) |
| PayPal | **Stripe** (PaymentIntent) | Conta da plataforma | Idem |

A auditoria referia "PaymentElement Stripe com wallets configurados" e o levantamento anterior "tokenização Guesty" — **ambos são meia-verdade**: é Stripe PaymentElement em modo *deferred intent* (sem PaymentIntent, `paymentMethodCreation: "manual"`) que produz um token `pm_`, entregue ao Guesty Booking Engine, que faz a cobrança na conta Stripe conectada do listing.

## Fluxo por método

### 1. Cartão (Guesty cobra)
- Entrada: `BookingWidget` step `payment` → [CheckoutPaymentForm.tsx](../client/src/components/booking/CheckoutPaymentForm.tsx)
- SDK: `@stripe/stripe-js` + `@stripe/react-stripe-js`, carregado em runtime (`loadStripe`), nada no index.html
- Chave publishable: tRPC `booking.getStripeConfig` (env `STRIPE_PUBLISHABLE_KEY`); conta conectada por listing via `booking.getPaymentProvider` (Guesty BE `/api/listings/{id}/payment-provider`) — **única fonte de verdade**, nunca fallback para env
- Cobrança: `POST booking.guesty.com/api/reservations/quotes/{quoteId}/instant` com `ccToken` (server/services/guesty-booking.ts:366). O valor cobrado é o da quote BE server-side, não o `props.total` do cliente
- Sucesso: fica no widget (ecrã de sucesso in-widget) — **não** navega para /booking/thank-you

### 2. Klarna (Stripe cobra, Guesty regista)
- [KlarnaCheckoutButton.tsx](../client/src/components/booking/KlarnaCheckoutButton.tsx) → stash em `sessionStorage("klarna_booking_data")` → tRPC `createKlarnaPaymentIntent` (conta plataforma, `payment_method_types: ["klarna"]`, server/services/stripe-klarna.ts) → `confirmKlarnaPayment` redirect → [/booking/klarna-return](../client/src/pages/booking/KlarnaReturnPage.tsx) → `retrievePaymentIntent` → tRPC `confirmKlarnaBooking` → `getOrCreateReservation` (4 camadas de idempotência, server/lib/paypal-idempotency.ts) → Guesty Open API `/v1/reservations-v3` + `recordExternalPayment` (método OTHER, limitado ao balanceDue) → navega para `/booking/thank-you/{id}?method=klarna`
- Backstop: webhook `POST /api/webhooks/stripe-klarna` (raw body, antes do express.json)
- ⚠️ O montante é calculado no CLIENTE (`Math.round(amount*100)`); o servidor só valida gama e ±€1
- ⚠️ Webhook path cria reserva SEM `ratePlanId` (não está na metadata do PI) — cai no rate plan default do listing

### 3. PayPal
- Gémeo do Klarna: [PayPalCheckoutButton.tsx](../client/src/components/booking/PayPalCheckoutButton.tsx) → `createPayPalPaymentIntent` → `/booking/paypal-return` → `confirmPayPalBooking` → mesma criação Open API + webhook `/api/webhooks/stripe-paypal`
- ⚠️ `source` da reserva hardcoded `"website-paypal"` mesmo para Klarna (server/services/guesty-openapi-paypal.ts:36)
- ⚠️ `returnUrl` validado no router mas nunca usado server-side

## Wallets hoje

- **Google Pay**: scaffolding dormante em CheckoutPaymentForm — existe no type union (`PaymentMethodId`), no `PAYMENT_METHODS` (com logo), mas desligado em DOIS sítios:
  1. `wallets: { googlePay: "never", applePay: "never" }` nas options do PaymentElement (linha ~300)
  2. Filtrado do seletor de métodos: `PAYMENT_METHODS.filter(({id}) => id !== "googlepay")` (linha ~412)
  - ⚠️ BUG latente: `STRIPE_METHOD_TYPES.googlepay = ["google_pay"]` é INVÁLIDO como `paymentMethodTypes` do Stripe (wallets andam sobre o tipo `card` via a opção `wallets`) — ativar tal como está parte o Elements
- **Apple Pay**: só existe como logótipo no footer (FooterPaymentLogos.tsx + client/public/payments/apple-pay.svg) — anunciado mas não oferecido. Ativação exige registo de domínio em CADA conta Stripe conectada (o cartão carrega Stripe com `{ stripeAccount }` por listing)
- **MB Way / Multibanco**: zero vestígios em client e server. MB Way não é método Stripe → exigiria outro PSP (SIBS/Eupago) no padrão Klarna/PayPal. **Multibanco é suportado pelo Stripe** (EUR, voucher com notificação diferida) e clonaria o padrão stripe-klarna.ts + webhook + return page — mas a arquitetura atual da return page espera `status === "succeeded"` no retorno, o que trata mal confirmação assíncrona

## Pontos de ligação para a Fase 2 (Apple Pay / Google Pay no fluxo cartão)

1. Flip de `wallets: { googlePay: "auto", applePay: "auto" }` no PaymentElement
2. Corrigir/remover `STRIPE_METHOD_TYPES.googlepay` (wallets andam no tipo `card`)
3. Mostrar o método no seletor (remover o filter)
4. Apple Pay: registar o domínio em todas as contas conectadas por listing
5. Questão em aberto a testar: o Guesty BE `/instant` aceita tokens `pm_` derivados de wallet? (comportam-se como card PMs — provável que sim, mas exige teste real)

## Env vars de pagamento (só nomes)

`STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_KLARNA_WEBHOOK_SECRET`, `STRIPE_PAYPAL_WEBHOOK_SECRET`, `GUESTY_BE_CLIENT_ID`, `GUESTY_BE_CLIENT_SECRET`, `GUESTY_CLIENT_ID`, `GUESTY_CLIENT_SECRET`, `GUESTY_BASE_URL`, `GUESTY_WEBHOOK_SECRET`. Não existem env vars de pagamento no cliente (VITE_*).

## Armadilhas conhecidas (relevantes para a Fase 1/2)

- Duas instâncias `loadStripe` distintas: conta conectada (cartão) vs plataforma (Klarna/PayPal return pages, cache a nível de módulo)
- Todo o estado Klarna/PayPal atravessa o redirect via `sessionStorage` — abrir o link de retorno noutro browser/tab perde os dados da reserva (beco sem saída com contacto de suporte)
- Três UIs de confirmação diferentes: sucesso in-widget (cartão), /booking/thank-you (Klarna/PayPal), /booking/confirmation/:id (órfã, só alcançável por link direto)
- `POST /api/reservations` antigo devolve 410 Gone — todo o booking passa por pagamento
