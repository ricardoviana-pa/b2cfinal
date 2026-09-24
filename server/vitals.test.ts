import { describe, expect, it } from "vitest";
import { parseVitalRow } from "./routes/vitals";
import { routeTemplate } from "../client/src/lib/vitals";

describe("vitals beacon rows", () => {
  it("keeps a well-formed INP row with its attribution", () => {
    const row = parseVitalRow({
      m: "INP", v: 312, r: "poor", p: "/homes/:slug", l: "pt", d: "mobile", c: "4g",
      t: "button.book-now", y: "pointer", id: 12.4, pd: 250, pr: 50, ss: "/assets/index.js", si: "BUTTON#book.onclick", sd: 180,
    });
    expect(row).toMatchObject({ metric: "INP", value: 312, rating: "poor", page: "/homes/:slug", lang: "pt", device: "mobile", conn: "4g", target: "button.book-now" });
    expect(JSON.parse(row!.detail!)).toEqual({ id: 12, pd: 250, pr: 50, sd: 180, y: "pointer", ss: "/assets/index.js", si: "BUTTON#book.onclick" });
  });

  it("drops rows that aren't measurements", () => {
    expect(parseVitalRow({ m: "XSS", v: 1, r: "good", p: "/", d: "mobile" })).toBeNull();
    expect(parseVitalRow({ m: "LCP", v: -5, r: "good", p: "/", d: "mobile" })).toBeNull();
    expect(parseVitalRow({ m: "LCP", v: 900, r: "good", p: "/<script>", d: "mobile" })).toBeNull();
    expect(parseVitalRow({ m: "LCP", v: 900, r: "great", p: "/", d: "mobile" })).toBeNull();
    expect(parseVitalRow({ m: "LCP", v: 900, r: "good", p: "/", d: "tv" })).toBeNull();
    expect(parseVitalRow("LCP")).toBeNull();
  });

  it("clamps free text and ignores unknown keys", () => {
    const row = parseVitalRow({ m: "CLS", v: 0.21, r: "poor", p: "/", d: "desktop", t: "x".repeat(500), email: "a@b.c" });
    expect(row!.target).toHaveLength(200);
    expect(JSON.stringify(row)).not.toContain("a@b.c");
  });
});

describe("route templates", () => {
  it("collapses slugs and splits the locale", () => {
    expect(routeTemplate("/pt/homes/villa-aura-738c68")).toEqual({ lang: "pt", page: "/homes/:slug" });
    expect(routeTemplate("/en")).toEqual({ lang: "en", page: "/" });
    expect(routeTemplate("/en/homes")).toEqual({ lang: "en", page: "/homes" });
    expect(routeTemplate("/checkout/abc123")).toEqual({ lang: "", page: "/checkout" });
  });
});
