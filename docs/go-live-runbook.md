# Checkout 2.0 — Runbook de Go-Live (16 ago 2026)

Para executar a dois (Ricardo + colaborador). Contexto completo: `docs/HANDOVER.md`, `docs/checkout_test_report.md`.

## ✅ ESTADO 15 ago, 22h30 — MERGE FEITO, produção com flag desligada

- **Merge `dev`→`main` feito e em produção** (`00f9334`, deploy live 22:19). Site público inalterado (`CHECKOUT_V2` ausente). Boot de produção limpo: migrações OK, tokens Guesty quentes, tráfego normal.
- **Teste E2E final no dev (15 ago, 22h)**: funil completo → cartão 4242 → PI único 3 364,17 € → reserva Guesty `GY-bn8NMB6W` SÓ com a estadia (2 729,87 €, Fully paid, channel website-direct) → **email de confirmação do hóspede recebido e verificado** (código Guesty, breakdown canónico, Sara) → manifesto CS recebido em booking@ → notas "SERVICOS DO CHECKOUT" confirmadas visualmente no Guesty → reserva cancelada + refund `re_3U4oeoGsqyDlHBJE0Jt4e3Q5` de 3 364,17 € succeeded. **Recovery 1h observado ao vivo** no mesmo período.
- O teste apanhou e corrigiu 2 bugs reais de produção (`5ecb59e`): race do Guesty pós-criação (balanceDue ilegível → pagamento recusado) e settle não-retomável (risco de 2.ª reserva num retry). Settle agora carimba a reserva de imediato e é retomável.
- **Smoke produção**: homepage 200 · `/.well-known/apple-developer-merchantid-domain-association` 200 (9094 bytes) no www · API checkout viva (extras + Flex 10% + limpezas por listing).

## ✅ ATUALIZAÇÃO 15 ago, 23h — TUDO AUTOMATIZADO E VERIFICADO; FALTA SÓ A FLAG

Feito e confirmado nos logs do boot de produção (22:56, deploy `fc5881e`):
- **Apple Pay live registado sozinho**: `www.portugalactive.com` E `portugalactive.com` (apex), `apple_pay=active` — o código agora tem fallback www, a env `SITE_URL` foi removida do Production (dev mantém a sua).
- **Webhook do cartão AUTO-REGISTADO em modo live**: `[CardWebhook] endpoint criado e secret guardado (live) — https://www.portugalactive.com/api/webhooks/stripe-card`. O signing secret vive na tabela `app_config` (nunca passou por mãos humanas); o mesmo aconteceu no dev em modo test. NÃO é preciso criar nada no dashboard do Stripe.
- **`EMAIL_FROM` removida** → default do código `Portugal Active <booking@portugalactive.com>` em produção e dev.
- **Links de emails corrigidos**: a cadeia de URLs usa `SITE_URL` e cai para `www.portugalactive.com` (antes, produção geraria links para dev.portugalactive.com).
- Feedback da equipa aplicado: nota de cobrança reordenada (fim da leitura contraditória nas experiências), chef com menu de mercado/bebidas não incluídas, babysitter na casa dia=noite, vans com nota de bagagem desportiva — nas 9 línguas; assinatura da Sara redesenhada (cartão com hairline dourada).

### Para LIGAR (o único passo restante — 20 segundos no dashboard)
Render → serviço **Production** → Environment → Edit → **Add variable** → `CHECKOUT_V2` = `true` → Save, rebuild, and deploy. (A automação parou aqui de propósito: a página de envs contém segredos e o assistente não escreve nela.)
Depois do deploy: primeira reserva real pequena vigiada (Stripe live + Guesty + emails). **Rollback = apagar a flag** (instantâneo, volta ao legacy).

Pendentes não-bloqueantes: `BOOKING_ALERT_EMAIL` no Production = caixa real da equipa CS (hoje default booking@) · sheet do Google Pay e botão Apple Pay em Safari confirmados por um humano · GTM (docs/marketing-tracking.md).

Verificações humanas que só o Ricardo pode fazer quando quiser: sheet do Google Pay (o botão renderiza — clicar e ver o sheet abrir), botão Apple Pay em Safari (após o fix do SITE_URL).

---

Histórico e detalhe por baixo (estado 15 ago de manhã).

Estado: **código pronto e testado em dev com pagamento real de teste** (E2E de 13 ago: PI único 3 909 €, reserva Guesty só com a estadia, manifesto CS). Fixes de 15 ago já no dev: retry retoma o mesmo PI (fim da dupla cobrança), Apple Pay com registo automático de domínio, `source: website-direct`.

