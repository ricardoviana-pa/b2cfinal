# Checkout 2.0 — tudo o que está pendente (12 jul 2026)

Estado: Fases 0, 1, 2 (UI), 2.1, Blocos A/C/D, CRM (CS + confirmação + recuperação + tracking) FEITOS e no dev. Falta o abaixo.

## A · CAMINHO CRÍTICO PARA IR LIVE — só tu podes (por ordem)
1. SPIKE invoice items (5 min): node scripts/spike-invoice-items.mjs --reservation <ID_TESTE> --execute → decide se a cobrança única usa invoice items (A) ou charge externo (B). Registos IRREVERSÍVEIS: só reserva de teste.
2. TESTE HOSTKIT (5 min): invoice item de 1€ numa reserva de teste no Guesty → a fatura sai discriminada? + contabilista: mesma fatura ou separada; IVA por categoria; VAT intra-UE (autoliquidação B2B).
3. RESERVA DE TESTE ponta a ponta no dev (casa barata, cartão real, reembolso a seguir) — valida funil, ficha CS, nota Guesty, email de confirmação, lead gravado. Bónus: retoma cross-device (abrir o link do checkout no telemóvel).
4. GTM (GTM-TRPCDT3): criar as tags do docs/marketing-tracking.md (sem isto os eventos não chegam ao GA4/Meta).
5. GUESTY: pedir registo do domínio para Apple Pay nas contas Stripe conectadas (dev. e www.).
6. CUPÃO de teste no Revenue Management do Guesty (só letras/números) para validar o promo real.
7. ENVs no Render: confirmar EMAIL_FROM (booking@) · CHECKOUT_PROMO=false esconde o campo promo · CHECKOUT_RECOVERY=false silencia a recuperação.
8. (Opcional) webhook do Slack de operações — substitui/duplica o email do CS.

## B · DECISÕES DE PRODUTO E VALORES — tuas ("valores no fim")
9. Chef: valor base por pessoa do pre-booking (placeholder 95€).
10. Receção presencial: 50€ / 90€ pós-21h (validar custo real da equipa).
11. Preços de TODOS os extras c/ Susana e Diogo (incl. transfers Lisboa 280/350 interinos, breakfast 25€, pet 45€).
12. Flex: limiar 1500€ / prazo 7 dias / validade 18 meses (recomendados) + copy e termos validados pelo André Feiteiro (obrigatório antes de produção).
13. Bundle de chegada (D5): definir o desconto — modelo pronto e inativo no código.
14. Early check-in condicionado ao calendário (15.10): sim ou não.
15. Dispensa de caução (15.11): pedir à operação o histórico 2025 de incidentes antes de decidir.
16. Quem confirma os needs_confirmation e em que ferramenta (destino das tarefas de 24h).
17. Prova social (D3): quando o GA4 acumular dados reais, trocar os factos de marca por estatísticas verdadeiras (slot pronto).
18. Rodapés dos emails mostram info@ como contacto — manter ou passar a booking@?

## C · ENGENHARIA — minha, por ordem (dependências indicadas)
19. FASE 2B — cobrança única REAL ⚠️ prioridade máxima (depende de A1+A2): extras/Flex/receção cobrados de facto num só pagamento + reembolso parcial testado. HOJE o cartão cobra SÓ a estadia e o copy já promete cobrança única — não abrir tráfego real com extras antes disto.
20. BLOCO B: B1 preços por tipologia (nº quartos do listing) · B2 motor de transfers por distância com seletor de aeroporto (substitui o interim por região) · B3 private chauffeur · B8 The table antes de The home.
21. Campo CRIANÇAS no seletor de hóspedes (widget+intent+quote) → curadoria promove berço/cadeira/babysitter.
22. FASE 3 completa: ledger flex_credits + eventos, Flex dentro do total (junto com 2b).
23. FASE 4 restante: email pré-chegada 10 dias (venda antes da chegada) + prearrival_addon_purchase.
24. Purchase com items[] completo (extras/flex/receção) no GA4 — coupon já viaja.
25. i18n dos emails CRM para as 9 línguas (hoje PT/EN).
26. Multibanco (Stripe nativo, padrão Klarna) e MB Way (PSP português) — quando priorizares.
27. Bókun V2: disponibilidade/compra em tempo real nas experiências.
28. Hostkit: integração conforme o resultado do teste A2 (se o sync não discriminar → faturar extras via API Hostkit).
29. CAPI Meta server-side (ponto de emissão já identificado: hook paid).
30. GO-LIVE: merge dev→main (limpo, produção fica legacy) e depois CHECKOUT_V2=true quando disseres.

## D · REGRAS QUE NUNCA SE VIOLAM (memória do projeto)
Flex nunca é "seguro" · antes do pagamento promete-se o PREÇO, nunca as datas · voz: sem travessão-vírgula, hífen em palavras fica · zero stock nas imagens · máx 2 proteções no funil · dentro da janela gratuita devolve-se dinheiro, nunca crédito.
