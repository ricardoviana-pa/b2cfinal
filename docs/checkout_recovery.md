# Funil de recuperação do checkout

Documento de referência. Aprovado pelo Ricardo em setembro de 2026. Código:
`server/services/recovery-funnel.ts` (regras), `server/services/checkout-recovery.ts`
(execução), `server/services/recovery-copy.ts` (texto nas 9 línguas),
`server/services/transactional-email.ts` (`sendCheckoutRecovery`).

## A sequência

Quatro contactos, cada um com um argumento diferente. O conteúdo muda
consoante o passo onde o hóspede parou.

| Contacto | Quando | Para quem | Argumento |
|---|---|---|---|
| 1 | 1 hora depois | Todos | A casa: tudo guardado, um clique para continuar, convite a responder (a equipa lê todas as respostas; o Reply-To de todos os contactos é a caixa de reservas `BOOKING_NOTIFICATION_EMAIL`, booking@ por omissão, mesmo que o remetente mude; nunca promete leitura pessoal). Se parou no **pagamento**, conforme tentou ou não pagar (ver "Contacto 1 no pagamento"). |
| 2 | 24 horas depois | Todos | As datas são re-verificadas no Guesty, o preço é refeito e guardado mais 23 horas, e o **Flex é oferecido durante 48 horas** quando acrescenta alguma coisa à tarifa (ver abaixo). Por baixo do total, as mesmas duas linhas do contacto 1 no pagamento (ver abaixo): o cancelamento gratuito da tarifa com a data e as duas partes como o checkout as oferece no envio (desde 29 out 2026). Se as datas já não se vendem, salta para o contacto 4. |
| 3 | 3 dias depois | Todos | As datas são re-verificadas, e o **desconto é oferecido durante 48 horas**: um cupão do Guesty aplicado à própria cotação antes do envio, por isso o hóspede abre o link já com o valor descontado e não escreve código nenhum. Sem cupão configurado (ou recusado pelo Guesty) o contacto sai na mesma, com as datas re-verificadas e o preço de hoje, nunca com um desconto que não existe. Se as datas já não se vendem, salta para o contacto 4. |
| 4 | 7 dias depois | Só com consentimento de marketing | Até 3 casas na mesma região, com capacidade e livres nas mesmas datas, com foto, nome, lugar e ligação. **Sem preço no cartão**: o `priceFrom` do catálogo não é o preço daquelas datas e a unidade (noite ou pessoa) não está confirmada. É o último contacto. |

## Contacto 1 no pagamento

Desde 29 out 2026 (auditoria do funil, n.º 8). A maioria de quem pára no
pagamento nunca carregou em Pagar, e o texto antigo explicava a desistência
com "um cartão recusado, um limite do banco". O email escolhe-se no envio:

- **Houve tentativa de pagar**: o PI do cartão ou da wallet está no intent
  (o `createCardCharge` só corre depois do clique em Pagar), ou a Stripe tem um
  PI do PayPal ou do Klarna com o `intentId` na metadata (criado no clique,
  antes do redirect). Texto de sempre, "Ficou algo por resolver?", com os
  métodos alternativos (cartão, Apple Pay, Google Pay, PayPal). **O Klarna é
  sugerido** só quando o país de faturação do hóspede (o indicativo do
  telefone, senão a língua do site, senão PT; `shared/klarna.ts`) é um país
  onde a Klarna tem "Pay in 3" em euros e o total cabe no tecto desse país
  (Portugal e Grécia 1 000 €, Espanha, França, Itália e Irlanda 3 000 €,
  Alemanha, Áustria e Países Baixos 5 000 €), a mesma regra do separador da
  Klarna no checkout (`klarnaCanPay`). Até 29 out 2026 o checkout mandava o
  país fixo em PT e o Klarna não era sugerido a ninguém; o interruptor de
  emergência `KLARNA_BILLING_COUNTRY_FORCED_PT=true` (ambiente) volta a esse
  comportamento sem deploy. A resposta a "um limite do banco" continua a ser a
  linha das duas partes, no mesmo cartão.
- **Sem tentativa** (também quando a Stripe não responde): "Ficou alguma dúvida
  antes de reservar?", sem falar de falhas.

