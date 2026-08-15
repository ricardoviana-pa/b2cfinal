# Spike: invoice items custom na reserva Guesty (Fase 1)

Deliverable da Fase 1 (checkout_spec.md §16: "criar reserva de teste com invoice items custom e documentar o resultado"). Investigação documental concluída a 11 jul 2026 sobre os docs oficiais Guesty; a execução autenticada (3 chamadas, ~30 min) está pronta em `scripts/spike-invoice-items.mjs` — **requer uma reserva de teste escolhida por humano** (cria movimentos financeiros reais no PMS).

## Resposta à pergunta da secção 7 da spec

**Sim, extras e Flex podem entrar na reserva Guesty como invoice items — mas NÃO na criação via Booking Engine API.** O caminho validado pelos docs:

1. **BEAPI não transporta extras.** O `POST /api/reservations/quotes/{quoteId}/instant` só aceita `ratePlanId`, `ccToken`, `guest`, `policy`; o valor cobrado está trancado à quote (garantia de preço 24h). Docs verbatim: *"the Booking Engine API only works with predefined rate plans... Editing or including additional fees and taxes on top of the rate plan isn't supported."* Únicos ajustes: cupões (descontos, nunca sobretaxas).
   - https://booking-api-docs.guesty.com/reference/createinstantreservationfromquote

2. **Caminho para a Fase 2/3 (extras + Flex num único pagamento):**
   - Criar a reserva (BE instant como hoje, OU Open API `/v1/reservations-v3`)
   - `POST /v1/invoice-items/reservation/{reservationId}` por cada extra/Flex:
     ```json
     { "title": "Flex — remarcação garantida", "amount": 250, "normalType": "AFE", "secondIdentifier": "INSURANCE", "isUpsellFee": true }
     ```
     `secondIdentifier` relevantes: `BOOKING_FEE`, `SERVICE`, `CONCIERGE`, `INSURANCE`, `ACTIVITIES`, `MEAL`, `EARLY_CHECK_IN`, `LATE_CHECKOUT`, `CLEANING`.
     - https://open-api-docs.guesty.com/reference/invoiceitemscontroller_createinvoiceitem
     - https://open-api-docs.guesty.com/docs/predefined-additional-fee-types
   - Cobrar o total (estadia + extras) no nosso Stripe PI (padrão Klarna/PayPal atual) e registar em Guesty: `POST /v1/reservations/{id}/payments` com método registado (`BANK_TRANSFER`/`OTHER`) e `note: "Stripe PI pi_xxx"`.
     - https://open-api-docs.guesty.com/docs/posting-a-guest-payment

3. **⚠️ A ORDEM É CRÍTICA:** o Guesty rejeita pagamentos acima do `balanceDue`. O invoice item tem de ser criado ANTES do registo do pagamento (o item sobe o `hostPayout` → `balanceDue`; depois o pagamento total zera-o). Nunca ao contrário.

4. **Outras armadilhas documentadas:**
   - Esperar até 60 s entre chamadas que manipulam a mesma reserva BEAPI/Open API.
   - Reservas instant-book: fees adicionados NÃO são cobrados pelas Auto Payment rules (bom — sem dupla cobrança). Reservas não-instant: as rules PODEM cobrar → risco de dupla cobrança se também cobrarmos no nosso Stripe.
   - Invoice items **não têm update/delete via API** — reembolso de um extra exige price adjustment ou suporte Guesty. Validar amount/identifier antes de enviar.
   - Um pagamento manual desliga a re-automação de pagamentos dessa reserva.
   - `POST /v1/reservations` (legacy) aceita `money.invoiceItems` na criação; o `/v1/reservations-v3` NÃO (items só pós-criação).

## Incerteza residual (o que o spike autenticado confirma)

1. **Schema exato do recorded payment** — o `paymentMethod` (`{method:"BANK_TRANSFER", id:"5dee4ebd32acdf7051cd6ed6"}` vs outra forma) está truncado nos docs públicos. É a incerteza nº 1.
2. Se o `balanceDue` recalcula sincronamente após criar o invoice item.
3. Se adicionar item nos primeiros ~60 s de uma reserva BEAPI corre bem (o script espera 90 s).

## Como executar (supervisão humana — escolhe tu a reserva)

```bash
GUESTY_CLIENT_ID=... GUESTY_CLIENT_SECRET=... \
node scripts/spike-invoice-items.mjs --reservation <RESERVATION_ID> [--amount 49] [--execute]
```

Sem `--execute` faz apenas o GET do estado financeiro (read-only). Com `--execute`: (1) cria o invoice item de teste, (2) verifica que `balanceDue` subiu exatamente o valor, (3) regista um pagamento pelo saldo e confirma `balanceDue → 0`. Usar uma reserva de teste/inquiry — os movimentos ficam no folio e **não são removíveis via API**.

## Implicação para a arquitetura da Fase 2

O fallback da spec §7 ("um único charge externo para tudo") é desnecessário: mantemos o fluxo de cartão BEAPI atual para a estadia e cobramos **estadia+extras+Flex num único PI do nosso Stripe apenas nos fluxos Klarna/PayPal** — OU, para o cartão, mantemos a cobrança Guesty da estadia e os extras entram como invoice items + segundo charge? Não — a decisão fechada é UM pagamento. Logo, na Fase 2, quando houver extras no carrinho, TODOS os métodos passam ao padrão "charge externo único + reserva Open API + invoice items + recorded payment" (o padrão que Klarna/PayPal já usam hoje). Sem extras, o fluxo BEAPI atual mantém-se. Confirmar o schema do recorded payment no spike antes de construir.
