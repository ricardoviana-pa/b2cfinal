import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { propertiesRouter } from "./routers/properties";
import { __testing, filterPublicProperties, getPropertiesForSite } from "./services/properties-store";

const retired = [
  { guestyId: "6965338ed1c09900156e8502", slug: "calejo-house-pool-sports-grill-retreat-6e8502" },
  { guestyId: "696533794fe6a100145fe4bf", slug: "ocean-bliss-beach-bbq-apartment-5fe4bf" },
  { guestyId: "6a3a63f9e19cb0001db6a05e", slug: "saltwind-studio-by-portugal-active-b6a05e" },
];
// A different policy: these homes retain their public pages but stay off lists.
const stillHiddenIds = [
  "696532fa6d209c001510d5ee", "696533762def930014e917bf", "696533616cff760015e28965",
  "6a341163c50f210012f12b80", "6a0359b4e343150013abc14d", "696533752def930014e9167c",
  "6965332c6d209c001510e1c1", "696532f3753fb0001424a570", "696533af4fe6a100145fecb6",
  "69ca869e5b0a0500158b7d5a", "6965333104b96f00147f5428", "6965335df1c3a8001597c8e4",
  "6965337d2def930014e919c6",
];
const home = (guestyId: string, slug: string) => ({
  guestyId, slug, name: slug, isActive: true, basePrice: 200,
  images: ["https://assets.guesty.com/image/upload/synthetic.jpg"],
});
const visible = home("synthetic-active-home", "active-home");
const hidden = stillHiddenIds.map((id, i) => home(id, `hidden-home-${i}`));

let dir: string;
let previousPaths: ReturnType<typeof __testing.setPaths>;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pa-retired-properties-"));
  previousPaths = __testing.setPaths({
    sync: join(dir, "sync.json"), fallback: join(dir, "fallback.json"),
    tripwix: join(dir, "tripwix.json"), destinations: join(dir, "destinations.json"),
  });
});
afterEach(() => {
  __testing.setPaths(previousPaths);
  rmSync(dir, { recursive: true, force: true });
});

describe("confirmed retired homes cannot return to the public site", () => {
  it.each(["sync", "fallback"])("filters active reintroductions from %s before public lists, PDP lookup and sitemap data", async (source) => {
    const expectedPublicSlugs = [...hidden, visible].map(p => p.slug);
    writeFileSync(join(dir, `${source}.json`), JSON.stringify([...hidden, visible]));
    expect((await getPropertiesForSite()).map(p => p.slug)).toEqual(expectedPublicSlugs);
    // A later rewrite must still exclude retired homes, even with a warm cache.
    writeFileSync(join(dir, `${source}.json`), JSON.stringify([
      ...retired.map(p => home(p.guestyId, p.slug)), ...hidden, visible,
    ]));
    const caller = propertiesRouter.createCaller({ user: null, req: {}, res: { setHeader() {} } } as any);

    // The sitemap and SSR use this store directly; it must exclude retired
    // homes without excluding the 13 homes that still retain public pages.
    expect((await getPropertiesForSite()).map(p => p.slug)).toEqual(expectedPublicSlugs);
    expect((await caller.listForSite()).map(p => p.slug)).toEqual(expectedPublicSlugs);
    expect((await caller.catalogForSite()).map(p => p.slug)).toEqual([visible.slug]);
    for (const p of retired) expect(await caller.getBySlugForSite({ slug: p.slug })).toBeNull();
    for (const p of [...hidden, visible]) {
      expect(await caller.getBySlugForSite({ slug: p.slug })).toMatchObject({ guestyId: p.guestyId });
    }
  });

  it("keeps the retirement guard after renaming, including the legacy listingId field", () => {
    const renamed = retired.flatMap((p, i) => [
      home(p.guestyId, `renamed-${i}`),
      { ...home(p.guestyId, `legacy-renamed-${i}`), guestyId: undefined, listingId: p.guestyId },
    ]);
    expect(filterPublicProperties([...renamed, visible]).map(p => p.slug)).toEqual([visible.slug]);
  });
});
