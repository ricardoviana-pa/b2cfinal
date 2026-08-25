#!/usr/bin/env node
/**
 * Create / update the "Cache public HTML" Cloudflare cache rule.
 *
 * Cloudflare does NOT cache HTML by default, so the Cache-Control headers the
 * server now sends (see setHtmlCacheHeaders in server/_core/vite.ts) are
 * ignored until a cache rule marks these requests eligible. This script adds
 * that rule with Edge TTL = respect_origin, i.e. the origin headers stay in
 * charge: public pages use their s-maxage, and /account /login /checkout
 * /booking /admin keep sending `no-store` so they are never stored.
 *
 * SAFETY: a PUT on a ruleset REPLACES every rule in it. This script reads the
 * existing rules first and re-sends them with ours appended (replacing only a
 * previous copy of the same rule), so hand-made rules are preserved. Run with
 * --dry-run first to print exactly what would be sent.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=xxx node scripts/cf-cache-rule.mjs --dry-run
 *   CLOUDFLARE_API_TOKEN=xxx node scripts/cf-cache-rule.mjs
 *
 * Optional: CLOUDFLARE_ZONE_ID=xxx (otherwise resolved from ZONE_NAME)
 *
 * Token permissions required (Cloudflare dashboard → My Profile → API Tokens):
 *   Zone → Cache Rules → Edit
 *   Zone → Zone → Read        (to resolve the zone id by name)
 */

import "dotenv/config";

const API = "https://api.cloudflare.com/client/v4";
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ZONE_NAME = process.env.CLOUDFLARE_ZONE_NAME || "portugalactive.com";
const DRY = process.argv.includes("--dry-run");

const RULE_DESCRIPTION = "Cache public HTML (managed by scripts/cf-cache-rule.mjs)";

/** Public pages only — everything behind auth or tied to one booking is excluded.
 *  /api/ is excluded so tRPC keeps its own caching semantics. */
const RULE_EXPRESSION = [
  '(http.request.method eq "GET"',
  // `contains`, not `starts_with`: every public path carries a locale prefix
  // (/en/admin, /pt/owners-portal), so a starts_with exclusion never matched
  // and these routes were only kept out of cache by the origin's own no-store.
  'and not http.request.uri.path contains "/api/"',
  'and not http.request.uri.path contains "/admin"',
  'and not http.request.uri.path contains "/owners-portal"',
  'and not http.request.uri.path contains "/account"',
  'and not http.request.uri.path contains "/login"',
  'and not http.request.uri.path contains "/checkout"',
  // Trailing slash on purpose: every real booking route has a child segment
  // (/booking/confirmation/…), while /blog/booking-traveller-review-awards-2020
  // is a public article that should stay cacheable.
  'and not http.request.uri.path contains "/booking/")',
].join(" ");

const RULE = {
  description: RULE_DESCRIPTION,
  expression: RULE_EXPRESSION,
  action: "set_cache_settings",
  enabled: true,
  action_parameters: {
    cache: true,
    // "Use cache-control header if present" — our origin headers stay in charge.
    edge_ttl: { mode: "respect_origin" },
    browser_ttl: { mode: "respect_origin" },
  },
};

if (!TOKEN) {
  console.error("Missing CLOUDFLARE_API_TOKEN.\n" +
    "Create one at https://dash.cloudflare.com/profile/api-tokens with\n" +
    "  Zone → Cache Rules → Edit   and   Zone → Zone → Read\n" +
    "then re-run:  CLOUDFLARE_API_TOKEN=xxx node scripts/cf-cache-rule.mjs --dry-run");
  process.exit(1);
}

async function cf(path, init = {}) {
  const res = await fetch(API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    const errs = (body.errors || []).map(e => `${e.code} ${e.message}`).join("; ");
    throw new Error(`${init.method || "GET"} ${path} → ${res.status} ${errs || JSON.stringify(body).slice(0, 200)}`);
  }
  return body.result;
}

async function main() {
  // 1. Zone
  let zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
    if (!zones?.length) throw new Error(`Zone "${ZONE_NAME}" not found for this token.`);
    zoneId = zones[0].id;
    console.log(`Zone: ${ZONE_NAME} (${zoneId})`);
  }

  // 2. Find the cache-settings phase entry point ruleset
  const rulesets = await cf(`/zones/${zoneId}/rulesets`);
  const phase = rulesets.find(
    r => r.phase === "http_request_cache_settings" && r.kind === "zone",
  );

  if (!phase) {
    console.log("No http_request_cache_settings ruleset yet — will create it with our single rule.");
    if (DRY) return dump({ action: "CREATE ruleset", rules: [RULE] });
    const created = await cf(`/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: "Cache rules",
        kind: "zone",
        phase: "http_request_cache_settings",
        rules: [RULE],
      }),
    });
    console.log(`✓ Created ruleset ${created.id} with the cache rule.`);
    return;
  }

  // 3. Read existing rules and merge (NEVER blow away someone else's rule)
  const full = await cf(`/zones/${zoneId}/rulesets/${phase.id}`);
  const existing = full.rules || [];
  const kept = existing.filter(r => r.description !== RULE_DESCRIPTION);
  const replaced = existing.length !== kept.length;

  console.log(`Existing cache rules: ${existing.length}` +
    (replaced ? " (one is a previous copy of ours — will be replaced)" : ""));
  existing.forEach(r => console.log(`   · ${r.description || "(no description)"}`));

  const rules = [
    ...kept.map(r => ({
      description: r.description,
      expression: r.expression,
      action: r.action,
      action_parameters: r.action_parameters,
      enabled: r.enabled,
    })),
    RULE,
  ];

  if (DRY) return dump({ action: `PUT ruleset ${phase.id}`, rules });

  await cf(`/zones/${zoneId}/rulesets/${phase.id}`, {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });
  console.log(`✓ Cache rule deployed (${kept.length} pre-existing rule(s) preserved).`);
  console.log("\nNow purge once so visitors pick it up:");
  console.log(`  CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ZONE_ID=${zoneId} node scripts/cf-purge.mjs`);
}

function dump(o) {
  console.log("\n--- DRY RUN — nothing was sent ---");
  console.log(JSON.stringify(o, null, 2));
}

main().catch(err => {
  console.error("✗ " + err.message);
  process.exit(1);
});
