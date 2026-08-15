# Checkout Portugal Active 2.0

Especificação de produto e engenharia. Documento de trabalho para execução em Claude Code.
Repositório: ricardoviana-pa/b2cfinal. Versão 1.2, 11 de julho de 2026.

Alterações da v1.2, depois do teste à demo em dev.portugalactive.com: capítulos editoriais com fotografia e curadoria ligada ao catálogo real do site (secção 5), decisão fechada sobre express vs etapas obrigatórias (5.1), escolha obrigatória de receção com self check in incluído e presencial pago (5.2), correção do modelo de cobrança e da hierarquia do resumo (secção 7), venda antes da chegada (secção 12), regra de voz no copy (secção 9), novas decisões em aberto (secção 15).

Como usar: colar este ficheiro em `docs/checkout_spec.md` no repositório. Executar por fases (secção 16). Cada fase entra em produção sozinha.

---

## 1. Objetivo e métricas

Transformar o fluxo de reserva num checkout fullscreen de 3 passos que capta o email cedo, vende serviços e experiências, oferece o Flex e elimina os sinais de desconfiança identificados na auditoria. O objetivo estratégico é duplo: subir a perceção de valor do conceito private hotels e subir o ticket médio. As duas coisas ao mesmo tempo, nunca uma à custa da outra.

Métricas de sucesso, por ordem:
* Taxa de conclusão quote a purchase. Baseline desconhecida hoje: a Fase 0 instala os eventos que a medem.
* Taxa de captura de email sobre sessões que chegam à quote.
* Attach rate de extras e receita adicional por reserva, no checkout e antes da chegada.
* Attach rate do Flex por escalão de valor e por rate plan.
* Attach rate da receção presencial.
* Receita por sessão no funil.

## 2. Princípios

* Airbnb: uma decisão por ecrã, resumo sempre visível, zero ruído de navegação.
* Le Collectionist: a personalização é parte da experiência de luxo, não uma venda agressiva.
* Marca Portugal Active: preços redondos ao euro, linguagem humana, serif editorial, nenhum vocabulário de channel manager.
* Nada selecionado por defeito. Sem dark patterns. Urgência apenas quando é real.
* Generosidade antes do comércio: mostrar o que está incluído antes de vender o que é pago.

## 3. Arquitetura do fluxo

Estado atual confirmado no código: não existe página de checkout; tudo vive no BookingWidget com 5 steps (dates, quote, details, payment, success), estado em localStorage via booking-flow.ts, rate plans já implementados em RatePlanCards, breakdown de preço existente, e apenas a rota de confirmação `/booking/confirmation/:id`.

Divisão de responsabilidades:
* O BookingWidget mantém na página da propriedade apenas: datas, hóspedes, quote com rate plans resumidos e CTA Reservar. É o ponto de entrada.
* O CTA cria um BookingIntent no servidor a partir da quote Guesty e navega para a rota nova.
* Os steps details, payment e success saem do widget e passam a viver na página de checkout.

Rota: `/:lang/checkout/:intentId`

Modo fullscreen:
* Sem header de navegação e sem footer. Topo mínimo: logótipo, indicador dos 3 passos, nota "guardado automaticamente", X que devolve à página da casa.
* Desktop: coluna de conteúdo à esquerda (máximo 640px) e resumo fixo à direita (380px) com foto da casa, datas, hóspedes, linhas de preço e total.
* Mobile: cada passo ocupa o ecrã, barra inferior fixa com o total e o botão de continuar, resumo completo em bottom sheet expansível.

Passos:
1. A sua estadia
2. Personalizar
3. Pagamento

Persistência: o localStorage atual continua como cache da fase de widget. A partir da entrada no checkout, a fonte de verdade é o intent no servidor, sincronizado a cada mutação. Sem servidor não há retoma noutro dispositivo nem recuperação por email.

Preço garantido: mostrar "Preço garantido até DIA às HH:MM" alinhado com a expiração real da quote. Já implementado na demo; manter.

Compatibilidade: o fluxo atual permanece em produção atrás da feature flag `checkout_v2` até o novo ter paridade e números melhores.

## 4. Passo 1: A sua estadia

Implementado na demo e aprovado na estrutura. Manter:
* Recap editável de datas e hóspedes.
* Rate plans com poupança visível e condição de cancelamento em texto humano com data concreta.
* Breakdown limpo e redondo.
* Email obrigatório no fim do passo com o copy "Guardamos a sua reserva por 24 horas e enviamos o orçamento. Sem spam." Evento `add_contact_info` e lead no servidor.

