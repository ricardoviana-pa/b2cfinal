import "dotenv/config";
import express from "express";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import fs from "fs";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevAuthRoutes } from "./devAuth";
import { registerGoogleAuthRoutes } from "./googleAuth";
import { registerBookingRoutes, registerGuestyWebhookRoute } from "../routes/booking";
import { registerRecoveryOptoutRoute } from "../routes/checkout-recovery-optout";
import { registerStripePayPalWebhookRoute } from "../routes/stripe-paypal-webhook";
import { registerStripeKlarnaWebhookRoute } from "../routes/stripe-klarna-webhook";
import { registerStripeCardWebhookRoute } from "../routes/stripe-card-webhook";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { isGuestyConfigured, warmUpOAuthTokens } from "../lib/guesty";
import { runSync } from "../services/guesty-sync";
import { runDatesOpenedAlerts } from "../services/dates-opened-alert";
import { applyCleaningFeeFix } from "../services/cleaning-fee-sync";
import cron from "node-cron";
import { legacyRedirects } from "../lib/redirects.js";
import { isNonIndexableHost } from "../lib/hosts.js";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.set("trust proxy", true);

  // Canonical domain redirects — only fires for the exact production bare domain.
  // Uses X-Forwarded-Host directly so dev/stg subdomains are never affected.
  app.use((req, res, next) => {
    const proto = req.headers['x-forwarded-proto'] as string | undefined;
    const fwdHost = (req.headers['x-forwarded-host'] as string | undefined)
      ?.split(',')[0].trim().split(':')[0];

    // Non-www production → www (portug**al**active.com only, not dev/stg/www)
    if (fwdHost === 'portug' + 'alactive.com') {
      return res.redirect(301, `https://www.portug` + `alactive.com${req.originalUrl}`);
    }

    // HTTP → HTTPS for production domains only
    if (proto === 'http' && fwdHost && (fwdHost === 'portug' + 'alactive.com' || fwdHost === 'www.portug' + 'alactive.com')) {
      return res.redirect(301, `https://${fwdHost}${req.originalUrl}`);
    }

    next();
  });

  // Gzip/Brotli compression — reduces HTML/CSS/JS payload ~60-80%
  app.use(compression({
    level: 6,                         // balanced speed vs ratio
    threshold: 1024,                  // skip tiny responses (<1KB)
    filter: (req, res) => {
      // Don't compress server-sent events
      if (req.headers.accept === 'text/event-stream') return false;
      return compression.filter(req, res);
    },
  }));

  app.use(helmet({
    // Content-Security-Policy is intentionally disabled. The site runs Google
    // Tag Manager, which injects marketing tags (Facebook Pixel, Microsoft
    // Clarity, Google Ads, …) from domains that change over time. A script-src
    // allowlist breaks those tags on every change — an earlier CSP attempt
    // silently broke FB Pixel + Clarity in production. A correct CSP here needs
    // a dedicated effort (Report-Only monitoring first); until then `false`.
    // The other Helmet protections below (HSTS, X-Frame-Options, nosniff,
    // Referrer-Policy) stay on — they add value without breaking anything.
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts. Please try again later." } });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
  const leadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many submissions. Please wait a moment." } });

  app.use("/api/auth/google", authLimiter);
  app.use("/api/auth/dev-login", authLimiter);
  app.use("/api/reservations", apiLimiter);
  app.use("/api/trpc/leads.create", leadLimiter);
  app.use("/api/trpc/booking", apiLimiter);
  app.use("/api/trpc/checkout", apiLimiter); // checkout_v2 intents + lead capture

  // Guesty webhook needs raw body for signature validation
  registerGuestyWebhookRoute(app);
  registerStripePayPalWebhookRoute(app); // must be before express.json() — needs raw body
  registerStripeKlarnaWebhookRoute(app);
  registerStripeCardWebhookRoute(app); // must be before express.json() — needs raw body
  // Apple Pay: ficheiro de verificação de domínio da Apple (exigido pelo
  // Stripe payment_method_domains; sem ele o botão nunca aparece em Safari)
  app.get("/.well-known/apple-developer-merchantid-domain-association", (_req, res) => {
    res.type("text/plain");
    res.sendFile(path.resolve(process.cwd(), "server", "config", "apple-developer-merchantid-domain-association"));
  });
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // REST booking endpoints (frontend booking flow)
  registerBookingRoutes(app);
  // Bloco 2: opt-out dos lembretes de recuperação (link no rodapé dos emails)
  registerRecoveryOptoutRoute(app);
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  registerDevAuthRoutes(app);
  registerGoogleAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  // 301 redirects for legacy URLs (Webflow / WP / Joomla migration).
  // Replaces ~30 ad-hoc app.get(...) calls with a centralised, table-driven middleware.
  // Source: Wayback Machine inventory + properties.json slug mapping.
  // See server/lib/redirects.ts for full coverage and tests.
  // Keep non-production hosts out of the index.
  //
  // dev.portugalactive.com serves the same pages as www with the same
  // "index, follow" meta, which makes it a second crawlable copy of the whole
  // catalogue competing with the real site. The canonical points at www, which
  // limits the damage but does not stop the crawling. A header is used rather
  // than the meta tag so it also covers non-HTML responses, and it is driven by
  // the request Host so no per-environment config can drift out of sync.
  app.use((req, res, next) => {
    if (isNonIndexableHost(req.headers.host)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }
    next();
  });

  app.use(legacyRedirects);

  /** Destination slugs that are published (status active, not coming soon). */
  function publishedDestinationSlugs(): string[] {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "client", "src", "data", "destinations.json"), "utf-8"));
      return (Array.isArray(raw) ? raw : [])
        .filter((d: any) => d?.slug && d.status === "active" && !d.comingSoon)
        .map((d: any) => d.slug as string);
    } catch {
      return ["minho", "porto", "lisbon", "alentejo", "algarve"];
    }
  }

  // Dynamic sitemap.xml with multi-language support
  const SITEMAP_LANGS = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const { getPropertiesForSite } = await import("../services/properties-store");
      const { listBlogPosts, listServices } = await import("../db");
      const properties = await getPropertiesForSite();
      const blogPosts = await listBlogPosts({ status: "published" });
      const serviceItems = await listServices({ activeOnly: true });
      const base = "https://www.portugalactive.com";
      const now = new Date().toISOString().split("T")[0];

      // Pages whose content only moves when we deploy (static routes, and the
      // curated JSON collections that ship inside the bundle) are dated by the
      // build itself. Using today's date instead would claim a change that did
      // not happen, and a <lastmod> that is always "today" is one a crawler
      // learns to ignore.
      let deployDate = now;
      try {
        deployDate = fs.statSync(process.argv[1]).mtime.toISOString().split("T")[0];
      } catch { /* fall back to today */ }

      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "daily" },
        { loc: "/homes", priority: "0.9", changefreq: "daily" },
        { loc: "/destinations", priority: "0.9", changefreq: "monthly" },
        // Every published destination, from the data — drafts ("[TBD]" copy)
        // and coming-soon entries stay out (auditoria set/2026, I2/N19).
        ...publishedDestinationSlugs().map((slug) => ({ loc: `/destinations/${slug}`, priority: "0.9", changefreq: "monthly" })),
        { loc: "/collections/villas-with-private-pool", priority: "0.8", changefreq: "weekly" },
        { loc: "/collections/sea-view-villas", priority: "0.8", changefreq: "weekly" },
        { loc: "/collections/large-group-villas", priority: "0.8", changefreq: "weekly" },
        { loc: "/collections/pet-friendly-villas", priority: "0.8", changefreq: "weekly" },
        { loc: "/collections/villas-with-jacuzzi", priority: "0.8", changefreq: "weekly" },
        { loc: "/collections/beach-villas", priority: "0.8", changefreq: "weekly" },
        { loc: "/services", priority: "0.8", changefreq: "monthly" },
        { loc: "/adventures", priority: "0.8", changefreq: "monthly" },
        { loc: "/events", priority: "0.8", changefreq: "monthly" },
        { loc: "/blog", priority: "0.8", changefreq: "weekly" },
        { loc: "/about", priority: "0.7", changefreq: "monthly" },
        { loc: "/contact", priority: "0.7", changefreq: "monthly" },
        { loc: "/owners", priority: "0.7", changefreq: "monthly" },
        { loc: "/faq", priority: "0.7", changefreq: "monthly" },
        { loc: "/careers", priority: "0.7", changefreq: "monthly" },
        { loc: "/best-rate-guarantee", priority: "0.5", changefreq: "yearly" },
        { loc: "/legal/privacy", priority: "0.3", changefreq: "yearly" },
        { loc: "/legal/terms", priority: "0.3", changefreq: "yearly" },
        { loc: "/legal/cookies", priority: "0.3", changefreq: "yearly" },
      ];

      /** Generate a <url> entry with hreflang alternates for all languages */
      const url = (pagePath: string, lang: string, lastmod: string, changefreq: string, priority: string) => {
        const loc = `${base}/${lang}${pagePath === '/' ? '' : pagePath}`;
        const alternates = SITEMAP_LANGS.map(l =>
          `    <xhtml:link rel="alternate" hreflang="${l}" href="${base}/${l}${pagePath === '/' ? '' : pagePath}" />`
        ).join('\n');
        const xDefault = `    <xhtml:link rel="alternate" hreflang="x-default" href="${base}/en${pagePath === '/' ? '' : pagePath}" />`;
        return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n${alternates}\n${xDefault}\n  </url>`;
      };

      const allUrls: string[] = [];

      // Static pages × all languages
      for (const lang of SITEMAP_LANGS) {
        for (const p of staticPages) {
          allUrls.push(url(p.loc, lang, deployDate, p.changefreq, p.priority));
        }
      }

      // Dynamic pages × all languages
      const dynamicPages: { path: string; lastmod: string; changefreq: string; priority: string }[] = [];

      for (const p of properties.filter((p: any) => p.slug)) {
        // lastModified is stamped by the Guesty sync from a fingerprint of the
        // page-defining fields, so an untouched home keeps its old date and a
        // real change stands out. Homes synced before that shipped have no
        // stamp yet and fall back to the deploy date.
        const lastmod = (p as any).lastModified || deployDate;
        dynamicPages.push({ path: `/homes/${(p as any).slug}`, lastmod, changefreq: "weekly", priority: "0.9" });
      }

      // Blog: articles live in client/src/data/blog.json, NOT the blogPosts
      // table (see getBlogArticleBySlugCached in _core/vite.ts). Querying only
      // the DB silently emitted zero /blog/* URLs while 39 published articles
      // were live and returning 200 — orphaned from the sitemap. Union both so
      // the file-based articles are covered and any future DB post still is.
      const blogSlugs = new Set<string>();
      try {
        const blogPath = path.join(process.cwd(), "client", "src", "data", "blog.json");
        const blogFile = JSON.parse(fs.readFileSync(blogPath, "utf-8"));
        for (const a of (blogFile.articles || [])) {
          if (!a?.slug || a.status !== "published") continue;
          blogSlugs.add(a.slug);
          const lastmod = a.publishDate ? new Date(a.publishDate).toISOString().split("T")[0] : now;
          dynamicPages.push({ path: `/blog/${a.slug}`, lastmod, changefreq: "monthly", priority: "0.8" });
        }
      } catch (e) {
        console.warn("[Sitemap] could not load blog.json", e);
      }

      for (const p of blogPosts.filter((p: any) => p.slug && !blogSlugs.has((p as any).slug))) {
        const mod = (p as any).updatedAt || (p as any).publishedAt || (p as any).createdAt;
        const lastmod = mod ? new Date(mod).toISOString().split("T")[0] : now;
        dynamicPages.push({ path: `/blog/${(p as any).slug}`, lastmod, changefreq: "monthly", priority: "0.8" });
      }

      // Services: same split as the blog — the live pages are driven by
      // client/src/data/services.json while listServices() reads an empty
      // table, so every /services/* URL was missing from the sitemap despite
      // returning 200. Union both, file first.
      const serviceSlugs = new Set<string>();
      try {
        const svcPath = path.join(process.cwd(), "client", "src", "data", "services.json");
        const svcFile = JSON.parse(fs.readFileSync(svcPath, "utf-8"));
        for (const sv of (svcFile.services || svcFile || [])) {
          if (!sv?.slug) continue;
          serviceSlugs.add(sv.slug);
          dynamicPages.push({ path: `/services/${sv.slug}`, lastmod: deployDate, changefreq: "monthly", priority: "0.8" });
        }
      } catch (e) {
        console.warn("[Sitemap] could not load services.json", e);
      }

      for (const s of serviceItems.filter((s: any) => s.slug && !serviceSlugs.has((s as any).slug))) {
        dynamicPages.push({ path: `/services/${(s as any).slug}`, lastmod: deployDate, changefreq: "monthly", priority: "0.8" });
      }

      // Experience detail pages (from static JSON — these are curated activity PDPs)
      try {
        // process.cwd(), not __dirname: the server is bundled to dist/index.js,
        // where "../.." resolved to the parent of the project root and this
        // read failed with ENOENT on every request — the catch below turned
        // that into a warning, so the sitemap shipped with no experience URLs.
        const expPath = path.join(process.cwd(), "client", "src", "data", "experienceDetails.json");
        const expData = JSON.parse(fs.readFileSync(expPath, "utf-8"));
        for (const exp of (expData.experiences || [])) {
          if (exp.slug) {
            dynamicPages.push({ path: `/experiences/${exp.slug}`, lastmod: deployDate, changefreq: "monthly", priority: "0.8" });
          }
        }
      } catch (e) {
        console.warn("[Sitemap] could not load experienceDetails.json", e);
      }

      for (const lang of SITEMAP_LANGS) {
        for (const dp of dynamicPages) {
          allUrls.push(url(dp.path, lang, dp.lastmod, dp.changefreq, dp.priority));
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${allUrls.join("\n")}
</urlset>`;

      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (err) {
      console.error("[Sitemap] Error generating sitemap:", err);
      res.status(500).send("Error generating sitemap");
    }
  });

  // ── IndexNow: notify Bing/Yandex when content changes ──────────────
  // POST /api/indexnow { urls: ["/homes/new-villa-slug"] }
  // Protected by admin key. Call after property sync or blog publish.
  // Key + submission live in services/indexnow.ts so the Guesty sync and this
  // route cannot drift apart on the key or the endpoint contract.
  const { INDEXNOW_KEY, submitUrls } = await import("../services/indexnow");

  // Serve the key verification file
  app.get(`/${INDEXNOW_KEY}.txt`, (_req, res) => {
    res.type('text/plain').send(INDEXNOW_KEY);
  });

  app.post('/api/indexnow', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { urls } = req.body as { urls?: string[] };
    if (!urls || !urls.length) return res.status(400).json({ error: 'urls[] required' });

    const result = await submitUrls(urls);
    if (!result.ok) return res.status(502).json({ error: result.error ?? `IndexNow returned ${result.status}` });
    res.json({ status: result.status, submitted: result.submitted });
  });

  // Admin email trigger endpoints
  const adminAuth = (req: any, res: any, next: any) => {
    const key = req.headers["x-admin-key"];
    const expected = process.env.ADMIN_API_KEY;
    if (!expected || key !== expected) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  };

  app.post("/api/admin/send-pre-arrival/:tripId", adminAuth, async (req, res) => {
    try {
      const { sendPreArrival } = await import("../services/transactional-email");
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });
      const [rows] = await (db as any).execute("SELECT * FROM customer_trips WHERE id = ?", [req.params.tripId]);
      const trip = (rows as any[])?.[0];
      if (!trip) return res.status(404).json({ error: "Trip not found" });
      const [userRows] = await (db as any).execute("SELECT email, name FROM users WHERE id = ?", [trip.userId]);
      const user = (userRows as any[])?.[0];
      if (!user?.email) return res.status(400).json({ error: "No guest email found" });
      await sendPreArrival({
        guestName: user.name || "Guest",
        guestEmail: user.email,
        propertyName: trip.propertyName || "Portugal Active Home",
        checkIn: trip.checkIn,
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/send-post-stay/:tripId", adminAuth, async (req, res) => {
    try {
      const { sendPostStay } = await import("../services/transactional-email");
      const { getDb } = await import("../db");
      const db = await getDb();
      if (!db) return res.status(500).json({ error: "Database not available" });
      const [rows] = await (db as any).execute("SELECT * FROM customer_trips WHERE id = ?", [req.params.tripId]);
      const trip = (rows as any[])?.[0];
      if (!trip) return res.status(404).json({ error: "Trip not found" });
      const [userRows] = await (db as any).execute("SELECT email, name FROM users WHERE id = ?", [trip.userId]);
      const user = (userRows as any[])?.[0];
      if (!user?.email) return res.status(400).json({ error: "No guest email found" });
      await sendPostStay({
        guestName: user.name || "Guest",
        guestEmail: user.email,
        propertyName: trip.propertyName || "Portugal Active Home",
      });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Prerender.io — serve pre-rendered HTML to search engine + AI bots.
  // Only active when PRERENDER_TOKEN env var is set (production).
  // Without it, JS-less crawlers (notably AI crawlers) get the empty SPA
  // shell. Server-side meta + JSON-LD still describe the page, but the body
  // prose only becomes crawlable once this is enabled.
  if (process.env.PRERENDER_TOKEN) {
    try {
      const prerender = (await import('prerender-node')).default;
      prerender.set('prerenderToken', process.env.PRERENDER_TOKEN);
      // prerender-node's default UA list predates the AI crawlers, which are
      // exactly the ones that DON'T execute JS and most need pre-rendering.
      const aiCrawlers = [
        'gptbot', 'oai-searchbot', 'chatgpt-user', 'perplexitybot',
        'perplexity-user', 'claudebot', 'claude-web', 'anthropic-ai',
        'google-extended', 'ccbot', 'meta-externalagent', 'bytespider',
        'amazonbot', 'applebot-extended', 'diffbot',
      ];
      for (const ua of aiCrawlers) {
        if (!(prerender as any).crawlerUserAgents.includes(ua)) {
          (prerender as any).crawlerUserAgents.push(ua);
        }
      }
      app.use(prerender);
      console.info(`[prerender] Active — ${(prerender as any).crawlerUserAgents.length} crawler UAs (incl. AI bots)`);
    } catch {
      console.warn('[prerender] prerender-node not installed, skipping bot pre-rendering');
    }
  } else {
    console.warn('[prerender] PRERENDER_TOKEN not set — bots receive the CSR shell (meta + JSON-LD only, no body prose).');
  }

  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.info(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  // Auto-migrate: ensure new tables exist (idempotent, safe to run on every deploy)
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      await (db as any).execute(`
        CREATE TABLE IF NOT EXISTS \`property_referrals\` (
          \`id\` int AUTO_INCREMENT NOT NULL,
          \`referrerId\` int NOT NULL,
          \`ownerName\` varchar(255) NOT NULL,
          \`ownerEmail\` varchar(320),
          \`ownerPhone\` varchar(50),
          \`propertyAddress\` varchar(500),
          \`propertyCity\` varchar(100),
          \`propertyRegion\` varchar(100),
          \`propertyBedrooms\` int,
          \`propertyType\` varchar(100),
          \`propertyDescription\` text,
          \`notes\` text,
          \`tier\` enum('select','luxury'),
          \`status\` enum('submitted','contacted','under_review','signed','rejected') NOT NULL DEFAULT 'submitted',
          \`rewardAmount\` int NOT NULL DEFAULT 0,
          \`rewardPaid\` boolean NOT NULL DEFAULT false,
          \`adminNotes\` text,
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY(\`id\`),
          INDEX \`idx_property_referrals_referrer\` (\`referrerId\`),
          INDEX \`idx_property_referrals_status\` (\`status\`)
        )
      `);
      console.info("[Migration] property_referrals table OK");
    }
  } catch (migErr: any) {
    console.warn("[Migration] property_referrals:", migErr.message);
  }

  // Checkout 2.0 (Fase 1): booking_intents — server-side checkout state.
  // Same idempotent boot-migration pattern as property_referrals above.
  try {
    const { getDb } = await import("../db");
    const db = await getDb();
    if (db) {
      await (db as any).execute(`
        CREATE TABLE IF NOT EXISTS \`booking_intents\` (
          \`id\` varchar(36) NOT NULL,
          \`listingId\` varchar(64) NOT NULL,
          \`propertyName\` varchar(255),
          \`propertySlug\` varchar(255),
          \`destination\` varchar(255),
          \`guestyQuoteId\` varchar(64),
          \`checkIn\` varchar(10) NOT NULL,
          \`checkOut\` varchar(10) NOT NULL,
          \`guests\` int NOT NULL,
          \`ratePlanId\` varchar(64),
          \`ratePlanType\` enum('flexible','non_refundable','other'),
          \`email\` varchar(320),
          \`guestFirstName\` varchar(100),
          \`guestLastName\` varchar(100),
          \`guestPhone\` varchar(50),
          \`nif\` varchar(20),
          \`quote\` json,
          \`extras\` json,
          \`reception\` json,
          \`flex\` boolean NOT NULL DEFAULT false,
          \`recovery_stage\` int NOT NULL DEFAULT 0,
          \`status\` enum('draft','contact_captured','payment_pending','paid','expired') NOT NULL DEFAULT 'draft',
          \`locale\` varchar(5),
          \`reservationId\` varchar(64),
          \`confirmationCode\` varchar(64),
          \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          \`expiresAt\` timestamp NULL,
          PRIMARY KEY(\`id\`),
          INDEX \`idx_booking_intents_status\` (\`status\`),
          INDEX \`idx_booking_intents_email\` (\`email\`)
        )
      `);
      // Fase 2 added the `reception` column — add it to tables created before
      // that (CREATE TABLE IF NOT EXISTS above is a no-op on existing tables).
      // A duplicate-column error just means it's already there.
      try {
        await (db as any).execute("ALTER TABLE `booking_intents` ADD COLUMN `reception` json");
        console.info("[Migration] booking_intents.reception column added");
      } catch (alterErr: any) {
        if (!/duplicate column|exists/i.test(alterErr?.message || "")) {
          console.warn("[Migration] booking_intents.reception:", alterErr.message);
        }
      }
      // Fase 4: recovery_stage tracks the abandonment emails already sent
      // (0 = none, 1 = 1h, 2 = 20h) — same add-column pattern as reception.
      try {
        await (db as any).execute("ALTER TABLE `booking_intents` ADD COLUMN `recovery_stage` int NOT NULL DEFAULT 0");
        console.info("[Migration] booking_intents.recovery_stage column added");
      } catch (alterErr: any) {
        if (!/duplicate column|exists/i.test(alterErr?.message || "")) {
          console.warn("[Migration] booking_intents.recovery_stage:", alterErr.message);
        }
      }
      // Bloco 2: opt-out dos lembretes de recuperação (link no rodapé dos
      // emails) — mesmo padrão idempotente de add-column.
      try {
        await (db as any).execute("ALTER TABLE `booking_intents` ADD COLUMN `recovery_optout` boolean NOT NULL DEFAULT false");
        console.info("[Migration] booking_intents.recovery_optout column added");
      } catch (alterErr: any) {
        // drizzle wraps driver errors ("Failed query: …" with the MySQL error
        // in .cause) — check both, and never abort the remaining ALTERs.
        if (!/duplicate column|exists/i.test(`${alterErr?.message || ""} ${alterErr?.cause?.message || ""}`)) {
          console.warn("[Migration] booking_intents.recovery_optout:", alterErr.message);
        }
      }
      try {
        await (db as any).execute("ALTER TABLE `booking_intents` ADD COLUMN `payment_intent_id` varchar(64)");
        console.info("[Migration] booking_intents.payment_intent_id column added");
      } catch (alterErr: any) {
        if (!/duplicate column|exists/i.test(`${alterErr?.message || ""} ${alterErr?.cause?.message || ""}`)) {
          console.warn("[Migration] booking_intents.payment_intent_id:", alterErr.message);
        }
      }
      console.info("[Migration] booking_intents table OK");
    }
  } catch (migErr: any) {
    console.warn("[Migration] booking_intents:", migErr.message);
  }

  server.listen(port, () => {
    console.info(`Server running on http://localhost:${port}/`);

    // Apple Pay: garante o domínio registado na conta Stripe da plataforma
    // (idempotente; dev regista dev., produção regista o domínio live)
    import("../services/apple-pay-domain")
      .then((m) => m.ensureApplePayDomain())
      .catch((e) => console.warn("[ApplePay] boot:", e?.message));

    // Rede de segurança do cartão 2b: auto-regista o webhook no Stripe e
    // guarda o signing secret na app_config (sem passos manuais nem env).
    import("../services/stripe-card-webhook-setup")
      .then((m) => m.ensureCardWebhookEndpoint())
      .catch((e) => console.warn("[CardWebhook] boot:", e?.message));

    // Deploy novo → purga a CDN passados 90 s (auditoria set/2026, N2). Só em
    // produção e só com CLOUDFLARE_API_TOKEN; ver services/cdn-purge.ts.
    import("../services/cdn-purge")
      .then((m) => m.scheduleBootPurge())
      .catch((e) => console.warn("[CDN] boot:", e?.message));

    // Checkout 2.0 (Fase 4): abandonment recovery emails (1h + 20h).
    // Fail-soft — the sweep no-ops when the DB is unavailable.
    try {
      import("../services/checkout-recovery")
        .then(({ startCheckoutRecoveryScheduler }) => startCheckoutRecoveryScheduler())
        .catch((e) => console.warn("[Recovery] Scheduler not started:", e?.message ?? e));
    } catch (e: any) {
      console.warn("[Recovery] Scheduler not started:", e?.message ?? e);
    }

    // Guesty sync: pull listings (photos, texts, pricing).
    // DISABLED on startup to prevent OAuth rate-limit exhaustion during deploys.
    // Static fallback JSON (auto-committed to GitHub by previous syncs) covers the gap.
    // Cron fires at 07:00 and 19:00 Lisbon time for regular updates.
    // Pre-fetch OAuth tokens so the first visitor doesn't wait for token negotiation
    if (isGuestyConfigured()) {
      warmUpOAuthTokens().catch(() => {/* non-blocking */});
    }

    if (isGuestyConfigured()) {
      cron.schedule("0 7,19 * * *", () => {
        console.info("[Cron] Running scheduled Guesty sync...");
        runSync()
          .then((p) => console.info(`[Cron] Guesty sync complete → ${p}`))
          .catch((e) => {
            // Surface the real HTTP status + Guesty error body so failures are
            // diagnosable without source access (401 = bad secret, 403 = missing
            // scope, 400 = invalid_scope/grant). A GuestyClientError carries
            // status/endpoint/details; plain errors fall back to the message.
            const status = e?.status ?? "n/a";
            const endpoint = e?.endpoint ?? "n/a";
            let details = e?.details;
            if (details && typeof details !== "string") {
              try { details = JSON.stringify(details); } catch { details = String(details); }
            }
            console.warn(
              `[Cron] Guesty sync failed: ${e?.message ?? e} ` +
              `(status=${status}, endpoint=${endpoint}, details=${details ?? "none"})`
            );
          });
      }, { timezone: "Europe/Lisbon" });
      console.info("[Cron] Guesty sync scheduled — 07:00 and 19:00 Europe/Lisbon (no startup sync)");

      // "Your dates opened" alerts — 40 min after each sync, so the calendars
      // the sweep reads reflect the fresh availability. One email per lead ever
      // (stamped in metadata); see services/dates-opened-alert.ts.
      cron.schedule("40 7,19 * * *", () => {
        runDatesOpenedAlerts()
          .then((r) => console.info(`[Cron] Dates-opened sweep → ${r}`))
          .catch((e) => console.warn(`[Cron] Dates-opened sweep failed: ${e?.message ?? e}`));
      }, { timezone: "Europe/Lisbon" });
      console.info("[Cron] Dates-opened alerts scheduled — 07:40 and 19:40 Europe/Lisbon");

      // Cleaning-fee drift sync — forces every rate plan's cleaning fee to
      // match its listing's cleaningFee field. Runs 15 min after each Guesty
      // pull so the audit uses fresh data. Gated by CLEANING_FEE_SYNC_ENABLED
      // until manual dry-run validates write capability — see
      // scripts/cleaning-fees.ts.
      const cleaningSyncMode = process.env.CLEANING_FEE_SYNC_ENABLED;
      if (cleaningSyncMode === "dryrun" || cleaningSyncMode === "apply") {
        const dryRun = cleaningSyncMode !== "apply";
        cron.schedule("15 7,19 * * *", () => {
          console.info(`[Cron] Cleaning-fee sync (${dryRun ? "DRY-RUN" : "APPLY"})...`);
          applyCleaningFeeFix({ dryRun, onStep: (m) => console.info(`[Cron]  ${m}`) })
            .then((r) =>
              console.info(
                `[Cron] Cleaning-fee sync done: scanned=${r.scannedRatePlans}, drift=${r.outOfSync.length}, ` +
                  `${dryRun ? "would-update" : "updated"}=${r.succeeded}, failed=${r.failed.length}`,
              ),
            )
            .catch((e) => console.warn(`[Cron] Cleaning-fee sync failed: ${e?.message ?? e}`));
        }, { timezone: "Europe/Lisbon" });
        console.info(`[Cron] Cleaning-fee sync scheduled — 07:15 and 19:15 Europe/Lisbon (${dryRun ? "dry-run" : "APPLY"})`);
      } else {
        console.info("[Cron] Cleaning-fee sync DISABLED (set CLEANING_FEE_SYNC_ENABLED=dryrun or apply)");
      }
    }
  });
}

startServer().catch(console.error);
