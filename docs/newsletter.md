# Newsletter: captação no site com dupla confirmação

Rascunho de 26 de setembro de 2026 (ramo `claude/newsletter-capture`, PR em rascunho).
Não publicar antes do ok do Ricardo: os textos em português esperam pelo bloco de
aprovações de quarta 30 de setembro; espanhol e inglês esperam por revisão nativa.

## O que faz

Três superfícies, um formulário (`client/src/components/marketing/NewsletterForm.tsx`):

| Superfície | Onde | Origem (`source` do lead) |
|---|---|---|
| Pop-up | Todas as páginas elegíveis, aos 20 s ou a 50% de scroll | `nl-pending-popup` → `newsletter-popup` |
| Bloco inline | Fim da página de cada casa e fim de cada artigo do Diário | `nl-pending-house` / `nl-pending-article` → `newsletter-house` / `newsletter-article` |
| Rodapé | Todas as páginas | `nl-pending-footer` → `newsletter-footer` |

O formulário tem email, caixa de consentimento desligada por defeito com link para
`/legal/privacy`, honeypot e o evento `generate_lead` com `lead_source: newsletter-<origem>`.

## O fluxo

1. `newsletter.subscribe` (tRPC, `server/routers/newsletter.ts`): normaliza o email,
   rejeita os endereços de plataforma (`guest.airbnb.com`, `guest.booking.com`,
   `m.expediapartnercentral.com`), resolve a casa pelo slug no servidor, guarda um lead
   **pendente** com a prova do consentimento (`metadata.consentAt`, `page`, `origin`,
   `country` do cabeçalho `cf-ipcountry`) e pede ao Brevo a dupla confirmação
   (`POST /v3/contacts/doubleOptinConfirmation`, modelo por língua, `redirectionUrl`
   com o id do lead e um HMAC). O email nunca vai num URL nem numa linha de log.
2. O Brevo envia o email de confirmação de `reservas@news.portugalactive.com` e só põe o
   contacto na lista Newsletter depois do clique.
3. `GET /api/newsletter/confirmed?lead=<id>&t=<hmac>&lang=<pt>`
   (`server/routes/newsletter-confirm.ts`): verifica o token em tempo constante, promove o
   lead a `newsletter-<origem>` (`metadata.confirmedAt`), dispara o boas-vindas uma só vez
   (claim em `metadata.welcomeAt`) e redireciona, sem cache, para
   `/<lang>/newsletter/confirmada`, uma página estática de marca (`server/lib/brand-page.ts`,
   partilhada com o opt-out do carrinho abandonado).
4. Boas-vindas: `NEWSLETTER_WELCOME_MODE=event` dispara o evento `newsletter_confirmada`
   com as propriedades pré-calculadas (`LINHA_INTERESSE`, `LINHA_OFERTA`, `CODIGO_PROMO`,
   `CODIGO_VALIDADE_TXT`, `WA_LINK_NL`) e a automação do Brevo envia o modelo da língua;
   `transactional` envia o modelo por `POST /v3/smtp/email` (plano B); `off` não envia.

As fontes pendentes chamam-se `nl-pending-*` de propósito: `hasNewsletterConsent` faz
`LIKE 'newsletter%'` e desbloqueia os contactos 3 e 4 do carrinho abandonado, que uma
subscrição não confirmada nunca deve desbloquear.

## Regras do pop-up (`shared/newsletterPopup.ts`, testadas no servidor)

Só no cliente, depois de a escolha de cookies existir. Nunca em `/checkout`, `/booking`,
`/login`, `/account`, `/admin`, `/legal`, `/404`, `/newsletter`; nunca em línguas fora de
`NEWSLETTER_LOCALES`; nunca depois de subscrever (`pa_nl_subscribed`, escrito por
qualquer das três superfícies); uma vez por 30 dias por visitante (`pa_nl_popup_at`, fechar
conta); nunca na sessão em que a pessoa chegou por um email nosso (`utm_source=email`,
`utm_medium=email` ou `utm_medium=recovery`, guardado em `sessionStorage`); nunca por cima
do formulário "sem disponibilidade" da listagem (`data-nl-suppress`). Eventos no dataLayer:
`newsletter_popup_shown`, `newsletter_popup_closed` (motivo `x`, `esc`, `fundo`,
`agora_nao`), `generate_lead`.

## Configuração (Render Production, nunca dev nem previews)

Ver o bloco "Newsletter" em `.env.example`. Sem `BREVO_API_KEY`, `BREVO_NEWSLETTER_LIST_ID`
e `BREVO_DOI_TEMPLATE_ID_PT` o endpoint responde 503 (`NEWSLETTER_NOT_CONFIGURED`) e o
pop-up fica escondido; o bloco e o rodapé continuam visíveis e mostram o erro genérico ao
submeter. Em dev e previews as chaves são recusadas no arranque e qualquer POST devolve 503:
o teste real faz-se em www.portugalactive.com com um endereço da equipa.

`NEWSLETTER_LOCALES` arranca só com `pt`. As chaves `newsletter.*` das outras oito línguas
levam o inglês como recurso técnico (`node scripts/sync-i18n.mjs --fix`, deliberado) e não
são mostradas enquanto a língua não entrar em `NEWSLETTER_LOCALES` depois da revisão nativa.

## Medidas

Leads por origem e página no back-office (`/admin/leads`, `db.getLeadStats` conta
`newsletter%`), `metadata.confirmedAt` para a taxa de confirmação, contagens no log
(`[Newsletter] ...`, sem endereços), eventos do dataLayer quando o GA4 tiver as tags. A
leitura diária para a base analítica do marketing (`growth.leads`, `growth.guests`) é do
repositório pa-marketing (`b-crm/jobs/newsletter_sync.py`, por construir).

## Testes

`server/services/newsletter.test.ts` (regras, token, atributos, chamadas ao Brevo com
fetch simulado), `server/routers/newsletter.test.ts` (endpoint com base de dados e catálogo
simulados), `server/routes/newsletter-confirm.test.ts` (rota de confirmação e página),
`server/services/newsletter-popup-gate.test.ts` (uma vez por 30 dias, nunca depois de
subscrever, rotas e línguas).
