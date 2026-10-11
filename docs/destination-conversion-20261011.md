# Destinos: escolha, alojamento e medição — 11 outubro 2026

Pedido: Ricardo autorizou avançar com as prioridades da auditoria Search Console de 11/10. Primeira aplicação editorial em PT/EN ao índice, Minho e Viana; URLs preservadas. Mapa e ligações do rodapé melhorados nos nove idiomas.

## Alterações

- Índice com sugestões por praia, natureza, vinho/mesa e família. São sugestões editoriais, não filtros de disponibilidade. Cada região indica experiência, aeroporto, duração sugerida e mobilidade; o Douro deixa de abrir com uma instrução logística.
- Mapa com nomes em HTML e alvos de toque amplos, sem texto reduzido pela escala do SVG.
- Minho e Viana mostram três casas após a secção de natureza. Seleção por IDs estáveis, apenas entre as casas devolvidas para o destino e ativas, com alternativas se uma sair do catálogo. Razões baseadas nas fichas públicas; nenhuma promessa de disponibilidade.
- Equipa e processo de preparação da estadia apresentados com fotografia existente. Shuttles, chef, experiências e limpeza adicional são opcionais, sujeitos a disponibilidade e orçamento.
- Ligações às coleções existentes e dos artigos do Norte para os guias de destino. Eventos empresariais mantidos como opção secundária no índice.
- Metadados PT/EN do índice, Minho e Viana alinhados entre servidor e browser. Porto e Douro separados no rodapé; Norte de Portugal/Minho também no rodapé.
- Datas e hóspedes são preservados nas ligações através do helper existente; pedidos à equipa incluem o destino. Valores arbitrários do URL não são copiados.

## Medição

O GTM publicado (v31) não tinha uma etiqueta para `destination_planning`. A v32, publicada a 11/10 no espaço isolado **PA Destinations · 11 Oct 2026**, acrescenta uma etiqueta GA4, um acionador e quatro variáveis. Destino: `G-5DHEE0V85C`; parâmetros: `destination`, `language`, `section`, `action`.

Acionamento limitado a `^(www\.)?portugalactive\.com$`, uma vez por evento, com `analytics_storage` autorizado. A proteção de consentimento do site continua anterior ao envio. Nenhuma alteração às etiquetas de compra, lead, Meta ou às sete alterações pendentes do Default Workspace. Exportação de segurança v31 e importação incremental guardadas no projeto administrativo.

O índice acrescenta eventos de mapa, cartões, interesses, coleções e contacto. Os guias e os cartões de casas conservam os eventos existentes. Cliques não são leads; pedidos não são reservas. Publicar a etiqueta não prova, por si só, receção no Analytics ou entrega de pedidos à equipa.

## Validação e dados de base

- 826 testes aprovados e 6 ignorados na suite geral; 108 testes de checkout/pedidos em ambiente sintético; TypeScript e build aprovados durante a preparação.
- Revisão no browser, incluindo 390 × 844, índice e casas do Minho/Viana, filtros e preservação do contexto até contacto. Sem pagamentos nem pedidos reais criados.
- Consulta anónima em produção, 28 dias: destinos agrupados `/destinations/:slug` têm LCP p75 2.088 ms, com apenas 30 amostras. A página inicial tem 4.708 ms, 790 amostras. A medição interna não tem a mesma população do Search Console (grupo mobile 2,7 s) e não permite declarar o problema resolvido.
- O HTML já pré-carrega a fotografia principal de Viana com srcset e prioridade alta. Não foi feita uma troca arbitrária de imagem. A otimização mais ampla da página inicial exige uma intervenção própria.

## Acompanhamento

- Confirmar a receção do evento no Analytics e disponibilizar os parâmetros nas análises; comparar períodos completos posteriores à publicação.
- Pedir novo rastreio das exclusões históricas ativas de Caminha, Esposende e Douro, sem remover noindex de dev/admin/Brazil. Pedido aceite não significa indexação concluída.
- Validar o estado das notificações dos pedidos parceiros por registos do servidor; testes sintéticos não certificam entrega real de email.
- Avaliar consultas não associadas à marca, passagem para casas, pedidos recebidos e reservas atribuídas. Não atribuir variações pequenas ao novo design sem evidência.

Fontes editoriais: pesquisa de destinos de 28/09, `destination-editorial-sources.json`, fichas atuais das casas e guias de acesso existentes. Fontes técnicas: [eventos GA4](https://developers.google.com/analytics/devguides/collection/ga4/events), [novo rastreio Google](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl).
