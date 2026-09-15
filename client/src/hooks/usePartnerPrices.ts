import { useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import type { Property } from '@/lib/types';

export function usePartnerPrices(properties: Property[], dates?: { checkIn: string; checkOut: string; guests: number }) {
  const uids = useMemo(() => [...new Set(properties.filter(p => p.source === 'tripwix' && p.supplierUid).map(p => p.supplierUid!))].sort(), [properties]);
  const hasDates = !!dates?.checkIn && !!dates?.checkOut && dates.checkOut > dates.checkIn;
  const query = trpc.booking.partnerPrices.useQuery(
    { uids, ...(hasDates ? dates : {}) },
    { enabled: uids.length > 0, staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false },
  );
  const prices = useMemo(() => Object.fromEntries(Object.entries(query.data ?? {}).map(([uid, r]) => [uid, r.from])), [query.data]);
  const quotes = useMemo(() => Object.fromEntries(properties.filter(p => p.supplierUid && query.data?.[p.supplierUid]?.quote).map(p => {
    const q = query.data![p.supplierUid!]!.quote!;
    return [p.slug, { total: q.total, nightlyRate: q.accommodation / q.nights, cleaningFee: q.cleaningFee,
      nights: q.nights, available: q.available, source: 'partner_calendar', feesKnown: q.feesKnown }];
  })), [query.data, properties]);
  return { prices, quotes, isFetching: query.isFetching, isError: query.isError };
}
