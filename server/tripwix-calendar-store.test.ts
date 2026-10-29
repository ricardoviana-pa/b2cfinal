/**
 * Calendários das casas parceiras (auditoria 29 out 2026,
 * prices-availability-01/04/06): os pedidos dos hóspedes nunca chamam a
 * Tripwix; um job lê uma casa de cada vez (≤ 35/h), recua nas casas que
 * falham, pára num 429, guarda na BD só o que muda e, depois de um restart,
 * serve o que guardou sem rajada de leituras.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getMany: vi.fn(),
  save: vi.fn(),
  homes: [] as any[],
}));
vi.mock('./db', () => ({ getSettingsByKeys: h.getMany, upsertSetting: h.save }));
vi.mock('./services/properties-store', () => ({ getPropertiesForSite: async () => h.homes }));

const T0 = Date.parse('2026-10-29T00:30:00Z');
const MIN = 60_000;

/** O ano que a Tripwix devolve, a partir de hoje (data UTC do relógio falso). */
function calendar(price = 1000, status = (_i: number) => 'available') {
  const start = Date.parse(new Date().toISOString().slice(0, 10));
  return Array.from({ length: 366 }, (_, i) => ({ date: new Date(start + i * 86400_000).toISOString().slice(0, 10), status: status(i), price: `${price}.00` }));
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const uidOf = (url: string) => /properties\/([^/]+)\/calendar/.exec(url)?.[1];
const at = (ms: number) => vi.setSystemTime(new Date(ms));

let store: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date'] });
  at(T0);
  vi.stubEnv('TRIPWIX_API_KEY', 'test-only');
  store = new Map();
  h.getMany.mockReset().mockImplementation(async (keys: string[]) => new Map(keys.filter((k) => store.has(k)).map((k) => [k, store.get(k)!])));
  h.save.mockReset().mockImplementation(async (key: string, value: string) => { store.set(key, value); });
  h.homes = [];
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); vi.restoreAllMocks(); });

const load = () => import('./services/tripwix-calendar');

