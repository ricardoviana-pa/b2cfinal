/**
 * Turn a review date into the date-time schema.org expects.
 *
 * Q&A pages carry `lastUpdated` as a plain "2026-04-17", which is what the
 * visible "Updated April 2026" label is built from. schema.org's datePublished
 * and dateCreated are DateTime properties, and Search Console reports a bare
 * date as both "valor de data/hora inválido" and "falta um fuso horário".
 *
 * The offset is resolved for Europe/Lisbon on that specific date, so a summer
 * date gets +01:00 and a winter one +00:00 — hardcoding either would be wrong
 * for half the year.
 */

/** "GMT+01:00" → "+01:00"; "GMT" → "+00:00". */
function offsetFor(date: Date): string {
  try {
    const name = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Lisbon',
      timeZoneName: 'longOffset',
    })
      .formatToParts(date)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!name) return '+00:00';
    const m = name.match(/GMT([+-]\d{2}:\d{2})/);
    return m ? m[1] : '+00:00';
  } catch {
    // Older engines without longOffset support: UTC is still valid ISO 8601.
    return '+00:00';
  }
}

/**
 * `"2026-04-17"` → `"2026-04-17T12:00:00+01:00"`.
 *
 * Midday, not midnight: a review date has no clock time, and midday cannot
 * slide into the previous or next day when a reader's tooling shifts it.
 * Returns null for anything unparseable, so the caller omits the field rather
 * than emitting something invalid.
 */
export function toSchemaDateTime(input: string | undefined | null): string | null {
  if (!input) return null;
  const value = input.trim();

  // Already a full date-time with a zone — leave it alone.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2})$/.test(value)) return value;

  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(`${y}-${mo}-${d}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject a date the calendar does not hold — "2026-02-31" parses as March.
  if (date.getUTCDate() !== Number(d) || date.getUTCMonth() + 1 !== Number(mo)) return null;

  return `${y}-${mo}-${d}T12:00:00${offsetFor(date)}`;
}
