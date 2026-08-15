# Checkout 2.0 — Relatório de testes para validação de go-live

Escrito a 15 ago 2026, no branch `dev` (dev.portugalactive.com). Tudo o que está marcado ✅ foi executado e verificado com evidência (screenshots, respostas de API, ficheiros gerados). O que está em ⚠️ é o que falta exercitar antes de abrir tráfego real com extras.

---

## 1 · Teste E2E de pagamento real (13 ago) — o teste central ✅

Caso: **Villa Aura, 11→16 jan 2027, 4 hóspedes**, no dev com chaves Stripe TEST.

- ✅ Funil completo pela UI real: widget → calendário (jan 2027) → quote Guesty real (2 976 €) → intent `2d947d6c…` → passos 1/2/3.
- ✅ Cabaz: receção presencial 50 € · transfer Porto 120 € · breakfast box 4p×5d 500 € · berço INCLUÍDO · **Flex 263 € (10% dinâmico de 2 631 € — valor não-redondo a provar o cálculo)**.
- ✅ Botão de pagar = **total canónico do servidor: 3 909 €** (recomputado por `computeChargeBreakdown`, nunca do cliente).
- ✅ Cartão 4242 → **UM PaymentIntent de plataforma: `pi_3U407ZGsqyDlHBJE0iDfIvbD`, 3 909,17 €**.
- ✅ **Reserva Guesty `GY-HJRLeSPt` criada SÓ com a estadia**: hostPayout 2 712,47 €, balanceDue 0, pago como *Stripe external payment* (verificado por API, `scripts/check-reservation-payment.mjs`). **Os ~1 196 € de serviços nunca entraram no Guesty → fora da divisão com os owners.** É a prova da decisão "bolo à parte".
- ✅ Manifesto do CS recebido em booking@ com as 5 ações por ordem e valores canónicos (incl. Flex 263 €).
- ✅ Thank-you com código Guesty e método cartão.
- ✅ **Limpeza verificada por API**: refund total `re_3U407Z… succeeded 3 909,17 €` + reserva `status=canceled`, hostPayout 0 — calendário da Aura libertado.
- 🐛→✅ O teste apanhou um bug real: `confirmPayment` sem billing country (o Element esconde o campo, herança do legacy) → IntegrationError. Corrigido em `5e6974b`; sem este teste, o primeiro hóspede real teria batido nisto.

## 2 · Merge produção→dev + SSR minucioso (12 ago) ✅

