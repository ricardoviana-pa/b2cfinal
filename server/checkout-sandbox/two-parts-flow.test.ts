import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Pagamento em duas partes, Fase 1 (dormente): o router e o settle reais, sem
 * fornecedores. O checkout-flow.test.ts cobre o caminho de hoje e fica igual;
 * aqui liga-se a flag (modo de teste da Stripe, sem grupo de controlo) e
 * verifica-se o que muda: valor da 1.ª parte, Customer, mandato, linha da
 * 2.ª parte, Flex oferecido por pagamento integral e projeção do getIntent.
 */
const fake = vi.hoisted(() => ({
  supplierQuote: vi.fn(), markPaid: vi.fn(),
  intents: new Map<string, any>(), payments: new Map<string, any>(), keys: new Map<string, string>(),
  createIntent: vi.fn(), getIntent: vi.fn(), updateIntent: vi.fn(),
  createPayment: vi.fn(), getPayment: vi.fn(), cancelPayment: vi.fn(), metadata: vi.fn(),
  ensureCustomer: vi.fn(), redisplay: vi.fn(),
  setCustomer: vi.fn(), insertMandate: vi.fn(), insertSchedule: vi.fn(), getSchedule: vi.fn(), linkMandates: vi.fn(),
  mandates: [] as any[], schedules: new Map<string, any>(),
  reserve: vi.fn(), recordPayment: vi.fn(), note: vi.fn(), attachCard: vi.fn(),
  opsEmail: vi.fn(), guestEmail: vi.fn(), lead: vi.fn(),
}));

vi.mock('../lib/guesty', () => ({ guestyBEClient: { request: fake.supplierQuote } }));
vi.mock('../db', () => ({
  markBookingIntentPaid: fake.markPaid,
  createBookingIntent: fake.createIntent, getBookingIntent: fake.getIntent,
  updateBookingIntent: fake.updateIntent, createLead: fake.lead,
  promoteCheckoutLeadToNewsletter: vi.fn(), demoteCheckoutLeadFromNewsletter: vi.fn(),
  setIntentStripeCustomer: fake.setCustomer, insertCardMandate: fake.insertMandate,
  insertScheduledPayment: fake.insertSchedule, getScheduledPaymentByIntent: fake.getSchedule,
  linkCardMandatesToSchedule: fake.linkMandates,
  markGuestyDepositRecordedByIntent: vi.fn(async () => {}),
}));
vi.mock('../services/visit-origin-store', () => ({ saveIntentOrigin: vi.fn(async () => true), getIntentOrigin: vi.fn(async () => null) }));
vi.mock('../services/properties-store', () => ({ getPropertiesForSite: vi.fn(async () => [
  { guestyId: 'synthetic-listing', slug: 'synthetic-home', bedrooms: 3, amenities: [] },
]) }));
vi.mock('../services/transactional-email', () => ({
  sendCheckoutOpsManifest: fake.opsEmail, sendCheckoutGuestConfirmation: fake.guestEmail, sendOpsAlert: vi.fn(async () => true),
}));
vi.mock('../services/stripe-klarna', () => ({
  createCardPaymentIntent: fake.createPayment, getPaymentIntent: fake.getPayment,
  cancelPaymentIntent: fake.cancelPayment, updatePaymentIntentMetadata: fake.metadata,
  findSucceededPaymentIntentByIntentId: vi.fn(), createPartialRefund: vi.fn(),
  ensureStripeCustomer: fake.ensureCustomer, allowPaymentMethodRedisplay: fake.redisplay,
}));
vi.mock('../services/guesty-openapi-paypal', () => ({
  createReservationViaOpenApi: fake.reserve, recordExternalPayment: fake.recordPayment,
  appendReservationNote: fake.note, fetchReservationConfirmationCode: vi.fn(async () => 'SYNTHETIC-BOOKING'),
  getReservationBalanceDue: vi.fn(async () => 2147), addReservationServiceFee: vi.fn(async () => 'added'),
  getReservationSettlementState: vi.fn(async () => ({ balanceDue: 2147, totalPaid: 0, payments: [] })),
  paymentRecordsIntent: vi.fn(() => false),
  fetchPaymentProviderId: vi.fn(), fetchReservationGuestId: vi.fn(), attachGuestPaymentMethod: fake.attachCard,
  // Folio liquidado depois do registo (só o caminho integral o lê, para o cartão em carteira).
  fetchReservationPaymentState: vi.fn(async () => ({ balanceDue: 0 })),
}));

