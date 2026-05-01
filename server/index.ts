import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { handleSitemap } from "./lib/sitemap.js";
import { legacyRedirects } from "./lib/redirects.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  // 301 redirects for legacy URLs (Webflow / WP / Joomla migration).
  // Mount BEFORE static + SPA catch-all so old URLs are redirected
  // before falling through to the React app.
  app.use(legacyRedirects);

  app.use(express.static(staticPath));

  // Sitemap
  app.get("/sitemap.xml", handleSitemap);

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.info(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
