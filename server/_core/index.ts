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
import { isGuestyConfigured } from "../lib/guesty";
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
  app.get('/locations/minho', (_req, res) => res.redirect(301, '/destinations/minho-coast'));
  app.get('/locations/porto', (_req, res) => res.redirect(301, '/destinations/porto-douro'));
  app.get('/locations/algarve', (_req, res) => res.redirect(301, '/destinations/algarve'));
  app.get('/locations/:slug', (_req, res) => res.redirect(301, '/destinations'));

  // Dynamic sitemap.xml
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const { getPropertiesForSite } = await import("../services/properties-store");
      const { listBlogPosts } = await import("../db");
      const properties = await getPropertiesForSite();
      const blogPosts = await listBlogPosts({ status: "published" });
      const base = process.env.SITE_URL || "https://www.portugalactive.com";
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

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join("\n")}
${propertyUrls.join("\n")}
${blogUrls.join("\n")}
</urlset>`;

      res.setHeader("Content-Type", "application/xml");
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.send(xml);
    } catch (err) {
      console.error("[Sitemap] Error generating sitemap:", err);
      res.status(500).send("Error generating sitemap");
    }
  });

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

  server.listen(port, () => {
    console.info(`Server running on http://localhost:${port}/`);

    // Guesty sync: pull listings (photos, texts, pricing) on startup.
    // Delay 30s to let server finish booting before first Guesty call.
    if (isGuestyConfigured()) {
      setTimeout(() => {
        runSync()
          .then((p) => console.info(`[Startup] Guesty sync complete → ${p}`))
          .catch((e) => console.warn("[Startup] Guesty sync failed (will retry next restart):", e.message));
      }, 30 * 1000);

      // Cron: sync listings twice a day — 07:00 and 19:00 Lisbon time (Europe/Lisbon)
      cron.schedule("0 7,19 * * *", () => {
        console.info("[Cron] Running scheduled Guesty sync...");
        runSync()
          .then((p) => console.info(`[Cron] Guesty sync complete → ${p}`))
          .catch((e) => console.warn("[Cron] Guesty sync failed:", e.message));
      }, { timezone: "Europe/Lisbon" });
      console.info("[Cron] Guesty sync scheduled — 07:00 and 19:00 Europe/Lisbon");
    }
  });
}

startServer().catch(console.error);
