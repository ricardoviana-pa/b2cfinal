import express, { type Express } from "express";
import { HOME_COUNT_LABEL } from "@shared/brandFacts";
import { getDisplayName } from "@shared/displayName";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";
import { isNonIndexableHost } from "../lib/hosts.js";

/** Server-side rendering kill-switch. SSR is ON by default (phases 0-3 shipped,
 *  tested, hydration verified clean); set the Render env var SSR_ENABLED=false to
 *  instantly roll back to the CSR shell — no redeploy needed. Any SSR render error
 *  already falls back to CSR per-request, so this switch is only for a full revert. */
const SSR_ENABLED = process.env.SSR_ENABLED !== "false";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  // vite.config exports a function of ConfigEnv (command/isSsrBuild); resolve
  // it before spreading — spreading the function itself yields an empty config
  // (no root/plugins), which broke every module request in local dev.
  const resolvedViteConfig = await (typeof viteConfig === "function"
    ? (viteConfig as any)({ command: "serve", mode: "development", isSsrBuild: false })
    : viteConfig);

  const vite = await createViteServer({
    ...resolvedViteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      let page = await vite.transformIndexHtml(url, template);

      // Inject per-request locale tags so dev mirrors prod SEO behavior.
      const rawPath = url.split("?")[0];
      const first = rawPath.split('/').filter(Boolean)[0]?.toLowerCase();
      const devLang = first && ALL_LANGS.includes(first) ? first : 'en';
      const devStripped = first && ALL_LANGS.includes(first)
        ? ('/' + rawPath.split('/').filter(Boolean).slice(1).join('/') || '/')
        : rawPath;
      page = injectLocaleTags(page, { lang: devLang, pagePath: devStripped });

      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

const BOT_UA_RE = /googlebot|google-extended|googleother|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|applebot|applebot-extended|ia_archiver|gptbot|oai-searchbot|chatgpt-user|perplexitybot|perplexity-user|claudebot|claude-web|anthropic-ai|ccbot|meta-externalagent|bytespider|amazonbot|diffbot/i;

let _cachedIndexHtml: string | null = null;

/** In-memory cache for dynamic route meta (properties, blog posts, etc.)
 *  so we can inject OG tags for ALL requests without hitting DB every time.
 *  TTL: 10 min — stale meta is better than wrong/missing meta. */
const DYNAMIC_META_TTL_MS = 10 * 60 * 1000;
type DynamicMeta = {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: string;
  /** Optional JSON-LD graph to inject server-side. domId matches the client
   *  StructuredData convention (`sd-{id}`) so hydration replaces it cleanly. */
  schemaDomId?: string;
  schemaGraph?: Record<string, unknown>;
  /** Optional crawlable body HTML — injected into a #seo-content block that an
   *  inline script removes before React mounts (JS-less crawlers keep it). */
  bodyHtml?: string;
};
const dynamicMetaCache = new Map<string, { expiresAt: number; meta: DynamicMeta | null }>();

/** Cached property data from JSON files (Guesty sync / static fallback).
 *  Properties are NOT in the DB — they come from getPropertiesForSite().
 *  Map: slug → property object. Refreshed every 10 min. */
let _propertySlugMap: { expiresAt: number; data: Map<string, any> } | null = null;
async function getPropertyBySlugCached(slug: string): Promise<any | null> {
  if (!_propertySlugMap || Date.now() > _propertySlugMap.expiresAt) {
    try {
      const { getPropertiesForSite } = await import("../services/properties-store");
      const properties = await getPropertiesForSite();
      const map = new Map<string, any>();
      for (const p of properties) {
        if (p.slug) map.set(p.slug, p);
      }
      _propertySlugMap = { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, data: map };
    } catch (err) {
      console.error("[Meta] Failed to load property data for meta injection:", err);
      return null;
    }
  }
  return _propertySlugMap.data.get(slug) ?? null;
}

/** Cached service data from JSON file (services.json).
 *  Services live in client/src/data/services.json (NOT in DB).
 *  Map: slug → service object. Refreshed every 10 min. */
let _serviceSlugMap: { expiresAt: number; data: Map<string, any> } | null = null;
async function getServiceBySlugCached(slug: string): Promise<any | null> {
  if (!_serviceSlugMap || Date.now() > _serviceSlugMap.expiresAt) {
    try {
      const svcPath = path.join(process.cwd(), "client", "src", "data", "services.json");
      const raw = fs.readFileSync(svcPath, "utf-8");
      const data = JSON.parse(raw);
      const map = new Map<string, any>();
      // services.json has shape { services: [...], activities: [...] }
      const all = [...(data.services || []), ...(data.activities || [])];
      for (const svc of all) {
        if (svc.slug) map.set(svc.slug, svc);
      }
      _serviceSlugMap = { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, data: map };
    } catch (err) {
      console.error("[Meta] Failed to load service data for meta injection:", err);
      return null;
    }
  }
  return _serviceSlugMap.data.get(slug) ?? null;
}

/** Cached experience data from JSON file (experienceDetails.json).
 *  Map: slug → experience object. Refreshed every 10 min. */
let _experienceSlugMap: { expiresAt: number; data: Map<string, any> } | null = null;
async function getExperienceBySlugCached(slug: string): Promise<any | null> {
  if (!_experienceSlugMap || Date.now() > _experienceSlugMap.expiresAt) {
    try {
      // Use process.cwd() for consistent path resolution in both dev and production
      const expPath = path.join(process.cwd(), "client", "src", "data", "experienceDetails.json");
      const raw = fs.readFileSync(expPath, "utf-8");
      const data = JSON.parse(raw);
      const map = new Map<string, any>();
      for (const exp of (data.experiences || [])) {
        if (exp.slug) map.set(exp.slug, exp);
      }
      _experienceSlugMap = { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, data: map };
    } catch (err) {
      console.error("[Meta] Failed to load experience data for meta injection:", err);
      return null;
    }
  }
  return _experienceSlugMap.data.get(slug) ?? null;
}

/** Blog articles live in client/src/data/blog.json (NOT the DB); per-locale
 *  overrides in client/src/data/blog.i18n/<lang>.json (slug → fields). Returns
 *  the article with the active language's title/excerpt/content/seo* applied so
 *  bots get the localised meta + body. */
let _blogArticles: { expiresAt: number; data: Map<string, any> } | null = null;
const _i18nOverrides = new Map<string, { expiresAt: number; data: Record<string, any> }>();
function loadI18nOverrides(kind: "blog" | "properties", lang: string): Record<string, any> {
  const code = (lang || "en").split("-")[0];
  if (code === "en") return {};
  const cacheKey = `${kind}:${code}`;
  const cached = _i18nOverrides.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.data;
  let data: Record<string, any> = {};
  try {
    const p = path.join(process.cwd(), "client", "src", "data", `${kind}.i18n`, `${code}.json`);
    data = JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch { data = {}; }
  _i18nOverrides.set(cacheKey, { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, data });
  return data;
}
async function getBlogArticleBySlugCached(slug: string, lang: string): Promise<any | null> {
  try {
    if (!_blogArticles || Date.now() > _blogArticles.expiresAt) {
      const p = path.join(process.cwd(), "client", "src", "data", "blog.json");
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      const map = new Map<string, any>();
      for (const a of (data.articles || [])) if (a.slug) map.set(a.slug, a);
      _blogArticles = { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, data: map };
    }
    const base = _blogArticles.data.get(slug);
    if (!base) return null;
    const ov = loadI18nOverrides("blog", lang)[slug];
    return ov ? { ...base, ...ov } : base;
  } catch (err) {
    console.error("[Meta] Failed to load blog data for meta injection:", err);
    return null;
  }
}

/** Destinations live in client/src/data/destinations.json; overrides in
 *  destinations.i18n/<lang>.json ({ slug: fields }). Returns { name, desc }
 *  in the active language for meta. */
let _destinations: { expiresAt: number; data: Map<string, any> } | null = null;
const _destOverrides = new Map<string, { expiresAt: number; data: Record<string, any> }>();
async function getDestinationBySlugCached(slug: string, lang: string): Promise<{ name: string; desc: string; seoTitle?: string } | null> {
  try {
    if (!_destinations || Date.now() > _destinations.expiresAt) {
      const p = path.join(process.cwd(), "client", "src", "data", "destinations.json");
      const arr = JSON.parse(fs.readFileSync(p, "utf-8"));
      const map = new Map<string, any>();
      for (const d of (Array.isArray(arr) ? arr : [])) if (d.slug) map.set(d.slug, d);
      _destinations = { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, data: map };
    }
    const base = _destinations.data.get(slug);
    if (!base) return null;
    const code = (lang || "en").split("-")[0];
    // One file per language ({ slug: fields }) — same layout the client loads.
    let ovByLang = _destOverrides.get(code);
    if (code !== "en" && (!ovByLang || Date.now() > ovByLang.expiresAt)) {
      let data: Record<string, any> = {};
      try {
        const p = path.join(process.cwd(), "client", "src", "data", "destinations.i18n", `${code}.json`);
        data = JSON.parse(fs.readFileSync(p, "utf-8"));
      } catch { data = {}; }
      ovByLang = { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, data };
      _destOverrides.set(code, ovByLang);
    }
    const ov = code === "en" ? null : ovByLang?.data[slug];
    const name = ov?.name || base.name || slug;
    // Curated per-destination title, per locale, falling back to English.
    const seoTitle = (ov?.seoTitle || base.seoTitle || "").trim();
    const desc = (ov?.seoDescription || ov?.description || base.seoDescription || base.description || base.tagline || "").replace(/\s+/g, " ").trim().slice(0, 155);
    return desc ? { name, desc, seoTitle: seoTitle || undefined } : null;
  } catch (err) {
    console.error("[Meta] Failed to load destination data for meta injection:", err);
    return null;
  }
}

function getCachedDynamicMeta(key: string) {
  const cached = dynamicMetaCache.get(key);
  if (!cached) return undefined; // not cached
  if (Date.now() > cached.expiresAt) {
    dynamicMetaCache.delete(key);
    return undefined;
  }
  return cached.meta; // may be null (= route was checked but no DB record found)
}

function setCachedDynamicMeta(key: string, meta: DynamicMeta | null) {
  dynamicMetaCache.set(key, { expiresAt: Date.now() + DYNAMIC_META_TTL_MS, meta });
}

function isBotRequest(req: import('express').Request): boolean {
  return BOT_UA_RE.test(req.headers['user-agent'] ?? '');
}

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── SEO: locale tags ──────────────────────────────────────────────────────
   Every HTML response (human or bot) carries per-request hreflang + canonical
   so Google treats /en/, /pt/, /fr/ … as distinct indexable versions instead
   of deduping them to the English root. */

const BOT_BASE_URL = 'https://www.portugalactive.com';

/** Short lang code → BCP-47 region tag used in hreflang attributes.
 *  Google recommends region tags where they aid disambiguation; we use the
 *  generic language code too so any region matches. */
const HREFLANG_REGION: Record<string, string> = {
  en: 'en-GB', pt: 'pt-PT', es: 'es-ES', fr: 'fr-FR',
  de: 'de-DE', it: 'it-IT', nl: 'nl-NL', fi: 'fi-FI', sv: 'sv-SE',
};

/** og:locale tag values. */
const OG_LOCALE: Record<string, string> = {
  en: 'en_GB', pt: 'pt_PT', es: 'es_ES', fr: 'fr_FR',
  de: 'de_DE', it: 'it_IT', nl: 'nl_NL', fi: 'fi_FI', sv: 'sv_SE',
};

const ALL_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

/** Build the full alternate-language link block for a given page path. */
function buildHreflangBlock(pagePath: string): string {
  const suffix = pagePath === '/' ? '' : pagePath;
  const langLinks = ALL_LANGS.map(l => {
    // emit both generic ("pt") and regional ("pt-PT") — Google picks the best match
    const generic = `    <link rel="alternate" hreflang="${l}" href="${BOT_BASE_URL}/${l}${suffix}" />`;
    const regional = `    <link rel="alternate" hreflang="${HREFLANG_REGION[l]}" href="${BOT_BASE_URL}/${l}${suffix}" />`;
    return `${generic}\n${regional}`;
  }).join('\n');
  const xDefault = `    <link rel="alternate" hreflang="x-default" href="${BOT_BASE_URL}/en${suffix}" />`;
  return `${langLinks}\n${xDefault}`;
}

/** Inject per-request locale signals: <html lang>, hreflang alternates,
 *  canonical URL, og:url, og:locale. Safe to run on any HTML response. */
function injectLocaleTags(html: string, opts: { lang: string; pagePath: string }): string {
  const lang = ALL_LANGS.includes(opts.lang) ? opts.lang : 'en';
  const pagePath = opts.pagePath;
  const url = `${BOT_BASE_URL}/${lang}${pagePath === '/' ? '' : pagePath}`;
  const urlEsc = escAttr(url);
  const ogLocale = OG_LOCALE[lang] ?? 'en_GB';

  // 1. <html lang="…">
  html = html.replace(/<html\s+lang="[^"]*"/i, `<html lang="${lang}"`);

  // 2. Replace the full hreflang block (any existing <link rel="alternate" hreflang=…>)
  //    with the canonical 9-lang + 9-region + x-default set.
  //    Strategy: remove every existing hreflang link, then re-insert before </head>.
  html = html.replace(/\s*<link\s+rel="alternate"\s+hreflang="[^"]*"[^>]*\/?>\s*/g, '\n');
  const block = buildHreflangBlock(pagePath);
  // Insert just before the canonical link so tags stay grouped
  if (/<link rel="canonical"/.test(html)) {
    html = html.replace(/(<link rel="canonical"[^>]*>)/, `${block}\n    $1`);
  } else {
    // Fallback: insert before </head>
    html = html.replace(/<\/head>/, `${block}\n  </head>`);
  }

  // 3. canonical → per-locale URL
  html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, (_m, o, c) => `${o}${urlEsc}${c}`);

  // 4. og:url → per-locale URL
  html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, (_m, o, c) => `${o}${urlEsc}${c}`);

  // 5. og:locale → per-locale tag
  html = html.replace(/(<meta property="og:locale" content=")[^"]*(")/, (_m, o, c) => `${o}${ogLocale}${c}`);

  return html;
}

/** Per-language localized page meta. English is the source of truth; other
 *  languages hold translated titles + descriptions for the main static
 *  routes. Missing entries fall back to English. */
type MetaEntry = { title: string; description: string };
const PAGE_META: Record<string, Record<string, MetaEntry>> = {
  '/': {
    en: { title: 'Private Hotels in Portugal | Portugal Active',
          description: '{{homes}} private hotels across Minho, Porto, Douro, Lisbon, Alentejo and Algarve. The privacy of a home, the service of a hotel: concierge, private chef, housekeeping. Book direct.' },
    pt: { title: 'Hotéis Privados em Portugal | Portugal Active',
          description: '{{homes}} hotéis privados no Minho, Porto, Douro, Lisboa, Alentejo e Algarve. A privacidade de uma casa, o serviço de um hotel: concierge, chef privado, limpeza. Reserve direto.' },
    es: { title: 'Hoteles Privados en Portugal | Portugal Active',
          description: '{{homes}} hoteles privados en Minho, Oporto, Duero, Lisboa, Alentejo y Algarve. La privacidad de una casa, el servicio de un hotel: concierge, chef privado, limpieza. Reserve directo.' },
    fr: { title: 'Hôtels Privés au Portugal | Portugal Active',
          description: '{{homes}} hôtels privés dans le Minho, à Porto, dans le Douro, à Lisbonne, en Alentejo et en Algarve. L\'intimité d\'une maison, le service d\'un hôtel : conciergerie, chef privé, ménage. Réservez en direct.' },
    de: { title: 'Private Hotels in Portugal | Portugal Active',
          description: '{{homes}} private Hotels in Minho, Porto, Douro, Lissabon, Alentejo und an der Algarve. Die Privatsphäre eines Hauses, der Service eines Hotels: Concierge, Privatkoch, Reinigung. Direkt buchen.' },
    it: { title: 'Hotel Privati in Portogallo | Portugal Active',
          description: '{{homes}} hotel privati tra Minho, Porto, Douro, Lisbona, Alentejo e Algarve. La privacy di una casa, il servizio di un hotel: concierge, chef privato, pulizie. Prenota diretto.' },
    nl: { title: 'Privéhotels in Portugal | Portugal Active',
          description: '{{homes}} privéhotels in Minho, Porto, Douro, Lissabon, Alentejo en de Algarve. De privacy van een huis, de service van een hotel: conciërge, privékok, schoonmaak. Boek direct.' },
    fi: { title: 'Yksityishotellit Portugalissa | Portugal Active',
          description: '{{homes}} yksityishotellia Minhossa, Portossa, Dourossa, Lissabonissa, Alentejossa ja Algarvessa. Kodin yksityisyys, hotellin palvelu: concierge, yksityiskokki, siivous. Varaa suoraan.' },
    sv: { title: 'Privata Hotell i Portugal | Portugal Active',
          description: '{{homes}} privata hotell i Minho, Porto, Douro, Lissabon, Alentejo och Algarve. Ett hems avskildhet, ett hotells service: concierge, privat kock, städning. Boka direkt.' },
  },
  '/homes': {
    en: { title: 'Our Private Hotels in Portugal | Portugal Active',
          description: 'Browse {{homes}} private hotels across Minho, Porto, Douro, Lisbon, Alentejo and Algarve. Private pool, concierge and housekeeping in every home. Book direct for the best rate.' },
    pt: { title: 'Os Nossos Hotéis Privados em Portugal | Portugal Active',
          description: 'Descubra {{homes}} hotéis privados no Minho, Porto, Douro, Lisboa, Alentejo e Algarve. Piscina privada, concierge e limpeza em todas as casas. Reserve direto ao melhor preço.' },
    es: { title: 'Nuestros Hoteles Privados en Portugal | Portugal Active',
          description: 'Descubra {{homes}} hoteles privados en Minho, Oporto, Duero, Lisboa, Alentejo y Algarve. Piscina privada, concierge y limpieza en todas las casas. Reserve directo al mejor precio.' },
    fr: { title: 'Nos Hôtels Privés au Portugal | Portugal Active',
          description: 'Découvrez {{homes}} hôtels privés dans le Minho, à Porto, dans le Douro, à Lisbonne, en Alentejo et en Algarve. Piscine privée, conciergerie et ménage dans chaque maison. Réservez en direct au meilleur tarif.' },
    de: { title: 'Unsere Privaten Hotels in Portugal | Portugal Active',
          description: 'Entdecken Sie {{homes}} private Hotels in Minho, Porto, Douro, Lissabon, Alentejo und an der Algarve. Privater Pool, Concierge und Reinigung in jedem Haus. Direkt buchen zum besten Preis.' },
    it: { title: 'I Nostri Hotel Privati in Portogallo | Portugal Active',
          description: 'Scopri {{homes}} hotel privati tra Minho, Porto, Douro, Lisbona, Alentejo e Algarve. Piscina privata, concierge e pulizie in ogni casa. Prenota diretto al miglior prezzo.' },
    nl: { title: 'Onze Privéhotels in Portugal | Portugal Active',
          description: 'Ontdek {{homes}} privéhotels in Minho, Porto, Douro, Lissabon, Alentejo en de Algarve. Privézwembad, conciërge en schoonmaak in elk huis. Boek direct voor de beste prijs.' },
    fi: { title: 'Yksityishotellimme Portugalissa | Portugal Active',
          description: 'Selaa {{homes}} yksityishotellia Minhossa, Portossa, Dourossa, Lissabonissa, Alentejossa ja Algarvessa. Yksityinen uima-allas, concierge ja siivous jokaisessa kodissa. Varaa suoraan parhaaseen hintaan.' },
    sv: { title: 'Våra Privata Hotell i Portugal | Portugal Active',
          description: 'Utforska {{homes}} privata hotell i Minho, Porto, Douro, Lissabon, Alentejo och Algarve. Privat pool, concierge och städning i varje hem. Boka direkt för bästa pris.' },
  },
  '/destinations': {
    en: { title: 'Destinations in Portugal | Minho, Porto, Algarve & More | Portugal Active',
          description: 'Explore our luxury villa destinations across Portugal — Minho Coast, Porto & Douro, Algarve, Lisbon, Alentejo. Find your perfect region.' },
    pt: { title: 'Destinos em Portugal | Minho, Porto, Algarve e mais | Portugal Active',
          description: 'Explore os nossos destinos de casas de luxo em Portugal — Costa do Minho, Porto e Douro, Algarve, Lisboa, Alentejo. Encontre a sua região perfeita.' },
    es: { title: 'Destinos en Portugal | Miño, Oporto, Algarve y más | Portugal Active',
          description: 'Explora nuestros destinos de villas de lujo en Portugal — Costa de Miño, Oporto y Duero, Algarve, Lisboa, Alentejo. Encuentra tu región perfecta.' },
    fr: { title: 'Destinations au Portugal | Minho, Porto, Algarve et plus | Portugal Active',
          description: 'Découvrez nos destinations de villas de luxe au Portugal — Côte du Minho, Porto et Douro, Algarve, Lisbonne, Alentejo. Trouvez votre région idéale.' },
    de: { title: 'Reiseziele in Portugal | Minho, Porto, Algarve & mehr | Portugal Active',
          description: 'Entdecken Sie unsere Luxusvilla-Reiseziele in ganz Portugal — Minho-Küste, Porto & Douro, Algarve, Lissabon, Alentejo. Finden Sie Ihre perfekte Region.' },
    it: { title: 'Destinazioni in Portogallo | Minho, Porto, Algarve e oltre | Portugal Active',
          description: 'Esplora le nostre destinazioni di ville di lusso in tutto il Portogallo — Costa del Minho, Porto e Douro, Algarve, Lisbona, Alentejo.' },
    nl: { title: 'Bestemmingen in Portugal | Minho, Porto, Algarve & meer | Portugal Active',
          description: 'Ontdek onze luxe villabestemmingen in heel Portugal — Minho-kust, Porto & Douro, Algarve, Lissabon, Alentejo. Vind jouw perfecte regio.' },
    fi: { title: 'Kohteet Portugalissa | Minho, Porto, Algarve ja muut | Portugal Active',
          description: 'Tutustu luksushuvilakohteisiimme Portugalissa — Minhon rannikko, Porto ja Douro, Algarve, Lissabon, Alentejo. Löydä täydellinen alueesi.' },
    sv: { title: 'Destinationer i Portugal | Minho, Porto, Algarve & mer | Portugal Active',
          description: 'Utforska våra lyxvillor i Portugal — Minhokusten, Porto & Douro, Algarve, Lissabon, Alentejo. Hitta din perfekta region.' },
  },
  '/services': {
    en: { title: 'Luxury Concierge Services | Private Chef, Spa, Transfers | Portugal Active',
          description: 'Elevate your villa stay with private chef, in-house spa, airport transfers, and bespoke experiences. Book alongside your villa.' },
    pt: { title: 'Serviços de Concierge de Luxo | Chef Privado, Spa, Transfers | Portugal Active',
          description: 'Eleve a sua estadia com chef privado, spa ao domicílio, transfers aeroporto e experiências à medida. Reserve junto com a sua casa.' },
    es: { title: 'Servicios de Conserjería de Lujo | Chef Privado, Spa, Traslados | Portugal Active',
          description: 'Eleva tu estancia con chef privado, spa a domicilio, traslados al aeropuerto y experiencias a medida. Reserva junto con tu villa.' },
    fr: { title: 'Conciergerie de Luxe | Chef Privé, Spa, Transferts | Portugal Active',
          description: 'Sublimez votre séjour avec chef privé, spa à domicile, transferts aéroport et expériences sur mesure. Réservez avec votre villa.' },
    de: { title: 'Luxus-Concierge-Services | Privatkoch, Spa, Transfers | Portugal Active',
          description: 'Veredeln Sie Ihren Aufenthalt mit Privatkoch, Haus-Spa, Flughafentransfers und individuellen Erlebnissen. Buchen Sie zusammen mit Ihrer Villa.' },
    it: { title: 'Servizi di Concierge di Lusso | Chef Privato, Spa, Trasferimenti | Portugal Active',
          description: 'Arricchisci il tuo soggiorno con chef privato, spa in villa, trasferimenti aeroporto ed esperienze su misura. Prenota insieme alla tua villa.' },
    nl: { title: 'Luxe Conciërgediensten | Privékok, Spa, Transfers | Portugal Active',
          description: 'Verhef je verblijf met privékok, in-house spa, luchthaventransfers en exclusieve ervaringen. Boek samen met je villa.' },
    fi: { title: 'Luksus-conciergepalvelut | Yksityiskokki, Kylpylä, Kuljetukset | Portugal Active',
          description: 'Kruunaa huvilalomasi yksityiskokilla, kotikylpylällä, lentokenttäkuljetuksilla ja räätälöidyillä elämyksillä. Varaa huvilan kanssa.' },
    sv: { title: 'Lyxiga Concierge-tjänster | Privat Kock, Spa, Transfer | Portugal Active',
          description: 'Lyft din vistelse med privat kock, hemspa, flygplatstransfer och skräddarsydda upplevelser. Boka tillsammans med din villa.' },
  },
  '/experiences': {
    en: { title: 'Curated Experiences in Portugal — Private Chef, Spa, Wine Tours | Portugal Active',
          description: 'Exclusive guest experiences: private chef dining, in-villa spa, wine tastings, cultural tours. Available only when staying at a Portugal Active property. Book your experience.' },
    pt: { title: 'Aventuras em Portugal | Equitação, Canyoning e Surf | Portugal Active',
          description: 'Atividades de aventura guiadas em todo Portugal — equitação, canyoning, surf, caminhadas, provas de vinho e mais. Reserve direto no Minho, Porto ou Algarve.' },
    es: { title: 'Aventuras en Portugal | Equitación, Barranquismo y Surf | Portugal Active',
          description: 'Actividades de aventura guiadas en todo Portugal — equitación, barranquismo, surf, senderismo, catas de vino y más. Reserva directo en Miño, Oporto o Algarve.' },
    fr: { title: 'Aventures au Portugal | Équitation, Canyoning et Surf | Portugal Active',
          description: 'Activités d\'aventure guidées à travers le Portugal — équitation, canyoning, surf, randonnée, œnotourisme et plus. Réservation directe au Minho, Porto ou Algarve.' },
    de: { title: 'Abenteueraktivitäten in Portugal | Reiten, Canyoning & Surfen | Portugal Active',
          description: 'Geführte Abenteueraktivitäten in ganz Portugal — Reiten, Canyoning, Surfen, Wandern, Weintouren und mehr. Direkt buchen in Minho, Porto oder Algarve.' },
    it: { title: 'Avventure in Portogallo | Equitazione, Canyoning e Surf | Portugal Active',
          description: 'Attività d\'avventura guidate in tutto il Portogallo — equitazione, canyoning, surf, escursioni, tour del vino e altro. Prenota diretto a Minho, Porto o Algarve.' },
    nl: { title: 'Avonturen in Portugal | Paardrijden, Canyoning & Surfen | Portugal Active',
          description: 'Begeleide avonturenactiviteiten in heel Portugal — paardrijden, canyoning, surfen, wandelen, wijntochten en meer. Direct boeken in Minho, Porto of Algarve.' },
    fi: { title: 'Seikkailut Portugalissa | Ratsastus, Canyoning ja Surffaus | Portugal Active',
          description: 'Opastetut seikkailuaktiviteetit ympäri Portugalia — ratsastus, canyoning, surffaus, vaellus, viinikierrokset ja muuta. Varaa suoraan Minhossa, Portossa tai Algarvessa.' },
    sv: { title: 'Äventyr i Portugal | Ridning, Canyoning & Surf | Portugal Active',
          description: 'Guidade äventyrsaktiviteter runt om i Portugal — ridning, canyoning, surf, vandring, vintouring med mera. Boka direkt i Minho, Porto eller Algarve.' },
  },
  '/adventures': {
    en: { title: 'Adventures in Portugal — Horseback Riding, Off-Road, Water Sports | Portugal Active',
          description: 'Discover unique adventure experiences across Portugal. From horseback riding in the Alentejo to off-road tours in the Algarve. Book private, curated experiences for families and groups.' },
    pt: { title: 'Aventuras em Portugal | Equitação, Canyoning e Surf | Portugal Active',
          description: 'Atividades de aventura guiadas em todo Portugal — equitação, canyoning, surf, caminhadas, provas de vinho e mais. Reserve direto no Minho, Porto ou Algarve.' },
    es: { title: 'Aventuras en Portugal | Equitación, Barranquismo y Surf | Portugal Active',
          description: 'Actividades de aventura guiadas en todo Portugal — equitación, barranquismo, surf, senderismo, catas de vino y más. Reserva directo en Miño, Oporto o Algarve.' },
    fr: { title: 'Aventures au Portugal | Équitation, Canyoning et Surf | Portugal Active',
          description: 'Activités d\'aventure guidées à travers le Portugal — équitation, canyoning, surf, randonnée, œnotourisme et plus. Réservation directe au Minho, Porto ou Algarve.' },
    de: { title: 'Abenteueraktivitäten in Portugal | Reiten, Canyoning & Surfen | Portugal Active',
          description: 'Geführte Abenteueraktivitäten in ganz Portugal — Reiten, Canyoning, Surfen, Wandern, Weintouren und mehr. Direkt buchen in Minho, Porto oder Algarve.' },
    it: { title: 'Avventure in Portogallo | Equitazione, Canyoning e Surf | Portugal Active',
          description: 'Attività d\'avventura guidate in tutto il Portogallo — equitazione, canyoning, surf, escursioni, tour del vino e altro. Prenota diretto a Minho, Porto o Algarve.' },
    nl: { title: 'Avonturen in Portugal | Paardrijden, Canyoning & Surfen | Portugal Active',
          description: 'Begeleide avonturenactiviteiten in heel Portugal — paardrijden, canyoning, surfen, wandelen, wijntochten en meer. Direct boeken in Minho, Porto of Algarve.' },
    fi: { title: 'Seikkailut Portugalissa | Ratsastus, Canyoning ja Surffaus | Portugal Active',
          description: 'Opastetut seikkailuaktiviteetit ympäri Portugalia — ratsastus, canyoning, surffaus, vaellus, viinikierrokset ja muuta. Varaa suoraan Minhossa, Portossa tai Algarvessa.' },
    sv: { title: 'Äventyr i Portugal | Ridning, Canyoning & Surf | Portugal Active',
          description: 'Guidade äventyrsaktiviteter runt om i Portugal — ridning, canyoning, surf, vandring, vintouring med mera. Boka direkt i Minho, Porto eller Algarve.' },
  },
  '/events': {
    en: { title: 'Private Events Portugal | Weddings, Retreats, Celebrations | Portugal Active',
          description: 'Host weddings, corporate retreats, and private celebrations in luxury Portuguese villas. Full event planning and concierge.' },
    pt: { title: 'Eventos Privados em Portugal | Casamentos, Retiros, Celebrações | Portugal Active',
          description: 'Acolha casamentos, retiros corporativos e celebrações privadas em casas de luxo portuguesas. Planeamento completo e concierge.' },
    es: { title: 'Eventos Privados en Portugal | Bodas, Retiros, Celebraciones | Portugal Active',
          description: 'Organiza bodas, retiros corporativos y celebraciones privadas en villas portuguesas de lujo. Planificación completa y conserjería.' },
    fr: { title: 'Événements Privés au Portugal | Mariages, Retraites, Célébrations | Portugal Active',
          description: 'Accueillez mariages, séminaires d\'entreprise et célébrations privées dans des villas portugaises de luxe. Organisation complète et conciergerie.' },
    de: { title: 'Private Events in Portugal | Hochzeiten, Retreats, Feiern | Portugal Active',
          description: 'Veranstalten Sie Hochzeiten, Firmen-Retreats und private Feiern in portugiesischen Luxusvillen. Komplette Eventplanung und Concierge.' },
    it: { title: 'Eventi Privati in Portogallo | Matrimoni, Ritiri, Celebrazioni | Portugal Active',
          description: 'Organizza matrimoni, ritiri aziendali e celebrazioni private in ville portoghesi di lusso. Pianificazione completa e concierge.' },
    nl: { title: 'Privé-evenementen in Portugal | Bruiloften, Retraites, Vieringen | Portugal Active',
          description: 'Organiseer bruiloften, zakelijke retraites en privévieringen in Portugese luxevilla\'s. Volledige eventplanning en conciërge.' },
    fi: { title: 'Yksityistapahtumat Portugalissa | Häät, Retriitit, Juhlat | Portugal Active',
          description: 'Järjestä häitä, yritysretriittejä ja yksityisjuhlia portugalilaisissa luksushuviloissa. Täysi tapahtumasuunnittelu ja concierge.' },
    sv: { title: 'Privata Evenemang i Portugal | Bröllop, Retreater, Firanden | Portugal Active',
          description: 'Arrangera bröllop, företagsretreater och privata firanden i portugisiska lyxvillor. Fullständig eventplanering och concierge.' },
  },
  '/about': {
    en: { title: 'About Portugal Active | Private Hotels in Portugal',
          description: 'We operate {{homes}} private hotels across Portugal end to end — bookings, concierge, housekeeping. The privacy of a home, the service of a hotel, since 2017.' },
    pt: { title: 'Sobre a Portugal Active | Hotéis Privados em Portugal',
          description: 'Operamos {{homes}} hotéis privados em todo Portugal de ponta a ponta — reservas, concierge, limpeza. A privacidade de uma casa, o serviço de um hotel, desde 2017.' },
    es: { title: 'Sobre Portugal Active | Hoteles Privados en Portugal',
          description: 'Operamos {{homes}} hoteles privados en todo Portugal de principio a fin — reservas, concierge, limpieza. La privacidad de una casa, el servicio de un hotel, desde 2017.' },
    fr: { title: 'À propos de Portugal Active | Hôtels Privés au Portugal',
          description: 'Nous exploitons {{homes}} hôtels privés à travers le Portugal de A à Z — réservations, conciergerie, ménage. L\'intimité d\'une maison, le service d\'un hôtel, depuis 2017.' },
    de: { title: 'Über Portugal Active | Private Hotels in Portugal',
          description: 'Wir betreiben {{homes}} private Hotels in ganz Portugal vollumfänglich — Buchungen, Concierge, Reinigung. Die Privatsphäre eines Hauses, der Service eines Hotels, seit 2017.' },
    it: { title: 'Chi siamo | Portugal Active | Hotel Privati in Portogallo',
          description: 'Gestiamo {{homes}} hotel privati in tutto il Portogallo dall\'inizio alla fine — prenotazioni, concierge, pulizie. La privacy di una casa, il servizio di un hotel, dal 2017.' },
    nl: { title: 'Over Portugal Active | Privéhotels in Portugal',
          description: 'Wij exploiteren {{homes}} privéhotels in heel Portugal van A tot Z — boekingen, conciërge, schoonmaak. De privacy van een huis, de service van een hotel, sinds 2017.' },
    fi: { title: 'Tietoa Portugal Activesta | Yksityishotellit Portugalissa',
          description: 'Operoimme {{homes}} yksityishotellia ympäri Portugalia kokonaisvaltaisesti — varaukset, concierge, siivous. Kodin yksityisyys, hotellin palvelu, vuodesta 2017.' },
    sv: { title: 'Om Portugal Active | Privata Hotell i Portugal',
          description: 'Vi driver {{homes}} privata hotell över hela Portugal från A till Ö — bokningar, concierge, städning. Ett hems avskildhet, ett hotells service, sedan 2017.' },
  },
  '/contact': {
    en: { title: 'Contact Portugal Active | Plan Your Stay in Portugal',
          description: 'Plan your Portugal stay with our concierge team. Luxury villa rentals, private chef, outdoor adventures. Phone, WhatsApp or email — we reply within 2 hours.' },
    pt: { title: 'Contacto Portugal Active | Planeie a sua estadia em Portugal',
          description: 'Planeie a sua estadia em Portugal com a nossa equipa de concierge. Casas privadas, chef privado, aventuras. Telefone, WhatsApp ou email — resposta em 2 horas.' },
    es: { title: 'Contacto Portugal Active | Planifica tu estancia en Portugal',
          description: 'Planifica tu estancia en Portugal con nuestro equipo de conserjería. Villas privadas, chef privado, aventuras. Teléfono, WhatsApp o email — respondemos en 2 horas.' },
    fr: { title: 'Contact Portugal Active | Planifiez votre séjour au Portugal',
          description: 'Planifiez votre séjour au Portugal avec notre conciergerie. Villas privées, chef privé, aventures. Téléphone, WhatsApp ou email — réponse sous 2 heures.' },
    de: { title: 'Kontakt Portugal Active | Planen Sie Ihren Portugal-Aufenthalt',
          description: 'Planen Sie Ihren Portugal-Aufenthalt mit unserem Concierge-Team. Private Villen, Privatkoch, Abenteuer. Telefon, WhatsApp oder E-Mail — Antwort binnen 2 Stunden.' },
    it: { title: 'Contatta Portugal Active | Pianifica il tuo soggiorno in Portogallo',
          description: 'Pianifica il tuo soggiorno in Portogallo con il nostro team concierge. Ville private, chef privato, avventure. Telefono, WhatsApp o email — rispondiamo in 2 ore.' },
    nl: { title: 'Contact Portugal Active | Plan uw verblijf in Portugal',
          description: 'Plan uw verblijf in Portugal met ons conciërgeteam. Privévilla\'s, privékok, avonturen. Telefoon, WhatsApp of e-mail — antwoord binnen 2 uur.' },
    fi: { title: 'Ota yhteyttä | Portugal Active | Suunnittele Portugalin-lomasi',
          description: 'Suunnittele Portugalin-lomasi concierge-tiimimme kanssa. Yksityiset huvilat, yksityiskokki, seikkailut. Puhelin, WhatsApp tai sähköposti — vastaus 2 tunnissa.' },
    sv: { title: 'Kontakta Portugal Active | Planera din vistelse i Portugal',
          description: 'Planera din Portugalvistelse med vårt concierge-team. Privata villor, privat kock, äventyr. Telefon, WhatsApp eller e-post — svar inom 2 timmar.' },
  },
  '/owners': {
    en: { title: 'Property Management Portugal | Portugal Active for Owners',
          description: 'Maximise your rental income. Full-service villa management — marketing, bookings, housekeeping, maintenance, guest concierge.' },
    pt: { title: 'Gestão de Alojamento Portugal | Portugal Active para Proprietários',
          description: 'Maximize a receita do seu alojamento. Gestão completa — marketing, reservas, limpeza, manutenção, concierge aos hóspedes.' },
    es: { title: 'Gestión de Propiedades Portugal | Portugal Active para Propietarios',
          description: 'Maximiza los ingresos de tu alquiler. Gestión integral — marketing, reservas, limpieza, mantenimiento, conserjería de huéspedes.' },
    fr: { title: 'Gestion Locative Portugal | Portugal Active pour Propriétaires',
          description: 'Maximisez vos revenus locatifs. Gestion complète — marketing, réservations, ménage, maintenance, conciergerie invités.' },
    de: { title: 'Immobilienverwaltung Portugal | Portugal Active für Eigentümer',
          description: 'Maximieren Sie Ihre Mieteinnahmen. Full-Service-Verwaltung — Marketing, Buchungen, Reinigung, Instandhaltung, Gäste-Concierge.' },
    it: { title: 'Gestione Immobiliare Portogallo | Portugal Active per Proprietari',
          description: 'Massimizza i tuoi ricavi da affitto. Gestione completa — marketing, prenotazioni, pulizie, manutenzione, concierge ospiti.' },
    nl: { title: 'Vastgoedbeheer Portugal | Portugal Active voor Eigenaren',
          description: 'Maximaliseer uw verhuurinkomsten. Volledig villabeheer — marketing, boekingen, schoonmaak, onderhoud, gastenconciërge.' },
    fi: { title: 'Kiinteistönhallinta Portugalissa | Portugal Active omistajille',
          description: 'Maksimoi vuokratulosi. Kokonaisvaltainen hallinta — markkinointi, varaukset, siivous, huolto, vieras-concierge.' },
    sv: { title: 'Fastighetsförvaltning Portugal | Portugal Active för Ägare',
          description: 'Maximera dina uthyrningsintäkter. Fullservice-förvaltning — marknadsföring, bokningar, städning, underhåll, gästconcierge.' },
  },
  '/blog': {
    en: { title: 'Portugal Travel Journal | Guides, Tips & Inspiration | Portugal Active',
          description: 'Insider guides to Portugal — best beaches, hidden restaurants, wine regions, and travel tips from our local concierge team.' },
    pt: { title: 'Diário de Viagem Portugal | Guias, Dicas e Inspiração | Portugal Active',
          description: 'Guias insider de Portugal — as melhores praias, restaurantes escondidos, regiões vinhateiras e dicas da nossa equipa local.' },
    es: { title: 'Diario de Viaje Portugal | Guías, Consejos e Inspiración | Portugal Active',
          description: 'Guías insider de Portugal — las mejores playas, restaurantes ocultos, regiones vinícolas y consejos de nuestro equipo local.' },
    fr: { title: 'Journal de Voyage Portugal | Guides, Conseils et Inspiration | Portugal Active',
          description: 'Guides d\'initiés du Portugal — meilleures plages, restaurants cachés, régions viticoles et conseils de notre équipe locale.' },
    de: { title: 'Portugal Reisejournal | Guides, Tipps & Inspiration | Portugal Active',
          description: 'Insider-Guides für Portugal — die besten Strände, versteckte Restaurants, Weinregionen und Reisetipps von unserem lokalen Team.' },
    it: { title: 'Diario di Viaggio Portogallo | Guide, Consigli e Ispirazione | Portugal Active',
          description: 'Guide da insider sul Portogallo — le migliori spiagge, ristoranti nascosti, regioni vinicole e consigli dal nostro team locale.' },
    nl: { title: 'Portugal Reisjournaal | Gidsen, Tips & Inspiratie | Portugal Active',
          description: 'Insider-gidsen van Portugal — beste stranden, verborgen restaurants, wijnregio\'s en reistips van ons lokale conciërgeteam.' },
    fi: { title: 'Portugal-matkapäiväkirja | Oppaat, Vinkit ja Inspiraatio | Portugal Active',
          description: 'Insider-oppaat Portugaliin — parhaat rannat, piilotetut ravintolat, viinialueet ja matkavinkit paikalliselta concierge-tiimiltämme.' },
    sv: { title: 'Portugal Resejournal | Guider, Tips & Inspiration | Portugal Active',
          description: 'Insider-guider till Portugal — bästa stränderna, dolda restauranger, vindistrikt och resetips från vårt lokala concierge-team.' },
  },
  '/faq': {
    en: { title: 'FAQ | Portugal Active',
          description: 'Answers to common questions about booking, cancellation, check-in, concierge services, and villa management with Portugal Active.' },
    pt: { title: 'Perguntas Frequentes | Portugal Active',
          description: 'Respostas às questões mais comuns sobre reservas, cancelamento, check-in, serviços de concierge e gestão de casas com a Portugal Active.' },
    es: { title: 'Preguntas Frecuentes | Portugal Active',
          description: 'Respuestas a preguntas comunes sobre reservas, cancelación, check-in, conserjería y gestión de villas con Portugal Active.' },
    fr: { title: 'FAQ | Portugal Active',
          description: 'Réponses aux questions courantes sur les réservations, annulation, arrivée, conciergerie et gestion de villas avec Portugal Active.' },
    de: { title: 'FAQ | Portugal Active',
          description: 'Antworten auf häufige Fragen zu Buchung, Stornierung, Check-in, Concierge-Services und Villa-Management mit Portugal Active.' },
    it: { title: 'Domande Frequenti | Portugal Active',
          description: 'Risposte alle domande comuni su prenotazioni, cancellazione, check-in, servizi concierge e gestione ville con Portugal Active.' },
    nl: { title: 'Veelgestelde Vragen | Portugal Active',
          description: 'Antwoorden op veelgestelde vragen over boeken, annuleren, inchecken, conciërgediensten en villabeheer met Portugal Active.' },
    fi: { title: 'UKK | Portugal Active',
          description: 'Vastaukset yleisimpiin kysymyksiin varauksista, peruutuksista, sisäänkirjautumisesta, concierge-palveluista ja huviloiden hallinnasta.' },
    sv: { title: 'Vanliga Frågor | Portugal Active',
          description: 'Svar på vanliga frågor om bokning, avbokning, incheckning, concierge-tjänster och villaförvaltning med Portugal Active.' },
  },
  '/careers': {
    en: { title: 'Careers at Portugal Active | Join Our Hospitality Team',
          description: 'Work in luxury hospitality across Portugal. Open roles in concierge, property management, and guest experience. Join the Portugal Active team.' },
    pt: { title: 'Carreiras na Portugal Active | Junta-te à Nossa Equipa',
          description: 'Trabalha na hotelaria de luxo em Portugal. Vagas em concierge, gestão de propriedades e experiência do hóspede. Junta-te à equipa Portugal Active.' },
  },
  '/concierge': {
    en: { title: 'Luxury Concierge Services | Private Chef, Spa, Transfers | Portugal Active',
          description: 'Elevate your villa stay with private chef, in-house spa, airport transfers, and bespoke experiences. Book alongside your villa.' },
  },
  '/legal/privacy': {
    en: { title: 'Privacy Policy | Portugal Active',
          description: 'How Portugal Active collects, uses and protects your personal data. GDPR compliant.' },
  },
  '/legal/terms': {
    en: { title: 'Terms & Conditions | Portugal Active',
          description: 'Terms and conditions for booking holiday properties and experiences with Portugal Active.' },
  },
  '/best-rate-guarantee': {
    en: { title: 'Best Rate Guarantee | Portugal Active',
          description: 'Find the same home, dates and conditions cheaper on Airbnb or Booking.com no later than 24 hours after booking and Portugal Active matches the price. The terms, in plain words.' },
    pt: { title: 'Garantia de Melhor Preço | Portugal Active',
          description: 'Encontre a mesma casa, datas e condições mais baratas no Airbnb ou na Booking.com até 24 horas após a reserva e a Portugal Active iguala o preço. As condições, em palavras simples.' },
    es: { title: 'Garantía de Mejor Precio | Portugal Active',
          description: 'Encuentre la misma casa, fechas y condiciones más baratas en Airbnb o Booking.com en las 24 horas siguientes a la reserva y Portugal Active iguala el precio. Las condiciones, en palabras sencillas.' },
    fr: { title: 'Garantie du Meilleur Tarif | Portugal Active',
          description: 'Trouvez la même maison, les mêmes dates et conditions moins cher sur Airbnb ou Booking.com dans les 24 heures suivant la réservation et Portugal Active s\'aligne. Les conditions, en termes simples.' },
    it: { title: 'Garanzia del Miglior Prezzo | Portugal Active',
          description: 'Trovi la stessa casa, date e condizioni a meno su Airbnb o Booking.com entro 24 ore dalla prenotazione e Portugal Active pareggia il prezzo. Le condizioni, in parole semplici.' },
    de: { title: 'Bestpreisgarantie | Portugal Active',
          description: 'Finden Sie dasselbe Haus, dieselben Daten und Bedingungen innerhalb von 24 Stunden nach der Buchung günstiger auf Airbnb oder Booking.com, gleicht Portugal Active den Preis an. Die Bedingungen, einfach erklärt.' },
    nl: { title: 'Beste-prijsgarantie | Portugal Active',
          description: 'Vindt u hetzelfde huis, dezelfde data en voorwaarden binnen 24 uur na uw boeking goedkoper op Airbnb of Booking.com, dan past Portugal Active de prijs aan. De voorwaarden, in gewone taal.' },
    sv: { title: 'Bästa-pris-garanti | Portugal Active',
          description: 'Hittar du samma hem, datum och villkor billigare på Airbnb eller Booking.com inom 24 timmar från bokningen matchar Portugal Active priset. Villkoren, med enkla ord.' },
    fi: { title: 'Parhaan hinnan takuu | Portugal Active',
          description: 'Löydä sama koti, päivämäärät ja ehdot halvemmalla Airbnb:stä tai Booking.comista 24 tunnin kuluessa varauksesta, niin Portugal Active vastaa hintaan. Ehdot selkokielellä.' },
  },
  '/legal/cookies': {
    en: { title: 'Cookie Policy | Portugal Active',
          description: 'How Portugal Active uses cookies to improve your browsing experience.' },
  },
};

/** Look up localized meta for a static path with graceful fallback to English. */
/** Brand numbers inside PAGE_META are tokens ({{homes}}) filled from shared/brandFacts. */
function fillBrandTokens(m: MetaEntry): MetaEntry {
  const fill = (t: string) => t.replace(/\{\{homes\}\}/g, HOME_COUNT_LABEL);
  return { title: fill(m.title), description: fill(m.description) };
}

function getPageMeta(path: string, lang: string): MetaEntry | null {
  const entry = PAGE_META[path];
  if (!entry) return null;
  const m = entry[lang] ?? entry.en ?? null;
  return m ? fillBrandTokens(m) : null;
}

function injectMeta(html: string, meta: {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: string;
}): string {
  const title = escText(meta.title);
  const description = escAttr(meta.description);
  const image = escAttr(meta.image ?? 'https://www.portugalactive.com/hero/home-cliff-villa.webp');
  const url = escAttr(meta.url);
  const type = escAttr(meta.type ?? 'website');

  return html
    .replace(/(<title>)[^<]*(<\/title>)/, (_m, open, close) => `${open}${title}${close}`)
    .replace(/(<meta name="description" content=")[^"]*(")/,          (_m, open, close) => `${open}${description}${close}`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,                 (_m, open, close) => `${open}${url}${close}`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,         (_m, open, close) => `${open}${title}${close}`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,   (_m, open, close) => `${open}${description}${close}`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/,         (_m, open, close) => `${open}${image}${close}`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,           (_m, open, close) => `${open}${url}${close}`)
    .replace(/(<meta property="og:type" content=")[^"]*(")/,          (_m, open, close) => `${open}${type}${close}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,        (_m, open, close) => `${open}${title}${close}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/,  (_m, open, close) => `${open}${description}${close}`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/,        (_m, open, close) => `${open}${image}${close}`);
}

/** Inject a JSON-LD <script> into <head>. The domId follows the client
 *  StructuredData convention (`sd-{id}`); the client component removes any
 *  element with that id before appending its own, so hydration cleanly
 *  replaces the server-rendered schema — zero duplication. */
function injectSchemaGraph(html: string, domId: string, graph: Record<string, unknown>): string {
  // Escape `<` to prevent the JSON payload from prematurely closing the script.
  const json = JSON.stringify(graph).replace(/</g, '\\u003c');
  const tag = `<script type="application/ld+json" id="${domId}">${json}</script>`;
  return html.replace('</head>', `    ${tag}\n  </head>`);
}

const DESTINATION_NAME: Record<string, string> = {
  'minho': 'Minho Coast',
  'porto': 'Porto & Douro',
  'lisbon': 'Lisbon',
  'alentejo': 'Alentejo',
  'algarve': 'Algarve',
};

/** Build the VacationRental + BreadcrumbList @graph for a property page.
 *  Mirrors the client buildVacationRentalSchema so the server-rendered schema
 *  is consistent with what the SPA would emit after hydration. This is what
 *  makes property rich results / AI-citation eligible on Google's first pass,
 *  since the SPA body is otherwise empty until JS executes. */
/** Guesty's bed enum → the human wording Google's BedDetails expects. */
const BED_TYPE_LABEL: Record<string, string> = {
  KING_BED: 'King Bed',
  QUEEN_BED: 'Queen Bed',
  DOUBLE_BED: 'Double Bed',
  SINGLE_BED: 'Single Bed',
  SOFA_BED: 'Sofa Bed',
  BUNK_BED: 'Bunk Bed',
};

/** schema.org accommodation subtype for a Guesty propertyType. Anything we do
 *  not recognise stays absent rather than guessing — a wrong type is worse
 *  than none. */
const ACCOMMODATION_TYPE: Record<string, string> = {
  Villa: 'https://schema.org/House',
  House: 'https://schema.org/House',
  Townhouse: 'https://schema.org/House',
  Apartment: 'https://schema.org/Apartment',
};

/**
 * The Accommodation that the rental contains — Google's `containsPlace`.
 *
 * Search Console reported this missing on every indexed home, alongside
 * `identifier`, which is what makes a VacationRental ineligible for the rich
 * result (the card with photos, price and rating) and leaves it as a plain
 * blue link. The data was already synced from Guesty — bedrooms with their
 * bed configuration, bathroom counts, floor area — it simply was never
 * emitted.
 */
function buildContainsPlace(prop: any): Record<string, unknown> | undefined {
  const rooms: any[] = Array.isArray(prop.rooms) ? prop.rooms : [];

  const beds = rooms
    .flatMap((room: any) => (Array.isArray(room?.beds) ? room.beds : []))
    .map((bed: any) => {
      const label = BED_TYPE_LABEL[String(bed?.type ?? '')];
      const qty = Number(bed?.quantity);
      if (!label || !Number.isFinite(qty) || qty <= 0) return null;
      return { '@type': 'BedDetails', numberOfBeds: qty, typeOfBed: label };
    })
    .filter(Boolean);

  const accommodation: Record<string, unknown> = { '@type': 'Accommodation' };

  const additionalType = ACCOMMODATION_TYPE[String(prop.propertyType ?? '')];
  if (additionalType) accommodation.additionalType = additionalType;
  if (prop.bedrooms != null) accommodation.numberOfBedrooms = prop.bedrooms;
  if (prop.bathrooms != null) accommodation.numberOfBathroomsTotal = prop.bathrooms;
  if (rooms.length) accommodation.numberOfRooms = rooms.length;
  if (beds.length) accommodation.bed = beds;
  if (prop.maxGuests != null) {
    accommodation.occupancy = { '@type': 'QuantitativeValue', value: prop.maxGuests, unitCode: 'C62' };
  }
  // Guesty stores square FEET despite the villas being metric; FTK is the
  // UN/CEFACT code for square foot, so declare what we actually have rather
  // than converting and introducing rounding we cannot verify.
  const area = Number(prop.areaSquareFeet);
  if (Number.isFinite(area) && area > 0) {
    accommodation.floorSize = { '@type': 'QuantitativeValue', value: area, unitCode: 'FTK' };
  }

  // A bare {"@type":"Accommodation"} tells Google nothing — omit it instead.
  return Object.keys(accommodation).length > 1 ? accommodation : undefined;
}

function buildPropertyGraph(prop: any, lang: string): Record<string, unknown> {
  const url = `${BOT_BASE_URL}/${lang}/homes/${prop.slug}`;
  const name = getDisplayName(prop) || 'Property';
  // Google wants at least 8 images on a VacationRental; the old cap of 6 sat
  // just under it. The homes carry 70+, so 12 clears the bar with room spare
  // without bloating the embedded JSON.
  const images = Array.isArray(prop.images) ? prop.images.slice(0, 12) : [];

  // Amenities arrive either as a flat array or a grouped dict { property: [...] }.
  let amenities: string[] = [];
  if (Array.isArray(prop.amenities)) {
    amenities = prop.amenities.filter((a: any) => typeof a === 'string');
  } else if (prop.amenities && typeof prop.amenities === 'object') {
    amenities = Object.values(prop.amenities)
      .flat()
      .filter((a: any) => typeof a === 'string') as string[];
  }

  const lat = typeof prop.address?.lat === 'number' ? prop.address.lat : prop.latitude;
  const lng = typeof prop.address?.lng === 'number' ? prop.address.lng : prop.longitude;
  const region = prop.address?.state || DESTINATION_NAME[prop.destination] || undefined;
  const priceFrom = Number(prop.priceFrom ?? prop.pricePerNight ?? 0);

  const vacationRental: Record<string, unknown> = {
    '@type': 'VacationRental',
    '@id': url,
    name,
    url,
    ...(prop.description && { description: String(prop.description).replace(/\s+/g, ' ').trim().slice(0, 500) }),
    ...(images.length > 0 && { image: images }),
    ...(prop.bedrooms != null && { numberOfBedrooms: prop.bedrooms }),
    ...(prop.bathrooms != null && { numberOfBathroomsTotal: prop.bathrooms }),
    ...(prop.maxGuests != null && {
      occupancy: { '@type': 'QuantitativeValue', maxValue: prop.maxGuests, unitCode: 'C62' },
    }),
    ...(amenities.length > 0 && {
      amenityFeature: amenities.slice(0, 30).map((a) => ({
        '@type': 'LocationFeatureSpecification', name: a, value: true,
      })),
    }),
    ...(typeof prop.petsAllowed === 'boolean' && { petsAllowed: prop.petsAllowed }),
    address: {
      '@type': 'PostalAddress',
      ...(prop.locality && { addressLocality: prop.locality }),
      ...(region && { addressRegion: region }),
      addressCountry: 'PT',
    },
    ...(typeof lat === 'number' && typeof lng === 'number' && {
      geo: { '@type': 'GeoCoordinates', latitude: lat, longitude: lng },
    }),
    ...(priceFrom > 0 && {
      priceRange: `From €${priceFrom} per night`,
      offers: {
        '@type': 'Offer',
        priceCurrency: 'EUR',
        price: priceFrom,
        availability: 'https://schema.org/InStock',
        url,
        priceValidUntil: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
      },
    }),
    ...(prop.averageRating && prop.reviewCount > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: prop.averageRating,
        reviewCount: prop.reviewCount,
        bestRating: 5,
        worstRating: 1,
      },
    }),
    // Brand, not Organization: the merchant-listing validator rejects the
    // latter with "invalid object type for field brand".
    brand: { '@type': 'Brand', name: 'Portugal Active', url: BOT_BASE_URL },
    // Stable id for the listing across our site and the channels it is synced
    // to. Google requires it on VacationRental; the Guesty id is the one value
    // that survives a slug rename, which is exactly what it is for.
    ...(prop.guestyId && {
      identifier: {
        '@type': 'PropertyValue',
        propertyID: 'PortugalActiveListingId',
        value: String(prop.guestyId),
      },
    }),
    ...(ACCOMMODATION_TYPE[String(prop.propertyType ?? '')] && {
      additionalType: ACCOMMODATION_TYPE[String(prop.propertyType ?? '')],
    }),
    ...(buildContainsPlace(prop) && { containsPlace: buildContainsPlace(prop) }),
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BOT_BASE_URL}/${lang}` },
      { '@type': 'ListItem', position: 2, name: 'Homes', item: `${BOT_BASE_URL}/${lang}/homes` },
      { '@type': 'ListItem', position: 3, name },
    ],
  };

  // Mirror the client's "Good to know" FAQ so crawlers that don't execute JS
  // (most AI crawlers) see the same FAQPage the hydrated page emits. en+pt
  // templates, en fallback elsewhere — same pattern as collections meta.
  const pt = lang === 'pt';
  const faq: Array<{ q: string; a: string }> = [];
  if (prop.maxGuests != null) {
    faq.push(pt
      ? { q: `Quantos hóspedes pode receber ${name}?`, a: `${name} recebe até ${prop.maxGuests} hóspedes em ${prop.bedrooms} quartos com ${prop.bathrooms} casas de banho.` }
      : { q: `How many guests can ${name} sleep?`, a: `${name} sleeps up to ${prop.maxGuests} guests across ${prop.bedrooms} bedrooms with ${prop.bathrooms} bathrooms.` });
  }
  if (prop.petsAllowed === true) {
    faq.push(pt
      ? { q: 'Posso levar o meu animal de estimação?', a: `Sim — ${name} aceita animais de estimação. Avisa-nos ao reservar; pode aplicar-se uma pequena taxa adicional.` }
      : { q: 'Can I bring my pet?', a: `Yes — ${name} welcomes pets. Let us know when you book; a small additional fee may apply.` });
  }
  // No hardcoded night count — the synced terms value drifts from the
  // calendar, which is the only per-season source of truth.
  faq.push(pt
    ? { q: 'Qual é a estadia mínima?', a: 'A estadia mínima varia com a época — o calendário mostra o requisito exato para as tuas datas. Em julho e agosto as estadias são de sábado a sábado com mínimo de 7 noites.' }
    : { q: 'What is the minimum stay?', a: 'The minimum stay varies by season — the calendar shows the exact requirement for your dates. In July and August stays run Saturday to Saturday with a 7-night minimum.' });
  faq.push(pt
    ? { q: 'Porquê reservar diretamente com a Portugal Active?', a: 'Reservar direto garante o melhor preço online sem taxas de serviço de OTAs, concierge dedicado por WhatsApp e uma equipa local que gere a casa de ponta a ponta.' }
    : { q: 'Why book directly with Portugal Active?', a: 'Booking direct gets you the best rate online with no OTA service fees, a dedicated WhatsApp concierge, and a local team that operates the home end to end.' });
  const faqPage = {
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return { '@context': 'https://schema.org', '@graph': [vacationRental, breadcrumb, faqPage] };
}

/** Safely convert any date-ish value to a YYYY-MM-DD string, or null. */
function safeDateISO(d: any): string | null {
  if (!d) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
}

/** Build the Product/TouristTrip/TouristAttraction + BreadcrumbList @graph for
 *  an experience page. Mirrors the client experienceGraph builder. */
function buildExperienceGraph(exp: any, lang: string, pagePath: string): Record<string, unknown> {
  const url = `${BOT_BASE_URL}/${lang}${pagePath}`;
  const name = exp.name || 'Experience';
  const rawImages = Array.isArray(exp.gallery) && exp.gallery.length > 0
    ? exp.gallery.slice(0, 6)
    : (exp.image ? [exp.image] : []);
  const images = rawImages
    .filter((g: any) => typeof g === 'string')
    .map((g: string) => (g.startsWith('http') ? g : `${BOT_BASE_URL}${g.startsWith('/') ? '' : '/'}${g}`));
  const priceFrom = Number(exp.priceFrom ?? 0);
  const desc = (typeof exp.description === 'string' ? exp.description
    : typeof exp.tagline === 'string' ? exp.tagline : '')
    .replace(/\s+/g, ' ').trim().slice(0, 300);

  const product: Record<string, unknown> = {
    '@type': ['Product', 'TouristTrip', 'TouristAttraction'],
    '@id': url,
    productID: `EXP-${exp.slug}`,
    name,
    ...(desc && { description: desc }),
    ...(images.length > 0 && { image: images }),
    url,
    touristType: ['Adventure', 'Nature', 'Sport'],
    // Brand, not Organization: the merchant-listing validator rejects the
    // latter with "invalid object type for field brand".
    brand: { '@type': 'Brand', name: 'Portugal Active', url: BOT_BASE_URL },
    provider: { '@type': 'Organization', name: 'Portugal Active', url: BOT_BASE_URL },
    ...(priceFrom > 0 && {
      offers: {
        '@type': 'Offer',
        price: priceFrom,
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url,
        validFrom: new Date().toISOString().split('T')[0],
      },
    }),
    ...(exp.duration && { duration: exp.duration }),
    ...(exp.meetingPoint && typeof exp.meetingPoint.lat === 'number' && {
      contentLocation: {
        '@type': 'Place',
        name: exp.meetingPoint.address || name,
        geo: {
          '@type': 'GeoCoordinates',
          latitude: exp.meetingPoint.lat,
          longitude: exp.meetingPoint.lng,
        },
      },
    }),
    ...(exp.aggregateRating && exp.aggregateRating.count > 0 && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: exp.aggregateRating.value,
        reviewCount: exp.aggregateRating.count,
        bestRating: exp.aggregateRating.bestRating || 5,
        worstRating: 1,
      },
    }),
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BOT_BASE_URL}/${lang}` },
      { '@type': 'ListItem', position: 2, name: 'Experiences', item: `${BOT_BASE_URL}/${lang}/experiences` },
      { '@type': 'ListItem', position: 3, name },
    ],
  };

  return { '@context': 'https://schema.org', '@graph': [product, breadcrumb] };
}

/** Build the BlogPosting + BreadcrumbList @graph for a blog article. */
function buildBlogGraph(post: any, lang: string): Record<string, unknown> {
  const url = `${BOT_BASE_URL}/${lang}/blog/${post.slug}`;
  const published = safeDateISO(post.publishedAt || post.publishDate || post.createdAt || post.date);
  const modified = safeDateISO(post.updatedAt) || published;
  const authorName = (typeof post.author === "object" ? post.author?.name : post.author) || "Portugal Active";

  const article: Record<string, unknown> = {
    '@type': 'BlogPosting',
    '@id': url,
    headline: String(post.title || '').slice(0, 110),
    ...((post.excerpt || post.seoDescription) && {
      description: String(post.excerpt || post.seoDescription).slice(0, 250),
    }),
    ...(post.coverImage && { image: [post.coverImage] }),
    ...(published && { datePublished: published }),
    ...(modified && { dateModified: modified }),
    author: { '@type': 'Person', name: authorName },
    publisher: {
      '@type': 'Organization',
      name: 'Portugal Active',
      url: BOT_BASE_URL,
      logo: {
        '@type': 'ImageObject',
        url: 'https://www.portugalactive.com/brand/pa-logo-white.webp',
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BOT_BASE_URL}/${lang}` },
      { '@type': 'ListItem', position: 2, name: 'Journal', item: `${BOT_BASE_URL}/${lang}/blog` },
      { '@type': 'ListItem', position: 3, name: String(post.title || '') },
    ],
  };

  return { '@context': 'https://schema.org', '@graph': [article, breadcrumb] };
}

/* ── Server-rendered crawlable body content ────────────────────────────────
   The SPA body is empty until JS runs, so JS-less crawlers (AI bots) see no
   content. These builders emit a semantic HTML block injected into a
   #seo-content div; an inline script removes it before React mounts, so JS
   users never see it — flash-free, no duplicate content — while crawlers
   that don't run JS read the full prose from the raw HTML. */

type SeoLabelSet = {
  home: string; homes: string; experiences: string; journal: string;
  amenities: string; destinations: string; about: string; contact: string;
};
const SEO_LABELS: Record<string, SeoLabelSet> = {
  en: { home: 'Home', homes: 'Homes', experiences: 'Experiences', journal: 'Journal', amenities: 'Amenities', destinations: 'Destinations', about: 'About', contact: 'Contact' },
  pt: { home: 'Início', homes: 'Casas', experiences: 'Experiências', journal: 'Blog', amenities: 'Comodidades', destinations: 'Destinos', about: 'Sobre', contact: 'Contacto' },
  es: { home: 'Inicio', homes: 'Casas', experiences: 'Experiencias', journal: 'Blog', amenities: 'Comodidades', destinations: 'Destinos', about: 'Nosotros', contact: 'Contacto' },
  fr: { home: 'Accueil', homes: 'Maisons', experiences: 'Expériences', journal: 'Blog', amenities: 'Équipements', destinations: 'Destinations', about: 'À propos', contact: 'Contact' },
  de: { home: 'Startseite', homes: 'Häuser', experiences: 'Erlebnisse', journal: 'Blog', amenities: 'Ausstattung', destinations: 'Reiseziele', about: 'Über uns', contact: 'Kontakt' },
  it: { home: 'Home', homes: 'Case', experiences: 'Esperienze', journal: 'Blog', amenities: 'Servizi', destinations: 'Destinazioni', about: 'Chi siamo', contact: 'Contatti' },
  nl: { home: 'Home', homes: 'Huizen', experiences: 'Ervaringen', journal: 'Blog', amenities: 'Voorzieningen', destinations: 'Bestemmingen', about: 'Over ons', contact: 'Contact' },
  fi: { home: 'Etusivu', homes: 'Kodit', experiences: 'Elämykset', journal: 'Blogi', amenities: 'Mukavuudet', destinations: 'Kohteet', about: 'Tietoa', contact: 'Yhteystiedot' },
  sv: { home: 'Hem', homes: 'Boenden', experiences: 'Upplevelser', journal: 'Blogg', amenities: 'Bekvämligheter', destinations: 'Destinationer', about: 'Om oss', contact: 'Kontakt' },
};

/** Derive a clean page heading from a meta title — the first segment before
 *  a " | " or " — " separator (drops the brand/qualifier tail). */
function pageHeadingFromTitle(title: string): string {
  return title.split(/\s+[|—]\s+/)[0].trim() || 'Portugal Active';
}

/** Build a lean crawlable body for a static route: H1 + description + the
 *  sitewide nav link graph. Static pages have hand-written React content that
 *  can't be mirrored generically, but this gives JS-less crawlers a real H1,
 *  a descriptive sentence, and the internal links to every main section. */
function buildStaticSeoBody(lang: string, title: string, description: string): string {
  const L = SEO_LABELS[lang] ?? SEO_LABELS.en;
  const h1 = `<h1>${escText(pageHeadingFromTitle(title))}</h1>`;
  const desc = description ? `<p>${escText(description)}</p>` : '';
  const link = (path: string, label: string) => `<a href="/${lang}${path}">${escText(label)}</a>`;
  const nav = `<nav aria-label="Site">` +
    link('', L.home) + link('/homes', L.homes) + link('/experiences', L.experiences) +
    link('/destinations', L.destinations) + link('/blog', L.journal) +
    link('/about', L.about) + link('/contact', L.contact) +
    `</nav>`;
  return `<article>${h1}${desc}${nav}</article>`;
}

/** Split free text into escaped <p> paragraphs, capped at maxTotal chars. */
function renderParagraphs(text: string, maxTotal = 3500): string {
  if (!text || typeof text !== 'string') return '';
  const parts = text.split(/\r?\n/).map(s => s.trim()).filter(s => s.length > 0);
  let total = 0;
  const out: string[] = [];
  for (const part of parts) {
    if (total >= maxTotal) break;
    const slice = part.slice(0, maxTotal - total);
    out.push(`<p>${escText(slice)}</p>`);
    total += slice.length;
  }
  return out.join('');
}

function buildPropertySeoBody(prop: any, lang: string): string {
  const L = SEO_LABELS[lang] ?? SEO_LABELS.en;
  const name = getDisplayName(prop) || 'Property';
  const hero = Array.isArray(prop.images) && prop.images[0] ? String(prop.images[0]) : '';
  let amenities: string[] = [];
  if (Array.isArray(prop.amenities)) {
    amenities = prop.amenities.filter((a: any) => typeof a === 'string');
  } else if (prop.amenities && typeof prop.amenities === 'object') {
    amenities = Object.values(prop.amenities).flat().filter((a: any) => typeof a === 'string') as string[];
  }
  const breadcrumb = `<nav aria-label="Breadcrumb"><a href="/${lang}">${escText(L.home)}</a> &rsaquo; <a href="/${lang}/homes">${escText(L.homes)}</a> &rsaquo; <span>${escText(name)}</span></nav>`;
  const loc = prop.locality ? `<p>${escText(String(prop.locality))}, Portugal</p>` : '';
  const img = hero ? `<img src="${escAttr(hero)}" alt="${escAttr(name)}" width="1200" height="800" />` : '';
  const tagline = prop.tagline ? `<p>${escText(String(prop.tagline))}</p>` : '';
  const desc = renderParagraphs(String(prop.description || ''));
  const amenityList = amenities.length > 0
    ? `<h2>${escText(L.amenities)}</h2><ul>${amenities.slice(0, 30).map(a => `<li>${escText(a)}</li>`).join('')}</ul>`
    : '';
  return `<article>${breadcrumb}<h1>${escText(name)}</h1>${loc}${img}${tagline}${desc}${amenityList}</article>`;
}

function buildExperienceSeoBody(exp: any, lang: string): string {
  const L = SEO_LABELS[lang] ?? SEO_LABELS.en;
  const name = exp.name || 'Experience';
  const raw = exp.image || (Array.isArray(exp.gallery) ? exp.gallery[0] : '');
  const hero = raw
    ? (String(raw).startsWith('http') ? String(raw) : `${BOT_BASE_URL}${String(raw).startsWith('/') ? '' : '/'}${raw}`)
    : '';
  const breadcrumb = `<nav aria-label="Breadcrumb"><a href="/${lang}">${escText(L.home)}</a> &rsaquo; <a href="/${lang}/experiences">${escText(L.experiences)}</a> &rsaquo; <span>${escText(name)}</span></nav>`;
  const img = hero ? `<img src="${escAttr(hero)}" alt="${escAttr(name)}" width="1200" height="800" />` : '';
  const tagline = exp.tagline ? `<p>${escText(String(exp.tagline))}</p>` : '';
  let descText = '';
  if (Array.isArray(exp.aboutParagraphs) && exp.aboutParagraphs.length > 0) {
    descText = exp.aboutParagraphs.filter((s: any) => typeof s === 'string').join('\n\n');
  } else if (typeof exp.description === 'string') {
    descText = exp.description;
  }
  return `<article>${breadcrumb}<h1>${escText(name)}</h1>${tagline}${img}${renderParagraphs(descText)}</article>`;
}

function buildBlogSeoBody(post: any, lang: string): string {
  const L = SEO_LABELS[lang] ?? SEO_LABELS.en;
  const title = String(post.title || '');
  const breadcrumb = `<nav aria-label="Breadcrumb"><a href="/${lang}">${escText(L.home)}</a> &rsaquo; <a href="/${lang}/blog">${escText(L.journal)}</a> &rsaquo; <span>${escText(title)}</span></nav>`;
  const img = post.coverImage ? `<img src="${escAttr(String(post.coverImage))}" alt="${escAttr(title)}" width="1200" height="800" />` : '';
  const excerpt = post.excerpt ? `<p>${escText(String(post.excerpt))}</p>` : '';
  let body = '';
  if (typeof post.content === 'string' && post.content) {
    const plain = post.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    body = renderParagraphs(plain, 4000);
  }
  return `<article>${breadcrumb}<h1>${escText(title)}</h1>${img}${excerpt}${body}</article>`;
}

/** Anchor-only index of property links, for the routes whose grid is built
 *  client-side.
 *
 *  The listing grid reads trpc.properties.listForSite, and that query is
 *  deliberately NOT SSR-prefetched: the full list dehydrates to ~1.3 MB, far
 *  too heavy to embed (see buildPrefetch). The unintended side effect was that
 *  /homes and the destination hubs shipped zero <a href="/{lang}/homes/{slug}">
 *  in the raw HTML — the sitemap listed every property, but no page linked to
 *  one, so a crawler that does not run JS had no internal path to a PDP.
 *
 *  This emits the anchors alone (~7 KB for the whole portfolio): the links
 *  Google needs, without the payload we rejected. Same #seo-content lifecycle
 *  as the CSR fallback — removed during parse, before React mounts — so it is
 *  invisible to users and cannot desync hydration. */
const _linkIndexCache = new Map<string, { html: string; at: number }>();
const LINK_INDEX_TTL_MS = 10 * 60 * 1000;

/** "Viana do Castelo" → "viana-do-castelo", accents folded, so a destination
 *  slug can be compared against a property's locality. */
function slugifyPlace(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function buildPropertyLinkIndex(strippedPath: string, lang: string): Promise<string> {
  let place: string | null = null;
  if (strippedPath !== "/homes") {
    const m = strippedPath.match(/^\/destinations\/([^/]+)$/);
    if (!m) return "";
    place = m[1].toLowerCase();
  }

  const key = `${lang}:${strippedPath}`;
  const hit = _linkIndexCache.get(key);
  if (hit && Date.now() - hit.at < LINK_INDEX_TTL_MS) return hit.html;

  try {
    const { getPropertiesForSite } = await import("../services/properties-store");
    const all = await getPropertiesForSite();
    // Match the destination slug against BOTH fields. Properties are tagged by
    // commercial region ("minho"), while the destination pages include
    // city-level spokes ("viana-do-castelo", "caminha", "esposende"). Matching
    // only `destination` left those city pages linking to nothing — and
    // /destinations/viana-do-castelo, which has 43 homes in it, is the
    // highest-impression page on the site.
    const list = all.filter((pr: any) => {
      if (!pr?.slug) return false;
      if (place === null) return true;
      return slugifyPlace(pr.destination) === place || slugifyPlace(pr.locality) === place;
    });
    if (!list.length) return "";
    const items = list
      .map(
        (pr: any) =>
          `<li><a href="/${lang}/homes/${pr.slug}">${escText(String(pr.name ?? pr.slug))}</a></li>`,
      )
      .join("");
    const html = `<nav aria-label="Homes"><ul>${items}</ul></nav>`;
    _linkIndexCache.set(key, { html, at: Date.now() });
    return html;
  } catch {
    return "";
  }
}

/** Inject a crawlable body block after #root, plus an inline script that
 *  removes it during HTML parse — before the React module executes — so JS
 *  users never see it (no flash, no duplicate content). */
function injectSeoBody(html: string, bodyHtml: string): string {
  if (!bodyHtml) return html;
  const block =
    `<div id="seo-content">${bodyHtml}</div>` +
    `<script>(function(){var e=document.getElementById('seo-content');if(e&&e.parentNode)e.parentNode.removeChild(e);})();</script>`;
  return html.replace('<div id="root"></div>', `<div id="root"></div>\n    ${block}`);
}

/** Title template for a destination landing page, per language. */
const DESTINATION_TITLE: Record<string, (name: string) => string> = {
  en: n => `${n} Portugal | Luxury Villas and Experiences | Portugal Active`,
  pt: n => `${n}, Portugal | Casas de Luxo e Experiências | Portugal Active`,
  es: n => `${n}, Portugal | Villas de Lujo y Experiencias | Portugal Active`,
  fr: n => `${n}, Portugal | Villas de Luxe et Expériences | Portugal Active`,
  de: n => `${n}, Portugal | Luxusvillen und Erlebnisse | Portugal Active`,
  it: n => `${n}, Portogallo | Ville di Lusso ed Esperienze | Portugal Active`,
  nl: n => `${n}, Portugal | Luxevilla\'s en Ervaringen | Portugal Active`,
  fi: n => `${n}, Portugali | Luksushuvilat ja Elämykset | Portugal Active`,
  sv: n => `${n}, Portugal | Lyxvillor och Upplevelser | Portugal Active`,
};

/** Destination descriptions, per destination × language. */
const DESTINATION_DESCRIPTION: Record<string, Record<string, string>> = {
  minho: {
    en: 'Luxury villas on the Minho Coast, Portugal. Wild beaches, green valleys, and historic quintas — the undiscovered north.',
    pt: 'Casas de luxo na Costa do Minho, Portugal. Praias selvagens, vales verdes e quintas históricas — o norte por descobrir.',
    es: 'Villas de lujo en la Costa del Miño, Portugal. Playas salvajes, valles verdes y quintas históricas — el norte por descubrir.',
    fr: 'Villas de luxe sur la Côte du Minho, Portugal. Plages sauvages, vallées vertes et quintas historiques — le nord à découvrir.',
    de: 'Luxusvillen an der Minho-Küste, Portugal. Wilde Strände, grüne Täler und historische Quintas — der unentdeckte Norden.',
    it: 'Ville di lusso sulla Costa del Minho, Portogallo. Spiagge selvagge, valli verdi e quintas storiche — il nord da scoprire.',
    nl: 'Luxevilla\'s aan de Minho-kust, Portugal. Wilde stranden, groene valleien en historische quintas — het ongekende noorden.',
    fi: 'Luksushuvilat Minhon rannikolla, Portugalissa. Villejä rantoja, vihreitä laaksoja ja historiallisia quinta-kartanoita — tuntematon pohjoinen.',
    sv: 'Lyxvillor längs Minhokusten, Portugal. Vilda stränder, gröna dalar och historiska quintas — det oupptäckta norra.',
  },
  porto: {
    en: 'Luxury villas in Porto and the Douro Valley, Portugal. Wine estates, city breaks, and river views.',
    pt: 'Casas de luxo no Porto e no Vale do Douro, Portugal. Quintas de vinho, escapadas urbanas e vistas de rio.',
    es: 'Villas de lujo en Oporto y el Valle del Duero, Portugal. Quintas vinícolas, escapadas urbanas y vistas al río.',
    fr: 'Villas de luxe à Porto et dans la Vallée du Douro, Portugal. Domaines viticoles, city breaks et vues fluviales.',
    de: 'Luxusvillen in Porto und im Douro-Tal, Portugal. Weingüter, Städtereisen und Flussblicke.',
    it: 'Ville di lusso a Porto e nella Valle del Douro, Portogallo. Tenute vinicole, city break e viste sul fiume.',
    nl: 'Luxevilla\'s in Porto en de Douro-vallei, Portugal. Wijnlandgoederen, stedentrips en uitzicht op de rivier.',
    fi: 'Luksushuvilat Portossa ja Douron laaksossa, Portugalissa. Viinitilat, kaupunkilomat ja jokimaisemat.',
    sv: 'Lyxvillor i Porto och Dourodalen, Portugal. Vingårdar, citybreaks och flodutsikter.',
  },
  lisbon: {
    en: 'Luxury villas near Lisbon, Portugal. Sintra, Cascais, and the Atlantic coast — cultural capital meets beach escape.',
    pt: 'Casas de luxo perto de Lisboa, Portugal. Sintra, Cascais e a costa atlântica — capital cultural encontra fuga de praia.',
    es: 'Villas de lujo cerca de Lisboa, Portugal. Sintra, Cascais y la costa atlántica — capital cultural y escapada de playa.',
    fr: 'Villas de luxe près de Lisbonne, Portugal. Sintra, Cascais et la côte atlantique — capitale culturelle et escapade balnéaire.',
    de: 'Luxusvillen bei Lissabon, Portugal. Sintra, Cascais und die Atlantikküste — Kulturhauptstadt trifft Strandflucht.',
    it: 'Ville di lusso vicino a Lisbona, Portogallo. Sintra, Cascais e la costa atlantica — capitale culturale e fuga al mare.',
    nl: 'Luxevilla\'s vlakbij Lissabon, Portugal. Sintra, Cascais en de Atlantische kust — culturele hoofdstad ontmoet strandvakantie.',
    fi: 'Luksushuvilat lähellä Lissabonia, Portugalissa. Sintra, Cascais ja Atlantin rannikko — kulttuuripääkaupunki kohtaa rantaloman.',
    sv: 'Lyxvillor nära Lissabon, Portugal. Sintra, Cascais och Atlantkusten — kulturhuvudstad möter strandsemester.',
  },
  alentejo: {
    en: 'Luxury villas in Alentejo, Portugal. Endless plains, cork forests, and slow-travel at its finest.',
    pt: 'Casas de luxo no Alentejo, Portugal. Planícies infinitas, montados de sobro e o melhor do slow travel.',
    es: 'Villas de lujo en Alentejo, Portugal. Llanuras infinitas, bosques de alcornoques y slow travel en su máxima expresión.',
    fr: 'Villas de luxe dans l\'Alentejo, Portugal. Plaines infinies, forêts de chêne-liège et slow travel par excellence.',
    de: 'Luxusvillen im Alentejo, Portugal. Endlose Ebenen, Korkeichenwälder und Slow Travel in Bestform.',
    it: 'Ville di lusso nell\'Alentejo, Portogallo. Pianure infinite, foreste di sughero e slow travel al suo meglio.',
    nl: 'Luxevilla\'s in Alentejo, Portugal. Eindeloze vlaktes, kurkeikbossen en slow travel op zijn best.',
    fi: 'Luksushuvilat Alentejossa, Portugalissa. Loputtomia lakeuksia, korkkitammimetsiä ja rauhallista matkailua parhaimmillaan.',
    sv: 'Lyxvillor i Alentejo, Portugal. Oändliga slätter, korkekskogar och slow travel när den är som bäst.',
  },
  algarve: {
    en: 'Luxury villas in the Algarve, Portugal. Clifftop retreats, golden beaches, and year-round sunshine.',
    pt: 'Casas de luxo no Algarve, Portugal. Retiros à beira-mar, praias douradas e sol todo o ano.',
    es: 'Villas de lujo en el Algarve, Portugal. Retiros en acantilados, playas doradas y sol todo el año.',
    fr: 'Villas de luxe en Algarve, Portugal. Retraites en haut de falaise, plages dorées et soleil toute l\'année.',
    de: 'Luxusvillen an der Algarve, Portugal. Klippen-Refugien, goldene Strände und Sonne das ganze Jahr.',
    it: 'Ville di lusso in Algarve, Portogallo. Rifugi a picco sul mare, spiagge dorate e sole tutto l\'anno.',
    nl: 'Luxevilla\'s in de Algarve, Portugal. Kliftoppen, gouden stranden en zon het hele jaar door.',
    fi: 'Luksushuvilat Algarvessa, Portugalissa. Kalliopaikat, kultaiset rannat ja aurinkoa ympäri vuoden.',
    sv: 'Lyxvillor i Algarve, Portugal. Klippretreater, gyllene stränder och sol året runt.',
  },
  /* ── Spoke destinations added per the May 2026 destinations strategy doc.
     Region hubs (above) stay; these are the city-level spokes the editorial
     hub now points to. Non-EN languages fall back to EN via the lookup so a
     spoke is never meta-less; full per-language copy lands when the Cowork
     deep-research output is in. */
  'viana-do-castelo': {
    en: 'Viana do Castelo: Northern Portugal\'s Atlantic capital. A complete guide to the third most welcoming city in the world, plus our curated villas in the Minho.',
    pt: 'Viana do Castelo, a capital atlântica do norte de Portugal. Guia completo da terceira cidade mais acolhedora do mundo e das nossas casas de luxo no Minho.',
  },
  caminha: {
    en: 'Caminha, Portugal: fortified border town facing Galicia across the Minho estuary. A guide to medieval walls, Moledo beach, and the ferry to Tui.',
    pt: 'Caminha, Portugal: vila fortificada na fronteira com a Galiza, no estuário do Minho. Guia das muralhas medievais, da praia do Moledo e do ferry para Tui.',
  },
  esposende: {
    en: 'Esposende, Portugal: Litoral Norte natural park, Atlantic dunes and the Cávado estuary. A guide to the quietest coastline 40 minutes north of Porto.',
    pt: 'Esposende, Portugal: o Parque Natural do Litoral Norte, dunas atlânticas e o estuário do Cávado. Guia da costa mais sossegada a 40 minutos a norte do Porto.',
  },
  douro: {
    en: 'Douro Valley, Portugal: UNESCO World Heritage vineyards, port-wine quintas and Pinhão river-cruises. A complete guide to Europe\'s most photographed wine landscape.',
    pt: 'Vale do Douro, Portugal: vinhas Património Mundial UNESCO, quintas de vinho do Porto e cruzeiros fluviais no Pinhão. Guia completo da paisagem vinícola mais fotografada da Europa.',
  },
};

/* ── Localized templates for dynamic DB-driven routes ─────────────────────
   Property, experience, service and blog pages pull titles/descriptions
   from Drizzle. Only English SEO text lives in DB, so we wrap the English
   brand name / post title with per-language framing to localize meta for
   the 8 other languages. Proper names (property "Casa do Minho", post
   titles) stay in the original language — only the framing is translated. */

/** Label for a destination slug in the visitor's language. Used in property
 *  meta (e.g. "in Minho Coast, Portugal"). Keeps region name untranslated
 *  where it's a proper noun (Minho, Alentejo, Algarve); translates "Coast",
 *  "Porto & Douro", "Lisbon". */
const DEST_LABEL: Record<string, Record<string, string>> = {
  minho: {
    en: 'Minho Coast', pt: 'Costa do Minho', es: 'Costa del Miño', fr: 'Côte du Minho',
    de: 'Minho-Küste', it: 'Costa del Minho', nl: 'Minho-kust', fi: 'Minhon rannikko',
    sv: 'Minhokusten',
  },
  porto: {
    en: 'Porto & Douro', pt: 'Porto e Douro', es: 'Oporto y Duero', fr: 'Porto et Douro',
    de: 'Porto & Douro', it: 'Porto e Douro', nl: 'Porto & Douro', fi: 'Porto ja Douro',
    sv: 'Porto & Douro',
  },
  lisbon: {
    en: 'Lisbon', pt: 'Lisboa', es: 'Lisboa', fr: 'Lisbonne', de: 'Lissabon',
    it: 'Lisbona', nl: 'Lissabon', fi: 'Lissabon', sv: 'Lissabon',
  },
  alentejo: {
    en: 'Alentejo', pt: 'Alentejo', es: 'Alentejo', fr: 'Alentejo', de: 'Alentejo',
    it: 'Alentejo', nl: 'Alentejo', fi: 'Alentejo', sv: 'Alentejo',
  },
  algarve: {
    en: 'Algarve', pt: 'Algarve', es: 'Algarve', fr: 'Algarve', de: 'Algarve',
    it: 'Algarve', nl: 'Algarve', fi: 'Algarve', sv: 'Algarve',
  },
};

function destLabel(slug: string | null | undefined, lang: string): string {
  if (!slug) return '';
  const key = slug.toLowerCase();
  return DEST_LABEL[key]?.[lang] ?? DEST_LABEL[key]?.en ?? slug;
}

/** Property title: "{name} | {bedrooms}-bedroom villa in {destination} | Portugal Active" (per-lang). */
const PROPERTY_TITLE: Record<string, (p: { name: string; bedrooms?: number | null; destination: string }) => string> = {
  en: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms}-Bedroom ` : '';
    return `${name} | ${b}Luxury Villa in ${destLabel(destination, 'en')} | Portugal Active`;
  },
  pt: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `T${bedrooms} ` : '';
    return `${name} | Casa de Luxo ${b}em ${destLabel(destination, 'pt')} | Portugal Active`;
  },
  es: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `de ${bedrooms} dormitorios ` : '';
    return `${name} | Villa de Lujo ${b}en ${destLabel(destination, 'es')} | Portugal Active`;
  },
  fr: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms} chambres ` : '';
    return `${name} | Villa de Luxe ${b}à ${destLabel(destination, 'fr')} | Portugal Active`;
  },
  de: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms}-Schlafzimmer-` : '';
    return `${name} | ${b}Luxusvilla in ${destLabel(destination, 'de')} | Portugal Active`;
  },
  it: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `con ${bedrooms} camere da letto ` : '';
    return `${name} | Villa di Lusso ${b}in ${destLabel(destination, 'it')} | Portugal Active`;
  },
  nl: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `met ${bedrooms} slaapkamers ` : '';
    return `${name} | Luxevilla ${b}in ${destLabel(destination, 'nl')} | Portugal Active`;
  },
  fi: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `${bedrooms} makuuhuoneen ` : '';
    return `${name} | ${b}Luksushuvila – ${destLabel(destination, 'fi')} | Portugal Active`;
  },
  sv: ({ name, bedrooms, destination }) => {
    const b = bedrooms ? `med ${bedrooms} sovrum ` : '';
    return `${name} | Lyxvilla ${b}i ${destLabel(destination, 'sv')} | Portugal Active`;
  },
};

/** Property description template. Uses tagline if available, else generates
 *  a descriptive sentence. Closes with a localized CTA. Trimmed to 155 chars. */
const PROPERTY_DESCRIPTION: Record<string, (p: { tagline?: string | null; bedrooms?: number | null; maxGuests?: number | null; destination: string; name: string }) => string> = {
  en: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `${bedrooms ? `${bedrooms}-bedroom ` : ''}luxury villa in ${destLabel(destination, 'en')}${maxGuests ? ` for up to ${maxGuests} guests` : ''}.`;
    return `${base} Private chef, concierge, housekeeping included. Book ${name} direct with Portugal Active.`;
  },
  pt: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Casa de luxo ${bedrooms ? `T${bedrooms} ` : ''}em ${destLabel(destination, 'pt')}${maxGuests ? ` para até ${maxGuests} hóspedes` : ''}.`;
    return `${base} Chef privado, concierge e limpeza incluídos. Reserve ${name} direto com a Portugal Active.`;
  },
  es: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Villa de lujo ${bedrooms ? `de ${bedrooms} dormitorios ` : ''}en ${destLabel(destination, 'es')}${maxGuests ? ` para hasta ${maxGuests} huéspedes` : ''}.`;
    return `${base} Chef privado, conserjería y limpieza incluidos. Reserva ${name} directo con Portugal Active.`;
  },
  fr: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Villa de luxe ${bedrooms ? `${bedrooms} chambres ` : ''}à ${destLabel(destination, 'fr')}${maxGuests ? ` jusqu'à ${maxGuests} personnes` : ''}.`;
    return `${base} Chef privé, conciergerie et ménage inclus. Réservez ${name} en direct avec Portugal Active.`;
  },
  de: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Luxusvilla ${bedrooms ? `mit ${bedrooms} Schlafzimmern ` : ''}in ${destLabel(destination, 'de')}${maxGuests ? ` für bis zu ${maxGuests} Gäste` : ''}.`;
    return `${base} Privatkoch, Concierge und Reinigung inklusive. Buchen Sie ${name} direkt bei Portugal Active.`;
  },
  it: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Villa di lusso ${bedrooms ? `con ${bedrooms} camere ` : ''}in ${destLabel(destination, 'it')}${maxGuests ? ` fino a ${maxGuests} ospiti` : ''}.`;
    return `${base} Chef privato, concierge e pulizie inclusi. Prenota ${name} diretto con Portugal Active.`;
  },
  nl: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Luxevilla ${bedrooms ? `met ${bedrooms} slaapkamers ` : ''}in ${destLabel(destination, 'nl')}${maxGuests ? ` tot ${maxGuests} gasten` : ''}.`;
    return `${base} Privékok, conciërge en schoonmaak inbegrepen. Boek ${name} direct bij Portugal Active.`;
  },
  fi: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Luksushuvila ${bedrooms ? `${bedrooms} makuuhuoneella ` : ''}kohteessa ${destLabel(destination, 'fi')}${maxGuests ? `, jopa ${maxGuests} hengelle` : ''}.`;
    return `${base} Yksityiskokki, concierge ja siivous sisältyy. Varaa ${name} suoraan Portugal Activesta.`;
  },
  sv: ({ tagline, bedrooms, maxGuests, destination, name }) => {
    const base = tagline || `Lyxvilla ${bedrooms ? `med ${bedrooms} sovrum ` : ''}i ${destLabel(destination, 'sv')}${maxGuests ? ` för upp till ${maxGuests} gäster` : ''}.`;
    return `${base} Privat kock, concierge och städning ingår. Boka ${name} direkt med Portugal Active.`;
  },
};

