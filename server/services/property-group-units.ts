import { getGroupByParentGuestyId } from '../../client/src/config/propertyGroups';
import { catalogProperties, getPropertiesForSite } from './properties-store';
import { toCatalogCard } from './property-catalog';

export function groupUnitCards(parentGuestyId: string, properties: Record<string, any>[]) {
  const group = getGroupByParentGuestyId(parentGuestyId);
  if (!group) return [];
  const byId = new Map(catalogProperties(properties)
    .filter(property => property.isActive !== false)
    .map(property => [property.guestyId, property]));
  return group.unitGuestyIds.flatMap(id => {
    const property = byId.get(id);
    return property ? [toCatalogCard(property)] : [];
  });
}

/** Only the group's public cards; never embed the full catalogue in a PDP. */
export async function getPropertyGroupUnits(parentGuestyId: string) {
  if (!getGroupByParentGuestyId(parentGuestyId)) return [];
  return groupUnitCards(parentGuestyId, await getPropertiesForSite());
}
