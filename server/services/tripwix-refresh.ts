/**
 * Job dos calendários das casas parceiras (Tripwix). É o único caminho que lê
 * a API deles: uma casa de cada vez, uma leitura a cada ~103 s (≤ 35/h; o
 * limite deles é 100/h e travam ~35 pedidos seguidos). Ver tripwix-calendar.ts.
 *
 * Ao arrancar lê da BD o último calendário bom de cada casa (uma consulta) e
 * só faz a 1.ª leitura à Tripwix 90 s depois: um restart (ou um deploy, com
 * os dois processos no ar) nunca dispara uma rajada de 35 leituras.
 */
import { isPreviewDeployment } from "../lib/preview-isolation";
import { getPropertiesForSite } from "./properties-store";
import {
  hydrateTripwixCalendars,
  refreshNextTripwixCalendar,
  tripwixCalendarSummary,
  SCHEDULED_READS_PER_HOUR,
  type RefreshResult,
} from "./tripwix-calendar";

/** Uma leitura por passo: 3600 s / 35 ≈ 103 s. */
export const TRIPWIX_TICK_MS = Math.ceil(3_600_000 / SCHEDULED_READS_PER_HOUR);
const FIRST_TICK_MS = 90_000;
const HOMES_TTL_MS = 30 * 60_000;
const SUMMARY_EVERY_MS = 60 * 60_000;

type Home = { uid: string; name: string };
let homesCache: { at: number; homes: Home[] } | null = null;
let running = false;
let started = false;
let lastSummaryAt = 0;

/** As casas parceiras publicadas (lista em cache 30 min: o ficheiro só muda num deploy). */
export async function publishedPartnerHomes(): Promise<Home[]> {
  if (homesCache && Date.now() - homesCache.at < HOMES_TTL_MS) return homesCache.homes;
  const all = await getPropertiesForSite();
  const homes = all
    .filter((p: any) => p?.source === "tripwix" && p.isActive !== false && typeof p.supplierUid === "string" && p.supplierUid)
    .map((p: any) => ({ uid: p.supplierUid as string, name: String(p.name || p.slug || p.supplierUid) }));
  homesCache = { at: Date.now(), homes };
  return homes;
}

function logSummary(homes: Home[]): void {
  const s = tripwixCalendarSummary(homes);
  const failing = s.failing.length ? `; a falhar: ${s.failing.join("; ")}` : "";
  const paused = s.throttledUntil > Date.now() ? `; em pausa (429) até ${new Date(s.throttledUntil).toISOString()}` : "";
  console.info(`[Tripwix] calendários: ${s.withData}/${s.total} com dados (${s.stale} com mais de 2 h); leituras na última hora: ${s.readsLastHour}${paused}${failing}`);
}

/** Um passo do job (exportado para testes). Nunca corre dois em paralelo. */
export async function runTripwixRefreshTick(): Promise<RefreshResult | { action: "busy" }> {
  if (running) return { action: "busy" };
  running = true;
  try {
    const homes = await publishedPartnerHomes();
    if (!homes.length) return { action: "idle" };
    await hydrateTripwixCalendars(homes.map((h) => h.uid));
    const result = await refreshNextTripwixCalendar(homes);
    if (Date.now() - lastSummaryAt >= SUMMARY_EVERY_MS) {
      lastSummaryAt = Date.now();
      logSummary(homes);
    }
    return result;
  } finally {
    running = false;
  }
}

/** Arranca o job no serviço que tem a chave da Tripwix (só produção: os previews não a têm). */
export function startTripwixRefresh(env: NodeJS.ProcessEnv = process.env): boolean {
  if (started) return false;
  if (!env.TRIPWIX_API_KEY || env.TRIPWIX_INVENTORY === "0" || isPreviewDeployment(env)) return false;
  started = true;
  lastSummaryAt = Date.now(); // 1.º resumo uma hora depois do arranque
  void publishedPartnerHomes()
    .then((homes) => hydrateTripwixCalendars(homes.map((h) => h.uid)))
    .catch((e) => console.warn("[Tripwix] leitura inicial dos calendários falhou:", e?.message ?? e));
  const tick = () => void runTripwixRefreshTick().catch((e) => console.warn("[Tripwix] passo do refresh falhou:", e?.message ?? e));
  const first = setTimeout(() => {
    tick();
    setInterval(tick, TRIPWIX_TICK_MS).unref?.();
  }, FIRST_TICK_MS);
  first.unref?.();
  console.info(`[Tripwix] refresh dos calendários: 1 leitura a cada ${Math.round(TRIPWIX_TICK_MS / 1000)} s (≤ ${SCHEDULED_READS_PER_HOUR}/h), a 1.ª daqui a ${FIRST_TICK_MS / 1000} s`);
  return true;
}

/** Só para testes. */
export function resetTripwixRefreshForTests(): void {
  homesCache = null;
  running = false;
  started = false;
  lastSummaryAt = 0;
}
