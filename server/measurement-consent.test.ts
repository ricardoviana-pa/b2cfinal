import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
}

function setup(saved?: string, readyState = 'complete') {
  const listeners = new Map<string, ((event: any) => void)[]>();
  const scripts: any[] = [];
  const cookieWrites: string[] = [];
  const win = {
    localStorage: storage(saved ? { 'pa-cookies-consent': saved } : {}),
    sessionStorage: storage(),
    location: { hostname: 'www.portugalactive.com', reload: vi.fn() },
    setTimeout,
    addEventListener: vi.fn((type: string, cb: (event: any) => void) => listeners.set(type, [...(listeners.get(type) || []), cb])),
    dispatchEvent: vi.fn((event: Event) => { listeners.get(event.type)?.forEach(cb => cb(event)); return true; }),
    dataLayer: [] as any[],
    fbq: undefined as any,
    clarity: undefined as any,
  };
  const doc = {
    readyState,
    createElement: vi.fn(() => ({ dataset: {} })),
    head: { appendChild: vi.fn((script: any) => scripts.push(script)) },
    get cookie() { return '_ga=old; _fbi=old; _clck=old; pa_booking=keep; session=keep'; },
    set cookie(value: string) { cookieWrites.push(value); },
  };
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  return { win, doc, scripts, cookieWrites, listeners };
}

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('measurement consent and booking isolation', () => {
  it.each([undefined, 'essential', 'invalid'])('loads GTM in denied consent mode with choice %s', async saved => {
    const b = setup(saved);
    const consent = await import('../client/src/lib/measurementConsent');
    await vi.runAllTimersAsync();
    // Advanced consent mode: one GTM, Google tags stay cookieless; Meta/Clarity are gated in GTM.
    expect(b.scripts).toHaveLength(1);
    expect(b.scripts[0].src).toContain('GTM-TRPCDT3');
    expect(consent.hasMeasurementConsent()).toBe(false);
    expect(Array.from(b.win.dataLayer[0])).toEqual(['consent', 'default', {
      ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    }]);
    expect(b.win.dataLayer.some(entry => entry[0] === 'consent' && entry[1] === 'update' && entry[2]?.ad_storage === 'granted')).toBe(false);
    expect(b.win.dataLayer.some(entry => entry.event === 'pa_consent_granted')).toBe(false);
  });
  it('starts gated vendors on the same page when a guest accepts after GTM loaded', async () => {
    const b = setup();
    const consent = await import('../client/src/lib/measurementConsent');
    await vi.runAllTimersAsync();
    consent.saveCookieChoice('all');
    await vi.runAllTimersAsync();
    expect(b.scripts).toHaveLength(1);
    const grant = b.win.dataLayer.findIndex(entry => entry[0] === 'consent' && entry[1] === 'update' && entry[2]?.ad_storage === 'granted');
    const started = b.win.dataLayer.findIndex(entry => entry.event === 'pa_consent_granted');
    expect(grant).toBeGreaterThan(0); expect(started).toBeGreaterThan(grant);
    consent.saveCookieChoice('all');
    expect(b.win.dataLayer.filter(entry => entry.event === 'pa_consent_granted')).toHaveLength(1);
    expect(consent.willReloadForEssential()).toBe(true);
  });
  it('does not reload when a guest who never accepted chooses essential', async () => {
    const b = setup();
    const consent = await import('../client/src/lib/measurementConsent');
    await vi.runAllTimersAsync();
    expect(consent.willReloadForEssential()).toBe(false);
    consent.saveCookieChoice('essential');
    expect(b.win.location.reload).not.toHaveBeenCalled();
    expect(b.scripts).toHaveLength(1);
  });
  it.each(['dev.portugalactive.com', 'preview.onrender.com', 'localhost'])('never loads production tracking on %s even with consent', async hostname => {
    const b = setup('all'); b.win.location.hostname = hostname;
    const consent = await import('../client/src/lib/measurementConsent');
    consent.saveCookieChoice('all');
    await vi.runAllTimersAsync();
    expect(consent.hasMeasurementConsent()).toBe(false);
    expect(b.scripts).toHaveLength(0);
    expect(b.cookieWrites).toHaveLength(0);
  });
  it('restores an existing grant before loading GTM once', async () => {
    const b = setup('all');
    const consent = await import('../client/src/lib/measurementConsent');
    consent.bootstrapMeasurement(); consent.saveCookieChoice('all');
    await vi.runAllTimersAsync();
    expect(b.scripts).toHaveLength(1);
    expect(b.scripts[0].src).toContain('GTM-TRPCDT3');
    const grant = b.win.dataLayer.findIndex(entry => entry[0] === 'consent' && entry[1] === 'update');
    const start = b.win.dataLayer.findIndex(entry => entry.event === 'gtm.js');
    expect(grant).toBeGreaterThan(0); expect(grant).toBeLessThan(start);
    expect(b.win.clarity.q[0]).toEqual(['consentv2', { ad_Storage: 'granted', analytics_Storage: 'granted' }]);
  });
  it('handles consent before window load without double injection', async () => {
    const b = setup(undefined, 'loading');
    const consent = await import('../client/src/lib/measurementConsent');
    consent.saveCookieChoice('all');
    await vi.runAllTimersAsync(); expect(b.scripts).toHaveLength(0);
    b.doc.readyState = 'complete'; b.win.dispatchEvent(new Event('load'));
    consent.saveCookieChoice('all');
    await vi.runAllTimersAsync(); expect(b.scripts).toHaveLength(1);
  });
  it('cancels a pending load when a guest immediately chooses essential', async () => {
    const b = setup(); const consent = await import('../client/src/lib/measurementConsent');
    consent.saveCookieChoice('all'); consent.saveCookieChoice('essential');
    await vi.runAllTimersAsync();
    // GTM still loads (denied mode), but the brief grant never reached it.
    expect(b.scripts).toHaveLength(1); expect(b.win.location.reload).not.toHaveBeenCalled();
    expect(b.win.dataLayer.some(entry => entry.event === 'pa_consent_granted')).toBe(false);
    expect(consent.willReloadForEssential()).toBe(false);
  });
  it('revokes vendors, removes measurement cookies and reloads without touching booking storage', async () => {
    const b = setup('all'); const consent = await import('../client/src/lib/measurementConsent');
    await vi.runAllTimersAsync(); b.win.fbq = vi.fn(); b.win.clarity = vi.fn();
    b.win.localStorage.setItem('pa-booking-draft', 'guest details');
    consent.saveCookieChoice('essential');
    expect(b.win.fbq).toHaveBeenCalledWith('consent', 'revoke');
    expect(b.win.clarity).toHaveBeenCalledWith('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    expect(b.win.location.reload).toHaveBeenCalledOnce();
    expect(b.win.localStorage.getItem('pa-booking-draft')).toBe('guest details');
    expect(b.cookieWrites.every(cookie => !cookie.startsWith('session=') && !cookie.startsWith('pa_booking='))).toBe(true);
    expect(b.cookieWrites.some(cookie => cookie.startsWith('_fbi=') && cookie.includes('Domain=portugalactive.com'))).toBe(true);
  });
  it('drops funnel events before consent but sends a cookieless purchase without storing a marker', async () => {
    const b = setup(); const consent = await import('../client/src/lib/measurementConsent');
    const dl = await import('../client/src/lib/datalayer');
    dl.pushDL({ event: 'generate_lead' });
    dl.pushEcommerce({ event: 'begin_checkout', ecommerce: { value: 800 } });
    const declined = { event: 'purchase', ecommerce: { transaction_id: 'TEST-1', value: 800 } };
    dl.pushPurchaseOnce('TEST-1', declined); dl.pushPurchaseOnce('TEST-1', declined);
    expect(b.win.dataLayer.filter(entry => entry.event === 'purchase')).toHaveLength(1);
    expect(b.win.dataLayer.some(entry => entry.event === 'generate_lead' || entry.event === 'begin_checkout')).toBe(false);
    expect(b.win.localStorage.getItem('dl_purchase_TEST-1')).toBeNull();
    expect(b.win.localStorage.setItem).not.toHaveBeenCalledWith('dl_purchase_TEST-1', expect.anything());
    // Accepting later neither replays nor duplicates the purchase already sent.
    consent.saveCookieChoice('all');
    dl.pushPurchaseOnce('TEST-1', declined);
    expect(b.win.dataLayer.filter(entry => entry.event === 'purchase')).toHaveLength(1);
    const event = { event: 'purchase', ecommerce: { transaction_id: 'TEST-2', value: 900 } };
    dl.pushPurchaseOnce('TEST-2', event); dl.pushPurchaseOnce('TEST-2', event);
    expect(b.win.dataLayer.filter(entry => entry.event === 'purchase')).toHaveLength(2);
    expect(b.win.dataLayer.slice(-2)).toEqual([{ ecommerce: null }, event]);
    expect(b.win.localStorage.getItem('dl_purchase_TEST-2')).not.toBeNull();
    expect(b.win.dataLayer.some(entry => entry.event === 'begin_checkout')).toBe(false);
  });
  it('adds enhanced-conversion user_data only to a consented purchase', async () => {
    const b = setup(); const consent = await import('../client/src/lib/measurementConsent');
    const dl = await import('../client/src/lib/datalayer');
    const guest = { email: '  Guest@Example.COM ', phone: '+351 912 345 678' };
    dl.pushPurchaseOnce('EC-1', { event: 'purchase', ecommerce: { transaction_id: 'EC-1' } }, guest);
    const cookieless = b.win.dataLayer.find(entry => entry.event === 'purchase');
    expect(cookieless).toBeDefined(); expect(cookieless.user_data).toBeUndefined();
    expect(JSON.stringify(b.win.dataLayer)).not.toContain('guest@example.com');
    consent.saveCookieChoice('all');
    dl.pushPurchaseOnce('EC-2', { event: 'purchase', ecommerce: { transaction_id: 'EC-2' } }, guest);
    const consented = b.win.dataLayer.filter(entry => entry.event === 'purchase').at(-1);
    expect(consented.user_data).toEqual({ email: 'guest@example.com', phone_number: '+351912345678' });
  });
  it('normalises guest contact for enhanced conversions', async () => {
    const { buildUserData } = await import('../client/src/lib/datalayer');
    expect(buildUserData({ email: 'not-an-email', phone: '12' })).toBeUndefined();
    expect(buildUserData({ phone: '0044 7700 900123' })).toEqual({ phone_number: '+447700900123' });
    expect(buildUserData({ phone: '912 345 678' })).toEqual({ phone_number: '912345678' });
    expect(buildUserData(null)).toBeUndefined();
  });
  it('never sends a cookieless purchase outside the live site', async () => {
    const b = setup(); b.win.location.hostname = 'dev.portugalactive.com';
    await import('../client/src/lib/measurementConsent');
    const dl = await import('../client/src/lib/datalayer');
    dl.pushPurchaseOnce('TEST-3', { event: 'purchase', ecommerce: { transaction_id: 'TEST-3' } });
    expect(b.win.dataLayer.some(entry => entry.event === 'purchase')).toBe(false);
  });
  it('applies a withdrawal made in another tab', async () => {
    const b = setup('all'); await import('../client/src/lib/measurementConsent');
    await vi.runAllTimersAsync();
    b.win.localStorage.setItem('pa-cookies-consent', 'essential');
    b.listeners.get('storage')?.[0]({ key: 'pa-cookies-consent' });
    expect(b.win.location.reload).toHaveBeenCalledOnce();
  });
  it('records AI attribution only after consent and keeps the original landing route', async () => {
    const b = setup();
    const consent = await import('../client/src/lib/measurementConsent');
    const { detectAiReferrer } = await import('../client/src/lib/datalayer');
    const landing = { pathname: '/en/destinations/minho', search: '?utm_source=chatgpt&utm_medium=ai' };
    detectAiReferrer(landing);
    expect(b.win.dataLayer.some(entry => entry.event === 'ai_referral')).toBe(false);
    consent.saveCookieChoice('all'); detectAiReferrer(landing);
    expect(b.win.dataLayer.find(entry => entry.event === 'ai_referral')).toMatchObject({
      ai_source: 'chatgpt', ai_landing_page: '/en/destinations/minho',
    });
  });
  it('fails closed when another tab clears all storage', async () => {
    const b = setup('all');
    const consent = await import('../client/src/lib/measurementConsent');
    await vi.runAllTimersAsync();
    b.win.localStorage.removeItem('pa-cookies-consent');
    b.listeners.get('storage')?.[0]({ key: null });
    expect(consent.hasMeasurementConsent()).toBe(false);
    expect(consent.getCookieChoice()).toBeNull();
    expect(b.win.location.reload).toHaveBeenCalledOnce();
  });
  it('does not break booking when local storage is unavailable', async () => {
    const b = setup();
    b.win.localStorage.getItem.mockImplementation(() => { throw new Error('unavailable'); });
    b.win.localStorage.setItem.mockImplementation(() => { throw new Error('unavailable'); });
    const consent = await import('../client/src/lib/measurementConsent');
    expect(() => consent.saveCookieChoice('all')).not.toThrow();
    await vi.runAllTimersAsync(); expect(b.scripts).toHaveLength(1);
    expect(() => consent.saveCookieChoice('essential')).not.toThrow();
    expect(b.win.sessionStorage.getItem('pa-cookies-denied')).toBe('1');
  });
  it('allows SSR import without a browser', async () => {
    const consent = await import('../client/src/lib/measurementConsent');
    expect(consent.getCookieChoice()).toBeNull(); expect(consent.hasMeasurementConsent()).toBe(false);
  });
  it('removes unconditional and no-JavaScript GTM entry points', () => {
    const html = fs.readFileSync('client/index.html', 'utf8');
    expect(html).toContain('/src/lib/measurementConsent.ts');
    expect(html).not.toContain('googletagmanager.com/ns.html');
    expect(html).not.toContain('function loadGTM');
  });
});