Nas duas variantes, por baixo do total, duas linhas: o cancelamento gratuito da
tarifa com a data (só se ainda houver prazo; nunca na não reembolsável) e "ou
em duas partes: X hoje e Y a <data>, no mesmo cartão", calculado no envio com a
mesma função do ecrã do checkout. A linha das duas partes só sai se os valores
somarem o total do cartão do email (com extras pagos, que o cartão não mostra,
não sai). O link do WhatsApp é o de todos os emails ("Prefere WhatsApp? Fale
com o seu concierge."): é um número central, e ainda não há concierge
confirmado por região (`shared/concierges.ts`), por isso nenhum email promete
"o concierge da região".

## Quem recebe o quê (17 nov 2026)

Decisão do Ricardo: os contactos 1 a 3 falam da MESMA casa e das MESMAS datas
que o hóspede pediu, por isso vão para todos, com opt-out em cada email. Só o
contacto 4 (outras casas) é marketing e continua a exigir consentimento de
newsletter. Até aqui os contactos 3 e 4 exigiam-no, e em 30 dias de produção
nenhum hóspede chegou a ver o Flex: 0 ofertas em 43 carrinhos abandonados.

Os contactos 2 e 3 refazem a cotação antes de sair (a do checkout morre às
~23 horas), por isso já não dependem de ela estar viva.

## O primeiro incentivo: Flex oferecido (contacto 2)

O Flex vale ~10% das noites aos olhos do hóspede e só custa à Portugal Active
se ele remarcar. Vai primeiro, às 24 horas, enquanto o interesse ainda é
recente.

- O servidor grava `flex_gift_until` no intent (48 horas). O browser nunca
  escreve este campo.
- Enquanto for válido, o Flex conta **0** em `computeChargeBreakdown`, o
  cálculo que todas as cobranças usam (cartão, Apple/Google Pay, PayPal,
  Klarna). O checkout mostra o preço riscado e "Oferecido"; a confirmação
  também.
- Só é oferecido quando a estadia está acima do limiar do Flex
  (`FLEX_CONFIG.minTotal`). Abaixo, o contacto 2 vai sem incentivo.
- Só é oferecido quando acrescenta dias ao cancelamento gratuito da tarifa
  (`flexExtraDays`): o Flex remarca até 7 dias antes da chegada, e a tarifa
  moderate já cancela de graça até 7 dias antes, por isso nela o contacto 2 vai
  sem incentivo. Firm, strict, strict_60 e não reembolsável continuam a recebê-lo;
  com política desconhecida, como antes.
- O Flex nunca se chama "seguro" em nenhuma língua.

## O segundo incentivo: 5% no contacto 3

Só às 72 horas, quando o Flex não chegou. Um desconto em percentagem tira
margem e ensina os clientes a abandonar o carrinho, por isso vem depois do
incentivo que não custa dinheiro, dura 48 horas e nunca se repete para o mesmo
carrinho.

- O valor vive num **cupão do Guesty** (Revenue Management), não no código do
  site. Configurar em Render a variável `RECOVERY_DISCOUNT_COUPON` com o
  código do cupão dedicado à recuperação. No Guesty, o cupão deve ter 5%
  de desconto e um limite de uma utilização por pessoa. A percentagem dos
  emails (`RECOVERY_DISCOUNT_PERCENT`) tem de bater com a do cupão.
- O site aplica o cupão à cotação (`applyCouponToBEQuote`) ANTES de enviar e
  grava a cotação descontada no intent: o hóspede abre o link já com o valor
  final e não escreve código nenhum.
- `RECOVERY_DISCOUNT_COUPON` vazio (por omissão) = sem desconto, e o contacto 3
  sai na mesma com as datas re-verificadas e o preço de hoje. O funil pode
  entrar em produção antes de o cupão existir, e um cupão apagado nunca parte
  o email.
- Se o cupão não baixar o total, o email também sai sem desconto: nunca se
  anuncia uma percentagem que a cotação não mostra.
- A garantia do preço dura 23 horas. Se o hóspede atualizar o preço antes
  de acabarem as 48 horas, o checkout pede um preço novo ao Guesty para a
  mesma estadia e reaplica o desconto. A atualização não prolonga a oferta.
- `discount_gift_until` guarda o prazo do benefício. A nota da reserva Guesty e
  o relatório do funil só atribuem o desconto ao contacto 3 quando o
  servidor o aplicou à cotação da reserva.

## Regras fixas

- **Pára no momento em que o hóspede reserva**, quando carrega em "Não quero
  receber estes lembretes", quando a mesma estadia foi reservada noutro sítio
  (verificação no Guesty) e quando o check-in está a menos de 2 dias.
- **Nunca repete** um contacto: cada um é reclamado na base de dados antes de
  o email sair. Se o servidor esteve em baixo, sai só o contacto mais recente
  em atraso, nunca dois seguidos.
- **Consentimento**: os contactos 1 e 2 falam da cotação que a própria pessoa
  pediu. Os contactos 3 e 4 são marketing e só vão para quem marcou "manter-me
  informado" no checkout (lead com `source` `newsletter-*`).
- **Urgência só verdadeira**: a hora de expiração é a real e a escassez só
  aparece quando mais de metade das noites à volta já não está disponível.

## Alerta ao concierge

Quando alguém desiste **no passo de pagamento**, seja qual for o valor
(decisão do Ricardo, 29 out 2026; até aí só a partir de 3 000 €), o concierge
(`BOOKING_ALERT_EMAIL`) recebe um email uma hora depois do abandono, até 48
horas: "Ligar ao hóspede" com telefone, WhatsApp e link do checkout quando o
telefone foi escrito, "Contactar o hóspede por email" quando parou antes de o
escrever (o email existe sempre: é o que abre o checkout). Um alerta por
checkout (`concierge_alerted`), também para o grupo de controlo.

## Medição

10% dos checkouts (determinístico pelo id, `isRecoveryHoldout`) não recebem
nenhum email automático. É a única forma de saber quantas reservas o funil gera
de facto. O alerta ao concierge vale para todos.

Relatório (Render, serviço de produção, Shell):

```
npm run report:recovery
DAYS=90 npm run report:recovery
```

Mostra a taxa de reserva dos dois grupos, a diferença (o efeito real), as
reservas por último contacto e quantas ofertas de Flex converteram. Os links
levam `utm_campaign=checkout_recovery_1h|24h|3d|7d` e o checkout dispara
`checkout_resume` no GA4.

## Ligar e desligar

- Ativo em produção com `CHECKOUT_RECOVERY=true` e `SITE_URL=https://www.portugalactive.com`
  (já configurados). Nunca corre fora de produção.
- Desligar sem deploy: `CHECKOUT_RECOVERY=false` no Render.
- Tempos, limiares e percentagens em `RECOVERY_TIMING`, `HOLDOUT_PERCENT` e
  `CONCIERGE_ALERT_MIN_TOTAL` (hoje 0: alerta para todos; `recovery-funnel.ts`),
  todos cobertos por testes.
- `KLARNA_BILLING_COUNTRY_FORCED_PT=true` no Render volta a mandar o país de
  faturação do Klarna fixo em PT (checkout e funil), sem deploy.
