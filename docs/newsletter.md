# Newsletter do site: captação com dupla confirmação

Pop-up, bloco da casa, bloco do artigo do Diário e rodapé. Um só formulário
(`client/src/components/marketing/NewsletterForm.tsx`), regras partilhadas em
`shared/newsletter.ts`, servidor em `server/services/newsletter.ts`,
`server/routers/newsletter.ts` e `server/routes/newsletter.ts`.

Não precisa de chave nova: guarda na tabela `leads` do site e envia a
confirmação pelo email transacional que o site já usa (Resend). O Brevo é
opcional.

## O caminho de uma inscrição

| Passo | O que acontece | `leads.source` |
| --- | --- | --- |
| 1. Formulário | `newsletter.subscribe` guarda o lead pendente com a prova do consentimento e envia o email de confirmação | `nl-pending-<origem>` |
| 2. Clique no email e no botão | `GET /api/newsletter/confirm` verifica o token (HMAC, 7 dias) e mostra uma página com um botão, sem nenhum script; só o `POST` desse botão promove o lead, com `confirmedAt` e os sinais de quem confirmou. Um scanner de email que abre o link, ou que corre a página numa sandbox, não confirma nada | `newsletter-<origem>` |
| 3. Saída, sempre | `GET /api/newsletter/unsubscribe` mostra um botão; o `POST` tira o consentimento a todos os leads do endereço | `nl-unsubscribed-<origem>` (o do checkout volta a `checkout`) |
| Sem clique em 8 dias | `expireNewsletterPending` (2 min depois do arranque e de 6 em 6 horas) tira o endereço, o nome e o telefone e guarda só os campos que o funil conta | `nl-expired-<origem>` |

Origens: `popup`, `house`, `article`, `footer`.

### Scanners que correm a página

Alguns filtros de email (Defender Safe Links em detonação, Mimecast,
Proofpoint) abrem o link numa sandbox que executa JavaScript, com o user
agent de um browser verdadeiro e às vezes minutos depois da entrega. Por
isso a página de confirmação não se envia sozinha: só confirma quem carrega
no botão, que é um gesto da pessoa. O `POST` guarda ainda `confirmDelaySec`
(segundos desde o formulário), `confirmUa` (user agent, cortado a 160
caracteres, nunca nos logs) e `confirmVia` (`click` pelo botão; `auto` de uma
cópia antiga da página em cache que ainda se enviava sozinha; `missing` num
`POST` sem o campo, que não veio da página). Uma confirmação que não veio do
botão, com user agent vazio ou de robô, ou a menos de 10 segundos do
formulário, fica com `confirmSuspect: 1`: o lead fica confirmado (a pessoa
preencheu o formulário), mas a jusante conta como opt-in simples, nunca como
dupla confirmação, e nunca vai para o Brevo, nem pela confirmação nem pela
resposta à pergunta de interesse (`brevoAddConfirmed` recusa-a). Um clique
posterior que pareça humano tira a marca (`firstConfirmedAt` guarda a
primeira data).

## O que conta, e a que nível

- **PA Mailing List**: o coletor lê a tabela `leads` de 6 em 6 horas.
  - Dupla confirmação: só um lead deste fluxo (`flow: site-doi-v1`) com
    `confirmedAt` e sem `confirmSuspect`. Fica com a preferência de âmbito
    `newsletter-doi` e o pa-marketing dá-lhe o nível `dupla_confirmacao`, o
    que as máquinas pedem por defeito.
  - Opt-in simples (`opt_in_registado`): os outros `newsletter-*`, ou seja as
    inscrições do rodapé e da home anteriores a este fluxo (sem confirmação),
    a caixa do checkout (`newsletter-checkout`, só a caixa) e as confirmações
    suspeitas.
  - `nl-unsubscribed-*` dá `unsubscribed` e tira o email de
    `v_b2c_marketing_eligibility`. Uma dupla confirmação posterior a uma
    saída do site é um regresso: a saída antiga passa a
    `unsubscribed_superseded`. Uma dupla confirmação posterior a uma saída
    de outra origem (Brevo, bloqueio, bounce) não a desfaz: fica marcada
    para decisão humana e contada.
  - `nl-pending-*`, `nl-expired-*` e `nl-legacy-*` não entram no catálogo
    (nem como pessoa nem como email); os pendentes e os expirados só contam
    no funil.
  - Tudo isto está no PR #5 do `pa-mailing-list`, que entra **antes** deste
    (ver "Ordem de publicação"), e o nível no ramo `claude/captacao-newsletter`
    do pa-marketing. Quando o robô Base do pa-marketing passar a ler os pontos
    de acesso da Mailing List (fase 2, a partir de 12 de outubro), o nível vem
    do PR #4 do `pa-mailing-list`: o par (`website_lead`, `newsletter-doi`)
    tem de estar no `DOUBLE_OPT_IN` desse PR antes de ligar `ROBOT_BASE`, senão
    os subscritores novos descem a `opt_in_registado` e as máquinas deixam-nos
    de fora.
