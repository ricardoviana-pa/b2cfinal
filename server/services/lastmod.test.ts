import { describe, it, expect } from "vitest";
import { __testing } from "./guesty-sync";

const { contentFingerprint, stampLastModified } = __testing;

const home = (over: Record<string, unknown> = {}) => ({
  guestyId: "g1",
  slug: "villa-aura",
  name: "Villa Aura",
  description: "A house.",
  images: ["a.jpg"],
  bedrooms: 4,
  priceFrom: 300,
  pricePerNight: 300,
  reviews: [{ text: "great" }],
  reviewCount: 1,
  averageRating: 5,
  sortOrder: 3,
  ...over,
});

const YESTERDAY = "2026-08-23";
const TODAY = new Date().toISOString().split("T")[0];

describe("contentFingerprint", () => {
  it("ignores price changes", () => {
    expect(contentFingerprint(home())).toBe(contentFingerprint(home({ priceFrom: 999, pricePerNight: 999 })));
  });

  it("ignores new reviews", () => {
    const withReviews = home({ reviews: [{ text: "a" }, { text: "b" }], reviewCount: 2, averageRating: 4.5 });
    expect(contentFingerprint(home())).toBe(contentFingerprint(withReviews));
  });

  it("ignores merchandising order", () => {
    expect(contentFingerprint(home())).toBe(contentFingerprint(home({ sortOrder: 99 })));
  });

  it("reacts to a slug rename", () => {
    expect(contentFingerprint(home())).not.toBe(contentFingerprint(home({ slug: "villa-aura-new" })));
  });

  it("reacts to description and photo changes", () => {
    expect(contentFingerprint(home())).not.toBe(contentFingerprint(home({ description: "Rewritten." })));
    expect(contentFingerprint(home())).not.toBe(contentFingerprint(home({ images: ["a.jpg", "b.jpg"] })));
  });
});

describe("stampLastModified", () => {
  it("keeps the old date when nothing changed", () => {
    const previous = new Map([["g1", { ...home(), contentHash: contentFingerprint(home()), lastModified: YESTERDAY }]]);
    const props = [home({ priceFrom: 450 })]; // price moved, page did not
    const r = stampLastModified(props, previous, YESTERDAY);
    expect(props[0].lastModified).toBe(YESTERDAY);
    expect(r.changed).toBe(0);
  });

  it("moves the date when the page really changed", () => {
    const previous = new Map([["g1", { ...home(), contentHash: contentFingerprint(home()), lastModified: YESTERDAY }]]);
    const props = [home({ slug: "villa-aura-sauna-gym" })];
    const r = stampLastModified(props, previous, YESTERDAY);
    expect(props[0].lastModified).toBe(TODAY);
    expect(r.changed).toBe(1);
  });

  it("stamps a brand-new home with today", () => {
    const props = [home({ guestyId: "brand-new" })];
    stampLastModified(props, new Map(), YESTERDAY);
    expect(props[0].lastModified).toBe(TODAY);
  });

  it("does not claim 'changed today' on the first run, before hashes exist", () => {
    // Previous record predates this feature: no contentHash stored.
    const previous = new Map([["g1", { ...home(), lastModified: undefined }]]);
    const props = [home()];
    const r = stampLastModified(props, previous, YESTERDAY);
    expect(props[0].lastModified).toBe(YESTERDAY);
    expect(r.changed).toBe(0);
  });

  it("writes a hash so the next run can compare", () => {
    const props = [home()];
    stampLastModified(props, new Map(), YESTERDAY);
    expect(props[0].contentHash).toMatch(/^[0-9a-f]{40}$/);
  });
});
