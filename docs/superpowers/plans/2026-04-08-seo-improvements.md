# SEO Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all actionable SEO fixes identified in the April 2026 audit: fix structured data violations, add server-side bot meta injection, improve i18n SEO signals, and expand sitemap coverage.

**Architecture:** Fixes are grouped by file proximity. Structured data and meta tag changes live in the client (React). Sitemap and bot-injection changes live in the Express server (`server/_core/`). No new dependencies needed — all changes use existing tools.

**Tech Stack:** React 19, Vite SPA, Express, TypeScript, i18next, Drizzle ORM / MySQL

---

## File Map

| File | What changes |
|------|-------------|
| `client/index.html` | Remove `maximum-scale=1`, remove `<meta name="keywords">`, add `hreflang x-default` |
| `client/src/hooks/usePageMeta.ts` | Remove cleanup block; add dynamic `og:locale` |
| `client/src/i18n/index.ts` | Add `languageChanged` listener to update `<html lang>` |
| `client/src/pages/PropertyDetail.tsx` | Remove hardcoded `aggregateRating` + `starRating` from LodgingBusiness schema; add BreadcrumbList JSON-LD |
| `client/src/pages/DestinationDetail.tsx` | Add BreadcrumbList JSON-LD |
| `server/_core/index.ts` | Add service detail pages to sitemap |
| `server/_core/vite.ts` | Add `/services/` to `KNOWN_PREFIXES`; add bot User-Agent meta injection in catch-all |

---

## Task 1: index.html — viewport, keywords, hreflang

**Files:**
- Modify: `client/index.html`

- [ ] **Step 1: Remove `maximum-scale=1` from the viewport tag**

In `client/index.html` line 3, change:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
```
to:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

- [ ] **Step 2: Remove the `meta name="keywords"` tag**

Delete this line from `client/index.html`:
```html
<meta name="keywords" content="private homes Portugal, hotel standard villas, luxury villa rental Portugal, private chef Portugal, concierge service, Minho Coast, Porto Douro, Algarve" />
```

- [ ] **Step 3: Add `hreflang x-default` after the canonical tag**

After `<link rel="canonical" href="https://www.portugalactive.com/" />`, add:
```html
<link rel="alternate" hreflang="x-default" href="https://www.portugalactive.com/" />
<link rel="alternate" hreflang="en" href="https://www.portugalactive.com/" />
```
> Note: Full per-language hreflang requires URL-prefixed routes (`/pt/`, `/es/`, etc.) — that's a future architectural change. This x-default tag is the correct minimum for a single-URL multilingual SPA.

- [ ] **Step 4: Commit**

```bash
git add client/index.html
git commit -m "seo: fix viewport zoom, remove keywords meta, add hreflang x-default"
```

---

## Task 2: usePageMeta — remove cleanup, add dynamic og:locale

**Files:**
- Modify: `client/src/hooks/usePageMeta.ts`

**Why remove cleanup:** The cleanup function resets all meta to homepage defaults on unmount. Since every page sets its own meta on mount, the reset is redundant and causes a flash of homepage data if unmount fires before the new page's useEffect.

**Why dynamic og:locale:** The static `og:locale: en_GB` in index.html never changes when users view the site in other languages. Updating it via usePageMeta gives social crawlers accurate locale data.

- [ ] **Step 1: Add i18n import and locale map**

Replace the entire content of `client/src/hooks/usePageMeta.ts` with:

```typescript
import { useEffect } from 'react';
import i18n from '@/i18n';

const BASE_TITLE = 'Luxury Private Villas in Portugal | Hotel Service | Portugal Active';
const BASE_DESC = '50+ private villas across Portugal, each managed like a luxury hotel. Private chef, concierge, pool. Book direct for best rates.';
const BASE_URL = 'https://www.portugalactive.com';
const BASE_IMAGE = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/hero-main-96HXfBCK752avi2daWhgmd.webp';

const LOCALE_MAP: Record<string, string> = {
  en: 'en_GB',
  pt: 'pt_PT',
  es: 'es_ES',
  fr: 'fr_FR',
  de: 'de_DE',
  it: 'it_IT',
  nl: 'nl_NL',
  fi: 'fi_FI',
  sv: 'sv_SE',
};

function setMeta(selector: string, attr: string, value: string) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

interface PageMetaOpts {
  title?: string;
  description?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'place';
}

