/**
 * performance-05-origin-ssr-reparse: the property catalogue is parsed once per
 * version of the files on disk, not on every getPropertiesForSite() call, and
 * a rewrite of the sync file (or a toggle of TRIPWIX_INVENTORY) is picked up on
 * the next call.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { __testing, getPropertiesForDestination, getPropertiesForSite, getSiteLocalities } from "./services/properties-store";

const home = (slug: string, extra: Record<string, unknown> = {}) => ({
  id: slug,
  slug,
  name: slug,
  guestyId: `g-${slug}`,
  isActive: true,
  locality: "Ponte de Lima",
  destination: "minho",
  images: ["https://assets.guesty.com/image/upload/x.jpg"],
  ...extra,
});

let dir: string;
let prev: ReturnType<typeof __testing.setPaths>;
const files = () => ({
  sync: join(dir, "properties-synced.json"),
  fallback: join(dir, "properties.json"),
  tripwix: join(dir, "tripwix-properties.json"),
  destinations: join(dir, "destinations.json"),
});
const write = (path: string, data: unknown, mtimeSec?: number) => {
  writeFileSync(path, JSON.stringify(data));
  if (mtimeSec) utimesSync(path, mtimeSec, mtimeSec);
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "pa-store-"));
  prev = __testing.setPaths(files());
});
afterAll(() => {
  __testing.setPaths(prev);
  __testing.reset();
  rmSync(dir, { recursive: true, force: true });
});
afterEach(() => {
  delete process.env.TRIPWIX_INVENTORY;
});

describe("properties store cache", () => {
  it("parses the files once and serves later calls from memory", async () => {
    write(files().fallback, [home("a"), home("b")], 1_700_000_000);
    write(files().tripwix, [], 1_700_000_000);
    __testing.reset();
    const first = await getPropertiesForSite();
    const second = await getPropertiesForSite();
    await Promise.all([getPropertiesForSite(), getPropertiesForSite(), getPropertiesForSite()]);
    expect(first.map((p) => p.slug)).toEqual(["a", "b"]);
    expect(second.map((p) => p.slug)).toEqual(["a", "b"]);
    expect(__testing.loadCount()).toBe(1);
  });

  it("concurrent first calls share one read", async () => {
    write(files().fallback, [home("c")], 1_700_000_100);
    __testing.reset();
    const results = await Promise.all(Array.from({ length: 8 }, () => getPropertiesForSite()));
    expect(results.every((r) => r.length === 1 && r[0].slug === "c")).toBe(true);
    expect(__testing.loadCount()).toBe(1);
  });

  it("each call gets its own array, so a caller cannot reorder another's list", async () => {
    write(files().fallback, [home("a"), home("b")], 1_700_000_200);
    __testing.reset();
    const mine = await getPropertiesForSite();
    mine.reverse();
    mine.push(home("zzz"));
    const theirs = await getPropertiesForSite();
    expect(theirs.map((p) => p.slug)).toEqual(["a", "b"]);
  });

  it("reloads when the sync job rewrites its file", async () => {
    write(files().fallback, [home("fallback-only")], 1_700_000_300);
    __testing.reset();
    expect((await getPropertiesForSite()).map((p) => p.slug)).toEqual(["fallback-only"]);

    // The runtime sync file appears (it wins over the static fallback)…
    write(files().sync, [home("synced-1")], 1_700_000_400);
    expect((await getPropertiesForSite()).map((p) => p.slug)).toEqual(["synced-1"]);
    // …and is rewritten by the next sync run.
    write(files().sync, [home("synced-1"), home("synced-2")], 1_700_000_500);
    expect((await getPropertiesForSite()).map((p) => p.slug)).toEqual(["synced-1", "synced-2"]);
    expect(__testing.loadCount()).toBe(3);
    rmSync(files().sync);
  });

  it("follows the TRIPWIX_INVENTORY kill switch without a restart", async () => {
    write(files().fallback, [home("own")], 1_700_000_600);
    write(files().tripwix, [home("partner", { source: "tripwix", supplierUid: "11111111-1111-4111-8111-111111111111", guestyId: undefined })], 1_700_000_600);
    __testing.reset();
    expect((await getPropertiesForSite()).map((p) => p.slug)).toEqual(["own", "partner"]);
    process.env.TRIPWIX_INVENTORY = "0";
    expect((await getPropertiesForSite()).map((p) => p.slug)).toEqual(["own"]);
    delete process.env.TRIPWIX_INVENTORY;
    expect((await getPropertiesForSite()).map((p) => p.slug)).toEqual(["own", "partner"]);
  });

  it("destinations.json is read once per version too, for localities and destination pages", async () => {
    write(files().fallback, [home("a"), home("b", { locality: "Viana do Castelo" })], 1_700_000_700);
    write(files().tripwix, [], 1_700_000_700);
    write(files().destinations, [{ slug: "minho", name: "Minho", region: "minho", sortOrder: 1 }], 1_700_000_700);
    __testing.reset();
    const localities = await getSiteLocalities();
    expect(localities.map((l) => l.value)).toEqual(["ponte-de-lima", "viana-do-castelo"]);
    expect(localities[0]).toMatchObject({ group: "Minho", groupSlug: "minho" });
    expect((await getPropertiesForDestination("minho")).map((p) => p.slug)).toEqual(["a", "b"]);

    write(files().destinations, [{ slug: "minho", name: "Norte", region: "minho", sortOrder: 1 }], 1_700_000_800);
    expect((await getSiteLocalities())[0]).toMatchObject({ group: "Norte" });
    expect(__testing.loadCount()).toBe(1);
  });
});
