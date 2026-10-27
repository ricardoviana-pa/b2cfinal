import { withCheckoutChargeLock } from "../lib/checkout-charge-attempt";
import { isPreviewDeployment } from "../lib/preview-isolation";
import { trustedStayQuote, assertQuotedTotal } from "./trusted-checkout-quote";
import { completeCheckoutIntent } from "./checkout-confirmation";
/**
 * Fase 2b — cobrança única de cartão na PLATAFORMA (decisão 12 jul 2026).
 * O hóspede paga estadia+extras num só PaymentIntent nosso; a reserva Guesty
 * é criada SÓ com a estadia + recordExternalPayment (extras nunca entram no
 * Guesty — bolo à parte dos owners). Padrão Klarna: finalize síncrono no
 * cliente + webhook como rede de segurança, idempotente via metadata do PI.
 */
import { getBookingIntent, updateBookingIntent } from "../db";
import { computeChargeBreakdown } from "./checkout-pricing";
import { flexGiftActive } from "./recovery-funnel";
import { resolveCleaningRates } from "../config/cleaning-rates";
import { PETS_ONLY_SKUS } from "../config/checkout-extras";
import {
  getPaymentIntent,
  updatePaymentIntentMetadata,
  findSucceededPaymentIntentByIntentId,
  createPartialRefund,
} from "./stripe-klarna";
import {
  createReservationViaOpenApi,
  recordExternalPayment,
  appendReservationNote,
  fetchReservationConfirmationCode,
  getReservationSettlementState,
  paymentRecordsIntent,
  addReservationServiceFee,
  fetchPaymentProviderId,
  fetchReservationGuestId,
  attachGuestPaymentMethod,
  fetchReservationPaymentState,
} from "./guesty-openapi-paypal";

/** O que fazer ao folio do Guesty antes de registar o pagamento da estadia. */
export type FolioReconciliation =
  /** O Guesty preça abaixo do site: lançar a diferença como service fee (AFE). */
  | { action: "add-fee"; delta: number }
  /** O Guesty preça acima do site: não mexer, anotar (decisão comercial, não de código). */
  | { action: "price-gap"; gap: number }
  /** Nada a fazer: os valores batem, ou o folio já tem pagamentos. */
  | { action: "none"; reason: "matches" | "already-paid" };

/**
 * Decide o acerto do folio a partir do estado REAL da reserva.
 *
 * Regra que fecha o GY-Huf4Lp8L: assim que o folio tem algum pagamento (o
 * nosso ou outro), o saldo deixa de ser o total da reserva e já não serve para
 * medir a diferença de preço. Comparar o saldo com a estadia nesse momento foi
 * o que lançou 2.281,97 EUR de "service fee" fantasma e um 2.º registo de
 * 2.524,07 EUR. Por isso, com pagamentos no folio, nunca se mexe.
 */
