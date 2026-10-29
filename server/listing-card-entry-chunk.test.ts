/**
 * The listing card is in the entry chunk every page loads (revisão do PR
 * #180, R3). Importing its "Price on request" label from partnerAvailability
 * pulled the date-range rules and the partner panel's notices in with it:
 * +2.4 kB raw / +1 kB gzip on the critical path of every page, with mobile
 * Core Web Vitals already failing. The label now lives in a module with no
 * imports; the rules stay in the calendar's and the property page's chunks.
 *
 * esbuild walks the card's real import graph (tsconfig paths, as Vite
 * resolves them), so a new import anywhere down the graph is caught too.
 */
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("the listing card's import graph (entry chunk) leaves the calendar rules in the panel's chunk", () => {
  it("PropertyCard does not import dateRangeSelection or partnerAvailability, directly or not", async () => {
    const result = await build({
      entryPoints: [path.join(ROOT, "client/src/components/property/PropertyCard.tsx")],
      absWorkingDir: ROOT,
      bundle: true,
      write: false,
      metafile: true,
      format: "esm",
      platform: "browser",
      jsx: "automatic",
      packages: "external",
      loader: { ".css": "empty", ".png": "empty", ".jpg": "empty", ".svg": "empty", ".webp": "empty" },
      logLevel: "silent",
    });
    const inputs = Object.keys(result.metafile!.inputs);
    // The graph was walked through the "@/" alias (tsconfig paths), not cut short at it.
    expect(inputs.some((f) => f.endsWith("client/src/lib/format.ts"))).toBe(true);
    expect(inputs.filter((f) => /client\/src\/lib\/(dateRangeSelection|partnerAvailability)\.ts$/.test(f))).toEqual([]);
  });
});