describe('guest requests never call the partner API', () => {
  it('an empty store answers "no data" instead of reading Tripwix on the request path', async () => {
    const fetcher = vi.fn(async () => ok(calendar()));
    vi.stubGlobal('fetch', fetcher);
    const { readTripwixCalendar } = await load();
    const { getTripwixLowestNightly, getPartnerQuote, getPartnerCalendar } = await import('./services/tripwix');
    expect(await readTripwixCalendar('a', '2026-11-10', '2026-11-14')).toBeNull();
    expect(await getTripwixLowestNightly('a', 2)).toBeNull();
    expect(await getPartnerQuote('a', '2026-11-10', '2026-11-15')).toBeNull();
    expect(await getPartnerCalendar('a', '2026-10-29', '2027-10-29')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reads nothing without the partner key or with impossible dates', async () => {
    vi.stubEnv('TRIPWIX_API_KEY', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const { readTripwixCalendar, refreshNextTripwixCalendar } = await load();
    expect(await refreshNextTripwixCalendar([{ uid: 'a' }])).toEqual({ action: 'idle' });
    expect(await readTripwixCalendar('a', '2028-07-01', '2028-07-08')).toBeNull();
    vi.stubEnv('TRIPWIX_API_KEY', 'test-only');
    expect(await readTripwixCalendar('a', '2026-02-30', '2026-03-01')).toBeNull();
    expect(await readTripwixCalendar('a', '2026-11-10', '2026-11-01')).toBeNull();
    expect(await readTripwixCalendar('a', '2026-11-01', '2028-01-01')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('serves what the job read: calendar, dated quote and a 12-month "from"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(calendar(1000, (i) => (i >= 121 ? 'available' : 'unavailable')))));
    const { refreshTripwixCalendar } = await load();
    const { getTripwixLowestNightly, getPartnerQuote, getPartnerCalendar } = await import('./services/tripwix');
    expect(await refreshTripwixCalendar('a', 'Casa na Areia')).toMatchObject({ action: 'refreshed' });
    expect(await getTripwixLowestNightly('a', 5)).toBe(1060);
    expect(await getPartnerQuote('a', '2027-03-01', '2027-03-06')).toMatchObject({ available: true, nights: 5, accommodation: 5300, source: 'cached' });
    expect(await getPartnerQuote('a', '2026-11-10', '2026-11-12')).toMatchObject({ available: false });
    expect((await getPartnerCalendar('a', '2026-10-29', '2027-10-29'))?.length).toBe(366);
  });
});

describe('the background job', () => {
  it('reads one home per step, never-read homes first, and at most 35 per hour', async () => {
    const fetcher = vi.fn(async () => ok(calendar()));
    vi.stubGlobal('fetch', fetcher);
    const { refreshNextTripwixCalendar, tripwixReadsInLastHour } = await load();
    const homes = Array.from({ length: 40 }, (_, i) => ({ uid: `h${i}` }));
    for (let i = 0; i < 60; i++) await refreshNextTripwixCalendar(homes);
    expect(fetcher).toHaveBeenCalledTimes(35);
    expect(new Set(fetcher.mock.calls.map((c: any) => uidOf(String(c[0])))).size).toBe(35);
    expect(tripwixReadsInLastHour()).toBe(35);
    // Uma hora depois o orçamento volta, e as 5 que faltavam vêm primeiro.
    at(T0 + 61 * MIN);
    await refreshNextTripwixCalendar(homes);
    expect(uidOf(String(fetcher.mock.calls[35][0]))).toBe('h35');
  });

  it('does not re-read a home until its calendar is an hour old, then reads the oldest', async () => {
    const fetcher = vi.fn(async () => ok(calendar()));
    vi.stubGlobal('fetch', fetcher);
    const { refreshNextTripwixCalendar } = await load();
    const homes = [{ uid: 'a' }, { uid: 'b' }];
    await refreshNextTripwixCalendar(homes);
    at(T0 + 2 * MIN);
    await refreshNextTripwixCalendar(homes);
    at(T0 + 4 * MIN);
    expect(await refreshNextTripwixCalendar(homes)).toEqual({ action: 'idle' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    at(T0 + 61 * MIN);
    await refreshNextTripwixCalendar(homes);
    expect(uidOf(String(fetcher.mock.calls[2][0]))).toBe('a');
  });

  it('keeps serving the last good calendar when a refresh fails, and logs the status and reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn(async () => ok(calendar(1000)));
    vi.stubGlobal('fetch', fetcher);
    const { refreshNextTripwixCalendar, readTripwixCalendar } = await load();
    const { getTripwixLowestNightly } = await import('./services/tripwix');
    const homes = [{ uid: 'a', name: 'Villa Guincho' }];
    await refreshNextTripwixCalendar(homes);
    expect(await getTripwixLowestNightly('a', 2)).toBe(1060);
    at(T0 + 61 * MIN);
    fetcher.mockImplementation(async () => new Response('upstream down', { status: 502 }));
    expect(await refreshNextTripwixCalendar(homes)).toMatchObject({ action: 'failed', status: 502, reason: 'upstream down' });
    const line = warn.mock.calls.map((c) => String(c[0])).find((l) => l.includes('Villa Guincho'));
    expect(line).toContain('HTTP 502');
    expect(line).toContain('upstream down');
    expect(line).toContain('próxima tentativa daqui a 15 min');
    expect((await readTripwixCalendar('a', '2026-11-10', '2026-11-14'))?.days).toHaveLength(5);
    expect(await getTripwixLowestNightly('a', 2)).toBe(1060);
  });

  it('logs timeouts, empty and malformed answers as failures too', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { refreshTripwixCalendar } = await load();
    const answers: Array<() => Promise<Response>> = [
      async () => { throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }); },
      async () => ok([]),
      async () => ok({ detail: 'Not found.' }),
      async () => ok([{ date: '2026-11-01', status: 'available', price: 1 }, { date: '2026-11-01', status: 'available', price: 2 }]),
    ];
    for (const [i, answer] of answers.entries()) {
      vi.stubGlobal('fetch', vi.fn(answer));
      expect(await refreshTripwixCalendar(`x${i}`)).toMatchObject({ action: 'failed' });
    }
    const lines = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(lines).toContain('sem resposta em 12 s');
    expect(lines).toContain('calendário vazio');
    expect(lines).toContain('resposta não é uma lista de dias');
    expect(lines).toContain('dia repetido (2026-11-01)');
  });

  it('backs off exponentially on a failing home instead of retrying every minute', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn(async (url: string) => (uidOf(url) === 'bad' ? new Response('{"detail":"Not found."}', { status: 404 }) : ok(calendar())));
    vi.stubGlobal('fetch', fetcher);
    const { refreshNextTripwixCalendar } = await load();
    const homes = [{ uid: 'bad' }, { uid: 'good' }];
    const badReads: number[] = [];
    // Seis horas, um passo por minuto (o job real dá um a cada ~103 s).
    for (let m = 0; m <= 6 * 60; m++) {
      at(T0 + m * MIN);
      const before = fetcher.mock.calls.length;
      await refreshNextTripwixCalendar(homes);
      if (fetcher.mock.calls.length > before && uidOf(String(fetcher.mock.calls.at(-1)![0])) === 'bad') badReads.push(m);
    }
    // Antes: uma tentativa por minuto (360). Agora: 0, +15, +30, +60, +120 min.
    expect(badReads).toEqual([0, 15, 45, 105, 225]);
    // A casa boa continua a ser refrescada de hora a hora.
    const goodReads = fetcher.mock.calls.filter((c: any) => uidOf(String(c[0])) === 'good').length;
    expect(goodReads).toBeGreaterThanOrEqual(6);
  });

  it('a 429 pauses every partner read until Retry-After, without counting against the home', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ detail: 'Request was throttled. Expected available in 120 seconds.' }), { status: 429, headers: { 'Retry-After': '120' } }));
    vi.stubGlobal('fetch', fetcher);
    const { refreshNextTripwixCalendar, readTripwixCalendar } = await load();
    const homes = [{ uid: 'a' }, { uid: 'b' }];
    expect(await refreshNextTripwixCalendar(homes)).toMatchObject({ action: 'throttled' });
    at(T0 + 60_000);
    expect(await refreshNextTripwixCalendar(homes)).toMatchObject({ action: 'throttled' });
    // Nem as leituras pontuais (estadias daqui a 2 anos) furam a pausa.
    expect(await readTripwixCalendar('b', '2028-07-01', '2028-07-08')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    at(T0 + 121_000);
    fetcher.mockImplementation(async () => ok(calendar()));
    await refreshNextTripwixCalendar(homes);
    // A mesma casa volta logo a seguir (não ficou 15 min de castigo).
    expect(uidOf(String(fetcher.mock.calls[1][0]))).toBe('a');
  });
});

