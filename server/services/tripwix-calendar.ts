/**
 * Calendários das casas parceiras (Tripwix): uma cópia por casa, em memória
 * e na BD, refrescada por um job a ritmo fixo (tripwix-refresh.ts).
 *
 * Auditoria de 29 out 2026 (prices-availability-01/06): a cache era só em
 * memória (15 min; uma falha só 60 s), cada visita lia à Tripwix o que tinha
 * expirado, um 429 cortava todas as leituras até 1 h e os erros não ficavam
 * em log. Resultado: 27 de 35 casas sem preço a certas horas, e cada restart
 * disparava ~35 leituras seguidas (a Tripwix dá 100/h e trava ~35 seguidas).
 *
 * Agora:
 * - Os pedidos dos hóspedes nunca chamam a Tripwix: servem o último
 *   calendário bom (até 48 h), lido da BD numa consulta ao arrancar.
 * - Só o job lê a Tripwix: uma casa de cada vez, ≤ 35 leituras/h, a mais
 *   antiga primeiro; uma casa que falha recua 15 min, 30, 60 … até 12 h.
 * - Cada falha fica em log com o estado HTTP e o motivo.
 * - A BD só é escrita quando o calendário muda (ou a cada 6 h, para que um
 *   restart saiba a idade do que leu).
 * - Estadias para lá do ano guardado (raras): leitura pontual, ≤ 10/h.
 */
import { getSettingsByKeys, upsertSetting } from "../db";

export type TripwixDay = { date: string; status: string; price: string | number | null };
export type CalendarSnapshot = { days: TripwixDay[]; fetchedAt: number; source: 'live' | 'cached' };

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** O ano que o job guarda por casa: pesquisa com datas, calendário da PDP e "desde" a 12 meses. */
export const STORED_WINDOW_DAYS = 365;
/** Uma casa é refrescada quando o calendário tem mais de 1 h: 35 casas ≈ 35 leituras/h. */
export const REFRESH_EVERY_MS = 60 * 60_000;
/** O último calendário bom continua a servir até 48 h depois da última leitura boa. */
export const MAX_STALE_MS = 48 * HOUR;
/** Teto de leituras do job por hora (o limite da Tripwix é 100/h). */
export const SCHEDULED_READS_PER_HOUR = 35;
/** Leituras pontuais (estadias para lá do ano guardado) por hora. */
export const ON_DEMAND_READS_PER_HOUR = 10;
const BACKOFF_BASE_MS = 15 * 60_000;
const BACKOFF_MAX_MS = 12 * HOUR;
const PERSIST_HEARTBEAT_MS = 6 * HOUR;
const HYDRATE_RETRY_MS = 5 * 60_000;
const ON_DEMAND_TTL_MS = 6 * HOUR;
const ON_DEMAND_FAILED_TTL_MS = 30 * 60_000;
const MAX_SPAN_DAYS = 400;
const FETCH_TIMEOUT_MS = 12_000;
const STORE_CAT = "tripwix_calendar";
/** O TEXT do MySQL guarda 65 535 bytes; um ano codificado ronda 1 KB. */
const MAX_STORED_BYTES = 60_000;

type Entry = {
  /** Janela pedida à Tripwix (os dias guardados ficam dentro dela). */
  start: string;
  end: string;
  /** Último calendário bom (null: nunca houve leitura boa). */
  days: TripwixDay[] | null;
  /** Hora da última leitura boa (0: nunca). */
  fetchedAt: number;
  /** Falhas seguidas (para o recuo exponencial). */
  failures: number;
  /** Antes disto o job não volta a tentar esta casa. */
  nextAttemptAt: number;
  lastError: string | null;
  /** O que está na BD (para não reescrever um calendário igual). */
  persistedSignature: string | null;
  persistedAt: number;
};

