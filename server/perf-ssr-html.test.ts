/**
 * The SSR HTML handler end to end, on a small fixture build (index.html, a
 * Vite manifest and a fake entry-server that records what it renders):
 * - every ad click on a page reuses ONE render, made from the clean URL
 *   (performance-01: tracking parameters out of the render-cache key);
 * - HTML cache headers, including CDN-Cache-Control (performance-01/11);
 * - the head carries the route's CSS, and a script at the end of the body
 *   modulepreloads its language, catalogues and page chunk (performance-04/08)
 *   and the Guesty preconnect when the LCP photo is there (performance-03);
 * - the "from" prices go into the render's prefetch (performance-09).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("./services/lowest-nightly", () => ({
  getLowestNightlyBatch: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 150]))),
}));

import { serveStatic } from "./_core/vite";

const ROOT = path.resolve(import.meta.dirname, "..");
type Render = { url: string; prefetch?: Record<string, any> };
const renders = (): Render[] => (globalThis as any).__perfSsrRenders ?? [];

let base = "";
let server: import("node:http").Server;
let tmp = "";

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pa-ssr-"));
  const pub = path.join(tmp, "public");
  fs.mkdirSync(path.join(pub, ".vite"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "server"), { recursive: true });
  // Like client/public/homes/photos: a folder named like a page.
  fs.mkdirSync(path.join(pub, "homes", "photos"), { recursive: true });
  fs.writeFileSync(path.join(pub, "homes", "photos", "x.webp"), "img");
  const template = fs.readFileSync(path.join(ROOT, "client/index.html"), "utf8")
    .replace('<script type="module" src="/src/main.tsx"></script>', "")
    .replace("</head>", '  <link rel="stylesheet" crossorigin href="/assets/index-E.css">\n  </head>');
  fs.writeFileSync(path.join(pub, "index.html"), template);
  fs.writeFileSync(path.join(pub, ".vite", "manifest.json"), JSON.stringify({
    "index.html": { file: "assets/index-E.js", isEntry: true, css: ["assets/index-E.css"], imports: ["_react-vendor-R.js"] },
    "_react-vendor-R.js": { file: "assets/react-vendor-R.js" },
    "src/i18n/locales/en.json": { file: "assets/en-EN.js", isDynamicEntry: true },
    "src/i18n/locales/pt.json": { file: "assets/pt-UI.js", isDynamicEntry: true },
    "src/data/destinations.i18n/pt.json": { file: "assets/pt-DEST.js", isDynamicEntry: true },
    "src/data/journal-index/pt.json": { file: "assets/pt-JOUR.js", isDynamicEntry: true },
    "src/pages/Homes.tsx": { file: "assets/Homes-H.js", src: "src/pages/Homes.tsx", isDynamicEntry: true, imports: ["index.html"] },
    "src/pages/DestinationDetail.tsx": { file: "assets/DestinationDetail-D.js", src: "src/pages/DestinationDetail.tsx", isDynamicEntry: true, imports: ["index.html"], css: ["assets/DestinationDetail-D.css"] },
  }));
  // Records each render; the /homes markup starts with the LCP image preload
  // React writes for an eager, fetchpriority=high photo.
  fs.writeFileSync(path.join(tmp, "server", "entry-server.js"), `
    globalThis.__perfSsrRenders = globalThis.__perfSsrRenders || [];
    export async function render(url, opts) {
      globalThis.__perfSsrRenders.push({ url, prefetch: opts && opts.prefetch });
      const lcp = url.split("?")[0].endsWith("/homes")
        ? '<link rel="preload" as="image" imageSrcSet="https://assets.guesty.com/image/upload/w_400,q_auto,f_auto/x.jpg 400w" imageSizes="100vw" fetchPriority="high"/>'
        : '';
      return { appHtml: lcp + '<main>rendered ' + url + '</main>', dehydratedState: '{"json":{"queries":[],"mutations":[]}}' };
    }
  `);
  const app = express();
  serveStatic(app, { distPath: pub });
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const get = (p: string) => fetch(base + p, { redirect: "manual" });

describe("SSR HTML handler", () => {
  it("renders a page once for every ad click, from the URL without tracking parameters", async () => {
    const a = await get("/en/homes?gclid=AAA&gad_source=1");
    const b = await get("/en/homes?gclid=BBB&utm_source=google&utm_medium=cpc");
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const homesRenders = renders().filter((r) => r.url.startsWith("/en/homes"));
    expect(homesRenders.map((r) => r.url)).toEqual(["/en/homes"]);
    const html = await b.text();
    expect(html).toContain("rendered /en/homes</main>");
    expect(html).not.toMatch(/gclid|BBB|AAA/);
  });

  it("other parameters still get their own render", async () => {
    await get("/en/homes?guests=4&gclid=CCC");
    expect(renders().map((r) => r.url)).toContain("/en/homes?guests=4");
  });

  it("public pages: browser Cache-Control unchanged, CDN-Cache-Control with stale-if-error", async () => {
    const res = await get("/en/homes");
    expect(res.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=120");
    expect(res.headers.get("cdn-cache-control")).toBe("public, max-age=60, stale-if-error=86400");
  });

  it("listing page: Guesty preconnect in the head; English strings and the page chunk preloaded after the LCP photo", async () => {
    const html = await (await get("/en/homes")).text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('<link rel="preconnect" href="https://assets.guesty.com">');
    expect(head).not.toContain('rel="modulepreload" crossorigin href="/assets/Homes-H.js"');
    expect(preloadList(html)).toEqual(["/assets/en-EN.js", "/assets/Homes-H.js"]);
    // The script sits at the end of the body, after the server-rendered page.
    expect(html.indexOf("rendered /en/homes</main>")).toBeLessThan(html.indexOf("var m=["));
    expect(html.indexOf("var m=[")).toBeLessThan(html.lastIndexOf("</body>"));
  });

  it("listing pages carry the from prices of every catalogue home in the render", async () => {
    const r = renders().find((x) => x.url === "/en/homes");
    const catalog: Array<{ guestyId?: string }> = r?.prefetch?.catalogForSite ?? [];
    const ids = catalog.filter((p) => p.guestyId).map((p) => p.guestyId!);
    expect(ids.length).toBeGreaterThan(10);
    expect(Object.keys(r!.prefetch!.fromPrices.prices).sort()).toEqual([...new Set(ids)].sort());
    expect(Object.values(r!.prefetch!.fromPrices.prices).every((v) => v === 150)).toBe(true);
  });

  it("destination page: its CSS as a stylesheet in the head; PT strings, catalogues and page preloaded; no Guesty preconnect", async () => {
    const res = await get("/pt/destinations/minho");
    expect(res.status).toBe(200);
    const html = await res.text();
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('<link rel="stylesheet" crossorigin href="/assets/DestinationDetail-D.css">');
    // After the main stylesheet, as Vite would add it.
    expect(head.indexOf("/assets/index-E.css")).toBeLessThan(head.indexOf("/assets/DestinationDetail-D.css"));
    expect(preloadList(html)).toEqual(["/assets/pt-UI.js", "/assets/pt-DEST.js", "/assets/pt-JOUR.js", "/assets/DestinationDetail-D.js"]);
    expect(html).not.toContain("/assets/en-EN.js");
    expect(head).not.toContain("preconnect\" href=\"https://assets.guesty.com");
    const r = renders().find((x) => x.url === "/pt/destinations/minho");
    const homes: Array<{ guestyId?: string }> = r?.prefetch?.destinationHomes?.data ?? [];
    const ids = homes.filter((h) => h.guestyId).map((h) => h.guestyId!);
    expect(ids.length).toBeGreaterThan(0);
    expect(Object.keys(r!.prefetch!.fromPrices.prices).sort()).toEqual([...new Set(ids)].sort());
  });

  it("a property page carries its own from price", async () => {
    const props = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/data/properties.json"), "utf8"));
    const home = props.find((p: any) => p.guestyId && p.slug && p.isActive !== false);
    const res = await get(`/en/homes/${home.slug}`);
    expect(res.status).toBe(200);
    const r = renders().find((x) => x.url === `/en/homes/${home.slug}`);
    expect(r?.prefetch?.fromPrices?.prices).toEqual({ [home.guestyId]: 150 });
  });

  it("a bare-path redirect that copies a gclid is one hop and not stored by shared caches", async () => {
    // /homes is also a folder of the build (homes/photos): no extra
    // trailing-slash redirect from the static middleware first.
    const res = await get("/homes?gclid=XYZ");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/en/homes?gclid=XYZ");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const plain = await get("/homes?guests=2");
    expect(plain.status).toBe(301);
    expect(plain.headers.get("location")).toBe("/en/homes?guests=2");
    expect(plain.headers.get("cache-control")).not.toBe("private, no-store");
    // Files inside that folder are still served.
    expect((await get("/homes/photos/x.webp")).status).toBe(200);
  });

  it("private and missing pages: no-store, no CDN header; 404s preload only the language", async () => {
    const acc = await get("/en/account");
    expect(acc.headers.get("cache-control")).toBe("private, no-store");
    expect(acc.headers.get("cdn-cache-control")).toBeNull();
    expect(preloadList(await acc.text())).toBeNull();

    const missing = await get("/pt/zz-not-a-page-1234");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("cache-control")).toBe("private, no-store");
    const html = await missing.text();
    expect(preloadList(html)).toEqual(["/assets/pt-UI.js"]);
    expect(html).not.toContain("DestinationDetail-D");
  });
});

/** The module list of the end-of-body preload script, or null when absent. */
function preloadList(html: string): string[] | null {
  const m = html.match(/<script>\(function\(\)\{var m=(\[[^\]]*\]),d=0;/);
  return m ? JSON.parse(m[1]) : null;
}
