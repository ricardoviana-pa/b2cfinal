# Ads Playbook — o que fazer ANTES de voltar a gastar

O tracking do site já está completo (deploy de 21 ago 2026): `whatsapp_click`
em todos os pontos, `phone_click`, `generate_lead`, `purchase`, funil
ecommerce GA4. Os passos abaixo são no GTM/GA4/Ads/Meta — fora do repo.

## 1. Marcar conversões (30 min, uma vez)
**GA4** (Admin → Events → Mark as conversion): `purchase`, `generate_lead`,
`whatsapp_click`, `phone_click`.
**GTM**: garantir tags GA4 event para estes nomes (o dataLayer já os envia).
**Google Ads**: importar as 4 conversões do GA4. Valores: purchase usa o valor
real; para whatsapp_click definir valor estático conservador (ex. €15) para o
smart bidding ter gradiente.
**Meta**: mapear via GTM → Meta pixel `Lead` (generate_lead + whatsapp_click)
e `Purchase`. Melhor ainda: ativar Conversions API via server GTM mais tarde.

## 2. Recomeçar SÓ com retargeting
Audiências: visitantes 30d, viewers de PDP 14d, `begin_checkout` 7d sem
purchase. Criativos: as próprias casas (o feed já existe —
`scripts/meta-catalog.mjs` gera catálogo Meta → Advantage+ catalog ads).
Orçamento pequeno (€10–20/dia) até o CPA por *lead* (não por purchase)
estabilizar.

## 3. Prospecção fria — só depois
Quando o retargeting der CPA aceitável em 2–3 semanas de dados: lookalike de
purchasers+leads (Meta), Performance Max com feed (Google) — sempre com as 4
conversões a alimentar.

## 4. Ler os resultados
GA4 → Explorations: funil search → view_item → begin_checkout → purchase +
whatsapp_click por origem. O objetivo do site é gerar CONTACTO qualificado;
julgar campanhas por lead+purchase combinados, não só purchase.
