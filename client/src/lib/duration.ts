/**
 * Human labels for data fields that arrive in English from the catalogues
 * (products.json durations "Half day" / "Full day" / "Flexible", Guesty
 * room names "Bedroom 1"). The PT/ES/… pages showed them raw
 * (auditoria set/2026, T3).
 */
type T = (key: string, opts?: Record<string, unknown>) => string;

/** "Half day" → "Meio dia", "2–3 hours" → "2–3 horas", anything else unchanged. */
export function localizeDuration(raw: string | null | undefined, t: T): string {
  if (!raw) return '';
  const v = raw.trim();
  const lower = v.toLowerCase();
  if (lower === 'half day' || lower === 'half-day') return t('duration.halfDay', { defaultValue: 'Half day' });
  if (lower === 'full day' || lower === 'full-day') return t('duration.fullDay', { defaultValue: 'Full day' });
  if (lower === 'flexible') return t('duration.flexible', { defaultValue: 'Flexible' });
  const range = v.match(/^(\d+)\s*[–-]\s*(\d+)\s*hours?$/i);
  if (range) return `${range[1]}–${range[2]} ${t('duration.hours', { defaultValue: 'hours' })}`;
  const single = v.match(/^(\d+)\s*hours?$/i);
  if (single) return `${single[1]} ${t(Number(single[1]) === 1 ? 'duration.hour' : 'duration.hours', { defaultValue: Number(single[1]) === 1 ? 'hour' : 'hours' })}`;
  return v;
}

/** "Bedroom 3" → "Quarto 3"; other room names pass through. */
export function localizeRoomName(raw: string | null | undefined, t: T): string {
  if (!raw) return '';
  const m = raw.trim().match(/^bedroom\s*(\d+)$/i);
  if (m) return t('propertyDetail.bedroomN', { n: m[1], defaultValue: 'Bedroom {{n}}' });
  return raw;
}
