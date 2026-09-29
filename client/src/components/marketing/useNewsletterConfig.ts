/* ==========================================================================
   newsletter.config. The server render seeds it (server/_core/vite.ts and
   entry-server.tsx, from the env only), so the footer band and the blocks
   are already in the HTML and the first client render reads the same answer
   from the hydrated cache: nothing moves, not even on short pages where the
   footer is on the first screen. The query itself only runs in the browser
   (the server would fetch a relative URL); without SSR (SSR_ENABLED=false or
   a failed render) the surfaces appear after that fetch, as before.
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
