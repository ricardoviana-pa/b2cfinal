import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import {
  editorialGuides,
  editorialSources,
  getDestinationEditorial,
} from "../client/src/data/destination-editorial";
import destinations from "../client/src/data/destinations.json";
import pt from "../client/src/data/destinations.i18n/pt.json";
import { buildDestinationGraph } from "../shared/destinationSchema";

describe("researched destination guides", () => {
  for (const [slug, guide] of Object.entries(editorialGuides)) {
    it(`${slug}: both languages have complete routes, sources and matching FAQ schema`, () => {
      expect(guide.routes.length).toBeGreaterThan(0);
      for (const route of guide.routes) {
        expect(route.days).toHaveLength(6); // 7 nights = six full days + arrival/departure
        expect(
          route.days.every(d => d.title.every(Boolean) && d.text.every(Boolean))
        ).toBe(true);
      }
      expect(guide.faqs).toHaveLength(8);
      for (const item of [
        ...guide.moments,
        ...guide.tables,
        ...guide.culture,
      ]) {
        expect(new URL(editorialSources[item.source].url).protocol).toBe(
          "https:"
        );
      }
      if (guide.photo.src.startsWith("/"))
        expect(existsSync(`client/public${guide.photo.src}`)).toBe(true);
      for (const [n, lang] of ["pt", "en"].entries()) {
        const base = destinations.find(d => d.slug === slug)!;
        const localized = n === 0 ? { ...base, ...(pt as any)[slug] } : base;
        expect(localized.faqs).toEqual(
          guide.faqs.map(f => ({
            question: f.question[n],
            answer: f.answer[n],
          }))
        );
        const graph = buildDestinationGraph(
          localized as any,
          [],
          undefined,
          lang
        );
        expect(
          (graph.find(n => n["@type"] === "FAQPage") as any).mainEntity.map(
            (q: any) => q.name
          )
        ).toEqual(localized.faqs.map((f: any) => f.question));
        expect(localized.seoTitle).toBe(guide.seo[n]);
      }
    });
  }
  it("preserves untranslated routes with their existing localized template", () => {
    expect(getDestinationEditorial("porto", "pt-PT")).toBeDefined();
    expect(getDestinationEditorial("porto", "fr")).toBeUndefined();
    expect(getDestinationEditorial("brazil", "en")).toBeUndefined();
  });
  it("does not describe regional alternatives as places within Porto or Esposende", () => {
    const homes = [
      "Porto",
      "Douro",
      "Amarante",
      "Trofa",
      "Viana do Castelo",
    ].map((locality, i) => ({
      id: String(i),
      name: locality,
      locality,
      slug: String(i),
    })) as any;
    const porto = buildDestinationGraph(
      destinations.find(d => d.slug === "porto") as any,
      homes
    )[0] as any;
    expect(porto.containsPlace.map((p: any) => p.name)).toEqual(["Porto"]);
    const esposende = buildDestinationGraph(
      destinations.find(d => d.slug === "esposende") as any,
      homes
    )[0];
    expect(esposende).not.toHaveProperty("containsPlace");
  });
});
