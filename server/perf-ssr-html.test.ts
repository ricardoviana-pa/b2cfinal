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
  fs.mkdirSync(path.join(pub, ".well-known"), { recursive: true });
  fs.writeFileSync(path.join(pub, ".well-known", "llms.txt"), "# llms");
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
    "src/pages/Home.tsx": { file: "assets/Home-HOME.js", src: "src/pages/Home.tsx", isDynamicEntry: true, imports: ["index.html"] },
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
  it("a transient Journal read returns uncached 503 and the same URL recovers to 200", async () => {
    const journal = await import('./services/journal');
    const read = vi.spyOn(journal, 'getJournalArticle').mockRejectedValueOnce(new Error('Synthetic transient translation read failure'));
    const url = '/sv/blog/viana-do-castelo-guide';
    try {
      const failed = await get(url);
      expect(failed.status).toBe(503);
      expect(failed.headers.get('cache-control')).toBe('no-store');
      expect(failed.headers.get('cdn-cache-control')).toBe('no-store');
      expect(failed.headers.get('retry-after')).toBe('60');
      expect(renders().some(r => r.url === url)).toBe(false);
      const recovered = await get(url);
      expect(recovered.status).toBe(200);
      expect(await recovered.text()).toContain('<meta name="robots" content="index, follow"');
      expect(renders().find(r => r.url === url)?.prefetch?.journalArticle.data.article.slug).toBe('viana-do-castelo-guide');
    } finally {
      read.mockRestore();
    }
  });

  it("seeds one localized Journal article and its related homes under matching query inputs", async () => {
    const url = '/pt/blog/viana-do-castelo-guide';
    const response = await get(url);
    expect(response.status).toBe(200);
    const html = await response.text();
    const prefetch = renders().find(r => r.url === url)?.prefetch;
    expect(prefetch?.journalArticle.input).toEqual({ locale: 'pt', slug: 'viana-do-castelo-guide' });
    expect(prefetch?.journalArticle.data.article.content).toContain('Viana');
    expect(prefetch?.journalArticle.data.relatedArticles.length).toBeLessThanOrEqual(3);
    expect(prefetch?.journalArticle.data.relatedArticles.every((a: any) => !('content' in a))).toBe(true);
    expect(prefetch?.relatedHomes.input.articleSlug).toBe('viana-do-castelo-guide');
    expect(prefetch?.journalIndex).toBeUndefined();
    expect(html).toContain('<link rel="canonical" href="https://www.portugalactive.com/pt/blog/viana-do-castelo-guide"');
    expect(html).toContain('"@type":"BlogPosting"');
  });

  it("the Journal index seeds card metadata only, while unpublished language routes still redirect", async () => {
    expect((await get('/pt/blog')).status).toBe(200);
    const prefetch = renders().find(r => r.url === '/pt/blog')?.prefetch;
    expect(prefetch?.journalIndex.input).toEqual({ locale: 'pt' });
    expect(prefetch?.journalIndex.data.length).toBeGreaterThan(30);
    expect(prefetch?.journalIndex.data.every((a: any) => !('content' in a))).toBe(true);
    expect(prefetch?.journalArticle).toBeUndefined();
    const redirect = await get('/fr/blog/cycling-minho-portugal-guide?guests=4');
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get('location')).toBe('/en/blog/cycling-minho-portugal-guide?guests=4');
  });

  it("home keeps its server HTML and announces the split page module after the content", async () => {
    const res = await get("/pt");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("rendered /pt</main>");
    expect(preloadList(html)).toEqual(["/assets/pt-UI.js", "/assets/pt-DEST.js", "/assets/Home-HOME.js"]);
    expect(html.indexOf("rendered /pt</main>")).toBeLessThan(html.indexOf("var m=["));
    expect(html.slice(0, html.indexOf("</head>"))).not.toContain("/assets/Home-HOME.js");
  });
  it("seeds only the multi-unit group's cards on its property page", async () => {
    const { PROPERTY_GROUPS } = await import('../client/src/config/propertyGroups');
    const { getPropertiesForSite } = await import('./services/properties-store');
    const group = PROPERTY_GROUPS[0];
    const property = (await getPropertiesForSite()).find(p => p.guestyId === group.parentGuestyId)!;
    const url = `/pt/homes/${property.slug}`;
    expect((await get(url)).status).toBe(200);
    const prefetch = renders().find(r => r.url === url)?.prefetch;
    expect(prefetch?.groupUnits.input).toEqual({ parentGuestyId: group.parentGuestyId });
    expect(prefetch?.groupUnits.data.map((p: any) => p.guestyId)).toEqual(group.unitGuestyIds);
    expect(prefetch?.catalogForSite).toBeUndefined();
    expect(prefetch?.listForSite).toBeUndefined();
  });

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

  it("a bare-path entry preserves tracking and trip context without booting the app or being cached", async () => {
    // /homes is also a folder of the build: no trailing-slash redirect first.
    const res = await get("/homes?gclid=XYZ");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("cdn-cache-control")).toBe("no-store");
    expect(res.headers.get("cloudflare-cdn-cache-control")).toBe("no-store");
    const html = await res.text();
    expect(html).toContain('/en/homes?gclid=XYZ');
    expect(html).toContain('location.search+location.hash');
    expect(html).not.toContain('/assets/');
    expect(html).not.toContain('rendered ');
    const plain = await get("/homes?guests=2");
    expect(plain.status).toBe(200);
    expect(plain.headers.get("cache-control")).toBe("private, no-store");
    expect(await plain.text()).toContain('/en/homes?guests=2');
    expect((await get("/homes/photos/x.webp")).status).toBe(200);
  });

  it("the no-JS entry selects browser preferences, with a manual cookie taking priority", async () => {
    const french = await fetch(base + '/?guests=3', { headers: { 'accept-language': 'en;q=0.2,fr-CA;q=0.9' }, redirect: 'manual' });
    expect(french.status).toBe(200);
    expect(await french.text()).toContain('<noscript><meta http-equiv="refresh" content="0;url=/fr?guests=3"></noscript>');
    const chosen = await fetch(base + '/', { headers: { 'accept-language': 'fr', cookie: 'pa-site-language=pt' }, redirect: 'manual' });
    expect(await chosen.text()).toContain('content="0;url=/pt"');
  });

  it("an explicit locale keeps its SSR, canonical and cache policy despite different preferences", async () => {
    const res = await fetch(base + '/pt/homes', { headers: { 'accept-language': 'de-DE', cookie: 'pa-site-language=fr' }, redirect: 'manual' });
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('rendered /pt/homes</main>');
    expect(html).toContain('https://www.portugalactive.com/pt/homes');
    expect(html).not.toContain('navigator.languages&&navigator.languages.length');
    expect(res.headers.get('cache-control')).toContain('public');
  });

  it("crawlers retain the stable English x-default without caching a language entry", async () => {
    const res = await fetch(base + '/?utm_source=search', { headers: { 'user-agent': 'Googlebot', 'accept-language': 'pt' }, redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/en?utm_source=search');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
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

describe("what the static handler must not serve, and repeat 404s", () => {
  const robots = (html: string) => html.match(/<meta name="robots" content="([^"]*)"/)?.[1];

  it("the build manifest is read from disk but never served", async () => {
    for (const p of ["/.vite/manifest.json", "/%2Evite/manifest.json", "/%2evite/manifest.json", "//.vite/manifest.json", "/.vite/"]) {
      const res = await get(p);
      const body = await res.text();
      expect(res.status, p).toBe(404);
      expect(body, p).not.toContain("isDynamicEntry");
      expect(res.headers.get("content-type"), p).toMatch(/^text\/html/);
    }
    // The manifest still puts the route's CSS in the head (read from disk).
    const html = await (await get("/en/destinations/minho")).text();
    expect(html).toContain('href="/assets/DestinationDetail-D.css"');
  });

  it("/.well-known stays public", async () => {
    const res = await get("/.well-known/llms.txt");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("# llms");
  });

  it("an unknown URL says noindex on every request, not only the first", async () => {
    for (const p of ["/en/zz-repeat-404-7731", "/pt/qualquer-coisa-7731", "/fr/zz-repeat/deep-7731"]) {
      for (let i = 1; i <= 3; i++) {
        const res = await get(p);
        expect(res.status, `${p} #${i}`).toBe(404);
        expect(robots(await res.text()), `${p} #${i}`).toBe("noindex, nofollow");
      }
    }
  });

  it("a missing home says noindex on the repeat too (cached empty record)", async () => {
    for (let i = 1; i <= 2; i++) {
      const res = await get("/de/homes/zz-no-such-home-7731");
      expect(res.status).toBe(404);
      expect(robots(await res.text())).toBe("noindex, nofollow");
    }
  });

  it("a real page keeps index, follow on the repeat", async () => {
    for (let i = 1; i <= 2; i++) {
      const res = await get("/en/destinations/minho");
      expect(res.status).toBe(200);
      expect(robots(await res.text())).toBe("index, follow");
    }
  });

  // Verificação final de 29 out 2026, P7: every 404 carried the 19 hreflang
  // alternates of its own (dead) URL, and the language card read them and
  // offered "Auf Deutsch ansehen" on "Experience not found".
  it("a 404 carries no hreflang alternates, on the first request and the repeat; a real page keeps its 19", async () => {
    const missing = [
      "/en/experiences/zz-not-a-real-one-7731", "/en/activities/zz-not-a-real-one-7731", "/en/services/zz-not-a-real-one-7731",
      "/en/blog/zz-not-a-real-one-7731", "/en/collections/zz-not-a-real-one-7731", "/en/destinations/zz-not-a-real-one-7731",
      "/de/homes/zz-no-such-home-7731", "/en/zz-repeat-404-7731", "/en/booking/zz-7731",
    ];
    for (const p of missing) {
      for (let i = 1; i <= 2; i++) {
        const res = await get(p);
        const html = await res.text();
        expect(res.status, `${p} #${i}`).toBe(404);
        expect(html, `${p} #${i}`).not.toContain("hreflang=");
        expect(robots(html), `${p} #${i}`).toBe("noindex, nofollow");
      }
    }
    for (const p of ["/en/destinations/minho", "/en", "/pt/homes"]) {
      const html = await (await get(p)).text();
      expect(html.match(/hreflang=/g), p).toHaveLength(19);
    }
  });
});

/** The module list of the end-of-body preload script, or null when absent. */
function preloadList(html: string): string[] | null {
  const m = html.match(/<script>\(function\(\)\{var m=(\[[^\]]*\]),d=0;/);
  return m ? JSON.parse(m[1]) : null;
}
