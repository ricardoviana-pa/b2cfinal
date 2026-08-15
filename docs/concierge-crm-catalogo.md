# Catálogo completo de serviços, extras e experiências — Checkout 2.0

Para o CRM de concierge (menu + backoffice de cross/upselling). Fonte de verdade: `server/config/checkout-extras.ts`, `server/config/cleaning-rates.ts` e o i18n do site (nomes exatamente como o hóspede os vê em PT). Preços em EUR. O `sku` é o identificador técnico — usa-o no CRM para cruzar com as reservas do site (aparece no manifesto CS e na metadata do pagamento).

## Como ler a cobrança

| Modelo | Significado |
|---|---|
| por estadia | Preço fechado, uma vez por reserva |
| por trajeto/unidade | Preço × quantidade (o hóspede escolhe quantas) |
| por pessoa | Preço × nº de pessoas |
| por pessoa/sessão ou hora | Preço × pessoas × sessões (ou horas) |
| por pessoa/dia | Preço × pessoas × dias escolhidos |
| escalões | Total cumulativo não linear (ver animais) |
| sob orçamento | Sem cobrança no checkout — pedido vai ao concierge, orçamento à parte |

**Confirmação:** "imediata" = cobrado e garantido no ato. "24 h" = cobrado hoje; se o concierge não conseguir garantir, reembolso automático dessa linha em 24 h. "Sob orçamento" = nunca cobrado no checkout.

---

## Capítulo 1 · A chegada

**Receção (escolha obrigatória no checkout):**

| Serviço | Preço | Cobrança | Confirmação |
|---|---|---|---|
| Self check-in | Incluído | — | — |
| Receção presencial | 50 € | por estadia | imediata |
| Receção presencial após as 21h | 90 € | por estadia | imediata |

**Transfers (carro privado; sujeitos a disponibilidade em datas de pico):**

| sku | Serviço | Preço | Cobrança | Notas |
|---|---|---|---|---|
| `transfer-porto` | Transfer aeroporto do Porto | 120 € | por trajeto (máx. 4) | até 4 hóspedes; casas do norte |
| `transfer-porto-van` | Transfer aeroporto do Porto, van | 160 € | por trajeto (máx. 4) | até 8 hóspedes; casas do norte |
| `transfer-lisbon` | Transfer aeroporto de Lisboa | 280 € | por trajeto (máx. 4) | até 4 hóspedes; casas do sul; preço indicativo |
| `transfer-lisbon-van` | Transfer aeroporto de Lisboa, van | 350 € | por trajeto (máx. 4) | até 8 hóspedes; casas do sul; preço indicativo |

No site o hóspede vê um seletor único "Aeroporto de chegada" (Porto/Lisboa) conforme a região da casa.

## Capítulo 2 · A mesa

| sku | Serviço | Preço | Cobrança | Confirmação | Notas |
|---|---|---|---|---|---|
| `breakfast-box` | Breakfast box | 25 € | por pessoa/dia | imediata | pequeno-almoço fresco entregue nas manhãs escolhidas |
| `private-chef` | Chef privado ao jantar | 95 € | por pessoa (mín. 4) | **24 h** | menu combinado com o concierge; capacidade limitada |
| `grocery-setup` | Compras feitas e entregues | 120 € | por estadia | imediata | fazemos as compras da lista do hóspede; **conta do supermercado à parte, ao custo** |

## Capítulo 3 · A casa

| sku | Serviço | Preço | Cobrança | Confirmação | Notas |
|---|---|---|---|---|---|
| `daily-cleaning` | Limpeza diária | **por casa** (ver tabela) | por limpeza (qty) | imediata | refresh WC+cozinha, camas feitas; roupa mudada a cada 4 noites |
| `deep-cleaning` | Limpeza profunda | **por casa** (ver tabela) | por limpeza (qty) | imediata | limpeza de alto a baixo, toda a roupa mudada |
| `babysitter` | Babysitter | 20 € | por criança/hora | **24 h** | apoio em casa, à hora |
| `travel-crib` | Berço de viagem | 1.º incluído; extra 25 € | por unidade (máx. 3) | imediata | montado antes da chegada; entra sempre no manifesto de operações |
| `baby-chair` | Cadeira de bebé | 1.ª incluída; extra 25 € | por unidade (máx. 3) | imediata | à mesa à chegada |
| `pet-fee` | Trazer animal de estimação | 50 € o 1.º · 100 € o 2.º (total 150 €) | escalões, máx. 2 | imediata | **só em casas pet-friendly (gate ligado ao Guesty)** |
| `pet-kit` | Kit pet, cama e taças | 25 € | por estadia | imediata | só aparece depois de adicionar o animal |
| `pet-food` | Comida para o animal | sob orçamento | — | concierge | marca e dieta indicadas pelo hóspede |

**Limpezas — preço por tipologia (fallback):**

