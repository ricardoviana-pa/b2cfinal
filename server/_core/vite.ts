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
      // Respect 404 status set by upstream middleware (e.g. invalid property slug)
      const status = res.statusCode === 404 ? 404 : 200;
      res.status(status).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

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
    "/", "/homes", "/about", "/contact", "/experiences", "/concierge",
    "/events", "/blog", "/faq", "/careers", "/owners", "/login", "/account",
    "/legal/privacy", "/legal/terms", "/legal/cookies", "/admin", "/404",
  ]);
  const KNOWN_PREFIXES = ["/homes/", "/destinations/", "/experiences/", "/blog/", "/admin/", "/booking/"];

  app.use("*", (req, res) => {
    const p = req.originalUrl.split("?")[0];
    // Respect 404 status set by upstream middleware (e.g. invalid property slug)
    const isKnown = KNOWN_ROUTES.has(p) || KNOWN_PREFIXES.some(pre => p.startsWith(pre));
    const status = res.statusCode === 404 ? 404 : (isKnown ? 200 : 404);
    res.status(status).sendFile(path.resolve(distPath, "index.html"));
  });
}
