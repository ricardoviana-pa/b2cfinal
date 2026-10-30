/**
 * "From €X" of a PARTNER home in the server HTML (verificação em produção,
 * 29 out 2026, Property PP-3).
 *
 * The server seeded the page's "from" price only for our own (Guesty) homes
 * — server/_core/vite.ts buildPrefetch left source "tripwix" out — and the
 * page read the seed by Guesty id only. So on a partner home the booking
 * card said "Price on request · Pick your dates for the exact total" in the
 * server HTML and for 0.4–0.7 s after paint, until the lowestNightly query
 * that only starts after hydration came back: Casa de Caiz (€795) and
 * Beachfront Sintra (€1,135) first claimed to have no price; Villa Arroz (no
 * price) first promised an exact total.
 *
 * Now the server seeds partner homes from the calendar the job stored
 * (services/tripwix.ts getTripwixLowestNightly: memory or one DB read, never
 * a Tripwix call on the request path — tripwix-calendar-store.test.ts pins
 * that), inside the same 250 ms budget, and the page reads the seed by the
 * supplier uid, the listingId its query sends. A null is seeded too, so a
 * home with no price says "on request" at once instead of promising a total.
 *
 * The SSR handler runs end to end on a small fixture build (as in
 * perf-ssr-html.test.ts): the real property store, a fake entry-server that
 * records the prefetch it is given, and the two price stores stubbed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** Casa de Caiz (minimum stay 2) and Villa Arroz, as in client/src/data/tripwix-properties.json. */
const CAIZ = "71776293-1e7f-4eb9-bd2c-d9733621716f";
const ARROZ = "cf01a7c6-8b9a-41d9-8fe9-a31b2b1daa83";

const stores = vi.hoisted(() => ({
  partnerFrom: vi.fn(async (uid: string, _minNights?: number) => (uid === "71776293-1e7f-4eb9-bd2c-d9733621716f" ? 795 : null)),
  guestyBatch: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 150]))),
}));
vi.mock("./services/tripwix", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getTripwixLowestNightly: stores.partnerFrom,
}));
vi.mock("./services/lowest-nightly", () => ({ getLowestNightlyBatch: stores.guestyBatch }));

import { serveStatic } from "./_core/vite";
import { readPdpFromPriceForSsr } from "./lib/ssrFromPrices";
import { pickPdpLowestNightly } from "@/lib/ssrFromPrices";

const ROOT = path.resolve(import.meta.dirname, "..");
type Render = { url: string; prefetch?: Record<string, any> };
const renders = (): Render[] => (globalThis as any).__pp3Renders ?? [];
const renderOf = (url: string) => renders().find((r) => r.url === url);

let base = "";
let server: import("node:http").Server;
let tmp = "";

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-pp3-"));
  const pub = path.join(tmp, "public");
  fs.mkdirSync(pub, { recursive: true });
  fs.mkdirSync(path.join(tmp, "server"), { recursive: true });
  const template = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf8")
    .replace('<script type="module" src="/src/main.tsx"></script>', "");
  fs.writeFileSync(path.join(pub, "index.html"), template);
  fs.writeFileSync(path.join(tmp, "server", "entry-server.js"), `
    globalThis.__pp3Renders = globalThis.__pp3Renders || [];
    export async function render(url, opts) {
      globalThis.__pp3Renders.push({ url, prefetch: opts && opts.prefetch });
      return { appHtml: '<main>rendered ' + url + '</main>', dehydratedState: '{"json":{"queries":[],"mutations":[]}}' };
    }
  `);
  const app = express();
  serveStatic(app, { distPath: pub });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const get = (p: string) => fetch(base + p, { redirect: "manual" });