import { checkoutRouter } from '../routers/checkout';
const caller = () => checkoutRouter.createCaller({
  req: { headers: { host: 'checkout.invalid', 'cf-connecting-ip': '203.0.113.7' } }, res: {}, user: null,
} as any);
const quote = { nightlyRate: 500.5, totalNights: 2002, cleaningFee: 120,
  taxesAndFees: 25, total: 2147, nights: 4, currency: 'EUR', quoteCreatedAt: Date.now() };

/** Tarifa reembolsável MODERATE (7 dias), estadia de 2 147 €: elegível com check-in em 2099. */
function supplierQuote(policy = 'MODERATE') {
  return async () => ({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', unitTypeId: 'synthetic-listing',
    checkInDateLocalized: '2099-11-10', checkOutDateLocalized: '2099-11-14', guestsCount: 4,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    rates: { ratePlans: [{ ratePlan: { _id: 'synthetic-flex', name: 'Flexible', cancellationPolicy: policy,
      money: { subTotalPrice: 2147, fareCleaning: 120, currency: 'EUR' } } }] } });
}

async function readyIntent(patch: Record<string, unknown> = {}) {
  const { intentId } = await caller().createIntent({ listingId: 'synthetic-listing',
    propertyName: 'Synthetic test home', propertySlug: 'synthetic-home',
    guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', ratePlanId: 'synthetic-flex',
    checkIn: '2099-11-10', checkOut: '2099-11-14', guests: 4, locale: 'pt', quote });
  const id = intentId!;
  await caller().captureLead({ intentId: id, email: 'guest@checkout.invalid', consent: false, locale: 'pt' });
  await caller().updateIntent({ intentId: id, patch: {
    guestFirstName: 'Synthetic', guestLastName: 'Guest', guestPhone: '+000000000', reception: { type: 'self' }, ...patch,
  } });
  return id;
}