const entries = new Map<string, Entry>();
const hydration = new Map<string, Promise<void> | "done">();
let hydrationRetryAt = 0;
/** Cooldown global depois de um 429 (Retry-After, até 1 h). */
let throttledUntil = 0;
const calls: Array<{ at: number; kind: "scheduled" | "on-demand" }> = [];
let lastDbWriteWarnAt = 0;

const far = new Map<string, { start: string; end: string; at: number; days: TripwixDay[] | null }>();
const farPending = new Map<string, Promise<void>>();

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** "AAAA-MM-DD" + n dias (UTC). */
export const addDays = (date: string, n: number) => ymd(Date.parse(date + "T00:00:00Z") + n * DAY);
const spanDays = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / DAY;
const storeKey = (uid: string) => `${STORE_CAT}_${uid}`;
const minutes = (ms: number) => Math.max(1, Math.round(ms / 60_000));

function newEntry(): Entry {
  return { start: "", end: "", days: null, fetchedAt: 0, failures: 0, nextAttemptAt: 0, lastError: null, persistedSignature: null, persistedAt: 0 };
}

/** Preço da noite como número; vazio, zero ou inválido → null (a noite não se cota). */
function normalPrice(price: unknown): number | null {
  const n = typeof price === "number" ? price : Number(price);
  return typeof price !== "boolean" && price !== null && price !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

/* ════════════════════════════════════════════════════════════════
   Cópia na BD (site_settings, categoria tripwix_calendar)
   Formato: {"v":1,"at":<ms>,"w":[início,fim],"s":<1.º dia>,"r":[[estado,preço,dias]…]}
   — dias seguidos iguais num só "run"; um ano cabe em ~1 KB.
   ════════════════════════════════════════════════════════════════ */
type Run = [string | null, number | null, number];
type StoredCalendar = { at: number; start: string; end: string; days: TripwixDay[] };

function toRuns(days: TripwixDay[]): { first: string | null; runs: Run[] } {
  if (!days.length) return { first: null, runs: [] };
  const runs: Run[] = [];
  let expected = days[0].date;
  for (const d of days) {
    if (d.date !== expected) runs.push([null, null, Math.round(spanDays(expected, d.date))]); // dia(s) sem dados
    const price = normalPrice(d.price);
    const last = runs[runs.length - 1];
    if (last && last[0] === d.status && last[1] === price) last[2]++;
    else runs.push([d.status, price, 1]);
    expected = addDays(d.date, 1);
  }
  return { first: days[0].date, runs };
}

function signatureOf(start: string, end: string, days: TripwixDay[]): string {
  const { first, runs } = toRuns(days);
  return `${start}|${end}|${first}|${JSON.stringify(runs)}`;
}

export function encodeStoredCalendar(c: StoredCalendar): string {
  const { first, runs } = toRuns(c.days);
  return JSON.stringify({ v: 1, at: c.at, w: [c.start, c.end], s: first, r: runs });
}

export function decodeStoredCalendar(raw: string | null | undefined): StoredCalendar | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o?.v !== 1 || !(Number(o.at) > 0) || !Array.isArray(o.w) || !validDate(o.w[0]) || !validDate(o.w[1]) || !Array.isArray(o.r)) return null;
    if (o.w[1] < o.w[0] || spanDays(o.w[0], o.w[1]) > MAX_SPAN_DAYS) return null;
    if (o.r.length && !validDate(o.s)) return null;
    const days: TripwixDay[] = [];
    let date: string = o.s;
    let total = 0;
    for (const run of o.r) {
      if (!Array.isArray(run) || run.length !== 3) return null;
      const [status, price, count] = run;
      if (!Number.isInteger(count) || count < 1) return null;
      if (status !== null && typeof status !== "string") return null;
      if (price !== null && !(typeof price === "number" && Number.isFinite(price))) return null;
      total += count;
      if (total > MAX_SPAN_DAYS + 1) return null;
      for (let i = 0; i < count; i++) {
        if (status !== null) days.push({ date, status, price });
        date = addDays(date, 1);
      }
    }
    return { at: Number(o.at), start: o.w[0], end: o.w[1], days };
  } catch {
    return null;
  }
}

