import { describe, it, expect } from "vitest";
import { pickRelatedHomes } from "./related-homes";

const home = (slug: string, destination: string, over: Record<string, unknown> = {}) => ({
  slug, destination, name: slug, guestyId: `id-${slug}`, sortOrder: 50,
  images: [`${slug}.jpg`], bedrooms: 3, maxGuests: 6, priceFrom: 200, currency: "EUR",
  ...over,
});

const POOL = [
  home("minho-a", "minho"),
  home("minho-b", "minho", { sortOrder: 10 }),
  home("porto-a", "porto"),
  home("lisbon-a", "lisbon"),
];

describe("pickRelatedHomes", () => {
  it("maps the editorial tag to the commercial destination", () => {
    // 23 of the 39 articles are tagged minho-coast; homes are tagged minho.
    const r = pickRelatedHomes(POOL, "minho-coast");
    expect(r.map(h => h.slug).sort()).toEqual(["minho-a", "minho-b"]);
  });

  it("orders by the listing's own order within a destination", () => {
    expect(pickRelatedHomes(POOL, "minho")[0].slug).toBe("minho-b");
  });

  it("falls back to the curated pool when the region has no homes", () => {
    // There is an article tagged algarve and no Algarve inventory.
    const r = pickRelatedHomes(POOL, "algarve");
    expect(r.length).toBeGreaterThan(0);
  });

  it("falls back when the article carries no region", () => {
    expect(pickRelatedHomes(POOL, null).length).toBeGreaterThan(0);
    expect(pickRelatedHomes(POOL, "portugal").length).toBeGreaterThan(0);
  });

  it("respects the limit", () => {
    expect(pickRelatedHomes(POOL, "portugal", 2)).toHaveLength(2);
  });

  it("skips records with no slug", () => {
    const r = pickRelatedHomes([{ destination: "minho" } as any, home("ok", "minho")], "minho");
    expect(r.map(h => h.slug)).toEqual(["ok"]);
  });

  it("returns a slim record — no descriptions, no reviews", () => {
    const fat = home("x", "minho", { description: "long".repeat(5000), reviews: [1, 2, 3] });
    const [r] = pickRelatedHomes([fat], "minho");
    expect(Object.keys(r).sort()).toEqual(
      ["bedrooms", "currency", "destination", "image", "locality", "maxGuests", "name", "priceFrom", "slug"],
    );
    expect(JSON.stringify(r).length).toBeLessThan(400);
  });

  it("survives an empty catalogue", () => {
    expect(pickRelatedHomes([], "minho")).toEqual([]);
  });
});
