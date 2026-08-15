# Checkout 2.0 — fluxo de integração para ir live (13 jul 2026)

Responde às três perguntas: como falamos com o Guesty, como o CS sabe, como se fatura discriminado. Valores afinam-se no fim.

## 1. Comunicação com o Guesty (por método de pagamento)

CARTÃO (hoje): quote BE → pm_ token Stripe → POST /quotes/{id}/instant — o GUESTY cobra a ESTADIA na conta Stripe conectada do listing. Extras/Flex/receção NÃO são cobrados (o total do resumo é desenho-alvo).
KLARNA/PAYPAL (hoje): Stripe da plataforma cobra a estadia → reserva via Open API reservations-v3 → recordExternalPayment.
DESDE HOJE (todos os métodos): quando o intent passa a paid, o servidor grava o manifesto de serviços na NOTA da reserva Guesty (best-effort) e envia a ficha ao CS.

ALVO 2b (cobrança única real) — decisão pendente do SPIKE (5 min, reserva de teste tua):
- Caminho A (invoice items): POST /v1/invoice-items/reservation/{id} (AFE, isUpsellFee) ANTES do pagamento → total da reserva Guesty sobe → UMA cobrança. Preferível se o Hostkit importar as linhas.
- Caminho B (fallback abençoado na spec §7): um único charge externo Stripe pelo total (estadia+extras+flex), reserva marcada paga fora — padrão que o Klarna já usa. needs_confirmation reembolsa a linha via refund parcial do PaymentIntent.
Correr: node scripts/spike-invoice-items.mjs --reservation <ID_TESTE> --execute (registos IRREVERSÍVEIS — só reserva de teste).

## 2. Como o CS sabe (implementado hoje)

- EMAIL "Ficha de serviços" para BOOKING_ALERT_EMAIL (booking@) em CADA reserva paga, todos os métodos: casa, datas, hóspede, receção, extras pagos com valores, pedidos a orçamentar, Flex, prazos ⚠️ CONFIRMAR 24H.
- NOTA na reserva Guesty com o mesmo manifesto (agora também Klarna/PayPal).
- SLACK (spec §12): pronto a ligar quando deres o webhook do canal de operações — substitui/duplica o email.
- Pendente teu: quem confirma os needs_confirmation e em que ferramenta (define o destino das tarefas 24h).

## 3. Faturação discriminada (bloqueada em ti — teste de 5 min)

Hostkit fatura (certificada AT) a partir do Guesty. Hostkit SUPORTA linhas com IVA por produto (alojamento 6% + serviços 23%). INCÓGNITA ÚNICA: o sync Guesty→Hostkit importa os invoice items discriminados ou só o total?
TESTE: adiciona um invoice item de 1€ a uma reserva de teste no Guesty e vê a fatura do Hostkit. → Linhas passam: caminho A fatura sozinho, discriminado. → Só total: faturamos extras via API Hostkit do nosso servidor (caminho B também serve). Perguntas ao contabilista: mesma fatura ou separada; IVA por categoria de extra; VAT intracomunitário (autoliquidação B2B).

## 4. Checklist para ir live (produção)

BLOQUEADORES (teus): [ ] spike invoice items · [ ] teste Hostkit 1€ · [ ] reserva de teste ponta a ponta no dev (cartão real barato + reembolso) · [ ] cupão real no Revenue Management p/ testar promo · [ ] valores finais (extras c/ Susana/Diogo, chef base, receção 50/90, Flex 250/1500) · [ ] copy Flex validado pelo André · [ ] GTM: tags para os eventos novos (GTM-TRPCDT3) · [ ] Apple Pay: pedir ao Guesty registo do domínio nas contas Stripe · [ ] webhook Slack (opcional) · [ ] decisão bundle D5 e chef B4 (valores)
ENGENHARIA (meus, por ordem): [ ] 2b cobrança única (após spike) c/ reembolso parcial testado · [ ] emails de recuperação 1h/20h (Fase 4) · [ ] email pré-chegada 10 dias (Fase 4) · [ ] Bloco B (tipologia, transfers por distância, chauffeur) · [ ] campo crianças no widget · [ ] merge dev→main quando disseres GO (produção fica legacy até CHECKOUT_V2=true)