/**
 * Lê da BD o último calendário bom das casas ainda não lidas, numa só
 * consulta. Ao arrancar (o job) e no 1.º pedido de cada casa; depois, nunca.
 * Nunca substitui um calendário em memória mais recente.
 */
export async function hydrateTripwixCalendars(uids: string[]): Promise<void> {
  const want = Array.from(new Set(uids.filter((u) => typeof u === "string" && u)));
  const waits: Promise<void>[] = [];
  const missing: string[] = [];
  for (const uid of want) {
    const state = hydration.get(uid);
    if (state === "done") continue;
    if (state) waits.push(state);
    else missing.push(uid);
  }
  if (missing.length && Date.now() >= hydrationRetryAt) {
    const job = (async () => {
      try {
        const rows = await getSettingsByKeys(missing.map(storeKey));
        for (const uid of missing) {
          const stored = decodeStoredCalendar(rows.get(storeKey(uid)));
          if (stored) mergeStored(uid, stored);
          hydration.set(uid, "done");
        }
      } catch (err: any) {
        hydrationRetryAt = Date.now() + HYDRATE_RETRY_MS;
        for (const uid of missing) hydration.delete(uid);
        console.warn(`[Tripwix] calendários guardados não lidos da BD (${String(err?.message ?? err).slice(0, 160)}); nova tentativa daqui a 5 min`);
      }
    })();
    for (const uid of missing) if (!hydration.has(uid)) hydration.set(uid, job);
    waits.push(job);
  }
  await Promise.all(waits);
}

function mergeStored(uid: string, stored: StoredCalendar): void {
  const e = entries.get(uid) ?? newEntry();
  if (stored.at > e.fetchedAt) {
    e.start = stored.start;
    e.end = stored.end;
    e.days = stored.days;
    e.fetchedAt = stored.at;
  }
  e.persistedSignature = signatureOf(stored.start, stored.end, stored.days);
  e.persistedAt = stored.at;
  entries.set(uid, e);
}

function persistIfChanged(uid: string, e: Entry): void {
  if (!e.days) return;
  const signature = signatureOf(e.start, e.end, e.days);
  if (signature === e.persistedSignature && e.fetchedAt - e.persistedAt < PERSIST_HEARTBEAT_MS) return;
  const value = encodeStoredCalendar({ at: e.fetchedAt, start: e.start, end: e.end, days: e.days });
  if (value.length > MAX_STORED_BYTES) {
    console.warn(`[Tripwix] calendário de ${uid} demasiado grande para guardar (${value.length} bytes); fica só em memória`);
    return;
  }
  const at = e.fetchedAt;
  upsertSetting(storeKey(uid), value, STORE_CAT)
    .then(() => {
      e.persistedSignature = signature;
      e.persistedAt = at;
    })
    .catch((err: any) => {
      // BD em baixo (ex.: quota do TiDB): o calendário continua em memória.
      if (Date.now() - lastDbWriteWarnAt > 30 * 60_000) {
        lastDbWriteWarnAt = Date.now();
        console.warn(`[Tripwix] calendário não guardado na BD (${String(err?.message ?? err).slice(0, 160)}); continua em memória`);
      }
    });
}

/* ════════════════════════════════════════════════════════════════
   Leitura à Tripwix (só o job e as leituras pontuais)
   ════════════════════════════════════════════════════════════════ */
type FetchOutcome =
  | { ok: true; days: TripwixDay[] }
  | { ok: false; status: number | null; reason: string; throttled: boolean };

function pruneCalls(now: number): void {
  while (calls.length && calls[0].at <= now - HOUR) calls.shift();
}

/** Leituras feitas à Tripwix na última hora por este processo. */
export function tripwixReadsInLastHour(kind?: "scheduled" | "on-demand"): number {
  pruneCalls(Date.now());
  return kind ? calls.filter((c) => c.kind === kind).length : calls.length;
}

