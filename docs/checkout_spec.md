# Checkout Portugal Active 2.0

Especificação de produto e engenharia. Documento de trabalho para execução em Claude Code.
Repositório: ricardoviana-pa/b2cfinal. Versão 1.1, 10 de julho de 2026. Baseado na auditoria de 4 de julho, no funil ao vivo e no levantamento do código real (BookingWidget de 1291 linhas, booking-flow.ts, RatePlanCards, CheckoutPaymentForm).

Como usar: colar este ficheiro em `docs/checkout_spec.md` no repositório. Executar por fases (secção 16). Cada fase entra em produção sozinha.

Respostas às três perguntas em aberto do levantamento técnico:
1. O Flex é por reserva, valor fixo de 250 €. Nunca por noite.
2. O Flex está disponível nos dois rate plans, com copy contextual. Não substitui a política de cancelamento: acrescenta um direito de remarcação com crédito. Detalhe completo na secção 6.
3. Serviços, experiências e Flex pagam num único pagamento com um único total. Nunca dois pagamentos. Caminho técnico na secção 7.

---

## 1. Objetivo e métricas

Transformar o fluxo de reserva num checkout fullscreen de 3 passos que capta o email cedo, vende serviços e experiências, oferece o Flex e elimina os sinais de desconfiança identificados na auditoria (enum cru, cêntimos, garantia ausente do pagamento).

Métricas de sucesso, por ordem:
* Taxa de conclusão quote a purchase. Baseline desconhecida hoje: a Fase 0 instala os eventos que a medem.
* Taxa de captura de email sobre sessões que chegam à quote.
* Attach rate de extras e receita adicional por reserva.
* Attach rate do Flex por escalão de valor e por rate plan.
* Receita por sessão no funil.

## 2. Princípios

* Airbnb: uma decisão por ecrã, resumo sempre visível, zero ruído de navegação.
* Le Collectionist: a personalização é parte da experiência de luxo, não uma venda agressiva.
* Marca Portugal Active: preços redondos ao euro, linguagem humana, serif editorial, nenhum vocabulário de channel manager.
* Nada selecionado por defeito. Sem dark patterns. Urgência apenas quando é real (a validade da quote é real: o backend mantém a quote viva 23 horas).

## 3. Arquitetura do fluxo

Estado atual confirmado no código: não existe página de checkout; tudo vive no BookingWidget com 5 steps (dates, quote, details, payment, success), estado em localStorage via booking-flow.ts, rate plans já implementados em RatePlanCards, breakdown de preço existente, e apenas a rota de confirmação `/booking/confirmation/:id`.

Divisão de responsabilidades no novo desenho:
* O BookingWidget mantém na página da propriedade apenas: datas, hóspedes, quote com rate plans resumidos e CTA Reservar. É o ponto de entrada.
* O CTA cria um BookingIntent no servidor a partir da quote Guesty e navega para a rota nova.
* Os steps details, payment e success saem do widget e passam a viver na página de checkout.

Rota: `/:lang/checkout/:intentId`

Mapeamento dos steps atuais para o novo fluxo: dates e quote ficam no widget; details divide entre o passo 1 (email) e o passo 3 (restantes dados); payment é o passo 3; success passa a página de agradecimento refeita.

Modo fullscreen:
* Sem header de navegação e sem footer. Topo mínimo: logótipo, indicador dos 3 passos, nota "guardado automaticamente", X que devolve à página da casa.
* Desktop: coluna de conteúdo à esquerda (máximo 640px) e resumo fixo à direita (380px) com foto da casa, datas, hóspedes, linhas de preço e total.
* Mobile: cada passo ocupa o ecrã, barra inferior fixa com o total e o botão de continuar, resumo completo em bottom sheet expansível.

Passos:
1. A sua estadia
2. Personalizar
3. Pagamento

Persistência: o localStorage atual continua como cache da fase de widget. A partir da entrada no checkout, a fonte de verdade é o intent no servidor, sincronizado a cada mutação. Sem servidor não há retoma noutro dispositivo nem recuperação por email, que são metade do valor deste projeto.

Preço garantido: mostrar "Preço garantido até amanhã às HH:MM" alinhado com a expiração real da quote. Nenhum contador agressivo.

Compatibilidade: o fluxo atual permanece em produção atrás de uma feature flag (`checkout_v2`) até o novo ter paridade e números melhores.

## 4. Passo 1: A sua estadia

