import express from "express";
import helmet from "helmet";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// /api/health must never reach the DB (TiDB bills per request) or Guesty: if
// anything imports them while the route runs, these spies say so.
const { getDb, guestyFetch } = vi.hoisted(() => ({ getDb: vi.fn(), guestyFetch: vi.fn() }));
vi.mock("./db", () => ({ getDb }));
vi.mock("./lib/guesty", () => ({ guestyFetch, isGuestyConfigured: () => true }));

import { registerHealthRoutes } from "./routes/health";
import {
  PERMISSIONS_POLICY,
  PERMISSIONS_POLICY_DISABLED,
  isCrossOriginStaticFile,
  isNonDocumentFile,
  permissionsPolicyHeader,
  registerSecurityTxtRoutes,
  securityTxt,
  setStaticFileHeaders,
} from "./lib/security-headers";

/* Auditoria 29 out 2026: tracking-legal-security-hardening (Permissions-Policy,
   security.txt), -corp-blocks-email-images (CORP) e -origin-502-no-health
   (/api/health). The app below is wired like server/_core/index.ts and
   serveStatic in _core/vite.ts: Helmet with the production options, then the
   Permissions-Policy middleware, the health and security.txt routes, the
   static files with setStaticFileHeaders, and an HTML catch-all. */

let server: Server;
let origin: string;
let publicDir: string;

beforeAll(async () => {
  publicDir = fs.mkdtempSync(path.join(os.tmpdir(), "pa-static-"));
  for (const file of ["email/brand-band.png", "homes/photos/PT0009/1.webp", "hero/x.jpg", "assets/index-abc.js", "assets/index-abc.css", "assets/font.woff2", "destinations/photography.html", "robots.txt", "site.webmanifest"]) {
    fs.mkdirSync(path.join(publicDir, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(publicDir, file), "x");
  }
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, referrerPolicy: { policy: "strict-origin-when-cross-origin" } }));
  app.use(permissionsPolicyHeader);
  registerHealthRoutes(app);
  registerSecurityTxtRoutes(app);
  app.get("/api/trpc/properties.listForSite", (_req, res) => { res.json({ ok: 1 }); });
  app.use("/assets", express.static(path.join(publicDir, "assets"), { maxAge: "1y", immutable: true, setHeaders: setStaticFileHeaders }));
  app.use(express.static(publicDir, { maxAge: "1h", index: false, setHeaders: setStaticFileHeaders }));
  app.use((_req, res) => { res.status(200).set("Content-Type", "text/html").send("<!doctype html><title>x</title>"); });
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(publicDir, { recursive: true, force: true });
});

const get = (url: string, method = "GET") => fetch(`${origin}${url}`, { method, redirect: "manual" });

