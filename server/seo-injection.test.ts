/* ==========================================================================
   SEO INJECTION — contract tests
   ========================================================================

   Locks in the behaviour of the server-side crawlable body / meta /
   schema-graph injection paths in `_core/vite.ts`. Production currently
   runs these via the `#seo-content` fallback (SSR_ENABLED is unset), so
   crawlers' first paint of any static, property, experience, blog or
   destination route depends on these builders producing real semantic
   HTML — h1, breadcrumb, body — rather than the empty SPA shell.

   These tests deliberately exercise the pure builders + transforms, not
   the Express handler, so they run without DB or env-var setup. They
   protect against silent regressions: if someone trims an h1 out of a
   builder, or adds a destination slug to the data without wiring the
   SSR meta map, this test fails before the deploy lands.
   ========================================================================== */

import { describe, it, expect } from "vitest";
import { __testing } from "./_core/vite";
import destinationsData from "../client/src/data/destinations.json";

const {
  buildStaticSeoBody,
  buildPropertySeoBody,
  buildExperienceSeoBody,
  buildBlogSeoBody,
  injectSeoBody,
  injectMeta,
  injectSchemaGraph,
  DESTINATION_DESCRIPTION,
  DESTINATION_TITLE,
  destLabel,
} = __testing;

/* ── Crawlable body builders ──────────────────────────────────────────── */

describe("buildStaticSeoBody", () => {
  it("emits an h1 derived from the title's first segment", () => {
    const html = buildStaticSeoBody("en", "About Us | Portugal Active", "About copy.");
    expect(html).toMatch(/<h1>About Us<\/h1>/);
    expect(html).toContain("<p>About copy.</p>");
  });

  it("emits the full site nav so crawlers see internal links from any static page", () => {
    const html = buildStaticSeoBody("en", "Contact", "");
    for (const path of ["/homes", "/experiences", "/destinations", "/blog", "/about", "/contact"]) {
      expect(html).toContain(`href="/en${path}"`);
    }
  });

  it("falls back to 'Portugal Active' when the title has no leading segment", () => {
    const html = buildStaticSeoBody("en", "", "");
    expect(html).toMatch(/<h1>Portugal Active<\/h1>/);
  });

  it("uses localized nav labels for the visitor's language", () => {
    const en = buildStaticSeoBody("en", "Home", "");
    const pt = buildStaticSeoBody("pt", "Início", "");
    expect(en).toContain(">Homes</a>");
    expect(pt).toContain(">Casas</a>");
  });
});

describe("buildPropertySeoBody", () => {
  const prop = {
    name: "Casa do Douro",
    locality: "Pinhão",
    tagline: "A 19th-century estate on the river.",
    description: "First paragraph.\n\nSecond paragraph.",
    images: ["https://cdn.example/hero.webp"],
    amenities: { kitchen: ["espresso", "induction"] },
  };

  it("emits breadcrumb + h1 + image + tagline + paragraphs + amenities", () => {
    const html = buildPropertySeoBody(prop, "en");
    expect(html).toMatch(/<h1>Casa do Douro<\/h1>/);
    expect(html).toContain(">Homes</a>");
    expect(html).toContain('href="/en/homes"');
    expect(html).toContain("Pinhão, Portugal");
    expect(html).toContain("alt=\"Casa do Douro\"");
    expect(html).toContain("A 19th-century estate on the river.");
    expect(html).toMatch(/<p>First paragraph\.<\/p>/);
    expect(html).toMatch(/<p>Second paragraph\.<\/p>/);
    expect(html).toMatch(/<h2>Amenities<\/h2>/);
    expect(html).toContain("<li>espresso</li>");
  });

  it("survives missing optional fields (no images, no amenities, no description)", () => {
    const html = buildPropertySeoBody({ name: "Bare Property" }, "en");
    expect(html).toMatch(/<h1>Bare Property<\/h1>/);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<h2>Amenities");
  });
});

describe("buildExperienceSeoBody", () => {
  it("emits breadcrumb + h1 + paragraph copy", () => {
    const html = buildExperienceSeoBody(
      {
        name: "Vinho Verde Tasting",
        tagline: "Single-vineyard Alvarinho in the Minho.",
        aboutParagraphs: ["A private tasting.", "Lunch on the terrace."],
      },
      "en",
    );
    expect(html).toMatch(/<h1>Vinho Verde Tasting<\/h1>/);
    expect(html).toContain(">Experiences</a>");
    expect(html).toMatch(/<p>A private tasting\.<\/p>/);
    expect(html).toMatch(/<p>Lunch on the terrace\.<\/p>/);
  });
});

