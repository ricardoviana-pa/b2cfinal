import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/* Auditoria 29 out 2026, tracking-legal-security-bokun-datalayer-relay.

   The fixtures are what Bókun's own code sends (static.bokun.io, downloaded
   by the audit): its GTM tracker pushes { event, ecommerce, gclid } objects and
   its GA4 tracker calls gtag('event', name, params); inside the iframe both are
   forwarded to the page as { messageType: 'GaEvent', args }, and the page
   script (BokunWidgets.js) replays them:
     Array.isArray(args) ? window.gtag(...args) : window.dataLayer.push(args) */

const BOKUN = 'https://widgets.bokun.io';

const bokunViewItem = { // seen on production, /en/experiences/horseback-riding, "Essential only"
  event: 'view_item',
  ecommerce: { currency: 'EUR', value: 95, items: [{ item_id: 692748, item_name: 'Horseback Riding Tour in Viana do Castelo' }] },
  gclid: '',
};
const bokunPurchase = {
  event: 'purchase',
  ecommerce: { currency: 'EUR', transaction_id: 'BKN-123', value: 190, affiliation: 'Bokun widgets', coupon: '', tax: 0, items: [{ item_id: 692748, item_name: 'Horseback Riding Tour in Viana do Castelo', quantity: 2, price: 95 }] },
  gclid: 'abc',
};
const bokunGtagPurchase = ['event', 'purchase', { currency: 'EUR', transaction_id: 'BKN-123', value: 190, affiliation: 'Bokun widgets', items: [{ item_id: 692748 }], page_location: 'https://www.portugalactive.com/en/experiences/horseback-riding', page_title: 'x' }];

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

/** Minimal browser for measurementConsent/datalayer, with real event dispatch. */
function setup(saved: Record<string, string> = { 'pa-cookies-consent': 'all' }) {
  const win = Object.assign(new EventTarget(), {
    localStorage: storage(saved),
    sessionStorage: storage(),
    location: { hostname: 'www.portugalactive.com', reload: vi.fn() },
    setTimeout,
    dataLayer: [] as any[],
  });
  const doc = { readyState: 'loading', createElement: vi.fn(() => ({ dataset: {} })), head: { appendChild: vi.fn() }, cookie: '' };
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  return { win };
}

/** A postMessage as the page receives it from the Bókun iframe. */
function message(data: unknown, origin = BOKUN, source: { postMessage: ReturnType<typeof vi.fn> } | null = null) {
  const event = new Event('message');
  Object.defineProperties(event, { data: { value: data }, origin: { value: origin }, source: { value: source } });
  return event as MessageEvent;
}

/** Bókun's page-side relay (BokunWidgets.js, listener "Vg"), registered after the guard. */
function bokunRelay(win: any) {
  const relay = vi.fn((e: MessageEvent) => {
    const d: any = e.data;
    if (d?.messageType !== 'GaEvent') return;
    if (Array.isArray(d.args)) win.gtag?.(...d.args); else win.dataLayer.push(d.args);
  });
  win.addEventListener('message', relay);
  return relay;
}

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('isBokunOrigin', () => {
  it("accepts the origins Bókun's relay accepts and nothing else", async () => {
    const { isBokunOrigin } = await import('@/lib/bokunAnalyticsGuard');
    for (const o of ['https://widgets.bokun.io', 'https://bookings.bokun.io', 'https://static.bokun.io', 'https://bokuntest.com', 'https://x.bokun.tools']) expect(isBokunOrigin(o), o).toBe(true);
    for (const o of ['https://www.portugalactive.com', 'https://bokun.io.evil.com', 'https://xbokun.io', 'https://js.stripe.com', '', null, undefined, 'not a url']) expect(isBokunOrigin(o), String(o)).toBe(false);
  });
});

