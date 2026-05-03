import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "https://www.portugalactive.com";

interface SitemapEntry {
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: number;
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function loadJson(relativePath: string): any {
  const fullPath = path.resolve(__dirname, "..", "..", "client", "src", "data", relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

function buildEntries(): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const date = today();

  // Static pages
  const staticPages: Array<{ path: string; priority: number; changefreq: string }> = [
    { path: "/", priority: 1.0, changefreq: "weekly" },
    { path: "/homes", priority: 0.9, changefreq: "daily" },
    { path: "/experiences", priority: 0.9, changefreq: "daily" },
    { path: "/destinations", priority: 0.8, changefreq: "weekly" },
    { path: "/about", priority: 0.6, changefreq: "monthly" },
    { path: "/contact", priority: 0.6, changefreq: "monthly" },
    { path: "/events", priority: 0.7, changefreq: "monthly" },
    { path: "/blog", priority: 0.7, changefreq: "weekly" },
  ];

  for (const page of staticPages) {
    entries.push({
      loc: `${BASE_URL}${page.path}`,
      lastmod: date,
      changefreq: page.changefreq,
      priority: page.priority,
    });
  }

  // Dynamic destination pages
  try {
    const destinations = loadJson("destinations.json");
    for (const dest of destinations) {
      entries.push({
        loc: `${BASE_URL}/destinations/${dest.slug}`,
        lastmod: date,
        changefreq: "weekly",
        priority: 0.8,
      });
    }
  } catch (e) {
    console.warn("Sitemap: could not load destinations.json", e);
  }

  // Dynamic experience pages
  try {
    const experienceData = loadJson("experienceDetails.json");
    for (const exp of experienceData.experiences) {
      entries.push({
        loc: `${BASE_URL}/experiences/${exp.slug}`,
        lastmod: date,
        changefreq: "weekly",
        priority: 0.8,
      });
    }
  } catch (e) {
    console.warn("Sitemap: could not load experienceDetails.json", e);
  }

  // Dynamic property pages
  try {
    const properties = loadJson("properties.json");
    for (const property of properties) {
      entries.push({
        loc: `${BASE_URL}/homes/${property.slug}`,
        lastmod: date,
        changefreq: "weekly",
        priority: 0.8,
      });
    }
  } catch (e) {
    console.warn("Sitemap: could not load properties.json", e);
  }

  // Dynamic blog pages
  try {
    const blogData = loadJson("blog.json");
    for (const article of blogData.articles) {
      entries.push({
        loc: `${BASE_URL}/blog/${article.slug}`,
        lastmod: article.publishedAt?.split("T")[0] ?? date,
        changefreq: "monthly",
        priority: 0.6,
      });
    }
  } catch (e) {
    console.warn("Sitemap: could not load blog.json", e);
  }

  return entries;
}

const SUPPORTED_LANGS = ["en", "pt", "es", "fr", "de", "it", "nl", "fi", "sv"];

function buildHreflangLinks(loc: string): string {
  const links = SUPPORTED_LANGS.map(
    (lang) =>
      `    <xhtml:link rel="alternate" hreflang="${lang}" href="${loc}?lang=${lang}" />`
  );
  links.push(
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${loc}" />`
  );
  return links.join("\n");
}

function toXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map(
      (e) => `  <url>
    <loc>${e.loc}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority.toFixed(1)}</priority>
${buildHreflangLinks(e.loc)}
  </url>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>`;
}

export function handleSitemap(_req: Request, res: Response): void {
  const entries = buildEntries();
  const xml = toXml(entries);
  res.set("Content-Type", "application/xml");
  res.set("Cache-Control", "public, max-age=3600");
  res.send(xml);
}
