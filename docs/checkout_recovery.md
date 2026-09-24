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
| 1 | 1 hora depois | Todos | A casa: tudo guardado, um clique para continuar, resposta pessoal do concierge. Se parou no **pagamento**: "Ficou algo por resolver?", com os métodos alternativos (Apple/Google Pay, PayPal, Klarna). |
| 2 | 20 horas depois | Todos | Urgência verdadeira: a hora exata a que o preço expira e, só quando for verdade, a escassez do calendário ("das 47 noites à volta das suas datas, 29 já não estão disponíveis"). |
| 3 | 3 dias depois | Só com consentimento de marketing | As datas são re-verificadas no Guesty, o preço é refeito e guardado mais 23 horas, e o **Flex é oferecido durante 72 horas**. Se as datas já não se vendem, salta para o contacto 4. |
| 4 | 7 dias depois | Só com consentimento de marketing | Até 3 casas na mesma região, com capacidade e livres nas mesmas datas. É o último contacto. |

## O incentivo: Flex oferecido

Decisão: nada de desconto em percentagem (tira margem e ensina os clientes a
abandonar o carrinho para receber um código). O Flex vale ~10% das noites aos
olhos do hóspede e só custa à Portugal Active se ele remarcar.

- O servidor grava `flex_gift_until` no intent (72 horas). O browser nunca
  escreve este campo.
- Enquanto for válido, o Flex conta **0** em `computeChargeBreakdown`, o
  cálculo que todas as cobranças usam (cartão, Apple/Google Pay, PayPal,
  Klarna). O checkout mostra o preço riscado e "Oferecido"; a confirmação
  também.
- Só é oferecido quando a estadia está acima do limiar do Flex
  (`FLEX_CONFIG.minTotal`). Abaixo, o contacto 3 vai sem incentivo.
- O Flex nunca se chama "seguro" em nenhuma língua.

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

Quando alguém desiste **no passo de pagamento** com um total de 3.000 € ou
mais, o concierge (`BOOKING_ALERT_EMAIL`) recebe um email "Ligar ao hóspede"
com telefone, WhatsApp e link do checkout, uma hora depois do abandono. Um
alerta por checkout.

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
levam `utm_campaign=checkout_recovery_1h|20h|3d|7d` e o checkout dispara
`checkout_resume` no GA4.

## Ligar e desligar

- Ativo em produção com `CHECKOUT_RECOVERY=true` e `SITE_URL=https://www.portugalactive.com`
  (já configurados). Nunca corre fora de produção.
- Desligar sem deploy: `CHECKOUT_RECOVERY=false` no Render.
- Tempos, limiares e percentagens em `RECOVERY_TIMING`, `HOLDOUT_PERCENT` e
  `CONCIERGE_ALERT_MIN_TOTAL` (`recovery-funnel.ts`), todos cobertos por testes.