* Recap editável: datas e número de hóspedes reabrem calendário e seletor inline, sem sair do checkout. Alterar datas gera nova quote.
* Rate plan: reutilizar RatePlanCards aqui. Escolha entre tarifa flexível e tarifa não reembolsável, com o diferencial de preço visível e a condição de cancelamento de cada uma em texto humano com data concreta. O breakdown atualiza com a escolha.
* Breakdown de preço limpo: estadia (n noites), serviço de preparação da casa (nunca "final cleaning" avulso), impostos, total. Tudo redondo ao euro.
* Captura de email no fim do passo. Label: "O seu email". Texto de apoio: "Guardamos a sua reserva por 24 horas e enviamos o orçamento. Sem spam." Email obrigatório para avançar. Ao submeter: evento `add_contact_info`, lead gravado no servidor, arranque da automação de recuperação.
* CTA: Continuar.

Racional: a auditoria confirmou zero captura de lead antes do pagamento (F3). O email no passo 1 é a correção estrutural. O custo de fricção é baixo porque o utilizador já demonstrou intenção ao abrir o checkout.

## 5. Passo 2: Personalizar a estadia

Catálogo de serviços por categoria. Cards com imagem pequena, título, descrição de uma linha, preço com modelo explícito e stepper de quantidade ou toggle.

Modelos de preço (`pricing_model`):
* `per_stay`: valor único pela estadia.
* `per_day`: valor por dia, com seletor de dias ou aplicação automática a todas as noites.
* `per_person`: valor por pessoa.
* `per_unit`: valor por unidade com stepper.
* `per_person_per_unit`: pessoas e sessões (ex: massagens).
* `on_request`: sem preço, cria pedido ao concierge.

Modelos de entrega (`fulfillment`):
* `instant`: entra diretamente no manifesto de operações.
* `needs_confirmation`: cobrado no checkout, confirmado pela equipa em 24 horas, reembolso automático da linha se for impossível. Badge no card: "Confirmação em 24 horas".
* `on_request`: sem cobrança, cria tarefa de concierge após a reserva.

### Catálogo de lançamento

Preços indicativos. Confirmar valores e capacidade de entrega com a Susana e o Diogo antes de produção.

Chegada
* Check in presencial com tour da casa: incluído, com escolha de janela horária. Chegada após as 21h: 50 €.
* Transfer aeroporto do Porto: 120 € por trajeto até 4 pessoas, 160 € em van até 8. Quantidade em trajetos.

Casa
* Limpeza diária: 60 € por dia, com seletor de dias.
* Muda completa de lençóis e toalhas: 45 € por muda, com stepper de quantidade.

Mesa
* Chef privado ao jantar: desde 95 € por pessoa, mínimo 4 pessoas. Seleção de pessoas e data preferida. `needs_confirmation`.
* Cabaz de boas vindas essenciais: 75 €. Cabaz gourmet regional: 150 €. Lista de compras personalizada: `on_request`.

Bem estar
* Massagem na casa: 90 € por pessoa, sessão de 60 minutos. Pessoas e número de sessões. `needs_confirmation`.

Experiências
* 3 a 6 cards curados pela região da casa: surf, kitesurf, vinho verde, património. Na V1 ficam `on_request` para não bloquear o lançamento. Na V2, disponibilidade em tempo real via Bókun (integração já existe no site).

Regras de UX do passo:
* Nada selecionado por defeito.
* Badge "Mais escolhido" no máximo em 2 itens.
* Cada adição anima em direção ao resumo e o total atualiza com contagem.
* O passo fecha com o bloco Flex (secção 6).

## 6. Flex: remarcação garantida

Nota legal prévia, importante: nunca usar a palavra seguro. Vender proteção contra um risco mediante um prémio, com esse nome, cai no regime de distribuição de seguros supervisionado pela ASF e exige habilitação que a empresa não tem. Estruturado como opção tarifária do próprio serviço (como as tarifas flexíveis das companhias aéreas), o produto é do operador e o problema desaparece. Validar o copy final e os termos com o André Feiteiro antes de produção.

Proposta comercial:
* Nome: Flex.
* Frase: "Remarque quando quiser. O valor que pagou nunca se perde."
* Preço: 250 € por reserva, valor fixo, pagos no checkout. Não é por noite. Valor não reembolsável e não convertível em crédito.