- **Carrinho abandonado**: `hasNewsletterConsent` (`LIKE 'newsletter%'`)
  desbloqueia os contactos 3 e 4, como antes desta mudança; um pendente não
  desbloqueia. Isto inclui as inscrições antigas sem confirmação e a caixa do
  checkout: se também elas precisam de confirmação é uma decisão do Ricardo
  (ver "Decisões em aberto"). Uma saída feita num email do Brevo (boas-vindas
  ou Newsletter) não chega à tabela `leads`: ver "Decisões em aberto".
- **Brevo**: `BREVO_NEWSLETTER_LIST_ID` é o id da lista **"Newsletter do
  site"** (pasta PA Marketing no Brevo), a lista própria do site, e é o mesmo
  número que a sessão de CRM põe em `growth.settings.site_newsletter_list_id`.
  **Nunca** o id da lista "Newsletter" nem o da "Base de hóspedes": essas são
  do robô Base do pa-marketing (`guests_sync` e `base_sync`), que tira delas
  quem ainda não está no catálogo da Mailing List (os subscritores acabados
  de chegar, porque o coletor só lê o site de 6 em 6 horas), e o robô das
  boas-vindas recusa-as e fica a vermelho. Com `BREVO_API_KEY` e
  `BREVO_NEWSLETTER_LIST_ID` no site, quem confirma com um clique que parece
  humano entra logo na "Newsletter do site" (com `ORIGEM_SITE`,
  `CONFIRMADO_EM` e os outros atributos) e quem sai pelo site é retirado; sem
  elas o site não chama o Brevo.

`leads.create` (público) nunca escreve consentimento: `newsletter*`,
`nl-pending-*` e `nl-unsubscribed-*` passam a `nl-legacy-*`.

## O que o lead guarda (`metadata`)

`flow: site-doi-v1`, `origin`, `locale`, `page` (caminho limpo), `pageKind`,
`trigger` e `device` (pop-up), `propertySlug`, `propertyName` e `listingId`
(só casas geridas pela PA, resolvidas no servidor pelo slug), `alertListingId`
(só quando o formulário prometeu o aviso dessa casa), `country`
(`cf-ipcountry`), `consent`, `consentAt`, `consentVersion`, `consentText` (a
frase exata mostrada, com a ligação à política de privacidade), `confirmedAt`,
`confirmVia`, `confirmDelaySec`, `confirmUa`, `confirmSuspect` e
`firstConfirmedAt` (ver "Scanners que correm a página"), `interest` e
`interestAt` (pergunta opcional), `unsubscribedAt`, `expiredAt`. Com o
consentimento "Aceitar tudo" do banner, também a origem da visita (UTM, tipo
de clique, referrer, página de entrada); sem ele, `visitConsent: false` e
nada mais.

O email nunca vai para URLs, logs nem mensagens de erro: os links levam o id do
lead e um token; os erros da base registam só a classe e o código do driver
(`safeErrorLabel`).

## Pop-up

Regras puras em `shared/newsletter.ts`, testadas em `server/newsletter-rules.test.ts`:

- Nunca antes da escolha no banner de cookies. Nunca no checkout, reservas,
  páginas legais, conta, admin, contacto, proprietários, carreiras.
- Nunca a quem já subscreveu (qualquer formulário, ou a página de confirmação
  ou de saída nesse navegador) nem a quem o viu nos últimos 30 dias (fechar
  conta). Nunca numa visita que veio de um email nosso (`utm_source=email`,
  `utm_medium=email|recovery`), e durante 180 dias a quem já conhecemos: essa
  visita, a página de agradecimento de uma reserva e a caixa da newsletter no
  checkout gravam `pa_nl_known_at` (`newsletterBrowser.ts`).
