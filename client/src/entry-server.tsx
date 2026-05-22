/**
 * SSR entry — renders the React app to an HTML string for a given request.
 *
 * Built separately via `vite build --ssr` into dist/server/entry-server.js.
 * The Express server imports this and calls render() per request when the
 * SSR_ENABLED flag is on; with the flag off the live path is unchanged.
 *
 * i18next is a singleton and therefore unsafe for concurrent SSR with
 * different locales — so every render() builds its OWN i18n instance for the
 * request's locale and provides it via <I18nextProvider>. The browser keeps
 * using the singleton (client/src/i18n/index.ts); both resolve the same
 * locale from the same URL, so the hydration markup matches.
 */
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'node:stream';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

export interface RenderResult {
  /** The rendered app HTML — goes inside <div id="root">. */
  appHtml: string;
}

/** First path segment, lower-cased, if it is a supported locale; else 'en'. */
function localeFromUrl(url: string): string {
  const seg = url.split('?')[0].split('/').filter(Boolean)[0]?.toLowerCase();
  return (SUPPORTED as readonly string[]).includes(seg ?? '') ? (seg as string) : 'en';
}

/** Fresh i18n instance for one request, initialised with that request's locale. */
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
export async function render(url: string): Promise<RenderResult> {
  const i18n = await createI18nForRequest(localeFromUrl(url));

  return new Promise<RenderResult>((resolve, reject) => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
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