Afinações:
* No desktop, o breakdown aparece duplicado na coluna esquerda e no resumo lateral. Manter só no resumo; a coluna esquerda fica com recap, tarifa e email.
* O aviso da tarifa não reembolsável em vermelho é alarmista. Usar o tom neutro da marca; a informação já é clara.

## 5. Passo 2: Personalizar a estadia

Um único passo com estrutura narrativa em capítulos, por scroll. Não são páginas separadas: a decisão está fechada em 5.1.

Abertura do passo: bloco "Incluído na sua estadia" com 3 ou 4 linhas do que já faz parte (concierge dedicado por WhatsApp, roupa de cama e toalhas de hotel, welcome pack, melhor preço garantido). Este bloco muda o enquadramento: os extras passam a ler como melhorias de uma base generosa e não como taxas escondidas. É a peça central da perceção de valor neste passo.

Capítulos, cada um com título em serif, uma linha editorial e cards com fotografia real:
* A chegada. Linha: "Da porta do avião à porta da casa." Contém a escolha obrigatória de receção (5.2) e os transfers.
* A casa. Linha: "O serviço de hotel, todos os dias que quiser." Limpeza diária, mudas de roupa e toalhas.
* A mesa. Linha: "O Minho cozinha para si." Chef, cabazes, lista de compras.
* Bem estar. Linha: "Descanso a sério." Massagens e tratamentos.
* Experiências. Linha: "A região, com quem a conhece." Produtos reais do site, curados por região (5.3).

Fecho do passo: bloco Flex (secção 6) e CTA que reflete o estado ("Continuar sem extras" ou "Continuar com N extras"), como já está na demo.

### 5.0 Itens de catálogo decididos a 12 de julho

* Berço de viagem e cadeira de bebé (capítulo A casa): o primeiro de cada é incluído mas exige seleção, porque a equipa precisa de saber para preparar a casa. Novo modelo de preço `included_selectable`: 0 € na primeira unidade, unidades adicionais a 25 €. Badge "Incluído" na linha; entra sempre no manifesto de operações. A curadoria promove estes itens para os visíveis quando a reserva tem crianças (requer o campo crianças no seletor de hóspedes, que o Guesty suporta).
* Animais (capítulo A casa): taxa de 45 € por estadia. Visibilidade condicionada pelo próprio listing Guesty: o item só existe quando a casa aceita animais. Ao adicionar a taxa, a linha revela extras pet por progressive disclosure: kit de cama e taças a 25 €, e comida para o animal por pedido (`on_request`).
* Late check out: decidido, não existe como produto. Uma noite seguinte vendável vale ordens de grandeza acima do valor do extra e o risco de conflito com chegadas é operacionalmente inaceitável.
* Early check in garantido: apenas como proposta condicionada (secção 15): só apareceria quando a noite anterior está livre no calendário Guesty, com venda instantânea e risco zero. Sem essa condição verificada, o item não é mostrado sequer.
* Grocery: os cabazes mantêm; "Lista de compras personalizada" é renomeada para vender o resultado, por exemplo "Frigorífico pronto à chegada".

### 5.1 Express vs etapas obrigatórias: decisão

Nem checkout express separado, nem sequência forçada de páginas ao estilo companhia low cost.

Racional económico: com ticket médio de 2000 a 5000 €, perder 1 a 2 pontos de conversão da reserva base por fricção custa mais do que todo o attach que essa fricção compra. Ilustração com números redondos: mais 6 pontos de attach a 120 € de média valem cerca de 7 € por reserva; menos 1,5 pontos de conclusão numa reserva de 2700 € custam cerca de 40 €. A assimetria é brutal e é o inverso da economia de uma aérea, onde o bilhete base é isco de margem baixa e o volume dilui a fricção.

Racional de marca: o padrão de páginas forçadas de upsell lê low cost. Destruiria a perceção private hotels no momento exato em que a queremos provar.