/** O que a Stripe faria ao confirmar: PI pago com o cartão guardado no Customer. */
function pay(piId: string) {
  const pi = fake.payments.get(piId);
  Object.assign(pi, {
    status: 'succeeded', livemode: false, created: Math.floor(Date.now() / 1000),
    payment_method: pi.customer
      ? { id: 'pm_synthetic', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2099 } }
      : 'pm_synthetic',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CHECKOUT_TWO_PARTS', 'true');
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic');
  vi.stubEnv('CHECKOUT_TWO_PARTS_HOLDOUT', '0');
  fake.supplierQuote.mockImplementation(supplierQuote());
  fake.intents.clear(); fake.payments.clear(); fake.keys.clear(); fake.schedules.clear(); fake.mandates = [];
  fake.createIntent.mockImplementation(async (data) => { fake.intents.set(data.id, structuredClone(data)); return data.id; });
  fake.markPaid.mockImplementation(async (id, reservationId, confirmationCode) => {
    const m = fake.intents.get(id); if (!m || m.status === 'paid') return false;
    Object.assign(m, { status: 'paid', reservationId, confirmationCode }); return true;
  });
  fake.getIntent.mockImplementation(async id => structuredClone(fake.intents.get(id) ?? null));
  fake.updateIntent.mockImplementation(async (id, patch) => {
    if (!fake.intents.has(id)) return false;
    Object.assign(fake.intents.get(id), structuredClone(patch)); return true;
  });
  fake.getPayment.mockImplementation(async id => {
    if (!fake.payments.has(id)) throw new Error('synthetic payment not found');
    return structuredClone(fake.payments.get(id));
  });
  fake.createPayment.mockImplementation(async params => {
    const prior = fake.keys.get(params.idempotencyKey);
    if (prior) return structuredClone(fake.payments.get(prior));
    const pi = { id: `pi_synthetic_${fake.payments.size + 1}`, client_secret: 'synthetic_secret',
      status: 'requires_payment_method', amount: params.amount, currency: params.currency,
      customer: params.customer ?? null, metadata: params.metadata,
      automatic_payment_methods: params.wallet ? { enabled: true } : null };
    fake.payments.set(pi.id, pi); fake.keys.set(params.idempotencyKey, pi.id); return structuredClone(pi);
  });
  fake.cancelPayment.mockImplementation(async id => { fake.payments.get(id).status = 'canceled'; });
  fake.metadata.mockImplementation(async (id, data) => Object.assign(fake.payments.get(id).metadata, data));
  fake.ensureCustomer.mockResolvedValue('cus_synthetic');
  fake.redisplay.mockResolvedValue(undefined);
  fake.setCustomer.mockImplementation(async (id, customer) => {
    const m = fake.intents.get(id); if (!m) return false;
    if (m.stripeCustomerId && m.stripeCustomerId !== customer) return false;
    m.stripeCustomerId = customer; return true;
  });
  fake.insertMandate.mockImplementation(async (row) => {
    if (fake.mandates.some(x => x.paymentIntentId === row.paymentIntentId)) return 'exists';
    fake.mandates.push(structuredClone(row)); return 'inserted';
  });
  fake.insertSchedule.mockImplementation(async (row) => {
    if (fake.schedules.has(row.intentId)) return 'exists';
    fake.schedules.set(row.intentId, structuredClone(row)); return 'inserted';
  });
  fake.getSchedule.mockImplementation(async (intentId) => structuredClone(fake.schedules.get(intentId) ?? null));
  fake.linkMandates.mockResolvedValue(undefined);
  fake.reserve.mockResolvedValue({ reservationId: 'synthetic-reservation', confirmationCode: 'SYNTHETIC-BOOKING' });
  fake.recordPayment.mockResolvedValue('recorded'); fake.note.mockResolvedValue(true);
  fake.opsEmail.mockResolvedValue(undefined); fake.guestEmail.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('duas partes: cobrança da 1.ª parte', () => {
  it('cobra metade da estadia ao euro, com Customer gravado antes do PI e mandato registado', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    // 2 147,00 € → 1.ª parte 1 074 € (metade arredondada ao euro para cima), 2.ª parte 1 073 €.
    expect(res).toMatchObject({ totalCents: 107400, plan: 'two_parts', balanceCents: 107300, alreadyPaid: false });
    const params = fake.createPayment.mock.calls[0][0];
    expect(params).toMatchObject({
      amount: 107400, customer: 'cus_synthetic', wallet: false, statementDescriptorSuffix: 'PART 1/2',
      metadata: expect.objectContaining({ flow: 'card_v2', plan: 'two_parts', part: 'deposit',
        depositStayCents: '107400', balanceCents: '107300', policyCode: 'moderate', stayCents: '214700' }),
    });
    // C = D − 10 = 2099-11-03 − 10 = 2099-10-24 às 10:00 de Lisboa (ainda hora de verão, UTC+1;
    // a mudança é no dia seguinte, último domingo de outubro).
    expect(params.metadata.chargeAt).toBe('2099-10-24T09:00:00.000Z');
    expect(fake.setCustomer.mock.invocationCallOrder[0]).toBeLessThan(fake.createPayment.mock.invocationCallOrder[0]);
    expect(fake.intents.get(id)).toMatchObject({ paymentPlan: 'two_parts', stripeCustomerId: 'cus_synthetic', paymentIntentId: res.paymentIntentId });
    expect(fake.mandates).toEqual([expect.objectContaining({
      intentId: id, paymentIntentId: res.paymentIntentId, amountLaterCents: 107300, source: 'checkout',
      mandateLang: 'pt', acceptedIp: '203.0.113.7', mandateTextHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    })]);
  });

  it('sem a caixa do mandato não há PI', async () => {
    const id = await readyIntent();
    await expect(caller().createCardCharge({ intentId: id, plan: 'two_parts' })).rejects.toThrow('authorisation');
    expect(fake.createPayment).not.toHaveBeenCalled();
    expect(fake.ensureCustomer).not.toHaveBeenCalled();
  });

  it('se o mandato não ficar registado, o browser não recebe o PI para confirmar', async () => {
    const id = await readyIntent();
    fake.insertMandate.mockRejectedValueOnce(new Error('db down'));
    await expect(caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true })).rejects.toThrow('could not be prepared');
    // A repetição retoma o mesmo PI (nada foi confirmado) e regista o mandato.
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    expect(fake.createPayment).toHaveBeenCalledOnce();
    expect(fake.mandates.map(x => x.paymentIntentId)).toEqual([res.paymentIntentId]);
  });

  it('a repetição retoma o PI da 1.ª parte em vez de criar outro', async () => {
    const id = await readyIntent();
    const first = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    const again = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    expect(again.paymentIntentId).toBe(first.paymentIntentId);
    expect(fake.createPayment).toHaveBeenCalledOnce();
    expect(fake.ensureCustomer).toHaveBeenCalledOnce();
  });

  it('com a flag desligada, pedir duas partes é recusado em vez de cobrar 100% calado', async () => {
    vi.stubEnv('CHECKOUT_TWO_PARTS', 'false');
    const id = await readyIntent();
    await expect(caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true })).rejects.toThrow('not available');
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('em modo live a oferta não existe enquanto o motor da 2.ª parte não estiver pronto', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_synthetic');
    const id = await readyIntent();
    await expect(caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true })).rejects.toThrow('not available');
    expect(fake.createPayment).not.toHaveBeenCalled();
  });

  it('tarifa não reembolsável: duas partes recusadas', async () => {
    fake.supplierQuote.mockImplementation(supplierQuote('SUPER_STRICT'));
    const id = await readyIntent();
    await expect(caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true })).rejects.toThrow('not available');
  });
});

