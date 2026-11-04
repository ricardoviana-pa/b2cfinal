import { describe, it, expect } from "vitest";
import { pickRelatedHomes } from "./related-homes";
import { PROPERTY_GROUPS } from "../../client/src/config/propertyGroups";

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
      ["bedrooms", "catalogId", "currency", "destination", "image", "locality", "maxGuests", "name", "priceFrom", "slug"],
    );
    expect(JSON.stringify(r).length).toBeLessThan(400);
  });

  it("survives an empty catalogue", () => {
    expect(pickRelatedHomes([], "minho")).toEqual([]);
  });

  it("keeps Viana recommendations local instead of filling them with other Minho towns", () => {
    const r = pickRelatedHomes([
      home('city', 'minho', { locality: 'Viana do Castelo' }),
      home('other-town', 'minho', { locality: 'Famalicão', sortOrder: 0 }),
      home('separate-locality', 'minho', { locality: 'Carreço', sortOrder: 0 }),
    ], 'minho-coast', 4, 'viana-do-castelo-guide');
    expect(r.map(p => p.slug)).toEqual(['city']);
    expect(pickRelatedHomes(POOL, 'minho-coast', 4, 'viana-do-castelo-guide')).toEqual([]);
  });

  it("prioritises the direct operation within the right destination, retaining premium partner alternatives", () => {
    const direct = home('direct', 'lisbon', { sortOrder: 99 });
    const partner = home('partner', 'lisbon', { guestyId: undefined, id: 'tripwix-demo', source: 'tripwix', sortOrder: 0 });
    const elsewhere = home('elsewhere', 'minho', { sortOrder: 0 });
    expect(pickRelatedHomes([partner, elsewhere, direct], 'lisbon').map(p => p.slug)).toEqual(['direct', 'partner']);
    expect(pickRelatedHomes([partner, elsewhere], 'lisbon').map(p => p.slug)).toEqual(['partner']);
    expect(pickRelatedHomes([partner], 'lisbon')[0].catalogId).toBe('tripwix-demo');
  });

  it("keeps a Douro guide in the Douro even when the direct operation is in Porto", () => {
    const porto = home('porto', 'porto');
    const douro = home('douro', 'douro', { guestyId: undefined, source: 'tripwix', id: 'tripwix-douro' });
    expect(pickRelatedHomes([porto, douro], 'douro').map(p => p.slug)).toEqual(['douro']);
  });

  it("never resurrects inactive homes and folds units only when their parent is present", () => {
    const group = PROPERTY_GROUPS[0];
    const parent = home('parent', 'minho', { guestyId: group.parentGuestyId });
    const child = home('child', 'minho', { guestyId: group.unitGuestyIds.find(id => id !== group.parentGuestyId) });
    const inactive = home('off', 'minho', { isActive: false, sortOrder: -1 });
    expect(pickRelatedHomes([child, inactive, parent], 'minho').map(p => p.slug)).toEqual(['parent']);
    expect(pickRelatedHomes([child, inactive], 'minho').map(p => p.slug)).toEqual(['child']);
  });
});
