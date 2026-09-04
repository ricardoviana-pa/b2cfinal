#!/usr/bin/env node
/**
 * Smoke pós-deploy: o que está no ar tem de ser o build que acabou de sair.
 *
 * Auditoria set/2026, N2: produção serviu durante dias um robots.txt que já
 * não existia no repositório. Este script falha o deploy quando o site
 * público diverge do `dist/` acabado de construir:
 *
 *   1. robots.txt e llms.txt byte a byte iguais a dist/public/*
 *   2. /en/, /en/homes, /en/blog e um PDP: 200, mesmo bundle de entrada
 *      (/assets/index-<hash>.js) que dist/public/index.html, #root com
 *      markup SSR, <title> presente e sem noindex
 *   3. sitemap.xml: XML válido, com /homes, /blog e os destinos publicados
 *
 * A edge guarda HTML até 60 s (+120 s stale-while-revalidate) e estáticos 1 h,
 * por isso o script repete até `--timeout` segundos antes de desistir — o
 * servidor purga a CDN 90 s depois do boot (server/services/cdn-purge.ts).
 *
 * Uso:
 *   npm run build && node scripts/smoke-deploy.mjs
 *   node scripts/smoke-deploy.mjs --base https://dev.portugalactive.com --timeout 60
 *   node scripts/smoke-deploy.mjs --pdp casa-do-rio-lima     # PDP específico
 *
 * Sai com 0 quando tudo bate certo; 1 com a lista das divergências.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist", "public");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const BASE = opt("base", process.env.SMOKE_BASE_URL || "https://www.portugalactive.com").replace(/\/$/, "");
const TIMEOUT_S = Number(opt("timeout", 300));
const POLL_S = Number(opt("poll", 15));
const PDP_ARG = opt("pdp", "");

const UA = "PortugalActive-SmokeDeploy/1 (+https://www.portugalactive.com)";

function readDist(file) {
  const p = path.join(DIST, file);
  if (!fs.existsSync(p)) throw new Error(`falta ${p} — corre \`npm run build\` primeiro`);
  return fs.readFileSync(p, "utf8");
}

function entryHash(html) {
  const m = html.match(/\/assets\/index-([A-Za-z0-9_-]+)\.js/);
  return m ? m[1] : null;
}

async function get(pathname, accept = "text/html") {
  const res = await fetch(BASE + pathname, {
    headers: { "User-Agent": UA, Accept: accept, "Cache-Control": "no-cache" },
    redirect: "manual",
  });
  const text = await res.text();
  return { status: res.status, text, cf: res.headers.get("cf-cache-status") || "-" };
}

function normalize(s) {
  return s.replace(/\r\n/g, "\n").trim();
}

function publishedDestinationSlugs() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "client/src/data/destinations.json"), "utf8"));
    const list = Array.isArray(raw) ? raw : raw.destinations || Object.values(raw)[0];
    return list
      .filter((d) => d && d.slug && d.status !== "draft" && d.published !== false && !d.comingSoon)
      .map((d) => d.slug);
  } catch {
    return [];
  }
}

async function runOnce(expected) {
  const problems = [];

  // 1. Estáticos byte a byte
  for (const file of ["robots.txt", "llms.txt"]) {
    const live = await get(`/${file}`, "text/plain");
    if (live.status !== 200) problems.push(`/${file}: HTTP ${live.status}`);
    else if (normalize(live.text) !== normalize(expected[file])) {
      problems.push(`/${file}: conteúdo diverge do build (cf-cache-status ${live.cf})`);
    }
  }

  // 2. HTML: bundle de entrada, SSR, title, index
  let pdpPath = PDP_ARG ? `/en/homes/${PDP_ARG}` : null;
  const sitemap = await get("/sitemap.xml", "application/xml");
  if (sitemap.status !== 200 || !/^\s*<\?xml/.test(sitemap.text)) {
    problems.push(`/sitemap.xml: HTTP ${sitemap.status} ou não é XML`);
  } else {
    const locs = [...sitemap.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (!pdpPath) {
      const first = locs.find((u) => /\/en\/homes\/[^/]+$/.test(u));
      if (first) pdpPath = new URL(first).pathname;
    }
    if (!locs.some((u) => u.endsWith("/en/homes"))) problems.push("sitemap sem /en/homes");
    if (!locs.some((u) => u.endsWith("/en/blog"))) problems.push("sitemap sem /en/blog");
    for (const slug of expected.destinations) {
      if (!locs.some((u) => u.endsWith(`/en/destinations/${slug}`))) {
        problems.push(`sitemap sem /en/destinations/${slug}`);
      }
    }
    if (/<loc>[^<]*\/homes\/test-/i.test(sitemap.text)) problems.push("sitemap lista uma casa de teste");
  }

  const pages = ["/en/", "/en/homes", "/en/blog", pdpPath].filter(Boolean);
  for (const p of pages) {
    const r = await get(p);
    if (r.status !== 200) { problems.push(`${p}: HTTP ${r.status}`); continue; }
    const hash = entryHash(r.text);
    if (hash !== expected.entryHash) {
      problems.push(`${p}: bundle ${hash ?? "?"} ≠ build ${expected.entryHash} (cf-cache-status ${r.cf})`);
    }
    if (!/<title>[^<]{5,}<\/title>/.test(r.text)) problems.push(`${p}: sem <title>`);
    if (/<meta name="robots" content="[^"]*noindex/i.test(r.text)) problems.push(`${p}: noindex`);
    const rootIdx = r.text.indexOf('id="root"');
    const after = rootIdx >= 0 ? r.text.slice(rootIdx, rootIdx + 400) : "";
    if (!/id="root"[^>]*>\s*<(?!\/div)/.test(after)) problems.push(`${p}: #root vazio (sem SSR)`);
  }

  return problems;
}

async function main() {
  const expected = {
    "robots.txt": readDist("robots.txt"),
    "llms.txt": readDist("llms.txt"),
    entryHash: entryHash(readDist("index.html")),
    destinations: publishedDestinationSlugs(),
  };
  if (!expected.entryHash) throw new Error("dist/public/index.html sem /assets/index-*.js");

  console.log(`smoke-deploy → ${BASE}  (bundle esperado index-${expected.entryHash}.js)`);
  const started = Date.now();
  let attempt = 0;
  let problems = [];
  while (true) {
    attempt += 1;
    problems = await runOnce(expected);
    if (problems.length === 0) {
      console.log(`✓ ao ar = build (${attempt} tentativa${attempt > 1 ? "s" : ""}, ${Math.round((Date.now() - started) / 1000)} s)`);
      return 0;
    }
    const elapsed = (Date.now() - started) / 1000;
    if (elapsed + POLL_S > TIMEOUT_S) break;
    console.log(`… tentativa ${attempt}: ${problems.length} divergência(s); a repetir em ${POLL_S} s`);
    await new Promise((r) => setTimeout(r, POLL_S * 1000));
  }
  console.error(`✗ o site não corresponde ao build após ${TIMEOUT_S} s:`);
  for (const p of problems) console.error(`  - ${p}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("✗ " + (err?.message || err));
    process.exit(1);
  });
