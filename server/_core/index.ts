import "dotenv/config";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevAuthRoutes } from "./devAuth";
import { registerGoogleAuthRoutes } from "./googleAuth";
import { registerBookingRoutes, registerGuestyWebhookRoute } from "../routes/booking";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { isGuestyConfigured, warmUpOAuthTokens } from "../lib/guesty";
import { runSync } from "../services/guesty-sync";
import cron from "node-cron";

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
  }));

  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false, message: { error: "Too many login attempts. Please try again later." } });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
  const leadLimiter = rateLimit({ windowMs: 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false, message: { error: "Too many submissions. Please wait a moment." } });

  app.use("/api/auth/google", authLimiter);
  app.use("/api/auth/dev-login", authLimiter);
  app.use("/api/reservations", apiLimiter);
  app.use("/api/trpc/leads.create", leadLimiter);
  app.use("/api/trpc/booking", apiLimiter);

  // Guesty webhook needs raw body for signature validation
  registerGuestyWebhookRoute(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // REST booking endpoints (frontend booking flow)
  registerBookingRoutes(app);
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

  // 301 redirects — old Webflow URLs → new SPA routes (preserves SEO equity)
  app.get('/properties', (_req, res) => res.redirect(301, '/homes'));
  app.get('/properties/:slug', (req, res) => res.redirect(301, `/homes/${req.params.slug}`));
  app.get('/contact-us', (_req, res) => res.redirect(301, '/contact'));
  app.get('/legal-terms', (_req, res) => res.redirect(301, '/legal/terms'));
  app.get('/why-portugal-active', (_req, res) => res.redirect(301, '/about'));
  app.get('/locations/minho', (_req, res) => res.redirect(301, '/destinations/minho'));
  app.get('/locations/porto', (_req, res) => res.redirect(301, '/destinations/porto'));
  app.get('/locations/algarve', (_req, res) => res.redirect(301, '/destinations/algarve'));
  app.get('/locations/:slug', (_req, res) => res.redirect(301, '/destinations'));
  app.get('/journal', (_req, res) => res.redirect(301, '/blog'));
  app.get('/account/login', (_req, res) => res.redirect(301, '/login'));

  // Dynamic sitemap.xml
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const { getPropertiesForSite } = await import("../services/properties-store");
      const { listBlogPosts, listServices } = await import("../db");
      const properties = await getPropertiesForSite();
      const blogPosts = await listBlogPosts({ status: "published" });
      const serviceItems = await listServices({ activeOnly: true });
      // Always use production domain for sitemap — this is for search engine indexing only
      const base = "https://www.portugalactive.com";
      const now = new Date().toISOString().split("T")[0];

      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "daily" },
        { loc: "/homes", priority: "0.9", changefreq: "daily" },
        { loc: "/destinations", priority: "0.9", changefreq: "monthly" },
        { loc: "/destinations/minho", priority: "0.9", changefreq: "monthly" },
        { loc: "/destinations/porto", priority: "0.9", changefreq: "monthly" },
        { loc: "/destinations/lisbon", priority: "0.9", changefreq: "monthly" },
        { loc: "/destinations/alentejo", priority: "0.9", changefreq: "monthly" },
        { loc: "/destinations/algarve", priority: "0.9", changefreq: "monthly" },
        { loc: "/services", priority: "0.8", changefreq: "monthly" },
        { loc: "/adventures", priority: "0.8", changefreq: "monthly" },
        { loc: "/events", priority: "0.8", changefreq: "monthly" },
        { loc: "/blog", priority: "0.8", changefreq: "weekly" },
        { loc: "/about", priority: "0.7", changefreq: "monthly" },
        { loc: "/contact", priority: "0.7", changefreq: "monthly" },
        { loc: "/owners", priority: "0.7", changefreq: "monthly" },
        { loc: "/faq", priority: "0.7", changefreq: "monthly" },
        { loc: "/careers", priority: "0.7", changefreq: "monthly" },
        { loc: "/legal/privacy", priority: "0.3", changefreq: "yearly" },
        { loc: "/legal/terms", priority: "0.3", changefreq: "yearly" },
        { loc: "/legal/cookies", priority: "0.3", changefreq: "yearly" },
      ];

      const url = (loc: string, lastmod: string, changefreq: string, priority: string) =>
        `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

      const staticUrls = staticPages.map(p => url(`${base}${p.loc}`, now, p.changefreq, p.priority));

      const propertyUrls = properties
        .filter((p: any) => p.slug)
        .map((p: any) => url(`${base}/homes/${p.slug}`, now, "weekly", "0.9"));

      const blogUrls = blogPosts
        .filter((p: any) => p.slug)
        .map((p: any) => {
          const mod = p.updatedAt || p.publishedAt || p.createdAt;
          const lastmod = mod ? new Date(mod).toISOString().split("T")[0] : now;
          return url(`${base}/blog/${p.slug}`, lastmod, "monthly", "0.8");
        });

      const serviceUrls = serviceItems
        .filter((s: any) => s.slug)
        .map((s: any) => url(`${base}/services/${s.slug}`, now, "monthly", "0.8"));

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join("\n")}
${propertyUrls.join("\n")}
${blogUrls.join("\n")}
${serviceUrls.join("\n")}
</urlset>`;

      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (err) {
      console.error("[Sitemap] Error generating sitemap:", err);
      res.status(500).send("Error generating sitemap");
    }
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
        if (!prerender.crawlerUserAgents.includes(ua)) {
          prerender.crawlerUserAgents.push(ua);
        }
      }
      app.use(prerender);
      console.info(`[prerender] Active — ${prerender.crawlerUserAgents.length} crawler UAs (incl. AI bots)`);
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

  server.listen(port, () => {
    console.info(`Server running on http://localhost:${port}/`);

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
    }
  });
}

startServer().catch(console.error);