- ✅ Merge dos 80 commits da main (SSR, perf, SEO slugs, contraste): só 3 conflitos, resolvidos ficando o melhor de cada lado; build verde.
- ✅ SSR: homepage renderizada no servidor com estado React Query; página de casa real com título/JSON-LD VacationRental/widget no HTML.
- ✅ **Checkout fica FORA do SSR por construção** (shell CSR + `noindex` em todas as rotas /checkout/*): sem PII no cache SSR, sem risco de hidratação no caminho do dinheiro.
- ✅ Hidratação sem um único erro de consola; logs do servidor sem falhas `[SSR]`.
- ✅ Funil re-verificado no build fundido (case=full: ordem A mesa→A casa, pets em escalão, total 4 565 € exato em headless).

## 3 · Auditorias e correções anteriores ao teste ✅

- ✅ Auditoria de funil multi-agente (43 agentes, cada achado verificado adversarialmente): 25 confirmados, os críticos corrigidos — extras persistem a cada alteração (refresh não perde nada), clamp de dias em requote, Flex auto-remove abaixo do limiar, cupão re-aplica em requote, gate de pets fechado também na API e na cobrança.
- ✅ Matemática canónica com teste unitário (caso composto 4 445 €, clamp, tier de pets 50/150, adulteração detetada).
- ✅ Emails: 9 línguas com teste automático (recovery+confirmação completos em todas; **zero vocabulário "seguro/insurance/…" em qualquer língua**); preheaders; opt-out RGPD da recuperação com HMAC em tempo constante.
- ✅ Blocos 1–6 do cowork revistos linha a linha antes do push (validação canónica Klarna/PayPal, refund por linha idempotente, wallets só com intentId, GA4 items[]).

## 4 · Polish visual 13–14 ago (verificado em build + previews) ✅

- ✅ Wallets sem duplicados: fila express só Apple/Google Pay; Klarna/PayPal só nos tabs.
- ✅ Passo 3 sem o bloco redundante "Reserva direta"; foto real da casa na thank-you.
- ✅ Emails: header creme com badge da marca (**imune ao dark mode do Gmail** que encaixotava o logo), rodapé de marca com contactos clicáveis e tagline, manifesto CS redesenhado (círculos numerados, urgente a vermelho, botão **ABRIR NO GUESTY** com link direto).
- ✅ Notas na reserva Guesty: o código escreve a lista completa de serviços ("SERVICOS DO CHECKOUT", com [CONFIRMAR 24H]) + a nota do split de pagamento — código confirmado; leitura visual no Guesty pendente (⚠️ abaixo).

## 5 · O que FALTA exercitar antes do go-live ⚠️

1. **Charge por wallet** — Google Pay renderiza (provado) mas nunca cobrámos por wallet; Apple Pay não aparece até registar `dev.portugalactive.com` (e depois www) em Stripe → Settings → Payment method domains.
2. **Confirmação do hóspede end-to-end** — no teste fez bounce porque o 1Password sujou o email (artefacto do teste, o manifesto do mesmo hook saiu); repetir uma reserva de teste com email limpo e validar o email premium recebido.
3. **Recovery 1h/20h ao vivo** — nunca observado a sair no dev apesar de RESEND_API_KEY existir; investigar logs do scheduler (`[Recovery]`) no Render.
4. **Klarna e PayPal com o total novo** — a validação canónica está no servidor, mas não houve teste E2E destes métodos pós-2b.
5. **Webhook de segurança do cartão** — `STRIPE_CARD_WEBHOOK_SECRET` + endpoint `payment_intent.succeeded` por criar no dashboard (o finalize síncrono está provado; o webhook é a rede).
6. **Refund parcial por linha** — CLI existe (dry-run por omissão), nunca exercitado com um PI real.
7. **Notas na reserva Guesty** — confirmar visualmente no separador Notes (reserva GY-HJRLeSPt, mesmo cancelada as notas persistem).
8. **7 línguas novas de emails** — passaram no teste automático; falta o olho humano de marca.

## 6 · Checklist de go-live (engenharia)

1. Envs de produção: chaves Stripe **live** + webhook secrets live (klarna/paypal/card), `EMAIL_FROM=booking@portugalactive.com` (hoje está info@ no dev), `BOOKING_ALERT_EMAIL` → caixa da equipa, `CHECKOUT_PROMO` (decidir), `CHECKOUT_RECOVERY` (decidir), `RESEND_API_KEY` com domínio verificado.
2. Apple Pay: registar domínios (test já; live no lançamento).
3. Cosmético: `source` da reserva Open API diz `website-paypal` → mudar para `website-direct` (uma linha em `guesty-openapi-paypal.ts`).
4. GTM: criar as tags de `docs/marketing-tracking.md` (sem elas o funil não chega ao GA4/Meta).
5. Merge `dev`→`main` com `CHECKOUT_V2` desligado (produção não muda), smoke em produção com `?checkoutv2=1`, e só então `CHECKOUT_V2=true`. **Rollback = desligar a flag** (instantâneo).

## 7 · Fora da engenharia (decisões/pessoas)

Preços reais dos extras (Susana/Diogo) · fatura separada dos serviços (contabilista) · respostas da equipa ao PDF de validação · dono das confirmações de 24h. O Flex está legalmente aprovado pelo André (copy + 10% dinâmico).

---

**Veredicto sugerido:** o núcleo (cobrança única, separação de receita, funil, emails, SSR) está **testado com evidência e pronto**. Os 8 itens do §5 são exercícios de 1–2 horas no dev, não construção. Recomendo fechá-los, repetir UMA reserva de teste limpa (email correto + um wallet), e avançar com o merge.
