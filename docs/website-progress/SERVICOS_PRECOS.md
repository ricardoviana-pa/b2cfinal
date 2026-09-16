# Serviços — reconciliação comercial

16-09-2026. Extraído do código; não altera preços. As prestações podem diferir: a operação deve validar âmbito, unidade, região e inclusões antes de unificar.

| Serviço | Catálogo público atual (products.json) | Checkout | Catálogo legado (services.json) |
| --- | --- | --- | --- |
| private-chef | Desde €60 per person | €95 por pessoa; mínimo 4 pessoas | From €85 per person |
| in-villa-spa | Desde €100 per session | €90 por pessoa × sessão/unidade | From €75 per session |
| private-yoga | Desde €80 per session | €60 por pessoa × sessão/unidade | From €60 per session |
| personal-training | Desde €90 per session | €55 por pessoa × sessão/unidade | From €55 per session |
| grocery-delivery | Desde €150 + groceries | €120 por estadia | From €45 per setup |
| babysitter | Desde €35 per hour | €20 por pessoa × sessão/unidade; unidade: hour | From €20 per hour |
| airport-shuttle | Desde €80 per transfer | €120 por unidade; Porto base €120, van €160; Lisboa €280/€350 | From €65 per transfer |
| daily-housekeeping | Desde €60 per visit | Por casa/tipologia; valor base €65 (não é uma tarifa universal) | — |

## Decisão necessária

Para cada linha, aprovar: serviço exato; preço e unidade; mínimo de participantes/horas/sessões; regiões; inclusões e despesas adicionais; impostos; confirmação e cancelamento.

Depois de aprovada a matriz, ligar catálogo, detalhe, dados estruturados e checkout à mesma definição comercial. Não substituir preços públicos pelos do checkout por suposição.

## Limites

A listagem pública atual usa products.json. services.json é uma fonte legada ainda presente no repositório, não prova de um terceiro preço atualmente visível em todas as páginas. O babysitting e treino/yoga precisam particularmente de clarificar se a unidade é pessoa ou grupo.