export function decideFolioReconciliation(input: {
  stayEur: number;
  balanceDue: number;
  totalPaid: number;
  ourPaymentRecorded: boolean;
}): FolioReconciliation {
  if (input.ourPaymentRecorded || input.totalPaid > 0.005) {
    return { action: "none", reason: "already-paid" };
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const { stayEur, balanceDue } = input;
  if (balanceDue > 0 && stayEur - balanceDue > 0.5) {
    return { action: "add-fee", delta: round2(stayEur - balanceDue) };
  }
  if (balanceDue - stayEur > 0.5) {
    return { action: "price-gap", gap: round2(balanceDue - stayEur) };
  }
  return { action: "none", reason: "matches" };
}

/** Depois de lançar a fee, o saldo do Guesty pode demorar a refletir. Registar
 *  o pagamento antes disso capava-o no saldo antigo e deixava a fee por pagar
 *  para sempre (dívida falsa no Guesty). Espera até ~9 s; nunca lança. */
async function waitForBalanceAtLeast(reservationId: string, targetEur: number): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await fetchReservationPaymentState(reservationId);
    if (state && typeof state.balanceDue === "number" && state.balanceDue >= targetEur - 0.5) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** `bedrooms` alinha o preço de limpeza COBRADO com o MOSTRADO: o getExtras
 *  preça por quartos, e sem este dado uma casa fora da tabela caía no preço
 *  de 3 quartos na cobrança (auditoria set/2026, H2). */
export function breakdownFromIntent(m: any, bedrooms: number | null = null) {
  const q = (m?.quote ?? {}) as any;
  return computeChargeBreakdown({
    quoteTotal: Number(q.total ?? 0),
    totalNights: q.totalNights != null ? Number(q.totalNights) : null,
    nights: q.nights != null ? Number(q.nights) : null,
    reception: (m?.reception as any) ?? null,
    extras: (m?.extras as any) ?? null,
    flex: !!m?.flex,
    // Flex oferecido pelo funil de recuperação: vale para cartão, wallets,
    // PayPal e Klarna porque todos passam por aqui
    flexGift: flexGiftActive(m),
    unitPriceOverrides: (() => {
      const r = resolveCleaningRates((m as any)?.listingId, bedrooms);
      return { "daily-cleaning": r.daily, "deep-cleaning": r.deep };
    })(),
  });
}

/**
 * O breakdown que o checkout cobra para um intent, com os dados da casa: a
 * limpeza pela tipologia (número de quartos) e sem extras de animais numa
 * casa que não os aceita. É o cálculo do createCardCharge. Quem mostra,
 * valida ou devolve valores (emails, Klarna e PayPal, reembolsos por linha)
 * tem de usar este: sem os quartos, as 20 casas fora da tabela de limpezas
 * apareciam com o preço de 3 quartos, diferente do que o ecrã mostrou e do
 * que o cartão cobrou. Fail-soft como o listingFacts (sem dados da casa,
 * cai na tabela por omissão).
 */
export async function listingBreakdownFromIntent(m: any) {
  const { listingFacts } = await import("../routers/checkout");
  const facts = await listingFacts(m?.listingId);
  const safe = facts.pets
    ? m
    : { ...m, extras: ((m?.extras ?? []) as any[]).filter((e) => !PETS_ONLY_SKUS.includes(e?.sku)) };
  return breakdownFromIntent(safe, facts.bedrooms);
}

/**
 * Plano tarifário que o hóspede escolheu e pagou.
 *
 * Vive na COLUNA `ratePlanId` do intent — é lá que o create o grava e lá que o
 * syncIntent o actualiza quando o hóspede troca de plano. NUNCA esteve dentro
 * do snapshot `quote`: o quoteSnapshotSchema não declara esse campo e o Zod
 * remove chaves desconhecidas, por isso o antigo `quote.ratePlanId` era sempre
 * undefined e TODAS as reservas do checkout 2.0 nasceram sem plano.
 *
 * Sem ele o Guesty preça no plano por omissão da listagem. O PriceLabs continua
 * a mandar na tarifa por noite — o que diverge é o plano — e daí sai um total
 * diferente do cobrado (o saldo aberto) e, pior, uma política de cancelamento
 * diferente da que o hóspede comprou.
 */
export function resolveRatePlanId(intent: any, quote: any): string {
  const direct = String(intent?.ratePlanId ?? "").trim() || String(quote?.ratePlanId ?? "").trim();
  if (direct) return direct;
  // Rede para intents antigos com a coluna vazia: o plano cujo total bate certo
  // com o total cotado é, por definição, o que o hóspede viu e pagou.
  const opts = quote?.ratePlanOptions;
  if (!Array.isArray(opts)) return "";
  const total = Number(quote?.total);
  if (!Number.isFinite(total)) return "";
  const match = opts.find(
    (o: any) => Number.isFinite(Number(o?.total)) && Math.abs(Number(o.total) - total) < 0.02,
  );
  return String(match?.ratePlanId ?? "").trim();
}

/** Cria a reserva Guesty (só estadia) para um PI card_v2 pago. Idempotente. */
export function settleCardCharge(intentId: string, paymentIntentId: string) {
  return withCheckoutChargeLock(intentId, () => settleCardChargeUnlocked(intentId, paymentIntentId));
}

async function settleCardChargeUnlocked(intentId: string, paymentIntentId: string): Promise<{
  reservationId: string;
  confirmationCode: string;
}> {
  const pi = await getPaymentIntent(paymentIntentId);
  if (pi.status !== "succeeded") throw new Error(`PI ${paymentIntentId} not succeeded (${pi.status})`);
  if (pi.metadata?.flow !== "card_v2" || pi.metadata?.intentId !== intentId) {
    throw new Error("PI does not belong to this intent");
  }
  const m = await getBookingIntent(intentId);
  if (!m) throw new Error("intent not found");
  const { listingFacts } = await import("../routers/checkout");
  const facts = await listingFacts((m as any).listingId);
  let b = breakdownFromIntent(m, facts.bedrooms);

  // Retomável: a reserva pode já existir de uma tentativa anterior (metadata do
  // PI, ou intent — inclui recuperação manual de um settle que morreu a meio).
  let reservationId: string | null =
    pi.metadata.guestyReservationId || (m as any).reservationId || null;
  let confirmationCode: string =
    pi.metadata.guestyConfirmationCode || (m as any).confirmationCode || "";

  if (!reservationId) {
    if (pi.currency !== 'eur' || (m as any).paymentIntentId !== pi.id) throw new Error('Payment identity mismatch');
    const trusted = await trustedStayQuote(m as any, typeof pi.created === 'number' ? pi.created * 1000 : Date.now());
    assertQuotedTotal(m.quote, trusted.quote);
    b = breakdownFromIntent({ ...m, quote: trusted.quote }, facts.bedrooms);
    // Defesa central: o valor cobrado TEM de bater com a matemática do servidor
    if (Math.abs(pi.amount - b.totalCents) > 1) {
      console.error(`[Card2b] AMOUNT MISMATCH intent=${intentId} pi=${pi.amount}c expected=${b.totalCents}c — reserva NÃO criada`);
      throw new Error("charged amount does not match server pricing");
    }
    // O intent guarda o nome em guestFirstName/guestLastName (não existe
    // "guestName" em booking_intents — ler esse campo mandava "Guest -" para
    // o Guesty em todas as reservas 2b).
    const firstName = String((m as any).guestFirstName ?? "").trim();
    const lastName = String((m as any).guestLastName ?? "").trim();
    const q = ((m as any).quote ?? {}) as any;
    const ratePlanId = resolveRatePlanId(m, q);
    if (!ratePlanId) {
      console.error(
        `[Card2b] intent=${intentId} sem ratePlanId — o Guesty vai precar no plano por omissao ` +
          `e a reserva fica com preco e politica de cancelamento diferentes do que foi vendido`,
      );
    }
    const res = await createReservationViaOpenApi({
      listingId: (m as any).listingId,
      checkIn: (m as any).checkIn,
      checkOut: (m as any).checkOut,
      guestFirstName: firstName || "Guest",
      guestLastName: lastName || "-",
      guestEmail: (m as any).email,
      guestPhone: (m as any).guestPhone ?? undefined,
      numberOfAdults: Number((m as any).guests ?? 2),
      numberOfChildren: 0,
      numberOfInfants: 0,
      ...(ratePlanId ? { ratePlanId } : {}),
    } as any);
    reservationId = res.reservationId;
    confirmationCode = res.confirmationCode;
    // Carimbo IMEDIATO, antes de qualquer passo falível (payment/nota): se o
    // resto falhar, o retry retoma ESTA reserva em vez de criar uma segunda.
    await updatePaymentIntentMetadata(paymentIntentId, {
      guestyReservationId: reservationId,
      guestyConfirmationCode: confirmationCode,
    }).catch((e: any) => console.error("[Card2b] stamp PI falhou:", e?.message));
    await updateBookingIntent(intentId, {
      reservationId,
      confirmationCode,
    } as any).catch((e: any) => console.error("[Card2b] stamp intent falhou:", e?.message));
  }
  if (!confirmationCode) {
    confirmationCode = (await fetchReservationConfirmationCode(reservationId)) ?? "";
  }

  // O Guesty tem de receber o TOTAL da estadia do site (Ricardo, 21 ago): o
  // re-preço da tarifa fica aquém (sem o service fee do Booking Engine); o
  // delta entra como invoice item AFE — categoria fora do split de owners,
  // como a cleaning fee — e so depois se regista o pagamento por inteiro.
  // A reconciliação só existia NESTE sentido. Quando o Guesty re-preça a
  // estadia ACIMA do que o site cobrou, o `stayEur - balance` fica negativo,
  // caía no ramo de baixo e não fazia nada — o recordExternalPayment regista
  // o que foi cobrado (capado no balanceDue) e a diferença fica como saldo
  // aberto para sempre. GY-ATyEq5WB: site 1.282,10, Guesty 1.565,20, sobra
  // 283,10 que o Guesty apresenta como "Pending payment collection". O hóspede
  // pagou o preço contratado e não deve nada — mas o CS vê dívida e o instinto
  // é pedir-lhe o cartão. Ver o priceGap abaixo.
  // A divergência de um passe anterior sobrevive ao carimbo: sem isto, um
  // settle retomado escrevia a nota sem o aviso "não é dívida do hóspede".
  let priceGap = Number(pi.metadata.priceGap ?? 0) || 0;
  if (pi.metadata.feeAdjusted !== "1") {
    const state = await getReservationSettlementState(reservationId);
    if (!state) {
      // Sem leitura válida não se decide nada e também não se regista: o
      // registo faz a sua própria leitura e podia ter sucesso segundos depois,
      // com o acerto saltado (fee perdida ou nota sem o aviso de divergência).
      // O settle volta a tentar (webhook, finalize ou sweep).
      throw new Error(`folio ilegivel reserva=${reservationId} — acerto e registo adiados`);
    } else {
      const stayEur = Math.round(b.stayCents) / 100;
      const decision = decideFolioReconciliation({
        stayEur,
        balanceDue: state.balanceDue,
        totalPaid: state.totalPaid,
        ourPaymentRecorded: state.payments.some((p) => paymentRecordsIntent(p, paymentIntentId)),
      });
      if (decision.action === "add-fee") {
        const outcome = await addReservationServiceFee(reservationId, decision.delta);
        if (outcome === "added") {
          await updatePaymentIntentMetadata(paymentIntentId, { feeAdjusted: "1" }).catch(() => {});
          if (!(await waitForBalanceAtLeast(reservationId, stayEur))) {
            console.warn(`[Card2b] saldo ainda sem a fee reserva=${reservationId} — o registo pode ficar capado`);
          }
        } else if (outcome === "unknown") {
          // 5xx, timeout ou rede: a fee pode ter ficado gravada. Só o saldo diz.
          // Gravada → carimba e segue. Não gravada (ou ainda invisível) → pára
          // ANTES do registo: o próximo passe relê o folio (sem pagamentos) e
          // ou vê os valores a bater, ou lança a fee outra vez. Registar já
          // capava no saldo antigo e a fee perdia-se para sempre.
          if (await waitForBalanceAtLeast(reservationId, stayEur)) {
            await updatePaymentIntentMetadata(paymentIntentId, { feeAdjusted: "1" }).catch(() => {});
          } else {
            throw new Error(`service fee com resultado desconhecido reserva=${reservationId} — registo adiado`);
          }
        }
        // "refused" (4xx): não se carimba. O registo abaixo capa no saldo do
        // Guesty e o próximo passe vê pagamentos no folio e já não mexe.
      } else if (decision.action === "price-gap") {
        // Sentido contrário: o Guesty pede mais do que o site cobrou. NÃO se
        // corrige o folio aqui — baixá-lo tira receita ao proprietário e isso é
        // decisão comercial, não de código. Mas também não fica calado: o valor
        // vai para o PI, para o log e para uma nota na própria reserva, para
        // quem a abrir no Guesty ver que não há nada a cobrar ao hóspede.
        priceGap = decision.gap;
        console.error(
          `[Card2b] PRECO DIVERGENTE reserva=${reservationId}: Guesty pede ${state.balanceDue} EUR, o site cobrou ${stayEur} EUR ` +
            `(diferenca ${priceGap}) — o hospede NAO deve nada; nao lhe pedir pagamento`,
        );
        // Carimbado também aqui: era a falta deste carimbo que fazia o 2.º
        // passe voltar a "acertar" o folio já pago (GY-Huf4Lp8L).
        await updatePaymentIntentMetadata(paymentIntentId, {
          feeAdjusted: "1",
          priceGap: priceGap.toFixed(2),
        }).catch(() => {});
      } else {
        await updatePaymentIntentMetadata(paymentIntentId, { feeAdjusted: "1" }).catch(() => {});
      }
    }
  }
  // SÓ a estadia entra no Guesty (EUR) — extras ficam na plataforma.
  // Idempotente pelo carimbo no PI e, por baixo, pela nota com o id do PI no
  // próprio registo do Guesty (recordExternalPayment).
  if (pi.metadata.guestyPaymentRecorded !== "1") {
    const outcome = await recordExternalPayment(reservationId, b.stayCents / 100, "EUR", paymentIntentId);
    if (outcome === "settled") {
      console.warn(
        `[Card2b] reserva=${reservationId}: saldo ja a zero sem registo visivel do PI ${paymentIntentId} — ` +
          `registo anterior sem nota legivel, ou liquidada por outra via`,
      );
    }
    await updatePaymentIntentMetadata(paymentIntentId, { guestyPaymentRecorded: "1" }).catch(() => {});
  }
  if (pi.metadata.splitNoteAdded !== "1") {
    const noted = await appendReservationNote(
      reservationId,
      `Checkout 2.0: pagamento unico ${(pi.amount / 100).toFixed(2)} EUR na plataforma ` +
        `(estadia ${(b.stayCents / 100).toFixed(2)} registada aqui; servicos ${((pi.amount - b.stayCents) / 100).toFixed(2)} faturados pela Portugal Active). PI ${paymentIntentId}.` +
        // Quem abrir a reserva vê "Pending payment collection" e nao tem como
        // saber que o saldo nao e divida do hospede. Fica dito aqui, ao lado.
        (priceGap > 0
          ? ` ATENCAO: o Guesty preca esta estadia ${priceGap.toFixed(2)} EUR acima do que o site cobrou, ` +
            `e esse saldo aparece como "pending payment collection". NAO e divida do hospede: ele pagou ` +
            `por inteiro o preco que lhe foi apresentado. Nao lhe pedir pagamento nem dados de cartao. ` +
            `Diferenca a resolver internamente.`
          : ""),
    ).catch(() => false);
    if (noted) {
      await updatePaymentIntentMetadata(paymentIntentId, { splitNoteAdded: "1" }).catch(() => {});
    }
  }
  // Cartao na carteira do Guesty. Sem isto o Guesty fica sem forma de cobrar
  // caucao, danos, noites extra ou saldos — capacidade que o fluxo antigo
  // (BE instant com ccToken) tinha e o checkout 2.0 perdeu. Idempotente pelo
  // carimbo cardOnFile; fail-soft, nunca trava a reserva.
  if (pi.metadata.cardOnFile !== "1") {
    // GY-WRBPgyUu, 2 set 2026: o cartao entrou na carteira 60 segundos depois
    // do recordExternalPayment, e a politica de Auto-Payment da listagem — a
    // do fluxo antigo, nunca desligada — viu um cartao numa reserva cujo saldo
    // o Guesty ainda nao tinha actualizado e cobrou os 727,10 EUR outra vez,
    // off-session, sem 3DS. O hospede pagou 1.454,20 EUR por uma estadia de
    // 727,10 EUR. O cartao so entra na carteira quando o proprio Guesty diz que
    // a estadia esta liquidada; se nunca o disser, fica de fora e o motivo vai
    // para a metadata do PI, como qualquer outra falha deste passo.
    const settled = await waitForStaySettled(reservationId);
    if (!settled) {
      console.error(
        `[Card2b] cartao NAO anexado reserva=${reservationId}: Guesty nao confirmou saldo zero — evitar cobranca off-session pela Auto-Payment (ver GY-WRBPgyUu)`,
      );
      await updatePaymentIntentMetadata(paymentIntentId, { cardOnFileError: "balance-not-settled" }).catch(() => {});
    } else {
      // O motivo da falha vai para a metadata do PI: sem acesso aos logs do
      // Render, e a unica forma de o ops (e eu) ver PORQUE e que um cartao nao
      // entrou em carteira — visivel no dashboard do Stripe, ao lado da reserva.
      const r = await attachCardToGuesty({
        reservationId,
        listingId: (m as any).listingId,
        paymentIntent: pi,
      }).catch((e: any) => ({ ok: false, reason: `excecao:${String(e?.message).slice(0, 60)}` }));
      await updatePaymentIntentMetadata(
        paymentIntentId,
        r.ok ? { cardOnFile: "1" } : { cardOnFileError: r.reason.slice(0, 100) },
      ).catch(() => {});
    }
  }
  await updatePaymentIntentMetadata(paymentIntentId, {
    guestyReservationId: reservationId,
    guestyConfirmationCode: confirmationCode,
  });
  await updateBookingIntent(intentId, {
    reservationId,
    confirmationCode,
  } as any);
  await completeCheckoutIntent(intentId, reservationId, confirmationCode);
  return { reservationId, confirmationCode };
}


/**
 * Poe o cartao usado no checkout na carteira do Guesty da reserva.
 *
 * Funciona porque a conta Stripe que o Guesty tem ligada ao alojamento e a
 * MESMA onde o checkout 2.0 cobra (verificado a 28 ago 2026: provider-by-listing
 * devolve acct_1KxXZlGsqyDlHBJE, a nossa). Nao ha clonagem entre contas: o
 * payment method do proprio PaymentIntent serve tal e qual.
 *
 * Devolve false (sem lancar) em qualquer passo em falta — o cartao em carteira
 * e uma capacidade extra, nunca uma condicao para a reserva existir.
 */
/**
 * Espera que o Guesty reflicta o pagamento registado — balanceDue a zero —
 * antes de se pôr um cartão ao alcance da Auto-Payment. A leitura é a mesma que
 * o pos-reserva usa; a consistência do lado deles é eventual, dai as tentativas.
 * Ler nada (null) conta como NAO liquidado: na duvida o cartao fica de fora.
 */
async function waitForStaySettled(reservationId: string): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const state = await fetchReservationPaymentState(reservationId);
    if (state && typeof state.balanceDue === "number" && state.balanceDue <= 0.01) return true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

export async function attachCardToGuesty(input: {
  reservationId: string;
  listingId?: string | null;
  paymentIntent: { payment_method?: unknown };
}): Promise<{ ok: boolean; reason: string }> {
  const pm = input.paymentIntent?.payment_method;
  const paymentMethodId = typeof pm === "string" ? pm : (pm as any)?.id;
  if (!paymentMethodId || !String(paymentMethodId).startsWith("pm_")) {
    return { ok: false, reason: `sem-pm(${String(paymentMethodId).slice(0, 20)})` };
  }
  if (!input.listingId) return { ok: false, reason: "sem-listingId" };

  const [providerId, guestId] = await Promise.all([
    fetchPaymentProviderId(input.listingId),
    fetchReservationGuestId(input.reservationId),
  ]);
  if (!providerId) return { ok: false, reason: "sem-providerId" };
  if (!guestId) return { ok: false, reason: "sem-guestId" };

  const res = await attachGuestPaymentMethod({
    guestId,
    paymentMethodId: String(paymentMethodId),
    paymentProviderId: providerId,
    reservationId: input.reservationId,
  });
  return res.ok ? { ok: true, reason: "ok" } : { ok: false, reason: `guesty:${res.error}` };
}

/* ════════════════════════════════════════════════════════════════
   Bloco 4 — reembolso parcial por linha (2b_plan §5).
   Quando o concierge não consegue entregar uma linha needs_confirmation,
   o hóspede recebe EXATAMENTE essa linha de volta, no PI original, pela
   conta de plataforma. Fonte do valor: as lines gravadas na metadata do
   PI na criação; fallback: recomputar do intent (imutável depois de paid).
   ════════════════════════════════════════════════════════════════ */

export interface RefundLineResult {
  paymentIntentId: string;
  sku: string;
  cents: number;
  executed: boolean;
  refundId?: string;
  /** Reembolsável que sobra no PI depois (ou antes, em dry-run) desta linha */
  remainingCents: number;
  /** Linhas conhecidas do PI (para o dry-run da equipa) */
  lines: Array<{ sku: string; cents: number }>;
  alreadyRefundedSkus: string[];
}

function parseLinesMetadata(raw: string | undefined | null): Array<{ sku: string; cents: number }> {
  if (!raw) return [];
  return raw
    .split("|")
    .map((part) => {
      const i = part.lastIndexOf(":");
      if (i <= 0) return null;
      const cents = Number(part.slice(i + 1));
      const sku = part.slice(0, i);
      return sku && Number.isFinite(cents) && cents > 0 ? { sku, cents } : null;
    })
    .filter(Boolean) as Array<{ sku: string; cents: number }>;
}

/**
 * Reembolsa uma linha (sku de extra, ou os pseudo-skus "reception" e "flex")
 * do pagamento único de um intent. Dry-run por omissão; `execute: true` faz
 * o reembolso real. Idempotente por (PI, sku): a metadata `refunded_skus`
 * bloqueia repetições e a idempotency key do Stripe cobre corridas.
 */
export async function refundCheckoutLine(
  intentId: string,
  sku: string,
  opts: { execute?: boolean } = {},
): Promise<RefundLineResult> {
  const pi = await findSucceededPaymentIntentByIntentId(intentId);
  if (!pi) throw new Error(`No succeeded platform PaymentIntent found for intent ${intentId}`);

  // Linhas: metadata primeiro; fallback recomputa do intent (paid = imutável)
  let lines = parseLinesMetadata(pi.metadata?.lines);
  let receptionCents = Number(pi.metadata?.receptionCents ?? NaN);
  let flexCents = Number(pi.metadata?.flexCents ?? NaN);
  if (!lines.length || !Number.isFinite(receptionCents) || !Number.isFinite(flexCents)) {
    const m = await getBookingIntent(intentId);
    if (m) {
      // Os mesmos valores que foram cobrados: limpeza pelos quartos da casa.
      const b = await listingBreakdownFromIntent(m);
      if (!lines.length) lines = b.lines;
      if (!Number.isFinite(receptionCents)) receptionCents = b.receptionCents;
      if (!Number.isFinite(flexCents)) flexCents = b.flexCents;
    }
  }
  receptionCents = Number.isFinite(receptionCents) ? receptionCents : 0;
  flexCents = Number.isFinite(flexCents) ? flexCents : 0;

  const cents =
    sku === "reception" ? receptionCents
    : sku === "flex" ? flexCents
    : lines.find((l) => l.sku === sku)?.cents ?? 0;
  if (!cents || cents <= 0) {
    throw new Error(
      `Line "${sku}" not found (or zero) on PI ${pi.id}. Known lines: ` +
        [...lines.map((l) => `${l.sku}:${l.cents}c`),
          receptionCents ? `reception:${receptionCents}c` : null,
          flexCents ? `flex:${flexCents}c` : null,
        ].filter(Boolean).join(", "),
    );
  }

  const alreadyRefundedSkus = (pi.metadata?.refunded_skus ?? "").split(",").filter(Boolean);
  if (alreadyRefundedSkus.includes(sku)) {
    throw new Error(`Line "${sku}" was already refunded on PI ${pi.id} (refunded_skus=${alreadyRefundedSkus.join(",")})`);
  }

  const charge = pi.latest_charge as import("stripe").default.Charge | null;
  const alreadyRefundedCents = typeof charge === "object" && charge ? (charge.amount_refunded ?? 0) : 0;
  const remainingCents = pi.amount - alreadyRefundedCents;
  if (cents > remainingCents) {
    throw new Error(
      `Refund of ${cents}c exceeds refundable remainder ${remainingCents}c on PI ${pi.id} (amount ${pi.amount}c, refunded ${alreadyRefundedCents}c)`,
    );
  }

  if (!opts.execute) {
    return { paymentIntentId: pi.id, sku, cents, executed: false, remainingCents, lines, alreadyRefundedSkus };
  }

  const refund = await createPartialRefund({
    paymentIntentId: pi.id,
    amountCents: cents,
    intentId,
    sku,
  });
  await updatePaymentIntentMetadata(pi.id, {
    refunded_skus: [...alreadyRefundedSkus, sku].join(","),
  });
  console.info(`[Card2b] Refunded line ${sku} (${cents}c) on PI ${pi.id} — refund ${refund.id}`);
  return {
    paymentIntentId: pi.id,
    sku,
    cents,
    executed: true,
    refundId: refund.id,
    remainingCents: remainingCents - cents,
    lines,
    alreadyRefundedSkus: [...alreadyRefundedSkus, sku],
  };
}

/* ================================================================
   PAGO-SEM-RESERVA — alerta + retry persistente (spec §14)
   "Nunca dinheiro cobrado sem reserva criada": quando um settle falha
   depois de o PI ter sucedido, a equipa é alertada de imediato e um
   sweep periódico (estado na BD, sobrevive a restarts) volta a tentar
   fechar a reserva até 48h.
   ================================================================ */

const HOUR_MS = 60 * 60 * 1000;
/** Rede de último recurso quando a metadata do PI não se lê nem escreve. */
const settleAlertAt = new Map<string, number>();
const SETTLE_ALERT_THROTTLE_MS = 30 * 60 * 1000;

/**
 * Calendário dos alertas de um mesmo pagamento sem reserva, contado a partir
 * do primeiro: imediato, +1 h, +6 h, +24 h. Antes era um email a cada 30 min
 * durante as 48 h da janela do sweep (~96 emails) e depois silêncio: treinava
 * a caixa booking@ a ignorar [OPS], que é exatamente o canal de exceções.
 */
export const SETTLE_ALERT_SCHEDULE_MS = [0, 1 * HOUR_MS, 6 * HOUR_MS, 24 * HOUR_MS] as const;
/** listUnsettledCardIntents só vê intents com menos de 48 h: o último aviso
 *  sai na hora antes de o sweep deixar de tentar. */
export const SETTLE_FINAL_ALERT_AGE_MS = 47 * HOUR_MS;

/** Que alerta mandar agora, dado o que já foi enviado. Pura, testada.
 *  A idade conta a partir do PAGAMENTO, não da criação do intent: um hóspede
 *  que paga pelo email de recuperação dos 3 ou 7 dias tem direito ao mesmo
 *  calendário. Depois do último aviso não sai mais nenhum. */
export function settleAlertDecision(input: {
  now: number;
  /** Momento do 1.º alerta (ms), ou null se ainda não houve nenhum. */
  firstAt: number | null;
  sent: number;
  finalSent: boolean;
  /** Momento do pagamento (ms), ou null se desconhecido. */
  paidAt: number | null;
}): "regular" | "final" | null {
  if (input.finalSent) return null;
  if (input.paidAt != null && input.now - input.paidAt >= SETTLE_FINAL_ALERT_AGE_MS) return "final";
  if (input.sent >= SETTLE_ALERT_SCHEDULE_MS.length) return null;
  if (input.sent <= 0 || input.firstAt == null) return "regular";
  return input.now >= input.firstAt + SETTLE_ALERT_SCHEDULE_MS[input.sent] ? "regular" : null;
}

/**
 * Alerta ops de um settle falhado. Nunca lança. O estado do calendário vive
 * na metadata do próprio PI (sobrevive a restarts e é igual em todas as
 * instâncias) e só avança quando o email saiu de facto; se o Stripe não
 * responder, fica o throttle em memória.
 */
export async function alertFailedSettle(
  intentId: string,
  paymentIntentId: string,
  reason: string,
  source: string,
): Promise<void> {
  try {
    const now = Date.now();
    const last = settleAlertAt.get(intentId) ?? 0;
    if (now - last < SETTLE_ALERT_THROTTLE_MS) return;

    const m: any = (await getBookingIntent(intentId)) ?? {};
    const pi = await getPaymentIntent(paymentIntentId).catch(() => null);
    // Só há "pago sem reserva" se o dinheiro foi mesmo capturado.
    if (pi && pi.status !== "succeeded") {
      console.warn(`[Card2b] alerta de settle ignorado: PI ${paymentIntentId} em ${pi.status}, nao ha dinheiro capturado`);
      return;
    }
    const meta: Record<string, string> | null = pi ? ((pi.metadata ?? {}) as Record<string, string>) : null;
    const sent = Number(meta?.settleAlerts ?? 0) || 0;
    const firstAt = Number(meta?.settleAlertFirstAt ?? NaN);
    const paidAtMs =
      pi && typeof pi.created === "number"
        ? pi.created * 1000
        : m.updatedAt
          ? new Date(m.updatedAt).getTime()
          : NaN;
    const kind = settleAlertDecision({
      now,
      firstAt: Number.isFinite(firstAt) ? firstAt : null,
      sent,
      finalSent: meta?.settleAlertFinal === "1",
      paidAt: Number.isFinite(paidAtMs) ? paidAtMs : null,
    });
    if (!kind) return;
    settleAlertAt.set(intentId, now);

    const house = m.propertyName || m.listingId || intentId;
    const reservationId = meta?.guestyReservationId || m.reservationId || "";
    const code = meta?.guestyConfirmationCode || m.confirmationCode || "";
    const step = kind === "final" ? "ÚLTIMO AVISO" : `aviso ${sent + 1} de ${SETTLE_ALERT_SCHEDULE_MS.length}`;
    const verify = pi ? "" : "VERIFICAR NO STRIPE · ";
    const guestLine = `Hóspede: ${[m.guestFirstName, m.guestLastName].filter(Boolean).join(" ") || "?"} · ${m.email || "?"} · ${m.guestPhone || "?"}`;
    const stayLine = `Estadia: ${m.checkIn || "?"} → ${m.checkOut || "?"} · ${m.guests ?? "?"} hóspedes · estadia ${m.quote?.total ?? "?"} EUR`;
    const unknownPi = pi
      ? []
      : [`Não foi possível ler este pagamento no Stripe agora: confirmar no Stripe que está pago antes de fazer o que quer que seja.`];

    const subject = reservationId
      ? `${verify}RESERVA CRIADA, PAGAMENTO POR FECHAR (${step}) — ${code || reservationId} — ${house}`
      : `${verify}PAGO SEM RESERVA (${step}) — ${house}`;
    const lines = reservationId
      ? [
          ...unknownPi,
          `O pagamento por cartão foi capturado e a reserva Guesty ${code || reservationId} JÁ EXISTE; falhou um passo seguinte (via: ${source}).`,
          `NÃO criar outra reserva, NÃO reembolsar e NÃO voltar a cobrar o hóspede.`,
          guestLine,
          stayLine,
          `Pagamento registado no Guesty: ${meta?.guestyPaymentRecorded === "1" ? "sim" : "não confirmado"} · acerto do folio: ${meta?.feeAdjusted === "1" ? "feito" : "por fazer"}`,
          `Intent ${intentId} · PI ${paymentIntentId}`,
          `Erro: ${reason}`,
          kind === "final"
            ? `O sweep automático deixa de tentar dentro de 1 hora. Resolver hoje: abrir a reserva no Guesty e, só se não existir um pagamento com "PaymentIntent: ${paymentIntentId}" na nota, registar ${m.quote?.total ?? "a estadia"} EUR como pagamento externo com essa nota.`
            : `O sweep automático continua a tentar de 10 em 10 minutos; nada a fazer por agora. Próximo aviso só se continuar a falhar.`,
        ]
      : [
          ...unknownPi,
          `Um pagamento por cartão foi capturado mas a reserva Guesty NÃO ficou criada (via: ${source}).`,
          `NÃO voltar a cobrar o hóspede: o dinheiro já está na conta Stripe.`,
          guestLine,
          stayLine,
          `Intent ${intentId} · PI ${paymentIntentId}`,
          `Erro: ${reason}`,
          kind === "final"
            ? `O sweep automático deixa de tentar dentro de 1 hora (janela de 48 h). Resolver hoje: criar a reserva à mão no Guesty e registar o pagamento com o id do PI na nota, ou reembolsar no Stripe.`
            : `O sweep automático continua a tentar de 10 em 10 minutos. Próximo aviso só se continuar a falhar. Se persistir: verificar Stripe e Guesty e criar a reserva à mão ou reembolsar.`,
        ];

    const { sendOpsAlert } = await import("./transactional-email");
    const delivered = await sendOpsAlert(subject, lines, { copyToSales: true });

    // Um email que não saiu não gasta um passo do calendário (nem o último aviso).
    if (meta && delivered) {
      const patch: Record<string, string> =
        kind === "final"
          ? { settleAlertFinal: "1" }
          : { settleAlerts: String(sent + 1), ...(sent === 0 ? { settleAlertFirstAt: String(now) } : {}) };
      await updatePaymentIntentMetadata(paymentIntentId, patch).catch((e: any) =>
        console.warn(`[Card2b] calendario de alertas nao gravado no PI ${paymentIntentId}: ${e?.message}`),
      );
    }
  } catch (err: any) {
    console.error(`[Card2b] alertFailedSettle falhou: ${err?.message}`);
  }
}

/**
 * O sweep só corre no serviço de produção. A BD de intents é partilhada com
 * o DEV (incidente de 16 set 2026): um DEV com chave Stripe de teste a pegar
 * em PIs reais falhava todos os retrieves e enchia booking@ de alertas falsos.
 * CARD_SETTLE_SWEEP=false desliga-o em produção sem deploy de código.
 */
export function canRunCardSettleSweep(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.CARD_SETTLE_SWEEP === "false") return false;
  if (env.NODE_ENV !== "production") return false;
  // Um `npm start` local não tem RENDER_SERVICE_ID; com o .env.local (BD real)
  // seria um segundo processo a fechar pagamentos reais em paralelo com a
  // produção. O isPreviewDeployment já recusa qualquer serviço que não seja o
  // de produção; aqui exige-se que haja um.
  if (!env.RENDER_SERVICE_ID) return false;
  return !isPreviewDeployment(env);
}