describe("the server puts the partner home's 'from' into its page", () => {
  it("Casa de Caiz: the stored calendar's price, read by supplier uid with the home's minimum stay", async () => {
    const res = await get("/en/homes/casa-de-caiz");
    expect(res.status).toBe(200);
    expect(renderOf("/en/homes/casa-de-caiz")?.prefetch?.fromPrices?.prices).toEqual({ [CAIZ]: 795 });
    expect(stores.partnerFrom).toHaveBeenCalledWith(CAIZ, 2);
  });

  it("Villa Arroz (nothing priced in its calendar): null is seeded, so the page says 'on request' at once", async () => {
    const res = await get("/en/homes/villa-arroz");
    expect(res.status).toBe(200);
    expect(renderOf("/en/homes/villa-arroz")?.prefetch?.fromPrices?.prices).toEqual({ [ARROZ]: null });
  });

  it("our own homes keep their Guesty seed and never ask the partner store", async () => {
    const props = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/data/properties.json"), "utf8"));
    const home = props.find((p: any) => p.guestyId && p.slug && p.isActive !== false);
    stores.partnerFrom.mockClear();
    const res = await get(`/en/homes/${home.slug}`);
    expect(res.status).toBe(200);
    expect(renderOf(`/en/homes/${home.slug}`)?.prefetch?.fromPrices?.prices).toEqual({ [home.guestyId]: 150 });
    expect(stores.partnerFrom).not.toHaveBeenCalled();
  });
});

describe("readPdpFromPriceForSsr: one home, the right store, the same budget", () => {
  const caiz = { source: "tripwix", supplierUid: CAIZ, minNights: 2, isActive: true };

  it("partner home: the stored calendar's 'from' keyed by uid; none, or a non-price, stays null", async () => {
    const partner = vi.fn(async () => 795);
    expect(await readPdpFromPriceForSsr(caiz, { partner })).toMatchObject({ prices: { [CAIZ]: 795 } });
    expect(partner).toHaveBeenCalledWith(CAIZ, 2);
    expect(await readPdpFromPriceForSsr(caiz, { partner: async () => null })).toMatchObject({ prices: { [CAIZ]: null } });
    expect(await readPdpFromPriceForSsr(caiz, { partner: async () => 0 })).toMatchObject({ prices: { [CAIZ]: null } });
  });

  it("never holds the page up: past the budget, or on an error, the page renders without the seed", async () => {
    const never = () => new Promise<number | null>(() => {});
    expect(await readPdpFromPriceForSsr(caiz, { partner: never }, 30)).toBeUndefined();
    expect(await readPdpFromPriceForSsr(caiz, { partner: async () => { throw new Error("db down"); } })).toBeUndefined();
  });

  it("a partner home without a uid or switched off is left to the query; our homes read lowest-nightly", async () => {
    const partner = vi.fn(async () => 795);
    expect(await readPdpFromPriceForSsr({ source: "tripwix", isActive: true }, { partner })).toBeUndefined();
    expect(await readPdpFromPriceForSsr({ ...caiz, isActive: false }, { partner })).toBeUndefined();
    const guesty = vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 120])));
    expect(await readPdpFromPriceForSsr({ guestyId: "g1" }, { guesty, partner })).toMatchObject({ prices: { g1: 120 } });
    expect(await readPdpFromPriceForSsr(null, { guesty, partner })).toBeUndefined();
    expect(partner).not.toHaveBeenCalled();
  });
});

describe("the page reads the seed by the listing its lowestNightly query sends", () => {
  const seed = { prices: { [CAIZ]: 795, [ARROZ]: null, g1: 120 }, at: 1_000 };

  it("partner home: by supplier uid, in the shape booking.lowestNightly returns for it", () => {
    expect(pickPdpLowestNightly(seed, { tripwixUid: CAIZ })).toEqual({ data: { from: 795, source: "calendar", currency: "EUR" }, updatedAt: 1_000 });
    // No price yet: seeded as none, and stale, so the query asks again after hydration.
    expect(pickPdpLowestNightly(seed, { tripwixUid: ARROZ })).toEqual({ data: { from: null, source: "none", currency: "EUR" }, updatedAt: 0 });
  });

  it("our home: by Guesty id, as before; a home the server did not price falls back to the query", () => {
    expect(pickPdpLowestNightly(seed, { guestyId: "g1" })).toEqual({ data: { from: 120, source: "fallback", currency: "EUR" }, updatedAt: 1_000 });
    expect(pickPdpLowestNightly(seed, { tripwixUid: "not-seeded" })).toBeUndefined();
    expect(pickPdpLowestNightly(seed, {})).toBeUndefined();
    expect(pickPdpLowestNightly(undefined, { tripwixUid: CAIZ })).toBeUndefined();
  });
});
