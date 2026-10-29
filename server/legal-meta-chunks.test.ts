/**
 * The privacy and cookie pages do not download the cancellation policies
 * (revisão do PR #182, F2).
 *
 * shared/legalPageMeta.ts imported shared/cancellationPolicy.ts for the
 * cancellation page's description. Privacy and Cookies read their title from
 * legalPageMeta, so a visit to /legal/privacy or /legal/cookies (often from
 * the cookie banner) also fetched Guesty's policy copy in 9 languages: two
 * extra chunks, Privacy 0.7 -> 8.7 KiB gzip of page JavaScript. The
 * cancellation page's title and description now live with the policy
 * (cancellationPolicyPageMeta) and legalPageMeta imports nothing.
 *
 * esbuild walks the pages' real import graph (tsconfig paths, as Vite
 * resolves them), so a new import anywhere down the graph is caught too.
 */
import path from "node:path";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

async function graph(file: string): Promise<string[]> {
  const result = await build({
    entryPoints: [path.join(ROOT, file)],
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
  return Object.keys(result.metafile!.inputs);
}

describe("legal page meta stays out of the cancellation policy's chunk (F2)", () => {
  it.each(["client/src/pages/Privacy.tsx", "client/src/pages/Cookies.tsx"])(
    "%s reads its meta from legalPageMeta without pulling in cancellationPolicy",
    async (page) => {
      const inputs = await graph(page);
      // The graph was walked through the "@shared/" alias, not cut short at it.
      expect(inputs).toContain("shared/legalPageMeta.ts");
      expect(inputs.filter((f) => f.endsWith("shared/cancellationPolicy.ts"))).toEqual([]);
    },
  );

  it("shared/legalPageMeta.ts has no imports at all", async () => {
    expect(await graph("shared/legalPageMeta.ts")).toEqual(["shared/legalPageMeta.ts"]);
  });

  it("the cancellation page gets its meta from the policy module, not from legalPageMeta", async () => {
    const inputs = await graph("client/src/pages/CancellationPolicy.tsx");
    expect(inputs).toContain("shared/cancellationPolicy.ts");
    expect(inputs).not.toContain("shared/legalPageMeta.ts");
  });
});
