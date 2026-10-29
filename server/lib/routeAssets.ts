/**
 * What a page needs before it can render and hydrate, announced by the server
 * HTML so the browser does not discover it one file after another, after
 * index.js (auditoria out/2026):
 *
 * - performance-04-destination-css-cls: the route's own CSS, as a
 *   <link rel=stylesheet> in the <head>. Destination pages render classes
 *   (minho-hero, destination-*) whose rules live in the lazy
 *   DestinationDetail chunk's CSS; it arrived only after the JavaScript, and
 *   the page jumped into place (CLS 0.6–1.0). Now it applies on first paint.
 *   Vite's loader sees the link and does not add it twice.
 * - performance-08-non-en-hydration-waterfall: modulepreload for the
 *   language's interface strings, the content catalogues the route loads
 *   before hydrating (shared/contentRoutes.ts) and the page's own chunk with
 *   its imports, added by a small script at the end of <body> once the LCP
 *   photo is painted (routeModulePreloadScript), so they never compete with it.
 *
 * Everything comes from Vite's build manifest (dist/public/.vite/manifest.json).
 * Without it (dev server, a build without the manifest) nothing is added.
 */
import { CONTENT_MODULES, contentKindsForPath, needsBlogOverrides } from "../../shared/contentRoutes";

export interface ViteManifestChunk {
  file: string;
  name?: string;
  src?: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
  css?: string[];
}
export type ViteManifest = Record<string, ViteManifestChunk>;

const LANGS = ["en", "pt", "fr", "es", "it", "de", "nl", "sv", "fi"];

/**
 * The lazy page module App.tsx renders for a path (locale removed). Mirrors
 * <Router> in client/src/App.tsx — server/perf-route-assets.test.ts checks
 * the two agree. The home page is not here: it ships inside the entry bundle.
 * Checkout, booking, account and admin routes are left out on purpose.
 */
const PAGE_ROUTES: Array<[RegExp, string]> = [
  [/^\/homes$/, "src/pages/Homes.tsx"],
  [/^\/homes\/[^/]+$/, "src/pages/PropertyDetail.tsx"],
  [/^\/destinations$/, "src/pages/Destinations.tsx"],
  [/^\/collections\/[^/]+$/, "src/pages/Collection.tsx"],
  [/^\/destinations\/[^/]+$/, "src/pages/DestinationDetail.tsx"],
  [/^\/concierge$/, "src/pages/Services.tsx"],
  [/^\/services\/[^/]+$/, "src/pages/ServiceDetail.tsx"],
  [/^\/(experiences|adventures)$/, "src/pages/Adventures.tsx"],
  [/^\/(experiences|activities)\/[^/]+$/, "src/pages/ExperienceDetail.tsx"],
  [/^\/events$/, "src/pages/Events.tsx"],
  [/^\/corporate-retreats$/, "src/pages/CorporateRetreats.tsx"],
  [/^\/about$/, "src/pages/About.tsx"],
  [/^\/contact$/, "src/pages/Contact.tsx"],
  [/^\/blog$/, "src/pages/Blog.tsx"],
  [/^\/blog\/[^/]+$/, "src/pages/BlogArticle.tsx"],
  [/^\/faq$/, "src/pages/FAQ.tsx"],
  [/^\/careers$/, "src/pages/Careers.tsx"],
  [/^\/legal\/privacy$/, "src/pages/Privacy.tsx"],
  [/^\/legal\/terms$/, "src/pages/Terms.tsx"],
  [/^\/legal\/cookies$/, "src/pages/Cookies.tsx"],
  [/^\/legal\/cancellation-policy$/, "src/pages/CancellationPolicy.tsx"],
  [/^\/best-rate-guarantee$/, "src/pages/BestRateGuarantee.tsx"],
];

export function pageModuleForPath(strippedPath: string): string | null {
  const p = strippedPath.length > 1 ? strippedPath.replace(/\/+$/, "") : strippedPath;
  for (const [re, mod] of PAGE_ROUTES) if (re.test(p)) return mod;
  return null;
}

/** The manifest key of a source module's chunk. A page that other chunks
 *  also import (PropertyDetail) is emitted as a shared chunk keyed
 *  "_PropertyDetail-<hash>.js", so fall back to the entry's dynamic imports
 *  by chunk name. */
export function chunkKeyFor(manifest: ViteManifest, src: string): string | null {
  if (manifest[src]) return src;
  for (const [key, chunk] of Object.entries(manifest)) if (chunk.src === src) return key;
  const name = src.split("/").pop()!.replace(/\.[^.]+$/, "");
  const entry = manifest["index.html"];
  for (const key of entry?.dynamicImports ?? []) {
    if (manifest[key]?.name === name && manifest[key]?.isDynamicEntry) return key;
  }
  return null;
}

/** The chunks index.html already loads (and modulepreloads) itself. */
function entryKeys(manifest: ViteManifest): Set<string> {
  const keys = new Set<string>(["index.html"]);
  const walk = (k: string) => {
    for (const i of manifest[k]?.imports ?? []) if (!keys.has(i)) { keys.add(i); walk(i); }
  };
  walk("index.html");
  return keys;
}

export interface RouteAssets {
  /** /assets/… CSS files to link as stylesheets, in order. */
  styles: string[];
  /** /assets/… JS chunks to modulepreload, most urgent first. */
  modules: string[];
}

