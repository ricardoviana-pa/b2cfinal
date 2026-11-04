import { getGroupByParentGuestyId, isChildUnit } from '@/config/propertyGroups';
import { compareEditorialOperation } from '@shared/editorialHomePriority';
import { matchesCollection, type CollectionFilter } from './collectionFilters';
import { sortProperties } from './utils';
import type { Property } from './types';

/** The collection's capacity is the advertised capacity of each listing.
 * Group parents and their units are alternative bookings, never additive. */
export function selectCollectionHomes(properties: Property[], def: CollectionFilter, guests?: number): Property[] {
  const matching = properties.filter(property => property.isActive !== false && !isChildUnit(property.guestyId))
    .filter(property => matchesCollection(property, def));
  if (def.slug !== 'large-group-villas') return matching;
  const guestCount = typeof guests === 'number' && Number.isInteger(guests) && guests >= 1 && guests <= 100 ? guests : 0;
  const fitting = matching.filter(property => property.maxGuests >= guestCount);
  return sortProperties(fitting, 'recommended').sort(compareEditorialOperation);
}

/** Configured unit options, excluding the whole-property listing itself.
 * This describes the site's booking options, not simultaneous availability. */
export function collectionUnitOptionCount(property: Pick<Property, 'guestyId'>): number {
  const group = getGroupByParentGuestyId(property.guestyId);
  return group ? new Set(group.unitGuestyIds.filter(id => id !== group.parentGuestyId)).size : 0;
}
