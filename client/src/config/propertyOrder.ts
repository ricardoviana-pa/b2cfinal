/**
 * Curated property ordering for the PLP (Task 2).
 *
 * The "Recommended" sort places these listings at the top of the grid in
 * the exact order below, then falls back to the standard secondary rule
 * (sortOrder asc) for everything not on the list. Effect: hand-pick the
 * lead properties without having to maintain a full 1-to-N ranking.
 *
 * Identifiers are Guesty listingIds. For multi-unit groups, use the
 * PARENT id (the same one in PROPERTY_GROUPS) — the group card represents
 * the whole cluster on the PLP.
 *
 * To reorder: edit the array, commit, push. No deploy beyond Render's
 * usual auto-rebuild.
 *
 * To remove a property from the top tier: delete its line — it falls
 * to the secondary rule like the others.
 */

export const CURATED_PROPERTY_ORDER: string[] = [
  // Multi-unit groups — premium estates with curated unit mix.
  '6965339dbf04fe0013743e2d', // Fountain Retreat (Viana do Castelo)
  '6965335cbf04fe00137431cb', // Lima River Houses (Viana do Castelo)
  '69c415ceab80a8001247452c', // Riverside Watermill (Caminha)
  '696533d34b583900135cfd96', // Quinta de Parada do Vez (Arcos de Valdevez)
  // Add single-property lead picks below — keep the array compact (≤10 entries).
  // Example:  '<guestyId>', // <property name>
];

const positionByGuestyId = new Map<string, number>(
  CURATED_PROPERTY_ORDER.map((id, i) => [id, i]),
);

/** Position in the curated list (lower = higher up), or +Infinity if not curated. */
export function curatedPosition(guestyId: string | undefined): number {
  if (!guestyId) return Number.POSITIVE_INFINITY;
  const p = positionByGuestyId.get(guestyId);
  return p === undefined ? Number.POSITIVE_INFINITY : p;
}

/** True when this Guesty id is in the curated top list. */
export function isCurated(guestyId: string | undefined): boolean {
  return !!guestyId && positionByGuestyId.has(guestyId);
}