Regras v1:
1. Remarcação sem custo até 7 dias antes do check in, sem limite de vezes, com uma reserva ativa de cada vez. Um único Flex cobre todas as remarcações subsequentes dentro da validade do crédito; nunca se paga segunda vez.
2. O que fica protegido é o valor pago da estadia, não as datas nem a casa. Os preços dinâmicos em vigor aplicam nas novas datas.
3. Ao remarcar, o valor pago converte em crédito válido por 18 meses a contar do check in original, utilizável em qualquer casa do portefólio.
4. Nova estadia mais cara: o hóspede paga a diferença. Mais barata: o saldo permanece em crédito. Nunca existe reembolso em dinheiro.
5. Extras remarcam junto quando o serviço o permitir; caso contrário o valor dos extras converte também em crédito.
6. O Flex compra apenas no checkout. V2: janela de 72 horas após a reserva, por email.

### Interação com os rate plans

O Flex está disponível nas duas tarifas e não substitui a política de cancelamento: são camadas diferentes. A política do rate plan escolhido continua a reger o cancelamento com reembolso em dinheiro. O Flex acrescenta um direito de remarcação com crédito que vive para lá dessa política.

* Tarifa não reembolsável + Flex: o par natural e o de maior valor percebido. O hóspede fica com o melhor preço e com a garantia de nunca perder o valor. Copy no card: "Escolheu o melhor preço. Com Flex, o valor nunca se perde: remarque até 7 dias antes do check in." Attach esperado mais alto aqui; medir por rate plan.
* Tarifa flexível + Flex: o Flex prolonga a proteção para lá da janela de cancelamento gratuito. Copy contextual: "A sua tarifa permite cancelamento gratuito até DATA. Depois dessa data, o Flex garante que remarca até 7 dias antes sem perder o valor."
* Regra de honestidade operacional: se o hóspede contacta dentro da janela de cancelamento gratuito da tarifa flexível, devolve dinheiro conforme a política. Nunca empurrar crédito quando o reembolso em dinheiro é um direito. Sem exceções: uma reclamação pública sobre isto destrói o produto.
* A reserva remarcada escolhe rate plan de novo às condições do momento. O crédito abate ao total da nova reserva independentemente do plano escolhido.

UI: card destacado no fim do passo 2. Moldura fina, ícone de calendário, três benefícios em linha curta, toggle Adicionar, link "Como funciona" que abre modal com as regras completas. Diferenciação visual clara face aos extras: isto é proteção, não serviço.

Operação v1: a remarcação é tratada pelo concierge. O email de confirmação inclui um botão Remarcar que abre formulário ou WhatsApp. O servidor mantém o ledger de créditos. Self service de remarcação só em V2.

Tensão de preço a resolver (ver secção 15): 250 € fixos numa reserva de 900 € são 28 por cento do valor e não vendem; numa reserva de 5000 € são 5 por cento e a decisão é óbvia. Recomendação: lançar com preço fixo mas mostrar o Flex apenas em reservas acima de 1500 €, medir o attach por escalão e decidir depois entre fixo, limiar diferente ou percentagem com mínimo.

## 7. Passo 3: Pagamento

* Dados do hóspede: nome completo, telefone, país. Email já preenchido do passo 1. NIF opcional para faturação portuguesa.
* Bloco de reserva direta imediatamente acima do pagamento (finding D1 da auditoria): melhor preço garantido, concierge incluído, sem taxas de reserva, com link para a página de termos da garantia.
* Confiança: referência explícita ao processamento seguro e cifragem, e política de cancelamento da tarifa escolhida repetida em texto humano junto ao botão.
* Botão com o total: "Confirmar e pagar 3 450 €".

### Um pagamento, um total

Decisão de produto fechada: estadia, extras e Flex cobram num único pagamento com um único total. Dois pagamentos no mesmo checkout matam conversão e duplicam a superfície de falha.

Estado real do código: cartão via tokenização Guesty, com Klarna e PayPal cobrados fora e registados na reserva como pagos externamente. A auditoria referia um PaymentElement Stripe com wallets configurados; o levantamento atual fala em tokenização Guesty. Primeiro passo técnico da Fase 2: confirmar no código qual é exatamente o fluxo de cada método e onde vivem os wallets, antes de decidir onde ligar Apple Pay e Google Pay.

Caminho técnico preferido:
* Fluxo cartão (Guesty): criar a reserva com os extras e o Flex como invoice items adicionais, para que a cobrança única do Guesty inclua tudo. Requer validação da API Guesty (spike de 30 minutos na Fase 1: criar reserva de teste com invoice items custom).
* Fluxos Klarna e PayPal (já cobrados fora): somar extras e Flex ao montante cobrado e registar o total como pago externamente, como já acontece com a estadia.

