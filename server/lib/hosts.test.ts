import { describe, it, expect } from "vitest";
import { isProductionHost, isNonIndexableHost } from "./hosts";

describe("isProductionHost", () => {
  it("recognises the live site", () => {
    expect(isProductionHost("www.portugalactive.com")).toBe(true);
    expect(isProductionHost("portugalactive.com")).toBe(true);
  });

  it("ignores case and port", () => {
    expect(isProductionHost("WWW.PortugalActive.com")).toBe(true);
    expect(isProductionHost("www.portugalactive.com:443")).toBe(true);
  });

  it("treats local development as production — no crawler sees it", () => {
    expect(isProductionHost("localhost:5199")).toBe(true);
    expect(isProductionHost("127.0.0.1:3000")).toBe(true);
  });

  it("does NOT match staging, previews or lookalikes", () => {
    expect(isProductionHost("dev.portugalactive.com")).toBe(false);
    expect(isProductionHost("preview-abc.onrender.com")).toBe(false);
    // A lookalike domain must never be mistaken for the real one.
    expect(isProductionHost("portugalactive.com.evil.test")).toBe(false);
    expect(isProductionHost("notportugalactive.com")).toBe(false);
  });

  it("treats a missing or empty host as non-production", () => {
    expect(isProductionHost(undefined)).toBe(false);
    expect(isProductionHost("")).toBe(false);
  });
});

describe("isNonIndexableHost", () => {
  it("is the exact inverse — the live site is never marked noindex", () => {
    for (const h of ["www.portugalactive.com", "portugalactive.com", "localhost:5199"]) {
      expect(isNonIndexableHost(h)).toBe(false);
    }
    for (const h of ["dev.portugalactive.com", "preview-abc.onrender.com", undefined]) {
      expect(isNonIndexableHost(h)).toBe(true);
    }
  });
});