| Quartos | Diária | Profunda |
|---|---|---|
| T1 | 25 € | 80 € |
| T2 | 45 € | 120 € |
| T3 | 65 € | 165 € |
| T4 | 85 € | 240 € |
| T5 | 105 € | 295 € |
| T6 | 125 € | 300 € |
| T7 | 145 € | 325 € |
| T8 | 165 € | 360 € |
| T9 | 185 € | 410 € |
| T12 | 250 € | 485 € |

55 casas têm preço direto por listing (gerado do Excel "P.A Ops Revamp", folha Cleaning Rates, 12 jul 2026 — ex.: Villa Aura 105/295, Nature QPA 85/235, a T12 250/485). Fonte no repo: `server/config/cleaning-rates.ts`; para o CRM, importa a tabela por casa desse ficheiro. Quando a ops atualizar o Excel, o ficheiro regenera-se.

## Capítulo 4 · Bem-estar

| sku | Serviço | Preço | Cobrança | Confirmação |
|---|---|---|---|---|
| `massage` | Massagem na casa | 90 € | por pessoa/sessão (60 min) | **24 h** |
| `private-yoga` | Sessão de yoga privada | 60 € | por pessoa/sessão | **24 h** |
| `personal-trainer` | Personal trainer | 55 € | por pessoa/sessão | **24 h** |

## Capítulo 5 · Experiências (sempre sob orçamento — pedido vai ao concierge)

| sku | Experiência | Desde | Notas |
|---|---|---|---|
| `exp-sup` | Stand up paddle | 45 € | águas calmas, equipamento incluído |
| `exp-canyoning` | Canyoning | 65 € | rios e cascatas com guia |
| `exp-ebike` | Passeio de bicicleta elétrica | 55 € | campo com guia |
| `exp-horseback` | Passeio a cavalo | 75 € | trilhos da região |
| `exp-buggy` | Experiência de buggy Can Am | 120 € | fora de estrada |
| `exp-hikedive` | Caminhada, mergulho e mesa | 95 € | trilho + água + mesa, dia completo |
| `exp-biketour` | Passeio de bicicleta, cidade e montanha | 45 € | duas rodas, cidade às colinas |

## Flex (remarcação garantida — NUNCA se chama "seguro")

- **Preço: 10% do valor das noites**, arredondado ao euro (piso 250 € se a quote não tiver noites; só aparece em estadias ≥ 1 500 €).
- Remarca até **7 dias** antes do check-in, sem custo; valor pago protegido; crédito válido **18 meses** em qualquer casa do portefólio.
- No CRM: tratar como flag da reserva (sim/não + valor), não como serviço agendável.

## Incluído em todas as estadias (aparece no site, sem preço)

Concierge dedicado 24/7 · roupa de cama premium, roupões e toalhas de piscina · kit de boas-vindas com produtos locais · melhor preço garantido na reserva direta.

## Regras de curadoria do site (úteis para o motor de cross/upsell do CRM)

- Estadia **≥ 5 noites** → limpeza diária sobe no ranking; stepper sugere `noites ÷ 2` limpezas.
- **≥ 6 hóspedes** → chef privado e transfer van sobem.
- **Crianças na reserva** → berço e cadeira de bebé sobem para o topo.
- **Casa pet-friendly** → taxa de animais fica sempre visível (quem traz animal tem de a declarar).
- **Região costeira** (Minho, Porto, Lisboa, Algarve…) → experiências de água (SUP, canyoning, hike & dive) sobem; interior → terra (e-bike, cavalo, buggy). **Verão (mai–set)** reforça água; resto do ano reforça terra.
- Nada é pré-selecionado — as regras só ordenam e sugerem quantidades.

## Regras de dinheiro (invioláveis — o CRM tem de as respeitar)

1. **Extras nunca entram na reserva Guesty** — só a estadia. Os serviços são receita Portugal Active, cobrados no pagamento único da plataforma (a "conta separada" que protege o split com os owners).
2. Linhas "confirmação 24 h" não entregáveis → **reembolso automático só dessa linha**, no pagamento original.
3. O código de confirmação apresentado ao hóspede é **sempre o do Guesty** (GY-…).
4. Experiências e `pet-food` nunca são cobradas no checkout — orçamento do concierge.

## Descontinuados (não importar para o CRM)

`hamper-essentials` (Cabaz essenciais) · `hamper-gourmet` (Cabaz gourmet) · `grocery-list` (Frigorífico pronto) — substituídos pelo `grocery-setup` a 12 jul · `linen-change` (Muda de lençóis) — removido do catálogo; a muda está incluída na limpeza diária/profunda.

## Preparado mas inativo

Bundles de chegada (ex.: receção presencial + transfer + compras por preço fechado) — o modelo existe no código (`CHECKOUT_BUNDLES`), à espera de decisão de desconto para ativar. Bom candidato a pacote de upsell no CRM quando quiseres.