- Nada fica gravado no navegador antes da escolha no banner de cookies: a
  marca da visita que veio de um email e a de "já conhecido" ficam em memória
  (sobrevivem à navegação dentro do site) e só passam para o `localStorage`
  depois da escolha. A marca "subscreveu" (`pa_nl_subscribed`) é gravada
  quando a pessoa subscreve ou confirma, porque serve o que ela própria pediu.
- Computador: aos 8 segundos no site ou na intenção de saída (o rato sai
  pelo topo, depois de 2 s na página). Caixa central, fecha com o X, "Agora
  não", Esc ou clique fora.
- Telemóvel e tablet tátil: aos 40% da página ou aos 15 segundos aparece uma
  faixa de 60 px em baixo, sem fundo escuro: uma linha curta ("Novidades e
  promoções das nossas casas"), o botão "Subscrever" e o X. O formulário, com
  a frase de consentimento, só abre quando a pessoa carrega em "Subscrever";
  aberto, pode ocupar mais (foi pedido), faz scroll por dentro e o X fica
  fixo no topo. A faixa só aparece se ela e a barra de reserva da casa
  couberem juntas em 30% da altura visível (`window.innerHeight`, a altura
  dinâmica; nunca `vh`, que no iOS é a grande): num iPhone 14 no Safari (664
  px) a faixa com a barra ocupa entre 22% e 26%; num iPhone SE no Safari (553
  px), numa casa, a faixa só aparece se a barra tiver menos de 102 px, e
  senão fica o bloco da casa na página (`stripFits`).
  Fica acima da barra de reserva (z-40) e abaixo de qualquer sobreposição
  (z-45; gavetas, diálogos, menu e banner de cookies estão em z-50 ou acima).
  Fecha com o X, Esc, qualquer navegação, um toque na barra de reserva e logo
  que outra sobreposição abre (gaveta de reserva, filtros, calendário, menu,
  banner de cookies reaberto pelo rodapé): a folha não é modal e sem isto
  ficava visível por cima da gaveta e sem responder ao toque.
- `?nl=1` no URL de entrada (um anúncio que promete a inscrição): abre logo
  depois da escolha de cookies, ignorando os 30 dias e a marca "já
  conhecido". Só nas línguas de `NEWSLETTER_LOCALES`: um anúncio com `?nl=1`
  numa página `/es` antes de o espanhol estar ligado não abre nada.
- Nunca por cima de outro diálogo, gaveta, menu, do banner de cookies, do
  formulário "sem disponibilidade" nem enquanto a pessoa escreve num campo.

**Porque não é "ao abrir".** O Google penaliza no telemóvel os intersticiais
intrusivos que tapam o conteúdo logo à chegada; um pop-up ao abrir tapava
também o banner de cookies (que tem de vir primeiro) e a primeira impressão da
casa. O pop-up só é descarregado depois do gatilho (nada no HTML da página,
sem custo de LCP nem CLS) e, no telemóvel, é uma faixa de 60 px que não tapa
a página; o formulário só abre a pedido.

## Página de cada casa: interesse ou aviso

Nas casas geridas pela PA (com id do Guesty; nunca nas de parceiros) o bloco e
o pop-up falam da casa e o servidor regista-a como interesse. Duas versões:

- `NEWSLETTER_HOUSE_ALERTS` desligado (por defeito): "Gostou desta casa?
  Receba as novidades e as promoções das nossas casas." e "Deixe o seu email:
  fica registado o seu interesse nesta casa." (desde a segunda revisão, sem
  "Datas que abrem", que se lia como o aviso por casa da outra versão). A
  casa fica registada (`listingId`, atributo `house_interest` na Mailing
  List, `CASA_INTERESSE_ID` no Brevo) para os segmentos e, se as boas-vindas
  forem aprovadas, para escolher as casas do segundo email. Não promete
  datas desta casa.
- `NEWSLETTER_HOUSE_ALERTS=true`: "Quer saber quando esta casa tiver datas
  livres ou preço de época baixa? Deixe o seu email e avisamos." É uma
  promessa: o lead guarda `alertListingId` (atributo `house_alert` na Mailing
  List) e o CRM tem de escrever a essas pessoas quando a casa tiver datas
  livres ou preço de época baixa. Liga-se no Render, sem deploy, depois de o
  Ricardo aprovar essa regra.

