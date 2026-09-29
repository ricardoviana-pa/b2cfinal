import { describe, expect, it } from "vitest";
import {
  editorialTripContext,
  withEditorialTrip,
  propertyTripHref,
} from "../shared/editorialTripContext";
import {
  articleHeadings,
  reviewedArticleDate,
} from "../shared/articleNavigation";
import { __testing } from "./_core/vite";

describe("editorial journeys preserve a safe travel context", () => {
  it("preserves destination filters and dates across a guide-to-search link", () => {
    expect(withEditorialTrip("/homes?destination=minho", "#ignore")).toBe(
      "/homes?destination=minho"
    );
    expect(
      withEditorialTrip(
        "/homes?location=viana-do-castelo",
        "checkin=2026-10-10&checkout=2026-10-17&guests=4"
      )
    ).toBe(
      "/homes?location=viana-do-castelo&checkin=2026-10-10&checkout=2026-10-17&guests=4"
    );
  });
  it("drops personal, recovery and campaign fields instead of carrying arbitrary queries", () => {
    const href = withEditorialTrip(
      "/destinations/porto#destination-arrival",
      "email=guest@example.test&token=secret&intentId=private&guests=2&utm_campaign=old"
    );
    expect(href).toBe("/destinations/porto?guests=2#destination-arrival");
  });
  it.each([
    "checkin=2026-02-30&checkout=2026-03-02",
    "checkin=2026-10-10&checkout=2026-10-10",
    "checkin=2026-10-17&checkout=2026-10-10",
    "checkin=2026-10-10",
  ])("does not pass a broken date range (%s)", query => {
    expect(editorialTripContext(query)).not.toHaveProperty("checkin");
  });
  it("keeps one guest and guests without dates through property cards", () => {
    expect(
      propertyTripHref("demo", {
        checkin: "2026-10-10",
        checkout: "2026-10-17",
        guests: 1,
      })
    ).toBe("/homes/demo?checkin=2026-10-10&checkout=2026-10-17&guests=1");
    expect(propertyTripHref("demo", { guests: 6 })).toBe(
      "/homes/demo?guests=6"
    );
  });
  it("does not change external sources and refuses invalid guest counts", () => {
    expect(withEditorialTrip("https://www.cp.pt", "guests=2")).toBe(
      "https://www.cp.pt"
    );
    expect(editorialTripContext("guests=999")).toEqual({ guests: undefined });
  });
});

describe("editorial navigation and real revision dates", () => {
  it("creates usable unique targets for repeated and accented headings", () => {
    const headings = articleHeadings(
      "## Época\n\nText\n\n### Época\n\n## Getting here"
    );
    expect(headings.map(h => h.id)).toEqual([
      "guide-epoca",
      "guide-epoca-2",
      "guide-getting-here",
    ]);
    expect(headings.map(h => h.index)).toEqual([0, 2, 3]);
  });
  it("never marks an unchanged translation as newly reviewed", () => {
    const post = {
      slug: "test",
      title: "Test",
      publishDate: "2026-03-30",
      modifiedDate: "2026-09-28",
      updatedLocales: ["en", "pt"],
      author: { type: "Organization", name: "Portugal Active" },
    };
    expect(reviewedArticleDate(post, "pt-PT")).toBe("2026-09-28");
    expect(reviewedArticleDate(post, "nl")).toBeUndefined();
    const pt = (__testing.buildBlogGraph(post, "pt")["@graph"] as any[])[0];
    const nl = (__testing.buildBlogGraph(post, "nl")["@graph"] as any[])[0];
    expect(pt.dateModified).toContain("2026-09-28");
    expect(nl.dateModified).toContain("2026-03-30");
    expect(pt.author["@type"]).toBe("Organization");
  });
});