describe('renameBokunAnalytics (pure)', () => {
  it('renames dataLayer events and moves the payload away from `ecommerce`', async () => {
    const { renameBokunAnalytics } = await import('@/lib/bokunAnalyticsGuard');
    expect(renameBokunAnalytics(bokunViewItem)).toEqual({ event: 'bokun_view_item', bokun: { ecommerce: bokunViewItem.ecommerce, gclid: '' } });
    const purchase = renameBokunAnalytics(bokunPurchase)!;
    expect(purchase.event).toBe('bokun_purchase');
    expect(purchase).not.toHaveProperty('ecommerce');
    expect((purchase.bokun as any).ecommerce.affiliation).toBe('Bokun widgets');
    for (const name of ['add_to_cart', 'begin_checkout', 'remove_from_cart', 'select_item', 'view_item_list', 'search']) {
      expect(renameBokunAnalytics({ event: name, ecommerce: {} })!.event).toBe(`bokun_${name}`);
    }
  });

  it('renames gtag("event", …) commands', async () => {
    const { renameBokunAnalytics } = await import('@/lib/bokunAnalyticsGuard');
    const renamed = renameBokunAnalytics(bokunGtagPurchase)!;
    expect(renamed.event).toBe('bokun_purchase');
    expect((renamed.bokun as any).value).toBe(190);
    expect(renamed).not.toHaveProperty('ecommerce');
  });

  it('drops consent, config, set, js and get commands, GTM lifecycle events and anything without an event', async () => {
    const { renameBokunAnalytics } = await import('@/lib/bokunAnalyticsGuard');
    for (const args of [
      ['consent', 'update', { analytics_storage: 'granted', ad_storage: 'granted' }],
      ['config', 'G-BOKUN123'], ['js', new Date()], ['set', 'linker', { domains: ['bokun.io'] }], ['get', 'G-X', 'client_id', () => {}],
      { event: 'gtm.load' }, { event: 'gtm.js' }, { ecommerce: { value: 1 } }, { 0: 'event', 1: 'purchase' },
      null, undefined, 'purchase', 42, [],
    ]) expect(renameBokunAnalytics(args), JSON.stringify(args)).toBeNull();
  });
});