describe('duas partes: Flex oferecido a quem paga tudo agora (opção A)', () => {
  it('pagamento integral numa reserva elegível leva o Flex a 0 €', async () => {
    const id = await readyIntent({ flex: true });
    const res = await caller().createCardCharge({ intentId: id, plan: 'full' });
    // Sem oferta seria 2 147 + 203 de Flex (10% das noites da quote confirmada,
    // 2 027 €); com o incentivo, o Flex entra a 0 €.
    expect(res).toMatchObject({ totalCents: 214700, plan: 'full', balanceCents: 0 });
    expect(fake.intents.get(id)).toMatchObject({ flex: true, flexGiftReason: 'full_payment', flexGiftPrevFlex: true });
    expect(fake.createPayment.mock.calls[0][0]).toMatchObject({ metadata: expect.objectContaining({ incentive: 'flex', flexCents: '0' }) });
    expect(fake.createPayment.mock.calls[0][0].customer).toBeUndefined();
  });

  it('wallet com duas partes pedido cai para o integral com o incentivo', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true, wallet: true });
    expect(res).toMatchObject({ totalCents: 214700, plan: 'full' });
    expect(fake.intents.get(id)).toMatchObject({ flex: true, flexGiftReason: 'full_payment', flexGiftPrevFlex: false });
    expect(fake.ensureCustomer).not.toHaveBeenCalled();
  });

  it('passar a duas partes retira o Flex oferecido, repõe a escolha e cancela o PI integral', async () => {
    const id = await readyIntent({ flex: true });
    const full = await caller().createCardCharge({ intentId: id, plan: 'full' });
    const two = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    expect(fake.payments.get(full.paymentIntentId).status).toBe('canceled');
    // O hóspede tinha escolhido o Flex: volta a pagá-lo, na 1.ª parte (spec 2.2).
    expect(two.totalCents).toBe(107400 + 20300);
    expect(fake.intents.get(id)).toMatchObject({ flex: true, flexGiftReason: null, flexGiftUntil: null });
  });

  it('quem não tinha escolhido o Flex não fica a pagá-lo ao passar a duas partes', async () => {
    const id = await readyIntent();
    await caller().createCardCharge({ intentId: id, plan: 'full' });
    const two = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    expect(two.totalCents).toBe(107400);
    expect(fake.intents.get(id).flex).toBe(false);
  });
});

