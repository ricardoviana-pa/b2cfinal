# Website Portugal Active — progresso

Atualizado: 2026-09-16. Fonte editável: [tasks.json](tasks.json). Gerar este mapa com `node scripts/website-progress.mjs`.

## Regras

- Concluído exige evidência dos critérios, não apenas commit ou número de testes.
- Implementado, validado e publicado são etapas distintas.
- Nunca transferir dados, sessões, credenciais ou operações de produção para DEV.
- Pedidos comerciais sem decisão não bloqueiam trabalho técnico independente.

## Estado

- **34** — Por iniciar
- **2** — Em execução
- **2** — Código em DEV; validação por fechar
- **1** — Rascunho; validação por fechar
- **1** — Aguarda decisão comercial
- **4** — Parte validada localmente
- **1** — Parte publicada; validação por fechar
- **1** — Publicado em produção

Não se atribui percentagem a uma tarefa só por existirem alterações de código. Cada ID conserva o critério de conclusão original.

| ID | Prioridade | Estado | Trabalho |
| --- | --- | --- | --- |
| [WEB-01](#web-01) | P0 | Parte validada localmente | Infraestrutura de teste: criar um ambiente integrado com dados sintéticos, contas sandbox e destinatários de teste. O DEV atual só permite revisão visual. |
| [WEB-02](#web-02) | P0 | Parte validada localmente | Validação: percorrer pesquisa → cotação → extras → dados do hóspede → pagamento → confirmação → reserva → email. |
| [WEB-03](#web-03) | P0 | Parte validada localmente | Validação: cartão, autenticação adicional, Apple/Google Pay quando disponíveis, PayPal e Klarna; recusa, desistência, erro e regresso ao site. |
| [WEB-04](#web-04) | P0 | Parte validada localmente | Validação: disponibilidade/preço alterado, cotação expirada, duplo clique, atualização da página, ligação lenta e retoma do carrinho. |
| [WEB-05](#web-05) | P0 | Parte publicada; validação por fechar | Auditoria preventiva: restantes links de emails transacionais, pagamentos, cancelamento, confirmação e recuperação; proteger a separação entre ambientes nos lançamentos. A falha concreta de recuperação já foi corrigida. |
| [WEB-06](#web-06) | P0 | Aguarda decisão comercial | Divergência comercial documentada: reconciliar serviços entre catálogo e checkout. Exemplos anteriores: chef €60/€95, babysitter €35/hora/€20 e yoga €80/sessão/€60. Podem representar prestações diferentes; não foi demonstrada cobrança indevida. |
| [WEB-07](#web-07) | P0 | Publicado em produção | Clareza de preços: resolver casos documentados de arredondamento da diária que não explicam o total, como €500 × 4 versus €2 002. |
| [WEB-08](#web-08) | P0 | Em execução | Lançamento pendente: preparar a promoção das melhorias DEV para produção por blocos verificáveis. |
| [WEB-09](#web-09) | P0 | Código em DEV; validação por fechar | Código pronto em DEV: rever e publicar o consentimento que controla efetivamente as ferramentas; validar apresentação móvel. |
| [WEB-10](#web-10) | P0 | Rascunho; validação por fechar | Rascunho GTM: validar as 39 alterações guardadas antes de publicar; concluir Tag Assistant/DebugView. |
| [WEB-11](#web-11) | P0 | Por iniciar | Validação de compra: conferir moeda, receita, identificação da transação, casa e extras; auditar o acionador antigo de compra baseado em `/success`. |
| [WEB-12](#web-12) | P0 | Por iniciar | Dependências: rever Google Ads antes de mudar `Start_check_out` para `begin_checkout`; resolver ou justificar os dois alertas de qualidade/cobertura e percursos antigos. |
| [WEB-13](#web-13) | P1 | Por iniciar | Medição comercial: criar uma referência inicial e um painel do funil por dispositivo, idioma, canal e mercado, incluindo pedidos assistidos e referências AI. |
| [WEB-14](#web-14) | P1 | Por iniciar | Aprofundamento das PDP: começar pelas dez casas prioritárias e rever galeria, ordem das fotografias, diferenciação, perfil ideal e limitações. |
| [WEB-15](#web-15) | P1 | Por iniciar | Factos da estadia: confirmar configuração de quartos/camas, piscina privada ou partilhada, aquecimento e custos, acessibilidade, animais, inclusões e chegada. |
| [WEB-16](#web-16) | P1 | Em execução | Pesquisa: testar filtros combinados, calendário móvel, orçamento, hóspedes, mapa/lista, ordenação, voltar atrás e parâmetros partilhados. Há melhorias implementadas; falta validação abrangente. |
| [WEB-17](#web-17) | P1 | Por iniciar | Sem disponibilidade: rever as alternativas já existentes e completar a proposta de datas/casas semelhantes. |
| [WEB-18](#web-18) | P1 | Por iniciar | Propostas de conversão: avaliar seleção para comparar/partilhar casas em grupo, benefícios de reserva direta e contacto contextual. |
| [WEB-19](#web-19) | P1 | Por iniciar | Usabilidade e acessibilidade: rever foco, teclado, contraste, formulários, erros, zoom, alvos de toque e navegação; testar Safari/iPhone e Android reais. |
| [WEB-20](#web-20) | P1 | Por iniciar | Traduções e promessas: rever textos comerciais nos idiomas prioritários e afirmações como 24/7, resposta em duas horas ou gestão de todas as casas pela mesma equipa. |
| [WEB-21](#web-21) | P1 | Código em DEV; validação por fechar | Home, About, Concierge e Experiences |
| [WEB-22](#web-22) | P1 | Por iniciar | Páginas individuais de serviços e experiências |
| [WEB-23](#web-23) | P1 | Por iniciar | Events e Corporate Retreats |
| [WEB-24](#web-24) | P1 | Por iniciar | Contact, FAQ, Blog e artigos |
| [WEB-25](#web-25) | P1 | Por iniciar | Destinations, páginas regionais e Collections |
| [WEB-26](#web-26) | P1 | Por iniciar | Checkout, confirmação, retornos de pagamento, Login e Account |
| [WEB-27](#web-27) | P1 | Por iniciar | Owners, Careers, garantia de melhor preço, políticas e 404 |
| [WEB-28](#web-28) | P1 | Por iniciar | Rodapé e identidade local |
| [WEB-29](#web-29) | P1 | Por iniciar | Limitação comercial: os preços de alojamento já aparecem, mas é necessário completar/validar encargos obrigatórios e a cotação final por fornecedor. |
| [WEB-30](#web-30) | P1 | Por iniciar | Lacunas datadas: na leitura de 15/09, 3 Br Cabana Villa, Villa Arroz e Villa Trevo tinham calendários vazios. Outras quatro casas não tinham estadia elegível nos 90 dias analisados. Não houve nova consulta dos calendários nesta revisão. |
| [WEB-31](#web-31) | P1 | Por iniciar | Validação integrada: atualizar cotações, expiração de cache, falha do fornecedor e passagem do pedido à confirmação. |
| [WEB-32](#web-32) | P1 | Por iniciar | Oferta por validar: selecionar casas autorizadas e preencher a ficha operacional empresarial. |
| [WEB-33](#web-33) | P1 | Por iniciar | Proposta comercial: transformar os três formatos de pedido existentes em dois ou três programas concretos, com preço/margem e provas reais. |
| [WEB-34](#web-34) | P1 | Por iniciar | Percurso do pedido: testar entrega do formulário em destinatário isolado, atribuição de responsável, proposta, seguimento e resultado. A interface foi testada, mas não a entrega completa. |
| [WEB-35](#web-35) | P1 | Por iniciar | Pricing e distribuição: ligar as análises de Revenue já preparadas às casas/meses com disponibilidade, mínimos de noites, dias de semana e margem. |
| [WEB-36](#web-36) | P2 | Por iniciar | Proposta de aquisição: priorizar mercados, parcerias, hóspedes anteriores e campanhas para ofertas disponíveis e rentáveis. |
| [WEB-37](#web-37) | P1 | Por iniciar | SEO técnico: acompanhar Search Console após as correções de dados estruturados e classificar indexação, redirecionamentos, erros, canónicas e idiomas. |
| [WEB-38](#web-38) | P2 | Por iniciar | Auditoria de cobertura: crawl das famílias públicas e arquivo, links internos, páginas órfãs, filtros e URLs antigas. |
| [WEB-39](#web-39) | P2 | Por iniciar | Ahrefs/Semrush: executar análise com dados reais de procura, concorrência, dificuldade e referências externas, se disponível acesso/exportação. |
| [WEB-40](#web-40) | P2 | Por iniciar | Autoridade e distribuição: melhorar referências/parcerias legítimas, coerência dos escritórios e verificar integração Google Vacation Rentals/Guesty. |
| [WEB-41](#web-41) | P2 | Por iniciar | Pesquisa em AI: verificar acesso de crawlers, conteúdo efetivamente legível, factos/autoria/fontes e referências à marca; medir contactos e reservas originados nesses canais. |
| [WEB-42](#web-42) | P2 | Por iniciar | Plano editorial: completar 12 atualizações e 36 temas novos; rever/promover os dois novos artigos já em DEV. |
| [WEB-43](#web-43) | P2 | Por iniciar | Imagens e arquivo: continuar revisão de fotografias regionais, repetições, legendas, direitos e informação sazonal de guias antigos. |
| [WEB-44](#web-44) | P1 | Por iniciar | Nova referência de desempenho: medir produção móvel nas páginas Home, pesquisa, PDP, checkout e destinos, incluindo as ferramentas efetivamente carregadas. |
| [WEB-45](#web-45) | P2 | Por iniciar | Otimização orientada por medição: investigar JavaScript inicial, mapas/modais, imagens principais, fontes, cache, resposta do servidor e terceiros. |
| [WEB-46](#web-46) | P2 | Por iniciar | Experimentos de conversão: estabelecer hipóteses, métricas e períodos de avaliação; começar pelos pontos de abandono e casas prioritárias. |

## Detalhe e evidência

### WEB-01

**Infraestrutura de teste: criar um ambiente integrado com dados sintéticos, contas sandbox e destinatários de teste. O DEV atual só permite revisão visual.**

Estado: Parte validada localmente.

Critério: Nenhuma base, chave, sessão, reserva ou envio operacional de produção acessível ao teste; inventário e pagamentos fictícios utilizáveis de ponta a ponta.

Próximo passo: Adicionar persistência sintética e interfaces de teste de browser; depois validar fornecedores sandbox sem acesso a produção.

Evidência:

- [PR 73](https://github.com/ricardoviana-pa/b2cfinal/pull/73): primeira bancada isolada em DEV, 20 testes.
- [PR 75](https://github.com/ricardoviana-pa/b2cfinal/pull/75), publicado em produção: 57 testes isolados; regressão 326 aprovados/6 ignorados; TypeScript e builds aprovados.
- [Âmbito e limites da bancada](CHECKOUT_SANDBOX.md). Não equivale a uma compra completa com fornecedores sandbox.
- PR 82: verificação automática de instalação limpa, integração isolada, regressão, tipos e build no GitHub; execução da PR aprovada em Linux. Sem credenciais operacionais.

Etapas:

- [x] Runner isolado, dados fictícios e bloqueio de rede verificável.
- [x] Integração local com router real e adaptadores simulados.
- [ ] Base persistente e sandbox de fornecedores para E2E de browser.

### WEB-02

**Validação: percorrer pesquisa → cotação → extras → dados do hóspede → pagamento → confirmação → reserva → email.**

Estado: Parte validada localmente.

Critério: Evidência de uma reserva fictícia completa, valor coerente em todas as etapas e efeitos externos apenas em sandbox.

Próximo passo: Completar o percurso integrado em browser com fornecedores e destinatários sandbox.

Evidência:

- [PR 73](https://github.com/ricardoviana-pa/b2cfinal/pull/73): primeira bancada isolada em DEV, 20 testes.
- [PR 75](https://github.com/ricardoviana-pa/b2cfinal/pull/75), publicado em produção: 57 testes isolados; regressão 326 aprovados/6 ignorados; TypeScript e builds aprovados.
- [Âmbito e limites da bancada](CHECKOUT_SANDBOX.md). Não equivale a uma compra completa com fornecedores sandbox.
- Produção: Alvarinho Villa, 10–18/11/2026, 2 hóspedes, tarifa flexível e total de 3170 € preservados até à entrada no checkout; sem contactos ou pagamento.

Etapas:

- [x] Contacto → extras → pagamento simulado → reserva simulada → preparação da confirmação.
- [x] Cotação e confirmação validadas no servidor; cenários de repetição e conclusão cobertos na bancada isolada.
- [ ] Percurso completo desde a pesquisa, browser e fornecedores sandbox.

### WEB-03

**Validação: cartão, autenticação adicional, Apple/Google Pay quando disponíveis, PayPal e Klarna; recusa, desistência, erro e regresso ao site.**

Estado: Parte validada localmente.

Critério: Sucessos e falhas compreensíveis; uma cobrança e uma reserva por transação; regressos corretos; métodos indisponíveis tratados com clareza.

Próximo passo: Validar SDKs, 3DS, retornos e webhooks com contas sandbox de fornecedores.

Evidência:

- [PR 73](https://github.com/ricardoviana-pa/b2cfinal/pull/73): primeira bancada isolada em DEV, 20 testes.
- [PR 75](https://github.com/ricardoviana-pa/b2cfinal/pull/75), publicado em produção: 57 testes isolados; regressão 326 aprovados/6 ignorados; TypeScript e builds aprovados.
- [Âmbito e limites da bancada](CHECKOUT_SANDBOX.md). Não equivale a uma compra completa com fornecedores sandbox.

Etapas:

- [x] Contrato cartão/wallets e retoma de pagamento já concluído cobertos localmente.
- [ ] 3DS, métodos reais de teste, retornos PayPal/Klarna e webhooks.

### WEB-04

**Validação: disponibilidade/preço alterado, cotação expirada, duplo clique, atualização da página, ligação lenta e retoma do carrinho.**

Estado: Parte validada localmente.

Critério: Sem duplicação nem preços silenciosamente desatualizados; recuperação clara e segura.

Próximo passo: Completar cenários de retoma e concorrência no ambiente integrado com persistência e fornecedores sandbox.

Evidência:

- [PR 73](https://github.com/ricardoviana-pa/b2cfinal/pull/73): primeira bancada isolada em DEV, 20 testes.
- [PR 75](https://github.com/ricardoviana-pa/b2cfinal/pull/75), publicado em produção: 57 testes isolados; regressão 326 aprovados/6 ignorados; TypeScript e builds aprovados.
- [Âmbito e limites da bancada](CHECKOUT_SANDBOX.md). Não equivale a uma compra completa com fornecedores sandbox.

Etapas:

- [x] Timeout, cancelamento falhado, expiração, valor alterado, double submit e falha de persistência cobertos.
- [ ] Concorrência entre instâncias/métodos e finalização webhook/browser.

### WEB-05

**Auditoria preventiva: restantes links de emails transacionais, pagamentos, cancelamento, confirmação e recuperação; proteger a separação entre ambientes nos lançamentos. A falha concreta de recuperação já foi corrigida.**

Estado: Parte publicada; validação por fechar.

Critério: Links operacionais sempre no domínio correto; verificações automáticas de configuração e regressão. Confirmar também, pela operação, o desfecho do cliente afetado, ainda não documentado nesta tarefa.

Próximo passo: Concluir gestão das credenciais e validação integrada com fornecedores sandbox. Entrega de correções por email depende da conta de envio correta.

Evidência:

- PR 77: recuperação apenas para a última tentativa elegível, bloqueio de reservas já concluídas e verificação Guesty antes do lembrete; publicado em produção.
- PR 78: origem canónica nos alertas internos; publicado em produção.
- Desfecho do cliente afetado e tratamento dos destinatários documentados no dossier administrativo privado; sem dados pessoais neste repositório.

### WEB-06

**Divergência comercial documentada: reconciliar serviços entre catálogo e checkout. Exemplos anteriores: chef €60/€95, babysitter €35/hora/€20 e yoga €80/sessão/€60. Podem representar prestações diferentes; não foi demonstrada cobrança indevida.**

Estado: Aguarda decisão comercial.

Critério: Uma matriz aprovada de produto, unidade, participantes, mínimos, região, inclusões, taxas e condições, refletida de forma coerente em todos os pontos.

Próximo passo: Usar a matriz aprovada para unificar catálogo, detalhe, schema e checkout sem alterar condições por suposição.

Evidência:

- [Comparação extraída do código dos 8 serviços públicos](SERVICOS_PRECOS.md).

Etapas:

- [x] Mapear catálogo público, checkout e fonte legada.
- [ ] Validar preços/unidades/inclusões e implementar fonte comercial única.

Dependências:

- Pergunta enviada ao Ricardo nesta execução sobre tabela aprovada ou responsável pela validação comercial. Não impede restantes tarefas.

### WEB-07

**Clareza de preços: resolver casos documentados de arredondamento da diária que não explicam o total, como €500 × 4 versus €2 002.**

Estado: Publicado em produção.

Critério: Decomposição legível que reconcilia noites, extras, encargos e total cobrado, sem alterar valores comerciais por suposição.

Próximo passo: Manter a regressão; a certificação integrada de pagamentos continua em WEB-02/WEB-03.

Evidência:

- PR 81: cêntimos preservados nas cotações, PLP, PDP, barra móvel, checkout, recibos e modelos de email; multiplicação por uma diária arredondada removida.
- Treze testes novos em nove línguas; suite 358 aprovados/6 ignorados; TypeScript e build aprovados.
- Browser local com dados sintéticos: troca de tarifa e resumo móvel a 390 px; totais e parcelas reconciliados. Produção: PLP e PDP apresentaram 2.888,87 €, discriminados em 2.541,60 € e 347,27 € na cotação observada.
- Smoke do build publicado aprovado. Não houve pagamento real de teste.

Etapas:

- [x] Valores exatos no percurso de cotação e nos modelos de confirmação.
- [x] Regressão isolada, apresentação móvel e publicação verificadas.

### WEB-08

**Lançamento pendente: preparar a promoção das melhorias DEV para produção por blocos verificáveis.**

Estado: Em execução.

Critério: Revisão do diff, verificações antes/depois, plano de reversão e registo. Configuração de isolamento DEV não deve ser copiada indiscriminadamente para produção.

Próximo passo: Publicar primeira PR de fiabilidade para DEV após revisão, mantendo produção inalterada nesta etapa.

Evidência:

- [PR 74](https://github.com/ricardoviana-pa/b2cfinal/pull/74): correções de fotos, pesquisa e preços publicadas e verificadas online.
- [PR 75](https://github.com/ricardoviana-pa/b2cfinal/pull/75): validação do checkout publicada; entrada anónima verificada. Outras alterações DEV continuam sem promoção.

### WEB-09

**Código pronto em DEV: rever e publicar o consentimento que controla efetivamente as ferramentas; validar apresentação móvel.**

Estado: Código em DEV; validação por fechar.

Critério: Aceitar, recusar, reabrir e retirar consentimento funcionam em produção sem impedir a reserva.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-10

**Rascunho GTM: validar as 39 alterações guardadas antes de publicar; concluir Tag Assistant/DebugView.**

Estado: Rascunho; validação por fechar.

Critério: Receção demonstrada nos destinos de análise, não apenas eventos no código ou scripts carregados.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-11

**Validação de compra: conferir moeda, receita, identificação da transação, casa e extras; auditar o acionador antigo de compra baseado em `/success`.**

Estado: Por iniciar.

Critério: Sem compras duplicadas, ausentes ou valores artificiais; conciliação com pagamentos e reservas confirmados.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-12

**Dependências: rever Google Ads antes de mudar `Start_check_out` para `begin_checkout`; resolver ou justificar os dois alertas de qualidade/cobertura e percursos antigos.**

Estado: Por iniciar.

Critério: Campanhas não perdem conversões por mudança de nome; domínios e etiquetas têm âmbito justificado.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-13

**Medição comercial: criar uma referência inicial e um painel do funil por dispositivo, idioma, canal e mercado, incluindo pedidos assistidos e referências AI.**

Estado: Por iniciar.

Critério: Saber onde se abandona, quanto se paga e quantos contactos terminam em reserva. Comparar períodos respeitando a mudança de consentimento.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-14

**Aprofundamento das PDP: começar pelas dez casas prioritárias e rever galeria, ordem das fotografias, diferenciação, perfil ideal e limitações.**

Estado: Por iniciar.

Critério: Página ajuda a escolher a casa concreta; conteúdo real, sem texto genérico repetido.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-15

**Factos da estadia: confirmar configuração de quartos/camas, piscina privada ou partilhada, aquecimento e custos, acessibilidade, animais, inclusões e chegada.**

Estado: Por iniciar.

Critério: Informações relevantes completas e coerentes com a operação, incluindo diferenças de casas parceiras.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-16

**Pesquisa: testar filtros combinados, calendário móvel, orçamento, hóspedes, mapa/lista, ordenação, voltar atrás e parâmetros partilhados. Há melhorias implementadas; falta validação abrangente.**

Estado: Em execução.

Critério: O cliente consegue comparar resultados e recuperar a seleção sem perder datas nem interpretar preço por confirmar como preço final.

Próximo passo: Executar os critérios descritos no inventário.

Evidência:

- PR 74: pesquisa Home → PLP → PDP preserva datas e hóspedes; alteração de datas na PLP verificada em produção. Matriz completa de filtros e dispositivos ainda pendente.
- PR 80: paginação completa das cotações Guesty; ausência em resposta incompleta não implica indisponibilidade. Mesma pesquisa em produção passou de 29 para 37 casas disponíveis; Home coerente com PLP. Sete testes isolados novos.

### WEB-17

**Sem disponibilidade: rever as alternativas já existentes e completar a proposta de datas/casas semelhantes.**

Estado: Por iniciar.

Critério: Alternativas úteis com disponibilidade e preço devidamente identificados; percurso sem becos sem saída.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-18

**Propostas de conversão: avaliar seleção para comparar/partilhar casas em grupo, benefícios de reserva direta e contacto contextual.**

Estado: Por iniciar.

Critério: Implementar apenas propostas com utilidade e condições comerciais verificadas; medir o efeito. Não estão todas aprovadas como funcionalidades obrigatórias.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-19

**Usabilidade e acessibilidade: rever foco, teclado, contraste, formulários, erros, zoom, alvos de toque e navegação; testar Safari/iPhone e Android reais.**

Estado: Por iniciar.

Critério: Percursos essenciais utilizáveis, além da simulação de largura móvel no desktop. Fazer sessões curtas com utilizadores/equipa.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-20

**Traduções e promessas: rever textos comerciais nos idiomas prioritários e afirmações como 24/7, resposta em duas horas ou gestão de todas as casas pela mesma equipa.**

Estado: Por iniciar.

Critério: Promessas confirmadas operacionalmente e conteúdo da propriedade traduzido; nove idiomas na interface não são prova de tradução integral do catálogo.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-21

**Home, About, Concierge e Experiences**

Estado: Código em DEV; validação por fechar.

Critério: Rever a última versão com conteúdo comercial validado, dispositivos reais e depois publicar. About ainda exige prova das promessas; serviços/experiências dependem de preços, fornecedores e traduções corretos.

Próximo passo: Executar os critérios descritos no inventário.

Evidência:

- PR 74 publicou a pesquisa da Home e restaurou cartões/preços. About, Concierge e Experiences da PR 72 continuam apenas em DEV.

### WEB-22

**Páginas individuais de serviços e experiências**

Estado: Por iniciar.

Critério: Preço/unidade/inclusões, disponibilidade, requisitos, cancelamento e CTA adequados ao tipo de compra ou pedido.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-23

**Events e Corporate Retreats**

Estado: Por iniciar.

Critério: Converter a apresentação em ofertas executáveis, com prova, operação e resposta aos pedidos; ver secção 6.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-24

**Contact, FAQ, Blog e artigos**

Estado: Por iniciar.

Critério: Percurso até pedido/reserva, perguntas sem repetição, leitura móvel, pesquisa, conteúdo atualizado e ligações comerciais úteis.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-25

**Destinations, páginas regionais e Collections**

Estado: Por iniciar.

Critério: Conteúdo distinto por intenção, fotos autênticas, ligação a inventário relevante, sazonalidade e motivos para escolher cada região. Parte da nova fotografia ainda só está em DEV.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-26

**Checkout, confirmação, retornos de pagamento, Login e Account**

Estado: Por iniciar.

Critério: Revisão funcional e visual completa, estados vazios/erro, continuidade da reserva e informação após a compra.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-27

**Owners, Careers, garantia de melhor preço, políticas e 404**

Estado: Por iniciar.

Critério: Coerência final, formulários/links, conteúdo e condições reais. Não alterar condições contratuais apenas por conveniência de design.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-28

**Rodapé e identidade local**

Estado: Por iniciar.

Critério: Confirmar moradas completas, horários e mapas dos escritórios de Viana e Lisboa; apresentar de forma compacta e consistente.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-29

**Limitação comercial: os preços de alojamento já aparecem, mas é necessário completar/validar encargos obrigatórios e a cotação final por fornecedor.**

Estado: Por iniciar.

Critério: IVA e restantes encargos tratados uma única vez, com total e condições claros; distinguir preço de alojamento de total final quando faltam componentes.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-30

**Lacunas datadas: na leitura de 15/09, 3 Br Cabana Villa, Villa Arroz e Villa Trevo tinham calendários vazios. Outras quatro casas não tinham estadia elegível nos 90 dias analisados. Não houve nova consulta dos calendários nesta revisão.**

Estado: Por iniciar.

Critério: Revalidar com o fornecedor, distinguir indisponibilidade de falta de dados e resolver as lacunas que persistirem.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-31

**Validação integrada: atualizar cotações, expiração de cache, falha do fornecedor e passagem do pedido à confirmação.**

Estado: Por iniciar.

Critério: O cliente percebe o que está confirmado e o que exige confirmação. O cache existente não deve ser apresentado como garantia instantânea de inventário.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-32

**Oferta por validar: selecionar casas autorizadas e preencher a ficha operacional empresarial.**

Estado: Por iniciar.

Critério: Quartos/camas, capacidade de reunião/refeição, internet, plano de chuva, fornecedores, horários, custos, regras e datas confirmados.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-33

**Proposta comercial: transformar os três formatos de pedido existentes em dois ou três programas concretos, com preço/margem e provas reais.**

Estado: Por iniciar.

Critério: Oferta executável, fotografias/casos autorizados e condições claras, sem lotações inventadas.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-34

**Percurso do pedido: testar entrega do formulário em destinatário isolado, atribuição de responsável, proposta, seguimento e resultado. A interface foi testada, mas não a entrega completa.**

Estado: Por iniciar.

Critério: Nenhum pedido perdido; responsável e prazo de resposta reais; motivos de perda registados.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-35

**Pricing e distribuição: ligar as análises de Revenue já preparadas às casas/meses com disponibilidade, mínimos de noites, dias de semana e margem.**

Estado: Por iniciar.

Critério: Decisões por casa e período, comparação de preço total direto/OTA e testes controlados. Não houve alteração de preços nesta revisão.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-36

**Proposta de aquisição: priorizar mercados, parcerias, hóspedes anteriores e campanhas para ofertas disponíveis e rentáveis.**

Estado: Por iniciar.

Critério: Plano com responsável, verba quando aplicável e reservas/margem como resultado; não apenas visitas. Nenhuma campanha ou comunicação é enviada por este inventário.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-37

**SEO técnico: acompanhar Search Console após as correções de dados estruturados e classificar indexação, redirecionamentos, erros, canónicas e idiomas.**

Estado: Por iniciar.

Critério: Confirmar nova leitura/validação do Google. A fotografia anterior de 149 VacationRental inválidos não demonstra o estado depois da correção. URLs não indexadas não são automaticamente erros.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-38

**Auditoria de cobertura: crawl das famílias públicas e arquivo, links internos, páginas órfãs, filtros e URLs antigas.**

Estado: Por iniciar.

Critério: Preservar páginas/guias com valor e impedir duplicação desnecessária; corrigir problemas comprovados sem apagar conteúdo indiscriminadamente.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-39

**Ahrefs/Semrush: executar análise com dados reais de procura, concorrência, dificuldade e referências externas, se disponível acesso/exportação.**

Estado: Por iniciar.

Critério: Mapa de intenção → página → oferta → prioridade. A estratégia atual usa Search Console e pesquisa; não constitui uma auditoria paga concluída nestas plataformas.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-40

**Autoridade e distribuição: melhorar referências/parcerias legítimas, coerência dos escritórios e verificar integração Google Vacation Rentals/Guesty.**

Estado: Por iniciar.

Critério: Dados empresariais consistentes e canais efetivamente configurados; ter schema não prova distribuição ativa em Google Vacation Rentals.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-41

**Pesquisa em AI: verificar acesso de crawlers, conteúdo efetivamente legível, factos/autoria/fontes e referências à marca; medir contactos e reservas originados nesses canais.**

Estado: Por iniciar.

Critério: Evidência de acesso e conteúdo útil, com acompanhamento de resultados. Não existe certificação de estar «ao máximo para IA» nem garantia de ser citado.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-42

**Plano editorial: completar 12 atualizações e 36 temas novos; rever/promover os dois novos artigos já em DEV.**

Estado: Por iniciar.

Critério: Cada peça tem intenção distinta, revisão factual, fotos adequadas, ligação a oferta disponível e idiomas efetivamente publicados. Trabalhar por vagas comerciais.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-43

**Imagens e arquivo: continuar revisão de fotografias regionais, repetições, legendas, direitos e informação sazonal de guias antigos.**

Estado: Por iniciar.

Critério: Imagens pertinentes e distintas; sem usar fotos ilustrativas como prova de eventos realizados ou propriedades aprovadas.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-44

**Nova referência de desempenho: medir produção móvel nas páginas Home, pesquisa, PDP, checkout e destinos, incluindo as ferramentas efetivamente carregadas.**

Estado: Por iniciar.

Critério: Comparações repetíveis e dados de utilizadores reais. A referência de 15/09 tinha home de produção com Lighthouse 71 e LCP de laboratório 4,4 s; não é uma medição da revisão atual.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-45

**Otimização orientada por medição: investigar JavaScript inicial, mapas/modais, imagens principais, fontes, cache, resposta do servidor e terceiros.**

Estado: Por iniciar.

Critério: Corrigir os maiores custos medidos e voltar a testar sem perder funcionalidades. DEV bloqueia integrações, por isso não é uma comparação equivalente com produção.

Próximo passo: Executar os critérios descritos no inventário.

### WEB-46

**Experimentos de conversão: estabelecer hipóteses, métricas e períodos de avaliação; começar pelos pontos de abandono e casas prioritárias.**

Estado: Por iniciar.

Critério: Distinguir alteração visual de melhoria comprovada. Medir reservas pagas e margem, não só cliques no botão.

Próximo passo: Executar os critérios descritos no inventário.

## Histórico

- 2026-09-16: Ricardo autorizou execução sistemática e acompanhamento de progresso. Criados 46 IDs estáveis; início pela fiabilidade da reserva.
- 2026-09-16: Primeira etapa: 20 testes de integração sintética passam após reprodução de 8 falhas; regressão 367 passados/6 ignorados, TypeScript/build aprovados. Comparação dos 8 serviços preparada; decisão comercial pedida. Nenhuma compra/envio real.
- 2026-09-16: Incidente de produção: PR 74 restaurou descoberta e preços; PR 75 reforçou validação no servidor. Deploys confirmados live e entrada anónima no checkout verificada. A auditoria do incidente está guardada localmente, fora do repositório público.
- 2026-09-16: PR 80/81 publicadas: disponibilidade e apresentação exata dos preços verificadas. PR 82 adiciona verificação automática no GitHub. O mapa passa a gerar o estado de publicação parcial a partir de tasks.json.
