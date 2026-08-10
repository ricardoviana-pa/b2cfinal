#!/usr/bin/env node
/**
 * Generate Meta (Facebook/Instagram) hotel-catalog feeds from the site's own
 * property data, instead of Guesty's auto-export. Why not Guesty's export:
 *   - its URLs use guestyId and 404 on the site (routes resolve by slug)
 *   - it includes delisted low-tier houses that were removed from the site
 *   - base_price is Guesty's placeholder, not the real "From €X"
 *   - only 3 images and English-only
 *
 * Outputs (exports/meta-catalog/):
 *   hotels.csv               main feed, English (default catalog language)
 *   hotels-lang-<loc>.csv    language-override supplementary feeds (Meta
 *                            "country & language feeds": hotel_id + override
 *                            column + the localized fields)
 *
 * Coordinates come from properties.json (address.lat/lng). If one is ever
 * missing there, merge a Guesty hotels export into a local cache as fallback:
 *   node scripts/meta-catalog.mjs --guesty-csv ~/Downloads/hotels.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = 'client/src/data';

// Property data is read from origin/main — what production actually serves —
// not the local checkout, which can be ahead (dev branch). --local overrides.
const USE_LOCAL = process.argv.includes('--local');
function readText(repoRel) {
  if (USE_LOCAL) {
    const f = path.join(ROOT, repoRel);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null;
  }
  try {
    return execFileSync('git', ['show', `origin/main:${repoRel}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch {
    return null;
  }
}
function readData(rel) {
  const text = readText(`${DATA}/${rel}`);
  return text ? JSON.parse(text) : null;
}

// Multi-unit groups, mirrored from client/src/config/propertyGroups.ts: the
// site's PLP shows one card per physical property (parent listing, group
// name) and hides the child units. The ads catalog does the same — otherwise
// units would compete against their own parent in the auction.
function parsePropertyGroups() {
  const src = readText('client/src/config/propertyGroups.ts');
  const parentName = new Map(); // parentGuestyId -> group display name
  const childUnits = new Set();
  if (!src) return { parentName, childUnits };
  const blocks = src.matchAll(/name:\s*'([^']+)',\s*parentGuestyId:\s*'([a-f0-9]+)'[^[]*unitGuestyIds:\s*\[([^\]]*)\]/g);
  for (const [, name, parentId, unitsBlock] of blocks) {
    parentName.set(parentId, name);
    for (const [, unitId] of unitsBlock.matchAll(/'([a-f0-9]+)'/g)) {
      if (unitId !== parentId) childUnits.add(unitId);
    }
  }
  return { parentName, childUnits };
}

// Delisted low-tier houses: still present in Guesty and in main's data, but
// they must never appear in ads. Keyed by guestyId.
const EXCLUDE = new Set([
  '6a50d66857c8010015595ad0', // Agra Country House with Pool
  '6a3549e5edd13800142415e0', // Canopy House
  '6a2ad70638d6620013badaef', // Carcavelos Manor House
  '6a341163c50f210012f12b80', // Douro Garden
  '6a3ba1fce19cb0001dc57ea6', // Filigree Plaza
  '6a3a63f9e19cb0001db6a05e', // Saltwind Studio
  '6a4297f706510a0014f79dd1', // Sunrise Escape with Pool
  '6a312c59a705e1001327708c', // Sunset Cliffs with Ocean View
  '6965331fec80690013738c68', // Villa Aura (Connected Premium Lodge)
  '696533466d209c001510ecfe', // Eben Lodge
  '6965339dbf04fe0013743e2d', // Fountain Retreat (group parent; units are already excluded as children)
  '69b3f4234aafb300134e52a9', // Madorra House (fica fora dos ads por decisão do Ricardo, 2026-07)
]);
const OUT_DIR = path.join(ROOT, 'exports/meta-catalog');
const COORDS_CACHE = path.join(ROOT, 'scripts/meta-catalog.coords.json');

const SITE = 'https://www.portugalactive.com';
const BRAND = 'Portugal Active';
const MAX_IMAGES = 10; // Meta accepts up to 20; 10 keeps the file lean
const MIN_REVIEWS_FOR_RATING = 3; // a 4.0 from one review hurts more than it helps
// Meta locale codes for the override column, keyed by our i18n locale files.
// Ads strategy (July 2026): PRODUCT catalog, EN base + PT/ES only — decided
// with Ricardo for an easier learning curve. Hotel feeds stay available
// behind --hotels with the full locale set.
// EN base + PT + ES only, for both catalog formats (Ricardo, July 2026).
const PRODUCT_LOCALES = { pt: 'pt_PT', es: 'es_ES' };
const HOTEL_LOCALES = { ...PRODUCT_LOCALES };
// Full locale set kept here for when more markets open: fr_FR, de_DE, it_IT,
// nl_NL, sv_SE, fi_FI — add back to HOTEL_LOCALES/PRODUCT_LOCALES to enable.

// ---------- tiny CSV helpers (no deps) ----------
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsv(file, header, rows) {
  const lines = [header.join(',')];
  for (const r of rows) lines.push(header.map(h => csvEscape(r[h])).join(','));
  fs.writeFileSync(file, lines.join('\n') + '\n');
}
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// ---------- coordinate cache ----------
function loadCoords() {
  const cache = fs.existsSync(COORDS_CACHE) ? JSON.parse(fs.readFileSync(COORDS_CACHE, 'utf8')) : {};
  const argIdx = process.argv.indexOf('--guesty-csv');
  if (argIdx !== -1) {
    const csvPath = process.argv[argIdx + 1];
    if (!csvPath || !fs.existsSync(csvPath)) {
      console.error(`--guesty-csv: file not found: ${csvPath}`);
      process.exit(1);
    }
    let added = 0;
    for (const r of parseCsv(fs.readFileSync(csvPath, 'utf8'))) {
      if (r.hotel_id && r.latitude && r.longitude) {
        cache[r.hotel_id] = { lat: r.latitude, lng: r.longitude };
        added++;
      }
    }
    fs.writeFileSync(COORDS_CACHE, JSON.stringify(cache, null, 2) + '\n');
    console.log(`coords cache: merged ${added} entries from ${csvPath}`);
  }
  return cache;
}

// ---------- feed text hygiene ----------
function cleanText(s, max = 4900) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).replace(/\s+\S*$/, '') + '…' : t;
}

// ---------- ad copy ----------
// Catalog ads show little text, so the description front-loads the specs a
// traveller scans for (bedrooms · capacity · headline amenities · place),
// then the opening of the property description. ~380 chars total.
const AD_MAX = 380;
const COPY = {
  en: { bedroom: ['bedroom', 'bedrooms'], studio: 'Studio', guests: n => `up to ${n} guests` },
  pt: { bedroom: ['quarto', 'quartos'], studio: 'Estúdio', guests: n => `até ${n} hóspedes` },
  es: { bedroom: ['habitación', 'habitaciones'], studio: 'Estudio', guests: n => `hasta ${n} huéspedes` },
  fr: { bedroom: ['chambre', 'chambres'], studio: 'Studio', guests: n => `jusqu'à ${n} voyageurs` },
  de: { bedroom: ['Schlafzimmer', 'Schlafzimmer'], studio: 'Studio', guests: n => `bis zu ${n} Gäste` },
  it: { bedroom: ['camera', 'camere'], studio: 'Monolocale', guests: n => `fino a ${n} ospiti` },
  nl: { bedroom: ['slaapkamer', 'slaapkamers'], studio: 'Studio', guests: n => `tot ${n} gasten` },
  sv: { bedroom: ['sovrum', 'sovrum'], studio: 'Studio', guests: n => `upp till ${n} gäster` },
  fi: { bedroom: ['makuuhuone', 'makuuhuonetta'], studio: 'Studio', guests: n => `jopa ${n} vierasta` },
};
// Headline amenities in priority order; keys match Guesty amenity strings.
const HIGHLIGHTS = [
  { group: 'pool', match: ['Private pool'], t: { en: 'Private pool', pt: 'Piscina privada', es: 'Piscina privada', fr: 'Piscine privée', de: 'Privater Pool', it: 'Piscina privata', nl: 'Privézwembad', sv: 'Privat pool', fi: 'Yksityinen uima-allas' } },
  { group: 'pool', match: ['Outdoor pool', 'Swimming pool', 'Communal pool'], t: { en: 'Pool', pt: 'Piscina', es: 'Piscina', fr: 'Piscine', de: 'Pool', it: 'Piscina', nl: 'Zwembad', sv: 'Pool', fi: 'Uima-allas' } },
  { match: ['Sea view'], t: { en: 'Sea view', pt: 'Vista mar', es: 'Vistas al mar', fr: 'Vue mer', de: 'Meerblick', it: 'Vista mare', nl: 'Zeezicht', sv: 'Havsutsikt', fi: 'Merinäköala' } },
  { match: ['Hot tub'], t: { en: 'Hot tub', pt: 'Jacuzzi', es: 'Jacuzzi', fr: 'Jacuzzi', de: 'Whirlpool', it: 'Jacuzzi', nl: 'Jacuzzi', sv: 'Bubbelpool', fi: 'Poreallas' } },
  { match: ['Sauna'], t: { en: 'Sauna', pt: 'Sauna', es: 'Sauna', fr: 'Sauna', de: 'Sauna', it: 'Sauna', nl: 'Sauna', sv: 'Bastu', fi: 'Sauna' } },
  { match: ['Beach access', 'Near Ocean', 'Beachfront'], t: { en: 'Near the beach', pt: 'Perto da praia', es: 'Cerca de la playa', fr: 'Près de la plage', de: 'Strandnah', it: 'Vicino alla spiaggia', nl: 'Dicht bij het strand', sv: 'Nära stranden', fi: 'Lähellä rantaa' } },
  { match: ['Gym'], t: { en: 'Gym', pt: 'Ginásio', es: 'Gimnasio', fr: 'Salle de sport', de: 'Fitnessraum', it: 'Palestra', nl: 'Fitnessruimte', sv: 'Gym', fi: 'Kuntosali' } },
  { match: ['Indoor fireplace'], t: { en: 'Fireplace', pt: 'Lareira', es: 'Chimenea', fr: 'Cheminée', de: 'Kamin', it: 'Camino', nl: 'Open haard', sv: 'Öppen spis', fi: 'Takka' } },
  { match: ['BBQ grill'], t: { en: 'BBQ', pt: 'Churrasqueira', es: 'Barbacoa', fr: 'Barbecue', de: 'Grill', it: 'Barbecue', nl: 'Barbecue', sv: 'Grill', fi: 'Grilli' } },
  { match: ['Garden or backyard'], t: { en: 'Garden', pt: 'Jardim', es: 'Jardín', fr: 'Jardin', de: 'Garten', it: 'Giardino', nl: 'Tuin', sv: 'Trädgård', fi: 'Puutarha' } },
];

function amenityList(p) {
  const a = p.amenities;
  return Array.isArray(a) ? a : (a?.property ?? []);
}

function adDescription(p, locale, localizedDescription) {
  const c = COPY[locale];
  const parts = [];
  if (p.bedrooms > 0) parts.push(`${p.bedrooms} ${c.bedroom[p.bedrooms === 1 ? 0 : 1]}`);
  else parts.push(c.studio);
  if (p.maxGuests) parts.push(c.guests(p.maxGuests));
  const amenities = new Set(amenityList(p));
  let picked = 0;
  const usedGroups = new Set();
  for (const h of HIGHLIGHTS) {
    if (picked >= 2) break;
    if (h.group && usedGroups.has(h.group)) continue;
    if (h.match.some(m => amenities.has(m))) {
      parts.push(h.t[locale]);
      picked++;
      if (h.group) usedGroups.add(h.group);
    }
  }
  const place = [p.locality, p.address?.state].filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
  let out = parts.join(' · ') + (place ? ` — ${place}` : '') + '.';
  const lead = cleanText(localizedDescription || p.description || p.tagline);
  const specOnly = out;
  for (const sentence of lead.split(/(?<=[.!?])\s+/)) {
    if (out.length + sentence.length + 1 > AD_MAX) break;
    out += ' ' + sentence;
  }
  // first sentence longer than the budget: hard-truncate rather than
  // shipping a bare spec line
  if (out === specOnly && lead) out += ' ' + cleanText(lead, AD_MAX - out.length - 1);
  return out;
}
function propertyUrl(locale, slug) {
  const qs = 'utm_source=meta&utm_medium=paid_social&utm_campaign=catalog';
  return `${SITE}/${locale}/homes/${slug}?${qs}`;
}

// ---------- production check ----------
// Ads must never link to a 404. Local dev data can be ahead of production
// (new houses, pending deploys), so by default we keep only properties whose
// page exists in the live sitemap. Use --no-prod-check to skip (e.g. right
// after a deploy, before the sitemap check matters).
async function fetchProdSlugs() {
  if (process.argv.includes('--no-prod-check')) return null;
  try {
    const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
    const slugs = new Set(
      [...xml.matchAll(/<loc>https:\/\/www\.portugalactive\.com\/en\/homes\/([^<]+)<\/loc>/g)].map(m => m[1])
    );
    if (!slugs.size) throw new Error('no home URLs found in sitemap');
    return slugs;
  } catch (e) {
    console.warn(`prod sitemap check unavailable (${e.message}); including all properties`);
    return null;
  }
}

// ---------- build ----------
const coords = loadCoords();
const prodSlugs = await fetchProdSlugs();
const properties = readData('properties.json');
if (!properties) {
  console.error('could not read properties.json from origin/main — run `git fetch origin main` or use --local');
  process.exit(1);
}
const { parentName, childUnits } = parsePropertyGroups();
const live = properties.filter(p =>
  p.isActive !== false && p.guestyId && !/test/i.test(p.name)
  && !EXCLUDE.has(p.guestyId) && !childUnits.has(p.guestyId)
);

// Same "recommended" order as the site's PLP (CURATED_PROPERTY_ORDER, then
// sortOrder) — no delivery impact on Meta's side, but keeps Commerce Manager
// review and manual creative picks familiar.
const curatedRank = new Map();
{
  const src = readText('client/src/config/propertyOrder.ts') ?? '';
  const arr = src.match(/CURATED_PROPERTY_ORDER[\s\S]*?=\s*\[([\s\S]*?)\]/)?.[1] ?? '';
  let i = 0;
  for (const [, id] of arr.matchAll(/'([a-f0-9]{24})'/g)) curatedRank.set(id, i++);
}
live.sort((a, b) => {
  const ra = curatedRank.get(a.guestyId) ?? 1e9;
  const rb = curatedRank.get(b.guestyId) ?? 1e9;
  if (ra !== rb) return ra - rb;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
});

// The name shown on the site: group name for multi-unit parents, otherwise
// the listing name minus the redundant brand suffix (brand has its own field
// and ad overlays truncate long names).
function siteName(p) {
  return parentName.get(p.guestyId)
    ?? p.name.replace(/\s*[|–-]?\s*by Portugal Active/i, '').replace(/\s{2,}/g, ' ').trim();
}

const skipped = [];
const mainRows = [];
const included = new Set();
for (const p of live) {
  const c = (p.address?.lat && p.address?.lng)
    ? { lat: p.address.lat, lng: p.address.lng }
    : coords[p.guestyId];
  if (!c) { skipped.push(`${p.name} (${p.guestyId}) — no coordinates`); continue; }
  if (prodSlugs && !prodSlugs.has(p.slug)) {
    skipped.push(`${p.name} — not live in production yet (re-run after deploy)`);
    continue;
  }
  included.add(p.guestyId);
  const row = {
    hotel_id: p.guestyId,
    name: cleanText(siteName(p), 200),
    description: adDescription(p, 'en', null),
    brand: BRAND,
    url: propertyUrl('en', p.slug),
    // Meta requires "500.00 EUR" — cost with two decimals, space, ISO code
    base_price: `${Number(p.priceFrom || p.pricePerNight).toFixed(2)} EUR`,
    'address.addr1': p.address?.street || '',
    'address.city': p.address?.city || p.locality || '',
    'address.region': p.address?.state || '',
    'address.postal_code': p.address?.zipcode || '',
    'address.country': 'Portugal',
    latitude: c.lat,
    longitude: c.lng,
    // plain string per spec, max 20 chars
    'neighborhood[0]': cleanText(p.locality || p.address?.city || '', 20),
  };
  (p.images || []).slice(0, MAX_IMAGES).forEach((img, i) => {
    row[`image[${i}].url`] = typeof img === 'string' ? img : img?.url || '';
  });
  if (p.averageRating && (p.reviewCount || 0) >= MIN_REVIEWS_FOR_RATING) {
    row['guest_rating[0].score'] = p.averageRating;
    row['guest_rating[0].max_score'] = 5;
    row['guest_rating[0].number_of_reviewers'] = p.reviewCount;
    row['guest_rating[0].rating_system'] = 'portugalactive';
  }
  mainRows.push(row);
}

const imageCols = [];
for (let i = 0; i < MAX_IMAGES; i++) imageCols.push(`image[${i}].url`);
const MAIN_HEADER = [
  'hotel_id', 'name', 'description', 'brand', 'url', ...imageCols, 'base_price',
  'address.addr1', 'address.city', 'address.region', 'address.postal_code', 'address.country',
  'latitude', 'longitude', 'neighborhood[0]',
  'guest_rating[0].score', 'guest_rating[0].max_score',
  'guest_rating[0].number_of_reviewers', 'guest_rating[0].rating_system',
];

fs.mkdirSync(OUT_DIR, { recursive: true });

if (process.argv.includes('--hotels')) {
  writeCsv(path.join(OUT_DIR, 'hotels.csv'), MAIN_HEADER, mainRows);
  console.log(`hotels.csv: ${mainRows.length} properties`);

  const LANG_HEADER = ['override', 'hotel_id', 'description', 'url'];
  for (const [loc, metaLoc] of Object.entries(HOTEL_LOCALES)) {
    const i18n = readData(`properties.i18n/${loc}.json`);
    if (!i18n) continue;
    const rows = [];
    for (const p of live) {
      if (!included.has(p.guestyId)) continue; // keep in sync with main feed
      const tr = i18n[p.guestyId];
      rows.push({
        override: metaLoc,
        hotel_id: p.guestyId,
        // spec line is always localized; the narrative lead falls back to
        // English for the few houses without a translation yet
        description: adDescription(p, loc, tr?.description),
        url: propertyUrl(loc, p.slug),
      });
    }
    writeCsv(path.join(OUT_DIR, `hotels-lang-${loc}.csv`), LANG_HEADER, rows);
    console.log(`hotels-lang-${loc}.csv: ${rows.length} overrides`);
  }
}

// ---------- product-format feeds (e-commerce catalog / Advantage+ Sales) ----------
// Same houses, Meta PRODUCT feed columns. Used when the Commerce Manager
// catalog is the e-commerce type rather than Travel > Hotels. content_ids in
// pixel events must match `id` (the guestyId — same as hotel_id).
const PRODUCT_HEADER = [
  'id', 'title', 'description', 'availability', 'condition', 'price', 'link',
  'image_link', 'additional_image_link', 'brand',
  'custom_label_0', 'custom_label_1', 'custom_label_2', 'custom_label_3',
];
// Tier/segment labels so marketing can build product sets in Commerce
// Manager (filter: custom_label_N = value) without touching the feed.
function priceBand(n) {
  if (n >= 300) return 'premium-300plus';
  if (n >= 150) return 'mid-150-300';
  return 'entry-under-150';
}
function capacityBand(n) {
  if (n >= 10) return 'groups-10plus';
  if (n >= 5) return 'family-5-9';
  return 'couples-2-4';
}
const byId = new Map(live.map(p => [p.guestyId, p]));
const productRows = mainRows.map(r => {
  const p = byId.get(r.hotel_id);
  const extra = [];
  for (let i = 1; i < MAX_IMAGES; i++) if (r[`image[${i}].url`]) extra.push(r[`image[${i}].url`]);
  return {
    id: r.hotel_id,
    title: r.name,
    description: r.description,
    availability: 'in stock',
    condition: 'new',
    price: r.base_price,
    link: r.url,
    image_link: r['image[0].url'],
    additional_image_link: extra.join(','), // up to 20, comma-separated
    brand: BRAND,
    custom_label_0: r['neighborhood[0]'],                      // locality
    custom_label_1: priceBand(Number(p.priceFrom || p.pricePerNight)), // price tier
    custom_label_2: (p.propertyType || '').toLowerCase(),      // villa/house/apartment
    custom_label_3: capacityBand(p.maxGuests || 0),            // audience size
  };
});
writeCsv(path.join(OUT_DIR, 'products.csv'), PRODUCT_HEADER, productRows);
console.log(`products.csv: ${productRows.length} products`);

const PRODUCT_LANG_HEADER = ['override', 'id', 'description', 'link'];
for (const [loc, metaLoc] of Object.entries(PRODUCT_LOCALES)) {
  const i18n = readData(`properties.i18n/${loc}.json`);
  if (!i18n) continue;
  const rows = [];
  for (const p of live) {
    if (!included.has(p.guestyId)) continue;
    rows.push({
      override: metaLoc,
      id: p.guestyId,
      description: adDescription(p, loc, i18n[p.guestyId]?.description),
      link: propertyUrl(loc, p.slug),
    });
  }
  writeCsv(path.join(OUT_DIR, `products-lang-${loc}.csv`), PRODUCT_LANG_HEADER, rows);
  console.log(`products-lang-${loc}.csv: ${rows.length} overrides`);
}

if (skipped.length) {
  console.warn(`\nSkipped ${skipped.length} live properties:`);
  for (const s of skipped) console.warn(`  - ${s}`);
}
