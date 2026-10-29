/**
 * Job dos calendários das casas parceiras (Tripwix). É o único caminho que lê
 * a API deles: uma casa de cada vez, uma leitura a cada ~103 s (≤ 35/h; o
 * limite deles é 100/h e travam ~35 pedidos seguidos). Ver tripwix-calendar.ts.
 *
 * Ao arrancar lê da BD o último calendário bom de cada casa (uma consulta) e
 * só faz a 1.ª leitura à Tripwix 90 s depois: um restart (ou um deploy, com
 * os dois processos no ar) nunca dispara uma rajada de 35 leituras.
 *
 * Casas sem calendário (1.º deploy, casa nova): uma a cada ~34 s, enquanto a
 * BD confirmar cada escrita, para não ficarem ~1 h sem preço (P173-R2). Conta
 * para o mesmo teto de 35/h.
 */
import { isPreviewDeployment } from "../lib/preview-isolation";
import { getPropertiesForSite } from "./properties-store";
import {
  hydrateTripwixCalendars,
  lastScheduledTripwixCallAt,
  refreshNextTripwixCalendar,
  tripwixCalendarSummary,
  BOOT_QUIET_MS,
  FILL_GAP_MS,
  SCHEDULED_GAP_MS,
  SCHEDULED_READS_PER_HOUR,
  type RefreshResult,
} from "./tripwix-calendar";

/** Uma leitura por passo base: 3600 s / 35 ≈ 103 s. */
export const TRIPWIX_TICK_MS = SCHEDULED_GAP_MS;
/** O relógio do job: três passos por passo base (o do meio e o último só leem casas por preencher). */
export const TRIPWIX_WAKE_MS = FILL_GAP_MS;
/**
 * Folga do relógio: o passo que acorda 3 × 34,3 s depois da última leitura
 * conta como passo base, mesmo que essa leitura tenha começado até 5 s depois
 * do seu passo (a BD pode levar até 3 s a responder ou a desistir).
 */
const PACE_SLACK_MS = 5_000;
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
  const filling = s.toFill ? `; ${s.toFill} por preencher` : "";
  console.info(`[Tripwix] calendários: ${s.withData}/${s.total} com dados (${s.stale} com mais de 2 h)${filling}; leituras na última hora: ${s.readsLastHour}${paused}${failing}`);
}

/**
 * Um passo do job (exportado para testes). Nunca corre dois em paralelo.
 * Lê uma casa se já passaram ~103 s desde a última leitura; ou ~34 s, se
 * houver uma casa por preencher e a BD estiver a confirmar as escritas.
 */
export async function runTripwixRefreshTick(): Promise<RefreshResult | { action: "busy" }> {
  if (running) return { action: "busy" };
  running = true;
  try {
    const homes = await publishedPartnerHomes();
    if (!homes.length) return { action: "idle" };
    // Espera no máximo 3 s pela BD; sem ela, o job continua ao ritmo base.
    await hydrateTripwixCalendars(homes.map((h) => h.uid));
    const since = Date.now() - lastScheduledTripwixCallAt();
    let result: RefreshResult = { action: "idle" };
    if (since >= TRIPWIX_TICK_MS - PACE_SLACK_MS) result = await refreshNextTripwixCalendar(homes);
    else if (since >= FILL_GAP_MS - PACE_SLACK_MS) result = await refreshNextTripwixCalendar(homes, { fillOnly: true });
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
    setInterval(tick, TRIPWIX_WAKE_MS).unref?.();
  }, BOOT_QUIET_MS);
  first.unref?.();
  console.info(
    `[Tripwix] refresh dos calendários: 1 leitura a cada ${Math.round(TRIPWIX_TICK_MS / 1000)} s (≤ ${SCHEDULED_READS_PER_HOUR}/h); ` +
    `casas sem calendário a cada ${Math.round(FILL_GAP_MS / 1000)} s enquanto a BD confirmar as escritas; a 1.ª daqui a ${BOOT_QUIET_MS / 1000} s`,
  );
  return true;
}

/** Só para testes. */
export function resetTripwixRefreshForTests(): void {
  homesCache = null;
  running = false;
  started = false;
  lastSummaryAt = 0;
}
