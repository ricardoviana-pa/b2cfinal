/**
 * Multi-unit property groups (Task 3 — booking.com-style grouping).
 *
 * Some physical properties (Fountain Retreat, Watermill, …) are sold as
 * multiple Guesty listings — one per bookable unit plus one for the whole
 * property. On the PLP we want to show ONE card per property; the PDP of
 * the parent listing then exposes every unit with its own gallery, specs,
 * and live quote.
 *
 * Manual map (Caso B). The Guesty Open API doesn't reliably surface a
 * parent/child relationship across all tenants, so we curate the groups
 * here. Add the audit script (scripts/multiunit-investigate.ts) if you
 * need to verify whether Guesty has started exposing complexId/etc.
 *
 * Update rule: when the cowork creates or removes a unit in Guesty, the
 * corresponding listing here must be updated. The configured guestyIds
 * are the canonical reference.
 */

export interface PropertyGroup {
  /** Display name on the PLP group card. */
  name: string;
  /** Guesty listing id of the "parent" — the whole-property listing whose
   *  slug becomes the group PDP URL. Must be the first entry in unitGuestyIds. */
  parentGuestyId: string;
  /** All units in display order. Includes the parent. */
  unitGuestyIds: string[];
}

export const PROPERTY_GROUPS: PropertyGroup[] = [
  {
    name: 'Fountain Retreat',
    parentGuestyId: '6965339dbf04fe0013743e2d', // Fountain Retreat I Pool & Sports Escape (12br)
    unitGuestyIds: [
      '6965339dbf04fe0013743e2d', // parent — whole property
      '6965339bbf04fe0013743cd8', // Senhorial House with Jacuzzi (7br)
      '69653398bf04fe0013743b98', // Roses House (2br)
      '6965339404b96f00147f571a', // Buganvílias House (1br)
      '69653394ecf7490014ed2ed9', // Fountain Cottage (1br)
      '696533a0ecf7490014ed31d5', // Garden House (1br)
    ],
  },
  {
    name: 'Lima River Houses',
    parentGuestyId: '6965335cbf04fe00137431cb', // Lima River Houses by Portugal Active (8br)
    unitGuestyIds: [
      '6965335cbf04fe00137431cb', // parent
      '696533714b583900135cef22', // S. Salvador House (6br)
      '696533616cff760015e28802', // S. Silvestre House (2br)
    ],
  },
  {
    name: 'Quinta de Parada do Vez',
    parentGuestyId: '696533d34b583900135cfd96', // Luxury and Nature Retreat (9br)
    unitGuestyIds: [
      '696533d34b583900135cfd96', // parent
      '696533d8753fb0001424b10d', // The Nature Princess (2br)
    ],
  },
  {
    name: 'Riverside Watermill',
    parentGuestyId: '69c415ceab80a8001247452c', // Historic Riverfront Watermill (9br)
    unitGuestyIds: [
      '69c415ceab80a8001247452c', // parent
      '69c415701b964f00157188ad', // Riverside Watermill House (4br)
      '69c418871eabf900141bed48', // U2 Loft at the Riverside Watermill (9br)
      '69c415701b964f00157188b5', // River Beach Suite · Joe Cocker (2br)
      '69c415701b964f00157188bd', // River Beach Loft · Bob Dylan (1br)
    ],
  },
];

const parentGuestyIds = new Set(PROPERTY_GROUPS.map((g) => g.parentGuestyId));

const childToParent = new Map<string, string>();
const parentToGroup = new Map<string, PropertyGroup>();
for (const g of PROPERTY_GROUPS) {
  parentToGroup.set(g.parentGuestyId, g);
  for (const u of g.unitGuestyIds) {
    if (u !== g.parentGuestyId) childToParent.set(u, g.parentGuestyId);
  }
}

/** True when this Guesty id is a CHILD unit of a group (not its parent).
 *  PLP should hide these — they show up inside the parent's PDP. */
export function isChildUnit(guestyId: string | undefined): boolean {
  return !!guestyId && childToParent.has(guestyId);
}

/** True when this Guesty id is the parent of a group. The PLP should
 *  render its card with the group treatment ("X units"); its PDP gets
 *  the Units section. */
export function isGroupParent(guestyId: string | undefined): boolean {
  return !!guestyId && parentGuestyIds.has(guestyId);
}

/** Returns the group whose parent has this guestyId, or null. */
export function getGroupByParentGuestyId(guestyId: string | undefined): PropertyGroup | null {
  if (!guestyId) return null;
  return parentToGroup.get(guestyId) ?? null;
}

/** Number of units in the group whose parent has this id, or 1 if not a group. */
export function getGroupUnitCount(guestyId: string | undefined): number {
  return getGroupByParentGuestyId(guestyId)?.unitGuestyIds.length ?? 1;
}