## Medição

Só com "Aceitar tudo" (`pushDL`), nunca o email nem um hash:

| Evento | Parâmetros |
| --- | --- |
| `newsletter_signup` | `lead_source: newsletter-<origem>`, `newsletter_origin`, `newsletter_trigger`, `newsletter_device`, `page_kind` |
| `newsletter_popup_shown` | `newsletter_trigger`, `newsletter_device`, `page_kind` |
| `newsletter_popup_closed` | `close_reason` (`x`, `esc`, `backdrop`, `not_now`, `navigation`, `yield`), `newsletter_trigger`, `newsletter_device`, `after_signup` |

A resposta à pergunta de interesse (tipo de estadia) **não** vai para o
`dataLayer`: é uma preferência declarada pela pessoa e chegaria às etiquetas
do GTM, incluindo o Pixel da Meta. Fica no lead e no funil do admin. Os dois
eventos do pop-up (`shown` e `closed`) não levam nada pessoal e servem para
medir o pop-up; ficam se o Ricardo os aceitar (ver "Decisões em aberto").

**Porque não é `generate_lead`.** Os outros formulários do site usam
`generate_lead`. Uma etiqueta do GTM que dispare em `generate_lead` sem filtro
(a conversão de lead, a regra do e-google "300 € sem lead nem reserva", o
`Lead` do Pixel da Meta) contaria cada inscrição do pop-up como um pedido de
venda, com muito mais volume do que o rodapé antigo, e a licitação deixaria
de otimizar para reservas. Por isso a inscrição tem evento próprio. No GTM
(sem acesso da AI): etiqueta GA4 para `newsletter_signup`; no Google Ads, se
entrar, só como conversão secundária (observação); na Meta, um evento que não
seja o `Lead` das campanhas de conversão. Até lá, as inscrições contam-se no
admin (abaixo).

## Para aprender

- **Admin** (`/admin/leads`, cartão "Newsletter, last 30 days"): inscrições,
  confirmadas, taxa de confirmação, duplas confirmações, à espera e saídas,
  por origem, gatilho, dispositivo, tipo de página, `utm_source` e interesse
  (`newsletter.stats`; `summariseNewsletterFunnel` em `shared/newsletter.ts`).
- **PA Mailing List**: o coletor junta as mesmas contagens (só números) ao
  `audit_counts.json` de cada snapshot, na chave `website_newsletter`, que o
  pa-marketing lê com `mailing_list.read_status`. É por aí que a AI as lê.

## Configuração

Ver `.env.example`, secção "Newsletter do site". Os formulários só aparecem no
site ao vivo com `DATABASE_URL` e `RESEND_API_KEY`; em previews ficam
escondidos (e os POST são recusados). `NEWSLETTER_LOCALES` (por defeito `pt`)
escolhe as línguas do pop-up e dos blocos; o rodapé segue as mesmas línguas,
a menos que `NEWSLETTER_FOOTER_LOCALES` diga outras. Com os valores por
defeito, as outras 8 línguas ficam sem inscrição nenhuma (o rodapé antigo,
sem confirmação, existia nas 9): para ES e EN é uma regressão, registada nas
"Decisões em aberto" com dono e data. Antes da revisão nativa, abrir outras
línguas é uma decisão do Ricardo. A origem da visita só fica guardada com a
inscrição nas línguas cuja política de privacidade o diz
(`privacy.s2OriginBody`, hoje só PT; `NEWSLETTER_VISIT_ORIGIN_LANGS` em
`shared/newsletter.ts`, e um teste confere que os dois batem certo): abrir o
espanhol ou o inglês não guarda nada que a política dessa língua não
anuncie. O email de confirmação sai na língua de quem subscreveu (`<html
lang>` e a assinatura do rodapé dos emails de recuperação).

O servidor manda a configuração já na renderização (SSR), por isso a faixa do
rodapé e os blocos vêm no HTML e nada salta depois da hidratação.
`NEWSLETTER_POPUP=false` desliga só o pop-up.

Para ver o visual localmente: `NEWSLETTER_UI_PREVIEW=true npm run dev` (as
inscrições falham, é só para ver).

## Textos

