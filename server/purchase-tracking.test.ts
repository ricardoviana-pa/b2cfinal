import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Purchase com o valor da estadia, extras à parte e ids do catálogo Meta
   (docs/tracking-map.md). Ambiente de browser mínimo, como em
   measurement-consent.test.ts. */
function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function setup(hostname = 'www.portugalactive.com', saved: Record<string, string> = { 'pa-cookies-consent': 'all' }) {
  const win = {
    localStorage: storage(saved),
    sessionStorage: storage(),
    location: { hostname, reload: vi.fn() },
    setTimeout,
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    dataLayer: [] as any[],
  };
  const doc = {
    readyState: 'loading',
    createElement: vi.fn(() => ({ dataset: {} })),
    head: { appendChild: vi.fn() },
    cookie: '',
  };
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  return { win };
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

const extras = [
  { item_id: 'chef-dinner', item_category: 'extra', price: 120, quantity: 2 },
  { item_id: 'FLEX', item_category: 'protection', price: 89, quantity: 1 },
];

describe('purchase value = stay only', () => {
  it('uses the stay total when the page knows it, otherwise total paid minus services', async () => {
    setup();
    const { stayValue, sumItems } = await import('../client/src/lib/datalayer');
    expect(sumItems(extras)).toBe(329);
    expect(stayValue(184_050, 216_950, extras)).toBe(1840.5);
    expect(stayValue(null, 216_950, extras)).toBe(1840.5);
    expect(stayValue(undefined, 50_000, [])).toBe(500);
    // Nunca um valor inventado: sem total ou com total ≤ serviços → undefined
    expect(stayValue(null, null, extras)).toBeUndefined();
    expect(stayValue(null, 20_000, extras)).toBeUndefined();
  });

  it('pushes the purchase with the stay and the services in a separate purchase_extras, once', async () => {
    const { win } = setup();
    await import('../client/src/lib/measurementConsent');
    const dl = await import('../client/src/lib/datalayer');
    const purchase = { event: 'purchase', ecommerce: { transaction_id: 'GY-A', value: 1840.5, currency: 'EUR', items: [{ item_id: 'PROP-abc' }] } };
    dl.pushPurchaseOnce('GY-A', purchase, null, extras);
    dl.pushPurchaseOnce('GY-A', purchase, null, extras);
    const purchases = win.dataLayer.filter(e => e.event === 'purchase');
    const extraEvents = win.dataLayer.filter(e => e.event === 'purchase_extras');
    expect(purchases).toHaveLength(1);
    expect(purchases[0].ecommerce.value).toBe(1840.5);
    expect(purchases[0].ecommerce.items).toHaveLength(1);
    expect(extraEvents).toHaveLength(1);
    expect(extraEvents[0].ecommerce).toMatchObject({ transaction_id: 'GY-A', currency: 'EUR', value: 329 });
    expect(extraEvents[0].ecommerce.items).toHaveLength(2);
  });

  it('keeps the cookieless purchase without services when there is no consent', async () => {
    const { win } = setup('www.portugalactive.com', {});
    await import('../client/src/lib/measurementConsent');
    const dl = await import('../client/src/lib/datalayer');
    dl.pushPurchaseOnce('GY-B', { event: 'purchase', ecommerce: { transaction_id: 'GY-B', value: 900 } }, null, extras);
    expect(win.dataLayer.filter(e => e.event === 'purchase')).toHaveLength(1);
    expect(win.dataLayer.some(e => e.event === 'purchase_extras')).toBe(false);
  });
});

describe('ids do catálogo Meta', () => {
  it('strips the internal guesty- prefix so content_ids match the catalog id', async () => {
    setup();
    const { propertyCatalogId, buildPropertyItem } = await import('../client/src/lib/datalayer');
    expect(propertyCatalogId({ id: 'guesty-69653365bf04fe0013743511' })).toBe('69653365bf04fe0013743511');
    expect(propertyCatalogId({ id: 'guesty-x', guestyId: '6965' })).toBe('6965');
    expect(buildPropertyItem({ id: 'guesty-6965', name: 'Casa' }).item_id).toBe('PROP-6965');
  });
});

describe('inspeção do dataLayer fora do live', () => {
  it('stays off by default outside the live site', async () => {
    const { win } = setup('dev.portugalactive.com', {});
    const consent = await import('../client/src/lib/measurementConsent');
    const dl = await import('../client/src/lib/datalayer');
    expect(consent.hasMeasurementConsent()).toBe(false);
    dl.pushEcommerce({ event: 'view_item' });
    expect(win.dataLayer.some(e => e.event === 'view_item')).toBe(false);
  });

  it('fills the dataLayer on DEV with the debug flag, without loading GTM', async () => {
    const { win } = setup('dev.portugalactive.com', { 'pa-dl-debug': '1' });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const consent = await import('../client/src/lib/measurementConsent');
    const dl = await import('../client/src/lib/datalayer');
    expect(consent.hasMeasurementConsent()).toBe(true);
    dl.pushEcommerce({ event: 'view_item', property_id: '6965' });
    expect(win.dataLayer.some(e => e.event === 'view_item')).toBe(true);
    expect((document as any).head.appendChild).not.toHaveBeenCalled();
    info.mockRestore();
  });

  it('ignores the debug flag on the live site', async () => {
    setup('www.portugalactive.com', { 'pa-dl-debug': '1' });
    const consent = await import('../client/src/lib/measurementConsent');
    expect(consent.dataLayerDebugEnabled()).toBe(false);
    expect(consent.hasMeasurementConsent()).toBe(false);
  });
});
