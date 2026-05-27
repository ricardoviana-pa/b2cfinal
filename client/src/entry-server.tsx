/**
 * SSR entry — renders the React app to an HTML string for a given request.
 *
 * Built separately via `vite build --ssr` into dist/server/entry-server.js.
 * The Express server imports this and calls render() per request when the
 * SSR_ENABLED flag is on; with the flag off the live path is unchanged.
 *
 * i18next is a singleton and therefore unsafe for concurrent SSR with
 * different locales — so every render() builds its OWN i18n instance for the
 * request's locale and provides it via <I18nextProvider>.
 *
 * Phase 3: the Express server passes already-loaded property data via
 * `opts.prefetch`; it is seeded into the react-query cache so data-driven
 * components render real content (not skeletons). The cache is dehydrated
 * and returned so the client can hydrate it without re-fetching.
 */
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'node:stream';
import { QueryClient, QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { createInstance } from 'i18next';
import superjson from 'superjson';
import { trpc } from '@/lib/trpc';
import App from './App';

import en from './i18n/locales/en.json';
import pt from './i18n/locales/pt.json';
import fr from './i18n/locales/fr.json';
import es from './i18n/locales/es.json';
import it from './i18n/locales/it.json';
import fi from './i18n/locales/fi.json';
import de from './i18n/locales/de.json';
import nl from './i18n/locales/nl.json';
import sv from './i18n/locales/sv.json';

const SUPPORTED = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'] as const;
const RESOURCES: Record<string, unknown> = { en, pt, fr, es, it, fi, de, nl, sv };

/** Property data the server has already loaded, to seed the query cache. */
export interface RenderPrefetch {
  /** Result of trpc.properties.listForSite (the full site property list). */
  listForSite?: unknown;
  /** Result of trpc.properties.getBySlugForSite for a single property page. */
  propertyBySlug?: { slug: string; data: unknown };
}

export interface RenderOptions {
  prefetch?: RenderPrefetch;
}

export interface RenderResult {
  /** The rendered app HTML — goes inside <div id="root">. */
  appHtml: string;
  /** superjson-serialised react-query cache for the client to hydrate. */
  dehydratedState: string;
}

function localeFromUrl(url: string): string {
  const seg = url.split('?')[0].split('/').filter(Boolean)[0]?.toLowerCase();
  return (SUPPORTED as readonly string[]).includes(seg ?? '') ? (seg as string) : 'en';
}

async function createI18nForRequest(lng: string) {
  const instance = createInstance();
  await instance.use(initReactI18next).init({
    lng,
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    resources: {
      [lng]: { translation: RESOURCES[lng] },
      ...(lng !== 'en' ? { en: { translation: RESOURCES.en } } : {}),
    },
  });
  return instance;
}

/**
 * Render the app for `url` (a locale-prefixed path, e.g. "/pt/homes").
 * Resolves once every Suspense boundary — including lazy route chunks — has
 * settled, so the returned HTML is complete.
 */
export async function render(url: string, opts?: RenderOptions): Promise<RenderResult> {
  const i18n = await createI18nForRequest(localeFromUrl(url));
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // Seed the query cache with server-loaded data so trpc useQuery() calls
  // render real content. getQueryKey produces the exact key the client hooks
  // use, so the dehydrated state hydrates cleanly with no key mismatch.
  const pf = opts?.prefetch;
  if (pf?.listForSite !== undefined) {
    queryClient.setQueryData(
      getQueryKey(trpc.properties.listForSite, undefined, 'query'),
      pf.listForSite,
    );
  }
  if (pf?.propertyBySlug) {
    queryClient.setQueryData(
      getQueryKey(trpc.properties.getBySlugForSite, { slug: pf.propertyBySlug.slug }, 'query'),
      pf.propertyBySlug.data,
    );
  }

  return new Promise<RenderResult>((resolve, reject) => {
    const trpcClient = trpc.createClient({
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    });

    let html = '';
    const sink = new Writable({
      write(chunk, _enc, cb) { html += chunk.toString(); cb(); },
    });
    sink.on('finish', () => {
      resolve({
        appHtml: html,
        dehydratedState: superjson.stringify(dehydrate(queryClient)),
      });
    });
    sink.on('error', reject);

    let didError = false;
    const { pipe, abort } = renderToPipeableStream(
      <I18nextProvider i18n={i18n}>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <App ssrLocation={url} />
          </QueryClientProvider>
        </trpc.Provider>
      </I18nextProvider>,
      {
        onAllReady() {
          if (!didError) pipe(sink);
        },
        onError(err) {
          didError = true;
          reject(err);
        },
      },
    );

    setTimeout(() => abort(), 10_000);
  });
}