describe('duas partes: o Flex oferecido nunca se transforma num Flex pago', () => {
  it('sem seletor no ecrã (sem plan no pedido) não há Flex oferecido, mesmo com a flag ligada', async () => {
    const id = await readyIntent({ flex: true });
    const res = await caller().createCardCharge({ intentId: id });
    expect(res).toMatchObject({ totalCents: 214700 + 20300, plan: 'full' });
    expect(fake.intents.get(id).flexGiftReason ?? null).toBeNull();
    expect(fake.createPayment.mock.calls[0][0].metadata.incentive).toBeUndefined();
  });

  it('mudar de datas retira a oferta (Klarna e PayPal não a levariam numa reserva já sem direito); o eco da mesma tarifa não', async () => {
    const id = await readyIntent();
    await caller().createCardCharge({ intentId: id, plan: 'full' });
    expect(fake.intents.get(id).flexGiftReason).toBe('full_payment');
    await caller().updateIntent({ intentId: id, patch: { ratePlanId: 'synthetic-flex' } });
    expect(fake.intents.get(id).flexGiftReason).toBe('full_payment');
    // Uma quote nova com outro preço (o requote do checkout depois de mudar a estadia).
    await caller().updateIntent({ intentId: id, patch: { quote: { ...quote, total: 2000 } } });
    expect(fake.intents.get(id)).toMatchObject({ flex: false, flexGiftReason: null, flexGiftUntil: null });
  });

  it('depois de a oferta expirar, ligar o Flex é uma escolha e não um eco', async () => {
    const id = await readyIntent();
    await caller().createCardCharge({ intentId: id, plan: 'full' });
    fake.intents.get(id).flexGiftUntil = new Date(Date.now() - 60_000);
    await caller().updateIntent({ intentId: id, patch: { flex: true } });
    expect(fake.intents.get(id).flexGiftPrevFlex).toBe(true);
  });

  it('um PI com o Flex oferecido fecha mesmo que a oferta tenha saído do intent depois', async () => {
    const id = await readyIntent({ flex: true });
    const res = await caller().createCardCharge({ intentId: id, plan: 'full' });
    pay(res.paymentIntentId);
    Object.assign(fake.intents.get(id), { flexGiftUntil: null, flexGiftReason: null });
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).resolves.toMatchObject({
      reservationId: 'synthetic-reservation',
    });
  });

  it('quem não escolheu o Flex e volta depois de a oferta expirar não o paga', async () => {
    const id = await readyIntent();
    await caller().createCardCharge({ intentId: id, plan: 'full' });
    expect(fake.intents.get(id)).toMatchObject({ flex: true, flexGiftReason: 'full_payment' });
    // 8 dias depois: a oferta expirou e o hóspede volta a pagar.
    fake.intents.get(id).flexGiftUntil = new Date(Date.now() - 60_000);
    const view = await caller().getIntent({ intentId: id });
    expect(view.intent).toMatchObject({ flex: false, flexGiftUntil: null });
    // A reserva continua elegível, por isso a oferta renova-se; o preço nunca inclui o Flex.
    const again = await caller().createCardCharge({ intentId: id, plan: 'full' });
    expect(again.totalCents).toBe(214700);
    expect(fake.intents.get(id)).toMatchObject({ flexGiftReason: 'full_payment', flexGiftPrevFlex: false });
  });

  it('se a reserva deixa de ser elegível, a oferta sai e o Flex volta à escolha do hóspede', async () => {
    const id = await readyIntent();
    await caller().createCardCharge({ intentId: id, plan: 'full' });
    vi.stubEnv('CHECKOUT_TWO_PARTS', 'false');
    const res = await caller().createCardCharge({ intentId: id });
    expect(res.totalCents).toBe(214700);
    expect(fake.intents.get(id)).toMatchObject({ flex: false, flexGiftReason: null, flexGiftUntil: null });
  });

  it('o eco do Flex oferecido que o checkout reenvia antes de pagar não conta como escolha', async () => {
    const id = await readyIntent();
    await caller().createCardCharge({ intentId: id, plan: 'full' });
    await caller().updateIntent({ intentId: id, patch: { flex: true } }); // flushPendingSaves
    expect(fake.intents.get(id).flexGiftPrevFlex).toBe(false);
    const two = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    expect(two.totalCents).toBe(107400);
  });

  it('um clique do hóspede no Flex durante a oferta passa a ser a escolha que se repõe', async () => {
    const id = await readyIntent({ flex: true });
    await caller().createCardCharge({ intentId: id, plan: 'full' });
    // Tira o Flex oferecido; depois passa a duas partes: não volta a aparecer.
    await caller().updateIntent({ intentId: id, patch: { flex: false } });
    expect(fake.intents.get(id).flexGiftPrevFlex).toBe(false);
    const two = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    expect(two.totalCents).toBe(107400);
    expect(fake.intents.get(id).flex).toBe(false);
  });

  it('o Flex oferecido só se grava junto com o PI novo: se o PI anterior acabou de ser pago, nada muda', async () => {
    const id = await readyIntent({ flex: true });
    const two = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    const before = structuredClone(fake.intents.get(id));
    // O 3DS da 1.ª parte termina enquanto o hóspede escolhe pagar tudo.
    const prevGet = fake.getPayment.getMockImplementation()!;
    let reads = 0;
    fake.getPayment.mockImplementation(async (piId: string) => {
      reads += 1;
      if (reads === 2) fake.payments.get(piId).status = 'succeeded';
      return prevGet(piId);
    });
    const res = await caller().createCardCharge({ intentId: id, plan: 'full' });
    expect(res).toMatchObject({ alreadyPaid: true, paymentIntentId: two.paymentIntentId });
    expect(fake.intents.get(id).flexGiftReason ?? null).toBe(before.flexGiftReason ?? null);
    expect(fake.intents.get(id).flex).toBe(before.flex);
  });

  it('um PI de duas partes não se reaproveita se as datas autorizadas mudaram', async () => {
    const id = await readyIntent();
    const first = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    // Mesmo valor, mas o PI guardado tem outra data de cobrança (tarifa diferente, outra regra).
    fake.payments.get(first.paymentIntentId).metadata.chargeAt = '2099-10-17T09:00:00.000Z';
    const again = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    expect(again.paymentIntentId).not.toBe(first.paymentIntentId);
    expect(fake.payments.get(first.paymentIntentId).status).toBe('canceled');
  });
});

