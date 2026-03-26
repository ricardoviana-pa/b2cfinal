import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerDevAuthRoutes } from "./devAuth";
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
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
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
    // Delay 5s to let the server stabilize and avoid hammering Guesty on rapid redeploys.
    if (isGuestyConfigured()) {
      setTimeout(() => {
        runSync()
          .then((p) => console.info(`[Startup] Guesty sync complete → ${p}`))
          .catch((e) => console.warn("[Startup] Guesty sync failed (will retry next restart):", e.message));
      }, 5000);

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
