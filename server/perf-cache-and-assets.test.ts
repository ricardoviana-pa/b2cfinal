/**
 * Performance fixes, auditoria out/2026 (S2): tracking parameters out of the
 * SSR render-cache key, the HTML cache headers, query-carrying redirects kept
 * out of shared caches, the head links built from Vite's manifest, the
 * listing-card photo priority and the "from" prices seeded into the SSR page.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { hasTrackingParams, isTrackingParam, noStoreIfTracked, ssrRenderUrl, stripTrackingParams } from "./lib/trackingParams";
import { htmlCacheHeaders, NEVER_CACHE_PREFIXES, PUBLIC_HTML_CDN_CACHE_CONTROL } from "./lib/htmlCache";
import { legacyRedirects } from "./lib/redirects";
import { chunkKeyFor, injectBeforeBodyEnd, injectIntoHead, needsGuestyPreconnect, pageModuleForPath, routeAssets, routeModulePreloadScript, routeStyleTags, type ViteManifest } from "./lib/routeAssets";
import { bootRoute } from "@/lib/bootContent";
import { guestyIdsOf, readFromPricesForSsr } from "./lib/ssrFromPrices";
import { cardImageLoading, cardPriority } from "@/lib/listingImagePriority";
import { pickFromPrices, pickLowestNightly } from "@/lib/ssrFromPrices";
import { contentKindsForPath } from "@/lib/localizeContent";

const ROOT = path.resolve(import.meta.dirname, "..");

/* ── performance-01 / seo-health-tracking-params-bypass-cache ─────────── */
describe("tracking parameters", () => {
  it("recognises utm_*, ad click ids and analytics linkers, case-insensitively", () => {
    for (const p of ["utm_source", "utm_medium", "UTM_Campaign", "utm_whatever", "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "_gl", "gad_source", "gad_campaignid", "srsltid", "utm%5Fsource"]) {
      expect(isTrackingParam(p), p).toBe(true);
    }
    for (const p of ["checkin", "checkout", "guests", "destination", "location", "collection", "sort", "page", "subject", "property", "q", "utm", "gcl"]) {
      expect(isTrackingParam(p), p).toBe(false);
    }
  });

  it("strips them and keeps every other parameter byte for byte, in order", () => {
    expect(stripTrackingParams("/en?gclid=abc")).toBe("/en");
    expect(stripTrackingParams("/en/homes?utm_source=google&utm_medium=cpc&utm_campaign=x%20y")).toBe("/en/homes");
    expect(stripTrackingParams("/en/homes?checkin=2026-11-02&gclid=XYZ&checkout=2026-11-09&guests=4&fbclid=1"))
      .toBe("/en/homes?checkin=2026-11-02&checkout=2026-11-09&guests=4");
    expect(stripTrackingParams("/pt/homes?destination=minho&q=a+b%20c&_gl=1*abc")).toBe("/pt/homes?destination=minho&q=a+b%20c");
    expect(stripTrackingParams("/en/homes?flag&utm_source=x")).toBe("/en/homes?flag");
    expect(stripTrackingParams("/en/homes")).toBe("/en/homes");
    expect(stripTrackingParams("/en/homes?")).toBe("/en/homes");
    expect(stripTrackingParams("?gclid=1&x=2")).toBe("?x=2");
  });

  it("the SSR render URL (and cache key) is the same for every ad click on a page", () => {
    const a = ssrRenderUrl("/en/homes/mirante-1?gclid=AAA&gad_source=1&gbraid=Q");
    const b = ssrRenderUrl("/en/homes/mirante-1?gclid=BBB&utm_source=google&utm_medium=cpc");
    const clean = ssrRenderUrl("/en/homes/mirante-1");
    expect(a).toBe(clean);
    expect(b).toBe(clean);
    // …but dates still give their own render.
    expect(ssrRenderUrl("/en/homes?checkin=2026-12-01&checkout=2026-12-05&gclid=Z")).toBe("/en/homes?checkin=2026-12-01&checkout=2026-12-05");
  });

  it("hasTrackingParams sees them in a URL or a bare query", () => {
    expect(hasTrackingParams("/en?gclid=1")).toBe(true);
    expect(hasTrackingParams("?utm_source=x")).toBe(true);
    expect(hasTrackingParams("?checkin=2026-01-01")).toBe(false);
    expect(hasTrackingParams("/en/homes")).toBe(false);
  });
});

/* ── performance-01 / performance-11: HTML cache headers ──────────────── */
describe("HTML cache headers", () => {
  it("public 200 pages: browser header unchanged, Cloudflare gets the same 60 s plus stale-if-error", () => {
    const h = htmlCacheHeaders("/homes", 200);
    expect(h["Cache-Control"]).toBe("public, max-age=0, s-maxage=60, stale-while-revalidate=120");
    expect(h["CDN-Cache-Control"]).toBe("public, max-age=60, stale-if-error=86400");
  });

  it("the edge header neither lengthens the TTL nor serves stale HTML after a deploy (no s-maxage, no stale-while-revalidate)", () => {
    expect(PUBLIC_HTML_CDN_CACHE_CONTROL).not.toMatch(/s-maxage|stale-while-revalidate|must-revalidate|proxy-revalidate/);
    expect(PUBLIC_HTML_CDN_CACHE_CONTROL).toMatch(/(^|, )max-age=60(,|$)/);
    expect(PUBLIC_HTML_CDN_CACHE_CONTROL).toMatch(/stale-if-error=86400/);
  });

  it.each([...NEVER_CACHE_PREFIXES.map((p) => `${p}/x`), "/checkout/abc", "/booking/confirmation/1"])("%s stays private, no-store, with no CDN header", (p) => {
    expect(htmlCacheHeaders(p, 200)).toEqual({ "Cache-Control": "private, no-store" });
  });

  it.each([404, 500, 301])("status %i is never stored", (status) => {
    expect(htmlCacheHeaders("/homes", status)).toEqual({ "Cache-Control": "private, no-store" });
  });
});

describe("redirects that copy a tracked query are kept out of shared caches", () => {
  const run = (route: string, query: string) => {
    const redirect = vi.fn();
    const setHeader = vi.fn();
    legacyRedirects({ method: "GET", path: route, url: `${route}${query}` } as any, { redirect, setHeader } as any, vi.fn());
    return { redirect, setHeader };
  };

  it("a gclid / utm redirect says private, no-store and still carries the query", () => {
    const { redirect, setHeader } = run("/en/villas", "?gclid=abc&checkin=2026-12-01");
    expect(setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
    expect(redirect).toHaveBeenCalledWith(301, "/en/homes?gclid=abc&checkin=2026-12-01");
  });

  it("a redirect without tracking parameters keeps its default caching", () => {
    const { redirect, setHeader } = run("/en/villas", "?checkin=2026-12-01");
    expect(setHeader).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith(301, "/en/homes?checkin=2026-12-01");
  });

  it("noStoreIfTracked leaves untracked responses alone", () => {
    const res = { setHeader: vi.fn() };
    noStoreIfTracked(res, "?x=1");
    expect(res.setHeader).not.toHaveBeenCalled();
    noStoreIfTracked(res, "?fbclid=1");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "private, no-store");
  });
});

/* ── performance-04 / performance-08: head links from the Vite manifest ── */
const MANIFEST: ViteManifest = {
  "index.html": {
    file: "assets/index-E.js", isEntry: true, css: ["assets/index-E.css"],
    imports: ["_react-vendor-R.js", "_i18n-I.js"],
    dynamicImports: ["src/pages/Homes.tsx", "src/pages/DestinationDetail.tsx", "_PropertyDetail-P.js", "src/i18n/locales/pt.json", "src/i18n/locales/en.json"],
  },
  "_react-vendor-R.js": { file: "assets/react-vendor-R.js" },
  "_i18n-I.js": { file: "assets/i18n-I.js" },
  "src/i18n/locales/en.json": { file: "assets/en-EN.js", isDynamicEntry: true },
  "src/i18n/locales/pt.json": { file: "assets/pt-UI.js", isDynamicEntry: true },
  "src/data/destinations.i18n/pt.json": { file: "assets/pt-DEST.js", isDynamicEntry: true },
  "src/data/journal-index/pt.json": { file: "assets/pt-JOUR.js", isDynamicEntry: true },
  "src/data/experienceDetails.i18n/pt.json": { file: "assets/pt-EXP.js", isDynamicEntry: true },
  "src/data/blog.i18n/pt.json": { file: "assets/pt-BLOG.js", isDynamicEntry: true },
  "src/pages/Homes.tsx": { file: "assets/Homes-H.js", src: "src/pages/Homes.tsx", isDynamicEntry: true, imports: ["index.html", "_react-vendor-R.js", "_shared-S.js"] },
  "_shared-S.js": { file: "assets/shared-S.js", imports: ["_i18n-I.js"] },
  "src/pages/DestinationDetail.tsx": {
    file: "assets/DestinationDetail-D.js", src: "src/pages/DestinationDetail.tsx", isDynamicEntry: true,
    imports: ["index.html", "_shared-S.js", "_map-M.js"], css: ["assets/DestinationDetail-D.css"],
  },
  "_map-M.js": { file: "assets/map-M.js", css: ["assets/map-M.css"] },
  // A page other chunks import too: Vite keys it by chunk name, without src.
  "_PropertyDetail-P.js": { file: "assets/PropertyDetail-P.js", name: "PropertyDetail", isDynamicEntry: true, imports: ["index.html", "_shared-S.js", "_PhoneInput-X.js"] },
  "_PhoneInput-X.js": { file: "assets/PhoneInput-X.js", css: ["assets/PhoneInput-X.css"] },
};

describe("route assets from the Vite manifest", () => {
  it("destination pages link their own CSS (no jump when it arrives late) and preload language, content and page chunks", () => {
    const a = routeAssets(MANIFEST, "pt", "/destinations/minho");
    // Only the page chunk's own stylesheet: a shared component's CSS (the map) stays lazy.
    expect(a.styles).toEqual(["/assets/DestinationDetail-D.css"]);
    expect(a.modules).toEqual([
      "/assets/pt-UI.js", "/assets/pt-DEST.js", "/assets/pt-JOUR.js",
      "/assets/DestinationDetail-D.js", "/assets/shared-S.js", "/assets/map-M.js",
    ]);
  });

  it("English pages preload en.json only, no content catalogues", () => {
    expect(routeAssets(MANIFEST, "en", "/destinations/minho").modules.slice(0, 2)).toEqual(["/assets/en-EN.js", "/assets/DestinationDetail-D.js"]);
    expect(routeAssets(MANIFEST, "en", "/").modules).toEqual(["/assets/en-EN.js"]);
  });

  it("non-English pages never preload the English file (it is no longer loaded there)", () => {
    for (const p of ["/", "/homes", "/destinations/minho", "/homes/x", "/blog/x"]) {
      expect(routeAssets(MANIFEST, "pt", p).modules).not.toContain("/assets/en-EN.js");
    }
  });

  it("home page: language + destination catalogue; the page itself ships in the entry", () => {
    expect(routeAssets(MANIFEST, "pt", "/")).toEqual({ styles: [], modules: ["/assets/pt-UI.js", "/assets/pt-DEST.js"] });
  });

  it("blog and experience pages preload their own catalogues", () => {
    expect(routeAssets(MANIFEST, "pt", "/blog/some-post").modules).toContain("/assets/pt-BLOG.js");
    expect(routeAssets(MANIFEST, "pt", "/experiences/x").modules).toContain("/assets/pt-EXP.js");
  });

  it("skips what index.html already brings and finds a page keyed by chunk name", () => {
    expect(chunkKeyFor(MANIFEST, "src/pages/PropertyDetail.tsx")).toBe("_PropertyDetail-P.js");
    const pdp = routeAssets(MANIFEST, "en", "/homes/some-home");
    expect(pdp.modules).toEqual(["/assets/en-EN.js", "/assets/PropertyDetail-P.js", "/assets/shared-S.js", "/assets/PhoneInput-X.js"]);
    // The phone-number field's CSS is not render-blocking on the PDP.
    expect(pdp.styles).toEqual([]);
    expect(pdp.modules.join(" ")).not.toMatch(/react-vendor|i18n-I|index-E/);
  });

  it("unknown paths and pages missing from the manifest add only the language file", () => {
    expect(routeAssets(MANIFEST, "pt", "/404")).toEqual({ styles: [], modules: ["/assets/pt-UI.js"] });
    expect(routeAssets(MANIFEST, "pt", "/faq")).toEqual({ styles: [], modules: ["/assets/pt-UI.js"] });
    expect(routeAssets({}, "pt", "/homes")).toEqual({ styles: [], modules: [] });
  });

  it("writes the stylesheet links the way Vite does, so its loader recognises them", () => {
    expect(routeStyleTags({ styles: ["/assets/a.css", "/assets/b.css"], modules: ["/assets/c.js"] }))
      .toBe('<link rel="stylesheet" crossorigin href="/assets/a.css">\n    <link rel="stylesheet" crossorigin href="/assets/b.css">');
    expect(routeStyleTags({ styles: [], modules: ["/assets/c.js"] })).toBe("");
    expect(injectIntoHead("<html><head><title>x</title></head><body></body></html>", "<link>"))
      .toBe("<html><head><title>x</title>    <link>\n  </head><body></body></html>");
    expect(injectIntoHead("<head></head>", "")).toBe("<head></head>");
    expect(injectBeforeBodyEnd("<body><div id=\"root\"></div></body></html>", "<script></script>"))
      .toBe("<body><div id=\"root\"></div>  <script></script>\n  </body></html>");
    expect(routeModulePreloadScript({ styles: [], modules: [] })).toBe("");
  });

  describe("the modulepreload script waits for the LCP photo to be painted", () => {
    // Runs the generated script against minimal stand-ins for the DOM, the
    // LCP observer and timers.
    function run(img: null | { complete: boolean }, opts: { noObserver?: boolean } = {}) {
      const appended: Array<{ rel: string; href: string; crossOrigin: string }> = [];
      const listeners: Record<string, () => void> = {};
      const image = img && { ...img, addEventListener: (ev: string, fn: () => void) => { listeners[ev] = fn; } };
      const document = {
        querySelector: (sel: string) => (sel === '#root img[fetchpriority="high"]' ? image : null),
        createElement: () => ({ rel: "", href: "", crossOrigin: null as unknown as string }),
        head: { appendChild: (el: any) => appended.push(el) },
      };
      const observers: Array<{ type?: string; fire: () => void; disconnected: boolean }> = [];
      const PerformanceObserver = opts.noObserver ? undefined : class {
        cb: (list: unknown, o: unknown) => void;
        state = { type: undefined as string | undefined, fire: () => this.cb({}, this), disconnected: false };
        constructor(cb: (list: unknown, o: unknown) => void) { this.cb = cb; observers.push(this.state); }
        observe(o: { type: string }) { this.state.type = o.type; }
        disconnect() { this.state.disconnected = true; }
      };
      const timers: Array<{ fn: () => void; ms: number }> = [];
      const setTimeout = (fn: () => void, ms: number) => { timers.push({ fn, ms }); return timers.length; };
      const script = routeModulePreloadScript({ styles: [], modules: ["/assets/pt-UI.js", "/assets/Homes-H.js"] });
      expect(script.startsWith("<script>") && script.endsWith("</script>")).toBe(true);
      new Function("document", "PerformanceObserver", "setTimeout", script.slice("<script>".length, -"</script>".length))(document, PerformanceObserver, setTimeout);
      return { appended, listeners, observers, timers };
    }

    it("no high-priority photo: preloads at once, in order, like Vite's own tags", () => {
      const { appended } = run(null);
      expect(appended.map((l) => [l.rel, l.href, l.crossOrigin])).toEqual([
        ["modulepreload", "/assets/pt-UI.js", ""],
        ["modulepreload", "/assets/Homes-H.js", ""],
      ]);
    });

    it("photo loading: nothing at load, preloads on the next LCP entry (its paint), once", () => {
      const { appended, listeners, observers, timers } = run({ complete: false });
      expect(appended).toEqual([]);
      listeners.load();
      expect(appended).toEqual([]);
      expect(observers).toHaveLength(1);
      expect(observers[0].type).toBe("largest-contentful-paint");
      observers[0].fire();
      expect(observers[0].disconnected).toBe(true);
      expect(appended.map((l) => l.href)).toEqual(["/assets/pt-UI.js", "/assets/Homes-H.js"]);
      timers.forEach((t) => t.fn()); // the fallback timer does not add them twice
      expect(appended).toHaveLength(2);
    });

    it("photo is not the largest element (no LCP entry after it): 1 s after its load", () => {
      const { appended, listeners, timers } = run({ complete: false });
      listeners.load();
      expect(timers.map((t) => t.ms)).toEqual([1000]);
      timers[0].fn();
      expect(appended).toHaveLength(2);
    });

    it("photo failed, or no LCP observer in this browser: at once", () => {
      const failed = run({ complete: false });
      failed.listeners.error();
      expect(failed.appended).toHaveLength(2);
      const noObserver = run({ complete: false }, { noObserver: true });
      noObserver.listeners.load();
      expect(noObserver.appended).toHaveLength(2);
    });

    it("photo already loaded (cache): waits for its paint the same way", () => {
      const { appended, observers } = run({ complete: true });
      expect(appended).toEqual([]);
      observers[0].fire();
      expect(appended).toHaveLength(2);
    });

    it("escapes the list so it cannot close the script", () => {
      expect(routeModulePreloadScript({ styles: [], modules: ["/assets/</script>.js"] })).not.toContain("</script>.js");
    });
  });

  it("the browser starts the content catalogues before i18n blocks on the language file", () => {
    expect(bootRoute("/pt/destinations/minho")).toEqual({ lang: "pt", pathNoLocale: "/destinations/minho" });
    expect(bootRoute("/PT")).toEqual({ lang: "pt", pathNoLocale: "/" });
    expect(bootRoute("/en")).toEqual({ lang: "en", pathNoLocale: "/" });
    expect(bootRoute("/homes")).toEqual({ lang: "en", pathNoLocale: "/homes" });
    const main = fs.readFileSync(path.join(ROOT, "client/src/main.tsx"), "utf8");
    const imports = [...main.matchAll(/^import .*?["']([^"']+)["'];?$/gm)].map((m) => m[1]);
    expect(imports.indexOf("./lib/bootContent")).toBe(0);
    expect(imports.indexOf("./lib/bootContent")).toBeLessThan(imports.indexOf("./i18n/index"));
  });

  it("the server's content catalogues are the client's (one shared rule)", () => {
    expect(contentKindsForPath("/")).toEqual(["destinations"]);
    expect(contentKindsForPath("/destinations/minho")).toEqual(["destinations", "journal"]);
    expect(contentKindsForPath("/activities/x")).toEqual(["experiences"]);
    expect(contentKindsForPath("/homes")).toEqual([]);
  });

  it("the page table mirrors App.tsx's <Router>", () => {
    const app = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf8");
    const lazyModule = new Map<string, string>();
    for (const m of app.matchAll(/const (\w+) = lazy\(\(\) => import\("(?:\.|@)\/pages\/([^"]+)"\)\)/g)) {
      lazyModule.set(m[1], `src/pages/${m[2]}.tsx`);
    }
    const skip = /^\/(checkout|booking|login|account|admin|owners|owners-portal|404)(\/|$)|^\/services$|^\/$/;
    let checked = 0;
    for (const m of app.matchAll(/<Route path="([^"]+)"(?: nest)? component=\{(\w+)\} \/>/g)) {
      const [, route, component] = m;
      if (skip.test(route)) continue;
      const mod = lazyModule.get(component);
      expect(mod, `${route} → ${component} is lazy`).toBeTruthy();
      const samplePath = route.replace(/:[a-zA-Z]+/g, "sample-slug");
      expect(pageModuleForPath(samplePath), route).toBe(mod);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(20);
  });

  it("the Vite config emits the manifest for the client build only", () => {
    const cfg = fs.readFileSync(path.join(ROOT, "vite.config.ts"), "utf8");
    expect(cfg).toMatch(/manifest: !isSsrBuild/);
  });
});

describe("preconnect to Guesty's image CDN", () => {
  it("only when a high-priority image preload points there", () => {
    expect(needsGuestyPreconnect('<link rel="preload" as="image" imageSrcSet="https://assets.guesty.com/image/upload/w_400/x.jpg 400w" imageSizes="100vw" fetchPriority="high"/>')).toBe(true);
    expect(needsGuestyPreconnect('<link rel="preload" as="image" fetchPriority="high" href="https://assets.guesty.com/image/upload/x.jpg"/>')).toBe(true);
    expect(needsGuestyPreconnect('<link rel="preload" as="image" href="/hero/home.webp" fetchPriority="high"/>')).toBe(false);
    expect(needsGuestyPreconnect('<link rel="preload" as="image" href="https://assets.guesty.com/x.jpg"/>')).toBe(false);
  });
});

/* ── performance-03: listing photos ───────────────────────────────────── */
describe("listing card photo priority", () => {
  it("first card high, cards 2–3 preloaded only where they share the first row, the rest untouched", () => {
    expect(cardPriority("homes", 0)).toEqual({ priority: true });
    expect(cardPriority("homes", 1)).toEqual({ preloadMedia: "(min-width: 768px)" });
    expect(cardPriority("homes", 2)).toEqual({ preloadMedia: "(min-width: 1024px)" });
    expect(cardPriority("homes", 3)).toEqual({});
    expect(cardPriority("collection", 1)).toEqual({ preloadMedia: "(min-width: 640px)" });
    expect(cardPriority("collection", 2)).toEqual({ preloadMedia: "(min-width: 1024px)" });
    expect(cardPriority("collection", 7)).toEqual({});
  });

  it("only the first photo of the priority card is eager", () => {
    expect(cardImageLoading(true, true)).toEqual({ loading: "eager", fetchPriority: "high" });
    expect(cardImageLoading(true, false)).toEqual({ loading: "lazy", fetchPriority: "low", decoding: "async" });
    expect(cardImageLoading(undefined, true)).toEqual({ loading: "lazy", fetchPriority: "low", decoding: "async" });
  });

  it("the grids pass it (Homes: first section; Collection)", () => {
    const homes = fs.readFileSync(path.join(ROOT, "client/src/pages/Homes.tsx"), "utf8");
    const coll = fs.readFileSync(path.join(ROOT, "client/src/pages/Collection.tsx"), "utf8");
    expect(homes).toMatch(/\{\.\.\.cardPriority\('homes', index\)\}/);
    expect(coll).toMatch(/\{\.\.\.cardPriority\('collection', idx\)\}/);
  });
});

/* ── performance-12: one hero download on the PDP ─────────────────────── */
describe("PDP hero", () => {
  it("the phone carousel's first slide and the desktop tile use the same srcset and sizes", () => {
    const src = fs.readFileSync(path.join(ROOT, "client/src/pages/PropertyDetail.tsx"), "utf8");
    expect(src).toMatch(/srcSet=\{guestySrcSet\(sourceImages\[idx\], idx === 0 \? HERO_WIDTHS : \[640, 828, 1080, 1440\]\)\} sizes=\{idx === 0 \? HERO_SIZES : '100vw'\}/);
    expect(src).toMatch(/<img src=\{images\[0\]\} srcSet=\{guestySrcSet\(sourceImages\[0\], HERO_WIDTHS\)\} sizes=\{HERO_SIZES\}/);
  });
});

/* ── performance-09: "from" prices in the SSR payload ─────────────────── */
describe("from prices seeded into the server-rendered page", () => {
  const seed = { prices: { a: 120, b: 340, c: null }, at: 1_000 };

  it("gives a page exactly its homes, with the server's timestamp", () => {
    expect(pickFromPrices(seed, ["b", "a"])).toEqual({ data: { b: 340, a: 120 }, updatedAt: 1_000 });
  });

  it("a home without a price yet makes the seed stale, so the query refreshes it after hydration", () => {
    expect(pickFromPrices(seed, ["a", "c"])).toEqual({ data: { a: 120, c: null }, updatedAt: 0 });
  });

  it("falls back to the query when the server did not price one of the homes", () => {
    expect(pickFromPrices(seed, ["a", "zzz"])).toBeUndefined();
    expect(pickFromPrices(undefined, ["a"])).toBeUndefined();
    expect(pickFromPrices(seed, [])).toBeUndefined();
  });

  it("the PDP gets the shape of booking.lowestNightly", () => {
    expect(pickLowestNightly(seed, "b")).toEqual({ data: { from: 340, source: "fallback", currency: "EUR" }, updatedAt: 1_000 });
    expect(pickLowestNightly(seed, "c")).toEqual({ data: { from: null, source: "none", currency: "EUR" }, updatedAt: 0 });
    expect(pickLowestNightly(seed, undefined)).toBeUndefined();
  });

  it("the server reads each home once, keeps nulls and non-prices as null", async () => {
    const load = vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, id === "x" ? 99 : id === "y" ? 0 : null])) as Record<string, number | null>);
    const out = await readFromPricesForSsr(["x", "y", "x", null, undefined, "", "z"], load);
    expect(load).toHaveBeenCalledWith(["x", "y", "z"]);
    expect(out?.prices).toEqual({ x: 99, y: null, z: null });
    expect(typeof out?.at).toBe("number");
  });

  it("never holds the page up: past the budget it renders without prices", async () => {
    const slow = () => new Promise<Record<string, number | null>>((resolve) => setTimeout(() => resolve({ x: 1 }), 200));
    const t0 = Date.now();
    expect(await readFromPricesForSsr(["x"], slow, 30)).toBeUndefined();
    expect(Date.now() - t0).toBeLessThan(150);
    expect(await readFromPricesForSsr(["x"], async () => { throw new Error("db down"); })).toBeUndefined();
    expect(await readFromPricesForSsr([], vi.fn())).toBeUndefined();
  });

  it("uses the same ids as the pages' lowestNightlyBatch input", () => {
    expect(guestyIdsOf([{ guestyId: "g1" }, { guestyId: undefined }, { guestyId: "g2", source: "guesty" } as any, null as any])).toEqual(["g1", "g2"]);
  });
});