/** Experience title template. */
const EXPERIENCE_TITLE: Record<string, (e: { name: string; destination?: string | null }) => string> = {
  en: ({ name, destination }) => destination ? `${name} in ${destLabel(destination, 'en')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  pt: ({ name, destination }) => destination ? `${name} em ${destLabel(destination, 'pt')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  es: ({ name, destination }) => destination ? `${name} en ${destLabel(destination, 'es')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  fr: ({ name, destination }) => destination ? `${name} à ${destLabel(destination, 'fr')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  de: ({ name, destination }) => destination ? `${name} in ${destLabel(destination, 'de')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  it: ({ name, destination }) => destination ? `${name} a ${destLabel(destination, 'it')}, Portogallo | Portugal Active` : `${name} | Portugal Active`,
  nl: ({ name, destination }) => destination ? `${name} in ${destLabel(destination, 'nl')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
  fi: ({ name, destination }) => destination ? `${name} – ${destLabel(destination, 'fi')}, Portugali | Portugal Active` : `${name} | Portugal Active`,
  sv: ({ name, destination }) => destination ? `${name} i ${destLabel(destination, 'sv')}, Portugal | Portugal Active` : `${name} | Portugal Active`,
};

/** Experience description: preserve tagline if present; otherwise generate. */
const EXPERIENCE_DESCRIPTION: Record<string, (e: { name: string; tagline?: string | null; duration?: string | null; destination?: string | null }) => string> = {
  en: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` in ${destLabel(destination, 'en')}` : ''}. Guided by local experts. Book direct with Portugal Active.`,
  pt: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` em ${destLabel(destination, 'pt')}` : ''}. Guiado por especialistas locais. Reserve direto com a Portugal Active.`,
  es: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` en ${destLabel(destination, 'es')}` : ''}. Guiado por expertos locales. Reserva directa con Portugal Active.`,
  fr: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` à ${destLabel(destination, 'fr')}` : ''}. Guidé par des experts locaux. Réservation directe avec Portugal Active.`,
  de: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` in ${destLabel(destination, 'de')}` : ''}. Geführt von lokalen Experten. Direkt bei Portugal Active buchen.`,
  it: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` a ${destLabel(destination, 'it')}` : ''}. Guidato da esperti locali. Prenota diretto con Portugal Active.`,
  nl: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` in ${destLabel(destination, 'nl')}` : ''}. Begeleid door lokale experts. Direct boeken bij Portugal Active.`,
  fi: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` kohteessa ${destLabel(destination, 'fi')}` : ''}. Paikallisten asiantuntijoiden opastama. Varaa suoraan Portugal Activesta.`,
  sv: ({ name, tagline, duration, destination }) => tagline || `${name}${duration ? ` — ${duration}` : ''}${destination ? ` i ${destLabel(destination, 'sv')}` : ''}. Guidad av lokala experter. Boka direkt med Portugal Active.`,
};