describe('caminho de hoje (flag desligada): o Flex como foi cobrado', () => {
  beforeEach(() => { vi.stubEnv('CHECKOUT_TWO_PARTS', ''); });

  it('um PI com outras componentes de preço não se reaproveita, mesmo com o mesmo total', async () => {
    const id = await readyIntent();
    const first = await caller().createCardCharge({ intentId: id });
    // Simula um PI antigo com o mesmo total mas outra composição (Flex trocado por um extra).
    Object.assign(fake.payments.get(first.paymentIntentId).metadata, { flexCents: '20300', lines: 'breakfast-box:20300' });
    const again = await caller().createCardCharge({ intentId: id });
    expect(again.paymentIntentId).not.toBe(first.paymentIntentId);
    expect(fake.payments.get(first.paymentIntentId).status).toBe('canceled');
  });

  it('Flex ligado no intent depois de o PI existir, sem oferta: o settle pára (não regista um Flex não pago)', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id });
    fake.intents.get(id).flex = true; // outro separador, depois de o PI existir
    pay(res.paymentIntentId);
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).rejects.toThrow('does not match');
    expect(fake.reserve).not.toHaveBeenCalled();
  });

  it('PI criado com o Flex pago antes de uma oferta do funil, pago depois de ela expirar: reserva criada', async () => {
    const id = await readyIntent({ flex: true });
    const res = await caller().createCardCharge({ intentId: id });
    expect(res.totalCents).toBe(214700 + 20300);
    pay(res.paymentIntentId);
    fake.payments.get(res.paymentIntentId).created = Math.floor((Date.now() - 7 * 86_400_000) / 1000);
    // Contacto 3 do funil ao dia 3 (válido até ao dia 6); o hóspede paga ao dia 7.
    Object.assign(fake.intents.get(id), { flexGiftUntil: new Date(Date.now() - 86_400_000), flexGiftReason: 'recovery' });
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).resolves.toMatchObject({
      reservationId: 'synthetic-reservation',
    });
  });

  it('pago com a oferta do funil em vigor e fechado depois de ela expirar: emails com o Flex a 0 €', async () => {
    const id = await readyIntent({ flex: true });
    Object.assign(fake.intents.get(id), { flexGiftUntil: new Date(Date.now() + 3_600_000), flexGiftReason: 'recovery' });
    const res = await caller().createCardCharge({ intentId: id });
    expect(res.totalCents).toBe(214700);
    pay(res.paymentIntentId);
    fake.payments.get(res.paymentIntentId).created = Math.floor((Date.now() - 2 * 3_600_000) / 1000);
    fake.intents.get(id).flexGiftUntil = new Date(Date.now() - 3_600_000);
    fake.intents.get(id).email = 'guest@checkout.invalid';
    await caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId });
    await vi.waitFor(() => expect(fake.guestEmail).toHaveBeenCalledOnce());
    expect(fake.guestEmail.mock.calls[0][0].canonical).toMatchObject({ flexCents: 0, totalCents: 214700 });
  });
});

