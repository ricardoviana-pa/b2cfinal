/**
 * Preços e páginas do catálogo Meta, lidos da API pública de produção (só GET).
 *
 * Auditoria 29 out 2026 (prices-availability-07): o base_price do feed era o
 * basePrice do Guesty (placeholder; mediana 1,8× o "desde" real do site). O
 * "desde" real é o que o site mostra: booking.lowestNightlyBatch, servido da
 * memória/BD (sem cotações no pedido). Puro e testável: o fetch é injetado.
 */

/** "Desde €X" real de cada listing (null = sem noites reserváveis / ainda sem valor). */
export async function fetchLowestNightly(site, listingIds, { fetchImpl = fetch, chunk = 100 } = {}) {
  const out = new Map();
  const ids = [...new Set(listingIds)];
  for (let i = 0; i < ids.length; i += chunk) {
    const part = ids.slice(i, i + chunk);
    const input = encodeURIComponent(JSON.stringify({ 0: { json: { listingIds: part } } }));
    const res = await fetchImpl(`${site}/api/trpc/booking.lowestNightlyBatch?batch=1&input=${input}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`lowestNightlyBatch: HTTP ${res.status}`);
    const data = (await res.json())?.[0]?.result?.data?.json;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('lowestNightlyBatch: resposta inesperada');
    for (const id of part) {
      const v = data[id];
      out.set(id, typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    }
  }
  return out;
}

/** O formato que a Meta pede: "500.00 EUR". */
export function metaPrice(n) {
  return `${Number(n).toFixed(2)} EUR`;
}

/** Banda de preço do custom_label_1, sobre o "desde" real. */
export function priceBand(n) {
  if (n >= 300) return 'premium-300plus';
  if (n >= 150) return 'mid-150-300';
  return 'entry-under-150';
}

/**
 * Estado HTTP de cada página, sem seguir redirects (um anúncio nunca deve
 * apontar para um 404 nem para um slug antigo). Devagar: `concurrency`
 * pedidos de cada vez, com uma pausa entre eles.
 */
export async function checkPages(urls, { fetchImpl = fetch, concurrency = 2, gapMs = 250 } = {}) {
  const out = new Map();
  const queue = [...new Set(urls)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function worker() {
    while (queue.length) {
      const url = queue.shift();
      try {
        const res = await fetchImpl(url, { redirect: 'manual', headers: { accept: 'text/html' } });
        out.set(url, { status: res.status, location: res.headers?.get?.('location') ?? null });
        try { await res.body?.cancel?.(); } catch { /* corpo já lido ou fechado */ }
      } catch (e) {
        out.set(url, { status: 0, location: null, error: String(e?.message ?? e) });
      }
      if (gapMs) await sleep(gapMs);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, 3)) }, worker));
  return out;
}

/** Porque é que uma casa fica fora do feed (null = entra). */
export function skipReason({ from, page }) {
  if (page) {
    if (page.status === 404 || page.status === 410) return `página ${page.status}`;
    if (page.status >= 300 && page.status < 400) return `página redireciona (${page.status} → ${page.location ?? '?'})`;
    if (page.status !== 200) return page.status ? `página respondeu ${page.status}` : `página sem resposta (${page.error ?? 'erro'})`;
  }
  if (!(typeof from === 'number' && from > 0)) return 'sem "desde" real (sem noites reserváveis em 12 meses)';
  return null;
}

/** Mediana de uma lista de números (para o resumo placeholder vs real). */
export function median(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}