/**
 * The CSS and JS a page at `strippedPath` in `lang` loads before hydrating,
 * minus what the entry bundle already brings.
 *
 * Interface strings: only the page's language. The English file used to be
 * loaded as a fallback too, but the build fails if any language lacks a key
 * that en.json has (scripts/sync-i18n.mjs), so it never supplied a string
 * (client/src/i18n/index.ts).
 */
export function routeAssets(manifest: ViteManifest, lang: string, strippedPath: string): RouteAssets {
  const styles: string[] = [];
  const modules: string[] = [];
  const add = (list: string[], file?: string) => {
    if (!file) return;
    const href = `/${file}`;
    if (!list.includes(href)) list.push(href);
  };
  const code = LANGS.includes(lang) ? lang : "en";

  add(modules, manifest[`src/i18n/locales/${code}.json`]?.file);
  if (code !== "en") {
    if (needsBlogOverrides(strippedPath)) add(modules, manifest[CONTENT_MODULES.blog(code)]?.file);
    for (const kind of contentKindsForPath(strippedPath)) add(modules, manifest[CONTENT_MODULES[kind](code)]?.file);
  }

  const page = pageModuleForPath(strippedPath);
  const pageKey = page ? chunkKeyFor(manifest, page) : null;
  if (pageKey) {
    // Stylesheets: only the page chunk's own CSS (the destination guides).
    // A shared component's CSS (PhoneInput, the map) styles forms and
    // widgets that are not in the first view; made render-blocking it only
    // delayed the first paint (+150 ms in Lighthouse on the PDP) and stays
    // lazy, as before.
    for (const css of manifest[pageKey]?.css ?? []) add(styles, css);
    const skip = entryKeys(manifest);
    const seen = new Set<string>();
    const visit = (key: string) => {
      if (seen.has(key) || skip.has(key)) return;
      seen.add(key);
      const chunk = manifest[key];
      if (!chunk) return;
      add(modules, chunk.file);
      for (const dep of chunk.imports ?? []) visit(dep);
    };
    visit(pageKey);
  }
  return { styles, modules };
}

/** The route's stylesheets, for the <head>, in the form Vite itself writes them. */
export function routeStyleTags(assets: RouteAssets): string {
  return assets.styles.map((href) => `<link rel="stylesheet" crossorigin href="${href}">`).join("\n    ");
}

/**
 * The modulepreloads, as a small script for the end of <body>: it adds the
 * <link rel=modulepreload> tags once the LCP photo (the first
 * fetchpriority=high image of the page) has loaded and been painted — the
 * next largest-contentful-paint entry, or 1 s after the load if none comes
 * (the photo is not always the largest element). Straight away when the page
 * has no such photo or the photo fails.
 *
 * Why not plain tags in the <head>: measured on slow 4G + 4× CPU, head
 * modulepreloads made the page usable 1–1.5 s sooner but took the LCP photo's
 * bandwidth and delayed LCP by 0.3–1.3 s, even at fetchpriority=low
 * (sitefix/s2). Started after the photo, they cost LCP nothing and still
 * reach the browser before index.js asks for them one after another. Waiting
 * for the paint, not just the download, also keeps them out of Lighthouse's
 * LCP estimate, which counts every request that starts before the observed
 * LCP. If index.js runs first, it fetches them itself as it always did, and a
 * later preload of a module already loading is a no-op.
 */
export function routeModulePreloadScript(assets: RouteAssets): string {
  if (assets.modules.length === 0) return "";
  const list = JSON.stringify(assets.modules).replace(/</g, "\\u003c");
  return `<script>(function(){var m=${list},d=0;function p(){if(d)return;d=1;for(var i=0;i<m.length;i++){var l=document.createElement("link");l.rel="modulepreload";l.crossOrigin="";l.href=m[i];document.head.appendChild(l)}}function a(){try{new PerformanceObserver(function(x,o){o.disconnect();p()}).observe({type:"largest-contentful-paint"})}catch(e){p();return}setTimeout(p,1000)}var g=document.querySelector('#root img[fetchpriority="high"]');if(!g)p();else if(g.complete)a();else{g.addEventListener("load",a);g.addEventListener("error",p)}})()</script>`;
}

/** Insert markup just before </body> (once). */
export function injectBeforeBodyEnd(html: string, markup: string): string {
  if (!markup) return html;
  const at = html.lastIndexOf("</body>");
  return at === -1 ? html + markup : `${html.slice(0, at)}  ${markup}\n  ${html.slice(at)}`;
}

/**
 * The page's LCP photo is on Guesty's CDN when React put a high-priority
 * image preload for it at the top of the rendered page (first listing card,
 * PDP hero). Connecting to that host from the <head> saves the DNS + TLS setup
 * that would otherwise start only when the preload is parsed.
 */
export const GUESTY_IMAGE_ORIGIN = "https://assets.guesty.com";
export function needsGuestyPreconnect(appHtmlStart: string): boolean {
  return /<link rel="preload" as="image"[^>]*https:\/\/assets\.guesty\.com[^>]*fetchPriority="high"/i.test(appHtmlStart)
    || /<link rel="preload" as="image"[^>]*fetchPriority="high"[^>]*https:\/\/assets\.guesty\.com/i.test(appHtmlStart);
}

/** Insert tags just before </head> (once). */
export function injectIntoHead(html: string, tags: string): string {
  if (!tags) return html;
  const at = html.indexOf("</head>");
  return at === -1 ? html : `${html.slice(0, at)}    ${tags}\n  ${html.slice(at)}`;
}
