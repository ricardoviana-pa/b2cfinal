import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMetaCapiBody, sendMetaEvent, type MetaCapiEvent } from './services/meta-capi';
import { requestClientIp } from './services/ad-signals-store';

const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const signals = { fbp: 'fb.1.1791659000000.123456789', fbc: null, userAgent: 'Mozilla/5.0 Test', clientIp: '203.0.113.7' };
const purchase: MetaCapiEvent = {
  eventName: 'Purchase',
  eventId: 'GY-TEST01',
  value: 1840.5,
  currency: 'eur',
  contentId: 'guesty-69653365bf04fe0013743511',
  contentName: 'Casa',
  orderId: 'GY-TEST01',
  numItems: 1,
  sourceUrl: 'https://www.portugalactive.com/pt/checkout/x',
  email: ' Guest@Example.com ',
  phone: '+351 912 345 678',
  signals,
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Meta CAPI payload', () => {
  it('mirrors the pixel Purchase: same event_id, stay value, order_id, catalog content_ids', () => {
    const body = buildMetaCapiBody(purchase, 1_791_659_000_000) as any;
    const ev = body.data[0];
    expect(ev).toMatchObject({ event_name: 'Purchase', event_id: 'GY-TEST01', action_source: 'website', event_time: 1_791_659_000 });
    expect(ev.custom_data).toEqual({
      value: 1840.5, currency: 'EUR', content_type: 'product',
      content_ids: ['69653365bf04fe0013743511'], content_name: 'Casa', order_id: 'GY-TEST01', num_items: 1,
    });
    expect(ev.user_data).toEqual({
      em: [sha('guest@example.com')],
      ph: [sha('351912345678')],
      fbp: signals.fbp,
      client_ip_address: '203.0.113.7',
      client_user_agent: 'Mozilla/5.0 Test',
    });
    expect(body.test_event_code).toBeUndefined();
  });

  it('adds the Events Manager test code only when configured', () => {
    vi.stubEnv('META_CAPI_TEST_CODE', 'TEST123');
    expect((buildMetaCapiBody(purchase) as any).test_event_code).toBe('TEST123');
  });

  it('sends nothing without config, user agent or a positive value', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await sendMetaEvent(purchase);
    // Só o token é obrigatório: o pixel por omissão é o B2C
    vi.stubEnv('META_CAPI_TOKEN', 'token');
    await sendMetaEvent({ ...purchase, signals: { ...signals, userAgent: null } });
    await sendMetaEvent({ ...purchase, value: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue({ ok: true });
    vi.spyOn(console, 'info').mockImplementation(() => {});
    await sendMetaEvent(purchase);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain('/1428229772653572/events');
  });

  it('reads the visitor IP behind Cloudflare and rejects junk', () => {
    expect(requestClientIp({ 'cf-connecting-ip': '203.0.113.7', 'x-forwarded-for': '10.0.0.1' })).toBe('203.0.113.7');
    expect(requestClientIp({ 'x-forwarded-for': '198.51.100.2, 10.0.0.1' })).toBe('198.51.100.2');
    expect(requestClientIp({ 'x-forwarded-for': '<script>' })).toBeNull();
  });
});
