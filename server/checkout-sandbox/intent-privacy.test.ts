import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O que o link do checkout mostra conforme o estado (auditoria de 14 nov 2026,
 * segunda ronda técnica). O id do intent vai nos links de retoma e nos emails
 * de recuperação; o getIntent devolvia o nome, o email, o telefone e o NIF do
 * hóspede para sempre, também com a reserva paga ou o preço caducado.
 *
 * - em curso: tudo, como antes (a retoma mostra o que o hóspede deixou);
 * - preço caducado, ou checkout com mais de 9 dias: a estadia sem o hóspede;
 * - pago: só o código e a ligação à reserva.
 * As regras estão em services/checkout-plan.ts; aqui corre o router verdadeiro.
 */

const fake = vi.hoisted(() => ({
  intents: new Map<string, any>(),
  supplierQuote: vi.fn(),
  createIntent: vi.fn(), getIntent: vi.fn(), updateIntent: vi.fn(),
  lead: vi.fn(), promote: vi.fn(), demote: vi.fn(), consent: vi.fn(),
}));

vi.mock('../lib/guesty', () => ({ guestyBEClient: { request: fake.supplierQuote } }));
vi.mock('../db', () => ({
  createBookingIntent: fake.createIntent, getBookingIntent: fake.getIntent,
  updateBookingIntent: fake.updateIntent, createLead: fake.lead,
  promoteCheckoutLeadToNewsletter: fake.promote, demoteCheckoutLeadFromNewsletter: fake.demote,
  checkoutNewsletterConsent: fake.consent,
}));
vi.mock('../services/visit-origin-store', () => ({ saveIntentOrigin: vi.fn(async () => true), getIntentOrigin: vi.fn(async () => null) }));
vi.mock('../services/properties-store', () => ({ getPropertiesForSite: vi.fn(async () => [
  { guestyId: 'synthetic-listing', slug: 'synthetic-home', bedrooms: 3, amenities: [] },
]) }));

import { checkoutRouter } from '../routers/checkout';
import { GUEST_DETAILS_MAX_AGE_MS, GUEST_DETAIL_FIELDS } from '../services/checkout-plan';

const caller = () => checkoutRouter.createCaller({
  req: { headers: { host: 'checkout.invalid' } }, res: {}, user: null,
} as any);
const quote = { nightlyRate: 500.5, totalNights: 2002, cleaningFee: 120,
  taxesAndFees: 25, total: 2147, nights: 4, currency: 'EUR', quoteCreatedAt: Date.now() };
// Valores que não aparecem em mais nada da resposta (o nome da casa é "Synthetic test home").
const GUEST = { email: 'zefirina.q@checkout.invalid', guestFirstName: 'Zefirina', guestLastName: 'Quintanilha', guestPhone: '+351900000000', nif: 'PT999999990' };
const HOUR = 60 * 60 * 1000;

/** Um checkout no passo do pagamento, com os dados do hóspede todos escritos. */
async function checkoutWithGuest() {
  const { intentId } = await caller().createIntent({ listingId: 'synthetic-listing',
    propertyName: 'Synthetic test home', propertySlug: 'synthetic-home', destination: 'minho',
    guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', ratePlanId: 'synthetic-flex',
    checkIn: '2099-11-10', checkOut: '2099-11-14', guests: 4, locale: 'pt', quote });
  const id = intentId!;
  await caller().captureLead({ intentId: id, email: GUEST.email, consent: true, locale: 'pt' });
  await caller().updateIntent({ intentId: id, patch: {
    guestFirstName: GUEST.guestFirstName, guestLastName: GUEST.guestLastName, guestPhone: GUEST.guestPhone, nif: GUEST.nif,
    reception: { type: 'self' }, extras: [{ sku: 'private-chef', people: 4, amount: 1 }], status: 'payment_pending',
  } });
  return id;
}
const row = (id: string) => fake.intents.get(id);
/** Nada do que o hóspede escreveu aparece em lado nenhum da resposta. */
function expectNoGuest(response: unknown) {
  const text = JSON.stringify(response);
  for (const value of Object.values(GUEST)) expect(text, value).not.toContain(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CHECKOUT_TWO_PARTS', '');
  fake.intents.clear();
  fake.supplierQuote.mockImplementation(async () => ({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', unitTypeId: 'synthetic-listing',
    checkInDateLocalized: '2099-11-10', checkOutDateLocalized: '2099-11-14', guestsCount: 4,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 23 * HOUR).toISOString(),
    rates: { ratePlans: [{ ratePlan: { _id: 'synthetic-flex', name: 'Flexible', cancellationPolicy: 'MODERATE',
      money: { subTotalPrice: 2147, fareCleaning: 120, currency: 'EUR' } } }] } }));
  // Como a BD: createdAt DEFAULT now().
  fake.createIntent.mockImplementation(async (data) => { fake.intents.set(data.id, { ...structuredClone(data), createdAt: new Date() }); return data.id; });
  fake.getIntent.mockImplementation(async (id) => structuredClone(fake.intents.get(id) ?? null));
  fake.updateIntent.mockImplementation(async (id, patch) => {
    if (!fake.intents.has(id)) return false;
    Object.assign(fake.intents.get(id), structuredClone(patch)); return true;
  });
  fake.lead.mockResolvedValue({ id: 1 });
  fake.consent.mockResolvedValue(true);
});

