import { describe, it, expect } from "vitest";
import { mergeManualReviews, reviewKey } from "./guesty-sync";

const guesty = (text: string, rating = 5, date = "2026-01-01") => ({
  rating, text, guestDisplayName: "Ana", guestName: "Ana",
  guestPhoto: null, guestLocation: null, date, categories: [],
});

describe("mergeManualReviews", () => {
  it("returns the Guesty set untouched when there is nothing curated", () => {
    const g = [guesty("Lovely house")];
    expect(mergeManualReviews(g, undefined)).toBe(g);
    expect(mergeManualReviews(g, [])).toBe(g);
  });

  it("adds curated reviews to the Guesty ones", () => {
    const merged = mergeManualReviews(
      [guesty("Guesty one", 5, "2026-01-01")],
      [{ rating: 5, text: "Airbnb one", guestName: "Klaus Meyer", date: "2024-06-02" }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.map(r => r.text)).toContain("Airbnb one");
  });

  it("keeps only the first name, for privacy parity with the Guesty path", () => {
    const [added] = mergeManualReviews([], [
      { rating: 5, text: "Great stay", guestName: "Klaus Meyer", date: "2024-06-02" },
    ]);
    expect(added.guestName).toBe("Klaus");
    expect(added.guestDisplayName).toBe("Klaus");
  });

  it("sorts the merged set newest first", () => {
    const merged = mergeManualReviews(
      [guesty("Newest", 5, "2026-05-01")],
      [
        { rating: 5, text: "Oldest", date: "2023-01-01" },
        { rating: 5, text: "Middle", date: "2025-01-01" },
      ],
    );
    expect(merged.map(r => r.text)).toEqual(["Newest", "Middle", "Oldest"]);
  });

  it("drops a curated duplicate of a review Guesty already delivered", () => {
    const merged = mergeManualReviews(
      [guesty("The house was immaculate, and the pool heated!")],
      [{ rating: 5, text: "the house was immaculate and the pool heated", date: "2024-01-01" }],
    );
    expect(merged).toHaveLength(1);
  });

  it("folds accents so a hand-typed copy still matches the original", () => {
    expect(reviewKey({ text: "Óptima estadia!" })).toBe(reviewKey({ text: "optima  estadia" }));
  });

  it("rejects everything that is not a 5★ with real text", () => {
    const merged = mergeManualReviews([], [
      { rating: 3, text: "Was ok" },
      { rating: 4, text: "Good, but the pool was cold" }, // the site publishes 5★ only
      { rating: 5, text: "   " },                          // no text
      { rating: 10, text: "Ten point scale" },             // must be pre-normalised
      { rating: 5, text: "Keeper", date: "2024-01-01" },
    ]);
    expect(merged.map(r => r.text)).toEqual(["Keeper"]);
  });

  it("caps runaway text the same way the Guesty funnel does", () => {
    const [added] = mergeManualReviews([], [{ rating: 5, text: "x".repeat(900) }]);
    expect(added.text).toHaveLength(500);
  });
});