O que fica:
* Uma única decisão obrigatória, a receção (5.2). É a única mecânica de aérea que vale copiar: pergunta obrigatória com uma resposta incluída e uma resposta paga. Toda a gente responde, ninguém se sente vendido, e o attach é estrutural.
* Um único passo de personalização em capítulos, sempre saltável num clique.
* Um terceiro momento de venda fora do checkout: antes da chegada (secção 12). No luxo é aí que a maior parte da receita de serviços fecha. O checkout planta, o concierge colhe. Isto tira pressão de espremer tudo no checkout.

### 5.2 Receção: escolha obrigatória

No topo do capítulo A chegada, dois cards lado a lado. O hóspede tem de escolher um para concluir o passo; nenhum vem selecionado.

* Self check in. Incluído. Entrada autónoma com código, instruções enviadas na véspera, apoio por WhatsApp a qualquer hora.
* Receção presencial. 50 € (proposta; após as 21h, 90 €). Um anfitrião recebe os hóspedes, faz o tour da casa e deixa tudo a funcionar.

Tensão de marca a assumir conscientemente: cobrar pela receção humana pode ler contra o conceito private hotels. Mitigação: nomear e descrever como serviço com conteúdo (tour, apresentação, arranque da estadia), nunca como taxa de check in; e ponderar incluir de série nas casas de tier superior quando a arquitetura de gama existir. Preço final na secção 15.

O item atual da demo "Chegada depois das 21h" desaparece como extra avulso: o horário passa a modificador de preço da receção presencial.

### 5.3 Curadoria: ligação real ao catálogo do site

Uma única fonte de verdade. Os cards do checkout vêm do mesmo catálogo que alimenta as páginas de serviços e experiências do site, com os mesmos nomes, as mesmas fotografias e os mesmos preços. Zero conteúdo inventado só para o checkout: os placeholders genéricos da demo (por exemplo "Experiência de surf") são substituídos pelos produtos reais.

* Experiências: produtos reais do Bókun filtrados pela região da casa, com nome, fotografia e preço desde. V1 sob pedido; V2 com disponibilidade e compra em tempo real via Bókun.
* Regras de curadoria deterministas, sem ML, avaliadas no servidor a partir do intent:
  * Região costeira mostra surf e kitesurf; interior do Minho sobe vinho verde e património.
  * Estadias de 5 ou mais noites sugerem limpeza diária e muda de roupa com a quantidade já calculada no stepper (nunca pré selecionada; apenas o stepper certo à partida).
  * 6 ou mais hóspedes sobem chef privado e transfer van.
  * Mês da estadia filtra experiências sazonais.
* Máximo 6 cards por capítulo. Link "Ver todas as experiências" abre o catálogo completo sem sair do checkout.
* Linha de contexto no topo do passo: "Selecionado para a Abreu Retreat Palace". A curadoria só cria valor percebido se for visível.

Regras de UX que se mantêm da demo: nada pré selecionado, badge "Mais escolhido" no máximo em 2 itens, steppers de pessoas e quantidade ao adicionar, adição refletida no resumo.

## 6. Flex: remarcação garantida

Nota legal prévia, importante: nunca usar a palavra seguro. Vender proteção contra um risco mediante um prémio, com esse nome, cai no regime de distribuição de seguros supervisionado pela ASF e exige habilitação que a empresa não tem. Estruturado como opção tarifária do próprio serviço, o produto é do operador e o problema desaparece. Validar o copy final e os termos com o André Feiteiro antes de produção.

Proposta comercial:
* Nome: Flex.
* Frase: "Remarque quando quiser. O valor que pagou nunca se perde."
* Preço: 250 € por reserva, valor fixo, pagos no checkout dentro do total. Não é por noite. Valor não reembolsável e não convertível em crédito.

Regras v1:
1. Remarcação sem custo até 7 dias antes do check in, sem limite de vezes, com uma reserva ativa de cada vez. Um único Flex cobre todas as remarcações subsequentes dentro da validade do crédito.
2. O que fica protegido é o valor pago da estadia, não as datas nem a casa. Os preços dinâmicos em vigor aplicam nas novas datas.
3. Ao remarcar, o valor pago converte em crédito válido por 18 meses a contar do check in original, utilizável em qualquer casa do portefólio.
4. Nova estadia mais cara: o hóspede paga a diferença. Mais barata: o saldo permanece em crédito. Nunca existe reembolso em dinheiro.
5. Extras remarcam junto quando o serviço o permitir; caso contrário o valor dos extras converte também em crédito.
6. O Flex compra apenas no checkout. V2: janela de 72 horas após a reserva, por email.

