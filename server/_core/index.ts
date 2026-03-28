import "dotenv/config";
import express from "express";
import helmet from "helmet";
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

  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

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

  // Dynamic sitemap.xml
  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const { getPropertiesForSite } = await import("../services/properties-store");
      const properties = await getPropertiesForSite();
      const base = "https://www.portugalactive.com";
      const now = new Date().toISOString().split("T")[0];

      const staticPages = [
        { loc: "/", priority: "1.0", changefreq: "weekly" },
        { loc: "/homes", priority: "0.9", changefreq: "daily" },
        { loc: "/about", priority: "0.6", changefreq: "monthly" },
        { loc: "/contact", priority: "0.6", changefreq: "monthly" },
        { loc: "/services", priority: "0.7", changefreq: "monthly" },
        { loc: "/adventures", priority: "0.7", changefreq: "monthly" },
        { loc: "/events", priority: "0.7", changefreq: "monthly" },
        { loc: "/blog", priority: "0.6", changefreq: "weekly" },
        { loc: "/faq", priority: "0.4", changefreq: "monthly" },
        { loc: "/owners", priority: "0.5", changefreq: "monthly" },
        { loc: "/destinations/minho", priority: "0.7", changefreq: "monthly" },
        { loc: "/destinations/porto", priority: "0.7", changefreq: "monthly" },
        { loc: "/destinations/algarve", priority: "0.7", changefreq: "monthly" },
        { loc: "/legal/privacy", priority: "0.2", changefreq: "yearly" },
        { loc: "/legal/terms", priority: "0.2", changefreq: "yearly" },
        { loc: "/legal/cookies", priority: "0.2", changefreq: "yearly" },
      ];

      const propertyUrls = properties
        .filter((p: any) => p.slug)
        .map((p: any) => `  <url><loc>${base}/homes/${p.slug}</loc><lastmod>${now}</lastmod><changefreq>weekly</changefreq><priority>0.8</priority></url>`);

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(p => `  <url><loc>${base}${p.loc}</loc><lastmod>${now}</lastmod><changefreq>${p.changefreq}</changefreq><priority>${p.priority}</priority></url>`).join("\n")}
${propertyUrls.join("\n")}
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
    // Delay 5 minutes to avoid hammering Guesty auth on rapid redeploys and
    // preserve rate-limit budget for user-facing quote requests.
    if (isGuestyConfigured()) {
      setTimeout(() => {
        runSync()
          .then((p) => console.info(`[Startup] Guesty sync complete → ${p}`))
          .catch((e) => console.warn("[Startup] Guesty sync failed (will retry next restart):", e.message));
      }, 5 * 60 * 1000);

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