describe("buildBlogSeoBody", () => {
  it("emits breadcrumb + h1 + excerpt + body stripped of HTML", () => {
    const html = buildBlogSeoBody(
      {
        title: "Welcome to Viana",
        excerpt: "Why we love the Minho.",
        coverImage: "https://cdn.example/v.webp",
        content: "<p>Atlantic city <strong>built on cod</strong>.</p>",
      },
      "en",
    );
    expect(html).toMatch(/<h1>Welcome to Viana<\/h1>/);
    expect(html).toContain(">Journal</a>");
    expect(html).toContain("<p>Why we love the Minho.</p>");
    // Tags stripped, plain text preserved as a single <p>:
    expect(html).toContain("Atlantic city built on cod");
    expect(html).not.toMatch(/<strong>/);
  });
});

/* ── HTML transforms (injectMeta / injectSchemaGraph / injectSeoBody) ─── */

describe("injectSeoBody", () => {
  const shell = `<!DOCTYPE html><html><head></head><body><div id="root"></div></body></html>`;

  it("inserts the crawlable block immediately after the empty root div", () => {
    const out = injectSeoBody(shell, "<h1>hello</h1>");
    expect(out).toMatch(/<div id="root"><\/div>[\s\S]*<div id="seo-content"><h1>hello<\/h1><\/div>/);
  });

  it("includes the removal script so JS users never see the block", () => {
    const out = injectSeoBody(shell, "<h1>hello</h1>");
    expect(out).toContain("seo-content");
    expect(out).toMatch(/getElementById\(['"]seo-content['"]\)/);
  });

  it("is a no-op when bodyHtml is empty", () => {
    expect(injectSeoBody(shell, "")).toBe(shell);
  });
});

describe("injectMeta", () => {
  const shell = `<!DOCTYPE html><html><head><title>old</title><meta name="description" content="old"><link rel="canonical" href="https://old"></head><body></body></html>`;

  it("replaces title, description and canonical", () => {
    const out = injectMeta(shell, {
      title: "New Title",
      description: "New description.",
      url: "https://www.portugalactive.com/en/viana",
    });
    expect(out).toContain("<title>New Title</title>");
    expect(out).toMatch(/<meta name="description" content="New description\."/);
    expect(out).toMatch(/<link rel="canonical" href="https:\/\/www\.portugalactive\.com\/en\/viana"/);
  });
});

describe("injectSchemaGraph", () => {
  const shell = `<!DOCTYPE html><html><head></head><body></body></html>`;

  it("inserts a single application/ld+json script with the given id", () => {
    const out = injectSchemaGraph(shell, "test-graph", { "@type": "Thing", name: "Test" });
    // SSR injector uses the raw domId (no "sd-" prefix — that's the
    // client-side <StructuredData /> convention, not the server one).
    expect(out).toMatch(/<script type="application\/ld\+json" id="test-graph">/);
    expect(out).toContain(`"name":"Test"`);
  });
});

/* ── Destination SSR meta coverage ────────────────────────────────────── */

describe("DESTINATION_DESCRIPTION coverage", () => {
  // Every active destination slug shipped in destinations.json must have at
  // least an EN entry in DESTINATION_DESCRIPTION, or the SSR meta lookup for
  // that route will return undefined and crawlers will get the generic
  // homepage description. This test fails the build before the regression
  // ships.
  const activeSlugs = (destinationsData as Array<{ slug: string; comingSoon?: boolean }>)
    .filter(d => !d.comingSoon)
    .map(d => d.slug);

  it.each(activeSlugs)("has an EN description for /destinations/%s", slug => {
    expect(DESTINATION_DESCRIPTION[slug]?.en, `missing EN description for slug "${slug}"`).toBeTruthy();
  });

  it("has the four new May-2026 spoke destinations wired", () => {
    for (const slug of ["viana-do-castelo", "caminha", "esposende", "douro"]) {
      expect(DESTINATION_DESCRIPTION[slug]?.en).toBeTruthy();
      expect(DESTINATION_DESCRIPTION[slug]?.pt).toBeTruthy();
    }
  });
});

describe("DESTINATION_TITLE", () => {
  it("produces a brand-suffixed title for every supported language", () => {
    for (const lang of ["en", "pt", "es", "fr", "de", "it", "nl", "fi", "sv"]) {
      const title = DESTINATION_TITLE[lang]("Viana do Castelo");
      expect(title).toMatch(/Viana do Castelo/);
      expect(title).toMatch(/Portugal Active/);
    }
  });
});

describe("destLabel", () => {
  it("returns the localized region label for a known slug", () => {
    expect(destLabel("minho", "en")).toBe("Minho Coast");
    expect(destLabel("minho", "pt")).toBe("Costa do Minho");
    expect(destLabel("porto", "fr")).toBe("Porto et Douro");
  });

  it("falls back to EN when the requested language is missing", () => {
    expect(destLabel("alentejo", "xx" /* unsupported lang */)).toBe("Alentejo");
  });

  it("returns the raw slug when the destination is unknown", () => {
    expect(destLabel("atlantis", "en")).toBe("atlantis");
  });

  it("returns empty string for nullish input", () => {
    expect(destLabel(null, "en")).toBe("");
    expect(destLabel(undefined, "en")).toBe("");
  });
});