Interação com os rate plans: disponível nas duas tarifas com copy contextual, como já está na demo (a caixa que explica a proteção depois da janela de cancelamento gratuito está correta e mantém). A política do rate plan continua a reger o cancelamento com reembolso em dinheiro; o Flex acrescenta remarcação com crédito. Regra de honestidade operacional: dentro da janela de cancelamento gratuito, devolve dinheiro, nunca crédito.

Tensão de preço a resolver (secção 15): 250 € numa reserva de 900 € são 28 por cento e não vendem; em 5000 € são 5 por cento. Recomendação: preço fixo com o Flex visível apenas em reservas acima de 1500 €, medir attach por escalão, decidir depois.

## 7. Passo 3: Pagamento

* Dados do hóspede: nome, apelido, telefone, país. Email já preenchido. NIF opcional. Já implementado na demo; manter.
* Bloco de reserva direta acima do pagamento: melhor preço garantido, concierge incluído, sem taxas de reserva. Já implementado; ligar ao destino da página de termos quando existir.
* Confiança: referência ao processamento seguro e política de cancelamento em texto humano junto ao botão. Já implementado.
* Botão com o total: "Confirmar e pagar 3 040 €".

### Um pagamento, um total: regra corrigida face à demo

Erro concreto observado na demo de 11 de julho: o resumo mostra Total 2700 € com o Flex de 250 € listado fora do total e os extras marcados como "não incluídos no pagamento de hoje". Um total que exclui linhas visíveis é um problema de confiança no passo mais sensível, e um checkout onde nada do que se vende é cobrado não sobe ticket nenhum: sobe intenções. Corrigir antes de qualquer tráfego real.

Regra simples:
* Tudo o que tem preço fixo cobra hoje e entra num único total: estadia, Flex, receção presencial, transfers, limpeza, mudas, cabazes, massagem e chef (o preço por pessoa é fixo).
* Itens `needs_confirmation` cobram hoje com reembolso automático da linha em 24 horas se a operação não conseguir entregar. Compromisso cobrado converte melhor do que intenção anotada, e o reembolso raro custa menos do que a receita perdida em pedidos que nunca se concretizam.
* Sob pedido, sem cobrança: lista de compras personalizada e experiências na V1. Aparecem no resumo abaixo do total, em secção própria "Pedidos ao concierge", sem valores somados e com nota de orçamento a seguir.
* Hierarquia do resumo: Estadia, Extras, Flex, Total de hoje. Uma linha de total, um número, tudo o que é cobrado lá dentro.

### Caminho técnico da cobrança

Estado real do código: cartão via tokenização Guesty, com Klarna e PayPal cobrados fora e registados como pagos externamente. Primeiro passo técnico da Fase 2: confirmar o fluxo exato de cada método e onde vivem os wallets antes de ligar Apple Pay e Google Pay.

* Fluxo cartão (Guesty): criar a reserva com extras e Flex como invoice items adicionais para cobrança única. Spike de 30 minutos na Fase 1: criar reserva de teste com invoice items custom e documentar.
* Fluxos Klarna e PayPal: somar extras e Flex ao montante cobrado fora e registar o total como pago externamente.
* Fallback se os invoice items não forem possíveis na criação: um único charge externo para tudo, reserva marcada como paga fora do Guesty, padrão que o Klarna já usa.
* Reembolsos seguem a origem da cobrança.

Após pagamento confirmado: reserva criada ou confirmada no Guesty, manifesto de extras para operações, página de agradecimento com os tokens da marca mostrando estadia, extras, Flex e próximos passos.

## 8. Resumo da encomenda

Linhas: estadia com noites e tarifa, receção escolhida, cada extra com quantidade, Flex, Total de hoje. Pedidos ao concierge em secção separada abaixo, sem valores. Editar e remover inline. Desktop: coluna fixa com a foto da casa sempre visível. Mobile: bottom sheet.

## 9. Design e voz

* Tipografia: tokens da auditoria. Cormorant Garamond nos títulos (400), DM Sans no corpo (300 a 600), nunca 700.
* Fotografia obrigatória nos cards de extras e experiências, rácio 3:2, com as mesmas imagens usadas no site. Uma lista de texto com ícones minúsculos lê como painel de definições de software; fotografia é o que transporta a marca para dentro do checkout. É a correção número um face à demo.
* Preços redondos ao euro. Espaço branco generoso. Sem popups nem contadores.
* Motion discreto: transição de passos 200 ms, total com contagem.
* Voz: o copy em português não usa travessões nem hífenes; a demo atual está cheia deles, incluindo na palavra check in. Rever todos os textos e fixar a regra nos ficheiros de locale. Vale para as 9 línguas o princípio de rever a pontuação contra a voz da marca.

