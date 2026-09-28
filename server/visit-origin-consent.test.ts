/**
 * Origem da visita no navegador e consentimento (client/src/lib/visitOrigin.ts).
 *
 * Guardar parâmetros de campanha no aparelho é armazenamento no equipamento do
 * visitante (ePrivacy): só com "Aceitar tudo". Sem isso nada é escrito e o
 * checkout leva só { consent: false }. Retirar o consentimento apaga a chave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'pa-origin';
const DAY = 86_400_000;

function storage(initial: Record<string, string> = {}, broken = false) {
  const values = new Map(Object.entries(initial));
  const fail = () => { throw new Error('SecurityError'); };
  return {
    values,
    getItem: vi.fn((key: string) => (broken ? fail() : values.get(key) ?? null)),
    setItem: vi.fn((key: string, value: string) => (broken ? fail() : void values.set(key, value))),
    removeItem: vi.fn((key: string) => (broken ? fail() : void values.delete(key))),
  };
}

function setup(opts: {
  consent?: string; search?: string; pathname?: string; referrer?: string;
  stored?: Record<string, string>; brokenStorage?: boolean; navigation?: string;
} = {}) {
  const listeners = new Map<string, ((event: any) => void)[]>();
  const initial = { ...(opts.stored ?? {}), ...(opts.consent ? { 'pa-cookies-consent': opts.consent } : {}) };
  const local = storage(initial, opts.brokenStorage);
  const win = {
    localStorage: local,
    sessionStorage: storage(),
    location: {
      hostname: 'www.portugalactive.com', reload: vi.fn(),
      pathname: opts.pathname ?? '/pt/homes/nature-hill-duo', search: opts.search ?? '',
    },
    setTimeout,
    addEventListener: vi.fn((type: string, cb: (event: any) => void) => listeners.set(type, [...(listeners.get(type) || []), cb])),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn((event: Event) => { listeners.get(event.type)?.forEach(cb => cb(event)); return true; }),
    dataLayer: [] as any[],
  };
  const doc = {
    readyState: 'complete',
    referrer: opts.referrer ?? '',
    createElement: vi.fn(() => ({ dataset: {} })),
    head: { appendChild: vi.fn() },
    cookie: '',
  };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('performance', { getEntriesByType: () => [{ type: opts.navigation ?? 'navigate' }] });
  return { win, local, listeners };
}

async function load() {
  const consent = await import('../client/src/lib/measurementConsent');
  const origin = await import('../client/src/lib/visitOrigin');
  origin.startVisitOrigin();
  return { consent, origin };
}

const stored = (b: ReturnType<typeof setup>) => JSON.parse(b.local.values.get(KEY) ?? 'null');

beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-27T16:42:10Z')); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('origem da visita: consentimento', () => {
  it.each([undefined, 'essential'])('sem "Aceitar tudo" (%s) não escreve nada e o checkout leva só consent:false', async consent => {
    const b = setup({ consent, search: '?utm_source=email&utm_medium=email&utm_campaign=2026-09_o1_base_antigos' });
    const { origin } = await load();
    expect(b.local.setItem.mock.calls.filter(([key]) => key === KEY)).toHaveLength(0);
    expect(b.local.values.has(KEY)).toBe(false);
    expect(origin.visitOriginPayload()).toEqual({ v: 1, consent: false });
  });

  it('com "Aceitar tudo" guarda a primeira e a última visita, sem query nem identificadores', async () => {
    const b = setup({ consent: 'all', search: '?utm_source=Email&utm_medium=email&utm_campaign=2026-09_o1_base_prevenda2027&utm_content=botao_casa&gclid=SECRETCLICK&email=ana@example.com' });
    const { origin } = await load();
    const at = Date.parse('2026-09-27T16:42:10Z');
    const touch = { utm_source: 'email', utm_medium: 'email', utm_campaign: '2026-09_o1_base_prevenda2027', utm_content: 'botao_casa', clickId: 'gclid', landing: '/pt/homes/nature-hill-duo', at };
    expect(stored(b)).toEqual({ v: 1, first: touch, last: touch });
    expect(b.local.values.get(KEY)).not.toContain('SECRETCLICK');
    expect(b.local.values.get(KEY)).not.toContain('example.com');
    vi.advanceTimersByTime(60_000);
    const { at: _at, ...fields } = touch;
    expect(origin.visitOriginPayload()).toEqual({ v: 1, consent: true, stored: true, first: { ...fields, ageSec: 60 }, last: { ...fields, ageSec: 60 } });
  });

  it('consentimento dado mais tarde na mesma página guarda a entrada com a hora a que aconteceu', async () => {
    const b = setup({ search: '?utm_source=meta&utm_medium=paid_social' });
    const { consent, origin } = await load();
    expect(b.local.values.has(KEY)).toBe(false);
    vi.advanceTimersByTime(120_000);
    consent.saveCookieChoice('all');
    expect(stored(b).last).toMatchObject({ utm_source: 'meta', at: Date.parse('2026-09-27T16:42:10Z') });
    expect(origin.visitOriginPayload()).toMatchObject({ consent: true, last: { utm_source: 'meta', ageSec: 120 } });
  });

  it('retirar o consentimento apaga a origem guardada e o checkout volta a consent:false', async () => {
    const b = setup({ consent: 'all', search: '?utm_source=google&utm_medium=cpc' });
    const { consent, origin } = await load();
    expect(b.local.values.has(KEY)).toBe(true);
    consent.saveCookieChoice('essential');
    expect(b.local.values.has(KEY)).toBe(false);
    expect(origin.visitOriginPayload()).toEqual({ v: 1, consent: false });
  });

  it('uma origem guardada sem consentimento registado é apagada no arranque', async () => {
    const b = setup({ stored: { [KEY]: JSON.stringify({ v: 1, first: { utm_source: 'x', at: Date.now() }, last: null }) } });
    await load();
    expect(b.local.values.has(KEY)).toBe(false);
  });

  it('retirada noutro separador também apaga', async () => {
    const b = setup({ consent: 'all', search: '?utm_source=google' });
    await load();
    b.local.values.set('pa-cookies-consent', 'essential');
    b.listeners.get('storage')?.[0]({ key: 'pa-cookies-consent' });
    expect(b.local.values.has(KEY)).toBe(false);
  });
});

describe('origem da visita: regras de toque', () => {
  it('entrada direta não apaga a última visita de campanha, e o que expirou sai', async () => {
    const now = Date.parse('2026-09-27T16:42:10Z');
    const campaign = { utm_source: 'email', utm_medium: 'email', at: now - 3 * DAY };
    const old = { utm_source: 'google', at: now - 31 * DAY };
    const b = setup({ consent: 'all', stored: { [KEY]: JSON.stringify({ v: 1, first: old, last: campaign }) } });
    await load();
    expect(stored(b)).toEqual({ v: 1, first: campaign, last: campaign });
  });

  it('recarregar a página não conta como visita nova', async () => {
    const now = Date.parse('2026-09-27T16:42:10Z');
    const earlier = { utm_source: 'email', at: now - DAY };
    const b = setup({ consent: 'all', navigation: 'reload', search: '?utm_source=email', stored: { [KEY]: JSON.stringify({ v: 1, first: earlier, last: earlier }) } });
    await load();
    expect(stored(b).last.at).toBe(now - DAY);
  });

  it('abrir o checkout por um email de recuperação é uma visita nova no checkout', async () => {
    const id = '3f1c2a9e-8b7d-4c6e-9f00-1234567890ab';
    const b = setup({ consent: 'all', pathname: `/pt/checkout/${id}`, search: '?utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_20h' });
    const { origin } = await load();
    expect(stored(b).last).toMatchObject({ utm_medium: 'recovery', landing: '/pt/checkout/:id' });
    const sent: unknown[] = [];
    origin.watchCheckoutOrigin(payload => sent.push(payload));
    expect(sent).toEqual([expect.objectContaining({ consent: true, last: expect.objectContaining({ utm_medium: 'recovery', landing: '/pt/checkout/:id' }) })]);
  });

  it('com o armazenamento bloqueado não parte: sem escolha legível segue sem consentimento; aceitando, fica só nesta sessão', async () => {
    setup({ consent: 'all', brokenStorage: true, search: '?utm_source=google&utm_medium=cpc' });
    const { consent, origin } = await load();
    expect(origin.visitOriginPayload()).toEqual({ v: 1, consent: false });
    consent.saveCookieChoice('all');
    expect(origin.visitOriginPayload()).toMatchObject({ consent: true, stored: false, last: { utm_source: 'google', utm_medium: 'cpc' } });
  });

  it('com a escrita a falhar (quota) guarda em memória e diz guardado=nao', async () => {
    const b = setup({ consent: 'all', search: '?utm_source=google&utm_medium=cpc' });
    b.local.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    const { origin } = await load();
    expect(origin.visitOriginPayload()).toMatchObject({ consent: true, stored: false, last: { utm_source: 'google', utm_medium: 'cpc' } });
    expect(origin.visitOriginPayload()).toMatchObject({ consent: true, stored: false, last: { utm_source: 'google' } });
  });
});

describe('origem da visita: página de checkout (setOrigin)', () => {
  const id = '3f1c2a9e-8b7d-4c6e-9f00-1234567890ab';
  const recovery = { pathname: `/pt/checkout/${id}`, search: '?utm_source=email&utm_medium=recovery&utm_campaign=checkout_recovery_20h' };

  /** O servidor a sério (validação e junção do setOrigin), com a origem que o
   *  intent recebeu no computador, com consentimento. */
  async function serverWithConsentedOrigin() {
    const { mergeVisitOrigins, parseVisitOriginPayload } = await import('./services/visit-origin');
    const created = parseVisitOriginPayload({
      v: 1, consent: true, stored: true,
      first: { ageSec: 3 * 86_400, utm_source: 'google', utm_medium: 'cpc', clickId: 'gclid' },
      last: { ageSec: 3_600, utm_source: 'email', utm_medium: 'email', utm_campaign: '2026-09_o1_agosto_preferencia' },
    })!;
    const server = { origin: created, sent: [] as unknown[] };
    const send = (payload: unknown) => {
      server.sent.push(payload);
      const incoming = parseVisitOriginPayload(payload);
      if (incoming) server.origin = mergeVisitOrigins(server.origin, incoming);
    };
    return { server, send, created: structuredClone(created) };
  }

  it('link de recuperação aberto noutro aparelho sem resposta ao banner: não manda nada e a origem fica intacta; "Apenas essenciais" apaga-a', async () => {
    setup(recovery);
    const { consent, origin } = await load();
    const { server, send, created } = await serverWithConsentedOrigin();
    origin.watchCheckoutOrigin(send);
    expect(server.sent).toEqual([]);
    expect(server.origin).toEqual(created);
    consent.saveCookieChoice('essential');
    expect(server.sent).toEqual([{ v: 1, consent: false }]);
    expect(server.origin).toEqual({ v: 1, consent: false });
  });

  it('aceitando no checkout do outro aparelho, a visita da recuperação junta-se sem perder a primeira', async () => {
    setup(recovery);
    const { consent, origin } = await load();
    const { server, send } = await serverWithConsentedOrigin();
    origin.watchCheckoutOrigin(send);
    consent.saveCookieChoice('all');
    expect(server.sent).toHaveLength(1);
    expect(server.origin).toMatchObject({
      consent: true,
      first: { utm_source: 'google', utm_medium: 'cpc' },
      last: { utm_medium: 'recovery', landing: '/pt/checkout/:id' },
    });
  });

  it('retirada feita noutra página: ao abrir o checkout com "Apenas essenciais" a origem do intent sai logo', async () => {
    setup({ consent: 'essential', pathname: `/pt/checkout/${id}` });
    const { origin } = await load();
    const { server, send } = await serverWithConsentedOrigin();
    origin.watchCheckoutOrigin(send);
    expect(server.sent).toEqual([{ v: 1, consent: false }]);
    expect(server.origin).toEqual({ v: 1, consent: false });
  });

  it('retirada no checkout com o GTM carregado: o pedido pode perder-se no recarregamento, e a página nova manda-o outra vez', async () => {
    const b = setup({ consent: 'all', pathname: `/pt/checkout/${id}` });
    const { consent, origin } = await load();
    vi.advanceTimersByTime(200); // GTM carregado (live, "Aceitar tudo")
    const { server, send } = await serverWithConsentedOrigin();
    const lost: unknown[] = [];
    origin.watchCheckoutOrigin(payload => lost.push(payload));
    consent.saveCookieChoice('essential');
    expect(b.win.location.reload).toHaveBeenCalledOnce();
    expect(lost.at(-1)).toEqual({ v: 1, consent: false });
    // Página nova depois do recarregamento: a escolha guardada é "Apenas essenciais".
    vi.resetModules();
    setup({ consent: 'essential', pathname: `/pt/checkout/${id}` });
    const reloaded = await load();
    reloaded.origin.watchCheckoutOrigin(send);
    expect(server.origin).toEqual({ v: 1, consent: false });
  });

  it('sem escolha legível (outro separador apagou-a) não manda nada; deixar de ouvir tira o ouvinte', async () => {
    const b = setup({ consent: 'all', pathname: `/pt/checkout/${id}` });
    const { origin } = await load();
    const sent: unknown[] = [];
    const stop = origin.watchCheckoutOrigin(payload => sent.push(payload));
    expect(sent).toHaveLength(1);
    b.local.values.delete('pa-cookies-consent');
    b.listeners.get('storage')?.[0]({ key: 'pa-cookies-consent' });
    expect(sent).toHaveLength(1);
    stop();
    expect(b.win.removeEventListener).toHaveBeenCalledWith('pa:cookie-choice', expect.any(Function));
  });
});