## 0 · Limpeza pendente de testes (fazer ANTES do merge, com OAuth fresco)
- Cancelar no Guesty a reserva de teste **Villa Aura 18–23 jan 2027** (criada hoje pelo settle; hóspede "Teste Wallet PA").
- Reembolsar TODOS os PIs de teste de **3 309,17 €** de 15 ago (1–2, modo teste) — Stripe test → Payments → refund.
- ~~Mistério `getIntent intent:null`~~ **RESOLVIDO (15 ago)**: a migração de boot do `payment_intent_id` nunca correu — o bloco anterior (`recovery_optout`) fazia `throw` em erros embrulhados pelo drizzle e abortava a cadeia; o drizzle passou a selecionar uma coluna fantasma e TODAS as leituras de intents devolviam null. Fix em `0ed6df8` (cada ALTER independente, regex cobre `.cause`); coluna adicionada à mão no dev via Web Shell. Produção adiciona a coluna sozinha no primeiro boot pós-merge — confirmar `[Migration] booking_intents.payment_intent_id column added` nos logs do Production.
- NÃO usar scripts avulsos contra o Guesty Open API (as 3 renovações OAuth/24h são partilhadas com produção — foi a causa dos 500 de dia 15).

## 1 · Pré-merge (dev, ~20 min)
1. **Webhook do cartão** (a rede de segurança que faltou no 500): Stripe **test** → Developers → Webhooks → add endpoint `https://dev.portugalactive.com/api/webhooks/stripe-card`, evento `payment_intent.succeeded` → colar o `whsec_` no Render b2c-dev como `STRIPE_CARD_WEBHOOK_SECRET`.
2. `EMAIL_FROM=booking@portugalactive.com` no b2c-dev (hoje sai info@).
3. Reserva de teste final no dev (casa barata, cartão 4242, 1 extra + Flex): confirmar **email de confirmação ao hóspede** (único ponto nunca observado end-to-end — os anteriores falharam por artefactos de teste, não por código), manifesto CS, thank-you com foto. Google Pay: clicar o botão e confirmar o sheet (o código está pronto; falta um humano no sheet). Apple Pay: abrir em Safari — o botão deve aparecer (domínio registado automaticamente dia 15).
4. Cancelar + reembolsar essa reserva de teste.

## 2 · Merge (produção NÃO muda nada neste passo)
```
git checkout main && git pull && git merge origin/dev && git push origin main
```
A flag `CHECKOUT_V2` fica **ausente/false** em produção → o site público continua no fluxo legacy. O deploy de main traz: emails com marca (todos os transacionais), widget compacto, fixes globais (sticky/formatos), rota Apple Pay — tudo retro-compatível e testado no dev.

## 3 · Envs de produção (serviço Production no Render)
| Env | Valor |
|---|---|
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` | **live** (já existem para o legacy — confirmar) |
| `STRIPE_CARD_WEBHOOK_SECRET` | novo endpoint **live** `https://www.portugalactive.com/api/webhooks/stripe-card` (payment_intent.succeeded) |
| `EMAIL_FROM` | `booking@portugalactive.com` (domínio verificado no Resend) |
| `BOOKING_ALERT_EMAIL` | caixa real da equipa CS |
| `CHECKOUT_PROMO` | omitir/false (campo promo escondido) até haver campanha |
| `CHECKOUT_RECOVERY` | omitir (ligado) — recovery já provado em dev |
| `SITE_URL` | `https://www.portugalactive.com` → **o boot regista o domínio Apple Pay live sozinho** (apex+www) |

## 4 · Smoke em produção com a flag ainda desligada
`https://www.portugalactive.com/pt/homes/<casa>?checkoutv2=1` (override 24h só para quem tem o link): percorrer os 3 passos até ao ecrã de pagamento **sem pagar**. Confirmar `/.well-known/apple-developer-merchantid-domain-association` responde 200 no www.

## 5 · Ligar
`CHECKOUT_V2=true` no serviço Production → redeploy. Primeira reserva real pequena feita por nós, seguida no Stripe live + Guesty + emails. **Rollback = apagar a flag** (instantâneo, volta ao legacy).

## 6 · Pós-live imediato
- GTM: criar as tags de `docs/marketing-tracking.md` (sem elas o funil não chega ao GA4/Meta).
- Klarna e PayPal: primeira transação real vigiada (validação canónica está no servidor; E2E nunca exercitado pós-2b).
- Owner statement da primeira reserva com extras: confirmar visualmente que só a estadia entra.
- Vigiar `[ApplePay]` e `[Card2b]` nos logs do Production no primeiro dia.

## Regras que não se violam
Extras nunca entram na reserva Guesty · Flex nunca se chama seguro · antes de pagar promete-se o preço, nunca as datas · código de confirmação é sempre o do Guesty · reembolso em dinheiro dentro da janela de cancelamento.
