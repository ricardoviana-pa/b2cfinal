import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
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
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

const BOT_UA_RE = /googlebot|bingbot|slurp|duckduckbot|baiduspider|yandexbot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|applebot|ia_archiver/i;

function isBotRequest(req: any): boolean {
  return BOT_UA_RE.test(req.headers['user-agent'] || '');
}

function injectMeta(html: string, meta: {
  title: string;
  description: string;
  image?: string;
  url: string;
  type?: string;
}): string {
  const title = meta.title;
  const description = meta.description;
  const image = meta.image ?? 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-main-96HXfBCK752avi2daWhgmd.webp';
  const url = meta.url;
  const type = meta.type ?? 'website';

  return html
    .replace(/(<title>)[^<]*(<\/title>)/, `$1${title}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/,  `$1${description}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/,        `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/,       `$1${title}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/,  `$1${description}$2`)
    .replace(/(<meta property="og:image" content=")[^"]*(")/,        `$1${image}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/,          `$1${url}$2`)
    .replace(/(<meta property="og:type" content=")[^"]*(")/,         `$1${type}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/,       `$1${title}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/,  `$1${description}$2`)
    .replace(/(<meta name="twitter:image" content=")[^"]*(")/,        `$1${image}$2`);
}

const BOT_BASE_URL = 'https://www.portugalactive.com';

const STATIC_META: Record<string, { title: string; description: string; url: string }> = {
  '/':            { title: 'Luxury Private Villas in Portugal | Hotel Service | Portugal Active', description: '50+ private villas across Portugal, each managed like a luxury hotel. Private chef, concierge, pool. Book direct for best rates.', url: `${BOT_BASE_URL}/` },
  '/homes':       { title: 'Private Villas Portugal | Luxury Holiday Homes | Portugal Active', description: 'Browse 50+ handpicked private villas across Portugal. Pool, concierge, housekeeping included. Filter by region and book direct.', url: `${BOT_BASE_URL}/homes` },
  '/destinations':{ title: 'Destinations in Portugal | Minho, Porto, Algarve & More | Portugal Active', description: 'Explore our luxury villa destinations across Portugal — Minho Coast, Porto & Douro, Algarve, Lisbon, Alentejo. Find your perfect region.', url: `${BOT_BASE_URL}/destinations` },
  '/services':    { title: 'Luxury Concierge Services | Private Chef, Spa, Transfers | Portugal Active', description: 'Elevate your villa stay with private chef, in-house spa, airport transfers, and bespoke experiences. Book alongside your villa.', url: `${BOT_BASE_URL}/services` },
  '/adventures':  { title: 'Outdoor Adventures Portugal | Surf, Hike, Wine Tours | Portugal Active', description: 'Guided adventures across Portugal — surf lessons, hiking trails, wine tastings, coasteering. Book with your villa stay.', url: `${BOT_BASE_URL}/adventures` },
  '/events':      { title: 'Private Events Portugal | Weddings, Retreats, Celebrations | Portugal Active', description: 'Host weddings, corporate retreats, and private celebrations in luxury Portuguese villas. Full event planning and concierge.', url: `${BOT_BASE_URL}/events` },
  '/blog':        { title: 'Portugal Travel Journal | Guides, Tips & Inspiration | Portugal Active', description: 'Insider guides to Portugal — best beaches, hidden restaurants, wine regions, and travel tips from our local concierge team.', url: `${BOT_BASE_URL}/blog` },
  '/about':       { title: 'About Portugal Active | Luxury Villa Management in Portugal', description: 'We manage 50+ private homes across Portugal end-to-end — bookings, concierge, housekeeping. A different kind of villa company.', url: `${BOT_BASE_URL}/about` },
  '/contact':     { title: 'Contact Portugal Active | Plan Your Stay in Portugal', description: 'Speak to our concierge team. We respond within 2 hours. Phone, WhatsApp, or email — plan your perfect Portuguese villa holiday.', url: `${BOT_BASE_URL}/contact` },
  '/owners':      { title: 'Property Management Portugal | Portugal Active for Owners', description: 'Maximise your rental income. Full-service villa management — marketing, bookings, housekeeping, maintenance, guest concierge.', url: `${BOT_BASE_URL}/owners` },
  '/faq':         { title: 'FAQ | Portugal Active', description: 'Answers to common questions about booking, cancellation, check-in, concierge services, and villa management with Portugal Active.', url: `${BOT_BASE_URL}/faq` },
};

const DESTINATION_META: Record<string, { name: string; description: string }> = {
  'minho':    { name: 'Minho Coast', description: 'Luxury villas on the Minho Coast, Portugal. Wild beaches, green valleys, and historic quintas — the undiscovered north.' },
  'porto':    { name: 'Porto & Douro', description: 'Luxury villas in Porto and the Douro Valley, Portugal. Wine estates, city breaks, and river views.' },
  'lisbon':   { name: 'Lisbon', description: 'Luxury villas near Lisbon, Portugal. Sintra, Cascais, and the Atlantic coast — cultural capital meets beach escape.' },
  'alentejo': { name: 'Alentejo', description: 'Luxury villas in Alentejo, Portugal. Endless plains, cork forests, and slow-travel at its finest.' },
  'algarve':  { name: 'Algarve', description: 'Luxury villas in the Algarve, Portugal. Clifftop retreats, golden beaches, and year-round sunshine.' },
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
  }));

  const KNOWN_ROUTES = new Set([
    "/", "/homes", "/about", "/contact", "/services", "/adventures",
    "/events", "/blog", "/faq", "/careers", "/owners", "/login", "/account",
    "/legal/privacy", "/legal/terms", "/legal/cookies", "/admin", "/404",
  ]);
  const KNOWN_PREFIXES = ["/homes/", "/destinations/", "/blog/", "/services/", "/admin/", "/booking/"];

  app.use("*", async (req, res) => {
    const p = req.originalUrl.split("?")[0];
    const isKnown = KNOWN_ROUTES.has(p) || KNOWN_PREFIXES.some(pre => p.startsWith(pre));
    const status = isKnown ? 200 : 404;
    const indexPath = path.resolve(distPath, "index.html");

    if (!isBotRequest(req)) {
      return res.status(status).sendFile(indexPath);
    }

    // Bot request — inject page-specific meta before sending
    let html: string;
    try {
      html = fs.readFileSync(indexPath, "utf-8");
    } catch {
      return res.status(status).sendFile(indexPath);
    }

    try {
      // Static routes
      if (STATIC_META[p]) {
        const m = STATIC_META[p];
        html = injectMeta(html, { ...m });
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /homes/:slug
      const homesMatch = p.match(/^\/homes\/([^/]+)$/);
      if (homesMatch) {
        const { getPropertyBySlug } = await import("../db");
        const prop = await getPropertyBySlug(homesMatch[1]);
        if (prop) {
          const beds = prop.bedrooms ? `${prop.bedrooms}-bedroom ` : '';
          html = injectMeta(html, {
            title: prop.seoTitle || `${prop.name} | Portugal Active`,
            description: prop.seoDescription || `${beds}luxury villa in Portugal. ${prop.tagline || ''}. Book direct with Portugal Active.`.replace(/\s+/g, ' ').trim().slice(0, 155),
            image: (prop.images as string[] | null)?.[0],
            url: `${BOT_BASE_URL}/homes/${prop.slug}`,
            type: 'place',
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /blog/:slug
      const blogMatch = p.match(/^\/blog\/([^/]+)$/);
      if (blogMatch) {
        const { getBlogPostBySlug } = await import("../db");
        const post = await getBlogPostBySlug(blogMatch[1]);
        if (post) {
          html = injectMeta(html, {
            title: post.seoTitle || `${post.title} | Portugal Active`,
            description: post.seoDescription || (post.excerpt ?? '').slice(0, 155),
            image: post.coverImage ?? undefined,
            url: `${BOT_BASE_URL}/blog/${post.slug}`,
            type: 'article',
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }

      // /destinations/:slug
      const destMatch = p.match(/^\/destinations\/([^/]+)$/);
      if (destMatch) {
        const d = DESTINATION_META[destMatch[1]];
        if (d) {
          html = injectMeta(html, {
            title: `${d.name} Portugal | Luxury Villas and Experiences | Portugal Active`,
            description: d.description,
            url: `${BOT_BASE_URL}/destinations/${destMatch[1]}`,
          });
        }
        return res.status(status).set("Content-Type", "text/html").send(html);
      }
    } catch (err) {
      console.error("[BotMeta] Error injecting meta:", err);
    }

    // Fallback: send unmodified HTML
    res.status(status).set("Content-Type", "text/html").send(html);
  });
}
