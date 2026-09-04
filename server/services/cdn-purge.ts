/**
 * Purga automática da CDN (Cloudflare) num deploy novo.
 *
 * Porquê (auditoria set/2026, N2): a edge guarda o HTML público (s-maxage,
 * ver setHtmlCacheHeaders em _core/vite.ts) e os estáticos de client/public
 * (robots.txt, llms.txt, 1h). Um build novo muda os hashes de /assets e o
 * conteúdo desses ficheiros; sem purga, o que sai do main só chega ao ar
 * quando cada entrada expira — e o smoke pós-deploy compara com o build,
 * por isso tem de correr contra o edge já limpo.
 *
 * Corre no arranque do processo em produção (o Render substitui o processo
 * em cada deploy) com um atraso curto, para que a purga aconteça depois de o
 * tráfego já estar a bater na instância nova e não repovoe o edge com a
 * instância antiga. O cache de render SSR é em memória, logo nasce limpo.
 *
 * Purga por hostname (SITE_URL e apex) para não tocar no dev; se o plano não
 * permitir purge por host, cai para purge_everything — o custo é só uma
 * re-render por URL, com TTL de 60 s de qualquer forma.
 *
 * Manual: `node scripts/cf-purge.mjs` (mesmo token, mesmo efeito).
 */

const API = "https://api.cloudflare.com/client/v4";

function tokenAndZone() {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const zoneName = process.env.CLOUDFLARE_ZONE_NAME || "portugalactive.com";
  return { token, zoneId, zoneName };
}

async function cf(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    },
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const errs = (body.errors || []).map((e: any) => `${e.code} ${e.message}`).join("; ");
    const err: any = new Error(`${init.method || "GET"} ${path} → ${res.status} ${errs}`);
    err.codes = (body.errors || []).map((e: any) => e.code);
    throw err;
  }
  return body.result;
}

/** Hosts a purgar: SITE_URL (ou www) e o apex. */
export function purgeHosts(): string[] {
  const raw = process.env.SITE_URL || "https://www.portugalactive.com";
  let host = "www.portugalactive.com";
  try { host = new URL(raw).hostname; } catch { /* keep default */ }
  const apex = host.replace(/^www\./, "");
  return Array.from(new Set([host, apex]));
}

export interface PurgeResult {
  mode: "hosts" | "everything";
  hosts?: string[];
}

export async function purgeCdn(reason = "manual"): Promise<PurgeResult | null> {
  const { token, zoneName } = tokenAndZone();
  if (!token) {
    console.info("[CDN] CLOUDFLARE_API_TOKEN ausente — purga ignorada");
    return null;
  }
  let { zoneId } = tokenAndZone();
  if (!zoneId) {
    const zones = await cf(token, `/zones?name=${encodeURIComponent(zoneName)}`);
    if (!zones?.length) throw new Error(`zona "${zoneName}" não encontrada para este token`);
    zoneId = zones[0].id as string;
  }
  const hosts = purgeHosts();
  try {
    await cf(token, `/zones/${zoneId}/purge_cache`, {
      method: "POST",
      body: JSON.stringify({ hosts }),
    });
    console.info(`[CDN] purga por host (${reason}): ${hosts.join(", ")}`);
    return { mode: "hosts", hosts };
  } catch (e: any) {
    // 1117 / 1113: purge by host não disponível no plano → tudo.
    console.warn(`[CDN] purge por host falhou (${e?.message}); a purgar tudo`);
    await cf(token, `/zones/${zoneId}/purge_cache`, {
      method: "POST",
      body: JSON.stringify({ purge_everything: true }),
    });
    console.info(`[CDN] purga total (${reason})`);
    return { mode: "everything" };
  }
}

/**
 * Agenda a purga pós-deploy. Só em produção com token; `delayMs` dá tempo ao
 * Render para trocar o tráfego para o processo novo antes de limpar o edge.
 */
export function scheduleBootPurge(delayMs = 90_000): void {
  if (process.env.NODE_ENV !== "production") return;
  if (!process.env.CLOUDFLARE_API_TOKEN) {
    console.info("[CDN] sem CLOUDFLARE_API_TOKEN — o edge só renova por TTL (HTML 60 s, robots/llms 1 h)");
    return;
  }
  const t = setTimeout(() => {
    purgeCdn("boot").catch((e) => console.warn("[CDN] purga no boot falhou:", e?.message ?? e));
  }, delayMs);
  // Nunca segurar o processo por causa disto.
  (t as any).unref?.();
  console.info(`[CDN] purga agendada para ${Math.round(delayMs / 1000)} s após o arranque`);
}