/** Service title. */
const SERVICE_TITLE: Record<string, (s: { name: string }) => string> = {
  en: ({ name }) => `${name} | Luxury Villa Concierge Service | Portugal Active`,
  pt: ({ name }) => `${name} | Serviço de Concierge para Casas de Luxo | Portugal Active`,
  es: ({ name }) => `${name} | Servicio de Conserjería para Villas de Lujo | Portugal Active`,
  fr: ({ name }) => `${name} | Conciergerie pour Villas de Luxe | Portugal Active`,
  de: ({ name }) => `${name} | Concierge-Service für Luxusvillen | Portugal Active`,
  it: ({ name }) => `${name} | Concierge per Ville di Lusso | Portugal Active`,
  nl: ({ name }) => `${name} | Conciërgedienst voor Luxevilla's | Portugal Active`,
  fi: ({ name }) => `${name} | Luksushuviloiden Concierge-palvelu | Portugal Active`,
  sv: ({ name }) => `${name} | Concierge-tjänst för Lyxvillor | Portugal Active`,
};

const SERVICE_DESCRIPTION: Record<string, (s: { name: string; tagline?: string | null; duration?: string | null }) => string> = {
  en: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Add to any Portugal Active villa stay. Book alongside your villa.`,
  pt: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Acrescente a qualquer estadia Portugal Active. Reserve junto com a sua casa.`,
  es: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Añade a cualquier estancia Portugal Active. Reserva junto con tu villa.`,
  fr: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Ajoutez à tout séjour Portugal Active. Réservez avec votre villa.`,
  de: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Zu jedem Portugal-Active-Aufenthalt hinzufügen. Zusammen mit Ihrer Villa buchen.`,
  it: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Aggiungi a qualsiasi soggiorno Portugal Active. Prenota insieme alla tua villa.`,
  nl: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Voeg toe aan elk Portugal Active-verblijf. Boek samen met je villa.`,
  fi: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Lisää mihin tahansa Portugal Active -huvilalomaan. Varaa huvilasi kanssa.`,
  sv: ({ name, tagline, duration }) => tagline || `${name}${duration ? ` — ${duration}` : ''}. Lägg till vid valfri Portugal Active-vistelse. Boka tillsammans med din villa.`,
};