export function tripwixThrottledUntil(): number {
  return throttledUntil;
}

async function fetchTripwixCalendar(uid: string, start: string, end: string, kind: "scheduled" | "on-demand"): Promise<FetchOutcome> {
  const key = process.env.TRIPWIX_API_KEY;
  if (!key) return { ok: false, status: null, reason: "sem TRIPWIX_API_KEY", throttled: false };
  calls.push({ at: Date.now(), kind });
  pruneCalls(Date.now());
  const base = process.env.TRIPWIX_API_BASE ?? 'https://admin.worldeluxevillas.com/api/v1/partner';
  try {
    const res = await fetch(`${base}/properties/${encodeURIComponent(uid)}/calendar/?start_date=${start}&end_date=${end}`, {
      headers: { 'X-Partner-API-Key': key }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status === 429) {
      const header = res.headers.get('Retry-After');
      const body = await res.json().catch(() => ({} as any));
      const seconds = Number(header) || Number(String(body?.detail ?? '').match(/(\d+)\s*second/)?.[1]) || 60;
      const wait = Math.min(Math.max(seconds, 1), 3600);
      throttledUntil = Math.max(throttledUntil, Date.now() + wait * 1000);
      return { ok: false, status: 429, reason: `limite de pedidos; pausa de ${wait} s`, throttled: true };
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 160);
      return { ok: false, status: res.status, reason: text || res.statusText || 'erro HTTP', throttled: false };
    }
    const data = await res.json().catch(() => undefined);
    if (!Array.isArray(data)) return { ok: false, status: res.status, reason: 'resposta não é uma lista de dias', throttled: false };
    if (!data.every((d: any) => d && typeof d.date === 'string' && validDate(d.date) && typeof d.status === 'string')) {
      return { ok: false, status: res.status, reason: 'dias inválidos na resposta', throttled: false };
    }
    if (!data.length) return { ok: false, status: res.status, reason: 'calendário vazio', throttled: false };
    const days: TripwixDay[] = data
      .map((d: any) => ({ date: d.date, status: d.status, price: normalPrice(d.price) }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    for (let i = 1; i < days.length; i++) {
      if (days[i].date === days[i - 1].date) return { ok: false, status: res.status, reason: `dia repetido (${days[i].date})`, throttled: false };
    }
    return { ok: true, days };
  } catch (err: any) {
    const reason = err?.name === 'TimeoutError' || err?.name === 'AbortError'
      ? `sem resposta em ${FETCH_TIMEOUT_MS / 1000} s`
      : `erro de rede: ${String(err?.message ?? err).slice(0, 120)}`;
    return { ok: false, status: null, reason, throttled: false };
  }
}

function backoffMs(failures: number): number {
  return Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1));
}

function ageText(ms: number): string {
  return ms < 2 * HOUR ? `${minutes(ms)} min` : `${Math.round(ms / HOUR)} h`;
}

export type RefreshResult =
  | { action: "refreshed"; uid: string }
  | { action: "failed"; uid: string; status: number | null; reason: string }
  | { action: "throttled"; uid?: string; until: number }
  | { action: "idle" };