## 10. Modelo de dados

`booking_intents`
* id, property_id, guesty_quote_id, check_in, check_out, guests
* rate_plan (flexible ou non_refundable, mais o id do plano)
* reception (self ou hosted, com janela horária)
* email, phone, name, nif
* extras (jsonb com sku, quantidade, pessoas, datas preferidas)
* requests (jsonb com pedidos sob orçamento)
* flex (boolean)
* amounts: stay, extras, flex, taxes, total; currency
* status: draft, contact_captured, payment_pending, paid, expired
* locale, created_at, updated_at, expires_at

`extras_catalog`
* id, sku, category, name e description em i18n, pricing_model, unit_price, min_qty, max_qty, fulfillment, scope (global, região ou propriedade), photo_url, bokun_product_id quando aplicável, curation_rules (jsonb), active

`flex_credits` e `flex_credit_events`
* crédito: id, booking_id, amount, balance, expires_at, status
* eventos: ledger de todos os movimentos

`leads`
* email, intent_id, source, consent, created_at

Persistência: Postgres gerido (Render Postgres ou Supabase). Decisão na secção 15.

## 11. API

* `POST /api/checkout/intents` cria o intent a partir da quote Guesty e do estado do widget
* `GET /api/checkout/intents/:id` devolve o estado completo
* `PATCH /api/checkout/intents/:id` atualiza email, rate plan, receção, extras, pedidos, flex e dados
* `POST /api/checkout/intents/:id/payment` inicia a cobrança do total pelo método escolhido
* `POST /api/webhooks/payment` na confirmação: Guesty, manifesto, emails
* `GET /api/extras?property_id=` catálogo curado para a casa, já ordenado pelas regras de curadoria

Idempotência nos endpoints de escrita. Expiração alinhada com a quote Guesty.

## 12. Integrações, operações e venda antes da chegada

* Guesty: fluxo de reserva atual mantém. Extras e Flex como invoice items se a API permitir; caso contrário cobrança externa única (secção 7).
* Bókun: fonte dos produtos de experiências, filtrados por região. V1 apenas conteúdo e pedido; V2 disponibilidade e compra.
* Operações: mensagem automática no Slack de operações por reserva paga, com manifesto e prazos. Itens `needs_confirmation` criam tarefa com deadline de 24 horas.
* Emails transacionais: confirmação com estadia, extras e Flex; recuperação de checkout (1 hora e 20 horas); confirmação ou reembolso de extras pendentes.
* Venda antes da chegada: email automático 10 dias antes do check in com os capítulos não comprados e link direto para adicionar ao mesmo intent, pago online; em paralelo, toque do concierge para chef e experiências. No luxo é neste momento que a maior parte dos serviços fecha, porque os planos da viagem já estão firmes. O checkout planta a semente; este ciclo colhe. Medir separadamente a receita de extras no checkout e antes da chegada.

## 13. Analytics

Eventos GA4 e Meta, com CAPI server side onde possível:
* quote_viewed, begin_checkout, add_contact_info
* rate_plan_selected, reception_selected com o tipo como parâmetro
* add_to_cart e remove_from_cart por extra (item_id igual ao sku), request_created para pedidos
* flex_viewed, flex_added
* add_payment_info, purchase com o array items completo
* checkout_resume, prearrival_addon_purchase, whatsapp_click

## 14. Estados de erro e casos limite

* Quote expira a meio: banner com botão para nova quote; extras e dados mantêm.
* Disponibilidade perdida: recheck no Guesty ao entrar no passo 3; se caiu, ecrã de recuperação com casas semelhantes e concierge a um clique.
* Pagamento confirmado mas Guesty falha: fila com retry e alerta no Slack. Nunca dinheiro cobrado sem reserva criada.
* Retorno de redirects (Klarna, PayPal): retomar o intent pelo id.
* Moeda: apenas EUR na V1.
* i18n: 9 línguas desde o primeiro dia, datas pela locale ativa do i18next.

