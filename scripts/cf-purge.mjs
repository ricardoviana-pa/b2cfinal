#!/usr/bin/env node
/**
 * Purge the Cloudflare cache for this zone.
 *
 * Run once after deploying the cache rule, and ideally on every deploy: with
 * HTML held at the edge, a fresh build changes the /assets/<hash>.js filenames,
 * and any still-cached HTML would point at files that no longer exist. Purging
 * removes that window entirely — and lets you raise s-maxage in
 * setHtmlCacheHeaders (server/_core/vite.ts) well above the current cautious 60s.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx node scripts/cf-purge.mjs
 *
 * Optional: CLOUDFLARE_ZONE_ID (else resolved from CLOUDFLARE_ZONE_NAME /
 * portugalactive.com). Token needs: Zone → Cache Purge → Purge.
 *
 * To wire it into Render: add it as a post-deploy command, with
 * CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID set as environment variables.
 */

import "dotenv/config";

const API = "https://api.cloudflare.com/client/v4";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || "portugalactive.com";

if (!TOKEN) {
  console.error("Missing CLOUDFLARE_API_TOKEN (needs Zone → Cache Purge → Purge).");
  process.exit(1);
}

async function cf(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const errs = (body.errors || []).map(e => `${e.code} ${e.message}`).join("; ");
    throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${errs || ""}`);
  }
  return body.result;
}

const main = async () => {
  let zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
    if (!zones?.length) throw new Error(`Zone "${ZONE_NAME}" not found for this token.`);
    zoneId = zones[0].id;
  }
  await cf(`/zones/${zoneId}/purge_cache`, {
    method: "POST",
    body: JSON.stringify({ purge_everything: true }),
  });
  console.log(`✓ Purged Cloudflare cache for ${ZONE_NAME}.`);
};

main().catch(err => {
  console.error("✗ " + err.message);
  process.exit(1);
});