describe('checkout em curso: a retoma mostra o que o hóspede deixou', () => {
  it('devolve os dados de contacto e a caixa de marketing', async () => {
    const id = await checkoutWithGuest();
    const r = await caller().getIntent({ intentId: id });
    expect(r.paid).toBeNull();
    expect(r.expired).toBe(false);
    expect(r.intent).toMatchObject({ ...GUEST, id, status: 'payment_pending', checkIn: '2099-11-10', guests: 4 });
    expect(r.newsletterOptIn).toBe(true);
  });
});

describe('reserva paga: o link só diz que está confirmada', () => {
  it('não devolve o intent, só o código e a ligação à reserva', async () => {
    const id = await checkoutWithGuest();
    Object.assign(row(id), { status: 'paid', reservationId: 'synthetic-reservation', confirmationCode: 'SYNTHETIC-BOOKING' });
    const r = await caller().getIntent({ intentId: id });
    expect(r).toEqual({
      intent: null, expired: false, paymentPlan: null, newsletterOptIn: null,
      paid: { reservationId: 'synthetic-reservation', confirmationCode: 'SYNTHETIC-BOOKING', propertySlug: 'synthetic-home' },
    });
    expectNoGuest(r);
    // Nem se pergunta pela lista de marketing do email de uma reserva paga.
    expect(fake.consent).not.toHaveBeenCalled();
  });

  it('continua assim mesmo que o preço também tenha caducado ou o checkout seja antigo', async () => {
    const id = await checkoutWithGuest();
    Object.assign(row(id), { status: 'paid', reservationId: 'r1', confirmationCode: 'c1',
      expiresAt: new Date(Date.now() - HOUR), createdAt: new Date(Date.now() - 30 * 24 * HOUR) });
    const r = await caller().getIntent({ intentId: id });
    expect(r.intent).toBeNull();
    expect(r.paid).toEqual({ reservationId: 'r1', confirmationCode: 'c1', propertySlug: 'synthetic-home' });
    expectNoGuest(r);
  });
});