describe('installBokunAnalyticsGuard', () => {
  it("stops Bókun's relay: no purchase, begin_checkout or view_item reaches GTM", async () => {
    const { win } = setup();
    const { installBokunAnalyticsGuard } = await import('@/lib/bokunAnalyticsGuard');
    const push = vi.fn();
    installBokunAnalyticsGuard(win as any, push);
    const relay = bokunRelay(win);
    win.gtag = vi.fn();
    const before = [...win.dataLayer]; // our own consent defaults from bootstrapMeasurement
    for (const args of [bokunViewItem, bokunPurchase, bokunGtagPurchase, ['consent', 'update', { ad_storage: 'granted' }]]) {
      win.dispatchEvent(message({ messageType: 'GaEvent', args }));
    }
    expect(relay).not.toHaveBeenCalled();
    expect(win.gtag).not.toHaveBeenCalled();
    expect(win.dataLayer).toEqual(before);
    expect(push.mock.calls.map(([e]) => e.event)).toEqual(['bokun_view_item', 'bokun_purchase', 'bokun_purchase']);
  });

  it('with "Aceitar tudo" the renamed events enter the dataLayer; with "Apenas essenciais" nothing does', async () => {
    let { win } = setup({ 'pa-cookies-consent': 'all' });
    let guard = await import('@/lib/bokunAnalyticsGuard');
    guard.installBokunAnalyticsGuard(win as any);
    win.dispatchEvent(message({ messageType: 'GaEvent', args: bokunPurchase }));
    expect(win.dataLayer.filter((e: any) => e.event)).toEqual([{ event: 'bokun_purchase', bokun: { ecommerce: bokunPurchase.ecommerce, gclid: 'abc' } }]);
    expect(win.dataLayer.some((e: any) => e.event === 'purchase' || e.ecommerce)).toBe(false);

    vi.unstubAllGlobals(); vi.resetModules();
    ({ win } = setup({ 'pa-cookies-consent': 'essential' }));
    guard = await import('@/lib/bokunAnalyticsGuard');
    guard.installBokunAnalyticsGuard(win as any);
    const before = [...win.dataLayer];
    win.dispatchEvent(message({ messageType: 'GaEvent', args: bokunPurchase }));
    win.dispatchEvent(message({ messageType: 'GaEvent', args: bokunViewItem }));
    expect(win.dataLayer).toEqual(before);
    expect(win.dataLayer.some((e: any) => e.event)).toBe(false);
  });

  it("acknowledges Bókun's GTM handshake itself, so the iframe never loads GTM on its own", async () => {
    const { win } = setup();
    const { installBokunAnalyticsGuard } = await import('@/lib/bokunAnalyticsGuard');
    installBokunAnalyticsGuard(win as any, vi.fn());
    const relay = vi.fn();
    win.addEventListener('message', relay);
    const source = { postMessage: vi.fn() };
    win.dispatchEvent(message({ messageType: 'InitializeTagManager', tagManagerId: 'GTM-TRPCDT3', requestId: 'r-1' }, BOKUN, source));
    expect(relay).not.toHaveBeenCalled(); // no gtag('config')/second GTM from Bókun's om()
    expect(source.postMessage).toHaveBeenCalledWith({ messageType: 'InitializeTagManagerAck', requestId: 'r-1' }, BOKUN);
    win.dispatchEvent(message({ messageType: 'GaEvent', args: bokunViewItem, requestId: 'r-2' }, BOKUN, source));
    expect(source.postMessage).toHaveBeenLastCalledWith({ messageType: 'GaEventAck', requestId: 'r-2' }, BOKUN);
  });

  it('leaves every other message alone: other origins, other Bókun messages, our own pages', async () => {
    const { win } = setup();
    const { installBokunAnalyticsGuard } = await import('@/lib/bokunAnalyticsGuard');
    const push = vi.fn();
    installBokunAnalyticsGuard(win as any, push);
    const relay = vi.fn();
    win.addEventListener('message', relay);
    win.dispatchEvent(message({ messageType: 'GaEvent', args: bokunPurchase }, 'https://evil.example'));
    win.dispatchEvent(message({ messageType: 'GetGoogleAnalyticsSession' }));
    win.dispatchEvent(message({ messageType: 'resize', height: 900 }));
    win.dispatchEvent(message('plain string'));
    win.dispatchEvent(message({ type: 'stripe' }, 'https://js.stripe.com'));
    expect(relay).toHaveBeenCalledTimes(5);
    expect(push).not.toHaveBeenCalled();
  });

  it('never touches our own events: dataLayer.push stays the array push and our pushes land as sent', async () => {
    const { win } = setup();
    const { installBokunAnalyticsGuard } = await import('@/lib/bokunAnalyticsGuard');
    const dl = await import('@/lib/datalayer');
    installBokunAnalyticsGuard(win as any);
    expect(win.dataLayer.push).toBe(Array.prototype.push);
    const ours = [
      { event: 'view_item', property_id: '6965', ecommerce: { items: [{ item_id: 'PROP-6965' }] } },
      { event: 'view_item', ecommerce: { items: [{ item_id: 'EXP-horseback-riding' }] } },
      { event: 'purchase_extras', ecommerce: { items: [{ item_id: 'chef-dinner' }, { item_id: 'FLEX' }, { item_id: 'RECEPTION-HOSTED' }] } },
    ];
    for (const e of ours) dl.pushEcommerce(e);
    dl.pushPurchaseOnce('GY-A', { event: 'purchase', property_id: '6965', ecommerce: { transaction_id: 'GY-A', value: 900, items: [{ item_id: 'PROP-6965' }] } });
    const events = win.dataLayer.filter((e: any) => e.event);
    expect(events).toEqual([...ours, { event: 'purchase', property_id: '6965', ecommerce: { transaction_id: 'GY-A', value: 900, items: [{ item_id: 'PROP-6965' }] } }]);
  });

  it('is idempotent on the page window and installed before the Bókun loader script', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const widget = fs.readFileSync('client/src/components/experience/BokunCalendarWidget.tsx', 'utf8');
    const guardAt = widget.indexOf('installBokunAnalyticsGuard()');
    const scriptAt = widget.indexOf('document.head.appendChild(s)');
    expect(guardAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(scriptAt);
    // Browsers call `window` listeners in registration order, capture or not
    // (Chromium 148 checked): the guard only wins if no Bókun script can run
    // before it, so BokunCalendarWidget must stay the only place loading one.
    const loaders: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(tsx?|html)$/.test(e.name) && /BokunWidgetsLoader\.js|static\.bokun\.io\/[^"'`\s]*\.js/.test(fs.readFileSync(p, 'utf8'))) loaders.push(p);
      }
    };
    walk('client/src');
    if (/<script[^>]+bokun/i.test(fs.readFileSync('client/index.html', 'utf8'))) loaders.push('client/index.html');
    expect(loaders).toEqual([path.join('client/src/components/experience/BokunCalendarWidget.tsx')]);
    const { win } = setup();
    const add = vi.spyOn(win, 'addEventListener');
    const { installBokunAnalyticsGuard } = await import('@/lib/bokunAnalyticsGuard');
    const first = installBokunAnalyticsGuard();
    const second = installBokunAnalyticsGuard();
    expect(second).toBe(first);
    expect(add.mock.calls.filter(([type, , capture]) => type === 'message' && capture === true)).toHaveLength(1);
  });
});
