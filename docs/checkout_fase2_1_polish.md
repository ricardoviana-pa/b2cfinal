# Fase 2.1 revista: direção configurador para o passo Personalizar

Brief de execução para Claude Code. Substitui integralmente a versão anterior deste ficheiro (a da grelha de cards fotográficos). Complementa docs/checkout_spec.md. Âmbito: apenas apresentação e conteúdo do passo 2; zero alterações de lógica de cobrança ou dados.

## 0. A decisão de direção

Referência: o configurador de compra da Apple. A Apple pagina o que é obrigatório (modelo, capacidade) e faz scroll no que é opcional; usa pouquíssimas imagens, tipografia enorme e opções apresentadas como texto elegante dentro de cartões de escolha. Aplicado ao nosso caso:

* A página continua a ser um único passo, mas organizada em capítulos que funcionam como atos: cada um ocupa quase um ecrã, com título grande, uma linha editorial e as opções por baixo. A sensação é de uma decisão de cada vez, sem a fricção de paginar.
* Uma nav de capítulos fixa no topo do passo (A chegada, A casa, A mesa, Bem estar, Experiências) com scrollspy: marca o capítulo ativo e permite saltar. Dá orientação e a leitura de etapas sem etapas. Inclui à direita o atalho "Saltar personalização".
* As opções deixam de ser cards fotográficos e passam a linhas tipográficas dentro de um cartão por grupo. A fotografia sai de quase todo o passo: fica reservada a onde vende emoção. A casa já é a imagem dominante no resumo lateral.

Porquê isto resolve os problemas atuais: elimina a dependência de 14 fotografias perfeitas (a causa número um do ar de MVP), remove o ruído visual, devolve o protagonismo à tipografia e ao espaço, e é um sistema que a IA executa sem inventar, porque não há decisões de gosto por tomar.

## 1. Estrutura da página

Ordem, que é a cronologia da estadia:
1. Abertura: título do passo em serif "Personalize a sua estadia", linha de contexto "Selecionado para NOME DA CASA", e o bloco Incluído na sua estadia reduzido a uma única linha discreta de 4 itens com ícones de traço (sem caixa).
2. Nav de capítulos fixa (sticky) com scrollspy.
3. Capítulo 01 A chegada: decisão obrigatória de receção primeiro, depois o grupo de transfers.
4. Capítulo 02 A casa: limpeza diária, muda de roupa e toalhas; babysitter em ver mais.
5. Capítulo 03 A mesa: chef como destaque, cabazes no grupo, lista de compras como pedido.
6. Capítulo 04 Bem estar: massagem e yoga; treino em ver mais.
7. Capítulo 05 Experiências: 3 produtos reais do Bókun, mais "Ver todas as experiências".
8. Fecho: bloco Flex e CTA.

Dentro de cada capítulo a ordem é sempre: decisão (se existir), grupo de opções com preço, pedidos sob orçamento no fim.

## 2. Tipografia dos capítulos (o destaque pedido)

* Overline: "Capítulo 01" em caps 12px, letterspacing 0.14em, cor bronze.
* Título: Cormorant Garamond 44 a 52px no desktop, 32px no mobile, peso 400, uma linha.
* Linha editorial: DM Sans 16 a 17px, cinza quente, logo abaixo.
* Espaço: 96 a 120px antes de cada capítulo, 32px entre o cabeçalho e o primeiro elemento. Cada capítulo deve respirar como um ato, não como uma secção de formulário.

## 3. Componentes

### 3.1 Decisão de receção
Par de cartões exatamente iguais entre si, lado a lado (empilhados no mobile), semântica de radio, sem imagem. Título 15px peso 500, valor à direita ("Incluído" em caps bronze ou preço), duas linhas de descrição 13px. Selecionado: borda 1.5px escura e fundo areia. É o único elemento com obrigação de escolha e o estado selecionado tem de ser inequívoco.

### 3.2 Grupo de opções (o componente base)
Um cartão por grupo com linhas separadas por hairlines internas. Cada linha: título 15px peso 500 e descrição 13px à esquerda; preço 14px com unidade 12px cinza e pill "Adicionar" à direita. Estado adicionado: fundo da linha em tom areia, check bronze junto ao título, resumo da seleção na descrição (por exemplo "2 mudas · 90 €"), steppers no lugar da pill. Itens sob orçamento usam a mesma linha com "Orçamento pelo concierge" no lugar do preço e pill "Pedir".

### 3.3 Destaque com imagem (máximo 1 por capítulo, e só onde a imagem vende)
Cartão de largura total com imagem 3:2 à esquerda a 40%. Usos permitidos: chef em A mesa (fotografia real de private chef dining já existente no site) e nada mais nos capítulos 01 a 04. Sem asset aprovado, o destaque rende como linha normal.

### 3.4 Experiências
Única zona fotográfica do passo: 3 cartões em linha (scroll horizontal no mobile) com a fotografia real do produto Bókun, nome real, preço desde real. Zero placeholders inventados.

### 3.5 Flex
Mantém o cartão diferenciado de fecho (fundo tintado, título serif 22px, três benefícios, copy contextual por tarifa), alinhado aos tokens de radius e padding dos grupos.

## 4. Política de imagem

Todo o passo 2 tem no máximo 5 fotografias: a da casa no resumo lateral, a do chef, e as 3 dos produtos Bókun. Mantém se a regra absoluta da versão anterior: proibido stock e imagem gerada; todas as imagens servem do domínio próprio ou do CDN do Bókun; sku sem asset aprovado fica sem imagem. A sessão fotográfica de 6 imagens continua válida para o site e para a fase seguinte, mas deixa de bloquear o checkout.

## 5. Movimento e orientação

* Scrollspy na nav de capítulos, com âncoras e scroll suave.
* Entrada de cada capítulo com fade e subida de 12px em 300ms, uma única vez, respeitando prefers reduced motion.
* Adicionar um item atualiza o total da barra ou do resumo com a contagem animada já prevista no spec.
* Sem parallax, sem sticky de imagens, sem efeitos: a sofisticação está no ritmo e no espaço.

## 6. Critérios de aceitação

1. Nav de capítulos fixa com estado ativo correto durante o scroll e salto por clique.
2. Títulos de capítulo em serif com 44px ou mais no desktop e overline numerada; 96px ou mais de espaço antes de cada capítulo.
3. Máximo 5 fotografias em todo o passo 2, todas de domínio próprio ou Bókun; zero stock e zero geradas (verificável no separador de rede).
4. Todas as opções em linhas de grupo com hairlines, rodapés e pills alinhados; uma única anatomia de linha.
5. Decisão de receção obrigatória com estado selecionado inequívoco; "Saltar personalização" sempre visível na nav.
6. Máximo 3 itens visíveis por capítulo antes de "Ver mais"; experiências com nome, foto e preço desde do Bókun real.
7. Copy sem travessões nem hífenes nas 9 línguas.
8. Screenshots no PR: desktop 1440 e mobile 390, passo completo, antes e depois.

## 7. Prompt para o Claude Code

"Lê docs/checkout_spec.md e docs/checkout_fase2_1_polish.md (direção configurador, que substitui a grelha de cards fotográficos). Executa apenas esta fase. Antes de escrever código: lista os componentes atuais do passo 2 e o plano de consolidação para os componentes das secções 3.1 a 3.5, e o mapa das 5 imagens permitidas com a origem de cada uma. É proibido introduzir imagens de stock ou geradas. No fim, valida os 8 critérios de aceitação um a um com evidência."
