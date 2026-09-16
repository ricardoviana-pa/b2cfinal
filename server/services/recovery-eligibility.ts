import type { BookingIntent } from '../../drizzle/schema';
import { listIntentsForRecoveryStay } from '../db';
import { guestyClient } from '../lib/guesty';

type StayIntent = Pick<BookingIntent, 'id' | 'status' | 'reservationId' | 'createdAt' | 'recoveryOptout'>;

/** A guest can open several checkouts for the same stay. Remind only the latest. */
export function isLatestUnbookedIntent(id: string, siblings: StayIntent[]): boolean {
  if (!siblings.length || siblings.some(r => r.status === 'paid' || !!r.reservationId || r.recoveryOptout)) return false;
  const latest = [...siblings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))[0];
  return latest.id === id && ['draft', 'contact_captured', 'payment_pending'].includes(latest.status);
}

/** No reminder when the stay was booked elsewhere or availability cannot be checked. */
export async function canRemindRecoveryStay(intent: BookingIntent): Promise<boolean> {
  if (!intent.email || !intent.listingId || !intent.checkIn || !intent.checkOut) return false;
  if (!isLatestUnbookedIntent(intent.id, await listIntentsForRecoveryStay(intent))) return false;
  const result = await guestyClient.request<any>('GET', '/v1/reservations', {
    query: {
      filters: JSON.stringify([
        { field: 'listingId', operator: '$eq', value: intent.listingId },
        { field: 'checkInDateLocalized', operator: '$lt', value: intent.checkOut },
        { field: 'checkOutDateLocalized', operator: '$gt', value: intent.checkIn },
        { field: 'status', operator: '$in', value: ['confirmed', 'reserved'] },
      ]),
      fields: '_id status listingId checkInDateLocalized checkOutDateLocalized',
      limit: 1, skip: 0,
    },
  });
  if (!Array.isArray(result?.results)) throw new Error('Unable to verify recovery availability');
  // Any overlapping reservation suppresses the reminder. A stale price email is
  // not useful if a concierge or a different sales channel booked these dates.
  return result.results.length === 0;
}
