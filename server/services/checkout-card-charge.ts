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
import { randomUUID } from "crypto";
import { computeChargeBreakdown } from "./checkout-pricing";
import { splitTwoParts, twoPartsInstants, twoPartsSchedule } from "./payment-plan";
import { effectiveFlexChoice, intentPaymentPlan, intentPolicyCode } from "./checkout-plan";
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
export function breakdownFromIntent(
  m: any,
  bedrooms: number | null = null,
  /** `at`: o instante que conta para as ofertas de Flex (no settle, o do
   *  pagamento). `flexGift`: o que o PI cobrado diz sobre o Flex, quando se
   *  sabe; ganha à leitura das datas da oferta. */
  opts: { at?: number; flexGift?: boolean } = {},
) {
  const at = opts.at ?? Date.now();
  const q = (m?.quote ?? {}) as any;
  return computeChargeBreakdown({
    quoteTotal: Number(q.total ?? 0),
    totalNights: q.totalNights != null ? Number(q.totalNights) : null,
    nights: q.nights != null ? Number(q.nights) : null,
    reception: (m?.reception as any) ?? null,
    extras: (m?.extras as any) ?? null,
    // Um Flex oferecido por pagamento integral que expirou volta à escolha do
    // hóspede (effectiveFlexChoice): nunca se cobra um Flex que ele não pediu.
    flex: effectiveFlexChoice(m, at),
    // Flex oferecido (funil de recuperação ou pagamento integral): vale para
    // cartão, wallets, PayPal e Klarna porque todos passam por aqui. No settle
    // conta o que foi cobrado: avaliada à hora do settle, uma oferta expirada
    // entre o pagamento e um settle tardio (sweep, até 48 h) punha o Flex no
    // total esperado e a reserva nunca nascia.
    flexGift: opts.flexGift ?? flexGiftActive(m, at),
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
export async function listingBreakdownFromIntent(m: any, opts: { at?: number; flexGift?: boolean } = {}) {
  const { listingFacts } = await import("../routers/checkout");
  const facts = await listingFacts(m?.listingId);
  const safe = facts.pets
    ? m
    : { ...m, extras: ((m?.extras ?? []) as any[]).filter((e) => !PETS_ONLY_SKUS.includes(e?.sku)) };
  return breakdownFromIntent(safe, facts.bedrooms, opts);
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

/** "28/06/2027" no calendário de Lisboa, para as notas do Guesty (ASCII). */
function lisbonDayLabel(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || !Number.isFinite(d.getTime())) return "data por confirmar";
  return new Intl.DateTimeFormat("pt-PT", { timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

function isoDate(raw: string | undefined, label: string): Date {
  const d = raw ? new Date(raw) : null;
  if (!d || !Number.isFinite(d.getTime())) throw new Error(`PI em duas partes sem ${label} valido`);
  return d;
}

/**
 * Grava a linha da 2.ª parte (checkout_scheduled_payments) para um depósito
 * pago. Idempotente pelo UNIQUE(intent_id): uma 2.ª passagem devolve "exists".
 * Datas, valores e cartão vêm do PI (o que foi autorizado e cobrado); o
 * cartão lê-se com o payment_method expandido.
 */
async function recordTwoPartsSchedule(input: {
  intentId: string;
  intent: any;
  pi: any;
  reservationId: string;
  confirmationCode: string;
  depositStayCents: number;
}): Promise<void> {
  const { intentId, intent, reservationId, confirmationCode, depositStayCents } = input;
  const pi = await getPaymentIntent(input.pi.id, undefined, { expand: ["payment_method"] });
  const pm: any = pi.payment_method;
  const paymentMethodId = typeof pm === "string" ? pm : pm?.id;
  const customer = typeof pi.customer === "string" ? pi.customer : (pi.customer as any)?.id;
  if (!paymentMethodId || !customer) {
    throw new Error(`PI ${pi.id} em duas partes sem cartao guardado (pm=${paymentMethodId ?? "-"}, customer=${customer ?? "-"})`);
  }
  const meta = pi.metadata as Record<string, string>;
  const balanceCents = Number(meta.balanceCents);
  if (!Number.isSafeInteger(balanceCents) || balanceCents <= 0) throw new Error(`PI ${pi.id} em duas partes sem balanceCents valido`);
  const chargeAt = isoDate(meta.chargeAt, "chargeAt");
  const card = typeof pm === "object" && pm ? pm.card : null;
  const { insertScheduledPayment, linkCardMandatesToSchedule, getScheduledPaymentByIntent } = await import("../db");
  const { siteOriginForSchedule } = await import("./checkout-plan");
  const id = randomUUID();
  const outcome = await insertScheduledPayment({
    id,
    intentId,
    livemode: !!pi.livemode,
    siteOrigin: siteOriginForSchedule(),
    reservationId,
    confirmationCode: confirmationCode || null,
    listingId: String(intent.listingId),
    propertyName: intent.propertyName ?? null,
    checkIn: String(intent.checkIn),
    checkOut: String(intent.checkOut),
    email: intent.email ?? null,
    phone: intent.guestPhone ?? null,
    locale: intent.locale ?? null,
    currency: "EUR",
    depositPaymentIntentId: pi.id,
    depositCents: pi.amount,
    depositStayCents,
    balanceCents,
    depositFiscalLines: { stayCents: depositStayCents, servicesCents: pi.amount - depositStayCents, lines: meta.lines ?? null },
    stripeCustomerId: customer,
    paymentMethodId,
    cardBrand: card?.brand ?? null,
    cardLast4: card?.last4 ?? null,
    cardExpMonth: card?.exp_month ?? null,
    cardExpYear: card?.exp_year ?? null,
    policyCode: String(meta.policyCode),
    freeCancelDeadline: isoDate(meta.freeCancelDeadlineAt, "freeCancelDeadlineAt"),
    chargeAt,
    hardStopAt: isoDate(meta.hardStopAt, "hardStopAt"),
    nextAttemptAt: chargeAt,
    status: "scheduled",
  } as any);
  const row = outcome === "exists" ? await getScheduledPaymentByIntent(intentId) : null;
  const scheduledId = outcome === "inserted" ? id : (row as any)?.id;
  if (scheduledId) await linkCardMandatesToSchedule(intentId, pi.id, scheduledId, paymentMethodId, card?.last4 ?? null);
  // O cartão guardado pode ser mostrado na página do saldo ("••••1234"). Fail-soft.
  const { allowPaymentMethodRedisplay } = await import("./stripe-klarna");
  await allowPaymentMethodRedisplay(paymentMethodId).catch((e: any) =>
    console.warn(`[TwoParts] allow_redisplay falhou pm=${paymentMethodId}: ${e?.message}`),
  );
  console.info(`[TwoParts] 2.a parte ${outcome === "inserted" ? "agendada" : "ja agendada"} intent=${intentId} reserva=${reservationId} em ${chargeAt.toISOString()}`);
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
  // A 2.ª parte (Fase 2) nunca cria nem fecha a reserva: é um movimento à parte.
  if (pi.metadata?.part === "balance") throw new Error("PI does not belong to this intent (2.a parte)");
  const m = await getBookingIntent(intentId);
  if (!m) throw new Error("intent not found");
  // O plano é o que foi COBRADO: a metadata do PI só a escreve o servidor, no
  // createCardCharge, junto com o valor. O intent diz o mesmo; se divergir,
  // fica registado e manda o PI.
  const twoParts = pi.metadata?.plan === "two_parts";
  if (twoParts !== (intentPaymentPlan(m) === "two_parts")) {
    console.error(`[TwoParts] plano do intent ${intentPaymentPlan(m)} difere do PI ${paymentIntentId} (${twoParts ? "two_parts" : "full"}) — segue o PI`);
  }
  const paidAt = typeof pi.created === "number" ? pi.created * 1000 : Date.now();
  // O Flex oferecido decide-se pelo que foi COBRADO, confirmado pelo intent:
  // - flexCents > 0 no PI: o Flex foi pago, nunca conta como oferecido (um PI
  //   criado antes de uma oferta e pago depois de ela expirar continua certo);
  // - flexCents 0: só é oferta se houve uma em vigor, no pagamento ou agora.
  //   Um Flex ligado no intent depois de o PI existir, sem oferta nenhuma,
  //   volta a dar diferença de valor e o settle pára (como sempre parou).
  // Sem metadata (PIs antigos), a oferta lê-se no instante do pagamento.
  const piFlexRaw = pi.metadata?.flexCents;
  const piFlexCents = piFlexRaw != null && piFlexRaw !== "" ? Number(piFlexRaw) : NaN;
  // `incentive: "flex"` só o servidor o escreve, quando ofereceu o Flex por
  // pagamento integral nesse mesmo PI: é prova bastante, mesmo que a oferta
  // tenha saído do intent depois (troca de tarifa, expiração).
  const flexGiftAtPayment = Number.isFinite(piFlexCents)
    ? piFlexCents === 0 && (pi.metadata?.incentive === "flex" || flexGiftActive(m, paidAt) || flexGiftActive(m))
    : flexGiftActive(m, paidAt);
  const breakdownOpts = { at: paidAt, flexGift: flexGiftAtPayment };
  const { listingFacts } = await import("../routers/checkout");
  const facts = await listingFacts((m as any).listingId);
  let b = breakdownFromIntent(m, facts.bedrooms, breakdownOpts);

  // Retomável: a reserva pode já existir de uma tentativa anterior (metadata do
  // PI, ou intent — inclui recuperação manual de um settle que morreu a meio).
  let reservationId: string | null =
    pi.metadata.guestyReservationId || (m as any).reservationId || null;
  let confirmationCode: string =
    pi.metadata.guestyConfirmationCode || (m as any).confirmationCode || "";

  if (!reservationId) {
    if (pi.currency !== 'eur' || (m as any).paymentIntentId !== pi.id) throw new Error('Payment identity mismatch');
    const trusted = await trustedStayQuote(m as any, paidAt);
    assertQuotedTotal(m.quote, trusted.quote);
    b = breakdownFromIntent({ ...m, quote: trusted.quote }, facts.bedrooms, breakdownOpts);
    // Defesa central: o valor cobrado TEM de bater com a matemática do servidor.
    // Em duas partes, com a primeira parte da divisão exata (spec 2.2), e a
    // divisão gravada no PI tem de ser a mesma que o servidor recalcula.
    const expected = twoParts ? splitTwoParts(b).depositCents : b.totalCents;
    if (Math.abs(pi.amount - expected) > 1) {
      console.error(`[Card2b] AMOUNT MISMATCH intent=${intentId} pi=${pi.amount}c expected=${expected}c — reserva NÃO criada`);
      throw new Error("charged amount does not match server pricing");
    }
    if (twoParts) {
      const split = splitTwoParts(b);
      if (
        Number(pi.metadata.depositStayCents) !== split.depositStayCents ||
        Number(pi.metadata.balanceCents) !== split.balanceCents ||
        !pi.customer
      ) {
        console.error(
          `[TwoParts] divisao do PI ${paymentIntentId} nao bate com o servidor (estadia ${pi.metadata.depositStayCents}/${split.depositStayCents}, ` +
            `saldo ${pi.metadata.balanceCents}/${split.balanceCents}, customer ${pi.customer ? "sim" : "nao"}) — reserva NÃO criada`,
        );
        throw new Error("charged amount does not match server pricing");
      }
      // As datas autorizadas no mandato têm de ser as da política da tarifa
      // que o hóspede está a pagar. Se o intent mudou de tarifa sem passar por
      // nova cobrança, a 2.ª parte cairia noutra data: pára antes da reserva.
      const schedule = twoPartsSchedule(intentPolicyCode(m), String((m as any).checkIn ?? ""));
      const instants = schedule ? twoPartsInstants(schedule) : null;
      if (
        !schedule ||
        !instants ||
        pi.metadata.policyCode !== schedule.policyCode ||
        pi.metadata.chargeAt !== instants.chargeAt.toISOString() ||
        pi.metadata.hardStopAt !== instants.hardStopAt.toISOString() ||
        pi.metadata.freeCancelDeadlineAt !== instants.freeCancelDeadlineAt.toISOString()
      ) {
        console.error(
          `[TwoParts] datas do PI ${paymentIntentId} nao batem com a tarifa do intent ` +
            `(${pi.metadata.policyCode}/${schedule?.policyCode ?? "-"}, C ${pi.metadata.chargeAt}/${instants?.chargeAt.toISOString() ?? "-"}) — reserva NÃO criada`,
        );
        throw new Error("charged amount does not match server pricing");
      }
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

  // Duas partes: o que pagou hoje e o que fica agendado. A metade da estadia e
  // o saldo vêm do PI (congelados na cobrança, validados acima na 1.ª passagem).
  const depositStayCents = twoParts ? Number(pi.metadata.depositStayCents) : b.stayCents;
  if (twoParts && !(Number.isSafeInteger(depositStayCents) && depositStayCents > 0)) {
    throw new Error(`PI ${paymentIntentId} em duas partes sem depositStayCents valido`);
  }
  if (twoParts && pi.metadata.scheduleRecorded !== "1") {
    // Logo a seguir ao carimbo da reserva (spec 5.5): sem esta linha ninguém
    // cobraria a 2.ª parte. Falha → o settle lança e o sweep/webhook retoma.
    await recordTwoPartsSchedule({ intentId, intent: m, pi, reservationId, confirmationCode, depositStayCents });
    await updatePaymentIntentMetadata(paymentIntentId, { scheduleRecorded: "1" }).catch(() => {});
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
    // Em duas partes só a metade da estadia paga hoje; o saldo regista-se
    // quando for cobrado (Fase 2), nunca antes.
    const outcome = await recordExternalPayment(reservationId, depositStayCents / 100, "EUR", paymentIntentId);
    if (outcome === "settled") {
      console.warn(
        `[Card2b] reserva=${reservationId}: saldo ja a zero sem registo visivel do PI ${paymentIntentId} — ` +
          `registo anterior sem nota legivel, ou liquidada por outra via`,
      );
    }
    await updatePaymentIntentMetadata(paymentIntentId, { guestyPaymentRecorded: "1" }).catch(() => {});
  }
  if (twoParts) {
    // A partir daqui o total do folio serve de referência à reconciliação do
    // motor (antes, o acerto do folio ainda podia mexer nele). Uma falha só
    // atrasa essa referência; nunca trava o settle.
    try {
      const { markGuestyDepositRecordedByIntent } = await import("../db");
      await markGuestyDepositRecordedByIntent(intentId, new Date());
    } catch (err: any) {
      console.warn(`[TwoParts] marca de 1.a parte registada nao gravada intent=${intentId}: ${err?.message}`);
    }
  }
  if (pi.metadata.splitNoteAdded !== "1") {
    // Quem abrir a reserva vê "Pending payment collection" e nao tem como
    // saber que o saldo nao e divida do hospede. Fica dito aqui, ao lado.
    const gapWarning = priceGap > 0
      ? ` ATENCAO: o Guesty preca esta estadia ${priceGap.toFixed(2)} EUR acima do que o site cobrou, ` +
        `e esse saldo aparece como "pending payment collection". NAO e divida do hospede: ` +
        (twoParts
          ? `alem da 2.a parte agendada, nao ha nada a pedir-lhe. `
          : `ele pagou por inteiro o preco que lhe foi apresentado. `) +
        `Nao lhe pedir pagamento nem dados de cartao. Diferenca a resolver internamente.`
      : "";
    // O NIF pedido no checkout tem de chegar a quem fatura (spec 5.13). O campo
    // do Guesty que a Hostkit lê está por confirmar; até lá vai na nota, onde o
    // CS o vê ao lado da reserva.
    const nif = String((m as any).nif ?? "").trim();
    const nifLine = nif ? ` NIF para a fatura: ${nif}.` : "";
    const servicesEur = ((pi.amount - depositStayCents) / 100).toFixed(2);
    const noteText = twoParts
      ? `Checkout 2.0 em duas partes: 1.a parte ${(depositStayCents / 100).toFixed(2)} EUR registada (PI ${paymentIntentId}); ` +
        `2.a parte ${(Number(pi.metadata.balanceCents) / 100).toFixed(2)} EUR agendada para ${lisbonDayLabel(pi.metadata.chargeAt)}, ` +
        `cobrada AUTOMATICAMENTE pela plataforma. NAO cobrar no Guesty, NAO criar payment link, NAO pedir cartao ao hospede, ` +
        `NAO alterar datas aqui (alterar pelo site/admin). Servicos ${servicesEur} EUR faturados pela Portugal Active.` +
        gapWarning + nifLine
      : `Checkout 2.0: pagamento unico ${(pi.amount / 100).toFixed(2)} EUR na plataforma ` +
        `(estadia ${(b.stayCents / 100).toFixed(2)} registada aqui; servicos ${((pi.amount - b.stayCents) / 100).toFixed(2)} faturados pela Portugal Active). PI ${paymentIntentId}.` +
        gapWarning + nifLine;
    const noted = await appendReservationNote(reservationId, noteText).catch(() => false);
    if (noted) {
      await updatePaymentIntentMetadata(paymentIntentId, { splitNoteAdded: "1" }).catch(() => {});
    }
  }
  // Cartao na carteira do Guesty. Sem isto o Guesty fica sem forma de cobrar
  // caucao, danos, noites extra ou saldos — capacidade que o fluxo antigo
  // (BE instant com ccToken) tinha e o checkout 2.0 perdeu. Idempotente pelo
  // carimbo cardOnFile; fail-soft, nunca trava a reserva.
  if (twoParts) {
    // A plataforma é dona do cartão nas duas partes (spec 5.1): o cartão nunca
    // entra na carteira do Guesty, nem depois do saldo. Um pm_ só pode estar
    // num Customer, e no Guesty ficaria ao alcance da Auto-Payment com saldo
    // aberto (o padrão do GY-WRBPgyUu).
    if (pi.metadata.cardOnFile !== "platform") {
      await updatePaymentIntentMetadata(paymentIntentId, { cardOnFile: "platform" }).catch(() => {});
    }
  } else if (pi.metadata.cardOnFile !== "1") {
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
  // Os emails e o manifesto mostram o Flex como foi cobrado, não como a
  // oferta estaria agora (pode ter expirado desde o pagamento).
  await completeCheckoutIntent(intentId, reservationId, confirmationCode, { flexGift: flexGiftAtPayment, at: paidAt });
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
    // Em duas partes, só a metade da estadia foi paga hoje: é esse o valor a
    // registar à mão, nunca a estadia inteira (o saldo é cobrado mais tarde).
    // Com o PI ilegível, o plano lê-se no intent: nunca mandar registar a
    // estadia inteira numa reserva em que só se pagou metade.
    const twoPartsPlan = meta ? meta.plan === "two_parts" : m.paymentPlan === "two_parts";
    const twoPartsDeposit = twoPartsPlan && meta && Number(meta.depositStayCents) > 0
      ? (Number(meta.depositStayCents) / 100).toFixed(2)
      : null;
    const twoPartsLine = !twoPartsPlan
      ? ""
      : twoPartsDeposit
        ? ` · PAGAMENTO EM DUAS PARTES: pago hoje ${twoPartsDeposit} EUR da estadia; 2.ª parte ${(Number(meta!.balanceCents) / 100).toFixed(2)} EUR ` +
          (meta!.scheduleRecorded === "1"
            ? "agendada"
            : "AINDA NÃO AGENDADA (sem esta linha ninguém a cobra; o settle grava-a quando voltar a correr)")
        : " · PAGAMENTO EM DUAS PARTES: confirmar no Stripe quanto foi pago (metadata depositStayCents) antes de registar o que quer que seja";
    const stayLine = `Estadia: ${m.checkIn || "?"} → ${m.checkOut || "?"} · ${m.guests ?? "?"} hóspedes · estadia ${m.quote?.total ?? "?"} EUR` + twoPartsLine;
    const stayToRecord = twoPartsPlan
      ? twoPartsDeposit ?? "a 1.ª parte da estadia indicada no Stripe (depositStayCents, nunca a estadia inteira)"
      : (m.quote?.total ?? "a estadia");
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
            ? `O sweep automático deixa de tentar dentro de 1 hora. Resolver hoje: abrir a reserva no Guesty e, só se não existir um pagamento com "PaymentIntent: ${paymentIntentId}" na nota, registar ${stayToRecord} EUR como pagamento externo com essa nota.`
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