## 15. Decisões

Fechadas:
* Flex por reserva, 250 € fixos, dentro do total de hoje.
* Flex nas duas tarifas, copy contextual, sem substituir a política de cancelamento.
* Pagamento único: tudo o que tem preço fixo cobra hoje num só total; só pedidos sob orçamento ficam fora.
* Nem express separado nem etapas forçadas: uma decisão obrigatória (receção), um passo de personalização saltável, venda antes da chegada como terceiro momento.
* Self check in incluído; receção presencial paga.

Em aberto para o Ricardo:
1. Preço da receção presencial: 50 € em horário normal e 90 € após as 21h são propostas. Validar contra o custo real de deslocação da equipa no Minho.
2. Receção presencial incluída de série nas casas de tier superior quando existir arquitetura de gama.
3. Flex: visível em todas as reservas ou apenas acima de 1500 €. Recomendação: limiar e medir.
4. Prazo mínimo de remarcação: 7 dias (recomendado) ou 48 horas.
5. Validade do crédito: 18 meses (recomendado) ou 12.
6. Preços e seleção final dos extras: validar custos e capacidade com a Susana e o Diogo.
7. MB Way e wallets: depende do spike de pagamento.
8. Base de dados: Postgres no Render ou Supabase.
9. Copy e termos do Flex validados pelo André.
10. Early check in garantido, condicionado ao calendário (só quando a noite anterior está vazia no Guesty, venda instantânea). Sim ou não.
11. Dispensa de caução (proteção de danos): decisão adiada até haver dados. Pedir à operação o histórico 2025 de incidentes (quantos, custo médio, quanto foi de facto recuperado via caução) antes de decidir. Piloto proposto: manter a caução como default e oferecer a dispensa como alternativa no passo 3 (39 a 49 € casas standard, 69 a 79 € tier superior, cobertura de danos acidentais até um limite por tier, exclusões para negligência, festas e fumo), medir um trimestre. Termos com o André antes de produção.

## 16. Plano de execução em Claude Code

Fase 0. Requisitos prévios no fluxo atual (1 sessão)
Política de cancelamento humana nas 9 línguas, preços redondos, datas pela locale, eventos de funil, página de agradecimento com tokens da marca.
Critério: nenhum enum cru nem cêntimos; eventos confirmados em GTM preview.

Fase 1. Shell fullscreen, passo 1 e lead (1 a 2 sessões)
Já materializada na demo. Falta: intent no servidor como fonte de verdade, retoma por link noutro dispositivo, remoção do breakdown duplicado, spike Guesty de invoice items documentado.
Critério: reserva completa sem extras; lead gravado; retoma cross device; spike documentado.

Fase 2. Capítulos, curadoria e pagamento unificado (2 sessões)
Catálogo no servidor com fotografias e produtos Bókun reais, bloco "Incluído na sua estadia", linhas editoriais, escolha obrigatória de receção, regras de curadoria, correção do total único, manifesto no Slack, emails de extras, wallets no fluxo correto.
Critério: compra com receção presencial e 2 extras reflete num único total, no resumo, no email e no Slack; cards com fotografia; curadoria muda com região e noites; reembolso parcial testado.

Fase 3. Flex em produção (1 sessão)
Ledger de créditos, Flex dentro do total, modal de regras, copy por tarifa, item no purchase, limiar de visibilidade configurável.
Critério: reserva com Flex cria crédito com expiração correta; Flex dentro do total de hoje; eventos corretos.

Fase 4. Recuperação e antes da chegada (1 sessão)
Emails de 1 hora e 20 horas com retoma; email de 10 dias antes do check in com compra de extras no mesmo intent; medição separada.
Critério: `checkout_resume` e `prearrival_addon_purchase` medidos; compra pós reserva funcional.

Fase 5. Polimento e testes (contínuo)
Posição do Flex, ordem de capítulos, limiar de valor, copy. Uma variável de cada vez.

Regra de disciplina: cada fase entra em produção sozinha. Não misturar fases no mesmo branch.

## 17. Prompt inicial sugerido para o Claude Code

"Lê docs/checkout_spec.md na íntegra, com atenção às alterações da v1.2. Executa apenas a fase que eu indicar. Antes de escrever código, lista os ficheiros que vais tocar e o plano. Não altera nada fora do âmbito da fase. No fim, mostra como validar cada critério de aceitação."