PT revisto (copy-review) e à espera do ok do Ricardo. A 28 de setembro, na
segunda revisão, saiu a promessa "Poucos emails" de todas as superfícies (não
há cadência menor para os subscritores do site: confirmação e boas-vindas dão
4 emails nos primeiros 10 dias) e, nas casas, saiu "Datas que abrem" (lia-se
como o aviso por casa que está desligado); a copy-review foi repetida (registo no pa-marketing,
`c-site/research/2026-09-28-captacao-copy-review.md`). A frase de
consentimento não mudou. As outras oito línguas foram traduzidas a partir do
PT e revistas, com revisão nativa pendente:
chaves `newsletter.*` nos ficheiros de `client/src/i18n/locales/`, frase de
consentimento em `shared/newsletter.ts`, email e páginas em
`server/services/newsletter-copy.ts`. A frase de consentimento tem versão
(`NEWSLETTER_CONSENT_VERSION`): muda-se a versão quando se muda a frase.

## Ordem de publicação

1. `pa-mailing-list#5` primeiro: é compatível com o site de hoje (as fontes
   antigas dão o mesmo âmbito de antes).
2. Depois este PR. Ao contrário, mesmo por umas horas, o coletor antigo não
   conhece `nl-unsubscribed-*` (quem sai pelo site continuava elegível) e
   põe os `nl-pending-*` no catálogo como pessoas e emails, que o #5 depois
   já não apaga.
3. Antes de ligar `ROBOT_BASE` na fase 2 do pa-marketing (pontos de acesso):
   o par (`website_lead`, `newsletter-doi`) no `DOUBLE_OPT_IN` do
   `pa-mailing-list#4`.

## Decisões em aberto (Ricardo)

- Inscrições antigas do rodapé e da home (sem confirmação) e a caixa do
  checkout: continuam a contar como consentimento no carrinho abandonado e
  como opt-in simples na Mailing List. Opções: deixar como está (as máquinas
  pedem dupla confirmação por defeito e deixam-nos de fora), pedir uma vez a
  confirmação aos antigos (um envio, passa pelo gate) e, no checkout, mandar
  o email de confirmação quando a caixa é marcada.
- **ES e EN sem inscrição até à revisão nativa (regressão).** O rodapé antigo
  existia nas 9 línguas; com `NEWSLETTER_LOCALES=pt` o espanhol e o inglês
  ficam sem nenhum ponto de inscrição, com a onda ES a começar a 12 de
  outubro. A revisão nativa tem de cobrir o conjunto curto de cada língua:
  chaves `newsletter.*` do JSON, a frase de consentimento
  (`shared/newsletter.ts`) e o email e as páginas
  (`server/services/newsletter-copy.ts`), cerca de uma hora do revisor. Dono:
  Ricardo (arranjar o revisor, TODO(humano) em `ops/ACCESS.md` do
  pa-marketing). Reabertura: segunda 12 de outubro, com
  `NEWSLETTER_LOCALES=pt,es,en` no Render. O anúncio (b) na Galiza fica preso
  a essa data (um `?nl=1` numa página `/es` antes disso não abre nada). A
  origem da visita já não depende disso: sem a linha na política da língua,
  não fica guardada.
- Rodapé nas outras seis línguas antes da revisão nativa
  (`NEWSLETTER_FOOTER_LOCALES`).
- Aviso por casa (`NEWSLETTER_HOUSE_ALERTS`).
- **Saídas feitas no Brevo e o carrinho abandonado.** Quem sai num email do
  Brevo (boas-vindas ou Newsletter) sai do Brevo, mas a tabela `leads` do
  site não sabe: `hasNewsletterConsent` continua a dizer sim e os contactos 3
  e 4 do carrinho abandonado (marketing) podem sair para quem retirou o
  consentimento. Já acontecia com o rodapé antigo; o pop-up aumenta muito a
  base. Saídas possíveis: `hasNewsletterConsent` consultar
  `growth.contact_exclusions` ou o Brevo (o spec de 26 de setembro previa
  isto), ou a sessão de CRM passar as saídas do Brevo para
  `nl-unsubscribed-*` no site.
- Eventos `newsletter_popup_shown` e `newsletter_popup_closed` no
  `dataLayer` (sem nada pessoal, para medir o pop-up): ficam se o Ricardo os
  aceitar; tirá-los é uma linha em `NewsletterPopupGate.tsx`.