describe('preço caducado: a estadia continua lá, o hóspede não', () => {
  it('devolve o que é preciso para atualizar o preço e continuar, sem os dados de contacto', async () => {
    const id = await checkoutWithGuest();
    row(id).expiresAt = new Date(Date.now() - HOUR);
    const r = await caller().getIntent({ intentId: id });
    expect(r.expired).toBe(true);
    expect(r.paid).toBeNull();
    expectNoGuest(r);
    for (const field of GUEST_DETAIL_FIELDS) expect(r.intent, field).toHaveProperty(field, null);
    // O que o ecrã do checkout e o link de recuperação leem para retomar.
    expect(r.intent).toMatchObject({
      id, listingId: 'synthetic-listing', propertySlug: 'synthetic-home', propertyName: 'Synthetic test home', destination: 'minho',
      checkIn: '2099-11-10', checkOut: '2099-11-14', guests: 4, ratePlanId: 'synthetic-flex',
      guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', status: 'payment_pending', locale: 'pt',
      reception: { type: 'self' }, extras: [expect.objectContaining({ sku: 'private-chef', people: 4 })],
    });
    expect(r.intent?.quote).toMatchObject({ total: 2147, nights: 4 });
    expect(r.newsletterOptIn).toBeNull();
    expect(fake.consent).not.toHaveBeenCalled();
  });

  it('os dados não se perdem: ficam no servidor, só deixam de ir para o browser', async () => {
    const id = await checkoutWithGuest();
    row(id).expiresAt = new Date(Date.now() - HOUR);
    await caller().getIntent({ intentId: id });
    expect(row(id)).toMatchObject(GUEST);
  });

  it('o estado "expired" da tabela conta como preço caducado', async () => {
    const id = await checkoutWithGuest();
    row(id).status = 'expired';
    const r = await caller().getIntent({ intentId: id });
    expect(r.expired).toBe(true);
    expectNoGuest(r);
  });

  it('com o preço atualizado dentro dos 9 dias o checkout volta a estar em curso', async () => {
    const id = await checkoutWithGuest();
    row(id).expiresAt = new Date(Date.now() - HOUR);
    expectNoGuest(await caller().getIntent({ intentId: id }));
    // "Atualizar preço": o servidor confirma a cotação no fornecedor e dá nova validade.
    expect(await caller().updateIntent({ intentId: id, patch: { guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', quote } })).toEqual({ ok: true });
    const r = await caller().getIntent({ intentId: id });
    expect(r.expired).toBe(false);
    expect(r.intent).toMatchObject(GUEST);
  });
});

describe('checkout com mais de 9 dias: nunca mais mostra o hóspede', () => {
  it('nem com o preço válido', async () => {
    const id = await checkoutWithGuest();
    row(id).createdAt = new Date(Date.now() - GUEST_DETAILS_MAX_AGE_MS - HOUR);
    const r = await caller().getIntent({ intentId: id });
    expect(r.expired).toBe(false);
    expectNoGuest(r);
    expect(r.intent).toMatchObject({ id, checkIn: '2099-11-10', status: 'payment_pending' });
    expect(r.newsletterOptIn).toBeNull();
  });

  it('nem depois de alguém atualizar o preço (a data de criação não muda)', async () => {
    const id = await checkoutWithGuest();
    Object.assign(row(id), { createdAt: new Date(Date.now() - GUEST_DETAILS_MAX_AGE_MS - HOUR), expiresAt: new Date(Date.now() - HOUR) });
    expect(await caller().updateIntent({ intentId: id, patch: { guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', quote } })).toEqual({ ok: true });
    const r = await caller().getIntent({ intentId: id });
    expect(r.expired).toBe(false);
    expectNoGuest(r);
  });

  it('um dia antes do limite ainda mostra', async () => {
    const id = await checkoutWithGuest();
    row(id).createdAt = new Date(Date.now() - GUEST_DETAILS_MAX_AGE_MS + 24 * HOUR);
    expect((await caller().getIntent({ intentId: id })).intent).toMatchObject(GUEST);
  });

  it('sem data de criação legível, na dúvida não mostra', async () => {
    const id = await checkoutWithGuest();
    delete row(id).createdAt;
    expectNoGuest(await caller().getIntent({ intentId: id }));
  });
});

describe('o hóspede que volta a um link caducado escreve os dados outra vez', () => {
  it('o que escreve fica gravado e passa a ser o que o checkout mostra', async () => {
    const id = await checkoutWithGuest();
    row(id).expiresAt = new Date(Date.now() - HOUR);
    await caller().updateIntent({ intentId: id, patch: { guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', quote } });
    await caller().updateIntent({ intentId: id, patch: { email: 'second@checkout.invalid', guestFirstName: 'Second', guestLastName: 'Visit', guestPhone: '+351911111111' } });
    expect((await caller().getIntent({ intentId: id })).intent).toMatchObject({ email: 'second@checkout.invalid', guestFirstName: 'Second', guestLastName: 'Visit' });
  });
});