export function usePageMeta(opts?: PageMetaOpts) {
  useEffect(() => {
    const title = opts?.title ? `${opts.title} | Portugal Active` : BASE_TITLE;
    const description = opts?.description || BASE_DESC;
    const image = opts?.image || BASE_IMAGE;
    const url = opts?.url ? `${BASE_URL}${opts.url}` : BASE_URL;
    const type = opts?.type || 'website';
    const locale = LOCALE_MAP[i18n.language] ?? 'en_GB';

    document.title = title;
    setMeta('meta[name="description"]', 'content', description);
    setMeta('link[rel="canonical"]', 'href', url);

    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', description);
    setMeta('meta[property="og:image"]', 'content', image);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[property="og:type"]', 'content', type);
    setMeta('meta[property="og:locale"]', 'content', locale);

    setMeta('meta[name="twitter:title"]', 'content', title);
    setMeta('meta[name="twitter:description"]', 'content', description);
    setMeta('meta[name="twitter:image"]', 'content', image);
  }, [opts?.title, opts?.description, opts?.image, opts?.url, opts?.type]);
}
```

> The cleanup `return () => {}` block is intentionally removed. Pages always set their own meta on mount.

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd "$(git rev-parse --show-toplevel)"
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to `usePageMeta.ts`.

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/usePageMeta.ts
git commit -m "seo: remove meta cleanup on unmount, add dynamic og:locale per language"
```

---

## Task 3: Dynamic `<html lang>` attribute

**Files:**
- Modify: `client/src/i18n/index.ts`

**Why:** `<html lang="en">` is hardcoded in `index.html` and never changes when users switch languages. Screen readers and Google use this for language detection.

- [ ] **Step 1: Read the current i18n/index.ts**

Read `client/src/i18n/index.ts` in full to see the current init setup before editing.

- [ ] **Step 2: Add `languageChanged` listener after `i18n.init`**

At the bottom of `client/src/i18n/index.ts`, after the `i18n` chain, add:

```typescript
// Keep <html lang> in sync with the active language
i18n.on('languageChanged', (lng: string) => {
  document.documentElement.lang = lng;
});
// Set on initial load
document.documentElement.lang = i18n.language || 'en';
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/i18n/index.ts
git commit -m "seo: dynamically update <html lang> attribute when language changes"
```

---

## Task 4: PropertyDetail — remove fake structured data ratings

**Files:**
- Modify: `client/src/pages/PropertyDetail.tsx` (around line 376–415)

**Context:** The `LodgingBusiness` JSON-LD currently has two hardcoded fields on every property:
- `"aggregateRating": { "ratingValue": "4.9", "reviewCount": "2000" }` — identical for every villa, violates Google's guidelines
- `"starRating": { "ratingValue": "5" }` — villas are not formally star-rated

Real per-property aggregate rating is already correctly implemented in `ReviewsSection.tsx` using actual `averageRating` and `reviewCount` props. The hardcoded version in PropertyDetail is a duplicate that overrides it with fake data.

- [ ] **Step 1: Remove `aggregateRating` and `starRating` from the jsonLd object**

In `client/src/pages/PropertyDetail.tsx`, find the `jsonLd` object (around line 376). Change:

```typescript
    const jsonLd: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      "name": property.name,
      "description": property.tagline || property.description?.slice(0, 300),
      "url": `https://www.portugalactive.com/homes/${property.slug}`,
      "image": property.images?.slice(0, 5),
      "numberOfRooms": property.bedrooms,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": property.locality || dest?.name,
        "addressRegion": dest?.name || '',
        "addressCountry": "PT",
      },
      "starRating": { "@type": "Rating", "ratingValue": "5" },
      "aggregateRating": { "@type": "AggregateRating", "ratingValue": "4.9", "reviewCount": "2000" },
      ...(amenityFeatures.length > 0 && { "amenityFeature": amenityFeatures }),
