# Correções pós auditoria de 12 de julho

Lista de execução para Claude Code. Resultado da auditoria ao demo em dev, fluxo completo testado no desktop 1440 (email, receção presencial, transfer, passo de pagamento). A direção está aprovada; isto são correções, não redesenho.

## Confirmado a funcionar (não tocar)
* Total de hoje único e reativo: receção e extras com preço fixo somam em tempo real e fluem para o passo 3.
* Gate da receção com CTA bloqueado e mensagem; estado selecionado com check, borda escura e fundo areia.
* Estado adicionado nas linhas: check, resumo da seleção, steppers e remover.
* Capítulos com overline numerada, serif grande e linha editorial; 5 fotografias no total do passo.

## Correções por prioridade

1. Copy de dinheiro (urgente). O parágrafo antes do Flex diz que nada é cobrado hoje pelos extras, o que agora é falso. Substituir por: "Itens com preço fechado são cobrados hoje, num único pagamento. Serviços com confirmação do concierge são cobrados hoje e reembolsados automaticamente em 24 horas se não for possível garantir. Pedidos sob orçamento não têm qualquer cobrança agora." Aplicar nas 9 línguas.
2. Scrollspy e âncoras. Sintomas observados: dois itens ativos em simultâneo na nav; "A casa" ativo com a página no topo; clique em "A chegada" a partir do fundo da página não navega. Corrigir o observer (um único ativo, thresholds pela posição do título do capítulo) e as âncoras com scroll margin superior a compensar os dois headers fixos. Critério: em qualquer posição da página há exatamente um item ativo, e o clique em qualquer item leva ao título do capítulo com o cabeçalho visível.
3. Zonas mortas de scroll. Existe pelo menos um viewport quase vazio entre capítulos (observado entre A mesa e Bem estar). Limitar o espaço entre capítulos a 120px e garantir que a animação de entrada corre uma vez com trigger antecipado (ou desativa em scroll rápido). Critério: em nenhum ponto do scroll existe um ecrã de 800px sem conteúdo.
4. "Ver mais 1" passa a "Ver mais (1)" com área de clique de 44px. Ao expandir, os itens entram sem re disparar animações dos vizinhos.
5. Badge "Mais escolhido" sai da linha do título e vai para a linha de meta acima do título, conforme o brief. Uma única variante visual de badge em todo o passo.
6. Toggle "Depois das 21h": verificar que atualiza o preço da receção presencial para 90 € na linha, no resumo e no total, e que o evento reception_selected leva o parâmetro do horário.
7. Nome do produto "Passeio em e bike" passa a "Passeio de bicicleta elétrica" (ou o nome real do produto Bókun). Confirmar que os 3 cards de experiências vêm do catálogo Bókun real (nome, foto, preço desde) e não de placeholders.
8. Confirmar a origem das fotografias do chef e das experiências: têm de vir da biblioteca própria ou do Bókun. Se alguma for stock, remover a imagem (variante sem imagem) até haver asset aprovado.
9. Resumo lateral: cada linha de extra deve permitir remover inline (secção 8 do spec). Se ainda não existe, adicionar.
10. Flex: testar o copy contextual com a tarifa não reembolsável selecionada no passo 1 (só foi validado o texto da tarifa flexível). Ao adicionar o Flex, o CTA e o resumo devem refletir o item dentro do Total de hoje.
11. Mobile 390px: validação completa em falta. Nav de capítulos em chips horizontais, decisão de receção empilhada com ambas as opções visíveis, barra inferior com total, linhas com alvos táteis de 44px. Screenshots 390 e 1440 no PR.

## Prompt para o Claude Code

"Lê docs/checkout_fixes_12jul.md. Executa as correções pela ordem indicada, sem alterar a direção visual aprovada. Para os pontos 2 e 3, descreve a causa raiz antes de corrigir. No fim, valida cada critério com evidência e entrega screenshots desktop 1440 e mobile 390 do passo 2 completo."