Fallback, se os invoice items não forem possíveis na criação: um único charge externo para tudo (estadia incluída), reserva marcada como paga fora do Guesty. É o padrão que o Klarna já usa; passa a ser o padrão de todos os métodos.

Reembolsos de extras `needs_confirmation` seguem a origem da cobrança: reembolso parcial no Guesty ou no processador externo, conforme o método usado.

Após pagamento confirmado: reserva criada ou confirmada no Guesty, manifesto de extras enviado a operações, e a página de agradecimento refeita com os tokens da marca (finding S4) mostrando estadia, extras, Flex e próximos passos.

## 8. Resumo da encomenda

Linhas: estadia com número de noites e tarifa escolhida, cada extra com quantidade, Flex, impostos, total. Editar e remover inline. Desktop: coluna fixa. Mobile: bottom sheet. A foto da casa permanece sempre visível como âncora emocional da compra.

## 9. Design

* Tipografia: aplicar os tokens propostos na secção 6 da auditoria. Cormorant Garamond nos títulos (peso 400), DM Sans no corpo (300 a 600). O peso 700 nunca se usa porque não é carregado.
* Preços sempre redondos ao euro em todo o checkout.
* Espaço branco generoso, uma coluna de conteúdo, imagens apenas onde vendem (cards de extras, foto da casa).
* Sem popups, sem contadores agressivos, sem "3 pessoas estão a ver".
* Motion discreto: transição entre passos de 200 ms, total com contagem animada.

## 10. Modelo de dados

`booking_intents`
* id, property_id, guesty_quote_id, check_in, check_out, guests
* rate_plan (flexible ou non_refundable, mais o id do plano)
* email, phone, name, nif
* extras (jsonb com sku, quantidade, pessoas, datas preferidas)
* flex (boolean)
* amounts: stay, extras, flex, taxes, total; currency
* status: draft, contact_captured, payment_pending, paid, expired
* locale, created_at, updated_at, expires_at

Nota de migração: o intent nasce quando o utilizador entra no checkout, alimentado pelo estado que hoje vive no localStorage (booking-flow.ts). O localStorage fica como cache do widget; deixa de ser fonte de verdade a partir daí.

`extras_catalog`
* id, sku, category, name e description em i18n, pricing_model, unit_price, min_qty, max_qty, fulfillment, scope (global, região ou propriedade), active

`flex_credits` e `flex_credit_events`
* crédito: id, booking_id, amount, balance, expires_at, status
* eventos: ledger de todos os movimentos (criação, consumo, expiração)

`leads`
* email, intent_id, source, consent, created_at

Persistência: se o projeto ainda não tem base de dados própria, usar Postgres gerido (Render Postgres, ou Supabase que já existe no ecossistema Portugal Active). Decisão na secção 15.

## 11. API

* `POST /api/checkout/intents` cria o intent a partir da quote Guesty e do estado do widget
* `GET /api/checkout/intents/:id` devolve o estado completo
* `PATCH /api/checkout/intents/:id` atualiza email, rate plan, extras, flex e dados do hóspede
* `POST /api/checkout/intents/:id/payment` inicia a cobrança do total pelo método escolhido
* `POST /api/webhooks/payment` na confirmação: Guesty, manifesto, emails
* `GET /api/extras?property_id=` catálogo aplicável à casa

Idempotência nos endpoints de escrita. Expiração do intent alinhada com a quote Guesty.

## 12. Integrações e operações

* Guesty: o fluxo de reserva atual mantém. Extras e Flex entram como invoice items na reserva se a API o permitir; caso contrário, cobrança externa única e registo como pago fora (secção 7).
* Operações: mensagem automática no canal Slack de operações por cada reserva paga, com manifesto de extras e prazos. Extras `needs_confirmation` criam tarefa com deadline de 24 horas.
* Emails transacionais: confirmação com estadia, extras e Flex; recuperação de checkout (1 hora após abandono com link de retoma; 20 horas depois com "o seu preço termina hoje"); confirmação ou reembolso de cada extra pendente.

## 13. Analytics

Eventos GA4 e Meta, com CAPI server side onde possível:
* quote_viewed, begin_checkout, add_contact_info
* rate_plan_selected com o plano como parâmetro
* add_to_cart e remove_from_cart por extra (item_id igual ao sku)
* flex_viewed, flex_added
* add_payment_info, purchase com o array items completo (estadia, extras, Flex)
* checkout_resume, whatsapp_click

Este é o finding F7 da auditoria e é requisito prévio de tudo o resto: sem funil medido não há otimização, só opinião.