describe("GET /api/health", () => {
  it("answers 200 {ok:true}, uncached, without touching the DB or Guesty", async () => {
    const started = Date.now();
    const res = await get("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(Date.now() - started).toBeLessThan(1000);
    expect(getDb).not.toHaveBeenCalled();
    expect(guestyFetch).not.toHaveBeenCalled();
  });

  it("works for HEAD (uptime monitors) and keeps the API same-origin", async () => {
    const res = await get("/api/health", "HEAD");
    expect(res.status).toBe(200);
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
  });

  it("imports nothing that reaches the DB, Guesty or the property store", () => {
    const src = fs.readFileSync("server/routes/health.ts", "utf8");
    expect(src).not.toMatch(/from\s+["'][^"']*(db|guesty|properties-store|checkout)["']/);
    expect(src).not.toMatch(/import\(/);
  });
});

describe("Permissions-Policy", () => {
  it("disables only features the site does not use", () => {
    expect(PERMISSIONS_POLICY).toBe(PERMISSIONS_POLICY_DISABLED.map((f) => `${f}=()`).join(", "));
    for (const feature of ["camera", "microphone", "usb", "midi", "magnetometer"]) {
      expect(PERMISSIONS_POLICY).toContain(`${feature}=()`);
    }
    // Apple Pay / Google Pay in the Stripe iframes, 3-D Secure, the YouTube and
    // Vimeo embeds and the share buttons need these: never restricted here.
    for (const used of ["payment", "geolocation", "publickey-credentials-get", "otp-credentials", "fullscreen", "autoplay", "accelerometer", "gyroscope", "encrypted-media", "picture-in-picture", "clipboard-write", "web-share"]) {
      expect(PERMISSIONS_POLICY).not.toMatch(new RegExp(`(^|, )${used}=`));
    }
  });

  it("matches the code: no client file asks for a disabled feature", () => {
    const API_OF: Record<string, RegExp> = {
      camera: /getUserMedia|mediaDevices/,
      microphone: /getUserMedia|mediaDevices/,
      "display-capture": /getDisplayMedia/,
      usb: /navigator\.usb/,
      serial: /navigator\.serial/,
      hid: /navigator\.hid/,
      bluetooth: /navigator\.bluetooth/,
      midi: /requestMIDIAccess/,
      magnetometer: /Magnetometer/,
      "idle-detection": /IdleDetector/,
      "xr-spatial-tracking": /navigator\.xr|requestSession/,
    };
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.(tsx?|html)$/.test(entry.name)) files.push(p);
      }
    };
    walk("client/src");
    files.push("client/index.html");
    for (const feature of PERMISSIONS_POLICY_DISABLED) {
      const api = API_OF[feature];
      expect(api, `add the browser API of "${feature}" to this test`).toBeDefined();
      for (const file of files) {
        const src = fs.readFileSync(file, "utf8");
        expect(api.test(src), `${file} uses ${feature}: remove it from PERMISSIONS_POLICY_DISABLED`).toBe(false);
        // An <iframe allow="…"> delegating it to an embed counts as use too.
        for (const allow of src.matchAll(/allow=["'{`]([^"'}`]*)|setAttribute\(\s*['"]allow['"]\s*,\s*['"]([^'"]*)/g)) {
          expect((allow[1] ?? allow[2]).split(/[;\s]+/).includes(feature), `${file} delegates ${feature} to an iframe`).toBe(false);
        }
      }
    }
  });

  it("is sent on documents (SPA routes, .html files, API pages) and not on static assets", async () => {
    for (const url of ["/en", "/pt/homes/casa-x", "/destinations/photography.html", "/api/health", "/api/trpc/properties.listForSite"]) {
      expect((await get(url)).headers.get("permissions-policy"), url).toBe(PERMISSIONS_POLICY);
    }
    for (const url of ["/email/brand-band.png", "/assets/index-abc.js", "/assets/font.woff2", "/robots.txt"]) {
      expect((await get(url)).headers.get("permissions-policy"), url).toBeNull();
    }
    expect(isNonDocumentFile("/homes/photos/PT0009/1.webp")).toBe(true);
    expect(isNonDocumentFile("/en/experiences/horseback-riding")).toBe(false);
  });
});

describe("Cross-Origin-Resource-Policy", () => {
  it("lets other sites and email clients load the public images, video, fonts, JS and CSS", async () => {
    for (const url of ["/email/brand-band.png", "/homes/photos/PT0009/1.webp", "/hero/x.jpg", "/assets/index-abc.js", "/assets/index-abc.css", "/assets/font.woff2"]) {
      const res = await get(url);
      expect(res.status, url).toBe(200);
      expect(res.headers.get("cross-origin-resource-policy"), url).toBe("cross-origin");
    }
  });

  it("keeps HTML, text, the API and missing files same-origin", async () => {
    for (const url of ["/en", "/destinations/photography.html", "/robots.txt", "/site.webmanifest", "/api/health", "/email/missing.png"]) {
      expect((await get(url)).headers.get("cross-origin-resource-policy"), url).toBe("same-origin");
    }
    expect(isCrossOriginStaticFile("/x/index.html")).toBe(false);
    expect(isCrossOriginStaticFile("/x/data.json")).toBe(false);
    expect(isCrossOriginStaticFile("/email/brand-band.PNG")).toBe(true);
  });
});

describe("/.well-known/security.txt", () => {
  it("publishes the contact, an expiry under a year ahead and the languages (RFC 9116)", async () => {
    const res = await get("/.well-known/security.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    const body = await res.text();
    expect(body).toMatch(/^Contact: mailto:info@portugalactive\.com$/m);
    expect(body).toMatch(/^Preferred-Languages: en, pt$/m);
    const expires = body.match(/^Expires: (.+)$/m)?.[1];
    expect(expires).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00Z$/);
    const ms = Date.parse(expires!) - Date.now();
    expect(ms).toBeGreaterThan(364 * 24 * 3600 * 1000 - 1);
    expect(ms).toBeLessThanOrEqual(366 * 24 * 3600 * 1000);
    expect(body.match(/^Expires:/gm)).toHaveLength(1);
  });

  it("dates Expires on the same day next year, midnight UTC", () => {
    expect(securityTxt(new Date("2026-10-29T15:42:00Z"))).toContain("Expires: 2027-10-29T00:00:00Z");
    // 29 Feb has no twin: the next day, still within a year.
    expect(securityTxt(new Date("2028-02-29T08:00:00Z"))).toContain("Expires: 2029-03-01T00:00:00Z");
  });

  it("redirects the legacy /security.txt", async () => {
    const res = await get("/security.txt");
    expect(res.status).toBe(301);
    expect(res.headers.get("location")).toBe("/.well-known/security.txt");
  });
});

describe("wiring in the production server", () => {
  const index = fs.readFileSync("server/_core/index.ts", "utf8");
  const vite = fs.readFileSync("server/_core/vite.ts", "utf8");

  it("mounts the headers and routes before the SPA and the static files", () => {
    const helmetAt = index.indexOf("app.use(helmet(");
    const ppAt = index.indexOf("app.use(permissionsPolicyHeader)");
    const healthAt = index.indexOf("registerHealthRoutes(app)");
    const txtAt = index.indexOf("registerSecurityTxtRoutes(app)");
    const staticAt = index.indexOf("serveStatic(app)");
    for (const at of [helmetAt, ppAt, healthAt, txtAt, staticAt]) expect(at).toBeGreaterThan(-1);
    expect(ppAt).toBeGreaterThan(helmetAt);
    expect(healthAt).toBeLessThan(staticAt);
    expect(txtAt).toBeLessThan(staticAt);
  });

  it("sets the CORP override on both static mounts", () => {
    expect(vite.match(/setHeaders: setStaticFileHeaders/g)).toHaveLength(2);
  });
});
