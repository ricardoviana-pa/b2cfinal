import { describe, it, expect } from "vitest";
import { __testing } from "./lib/redirects.js";

const { resolvePath } = __testing;

describe("legacyRedirects.resolvePath", () => {
  describe("properties → homes", () => {
    it("maps known Webflow property slug to new home slug", () => {
      expect(resolvePath("/properties/eben-lodge")).toBe(
        "/homes/portugal-active-eben-lodge-heated-pool-10ecfe"
      );
    });

    it("maps with trailing slash", () => {
      expect(resolvePath("/properties/sunset-beach-lodge/")).toBe(
        "/homes/portugal-active-sunset-beach-lodge-heated-pool-5ceb91"
      );
    });

    it("maps old WordPress /rooms/ pattern to new home", () => {
      expect(resolvePath("/rooms/atlantic-lodge")).toBe(
        "/homes/portugal-active-atlantic-lodge-sea-view-premium-10dd49"
      );
    });

    it("falls back to /homes for unknown property slug", () => {
      expect(resolvePath("/properties/some-old-removed-villa")).toBe("/homes");
    });

    it("redirects /properties index to /homes", () => {
      expect(resolvePath("/properties")).toBe("/homes");
      expect(resolvePath("/properties/")).toBe("/homes");
    });
  });

  describe("adventure / event → experiences", () => {
    it("maps canyoning adventure", () => {
      expect(resolvePath("/adventure/canyoning")).toBe("/experiences/canyoning");
    });

    it("renames sailing-experience to sailing", () => {
      expect(resolvePath("/adventure/sailing-experience")).toBe(
        "/experiences/sailing"
      );
    });

    it("collapses fat-bike + e-bike-wild + city-mountain-bike to ebike-tours", () => {
      expect(resolvePath("/adventure/fat-bike-wild-tour")).toBe(
        "/experiences/ebike-tours"
      );
      expect(resolvePath("/event/e-bike-tour")).toBe("/experiences/ebike-tours");
    });

    it("/adventures (plural) goes to /experiences index", () => {
      expect(resolvePath("/adventures")).toBe("/experiences");
    });
  });

  describe("offer → services", () => {
    it("maps grocery-setup to grocery-delivery", () => {
      expect(resolvePath("/offer/grocery-setup")).toBe(
        "/services/grocery-delivery"
      );
    });

    it("maps massage-therapist to in-villa-spa", () => {
      expect(resolvePath("/offer/massage-therapist")).toBe(
        "/services/in-villa-spa"
      );
    });
  });

  describe("locations → destinations", () => {
    it("collapses city-level location to regional destination", () => {
      expect(resolvePath("/locations/viana-do-castelo-portugal")).toBe(
        "/destinations/minho"
      );
      expect(resolvePath("/locations/algarve-portugal")).toBe(
        "/destinations/algarve"
      );
    });

    it("/locations index goes to /destinations", () => {
      expect(resolvePath("/locations")).toBe("/destinations");
      expect(resolvePath("/locations/portugal")).toBe("/destinations");
    });
  });

  describe("static page renames", () => {
    it.each([
      ["/about-us", "/about"],
      ["/about-us.html", "/about"],
      ["/contact-us", "/contact"],
      ["/contact.html", "/contact"],
      ["/why-portugal-active/", "/about"],
      ["/founder-ricardo-viana/", "/about"],
      ["/lodges/", "/homes"],
      ["/our-rooms/", "/homes"],
      ["/destination/", "/destinations"],
      ["/news/", "/blog"],
      ["/cookies-policy/", "/legal/cookies"],
      ["/terms-conditions/", "/legal/terms"],
    ])("redirects %s → %s", (from, to) => {
      expect(resolvePath(from)).toBe(to);
    });
  });

  describe("WordPress noise", () => {
    it("category/tag/author archives → /blog", () => {
      expect(resolvePath("/category/awards/")).toBe("/blog");
      expect(resolvePath("/tag/luxury-villas/")).toBe("/blog");
      expect(resolvePath("/author/ricardo/")).toBe("/blog");
    });

    it("date archives → /blog", () => {
      expect(resolvePath("/2023/02/07/")).toBe("/blog");
      expect(resolvePath("/2024/07/05/")).toBe("/blog");
    });

    it("hotel-cart variants → /homes", () => {
      expect(resolvePath("/hotel-cart/")).toBe("/homes");
      expect(resolvePath("/hotel-checkout/")).toBe("/homes");
    });

    it("wp-login → /", () => {
      expect(resolvePath("/wp-login.php")).toBe("/");
    });

    it("Joomla index.php → /", () => {
      expect(resolvePath("/index.php?page=aboutus")).toBe("/");
      expect(resolvePath("/index.html")).toBe("/");
    });

    it("legacy *.html catch-all → /", () => {
      expect(resolvePath("/cycling.html")).toBe("/");
      expect(resolvePath("/walking-non-guided.html")).toBe("/");
    });
  });

  describe("/new/* preview prefix", () => {
    it("strips /new/ and re-resolves", () => {
      expect(resolvePath("/new/about")).toBe("/about");
      expect(resolvePath("/new/rooms/eben-lodge/")).toBe(
        "/homes/portugal-active-eben-lodge-heated-pool-10ecfe"
      );
    });
  });

  describe("pass-through cases", () => {
    it("returns null for current SPA routes (let SPA handle)", () => {
      expect(resolvePath("/")).toBeNull();
      expect(resolvePath("/homes")).toBeNull();
      expect(resolvePath("/about")).toBeNull();
      expect(resolvePath("/blog")).toBeNull();
      expect(resolvePath("/destinations")).toBeNull();
      expect(resolvePath("/services")).toBeNull();
    });

    it("returns null for unknown deep paths the SPA may handle", () => {
      expect(resolvePath("/homes/portugal-active-eben-lodge-heated-pool-10ecfe")).toBeNull();
      expect(resolvePath("/blog/complete-guide-north-portugal")).toBeNull();
    });
  });

  describe("single-segment slug fallback", () => {
    it("/old-blog-slug-without-prefix/ → /blog (likely WP post)", () => {
      expect(resolvePath("/best-things-to-do-in-viana-do-castelo")).toBe("/blog");
      expect(resolvePath("/founder-ricardo-viana/")).toBe("/about"); // STATIC wins
    });
  });
});
