/**
 * performance-09-from-price-latency: the "from" prices the server seeds
 * (SSR_FROM_PRICES_KEY) are rendered into the server HTML by the same hook the
 * pages use, travel in the dehydrated cache, and the client's first render
 * has them without a request — while a seed with a missing price is marked
 * stale so the query refreshes it after hydration.
 */
import { Writable } from "node:stream";
import React from "react";
import { renderToPipeableStream } from "react-dom/server";
import { QueryClient, QueryClientProvider, dehydrate, hydrate } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { describe, expect, it, vi } from "vitest";
import { trpc } from "../client/src/lib/trpc";
import { useFromPrices } from "../client/src/hooks/useFromPrices";
import { SSR_FROM_PRICES_KEY } from "../client/src/lib/ssrFromPrices";

(globalThis as any).React = React;

function Prices({ ids }: { ids: string[] }) {
  const { data } = useFromPrices(ids);
  return React.createElement("p", null, ids.map((id) => `${id}:${data?.[id] ?? "—"}`).join(" "));
}

function render(queryClient: QueryClient, ids: string[]): Promise<string> {
  const fetchSpy = vi.fn(async () => { throw new Error("no network on the server"); });
  const client = trpc.createClient({ links: [httpBatchLink({ url: "http://x/api/trpc", transformer: superjson, fetch: fetchSpy as any })] });
  const tree = React.createElement(trpc.Provider, { client, queryClient },
    React.createElement(QueryClientProvider, { client: queryClient }, React.createElement(Prices, { ids })));
  return new Promise((resolve, reject) => {
    let html = "";
    const sink = new Writable({ write(c, _e, cb) { html += c.toString(); cb(); } });
    sink.on("finish", () => { expect(fetchSpy).not.toHaveBeenCalled(); resolve(html); });
    const { pipe } = renderToPipeableStream(tree, { onAllReady: () => pipe(sink), onError: reject });
  });
}

describe("from prices through SSR and hydration", () => {
  it("the server HTML shows the seeded prices, and the dehydrated cache carries them for the page's exact query", async () => {
    const server = new QueryClient();
    const at = Date.now() - 30_000;
    server.setQueryData(SSR_FROM_PRICES_KEY, { prices: { g1: 120, g2: 340, g3: 99 }, at }, { updatedAt: at });
    const html = await render(server, ["g2", "g1"]);
    expect(html).toContain("g2:340 g1:120");

    const state = superjson.parse<any>(superjson.stringify(dehydrate(server)));
    const client = new QueryClient();
    hydrate(client, state);
    const key = getQueryKey(trpc.booking.lowestNightlyBatch, { listingIds: ["g2", "g1"] }, "query");
    expect(client.getQueryData(key)).toEqual({ g2: 340, g1: 120 });
    // Fresh for the page's 5-minute staleTime: no request on mount.
    expect(client.getQueryState(key)?.dataUpdatedAt).toBe(at);
  });

  it("a home with no price yet: rendered without one, and stale so the browser asks again", async () => {
    const server = new QueryClient();
    server.setQueryData(SSR_FROM_PRICES_KEY, { prices: { g1: 120, g9: null }, at: Date.now() });
    const html = await render(server, ["g1", "g9"]);
    expect(html).toContain("g1:120 g9:—");
    const key = getQueryKey(trpc.booking.lowestNightlyBatch, { listingIds: ["g1", "g9"] }, "query");
    expect(server.getQueryState(key)?.dataUpdatedAt).toBe(0);
  });

  it("without a seed nothing changes: no price in the HTML, the query fetches as before", async () => {
    const server = new QueryClient();
    const html = await render(server, ["g1"]);
    expect(html).toContain("g1:—");
    const key = getQueryKey(trpc.booking.lowestNightlyBatch, { listingIds: ["g1"] }, "query");
    expect(server.getQueryData(key)).toBeUndefined();
  });
});