```

to:

```typescript
    const jsonLd: Record<string, any> = {
      "@context": "https://schema.org",
      "@type": "LodgingBusiness",
      "name": property.name,
      "description": property.tagline || property.description?.slice(0, 300),
      "url": `https://www.portugalactive.com/homes/${property.slug}`,
      "image": property.images?.slice(0, 5),
      "numberOfRooms": property.bedrooms,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": property.locality || dest?.name,
        "addressRegion": dest?.name || '',
        "addressCountry": "PT",
      },
      ...(amenityFeatures.length > 0 && { "amenityFeature": amenityFeatures }),
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/PropertyDetail.tsx
git commit -m "seo: remove hardcoded fake aggregateRating and starRating from property schema"
```

---

## Task 5: BreadcrumbList JSON-LD — PropertyDetail and DestinationDetail

**Files:**
- Modify: `client/src/pages/PropertyDetail.tsx`
- Modify: `client/src/pages/DestinationDetail.tsx`

BreadcrumbList schema causes Google to show breadcrumbs in SERPs, increasing CTR. The UI breadcrumb component already exists but has no corresponding JSON-LD.

### 5a — PropertyDetail BreadcrumbList

- [ ] **Step 1: Add BreadcrumbList inside the existing `useEffect` in PropertyDetail.tsx**

The existing `useEffect` (starting around line 370) creates and appends a `property-jsonld` script. Add a second script for breadcrumbs. After the line `document.head.appendChild(script);` and before the `return () => {` cleanup, insert:

```typescript
    // BreadcrumbList
    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.portugalactive.com" },
        { "@type": "ListItem", "position": 2, "name": "Homes", "item": "https://www.portugalactive.com/homes" },
        { "@type": "ListItem", "position": 3, "name": property.name },
      ],
    };
    const breadcrumbScript = document.createElement("script");
    breadcrumbScript.type = "application/ld+json";
    breadcrumbScript.text = JSON.stringify(breadcrumbLd);
    breadcrumbScript.id = "property-breadcrumb-jsonld";
    document.querySelector("#property-breadcrumb-jsonld")?.remove();
    document.head.appendChild(breadcrumbScript);
```

Update the existing cleanup `return () => {` to also remove the breadcrumb script:

```typescript
    return () => {
      document.querySelector("#property-jsonld")?.remove();
      document.querySelector("#property-breadcrumb-jsonld")?.remove();
    };
```

### 5b — DestinationDetail BreadcrumbList

- [ ] **Step 2: Add BreadcrumbList inside the existing `useEffect` in DestinationDetail.tsx**

The existing `useEffect` (starting around line 37) creates a `destination-jsonld` script. Add a second script for breadcrumbs. After `document.head.appendChild(script);` and before `return () => {`, insert:

```typescript
    // BreadcrumbList
    const breadcrumbLd = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.portugalactive.com" },
        { "@type": "ListItem", "position": 2, "name": "Destinations", "item": "https://www.portugalactive.com/destinations" },
        { "@type": "ListItem", "position": 3, "name": dest.name },
      ],
    };
    const breadcrumbScript = document.createElement("script");
    breadcrumbScript.type = "application/ld+json";
    breadcrumbScript.text = JSON.stringify(breadcrumbLd);
    breadcrumbScript.id = "destination-breadcrumb-jsonld";
    document.querySelector("#destination-breadcrumb-jsonld")?.remove();
    document.head.appendChild(breadcrumbScript);
```

Update the existing cleanup to also remove the breadcrumb script:

```typescript
    return () => {
      document.querySelector("#destination-jsonld")?.remove();
      document.querySelector("#destination-breadcrumb-jsonld")?.remove();
    };
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/PropertyDetail.tsx client/src/pages/DestinationDetail.tsx
git commit -m "seo: add BreadcrumbList JSON-LD to property and destination detail pages"
```

---

## Task 6: Sitemap — add service pages + fix KNOWN_PREFIXES

**Files:**
- Modify: `server/_core/index.ts` (sitemap handler, around lines 92–157)
- Modify: `server/_core/vite.ts` (KNOWN_PREFIXES, line 75)

Two problems: (1) `/services/:slug` pages are not in the sitemap; (2) `KNOWN_PREFIXES` in vite.ts doesn't include `/services/`, meaning service detail pages respond with HTTP 404 status (even though the SPA renders them).

- [ ] **Step 1: Add `/services/` to KNOWN_PREFIXES in vite.ts**

In `server/_core/vite.ts`, change:

```typescript
  const KNOWN_PREFIXES = ["/homes/", "/destinations/", "/blog/", "/admin/", "/booking/"];
```

to:

```typescript
  const KNOWN_PREFIXES = ["/homes/", "/destinations/", "/blog/", "/services/", "/admin/", "/booking/"];
```

- [ ] **Step 2: Add service URLs to the sitemap in index.ts**

In `server/_core/index.ts`, find the sitemap handler. The top of the handler imports:

```typescript
      const { getPropertiesForSite } = await import("../services/properties-store");
      const { listBlogPosts } = await import("../db");
