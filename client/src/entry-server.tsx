/**
 * SSR entry — renders the React app to an HTML string for a given request.
 *
 * Built separately via `vite build --ssr` into dist/server/entry-server.js.
 * From Phase 2 the Express server imports this and calls render() per request;
 * in Phase 1 it is built and verified in isolation without touching the live
 * (CSR) serving path.
 */
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'node:stream';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import App from './App';
import './i18n/index';

export interface RenderResult {
  /** The rendered app HTML — goes inside <div id="root">. */
  appHtml: string;
}

/**
 * Render the app for `url` (a locale-prefixed path, e.g. "/en/homes").
 * The promise resolves once every Suspense boundary — including the lazy
 * route chunks — has settled, so the returned HTML is complete.
 *
 * Phase 1 note: no tRPC data is prefetched, so data-driven sections render
 * their loading state; static content renders fully. Phase 3 adds prefetch.
 */
export function render(url: string): Promise<RenderResult> {
  return new Promise((resolve, reject) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    // The Provider requires a client even though no queries run during SSR yet.
    const trpcClient = trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    });

    let html = '';
    const sink = new Writable({
      write(chunk, _enc, cb) { html += chunk.toString(); cb(); },
    });
    sink.on('finish', () => resolve({ appHtml: html }));
    sink.on('error', reject);

    let didError = false;
    const { pipe, abort } = renderToPipeableStream(
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <App ssrLocation={url} />
        </QueryClientProvider>
      </trpc.Provider>,
      {
        // onAllReady (not onShellReady) — wait for lazy routes + Suspense to
        // settle so we get the complete document, not streamed placeholders.
        onAllReady() {
          if (!didError) pipe(sink);
        },
        onError(err) {
          didError = true;
          reject(err);
        },
      },
    );

    // Safety net: never let a stuck render hang the request.
    setTimeout(() => abort(), 10_000);
  });
}
