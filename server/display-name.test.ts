import { describe, expect, it } from "vitest";
import { sanitizePropertyName } from "@shared/displayName";

describe("sanitizePropertyName — amenity tails", () => {
  it('drops "w/ …" with and without the space after the slash', () => {
    expect(sanitizePropertyName("Estuary View Duplex w/ Garage, 10min Walk to Beach")).toBe("Estuary View Duplex");
    // Guesty title of the Lumina Duplex since 25 Nov 2026.
    expect(sanitizePropertyName("Estuary View Duplex w/Garage, 10 min Walk to Beach")).toBe("Estuary View Duplex");
  });

  it('drops "with …" but keeps words that only contain "with"', () => {
    expect(sanitizePropertyName("Sunset Cliffs with Ocean View by Portugal Active ")).toBe("Sunset Cliffs");
    expect(sanitizePropertyName("Withdrawn Cottage")).toBe("Withdrawn Cottage");
  });
});
