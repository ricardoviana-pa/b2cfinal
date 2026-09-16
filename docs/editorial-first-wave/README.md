# Primeira vaga editorial — 16 de setembro de 2026

**Dois artigos completos, em português e inglês, integrados no catálogo para publicação em DEV.** Avanço sobre os temas 13 e 14 do plano de 50 intervenções; os outros 48 continuam nas fases registadas no plano. Os ficheiros Markdown abaixo preservam os manuscritos; o texto publicado vive em `client/src/data/blog.json` e `blog.i18n/pt.json`.

| Artigo | Decisão que ajuda a tomar | Intenção principal | Conversão |
| --- | --- | --- | --- |
| Retiro de dois dias | Como organizar a agenda e escolher o espaço | Programa de retiro de empresa no Norte | Pedido de proposta com brief |
| Team building com alojamento | Como comparar propostas e o custo completo | Avaliação de fornecedores/programas com estadia | Pedido de proposta com alojamento e atividades |

## Textos

- [Retiro de dois dias — PT](01-retiro-empresa-dois-dias-pt.md)
- [Two-day company retreat — EN](01-two-day-company-retreat-en.md)
- [Team building com alojamento — PT](02-team-building-alojamento-pt.md)
- [Team building with accommodation — EN](02-team-building-accommodation-en.md)

## Decisões editoriais

- A landing `/corporate-retreats` mantém a intenção comercial principal; os artigos respondem a dúvidas de planeamento e comparação.
- Não há outro artigo com estas intenções no catálogo atual, segundo a pesquisa de títulos e slugs. Não foi feita uma análise de volumes/KD em Ahrefs ou Semrush, nem se promete posição orgânica.
- As agendas são exemplos, não pacotes vendidos. Não foram inventados preços, descontos, lotações de salas, disponibilidade, experiências de clientes ou casos reais.
- A copy distingue camas, quartos, sala de trabalho e autorização para eventos.
- Links comerciais usam o formulário existente com `subject=events&intent=corporate`.
- Não foi adicionado markup de FAQ ou listas artificiais de perguntas; a resposta inicial, os subtítulos e as tabelas dão estrutura legível a pessoas e motores de busca.

## Implementação de publicação — 16/09/2026

1. Duas imagens distintas já utilizadas no site, identificadas como ilustrativas. Não se afirma que documentam eventos reais nem que o espaço retratado está disponível. Fotografias documentais com direitos e local confirmados continuam a ser uma melhoria desejável.
2. Autoria institucional Portugal Active (`Organization`); não se atribui revisão a nenhuma pessoa.
3. `publishedLocales: [en, pt]` controla catálogo, páginas relacionadas, hreflang e sitemap. Pedidos dos restantes idiomas redirecionam temporariamente para EN, sem anunciar uma tradução inexistente. As traduções existentes dos artigos anteriores mantêm-se.
4. Ligações recíprocas entre os artigos e a landing corporate. CTAs de proposta empresarial; evita-se sugerir que as casas automaticamente relacionadas são locais aprovados para eventos.
5. Listas, tabelas com quebra de texto e links dentro de negrito renderizados semanticamente. A versão PT é carregada antes de SSR e hidratação.
6. A landing PT/EN oferece três pontos de partida, incluindo encontro de fim de ano/kick-off. O formulário tem datas, pessoas e quartos opcionais, inclui os detalhes no pedido enviado à operação e identifica o formato no evento `generate_lead`, sem enviar texto livre para analytics.
7. Medir por landing/idioma pedidos qualificados, propostas e reservas. O GTM ainda depende do acesso ao contentor e das correções documentadas; esta publicação não resolve essa dependência.

## Limite do teste de checkout

O DEV foi verificado em leitura a 16/09/2026: Stripe em modo de teste, Guesty nos endpoints normais e serviço de email configurado. Um pagamento de teste pode criar uma reserva real e enviar emails. Nesta vaga não foi feito pagamento, reserva nem envio de formulário real. Os testes automatizados usam mocks e não substituem uma compra completa com inventário e destinatários de teste controlados. A ausência de `STRIPE_CARD_WEBHOOK_SECRET` na configuração de ambiente, isoladamente, não prova falta de webhook: o código também suporta o segredo em `app_config`.

## Próximos textos com maior utilidade comercial

O tema 15 (orçamento de retiro) ganha valor com propostas reais anonimizadas. O tema 21 (Natal de equipa com estadia) e o 22 (kick-off de janeiro) precisam de casas elegíveis, programa e condições confirmados. Essa prova operacional é o próximo passo para transformar o conteúdo em oferta vendável.