/** Lê à Tripwix o ano de uma casa e guarda o resultado (memória e, se mudou, BD). */
export async function refreshTripwixCalendar(uid: string, name?: string): Promise<RefreshResult> {
  const now = Date.now();
  if (now < throttledUntil) return { action: "throttled", uid, until: throttledUntil };
  const start = ymd(now);
  const end = addDays(start, STORED_WINDOW_DAYS);
  const outcome = await fetchTripwixCalendar(uid, start, end, "scheduled");
  const e = entries.get(uid) ?? newEntry();
  entries.set(uid, e);
  const label = name ? `${name} (${uid})` : uid;
  if (outcome.ok) {
    e.start = start;
    e.end = end;
    e.days = outcome.days;
    e.fetchedAt = Date.now();
    if (e.failures > 0) console.info(`[Tripwix] calendário de ${label} lido outra vez, depois de ${e.failures} falha(s)`);
    e.failures = 0;
    e.nextAttemptAt = 0;
    e.lastError = null;
    persistIfChanged(uid, e);
    return { action: "refreshed", uid };
  }
  const statusText = outcome.status === null ? "sem resposta HTTP" : `HTTP ${outcome.status}`;
  const kept = e.days && Date.now() - e.fetchedAt <= MAX_STALE_MS
    ? `continua o último calendário bom (de há ${ageText(Date.now() - e.fetchedAt)})`
    : "sem calendário guardado: a casa fica sem preço";
  if (outcome.throttled) {
    // Um 429 não é culpa da casa: pausa tudo, sem contar falha.
    console.warn(`[Tripwix] ${statusText} ao ler ${label}: ${outcome.reason} em todas as leituras; ${kept}`);
    return { action: "throttled", uid, until: throttledUntil };
  }
  e.failures += 1;
  e.nextAttemptAt = Date.now() + backoffMs(e.failures);
  e.lastError = `${statusText}: ${outcome.reason}`;
  console.warn(`[Tripwix] calendário de ${label} falhou — ${statusText}: ${outcome.reason}; falha ${e.failures} seguida, próxima tentativa daqui a ${minutes(e.nextAttemptAt - Date.now())} min; ${kept}`);
  return { action: "failed", uid, status: outcome.status, reason: outcome.reason };
}

/** Quando o job deve voltar a ler esta casa: nunca lida primeiro, depois a mais antiga. */
function dueAt(uid: string): number {
  const e = entries.get(uid);
  if (!e) return 0;
  if (e.failures > 0 || !e.days) return e.nextAttemptAt;
  return Math.max(e.fetchedAt + REFRESH_EVERY_MS, e.nextAttemptAt);
}

/**
 * Um passo do job: refresca a casa mais em atraso, se houver uma em atraso
 * e houver orçamento. Uma leitura por chamada; o ritmo é do chamador.
 */
export async function refreshNextTripwixCalendar(homes: Array<{ uid: string; name?: string }>): Promise<RefreshResult> {
  if (!process.env.TRIPWIX_API_KEY || !homes.length) return { action: "idle" };
  const now = Date.now();
  if (now < throttledUntil) return { action: "throttled", until: throttledUntil };
  if (tripwixReadsInLastHour("scheduled") >= SCHEDULED_READS_PER_HOUR) return { action: "idle" };
  let best: { uid: string; name?: string } | null = null;
  let bestDue = Infinity;
  for (const home of homes) {
    const due = dueAt(home.uid);
    if (due < bestDue) {
      best = home;
      bestDue = due;
    }
  }
  if (!best || bestDue > now) return { action: "idle" };
  return refreshTripwixCalendar(best.uid, best.name);
}

/** Estado para o resumo horário do job. */
export function tripwixCalendarSummary(homes: Array<{ uid: string; name?: string }>) {
  const now = Date.now();
  let withData = 0;
  let stale = 0;
  const failing: string[] = [];
  for (const home of homes) {
    const e = entries.get(home.uid);
    if (e?.days && now - e.fetchedAt <= MAX_STALE_MS) {
      withData++;
      if (now - e.fetchedAt > 2 * REFRESH_EVERY_MS) stale++;
    }
    if (e && e.failures > 0) failing.push(`${home.name ?? home.uid} (${e.lastError}; ${e.failures}×)`);
  }
  return { total: homes.length, withData, stale, failing, readsLastHour: tripwixReadsInLastHour(), throttledUntil };
}

/* ════════════════════════════════════════════════════════════════
   Leitura para os pedidos dos hóspedes (memória; nunca a Tripwix,
   salvo estadias para lá do ano guardado)
   ════════════════════════════════════════════════════════════════ */
const slice = (days: TripwixDay[], start: string, end: string) => days.filter((d) => d.date >= start && d.date <= end);