describe('persistence (TiDB: one read per process, writes only on change)', () => {
  it('writes a compact calendar once, and again only when it changes or every 6 hours', async () => {
    const fetcher = vi.fn(async () => ok(calendar(1000)));
    vi.stubGlobal('fetch', fetcher);
    const { refreshTripwixCalendar } = await load();
    await refreshTripwixCalendar('a');
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    const [key, value, category] = h.save.mock.calls[0];
    expect(key).toBe('tripwix_calendar_a');
    expect(category).toBe('tripwix_calendar');
    expect(value.length).toBeLessThan(300); // um ano com um só preço e estado: um "run"
    at(T0 + 61 * MIN);
    await refreshTripwixCalendar('a');
    await new Promise((r) => setTimeout(r, 5));
    expect(h.save).toHaveBeenCalledTimes(1); // igual: não se escreve
    at(T0 + 122 * MIN);
    fetcher.mockImplementation(async () => ok(calendar(1100)));
    await refreshTripwixCalendar('a');
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(2)); // mudou o preço
    at(T0 + 122 * MIN + 6 * 60 * MIN);
    await refreshTripwixCalendar('a');
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(3)); // batimento de 6 h
  });

  it('after a restart serves the stored calendars at once, with one DB query and no partner calls', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(calendar(1000))));
    let mod = await load();
    for (const uid of ['a', 'b', 'c']) await mod.refreshTripwixCalendar(uid);
    await vi.waitFor(() => expect(store.size).toBe(3));

    // Restart: módulos novos, memória vazia.
    vi.resetModules();
    const fetcher = vi.fn(async () => ok(calendar(1000)));
    vi.stubGlobal('fetch', fetcher);
    at(T0 + 10 * MIN);
    h.getMany.mockClear();
    mod = await load();
    const { getTripwixLowestNightly } = await import('./services/tripwix');
    await mod.hydrateTripwixCalendars(['a', 'b', 'c']);
    expect(h.getMany).toHaveBeenCalledTimes(1);
    expect(h.getMany).toHaveBeenCalledWith(['tripwix_calendar_a', 'tripwix_calendar_b', 'tripwix_calendar_c']);
    expect(await getTripwixLowestNightly('b', 2)).toBe(1060);
    expect((await mod.readTripwixCalendar('c', '2026-12-01', '2026-12-05'))?.days).toHaveLength(5);
    expect(h.getMany).toHaveBeenCalledTimes(1);
    // Os três foram lidos há 10 min: o job não tem nada a fazer.
    expect(await mod.refreshNextTripwixCalendar([{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }])).toEqual({ action: 'idle' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('concurrent first requests share one DB query; a DB failure is retried after 5 min, not per request', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { hydrateTripwixCalendars } = await load();
    let release!: () => void;
    h.getMany.mockImplementationOnce(() => new Promise((r) => { release = () => r(new Map()); }));
    const both = Promise.all([hydrateTripwixCalendars(['a', 'b']), hydrateTripwixCalendars(['b', 'a'])]);
    release();
    await both;
    expect(h.getMany).toHaveBeenCalledTimes(1);

    h.getMany.mockRejectedValue(new Error('usage quota exhausted'));
    await hydrateTripwixCalendars(['c']);
    await hydrateTripwixCalendars(['c', 'd']);
    expect(h.getMany).toHaveBeenCalledTimes(2);
    at(T0 + 6 * MIN);
    await hydrateTripwixCalendars(['c']);
    expect(h.getMany).toHaveBeenCalledTimes(3);
  });

  it('stops serving a calendar 48 h after the last good read', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn(async () => ok(calendar(1000)));
    vi.stubGlobal('fetch', fetcher);
    const { refreshTripwixCalendar } = await load();
    const { getTripwixLowestNightly, getPartnerQuote } = await import('./services/tripwix');
    await refreshTripwixCalendar('a');
    at(T0 + 47 * 60 * MIN);
    expect(await getTripwixLowestNightly('a', 2)).toBe(1060);
    at(T0 + 49 * 60 * MIN);
    expect(await getTripwixLowestNightly('a', 2)).toBeNull();
    expect(await getPartnerQuote('a', '2026-12-01', '2026-12-05')).toBeNull();
  });

  it('round-trips the stored format and rejects anything malformed', async () => {
    const { encodeStoredCalendar, decodeStoredCalendar } = await load();
    const days = [
      { date: '2026-11-01', status: 'available', price: 100 },
      { date: '2026-11-02', status: 'available', price: 100 },
      { date: '2026-11-04', status: 'booked', price: 120.5 }, // 3 nov em falta
      { date: '2026-11-05', status: 'available', price: null },
    ];
    const raw = encodeStoredCalendar({ at: T0, start: '2026-11-01', end: '2027-11-01', days });
    expect(decodeStoredCalendar(raw)).toEqual({ at: T0, start: '2026-11-01', end: '2027-11-01', days });
    for (const bad of ['', 'nope', '{"v":2}', JSON.stringify({ v: 1, at: T0, w: ['2026-11-01', '2027-11-01'], s: '2026-11-01', r: [['available', 1, 0]] })]) {
      expect(decodeStoredCalendar(bad)).toBeNull();
    }
  });
});

