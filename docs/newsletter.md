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
| 2. Clique no email | `GET /api/newsletter/confirm` verifica o token (HMAC, 7 dias) e mostra uma página que envia logo um `POST` (botão de recurso sem JavaScript); o `POST` promove o lead, com `confirmedAt` e os sinais de quem confirmou. Um scanner de email que só abre o link não confirma nada | `newsletter-<origem>` |
| 3. Saída, sempre | `GET /api/newsletter/unsubscribe` mostra um botão; o `POST` tira o consentimento a todos os leads do endereço | `nl-unsubscribed-<origem>` (o do checkout volta a `checkout`) |
| Sem clique em 8 dias | `expireNewsletterPending` (2 min depois do arranque e de 6 em 6 horas) tira o endereço, o nome e o telefone e guarda só os campos que o funil conta | `nl-expired-<origem>` |

Origens: `popup`, `house`, `article`, `footer`.

### Scanners que correm a página

Alguns filtros de email (Defender Safe Links em detonação, Mimecast,
Proofpoint) abrem o link numa sandbox que executa JavaScript e acabam por
enviar o `POST`. O `POST` guarda por isso `confirmDelaySec` (segundos desde o
formulário), `confirmUa` (user agent, cortado a 160 caracteres, nunca nos
logs) e `confirmVia` (`auto` quando a página se enviou sozinha, `click` pelo
botão). Uma confirmação com user agent vazio ou de robô, ou a menos de 10
segundos do formulário, fica com `confirmSuspect: 1`: o lead fica confirmado
(a pessoa preencheu o formulário), mas a jusante conta como opt-in simples,
nunca como dupla confirmação, e não vai para o Brevo. Um clique posterior que
pareça humano tira a marca (`firstConfirmedAt` guarda a primeira data).

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
  - Tudo isto está no PR #5 do `pa-mailing-list`, que tem de entrar ao mesmo
    tempo que este, e o nível no ramo `claude/captacao-newsletter` do
    pa-marketing.
- **Carrinho abandonado**: `hasNewsletterConsent` (`LIKE 'newsletter%'`)
  desbloqueia os contactos 3 e 4, como antes desta mudança; um pendente não
  desbloqueia. Isto inclui as inscrições antigas sem confirmação e a caixa do
  checkout: se também elas precisam de confirmação é uma decisão do Ricardo
  (ver "Decisões em aberto").
- **Brevo**: a lista Newsletter do Brevo é mantida a partir da Mailing List
  (robô "Base de hóspedes" do pa-marketing). Com `BREVO_API_KEY` e
  `BREVO_NEWSLETTER_LIST_ID` no site, quem confirma (sem marca de scanner)
  entra também logo na lista e quem sai é retirado; sem elas o site não chama
  o Brevo.

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
  `utm_medium=email|recovery`).
- Computador: aos 8 segundos no site ou na intenção de saída (o rato sai
  pelo topo, depois de 2 s na página). Caixa central, fecha com o X, "Agora
  não", Esc ou clique fora.
- Telemóvel e tablet tátil: folha pequena em baixo, no máximo 45% do ecrã,
  sem fundo escuro, a página continua usável; aos 40% da página ou aos 15
  segundos. Fecha com o X ou Esc; qualquer navegação fecha.
- `?nl=1` no URL de entrada (um anúncio que promete a inscrição): abre logo
  depois da escolha de cookies, ignorando os 30 dias.
- Nunca por cima de outro diálogo, do formulário "sem disponibilidade" nem
  enquanto a pessoa escreve num campo.

**Porque não é "ao abrir".** O Google penaliza no telemóvel os intersticiais
intrusivos que tapam o conteúdo logo à chegada; um pop-up ao abrir tapava
também o banner de cookies (que tem de vir primeiro) e a primeira impressão da
casa. O pop-up só é descarregado depois do gatilho (nada no HTML da página,
sem custo de LCP nem CLS) e, no telemóvel, é uma folha pequena que não tapa a
página.

## Página de cada casa: interesse ou aviso

Nas casas geridas pela PA (com id do Guesty; nunca nas de parceiros) o bloco e
o pop-up falam da casa e o servidor regista-a como interesse. Duas versões:

- `NEWSLETTER_HOUSE_ALERTS` desligado (por defeito): "Gostou desta casa?
  Receba as novidades e as promoções das nossas casas." A casa fica registada
  (`listingId`, atributo `house_interest` na Mailing List) para os segmentos.
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
| `newsletter_interest` | `newsletter_origin`, `newsletter_interest` |
| `newsletter_popup_shown` | `newsletter_trigger`, `newsletter_device`, `page_kind` |
| `newsletter_popup_closed` | `close_reason`, `newsletter_trigger`, `newsletter_device`, `after_signup` |

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
a menos que `NEWSLETTER_FOOTER_LOCALES` diga outras. Antes da revisão nativa,
abrir o rodapé noutras línguas é uma decisão do Ricardo, e cada língua precisa
primeiro da linha da origem da visita na sua política de privacidade
(`privacy.s2OriginBody`, hoje só em PT). O email de confirmação sai na língua
de quem subscreveu (`<html lang>` e a assinatura do rodapé dos emails de
recuperação).

O servidor manda a configuração já na renderização (SSR), por isso a faixa do
rodapé e os blocos vêm no HTML e nada salta depois da hidratação.
`NEWSLETTER_POPUP=false` desliga só o pop-up.

Para ver o visual localmente: `NEWSLETTER_UI_PREVIEW=true npm run dev` (as
inscrições falham, é só para ver).

## Textos

PT revisto (copy-review) e à espera do ok do Ricardo. As outras oito línguas
foram traduzidas a partir do PT e revistas, com revisão nativa pendente:
chaves `newsletter.*` nos ficheiros de `client/src/i18n/locales/`, frase de
consentimento em `shared/newsletter.ts`, email e páginas em
`server/services/newsletter-copy.ts`. A frase de consentimento tem versão
(`NEWSLETTER_CONSENT_VERSION`): muda-se a versão quando se muda a frase.

## Decisões em aberto (Ricardo)

- Inscrições antigas do rodapé e da home (sem confirmação) e a caixa do
  checkout: continuam a contar como consentimento no carrinho abandonado e
  como opt-in simples na Mailing List. Opções: deixar como está (as máquinas
  pedem dupla confirmação por defeito e deixam-nos de fora), pedir uma vez a
  confirmação aos antigos (um envio, passa pelo gate) e, no checkout, mandar
  o email de confirmação quando a caixa é marcada.
- Rodapé nas outras oito línguas antes da revisão nativa
  (`NEWSLETTER_FOOTER_LOCALES`).
- Aviso por casa (`NEWSLETTER_HOUSE_ALERTS`).