```

Change it to also import `listServices`:

```typescript
      const { getPropertiesForSite } = await import("../services/properties-store");
      const { listBlogPosts, listServices } = await import("../db");
      const properties = await getPropertiesForSite();
      const blogPosts = await listBlogPosts({ status: "published" });
      const serviceItems = await listServices({ activeOnly: true });
```

Then after the `blogUrls` array (around line 141), add:

```typescript
      const serviceUrls = serviceItems
        .filter((s: any) => s.slug)
        .map((s: any) => url(`${base}/services/${s.slug}`, now, "monthly", "0.8"));
```

And include `serviceUrls` in the XML output. Change:

```typescript
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join("\n")}
${propertyUrls.join("\n")}
${blogUrls.join("\n")}
</urlset>`;
```

to:

```typescript
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticUrls.join("\n")}
${propertyUrls.join("\n")}
${blogUrls.join("\n")}
${serviceUrls.join("\n")}
</urlset>`;
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
git add server/_core/index.ts server/_core/vite.ts
git commit -m "seo: add service detail pages to sitemap and fix 404 status on /services/:slug routes"
```

---

## Task 7: Server-side bot meta injection

**Files:**
- Modify: `server/_core/vite.ts`

**Why:** This is a client-side SPA — all `<title>`, `<meta>`, OG, and JSON-LD tags are set via JavaScript. Googlebot renders JavaScript and eventually sees the correct tags, but social crawlers (Facebook, LinkedIn, Twitter/X, WhatsApp, Telegram, Slack) do not execute JavaScript. They see the generic homepage meta for every URL. This fix reads index.html, injects the correct meta for each route, and sends the modified HTML only to bot requests.

**Approach:** Bot detection by User-Agent in the existing catch-all handler. DB queries are async — only for dynamic routes (`/homes/:slug`, `/blog/:slug`). Static routes get predefined meta without DB calls. Destinations use the local JSON file (no DB needed).

- [ ] **Step 1: Read the full current content of `server/_core/vite.ts`**

Read the file before editing.

- [ ] **Step 2: Add bot detection and meta injection helper**

Add the following at the top of `server/_core/vite.ts`, after the existing imports:

```typescript
import fs from "fs";
import path from "path";
```

> If `fs` and `path` are already imported at the top, skip adding them.

Then, before `export function serveStatic(app: Express)`, add:

```typescript
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

const BASE_URL = 'https://www.portugalactive.com';

const STATIC_META: Record<string, { title: string; description: string; url: string }> = {
  '/':            { title: 'Luxury Private Villas in Portugal | Hotel Service | Portugal Active', description: '50+ private villas across Portugal, each managed like a luxury hotel. Private chef, concierge, pool. Book direct for best rates.', url: `${BASE_URL}/` },
  '/homes':       { title: 'Private Villas Portugal | Luxury Holiday Homes | Portugal Active', description: 'Browse 50+ handpicked private villas across Portugal. Pool, concierge, housekeeping included. Filter by region and book direct.', url: `${BASE_URL}/homes` },
  '/destinations':{ title: 'Destinations in Portugal | Minho, Porto, Algarve & More | Portugal Active', description: 'Explore our luxury villa destinations across Portugal — Minho Coast, Porto & Douro, Algarve, Lisbon, Alentejo. Find your perfect region.', url: `${BASE_URL}/destinations` },
  '/services':    { title: 'Luxury Concierge Services | Private Chef, Spa, Transfers | Portugal Active', description: 'Elevate your villa stay with private chef, in-house spa, airport transfers, and bespoke experiences. Book alongside your villa.', url: `${BASE_URL}/services` },
  '/adventures':  { title: 'Outdoor Adventures Portugal | Surf, Hike, Wine Tours | Portugal Active', description: 'Guided adventures across Portugal — surf lessons, hiking trails, wine tastings, coasteering. Book with your villa stay.', url: `${BASE_URL}/adventures` },
  '/events':      { title: 'Private Events Portugal | Weddings, Retreats, Celebrations | Portugal Active', description: 'Host weddings, corporate retreats, and private celebrations in luxury Portuguese villas. Full event planning and concierge.', url: `${BASE_URL}/events` },
  '/blog':        { title: 'Portugal Travel Journal | Guides, Tips & Inspiration | Portugal Active', description: 'Insider guides to Portugal — best beaches, hidden restaurants, wine regions, and travel tips from our local concierge team.', url: `${BASE_URL}/blog` },
  '/about':       { title: 'About Portugal Active | Luxury Villa Management in Portugal', description: 'We manage 50+ private homes across Portugal end-to-end — bookings, concierge, housekeeping. A different kind of villa company.', url: `${BASE_URL}/about` },
  '/contact':     { title: 'Contact Portugal Active | Plan Your Stay in Portugal', description: 'Speak to our concierge team. We respond within 2 hours. Phone, WhatsApp, or email — plan your perfect Portuguese villa holiday.', url: `${BASE_URL}/contact` },
  '/owners':      { title: 'Property Management Portugal | Portugal Active for Owners', description: 'Maximise your rental income. Full-service villa management — marketing, bookings, housekeeping, maintenance, guest concierge.', url: `${BASE_URL}/owners` },
  '/faq':         { title: 'FAQ | Portugal Active', description: 'Answers to common questions about booking, cancellation, check-in, concierge services, and villa management with Portugal Active.', url: `${BASE_URL}/faq` },
};

