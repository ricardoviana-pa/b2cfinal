import { editorialTripContext } from '@shared/editorialTripContext';
import { cleanValue, CLICK_ID_KEYS, REMOVED, UTM_KEYS } from '@shared/visit-origin';

/** The current stay, safe to put in a link. An unfinished range is not a stay. */
export function publicPropertyTrip(selection: { checkIn?: string; checkOut?: string; guests?: number }) {
  const params = new URLSearchParams();
  if (selection.checkIn) params.set('checkin', selection.checkIn);
  if (selection.checkOut) params.set('checkout', selection.checkOut);
  if (selection.guests !== undefined) params.set('guests', String(selection.guests));
  return editorialTripContext(params.toString());
}

/** Replace only this PDP's URL after a stay edit, so reload/language switching
 * retains it. Existing safe campaign labels stay; no storage or tracking is added. */
export function propertyTripReplacement(
  location: { pathname: string; search: string; hash: string },
  slug: string,
  trip: ReturnType<typeof publicPropertyTrip>,
): string | null {
  const match = location.pathname.match(/^\/(?:en\/|pt\/|fr\/|es\/|it\/|fi\/|de\/|nl\/|sv\/)?homes\/([^/]+)\/?$/);
  if (match?.[1] !== slug) return null;
  const original = editorialTripContext(location.search);
  // The widget starts at two guests when none were chosen. Opening a home
  // must not rewrite its landing URL or manufacture a planning action.
  if (original.checkin === trip.checkin && original.checkout === trip.checkout &&
      (original.guests ?? 2) === (trip.guests ?? 2)) return null;
  const params = new URLSearchParams();
  if (trip.checkin && trip.checkout) {
    params.set('checkin', trip.checkin);
    params.set('checkout', trip.checkout);
  }
  if (trip.guests !== undefined) params.set('guests', String(trip.guests));
  // The visit origin is captured before render, but a late-loading analytics
  // tag can still need the entry campaign. Keep its known, non-personal
  // labels on this URL; never forward arbitrary queries or access tokens.
  const source = new URLSearchParams(location.search);
  for (const key of UTM_KEYS) {
    const value = cleanValue(source.get(key));
    if (value && value !== REMOVED) params.set(key, value);
  }
  // Keep supported click identifiers already present on the landing URL.
  // This is not collection: they are never added to outgoing home links,
  // storage or analytics here, and the existing consent gates still apply.
  for (const key of CLICK_ID_KEYS) {
    const value = source.get(key);
    if (value && /^[A-Za-z0-9_.~-]{1,512}$/.test(value)) params.set(key, value);
  }
  return `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`;
}