let settleSweepStarted = false;

/** Uma passagem: tenta fechar todos os intents com PI pendente. Nunca lança. */
export async function runCardSettleSweep(): Promise<{ settled: number; checked: number }> {
  let settled = 0;
  let checked = 0;
  try {
    const { listUnsettledCardIntents } = await import("../db");
    const candidates = await listUnsettledCardIntents();
    checked = candidates.length;
    for (const intent of candidates) {
      const piId = (intent as any).paymentIntentId as string | null;
      if (!piId) continue;
      // A leitura do PI fica fora do try do settle: com o Stripe em baixo, a
      // lista inclui checkouts abandonados e cada um virava um alerta falso.
      let pi: Awaited<ReturnType<typeof getPaymentIntent>>;
      try {
        pi = await getPaymentIntent(piId);
      } catch (err: any) {
        console.warn(`[Card2b] sweep nao leu o PI ${piId} (intent ${intent.id}): ${err?.message} — tenta na proxima passagem`);
        continue;
      }
      // Só interessa o caso dinheiro-capturado; um PI abandonado a meio do
      // 3DS não é dívida nossa e expira sozinho.
      if (pi.status !== "succeeded") continue;
      try {
        const r = await settleCardCharge(intent.id, piId);
        await completeCheckoutIntent(intent.id, r.reservationId, r.confirmationCode);
        settled++;
        console.info(`[Card2b] sweep fechou intent ${intent.id} → ${r.confirmationCode}`);
      } catch (err: any) {
        console.error(`[Card2b] sweep não fechou intent ${intent.id}: ${err?.message}`);
        void alertFailedSettle(intent.id, piId, String(err?.message ?? err), "sweep");
      }
    }
  } catch (err: any) {
    console.warn(`[Card2b] sweep falhou: ${err?.message}`);
  }
  return { settled, checked };
}

/** Sweep de 10 min, arrancado uma vez no boot (fail-soft com BD em baixo). */
export function startCardSettleSweep(): void {
  if (settleSweepStarted) return;
  if (!canRunCardSettleSweep()) {
    console.info("[Card2b] Sweep de settle desligado neste ambiente (so corre no servico de producao)");
    return;
  }
  settleSweepStarted = true;
  const timer = setInterval(() => void runCardSettleSweep(), 10 * 60 * 1000);
  timer.unref?.();
  const first = setTimeout(() => void runCardSettleSweep(), 45 * 1000);
  first.unref?.();
  console.info("[Card2b] Sweep de settle agendado (10 min): pagamentos capturados sem reserva são retomados e alertados");
}
