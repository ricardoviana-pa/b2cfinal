/** Shared supplier-calendar cache. Calendar, cards and dated quotes reuse one read. */
export type TripwixDay = { date: string; status: string; price: string | number | null };
export type CalendarSnapshot = { days: TripwixDay[]; fetchedAt: number; source: 'live' | 'cached' };
const TTL = 15 * 60_000;
const FAILED_TTL = 60_000;
const entries = new Map<string, { start: string; end: string; at: number; days: TripwixDay[] | null }>();
const pending = new Map<string, Promise<CalendarSnapshot | null>>();
let retryAfter = 0;

export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export async function readTripwixCalendar(uid: string, start: string, end: string): Promise<CalendarSnapshot | null> {
  if (!uid || !validDate(start) || !validDate(end) || end < start || Date.parse(end) - Date.parse(start) > 400 * 86400_000) return null;
  const key = process.env.TRIPWIX_API_KEY;
  if (!key) return null;
  const now = Date.now();
  const cached = entries.get(uid);
  if (cached && cached.start <= start && cached.end >= end && now - cached.at < (cached.days ? TTL : FAILED_TTL)) {
    return cached.days ? { days: cached.days.filter(d => d.date >= start && d.date <= end), fetchedAt: cached.at, source: 'cached' } : null;
  }
  if (pending.has(uid)) {
    await pending.get(uid);
    return readTripwixCalendar(uid, start, end);
  }
  if (now < retryAfter) return null;
  // One year covers search dates, the PDP calendar and the 90-day from-price horizon.
  const today = new Date(now).toISOString().slice(0, 10);
  const yearEnd = new Date(now + 365 * 86400_000).toISOString().slice(0, 10);
  let fetchStart = start < today ? start : today;
  let fetchEnd = end > yearEnd ? end : yearEnd;
  if (Date.parse(fetchEnd) - Date.parse(fetchStart) > 400 * 86400_000) {
    fetchStart = start;
    fetchEnd = end;
  }
  const work = (async (): Promise<CalendarSnapshot | null> => {
    let days: TripwixDay[] | null = null;
    try {
      const base = process.env.TRIPWIX_API_BASE ?? 'https://admin.worldeluxevillas.com/api/v1/partner';
      const res = await fetch(`${base}/properties/${encodeURIComponent(uid)}/calendar/?start_date=${fetchStart}&end_date=${fetchEnd}`, {
        headers: { 'X-Partner-API-Key': key }, signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 429) {
        const header = res.headers.get('Retry-After');
        const body = await res.json().catch(() => ({}));
        const seconds = Number(header) || Number(String(body.detail ?? '').match(/(\d+)\s*second/)?.[1]) || 60;
        retryAfter = Date.now() + Math.min(Math.max(seconds, 1), 3600) * 1000;
      } else if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.every(d => d && typeof d.date === 'string' && validDate(d.date) && typeof d.status === 'string')) days = data;
      }
    } catch {
      // No imported-rate fallback: a failed supplier read is not a live price.
    }
    const at = Date.now();
    if (entries.size >= 120 && !entries.has(uid)) entries.delete(entries.keys().next().value!);
    entries.set(uid, { start: fetchStart, end: fetchEnd, at, days });
    return days ? { days: days.filter(d => d.date >= start && d.date <= end), fetchedAt: at, source: 'live' } : null;
  })();
  pending.set(uid, work);
  try { return await work; } finally { pending.delete(uid); }
}