describe('stays beyond the stored year', () => {
  it('are read on demand, reused for nearby dates, and capped at 10 reads per hour', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetcher = vi.fn(async (url: string) => {
      const start = /start_date=([\d-]+)/.exec(url)![1];
      return ok(Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.parse(start) + i * 86400_000).toISOString().slice(0, 10), status: 'available', price: '900' })));
    });
    vi.stubGlobal('fetch', fetcher);
    const { getPartnerQuote } = await import('./services/tripwix');
    expect(await getPartnerQuote('far', '2028-07-01', '2028-07-08')).toMatchObject({ available: true, nights: 7, source: 'live' });
    expect(String(fetcher.mock.calls[0][0])).toContain('start_date=2028-07-01');
    expect(await getPartnerQuote('far', '2028-07-02', '2028-07-06')).toMatchObject({ available: true, source: 'cached' });
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 15; i++) await getPartnerQuote(`far${i}`, '2028-07-01', '2028-07-08');
    expect(fetcher).toHaveBeenCalledTimes(10);
  });
});

describe('job start-up (restart / deploy: no burst)', () => {
  it('reads nothing at boot, the first home after 90 s and then one every ~103 s', async () => {
    vi.useRealTimers();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(T0));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    h.homes = Array.from({ length: 35 }, (_, i) => ({ source: 'tripwix', isActive: true, supplierUid: `u${i}`, name: `Casa ${i}` }));
    const fetcher = vi.fn(async () => ok(calendar()));
    vi.stubGlobal('fetch', fetcher);
    const { startTripwixRefresh, TRIPWIX_TICK_MS } = await import('./services/tripwix-refresh');
    expect(TRIPWIX_TICK_MS).toBe(102858);
    expect(startTripwixRefresh({ TRIPWIX_API_KEY: 'test-only', NODE_ENV: 'production' } as any)).toBe(true);
    await vi.advanceTimersByTimeAsync(89_000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(h.getMany).toHaveBeenCalledTimes(1); // o arranque lê a BD, uma vez
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(TRIPWIX_TICK_MS);
    expect(fetcher).toHaveBeenCalledTimes(2);
    // Uma hora inteira: 35 leituras no máximo.
    await vi.advanceTimersByTimeAsync(60 * MIN);
    expect(fetcher.mock.calls.length).toBeLessThanOrEqual(37);
    expect(fetcher.mock.calls.length).toBeGreaterThanOrEqual(35);
  });

  it('does not start without the partner key, with the inventory off, or on a preview', async () => {
    const { startTripwixRefresh } = await import('./services/tripwix-refresh');
    expect(startTripwixRefresh({} as any)).toBe(false);
    expect(startTripwixRefresh({ TRIPWIX_API_KEY: 'k', TRIPWIX_INVENTORY: '0' } as any)).toBe(false);
    expect(startTripwixRefresh({ TRIPWIX_API_KEY: 'k', APP_ENV: 'preview' } as any)).toBe(false);
  });
});
