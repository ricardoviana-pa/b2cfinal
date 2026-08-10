/**
 * GUESTY → PORTUGAL ACTIVE — SYNC SCRIPT
 * ================================================
 * Credenciais: OAuth2 (Client ID + Client Secret)
 * Corre: node scripts/guesty-sync.mjs
 *   ou:  node scripts/guesty-sync.mjs --dry-run
 * ================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const DRY_RUN   = process.argv.includes('--dry-run');

if (DRY_RUN) console.log('\n🔍  DRY RUN — não escreve nenhum ficheiro\n');

// ── OAuth2 ──────────────────────────────────────
const CLIENT_ID     = '0oatqaefykHn26o6u5d7';
const CLIENT_SECRET = 'uUmRAF8HyuSZkKrnmvRYqZ-tloZXdhfNopU1P8SjFArpVLDDML4KoQrtDr0Xaz5C';
const BASE_URL      = 'https://open-api.guesty.com';

async function getToken() {
  const res = await fetch(`${BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'open-api',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) { console.error('❌  Auth falhou:', res.status, await res.text()); process.exit(1); }
  const { access_token, expires_in } = await res.json();
  console.log(`🔑  Token obtido (expira em ${Math.round(expires_in/3600)}h)`);
  return access_token;
}

async function gGet(token, endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/v1${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  return { status: res.status, ok: res.ok, data: res.ok ? await res.json() : await res.text() };
}

// ── Destination mapping ─────────────────────────
// Ajusta as keywords conforme os nomes reais das cidades no Guesty
const DEST_MAP = [
  { kws: ['minho','viana','arcos','ponte de lima','caminha','moledo','esposende','cabedelo','carreço','ancora','gelfa','afife','montaria'], dest: 'minho' },
  { kws: ['porto','douro','gaia','matosinhos','espinho','aveiro','figueira','invicta','boavista'], dest: 'porto' },
  { kws: ['algarve','faro','lagos','albufeira','tavira','sagres','portimao','vilamoura','silves','loule','carvoeiro','armacao'], dest: 'algarve' },
  { kws: ['lisbon','lisboa','cascais','sintra','setubal','comporta','troia','melides','arrabida'], dest: 'lisbon' },
  { kws: ['alentejo','evora','beja','odemira','zambujeira','odeceixe'], dest: 'alentejo' },
];

function detectDest(listing) {
  const text = [
    listing.title, listing.nickname,
    listing.address?.city, listing.address?.state, listing.address?.country,
    listing.publicDescription?.summary,
    ...(listing.tags || []),
  ].filter(Boolean).join(' ').toLowerCase();

  for (const { kws, dest } of DEST_MAP) {
    if (kws.some(k => text.includes(k))) return dest;
  }
  return 'minho'; // fallback
}

function slugify(text) {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '').trim()
    .replace(/\s+/g, '-').replace(/-+/g, '-');
}

// ── Fetch all listings (paginated) ──────────────
async function fetchAll(token) {
  let all = [], skip = 0;
  const LIMIT = 25;
  const FIELDS = '_id title nickname publicDescription bedrooms bathrooms accommodates prices pictures picture address amenities tags active listed';

  while (true) {
    console.log(`  Página ${Math.floor(skip/LIMIT)+1}...`);
    const r = await gGet(token, '/listings', { limit: LIMIT, skip, fields: FIELDS });

    if (!r.ok) { console.error('❌  Erro:', r.status, r.data); break; }

    const page = r.data?.results || r.data?.data || [];
    if (!Array.isArray(page) || page.length === 0) break;

    all = [...all, ...page];
    if (page.length < LIMIT) break;
    skip += LIMIT;
  }
  return all;
}

// ── Map Guesty → PA schema ──────────────────────
function mapListing(l, idx, existingMap) {
  const photos = (l.pictures || [])
    .map(p => p.original || p.large || p.regular || p.thumbnail)
    .filter(Boolean).slice(0, 20);

  if (photos.length === 0 && l.picture?.original) photos.push(l.picture.original);

  const basePrice = l.prices?.basePrice || 0;
  const name = l.title || l.nickname || `Property ${l._id}`;
  const desc  = [l.publicDescription?.summary, l.publicDescription?.space, l.publicDescription?.access]
    .filter(Boolean).join('\n\n');
  const amenities = (l.amenities || []).slice(0, 30);
  const dest  = detectDest(l);
  const slug  = slugify(name);

  // Find existing record to preserve manual fields
  const existing = existingMap[l._id] || existingMap[slug];
  const KEEP = ['tagline', 'tier', 'sortOrder', 'whatsappMessage', 'isFeatured', 'categories'];
  const preserved = {};
  if (existing) {
    KEEP.forEach(f => {
      if (existing[f] != null && existing[f] !== '') preserved[f] = existing[f];
    });
  }

  return {
    id: idx + 1,
    slug,
    name,
    tagline: preserved.tagline || desc.split('.')[0]?.substring(0, 80) || '',
    description: desc,
    guestyId: l._id,
    guestyUrl: `https://app.guesty.com/listings/${l._id}`,
    destination: dest,
    region: l.address?.city || '',
    bedrooms: l.bedrooms || 0,
    bathrooms: l.bathrooms || 0,
    maxGuests: l.accommodates || 0,
    priceFrom: Math.round(basePrice),
    images: photos,
    amenities,
    categories: preserved.categories || [],
    tier: preserved.tier || 'select',
    sortOrder: preserved.sortOrder ?? idx,
    isActive: l.active !== false && l.listed !== false,
    isFeatured: preserved.isFeatured || false,
    whatsappMessage: preserved.whatsappMessage || `Hi, I'm interested in ${name}. Can you share availability and pricing?`,
    syncedAt: new Date().toISOString(),
  };
}

// ── Main ────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(` GUESTY → PORTUGAL ACTIVE — SYNC${DRY_RUN ? ' (DRY RUN)' : ''}`);
  console.log('═'.repeat(60) + '\n');

  const token = await getToken();

  console.log('\n📦  A buscar todos os listings...');
  const listings = await fetchAll(token);
  console.log(`✅  ${listings.length} listings encontrados\n`);

  if (!listings.length) { console.error('❌  Nenhum listing.'); process.exit(1); }

  // Load existing properties for field preservation
  const propPath = path.join(ROOT, 'client', 'src', 'data', 'properties.json');
  const existing = JSON.parse(fs.readFileSync(propPath, 'utf-8'));
  const existingMap = {};
  existing.forEach(p => {
    if (p.guestyId) existingMap[p.guestyId] = p;
    if (p.slug)     existingMap[p.slug] = p;
  });
  console.log(`📂  properties.json atual: ${existing.length} entradas`);

  // Map listings
  const merged = listings.map((l, i) => mapListing(l, i, existingMap));

  // Stats
  const withPhotos = merged.filter(p => p.images.length > 0).length;
  const withPrice  = merged.filter(p => p.priceFrom > 0).length;
  const withDesc   = merged.filter(p => p.description.length > 0).length;
  const byDest     = merged.reduce((acc, p) => { acc[p.destination] = (acc[p.destination]||0)+1; return acc; }, {});

  console.log('\n📊  RESULTADO:');
  console.log(`  Propriedades:  ${merged.length}`);
  console.log(`  Com fotos:     ${withPhotos}/${merged.length}`);
  console.log(`  Com preço:     ${withPrice}/${merged.length}`);
  console.log(`  Com descrição: ${withDesc}/${merged.length}`);
  console.log('\n  Por destino:');
  Object.entries(byDest).forEach(([d, n]) => console.log(`    ${d.padEnd(12)} ${n}`));

  console.log('\n📋  MAPEAMENTO:');
  merged.forEach(p => {
    const price = p.priceFrom > 0 ? `€${p.priceFrom}/noite` : '€0 ⚠️ ';
    console.log(`  ${p.name.substring(0,42).padEnd(43)} [${p.destination.padEnd(10)}] ${price.padEnd(12)} ${p.images.length} fotos`);
  });

  if (DRY_RUN) {
    console.log('\n🔍  DRY RUN — sem alterações. Remove --dry-run para aplicar.\n');
    return;
  }

  // Backup + write
  const backup = propPath.replace('.json', `.backup-${Date.now()}.json`);
  fs.copyFileSync(propPath, backup);
  console.log(`\n💾  Backup: ${path.basename(backup)}`);

  fs.writeFileSync(propPath, JSON.stringify(merged, null, 2));
  console.log(`✅  properties.json atualizado! (${merged.length} propriedades)`);

  // Report
  const reportPath = path.join(ROOT, 'scripts', 'guesty-sync-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    syncedAt: new Date().toISOString(), total: merged.length,
    withPhotos, withPrice, withDesc, byDest,
  }, null, 2));

  console.log('\n' + '═'.repeat(60));
  console.log(' ✅  SYNC CONCLUÍDA');
  console.log('═'.repeat(60));
  console.log('\n  Próximos passos:');
  console.log('  1. Verifica o mapeamento de destinos no properties.json');
  console.log('  2. Ajusta taglines e tiers manualmente');
  console.log('  3. npm run dev  →  verifica o resultado no browser\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
