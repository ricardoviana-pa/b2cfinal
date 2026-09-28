/* ==========================================================================
   newsletter.config, client only. The server render has no config (and would
   fetch a relative URL), so every capture surface renders nothing on the
   server and on the first client render, then appears after hydration. The
   surfaces sit below the fold (or are fixed), so nothing visible moves.
   ========================================================================== */

import { useEffect, useState } from 'react';
import { trpc } from '@/lib/trpc';

export function useNewsletterConfig() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return trpc.newsletter.config.useQuery(undefined, {
    enabled: mounted,
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