/** Blog title suffix — blog content is written in English, so we keep the
 *  post title as-written but swap the suffix/description framing. */
const BLOG_SUFFIX: Record<string, string> = {
  en: ' | Portugal Active Journal',
  pt: ' | Diário Portugal Active',
  es: ' | Diario Portugal Active',
  fr: ' | Journal Portugal Active',
  de: ' | Portugal Active Journal',
  it: ' | Journal Portugal Active',
  nl: ' | Portugal Active Journal',
  fi: ' | Portugal Active -päiväkirja',
  sv: ' | Portugal Active-journalen',
};

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use("/assets", express.static(path.join(distPath, "assets"), {
    maxAge: "1y",
    immutable: true,
  }));

  app.use(express.static(distPath, {
    maxAge: "1h",
    // Do NOT let express.static serve index.html for directory requests.
    // Otherwise "/" is served as the raw shell with a 200 before the
    // bare-path redirect middleware runs — forcing a client-side
    // LocaleRouter redirect to /en (a full second app boot, ~4s on mobile).
    // With index:false, "/" falls through to the 301 → /en redirect.
    index: false,
  }));

  const SUPPORTED_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

  const KNOWN_ROUTES = new Set([
    "/", "/homes", "/about", "/contact", "/services", "/adventures",
    "/events", "/blog", "/faq", "/careers", "/owners", "/login", "/account",
    "/legal/privacy", "/legal/terms", "/legal/cookies", "/admin", "/404",
    "/destinations", "/experiences", "/concierge", "/best-rate-guarantee",
  ]);
  const KNOWN_PREFIXES = ["/homes/", "/collections/", "/destinations/", "/blog/", "/services/", "/admin/", "/booking/", "/experiences/", "/activities/", "/checkout/"];

  /** Strip locale prefix from path: /pt/homes → /homes */
  function stripLocale(pathname: string): string {
    const segments = pathname.split('/').filter(Boolean);
    if (segments[0] && SUPPORTED_LANGS.includes(segments[0].toLowerCase())) {
      return '/' + segments.slice(1).join('/') || '/';
    }
    return pathname;
  }

  // Redirect bare paths to locale-prefixed paths for SEO
  app.use("*", async (req, res, next) => {
    const p = req.originalUrl.split("?")[0];
    const segments = p.split('/').filter(Boolean);

    // If first segment is a supported locale, continue
    if (segments[0] && SUPPORTED_LANGS.includes(segments[0].toLowerCase())) {
      return next();
    }

    // If it's an asset, API, or static file request, skip
    if (p.startsWith('/assets/') || p.startsWith('/api/') || p.includes('.')) {
      return next();
    }

    // Redirect to /en/ prefixed version
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    return res.redirect(301, `/en${p === '/' ? '' : p}${query}`);
  });

  /** Extract the locale prefix from a path. Returns 'en' as fallback. */
  function extractLang(pathname: string): string {
    const first = pathname.split('/').filter(Boolean)[0]?.toLowerCase();
    return first && SUPPORTED_LANGS.includes(first) ? first : 'en';
  }

  // ── Redirect /{lang}/journal/* → /{lang}/blog/* (TAREFA 3A) ─────────────
  // Legacy journal URLs with locale prefix need to redirect to the blog
  // equivalent. Bare /journal/* is already handled by legacyRedirects.
  app.use("*", (req, res, next) => {
    const p = req.originalUrl.split("?")[0];
    const segments = p.split('/').filter(Boolean);
    if (segments.length >= 2 && SUPPORTED_LANGS.includes(segments[0].toLowerCase()) && segments[1] === 'journal') {
      const lang = segments[0].toLowerCase();
      const rest = segments.slice(2).join('/');
      const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
      // Redirect /{lang}/journal/slug → /{lang}/blog/slug
      return res.redirect(301, `/${lang}/blog${rest ? `/${rest}` : ''}${query}`);
    }
    return next();
  });

  // Dynamic content prefixes: if a slug under these paths doesn't match
  // any record in the data source, we return 404 (not 200 = soft 404).
  const DYNAMIC_CONTENT_PREFIXES = ["/homes/", "/collections/", "/blog/", "/services/", "/experiences/", "/activities/"];

  // ── SSR (gated by SSR_ENABLED) ───────────────────────────────────────────
  type SsrRender = (
    url: string,
    opts?: { prefetch?: Record<string, unknown> },
  ) => Promise<{ appHtml: string; dehydratedState: string }>;

  // Lazily load the separately-built SSR bundle (dist/server/entry-server.js).
  let _ssrRender: SsrRender | null = null;
  let _ssrUnavailable = false;

  // Memoise the SSR render output per locale-prefixed path. The render is
  // deterministic per path (live pricing is client-hydrated, so it isn't in this
  // markup; property data has its own cache) and query strings don't affect it.
  // Cloudflare serves the HTML as `DYNAMIC` (uncached), so WITHOUT this every
  // request re-runs the full React render on the origin — the source of the TTFB
  // tail latency and the per-request server load. With it, repeat views of a URL
  // skip the render entirely. 5-min TTL keeps content fresh after a Guesty sync.
  const SSR_RENDER_TTL_MS = 5 * 60 * 1000;
  const SSR_RENDER_CACHE_MAX = 400;
  /**
 * Partner (Tripwix) home slugs, read from the same file the site renders. Used
 * to keep those pages out of the index while they are being validated; matching
 * on the data rather than on a URL shape means a slug change cannot silently
 * turn indexing back on.
 */
