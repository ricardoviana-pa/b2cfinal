/**
 * Sync Bókun activity content into client/src/data/experienceDetails.json
 *
 * - Fetches each mapped activity via HMAC-signed /activity.json/{id}
 * - Updates: gallery (large derived URLs), image (keyPhoto large), bokunActivityId
 * - Adds sidecar `bokunContent` with raw description/included/excluded/title
 *   so we can manually promote into aboutParagraphs after review.
 *
 * Run: node scripts/sync-bokun-content.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load env from .env.local
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) process.env[m[1]] ??= m[2];
  }
}

const ACCESS = process.env.BOKUN_ACCESS_KEY;
const SECRET = process.env.BOKUN_SECRET_KEY;
if (!ACCESS || !SECRET) {
  console.error('Missing BOKUN_ACCESS_KEY / BOKUN_SECRET_KEY');
  process.exit(1);
}

// Slug -> Bókun activity ID mapping (confirmed via OCTO /products listing)
const MAPPING = {
  'hike-dive-dine': 692747,
  'stand-up-paddle': 749994,
  'horseback-riding': 692748,
  'can-am-buggy': 1046807,
  // Not yet in Bókun: canyoning, sailing, ebike-tours, surf-lessons
};

function bokunDate() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, '').replace('T', ' ');
}

async function fetchActivity(id) {
  const p = `/activity.json/${id}`;
  const date = bokunDate();
  const sig = crypto.createHmac('sha1', SECRET).update(date + ACCESS + 'GET' + p).digest('base64');
  const res = await fetch('https://api.bokun.io' + p, {
    headers: {
      'X-Bokun-Date': date,
      'X-Bokun-AccessKey': ACCESS,
      'X-Bokun-Signature': sig,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Bókun ${id} → ${res.status}`);
  return res.json();
}

function pickPhotoUrl(photo) {
  if (!photo) return null;
  const large = photo.derived?.find((d) => d.name === 'large');
  return large?.cleanUrl || large?.url || photo.originalUrl || null;
}

function htmlToParagraphs(html) {
  if (!html) return [];
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .split(/\n{2,}|\n(?=\d+\s*–)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function htmlToList(html) {
  if (!html) return [];
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+>/g, '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const file = path.join(ROOT, 'client/src/data/experienceDetails.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));

  for (const exp of data.experiences) {
    const id = MAPPING[exp.slug];
    if (!id) {
      console.log(`· skip ${exp.slug} (no Bókun ID)`);
      continue;
    }
    try {
      const a = await fetchActivity(id);
      const photos = (a.photos ?? []).map(pickPhotoUrl).filter(Boolean);
      exp.bokunActivityId = id;
      if (photos.length) {
        exp.gallery = photos;
        exp.image = pickPhotoUrl(a.keyPhoto) || photos[0];
      }
      const descParas = htmlToParagraphs(a.description);
      const incList = htmlToList(a.included);
      const excList = htmlToList(a.excluded);
      if (descParas.length) exp.aboutParagraphs = descParas;
      if (incList.length) exp.included = incList;
      if (excList.length) exp.notIncluded = excList;
      if (a.title) exp.name = a.title;
      exp.bokunContent = {
        title: a.title,
        descriptionParagraphs: htmlToParagraphs(a.description),
        included: htmlToList(a.included),
        excluded: htmlToList(a.excluded),
        requirements: a.requirements,
        photoCount: photos.length,
        lastSynced: new Date().toISOString(),
      };
      console.log(`✓ ${exp.slug} ← Bókun ${id} (${photos.length} photos)`);
    } catch (err) {
      console.error(`✗ ${exp.slug} (${id}): ${err.message}`);
    }
  }

  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
  console.log('\nWrote', file);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