describe('duas partes: settle da 1.ª parte', () => {
  it('cria a reserva, regista só a metade da estadia, agenda a 2.ª parte e não põe o cartão no Guesty', async () => {
    const id = await readyIntent({ nif: '123456789' });
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    pay(res.paymentIntentId);
    const done = await caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId });
    expect(done).toEqual({ reservationId: 'synthetic-reservation', confirmationCode: 'SYNTHETIC-BOOKING' });
    expect(fake.recordPayment).toHaveBeenCalledWith('synthetic-reservation', 1074, 'EUR', res.paymentIntentId);
    expect(fake.schedules.get(id)).toMatchObject({
      intentId: id, livemode: false, siteOrigin: 'unknown', reservationId: 'synthetic-reservation',
      depositPaymentIntentId: res.paymentIntentId, depositCents: 107400, depositStayCents: 107400, balanceCents: 107300,
      stripeCustomerId: 'cus_synthetic', paymentMethodId: 'pm_synthetic', cardLast4: '4242', policyCode: 'moderate',
      status: 'scheduled',
    });
    expect(fake.schedules.get(id).chargeAt.toISOString()).toBe('2099-10-24T09:00:00.000Z');
    expect(fake.linkMandates).toHaveBeenCalledWith(id, res.paymentIntentId, expect.any(String), 'pm_synthetic', '4242');
    expect(fake.attachCard).not.toHaveBeenCalled();
    expect(fake.payments.get(res.paymentIntentId).metadata).toMatchObject({ cardOnFile: 'platform', scheduleRecorded: '1', guestyPaymentRecorded: '1' });
    const note = fake.note.mock.calls.map(c => c[1]).find((t: string) => t.includes('duas partes'));
    expect(note).toContain('2.a parte 1073.00 EUR agendada para 24/10/2099');
    expect(note).toContain('NAO cobrar no Guesty');
    expect(note).toContain('NIF para a fatura: 123456789');
    expect(fake.intents.get(id).status).toBe('paid');
  });

  it('uma 2.ª passagem do settle não agenda nem regista outra vez', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    pay(res.paymentIntentId);
    await caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId });
    await caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId });
    expect(fake.insertSchedule).toHaveBeenCalledOnce();
    expect(fake.recordPayment).toHaveBeenCalledOnce();
    expect(fake.reserve).toHaveBeenCalledOnce();
  });

  it('um PI de duas partes com valor adulterado não cria reserva', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    pay(res.paymentIntentId);
    fake.payments.get(res.paymentIntentId).amount = 100;
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).rejects.toThrow('does not match');
    expect(fake.reserve).not.toHaveBeenCalled();
  });

  it('uma divisão gravada no PI diferente da do servidor não cria reserva', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    pay(res.paymentIntentId);
    fake.payments.get(res.paymentIntentId).metadata.balanceCents = '50000';
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).rejects.toThrow('does not match');
    expect(fake.reserve).not.toHaveBeenCalled();
  });

  it('sem linha da 2.ª parte gravada, o settle não fecha a reserva como paga', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    pay(res.paymentIntentId);
    fake.insertSchedule.mockRejectedValueOnce(new Error('db down'));
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).rejects.toThrow('db down');
    expect(fake.recordPayment).not.toHaveBeenCalled();
    expect(fake.intents.get(id).status).not.toBe('paid');
    // O sweep/webhook retoma a MESMA reserva e agenda.
    await caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId });
    expect(fake.reserve).toHaveBeenCalledOnce();
    expect(fake.schedules.has(id)).toBe(true);
  });

  it('datas no PI diferentes das da tarifa do intent: reserva não criada', async () => {
    const id = await readyIntent();
    const res = await caller().createCardCharge({ intentId: id, plan: 'two_parts', mandateAccepted: true });
    pay(res.paymentIntentId);
    fake.payments.get(res.paymentIntentId).metadata.chargeAt = '2099-10-17T09:00:00.000Z';
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).rejects.toThrow('does not match');
    expect(fake.reserve).not.toHaveBeenCalled();
  });

  it('o Flex oferecido conta no instante do pagamento, não no do settle', async () => {
    const id = await readyIntent({ flex: true });
    const res = await caller().createCardCharge({ intentId: id, plan: 'full' });
    pay(res.paymentIntentId);
    // Pago há 2 h, com a oferta válida; a oferta expirou há 1 h, antes de o
    // settle correr (sweep tardio). O total esperado é o do pagamento.
    fake.payments.get(res.paymentIntentId).created = Math.floor((Date.now() - 2 * 3_600_000) / 1000);
    fake.intents.get(id).flexGiftUntil = new Date(Date.now() - 3_600_000);
    await expect(caller().finalizeCardCharge({ intentId: id, paymentIntentId: res.paymentIntentId })).resolves.toMatchObject({
      reservationId: 'synthetic-reservation',
    });
  });
});

