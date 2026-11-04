/** Commercial selection for editorial recommendations (Ricardo, 4 Nov 2026).
 * Keep the requested location relevant, then lead with the direct operation.
 * Supplier identity is an internal ranking signal, never a guest-facing label.
 */
export interface EditorialHomeSource {
  guestyId?: string | null;
  source?: string | null;
  supplierUid?: string | null;
}

export function compareEditorialOperation(a: EditorialHomeSource, b: EditorialHomeSource): number {
  const direct = (p: EditorialHomeSource) => Boolean(p.guestyId) && p.source !== 'tripwix' && !p.supplierUid;
  return Number(direct(b)) - Number(direct(a));
}
