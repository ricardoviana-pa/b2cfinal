import './setup';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Consentimento de marketing do passo 1 (auditoria do funil, 29 out 2026,
 * n.º 2, bug apontado pelos dois críticos): a caixa nunca era reposta, e um
 * segundo Continuar mandava consent:false — o captureLead fazia demote e o
 * hóspede saía dos contactos 3 e 4 sem ter mexido em nada.
 *
 * Agora o getIntent devolve a caixa como ficou (newsletterOptIn) e o
 * captureLead sem `consent` deixa o consentimento como está.
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
const caller = () => checkoutRouter.createCaller({
  req: { headers: { host: 'checkout.invalid' } }, res: {}, user: null,
} as any);
const quote = { nightlyRate: 500.5, totalNights: 2002, cleaningFee: 120,
  taxesAndFees: 25, total: 2147, nights: 4, currency: 'EUR', quoteCreatedAt: Date.now() };
const EMAIL = 'guest@checkout.invalid';

async function draft() {
  const result = await caller().createIntent({ listingId: 'synthetic-listing',
    propertyName: 'Synthetic test home', propertySlug: 'synthetic-home',
    guestyQuoteId: 'aaaaaaaaaaaaaaaaaaaaaaaa', ratePlanId: 'synthetic-flex',
    checkIn: '2099-11-10', checkOut: '2099-11-14', guests: 4, locale: 'pt', quote });
  return result.intentId!;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CHECKOUT_TWO_PARTS', '');
  fake.intents.clear();
  fake.supplierQuote.mockImplementation(async () => ({ _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', unitTypeId: 'synthetic-listing',
    checkInDateLocalized: '2099-11-10', checkOutDateLocalized: '2099-11-14', guestsCount: 4,
    createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    rates: { ratePlans: [{ ratePlan: { _id: 'synthetic-flex', name: 'Flexible', cancellationPolicy: 'MODERATE',
      money: { subTotalPrice: 2147, fareCleaning: 120, currency: 'EUR' } } }] } }));
  fake.createIntent.mockImplementation(async (data) => { fake.intents.set(data.id, structuredClone(data)); return data.id; });
  fake.getIntent.mockImplementation(async (id) => structuredClone(fake.intents.get(id) ?? null));
  fake.updateIntent.mockImplementation(async (id, patch) => {
    if (!fake.intents.has(id)) return false;
    Object.assign(fake.intents.get(id), structuredClone(patch)); return true;
  });
  fake.lead.mockResolvedValue({ id: 1 });
  fake.promote.mockResolvedValue(undefined);
  fake.demote.mockResolvedValue(undefined);
  fake.consent.mockResolvedValue(null);
});

describe('captureLead: o consentimento só muda quando o hóspede o muda', () => {
  it('primeira vez sem a caixa: lead de checkout, nunca marketing', async () => {
    const id = await draft();
    expect(await caller().captureLead({ intentId: id, email: EMAIL, locale: 'pt' })).toEqual({ ok: true });
    expect(fake.lead).toHaveBeenCalledOnce();
    expect(fake.lead.mock.calls[0][0]).toMatchObject({ email: EMAIL, source: 'checkout', metadata: expect.objectContaining({ consent: 'false' }) });
  });

  it('primeira vez com a caixa marcada: lead da newsletter', async () => {
    const id = await draft();
    await caller().captureLead({ intentId: id, email: EMAIL, consent: true, locale: 'pt' });
    expect(fake.lead.mock.calls[0][0]).toMatchObject({ source: 'newsletter-checkout', metadata: expect.objectContaining({ consent: 'true' }) });
  });

  it('o bug: voltar ao passo 1 e continuar sem mexer na caixa já não retira o consentimento', async () => {
    const id = await draft();
    await caller().captureLead({ intentId: id, email: EMAIL, consent: true, locale: 'pt' });
    // outro dispositivo / refresh: o checkout não sabe a caixa e não envia consent
    await caller().captureLead({ intentId: id, email: EMAIL, locale: 'pt' });
    expect(fake.demote).not.toHaveBeenCalled();
    expect(fake.promote).not.toHaveBeenCalled();
    expect(fake.lead).toHaveBeenCalledOnce();
  });

  it('desmarcar retira e marcar promove (vence sempre o último estado da caixa)', async () => {
    const id = await draft();
    await caller().captureLead({ intentId: id, email: EMAIL, consent: true, locale: 'pt' });
    await caller().captureLead({ intentId: id, email: EMAIL, consent: false, locale: 'pt' });
    expect(fake.demote).toHaveBeenCalledWith(EMAIL);
    await caller().captureLead({ intentId: id, email: EMAIL, consent: true, locale: 'pt' });
    expect(fake.promote).toHaveBeenCalledWith(EMAIL);
  });
});

describe('getIntent: a caixa volta como o hóspede a deixou', () => {
  it('com email e consentimento dado no checkout: true', async () => {
    const id = await draft();
    await caller().captureLead({ intentId: id, email: EMAIL, consent: true, locale: 'pt' });
    fake.consent.mockResolvedValueOnce(true);
    expect((await caller().getIntent({ intentId: id })).newsletterOptIn).toBe(true);
    expect(fake.consent).toHaveBeenCalledWith(EMAIL);
  });

  it('sem consentimento: false', async () => {
    const id = await draft();
    await caller().captureLead({ intentId: id, email: EMAIL, locale: 'pt' });
    fake.consent.mockResolvedValueOnce(false);
    expect((await caller().getIntent({ intentId: id })).newsletterOptIn).toBe(false);
  });

  it('sem email ainda, ou com a leitura a falhar: null (não se repõe nada)', async () => {
    const id = await draft();
    expect((await caller().getIntent({ intentId: id })).newsletterOptIn).toBeNull();
    expect(fake.consent).not.toHaveBeenCalled();
    await caller().captureLead({ intentId: id, email: EMAIL, locale: 'pt' });
    fake.consent.mockRejectedValueOnce(new Error('synthetic database outage'));
    expect((await caller().getIntent({ intentId: id })).newsletterOptIn).toBeNull();
  });

  it('um intent que não existe também responde null', async () => {
    expect(await caller().getIntent({ intentId: '00000000-0000-4000-8000-000000000000' }))
      .toEqual({ intent: null, expired: false, paymentPlan: null, newsletterOptIn: null });
  });
});