describe('getIntent: projeção e oferta', () => {
  it('devolve a oferta com os valores e o texto do mandato, sem campos privados', async () => {
    const id = await readyIntent({ flex: true });
    Object.assign(fake.intents.get(id), { stripeCustomerId: 'cus_secret', paymentIntentId: 'pi_secret', recoveryStage: 2 });
    const res = await caller().getIntent({ intentId: id });
    expect(res.intent).not.toHaveProperty('stripeCustomerId');
    expect(res.intent).not.toHaveProperty('paymentIntentId');
    expect(res.intent).not.toHaveProperty('recoveryStage');
    expect(res.paymentPlan).toMatchObject({
      available: true, policyCode: 'moderate', incentive: 'flex',
      fullTodayCents: 214700, depositCents: 107400 + 20300, balanceCents: 107300,
      chargeAt: '2099-10-24T09:00:00.000Z',
      mandate: expect.objectContaining({ lang: 'pt', text: expect.stringContaining('Portugal Active') }),
    });
  });

  it('sem a flag diz só que não há oferta', async () => {
    vi.stubEnv('CHECKOUT_TWO_PARTS', '');
    const id = await readyIntent();
    expect((await caller().getIntent({ intentId: id })).paymentPlan).toEqual({ available: false, reason: 'disabled' });
  });

  it('numa tarifa não reembolsável diz porquê', async () => {
    fake.supplierQuote.mockImplementation(supplierQuote('SUPER_STRICT'));
    const id = await readyIntent();
    expect((await caller().getIntent({ intentId: id })).paymentPlan).toEqual({ available: false, reason: 'policy' });
  });
});
