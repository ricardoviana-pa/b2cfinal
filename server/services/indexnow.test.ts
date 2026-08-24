import { describe, it, expect } from "vitest";
import { diffPropertyUrls, withAllLocales, INDEXNOW_LANGS } from "./indexnow";

const P = (guestyId: string, slug: string) => ({ guestyId, slug });

describe("diffPropertyUrls", () => {
  it("submits nothing when no slug changed", () => {
    const prev = new Map([["a", "villa-one"], ["b", "villa-two"]]);
    const d = diffPropertyUrls([P("a", "villa-one"), P("b", "villa-two")], prev);
    expect(d.added).toEqual([]);
    expect(d.renamed).toEqual([]);
    expect(d.urls).toEqual([]);
  });

  it("submits a new home in every locale", () => {
    const prev = new Map([["a", "villa-one"]]);
    const d = diffPropertyUrls([P("a", "villa-one"), P("b", "villa-new")], prev);
    expect(d.added).toEqual(["villa-new"]);
    expect(d.renamed).toEqual([]);
    for (const lang of INDEXNOW_LANGS) {
      expect(d.urls).toContain(`https://www.portugalactive.com/${lang}/homes/villa-new`);
    }
  });

  it("submits BOTH URLs on a rename, so the 301 gets re-crawled", () => {
    // The real Villa Aura case: slug renamed 2026-08-10.
    const prev = new Map([["738c68", "connected-premium-lodge-cowork-and-5min-beach-738c68"]]);
    const d = diffPropertyUrls([P("738c68", "villa-aura-sauna-gym-5min-beach-city-738c68")], prev);

    expect(d.added).toEqual([]);
    expect(d.renamed).toEqual([
      { from: "connected-premium-lodge-cowork-and-5min-beach-738c68", to: "villa-aura-sauna-gym-5min-beach-city-738c68" },
    ]);
    expect(d.urls).toContain("https://www.portugalactive.com/en/homes/villa-aura-sauna-gym-5min-beach-city-738c68");
    expect(d.urls).toContain("https://www.portugalactive.com/en/homes/connected-premium-lodge-cowork-and-5min-beach-738c68");
    expect(d.urls).toContain("https://www.portugalactive.com/pt/homes/villa-aura-sauna-gym-5min-beach-city-738c68");
  });

  it("re-submits the listing page whenever something changed", () => {
    const d = diffPropertyUrls([P("b", "villa-new")], new Map([["a", "villa-one"]]));
    expect(d.urls).toContain("https://www.portugalactive.com/en/homes");
  });

  it("ignores records missing an id or a slug", () => {
    const prev = new Map([["a", "villa-one"]]);
    const d = diffPropertyUrls(
      [{ guestyId: "x" }, { slug: "no-id" }, P("a", "villa-one")] as any,
      prev,
    );
    expect(d.urls).toEqual([]);
  });

  it("counts one URL per locale and nothing more", () => {
    const d = diffPropertyUrls([P("b", "villa-new")], new Map([["a", "villa-one"]]));
    // 1 new home + the listing page, each across every locale.
    expect(d.urls).toHaveLength(INDEXNOW_LANGS.length * 2);
  });

  it("expands a path into one URL per supported locale", () => {
    expect(withAllLocales("/homes/x")).toHaveLength(9);
    expect(withAllLocales("homes/x")[0]).toBe("https://www.portugalactive.com/en/homes/x");
  });
});
