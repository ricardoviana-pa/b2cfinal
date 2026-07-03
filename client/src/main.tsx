import "./i18n/index";
import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider, hydrate } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot, hydrateRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

// Sensible caching defaults. Without these, staleTime=0 makes every query
// refetch on mount AND on window-focus — so the 149 KB property list
// (listForSite, used on Home, Homes, PDP, destinations, 404) was re-fetched on
// every navigation and every tab-focus. Site content is edge-cached and only
// changes ~twice a day, so a short client staleTime + no focus-refetch cuts a
// lot of redundant network without risking stale prices (quote queries are
// keyed by dates and stay fresh within the window).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 min
      gcTime: 30 * 60 * 1000,   // 30 min
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// SSR hydration: when the server pre-rendered with data, it embedded the
// dehydrated react-query cache as window.__RQ_STATE__. Hydrating it before
// the first render means useQuery() has the data immediately — the client's
// first render matches the server markup (no hydration mismatch, no flash).
{
  const ssrState = (window as unknown as { __RQ_STATE__?: string }).__RQ_STATE__;
  if (ssrState) {
    try {
      hydrate(queryClient, superjson.parse(ssrState));
    } catch (err) {
      console.warn("[hydrate] failed to restore SSR query state:", err);
    }
  }
}

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    // Skip noisy booking availability errors (handled in components)
    const msg = (error as any)?.message ?? "";
    const isBookingAvailabilityError =
      msg.includes("advance notice") ||
      msg.includes("minimum stay") ||
      msg.includes("not available") ||
      msg.includes("LISTING_IS_NOT_AVAILABLE");
    if (!isBookingAvailabilityError) {
      console.error("[API Mutation Error]", error);
    }
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 90_000);
        return globalThis
          .fetch(input, {
            ...(init ?? {}),
            credentials: "include",
            signal: ac.signal,
          })
          .finally(() => clearTimeout(timer));
      },
    }),
  ],
});

const rootEl = document.getElementById("root")!;
const tree = (
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);

// Adaptive mount: if the server sent SSR'd markup, hydrate it; otherwise
// (CSR / SSR disabled) client-render. This lets the SSR_ENABLED server flag
// be toggled freely without ever needing a matching client change.
if (rootEl.hasChildNodes()) {
  hydrateRoot(rootEl, tree, {
    onRecoverableError: (error) => {
      // Hydration mismatches surface here. Record them for diagnostics and
      // still log so they are visible during SSR validation.
      const w = window as unknown as { __HYDRATION_ERRORS__?: string[] };
      (w.__HYDRATION_ERRORS__ ||= []).push(
        String((error as { message?: string })?.message ?? error),
      );
      console.error("[hydration]", error);
    },
  });
} else {
  createRoot(rootEl).render(tree);
}