const DESTINATION_META: Record<string, { name: string; description: string; image: string }> = {
  'minho':    { name: 'Minho Coast', description: 'Luxury villas on the Minho Coast, Portugal. Wild beaches, green valleys, and historic quintas — the undiscovered north.', image: '' },
  'porto':    { name: 'Porto & Douro', description: 'Luxury villas in Porto and the Douro Valley, Portugal. Wine estates, city breaks, and river views.', image: '' },
  'lisbon':   { name: 'Lisbon', description: 'Luxury villas near Lisbon, Portugal. Sintra, Cascais, and the Atlantic coast — cultural capital meets beach escape.', image: '' },
  'alentejo': { name: 'Alentejo', description: 'Luxury villas in Alentejo, Portugal. Endless plains, cork forests, and slow-travel at its finest.', image: '' },
  'algarve':  { name: 'Algarve', description: 'Luxury villas in the Algarve, Portugal. Clifftop retreats, golden beaches, and year-round sunshine.', image: '' },
};
```

- [ ] **Step 3: Replace the catch-all handler in `serveStatic` with bot-aware version**

In `server/_core/vite.ts`, replace the existing catch-all handler:

```typescript
  app.use("*", (req, res) => {
    const p = req.originalUrl.split("?")[0];
    const isKnown = KNOWN_ROUTES.has(p) || KNOWN_PREFIXES.some(pre => p.startsWith(pre));
    const status = isKnown ? 200 : 404;
    res.status(status).sendFile(path.resolve(distPath, "index.html"));
  });
```

with:

```typescript
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
            url: `${BASE_URL}/homes/${prop.slug}`,
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
            image: post.heroImage ?? undefined,
            url: `${BASE_URL}/blog/${post.slug}`,
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
            url: `${BASE_URL}/destinations/${destMatch[1]}`,
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
```

- [ ] **Step 4: Check TypeScript for property field names**

The bot injection uses `prop.seoTitle`, `prop.seoDescription`, `prop.images`, `prop.tagline`, `prop.bedrooms`, `prop.slug`. And for blog: `post.seoTitle`, `post.seoDescription`, `post.excerpt`, `post.heroImage`, `post.title`, `post.slug`.

Verify these field names exist in the schema:

```bash
grep -n "seoTitle\|seoDescription\|heroImage\|excerpt\|tagline\|images" \
  "$(git rev-parse --show-toplevel)/server/db.ts" | head -20
```

If any field name differs from what the schema actually uses, correct the bot injection code in Step 3 to match.

- [ ] **Step 5: Verify no TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors. If there are property field mismatches, fix them using the output of Step 4.

- [ ] **Step 6: Commit**

```bash
git add server/_core/vite.ts
git commit -m "seo: inject page-specific meta tags in server responses for bot crawlers"
```

---

## Final Verification

- [ ] **Smoke test the sitemap**

```bash
curl http://localhost:5000/sitemap.xml | grep "/services/" | head -5
```
Expected: service slug URLs appear in the output.

- [ ] **Smoke test bot meta injection**

```bash
curl -A "facebookexternalhit/1.1" http://localhost:5000/homes/test-slug 2>/dev/null | grep -A1 "og:title"
```
Expected: an `og:title` meta tag with a villa-specific title (not the generic homepage title). If the slug doesn't exist in the DB it will show the generic title — that's fine.

- [ ] **Validate structured data**

Open https://search.google.com/test/rich-results on a live property URL and confirm:
- No `aggregateRating` warning about fake data
- BreadcrumbList is detected
- LodgingBusiness passes validation
