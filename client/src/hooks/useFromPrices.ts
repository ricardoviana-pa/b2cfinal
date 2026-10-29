import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc';
import { SSR_FROM_PRICES_KEY, pickFromPrices, type SsrFromPrices } from '@/lib/ssrFromPrices';

/**
 * "From €X" for a set of Guesty listings (booking.lowestNightlyBatch),
 * starting from the prices the server put into the page (lib/ssrFromPrices.ts):
 * the cards render them in the server HTML and keep them through hydration,
 * and the query only refreshes them once they are older than `staleTime`.
 */
export function useFromPrices(listingIds: string[], opts: { enabled?: boolean; staleTime?: number } = {}) {
  const queryClient = useQueryClient();
  const seeded = pickFromPrices(queryClient.getQueryData<SsrFromPrices>(SSR_FROM_PRICES_KEY), listingIds);
  return trpc.booking.lowestNightlyBatch.useQuery(
    { listingIds },
    {
      enabled: (opts.enabled ?? true) && listingIds.length > 0,
      staleTime: opts.staleTime ?? 5 * 60_000,
      ...(seeded ? { initialData: seeded.data, initialDataUpdatedAt: seeded.updatedAt } : {}),
    },
  );
}