## 14. Estados de erro e casos limite

* Quote expira a meio do checkout: banner com botão para gerar nova quote; extras e dados mantêm.
* Disponibilidade perdida: novo recheck no Guesty ao entrar no passo 3; se as datas caíram, ecrã de recuperação com casas semelhantes e contacto de concierge com um clique.
* Pagamento confirmado mas criação no Guesty falha: fila com retry e alerta no Slack. Nunca deixar dinheiro cobrado sem reserva criada.
* Retorno de redirects (Klarna, PayPal): retomar o intent pelo id.
* Moeda: apenas EUR na V1.
* i18n: as 9 línguas desde o primeiro dia. Datas formatadas pela locale ativa do i18next e não pela do browser (finding F6).

## 15. Decisões

Fechadas nesta versão:
* Flex por reserva, 250 € fixos. Não é por noite.
* Flex disponível nos dois rate plans, com copy contextual e sem substituir a política de cancelamento.
* Pagamento único para estadia, extras e Flex.

Em aberto para o Ricardo:
1. Flex: visível em todas as reservas ou apenas acima de 1500 €. Recomendação: limiar de 1500 € e medir por escalão.
2. Prazo mínimo de remarcação: 7 dias antes do check in (recomendado) ou 48 horas (mais generoso, mais risco operacional).
3. Validade do crédito: 18 meses (recomendado) ou 12.
4. Preços e seleção final dos extras de lançamento: validar custos e capacidade com a Susana e o Diogo.
5. Extras `needs_confirmation`: cobrar já com reembolso automático (recomendado) ou cobrar só após confirmação.
6. MB Way e wallets: mapear o que o fluxo de pagamento real suporta (depende do resultado do spike da secção 7) e decidir o que entra na V1.
7. Base de dados: Postgres no Render ou Supabase.
8. Copy e termos do Flex validados pelo André antes de irem a produção.

## 16. Plano de execução em Claude Code

Fase 0. Requisitos prévios sobre o fluxo atual (1 sessão)
Corrigir no widget existente: política de cancelamento em texto humano nas 9 línguas (F1), preços redondos (F4), datas pela locale do site (F6), eventos de funil (F7), página de agradecimento com os tokens da marca (S4). Wallets: apenas levantar onde estão configurados hoje; a ativação decide na Fase 2.
Critério de aceitação: nenhum enum cru nem cêntimos em todo o funil; eventos no dataLayer confirmados em GTM preview.

Fase 1. Shell fullscreen, passo 1 e lead (1 a 2 sessões)
Rota nova atrás da flag `checkout_v2`, BookingIntent no servidor alimentado pelo booking-flow, extração dos steps details e payment do widget, RatePlanCards reutilizado no passo 1, resumo lateral e bottom sheet, captura de email, retoma por link. Inclui o spike Guesty: criar reserva de teste com invoice items custom e documentar o resultado.
Critério: reserva completa possível no novo fluxo sem extras; lead gravado; `add_contact_info` dispara; retoma por link funciona noutro dispositivo; resultado do spike documentado.

Fase 2. Extras e pagamento unificado (1 a 2 sessões)
Catálogo no servidor, cards por categoria, steppers, cobrança única conforme o resultado do spike, manifesto no Slack, emails de confirmação e reembolso de extras. Ativação de wallets no fluxo correto.
Critério: compra com 2 extras reflete na cobrança, no resumo, no email de confirmação e no Slack de operações; reembolso parcial de um extra testado.

Fase 3. Flex (1 sessão)
Produto, ledger de créditos, card e modal de regras, copy por rate plan, item no purchase.
Critério: reserva com Flex cria crédito com expiração correta; termos acessíveis no modal; evento e item de purchase corretos; copy muda com o rate plan.

Fase 4. Recuperação (1 sessão)
Emails de 1h e 20h com link de retoma; medição de `checkout_resume`.

Fase 5. Polimento e testes (contínuo)
Posição do bloco Flex, ordem das categorias, limiar de valor, copy. Uma variável de cada vez, com os eventos da Fase 0 como juiz.

Regra de disciplina: cada fase entra em produção sozinha. Não misturar fases no mesmo branch.

## 17. Prompt inicial sugerido para o Claude Code

"Lê docs/checkout_spec.md na íntegra. Executa apenas a Fase 0 (secção 16). Antes de escrever código, lista os ficheiros que vais tocar e o plano por finding. Não altera nada fora do âmbito da Fase 0. No fim, mostra como validar cada critério de aceitação."
