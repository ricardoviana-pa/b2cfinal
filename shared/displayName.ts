/**
 * Display name of a home — one function for client AND server.
 *
 * Guesty titles are written for the OTAs ("Habitos Lodge by Portugal Active I
 * Beach & Town Villa with Heated Pool", "4 Sao Juliao Retreat I Pool, Jacuzzi
 * and Garden Escape Villa"). The client already cleaned them
 * (sanitizePropertyName), but the server injected the raw title into
 * <title>, og:title, alt text, breadcrumbs and the SSR body, and three copies
 * of the cleaner had drifted apart (auditoria set/2026, N9).
 *
 * Resolution order:
 *   1. client/src/data/displayNames.json — curated name by slug or id
 *      (accents, the real house name without the amenity tail);
 *   2. sanitizePropertyName(raw) — rule-based cleanup for anything not curated.
 *
 * Rules the curated names follow: no "by Portugal Active", no "Portugal
 * Active" prefix, no " I …" callouts, no amenity tails, proper accents
 * (São Julião, Gerês, Hábitos).
 */
import curated from "../client/src/data/displayNames.json";

const CURATED: Record<string, string> = curated as Record<string, string>;

/** Rule-based cleanup of a raw Guesty / partner title. */
export const sanitizePropertyName = (raw: string): string => {
  if (!raw) return raw;
  let name = raw.trim();
  // Drop brand prefix
  name = name.replace(/^Portugal Active\s+/i, "");
  // Drop "… by Portugal Active" / "… By PortugalActive…" suffix and any
  // noise that follows (handles e.g. "Habito's Lodge By PortugalActive/
  // 5min Beach & Town").
  name = name.replace(/\s+by\s+portugal\s*active\b.*$/i, "");
  // "… - Portugal Active" brand tail (dash/pipe variants), before the guarded
  // splits — the guard would keep it as a capitalised proper-noun tail.
  name = name.replace(/\s*[-–—·|]\s*Portugal\s*Active\s*$/i, "");
  // Drop pipe/dash/"·"/" I " amenity callouts — but ONLY when the tail really
  // is a callout. "Lima River - S. Salvador House" carries the unit's identity
  // after the dash; blindly splitting displayed two different units under the
  // same "Lima River" card. A tail is a callout when it reads like amenities
  // (pool, sea view, heated…) or starts lowercase ("in the Cradle of…").
  const AMENITY_TAIL = /(pool|beach|jacuzzi|heated|view|sauna|gym|bbq|sport|garden|luxur|sea\b|ocean|town|city|charm|premium|escape|access|apartment|balcony|elegance|leisure|grill|suite|sunset|privacy|min\b)/i;
  const stripTail = (n: string, sep: RegExp): string => {
    const parts = n.split(sep);
    if (parts.length < 2) return n;
    const tail = parts.slice(1).join(" ");
    return AMENITY_TAIL.test(tail) || /^[a-z]/.test(tail.trim()) ? parts[0] : n;
  };
  name = name.split("|")[0];
  name = stripTail(name, /\s+[-–—·]\s+/);
  name = stripTail(name, /\s+I\s+/);
  // Leading bedroom-count noise ("4 Sao Juliao Retreat") — keep real numerals
  // that name the home ("7 Suites & Pool").
  name = name.replace(/^\d+\s+(?!Suites?\b|Bedrooms?\b|Rooms?\b)/, "");
  // Drop "w/ …", "with …" amenity tail
  name = name.replace(/\s+(w\/|with)\s+.*$/i, "");
  // Collapse whitespace
  return name.replace(/\s{2,}/g, " ").trim();
};

export interface NamedProperty {
  slug?: string | null;
  guestyId?: string | null;
  id?: string | number | null;
  name?: string | null;
  title?: string | null;
}

/** The name a guest should see, everywhere: title, og, alt, breadcrumb, SSR, emails. */
export function getDisplayName(prop: NamedProperty | null | undefined): string {
  if (!prop) return "";
  const keys = [prop.slug, prop.guestyId, prop.id == null ? null : String(prop.id)].filter(Boolean) as string[];
  for (const k of keys) {
    const hit = CURATED[k];
    if (hit) return hit;
  }
  return sanitizePropertyName(String(prop.name || prop.title || ""));
}

/** Same lookup when only the raw name is at hand (emails, intents). */
export function displayNameFromRaw(raw: string, slug?: string | null): string {
  if (slug && CURATED[slug]) return CURATED[slug];
  return sanitizePropertyName(raw);
}
