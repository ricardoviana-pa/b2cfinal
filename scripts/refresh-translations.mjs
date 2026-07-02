#!/usr/bin/env node
/**
 * INCREMENTAL TRANSLATION REFRESH (Phase 2)
 * =========================================================================
 * Keeps the per-language content translations fresh WITHOUT re-translating
 * everything. Detects which items changed since the last run (content hash vs
 * a committed manifest), exports ONLY the deltas for translation, then merges
 * the results back and updates the manifest.
 *
 * Safe by design: this is a standalone script (run manually or on a schedule).
 * It does NOT touch the live Guesty sync or the request-serving path.
 *
 * Content types:
 *   - properties : EN source from the live prod endpoint (listForSite already
 *                  excludes brand-hidden listings, so we only refresh visible
 *                  ones). Keyed by guestyId.
 *   - blog       : EN source from client/src/data/blog.json. Keyed by slug.
 *
 * Files per type live in client/src/data/<type>.i18n/<lang>.json plus a
 * .manifest.json holding { key: sourceHash } of the last-translated English.
 *
 * USAGE
 *   node scripts/refresh-translations.mjs [--type=properties|blog|all]
 *       Detect + report NEW/CHANGED/REMOVED. Writes delta EN source to
 *       /tmp/i18n_refresh/<type>/deltas.json and prints a work-list.
 *   node scripts/refresh-translations.mjs --baseline [--type=...]
 *       Mark the CURRENT source as up-to-date (write the manifest) without
 *       translating. Use once to initialise after the big one-off backfill.
 *   node scripts/refresh-translations.mjs --merge=/tmp/i18n_refresh/<type> --type=<type>
 *       Merge translated deltas ( <lang>.json files, key -> fields ) into the
 *       i18n files, prune REMOVED keys, and update the manifest.
 *
 * Translating the deltas: with no external API this emits a work-list + the
 * delta EN source, translated via the subagent flow (as in the backfill). To
 * automate fully, plug a translation API into translateDeltas() below and run
 * this on a cron — the delta detection makes each run cheap.
 * ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TARGET_LANGS = ['pt', 'fr', 'es', 'it', 'de', 'nl', 'sv'];
const PROD = 'https://www.portugalactive.com';

const TYPES = {
  properties: {
    dir: path.join(ROOT, 'client/src/data/properties.i18n'),
    key: 'guestyId',
    fields: ['tagline', 'description', 'seoDescription', 'descriptionSections'],
    async load() {
      const url = `${PROD}/api/trpc/properties.listForSite?batch=1&input=${encodeURIComponent('{"0":{"json":null}}')}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`listForSite HTTP ${res.status}`);
      const j = await res.json();
      const data = j[0].result.data;
      return (Array.isArray(data) ? data : data.json) || [];
    },
  },
  blog: {
    dir: path.join(ROOT, 'client/src/data/blog.i18n'),
    key: 'slug',
    fields: ['title', 'excerpt', 'content', 'seoTitle', 'seoDescription'],
    async load() {
      const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'client/src/data/blog.json'), 'utf8'));
      return raw.articles || [];
    },
  },
};

const pick = (obj, fields) => Object.fromEntries(fields.map(f => [f, obj?.[f] ?? null]));
const hash = (obj) => crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
const readJson = (p, fallback) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; } };
const writeJson = (p, obj) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, p.endsWith('.manifest.json') ? 1 : 0) + '\n'); };

function detect(typeName) {
  const cfg = TYPES[typeName];
  return cfg.load().then(items => {
    const manifestPath = path.join(cfg.dir, '.manifest.json');
    const manifest = readJson(manifestPath, {});
    const liveKeys = new Set();
    const changed = []; const added = [];
    const sourceByKey = {};
    for (const it of items) {
      const k = it[cfg.key];
      if (!k) continue;
      liveKeys.add(k);
      const src = pick(it, cfg.fields);
      sourceByKey[k] = { [cfg.key]: k, ...src };
      const h = hash(src);
      if (!(k in manifest)) added.push(k);
      else if (manifest[k] !== h) changed.push(k);
    }
    const removed = Object.keys(manifest).filter(k => !liveKeys.has(k));
    return { cfg, manifestPath, manifest, sourceByKey, added, changed, removed, liveCount: liveKeys.size };
  });
}

async function main() {
  const args = process.argv.slice(2);
  const typeArg = (args.find(a => a.startsWith('--type=')) || '--type=all').split('=')[1];
  const baseline = args.includes('--baseline');
  const mergeArg = args.find(a => a.startsWith('--merge='));
  const types = typeArg === 'all' ? Object.keys(TYPES) : [typeArg];

  if (mergeArg) {
    const dir = mergeArg.split('=')[1];
    for (const t of types) await mergeDeltas(t, dir);
    return;
  }

  for (const t of types) {
    const { cfg, manifestPath, sourceByKey, added, changed, removed, liveCount } = await detect(t);
    console.log(`\n=== ${t} === (${liveCount} live items)`);
    console.log(`  NEW:     ${added.length}${added.length ? ' → ' + added.slice(0, 8).join(', ') + (added.length > 8 ? ' …' : '') : ''}`);
    console.log(`  CHANGED: ${changed.length}${changed.length ? ' → ' + changed.slice(0, 8).join(', ') + (changed.length > 8 ? ' …' : '') : ''}`);
    console.log(`  REMOVED: ${removed.length}${removed.length ? ' → ' + removed.slice(0, 8).join(', ') + (removed.length > 8 ? ' …' : '') : ''}`);

    if (baseline) {
      const m = {}; for (const k of Object.keys(sourceByKey)) m[k] = hash(pick(sourceByKey[k], cfg.fields));
      writeJson(manifestPath, m);
      console.log(`  → baseline manifest written (${Object.keys(m).length} keys). No translation needed.`);
      continue;
    }

    const deltaKeys = [...added, ...changed];
    if (!deltaKeys.length && !removed.length) { console.log('  ✓ up to date — nothing to translate.'); continue; }

    if (deltaKeys.length) {
      const outDir = `/tmp/i18n_refresh/${t}`;
      const deltas = deltaKeys.map(k => sourceByKey[k]);
      writeJson(path.join(outDir, 'deltas.json'), deltas);
      console.log(`  → wrote ${deltas.length} delta item(s) EN source to ${outDir}/deltas.json`);
      console.log(`    Translate them into: ${TARGET_LANGS.join(', ')} (structure: {${cfg.key}, ${cfg.fields.join(', ')}}),`);
      console.log(`    write ${outDir}/<lang>.json (array of {${cfg.key}, <fields>}), then run:`);
      console.log(`    node scripts/refresh-translations.mjs --merge=${outDir} --type=${t}`);
    }
    if (removed.length) console.log(`  → ${removed.length} removed key(s) will be pruned from i18n files + manifest on --merge.`);
  }
}

async function mergeDeltas(typeName, dir) {
  const cfg = TYPES[typeName];
  const { manifestPath, manifest, sourceByKey, removed } = await detect(typeName);
  let mergedLangs = 0, mergedItems = 0;
  for (const lang of TARGET_LANGS) {
    const p = path.join(dir, `${lang}.json`);
    if (!fs.existsSync(p)) continue;
    const arr = readJson(p, []);
    const langFile = path.join(cfg.dir, `${lang}.json`);
    const store = readJson(langFile, {});
    for (const item of arr) {
      const k = item[cfg.key];
      if (!k) continue;
      store[k] = pick(item, cfg.fields);
      mergedItems++;
    }
    for (const k of removed) delete store[k];
    writeJson(langFile, store);
    mergedLangs++;
  }
  // Update manifest: set hashes for everything currently live, drop removed.
  const m = {}; for (const k of Object.keys(sourceByKey)) m[k] = hash(pick(sourceByKey[k], cfg.fields));
  writeJson(manifestPath, m);
  console.log(`[${typeName}] merged ${mergedItems} item-translations across ${mergedLangs} language file(s); pruned ${removed.length}; manifest updated (${Object.keys(m).length} keys).`);
}

main().catch(e => { console.error('refresh failed:', e); process.exit(1); });