let _partnerSlugs: Set<string> | null = null;
function isPartnerHome(pathname: string): boolean {
  if (_partnerSlugs === null) {
    _partnerSlugs = new Set();
    try {
      const raw = fs.readFileSync(
        path.join(process.cwd(), "client", "src", "data", "tripwix-properties.json"),
        "utf-8",
      );
      for (const p of JSON.parse(raw)) if (p?.slug) _partnerSlugs.add(p.slug);
    } catch {
      /* no partner inventory present — nothing to suppress */
    }
  }
  const m = pathname.match(/^\/homes\/([^/?#]+)\/?$/);
  return !!m && _partnerSlugs.has(m[1]);
}

const _ssrRenderCache = new Map<string, { appHtml: string; dehydratedState: string; at: number }>();
  async function getSsrRender(): Promise<SsrRender | null> {
    if (_ssrRender) return _ssrRender;
    if (_ssrUnavailable) return null;
    try {
      const ssrEntry = path.resolve(distPath, "..", "server", "entry-server.js");
      const mod = await import(pathToFileURL(ssrEntry).href);
      if (typeof mod.render !== "function") throw new Error("entry-server exports no render()");
      _ssrRender = mod.render as SsrRender;
      console.info("[SSR] entry-server loaded — server-side rendering active");
      return _ssrRender;
    } catch (err) {
      _ssrUnavailable = true;
      console.error("[SSR] could not load entry-server, staying on CSR:", (err as Error).message);
      return null;
    }
  }

  /** Build the react-query prefetch payload for an SSR route, using the same
   *  data the tRPC procedures return (the procedures are thin wrappers around
   *  getPropertiesForSite), so the seeded cache matches the client exactly.
   *
   *  Only property-detail pages are prefetched: their single record is small
   *  (~12 KB dehydrated) and they ARE the money pages. listForSite is NOT
   *  prefetched — the full 66-property list dehydrates to ~1.3 MB, far too
   *  heavy to embed; the homepage LCP is the static hero (already SSR'd), so
   *  the property carousel / listing grid fill in client-side instead. */
  async function buildPrefetch(strippedPath: string): Promise<Record<string, unknown> | undefined> {
    const m = strippedPath.match(/^\/homes\/([^/]+)$/);
    if (m) {
      return { propertyBySlug: { slug: m[1], data: await getPropertyBySlugCached(m[1]) } };
    }
    // Blog articles: seed the handful of homes shown under the article, so
    // those links are in the served HTML. This is the whole point of the
    // block — an article that only links to homes after hydration passes no
    // authority to the property pages and helps no crawler.
    const blogMatch = strippedPath.match(/^\/blog\/([^/]+)$/);
    if (blogMatch) {
      try {
        const post = await getBlogArticleBySlugCached(blogMatch[1], "en");
        if (post) {
          const input = { destinationTag: post.destinationTag ?? null, limit: 4 };
          const { getRelatedHomes } = await import("../services/related-homes");
          return { relatedHomes: { input, data: await getRelatedHomes(input.destinationTag, input.limit) } };
        }
      } catch {
        return undefined;
      }
      return undefined;
    }

    // Pages carrying the search widget: seed the destination options (~15
    // entries) so the picker is populated in the SSR HTML. Without this it
    // rendered empty until the ~1.3 MB property list arrived — on mobile that
    // meant tapping "Destination" opened a blank list.
    if (strippedPath === "/" || strippedPath === "/homes") {
      try {
        const { getSiteLocalities } = await import("../services/properties-store");
        return { localities: await getSiteLocalities() };
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  /** Embed a string as a safe JS string literal inside a <script> tag. */
  function scriptString(s: string): string {
    return JSON.stringify(s).replace(/</g, "\\u003c");
  }

  /** Routes whose HTML must never be shared between visitors or held at the
   *  edge — anything behind auth or tied to a single booking/payment. */
  const NEVER_CACHE_PREFIXES = ["/account", "/login", "/admin", "/owners-portal", "/checkout", "/booking"];

  /**
   * Cache-Control for the HTML document.
   *
   * The HTML is identical for every visitor of a given URL (no Set-Cookie, and
   * per-user state is fetched client-side), so public pages can be held by the
   * CDN — that's what turns a ~0.3-0.9 s origin round trip into an edge hit and
   * takes the SSR render off the origin entirely.
   *
   * `max-age=0` keeps BROWSERS revalidating, so a visitor never runs stale HTML
   * that points at asset hashes a deploy has already replaced; only the shared
   * CDN copy is reused (`s-maxage`). That window is deliberately short for the
   * same reason — after a deploy, stale HTML referencing deleted /assets/*
   * hashes would break the page, so we trade a little cache depth for safety.
   */
  function setHtmlCacheHeaders(res: any, strippedPath: string, status: number) {
    const isPrivate = NEVER_CACHE_PREFIXES.some(pre => strippedPath.startsWith(pre));
    if (isPrivate || status !== 200) {
      res.setHeader("Cache-Control", "private, no-store");
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=60, stale-while-revalidate=120");
  }

  /** Fill <div id="root"> with real SSR markup when SSR is enabled; otherwise
   *  inject the lightweight crawlable #seo-content block. An SSR failure falls
   *  back to the seo-body so a render error can never break the page. */
  async function injectBody(
    html: string,
    reqPath: string,
    strippedPath: string,
    seoBodyHtml?: string,
  ): Promise<string> {
    if (SSR_ENABLED) {
      const render = await getSsrRender();
      if (render) {
        try {
          let entry = _ssrRenderCache.get(reqPath);
          if (!entry || Date.now() - entry.at >= SSR_RENDER_TTL_MS) {
            const prefetch = await buildPrefetch(strippedPath);
            const out = await render(reqPath, prefetch ? { prefetch } : undefined);
            entry = { appHtml: out.appHtml, dehydratedState: out.dehydratedState, at: Date.now() };
            // Simple FIFO cap — evict the oldest entry when full.
            if (_ssrRenderCache.size >= SSR_RENDER_CACHE_MAX) {
              const oldest = _ssrRenderCache.keys().next().value;
              if (oldest !== undefined) _ssrRenderCache.delete(oldest);
            }
            _ssrRenderCache.set(reqPath, entry);
          }
          const rqScript = `<script>window.__RQ_STATE__=${scriptString(entry.dehydratedState)}</script>`;
          // The SSR markup for listing routes has no property cards (their
          // query is not prefetched), so append the anchor-only link index.
          const linkIndex = await buildPropertyLinkIndex(strippedPath, extractLang(reqPath));
          const linkBlock = linkIndex
            ? `\n    <div id="seo-content">${linkIndex}</div>` +
              `<script>(function(){var e=document.getElementById('seo-content');if(e&&e.parentNode)e.parentNode.removeChild(e);})();</script>`
            : "";
          return html.replace(
            '<div id="root"></div>',
            `<div id="root">${entry.appHtml}</div>\n    ${rqScript}${linkBlock}`,
          );
        } catch (err) {
          console.error(`[SSR] render failed for ${reqPath}, falling back to CSR:`, (err as Error).message);
        }
      }
    }
    return seoBodyHtml ? injectSeoBody(html, seoBodyHtml) : html;
  }

  app.use("*", async (req, res) => {
    const rawPath = req.originalUrl.split("?")[0];
    const p = stripLocale(rawPath);
    const lang = extractLang(rawPath);
    const isStaticKnown = KNOWN_ROUTES.has(p);
    const isDynamicPrefix = KNOWN_PREFIXES.some(pre => p.startsWith(pre));
    // Initial status — will be refined for dynamic content below
    let status = (isStaticKnown || isDynamicPrefix) ? 200 : 404;
    const indexPath = path.resolve(distPath, "index.html");

    // Load the shell (cached after first read).
    let html: string;
    try {
      if (_cachedIndexHtml === null) {
        _cachedIndexHtml = fs.readFileSync(indexPath, "utf-8");
      }
      html = _cachedIndexHtml;
    } catch {
      return res.status(status).sendFile(indexPath);
    }

    // Always inject locale tags — hreflang alternates, canonical, og:url,
    // og:locale, and <html lang>. This is the critical SEO fix: every
    // /{lang}/{path} response tells Google it's a distinct indexable version.
    html = injectLocaleTags(html, { lang, pagePath: p });

    // Non-production hosts (dev, previews) must not be indexed. The
    // X-Robots-Tag header already says so; this stops the markup saying the
    // opposite. Same helper as the middleware, so the two cannot drift.
    // Must happen HERE, with the checkout rewrite: several branches below
    // return early on cache hits.
    if (isNonIndexableHost(req.headers.host)) {
      html = html.replace(/<meta name="robots" content="[^"]*"/, '<meta name="robots" content="noindex, nofollow"');
    }

    // Checkout pages are transactional capability URLs — never indexable.
    // Must happen HERE: several branches below return early (cache hits).
    if (p.startsWith("/checkout/")) {
      html = html.replace(/<meta name="robots" content="[^"]*"/, '<meta name="robots" content="noindex, nofollow"');
    }

    // Tripwix partner homes still carry the supplier's own published copy,
    // which is byte-identical to their canonical pages on tripwix.com. Being
    // judged a duplicate once is far harder to undo than being judged well the
    // first time, so these stay out of the index until the descriptions are
    // rewritten. They are already absent from sitemap.xml (it reads only
    // properties.json); this covers discovery via internal links.
    //
    // Matched against the actual partner slug list rather than a URL pattern:
    // the slugs used to end in the supplier reference, and when that was
    // dropped a pattern check would have silently stopped matching and quietly
    // let these pages into the index. Remove this block (and
    // PARTNER_HOMES_NOINDEX in PropertyDetail.tsx) once the copy is validated,
    // then submit the URLs in Search Console.
    if (isPartnerHome(p)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      html = html.replace(/<meta name="robots" content="[^"]*"/, '<meta name="robots" content="noindex, nofollow"');
    }

    // ── ALWAYS inject per-route meta for static routes (instant lookup, no DB).
    // This ensures OG tags are correct even when a CDN caches the response,
    // or when social crawlers bypass bot detection.
    const localized = getPageMeta(p, lang);
    if (localized) {
      html = injectMeta(html, {
        title: localized.title,
        description: localized.description,
        url: `${BOT_BASE_URL}/${lang}${p === '/' ? '' : p}`,
      });
      // Body: real SSR markup when enabled, else the lean crawlable
      // #seo-content block (H1 + description + sitewide nav).
      html = await injectBody(html, rawPath, p, buildStaticSeoBody(lang, localized.title, localized.description));
    }

    // ── Dynamic route meta: inject for ALL requests using in-memory cache.
    // Cache avoids lookups on every page load (10 min TTL).
    // Properties are the most shared content, so their OG tags must be correct
    // regardless of whether the requester is a bot or human.
    const dynamicCacheKey = `${lang}:${p}`;
    const cachedMeta = getCachedDynamicMeta(dynamicCacheKey);

    if (cachedMeta !== undefined) {
      // Cache hit (may be null = no record found, which is fine)
      if (cachedMeta) {
        html = injectMeta(html, cachedMeta);
        if (cachedMeta.schemaDomId && cachedMeta.schemaGraph) {
          html = injectSchemaGraph(html, cachedMeta.schemaDomId, cachedMeta.schemaGraph);
        }
        html = await injectBody(html, rawPath, p, cachedMeta.bodyHtml);
      } else if (DYNAMIC_CONTENT_PREFIXES.some(pre => p.startsWith(pre))) {
        // Cached null on a dynamic content route → content doesn't exist → 404
        status = 404;
        html = html.replace(/<meta name="robots" content="[^"]*"/, '<meta name="robots" content="noindex, nofollow"');
      }
      setHtmlCacheHeaders(res, p, status);
      return res.status(status).set("Content-Type", "text/html").send(html);
    }

    // If static route was already handled, no dynamic lookup needed
    if (localized) {
      setHtmlCacheHeaders(res, p, status);
      return res.status(status).set("Content-Type", "text/html").send(html);
    }

    // Dynamic route — look up content, cache result, inject meta
    try {
      let dynamicMeta: DynamicMeta | null = null;

      // /homes/:slug — uses JSON properties-store (NOT DB)
      // Properties come from Guesty sync file or static JSON fallback.
      const homesMatch = p.match(/^\/homes\/([^/]+)$/);
      if (homesMatch) {
        let prop = await getPropertyBySlugCached(homesMatch[1]);
        // Descriptions come from Guesty in English; apply the per-locale
        // overrides so bots get the localised meta + body too. Guesty homes are
        // keyed by guestyId; partner (Tripwix) homes have none and are keyed by
        // slug — the same fallback the client's mergePropertyOverrides uses.
        if (prop && lang !== 'en') {
          const ovs = loadI18nOverrides("properties", lang);
          const ov = (prop.guestyId && ovs[prop.guestyId]) || ovs[prop.slug];
          if (ov) prop = { ...prop, ...ov };
        }
        if (prop) {
          // The curated display name goes into title, og and the body — never
          // the raw Guesty seoTitle ("<OTA title> — Portugal Active"), which
          // produced the double brand (auditoria set/2026, N9).
          const displayName = getDisplayName(prop);
          const useCustomEn = lang === 'en' && !!prop.seoDescription;
          const titleFn = PROPERTY_TITLE[lang] ?? PROPERTY_TITLE.en;
          const descFn = PROPERTY_DESCRIPTION[lang] ?? PROPERTY_DESCRIPTION.en;
          const title = titleFn({ name: displayName, bedrooms: prop.bedrooms, destination: prop.destination });
          const rawDesc = useCustomEn
            ? prop.seoDescription
            : descFn({ tagline: prop.tagline, bedrooms: prop.bedrooms, maxGuests: prop.maxGuests, destination: prop.destination, name: displayName });
          dynamicMeta = {
            title,
            description: rawDesc.replace(/\s+/g, ' ').trim().slice(0, 155),
            image: Array.isArray(prop.images) && prop.images.length > 0 ? prop.images[0] : undefined,
            url: `${BOT_BASE_URL}/${lang}/homes/${prop.slug}`,
            type: 'place',
            // Server-render VacationRental + BreadcrumbList JSON-LD. domId
            // matches the client `<StructuredData id={`property-${slug}`}>`.
            schemaDomId: `sd-property-${prop.slug}`,
            schemaGraph: buildPropertyGraph(prop, lang),
            bodyHtml: buildPropertySeoBody(prop, lang),
          };
        }
      }

      // /blog/:slug — from blog.json + per-locale overrides (NOT the DB, where
      // these static articles don't exist — that was returning generic meta).
      if (!dynamicMeta) {
        const blogMatch = p.match(/^\/blog\/([^/]+)$/);
        if (blogMatch) {
          const post = await getBlogArticleBySlugCached(blogMatch[1], lang);
          if (post) {
            const suffix = BLOG_SUFFIX[lang] ?? BLOG_SUFFIX.en;
            dynamicMeta = {
              title: post.seoTitle || `${post.title}${suffix}`,
              description: (post.seoDescription || post.excerpt || '').replace(/\s+/g, ' ').trim().slice(0, 155),
              image: post.coverImage ?? post.featuredImage ?? undefined,
              url: `${BOT_BASE_URL}/${lang}/blog/${post.slug}`,
              type: 'article',
              schemaDomId: `sd-article-${post.slug}`,
              schemaGraph: buildBlogGraph(post, lang),
              bodyHtml: buildBlogSeoBody(post, lang),
            };
          }
        }
      }

      // /collections/:slug — static definitions in collections.json (en/pt).
      const collMatch = p.match(/^\/collections\/([^/]+)$/);
      if (collMatch) {
        try {
          const raw = fs.readFileSync(path.resolve(process.cwd(), "client", "src", "data", "collections.json"), "utf-8");
          const defs = JSON.parse(raw) as Array<any>;
          const def = defs.find((c) => c.slug === collMatch[1]);
          if (def) {
            const copy = lang === "pt" ? def.pt : def.en;
            dynamicMeta = {
              title: `${copy.title} | Portugal Active`,
              description: copy.metaDescription,
              url: `${BOT_BASE_URL}/${lang}/collections/${def.slug}`,
              bodyHtml: buildStaticSeoBody(lang, copy.title, `${copy.intro}`),
            };
          }
        } catch { /* fall through to 404 handling */ }
      }

      // /destinations/:slug — from destinations.json + i18n overrides, falling
      // back to the built-in maps (which lacked most non-EN descriptions).
      if (!dynamicMeta) {
        const destMatch = p.match(/^\/destinations\/([^/]+)$/);
        if (destMatch) {
          const slug = destMatch[1];
          const titleFn = DESTINATION_TITLE[lang] ?? DESTINATION_TITLE.en;
          const resolved = await getDestinationBySlugCached(slug, lang);
          const name = resolved?.name || DESTINATION_NAME[slug];
          const desc = resolved?.desc || DESTINATION_DESCRIPTION[slug]?.[lang] || DESTINATION_DESCRIPTION[slug]?.en;
          if (name && desc) {
            // The curated seoTitle in destinations.json (and its per-locale
            // overrides) wins over the generic template. Every destination has
            // one, in all nine languages, and every one of them was being
            // discarded — "/destinations/viana-do-castelo" went out as
            // "Luxury Villas and Experiences" against 22,092 impressions of
            // people searching the town's name, and converted at 0.8%.
            // The template stays as the fallback for a destination added
            // without a title of its own.
            dynamicMeta = {
              title: resolved?.seoTitle || titleFn(name),
              description: desc,
              url: `${BOT_BASE_URL}/${lang}/destinations/${slug}`,
            };
          }
        }
      }

      // /services/:slug — tries JSON first (services.json), then DB as fallback
      if (!dynamicMeta) {
        const serviceMatch = p.match(/^\/services\/([^/]+)$/);
        if (serviceMatch) {
          let svc = await getServiceBySlugCached(serviceMatch[1]);
          if (!svc) {
            try {
              const { getServiceBySlug } = await import("../db");
              svc = await getServiceBySlug(serviceMatch[1]);
            } catch { /* DB not available, that's OK */ }
          }
          if (svc) {
            const titleFn = SERVICE_TITLE[lang] ?? SERVICE_TITLE.en;
            const descFn = SERVICE_DESCRIPTION[lang] ?? SERVICE_DESCRIPTION.en;
            // Resolve relative image to full URL for social sharing
            let svcImage = svc.image ?? undefined;
            if (svcImage && !svcImage.startsWith('http')) {
              svcImage = `${BOT_BASE_URL}${svcImage.startsWith('/') ? '' : '/'}${svcImage}`;
            }
            dynamicMeta = {
              title: titleFn({ name: svc.name }),
              description: descFn({ name: svc.name, tagline: svc.tagline, duration: svc.duration }).replace(/\s+/g, ' ').trim().slice(0, 155),
              image: svcImage,
              url: `${BOT_BASE_URL}/${lang}/services/${svc.slug}`,
            };
          }
        }
      }

      // /experiences/:slug and /activities/:slug — tries JSON first, then DB
      if (!dynamicMeta) {
        const expMatch = p.match(/^\/(?:experiences|activities)\/([^/]+)$/);
        if (expMatch) {
          // Try JSON data first (curated experiences from experienceDetails.json)
          let exp = await getExperienceBySlugCached(expMatch[1]);
          // Fallback to DB if JSON doesn't have it
          if (!exp) {
            try {
              const { getExperienceBySlug } = await import("../db");
              exp = await getExperienceBySlug(expMatch[1]);
            } catch { /* DB not available, that's OK */ }
          }
          if (exp) {
            const titleFn = EXPERIENCE_TITLE[lang] ?? EXPERIENCE_TITLE.en;
            const descFn = EXPERIENCE_DESCRIPTION[lang] ?? EXPERIENCE_DESCRIPTION.en;
            const destination = exp.destination || (Array.isArray(exp.destinations) ? exp.destinations[0] : '');
            // Ensure image is a full URL for social sharing
            let expImage = exp.image ?? (Array.isArray(exp.gallery) ? exp.gallery[0] : undefined);
            if (expImage && !expImage.startsWith('http')) {
              expImage = `${BOT_BASE_URL}${expImage.startsWith('/') ? '' : '/'}${expImage}`;
            }
            dynamicMeta = {
              title: titleFn({ name: exp.name, destination }),
              description: descFn({ name: exp.name, tagline: exp.tagline, duration: exp.duration, destination }).replace(/\s+/g, ' ').trim().slice(0, 155),
              image: expImage,
              url: `${BOT_BASE_URL}/${lang}${p}`,
              schemaDomId: `sd-experience-${exp.slug}`,
              schemaGraph: buildExperienceGraph(exp, lang, p),
              bodyHtml: buildExperienceSeoBody(exp, lang),
            };
          }
        }
      }

      // Cache the result (even null = "no record found") and inject
      setCachedDynamicMeta(dynamicCacheKey, dynamicMeta);
      if (dynamicMeta) {
        html = injectMeta(html, dynamicMeta);
        if (dynamicMeta.schemaDomId && dynamicMeta.schemaGraph) {
          html = injectSchemaGraph(html, dynamicMeta.schemaDomId, dynamicMeta.schemaGraph);
        }
        html = await injectBody(html, rawPath, p, dynamicMeta.bodyHtml);
      } else if (DYNAMIC_CONTENT_PREFIXES.some(pre => p.startsWith(pre))) {
        // Dynamic content route with no matching record → proper 404 (not soft 404)
        status = 404;
        html = html.replace(/<meta name="robots" content="[^"]*"/, '<meta name="robots" content="noindex, nofollow"');
      }
    } catch (err) {
      console.error("[Meta] Error injecting dynamic meta:", err);
    }

    // For any 404, ensure noindex so Google doesn't index dead pages
    if (status === 404) {
      html = html.replace(/<meta name="robots" content="[^"]*"/, '<meta name="robots" content="noindex, nofollow"');
    }

    setHtmlCacheHeaders(res, p, status);
    res.status(status).set("Content-Type", "text/html").send(html);
  });
}

/* ── Test hooks ───────────────────────────────────────────────────────────
   Expose the SSR injection internals so vitest can lock in their behaviour
   without booting the Express server (which needs Drizzle + env vars). This
   mirrors the `__testing` pattern in `server/lib/redirects.ts`. */
export const __testing = {
  buildStaticSeoBody,
  buildPropertySeoBody,
  buildExperienceSeoBody,
  buildBlogSeoBody,
  injectSeoBody,
  injectMeta,
  injectSchemaGraph,
  DESTINATION_DESCRIPTION,
  DESTINATION_TITLE,
  destLabel,
};