/**
 * Dias de `start` a `end` (inclusive) de uma casa parceira.
 * `partial`: serve a parte que existir (calendário da PDP, "desde"); sem
 * `partial`, só uma janela completa (cotação de uma estadia).
 */
export async function readTripwixCalendar(uid: string, start: string, end: string, opts: { partial?: boolean } = {}): Promise<CalendarSnapshot | null> {
  if (!uid || !validDate(start) || !validDate(end) || end < start || spanDays(start, end) > MAX_SPAN_DAYS) return null;
  if (!process.env.TRIPWIX_API_KEY) return null;
  await hydrateTripwixCalendars([uid]);
  const now = Date.now();
  const e = entries.get(uid);
  if (e?.days && now - e.fetchedAt <= MAX_STALE_MS) {
    const covers = e.start <= start && e.end >= end;
    if (covers || (opts.partial && e.start <= end && e.end >= start)) {
      return { days: slice(e.days, start, end), fetchedAt: e.fetchedAt, source: 'cached' };
    }
  }
  // Uma estadia para lá do ano que o job guarda (daqui a mais de 12 meses):
  // leitura pontual. O calendário da PDP e o "desde" (partial) nunca chegam
  // aqui — servem-se do que o job guardou, ou ficam sem dados até ele passar.
  if (!opts.partial && end > addDays(ymd(now), STORED_WINDOW_DAYS - 2)) return readFarCalendar(uid, start, end);
  return null;
}

function farHit(uid: string, start: string, end: string): CalendarSnapshot | null | undefined {
  const c = far.get(uid);
  if (!c || c.start > start || c.end < end) return undefined;
  if (Date.now() - c.at >= (c.days ? ON_DEMAND_TTL_MS : ON_DEMAND_FAILED_TTL_MS)) return undefined;
  return c.days ? { days: slice(c.days, start, end), fetchedAt: c.at, source: 'cached' } : null;
}

async function readFarCalendar(uid: string, start: string, end: string): Promise<CalendarSnapshot | null> {
  const hit = farHit(uid, start, end);
  if (hit !== undefined) return hit;
  const pending = farPending.get(uid);
  if (pending) {
    await pending;
    return farHit(uid, start, end) ?? null;
  }
  if (Date.now() < throttledUntil) return null;
  if (tripwixReadsInLastHour("on-demand") >= ON_DEMAND_READS_PER_HOUR) return null;
  // Uma margem de 60 dias para os ajustes de datas do mesmo hóspede.
  const fetchEnd = [addDays(end, 60), addDays(start, MAX_SPAN_DAYS)].sort()[0];
  let fresh = false;
  const work = (async () => {
    const outcome = await fetchTripwixCalendar(uid, start, fetchEnd, "on-demand");
    if (far.size >= 60 && !far.has(uid)) far.delete(far.keys().next().value!);
    if (outcome.ok) {
      far.set(uid, { start, end: fetchEnd, at: Date.now(), days: outcome.days });
      fresh = true;
    } else {
      far.set(uid, { start, end: fetchEnd, at: Date.now(), days: null });
      const statusText = outcome.status === null ? "sem resposta HTTP" : `HTTP ${outcome.status}`;
      console.warn(`[Tripwix] leitura pontual de ${uid} (${start} → ${end}) falhou — ${statusText}: ${outcome.reason}`);
    }
  })();
  farPending.set(uid, work);
  try {
    await work;
  } finally {
    farPending.delete(uid);
  }
  const out = farHit(uid, start, end) ?? null;
  return out && fresh ? { ...out, source: 'live' } : out;
}

/** Só para testes: esquece o estado do processo (o que um restart faz). */
export function resetTripwixCalendarsForTests(): void {
  entries.clear();
  hydration.clear();
  hydrationRetryAt = 0;
  throttledUntil = 0;
  calls.length = 0;
  far.clear();
  farPending.clear();
  lastDbWriteWarnAt = 0;
}
