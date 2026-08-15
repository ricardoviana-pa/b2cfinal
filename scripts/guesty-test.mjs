/**
 * GUESTY API — TEST & SYNC SCRIPT
 * ================================================
 * Credenciais: OAuth2 (Client ID + Client Secret)
 * Corre: node scripts/guesty-test.mjs
 * ================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Config ─────────────────────────────────────
// Credentials come from the environment — never hardcode secrets in the repo.
// Set GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET before running, e.g.:
//   GUESTY_CLIENT_ID=… GUESTY_CLIENT_SECRET=… node scripts/guesty-test.mjs
const CLIENT_ID     = process.env.GUESTY_CLIENT_ID     || '';
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET || '';
const BASE_URL      = process.env.GUESTY_BASE_URL      || 'https://open-api.guesty.com';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('✗ Set GUESTY_CLIENT_ID and GUESTY_CLIENT_SECRET in the environment first.');
  process.exit(1);
}

// ── Auth ────────────────────────────────────────
async function getToken() {
  console.log('🔑  A obter token OAuth2...');
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

  if (!res.ok) {
    const err = await res.text();
    console.error('❌  Auth falhou:', res.status, err);
    process.exit(1);
  }

  const { access_token, token_type, expires_in } = await res.json();
  console.log(`✅  Token obtido! Expira em ${expires_in}s (${Math.round(expires_in/3600)}h)`);
  return access_token;
}

// ── Fetch helper ────────────────────────────────
async function gGet(token, endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/v1${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });

  return { status: res.status, ok: res.ok, data: res.ok ? await res.json() : await res.text() };
}

// ── Main ────────────────────────────────────────
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log(' GUESTY API — TESTE DE LIGAÇÃO');
  console.log('═'.repeat(60) + '\n');

  const token = await getToken();

  // 1. Fetch listings (primeira página)
  console.log('\n📦  A buscar listings...');
  const r = await gGet(token, '/listings', {
    limit: 100,
    fields: '_id title nickname publicDescription bedrooms bathrooms accommodates prices pictures picture address amenities tags active listed',
  });

  if (!r.ok) {
    console.error('❌  Erro ao buscar listings:', r.status, r.data);
    process.exit(1);
  }

  const listings = r.data?.results || r.data?.data || [];
  const total    = r.data?.count ?? r.data?.total ?? listings.length;

  console.log(`\n📊  Total no Guesty: ${total}`);
  console.log(`📊  Nesta página:    ${listings.length}\n`);

  if (listings.length === 0) {
    console.log('⚠️  Nenhum listing devolvido. Verifica permissões do token.');
    return;
  }

  // 2. Análise de completude
  const s = { title: 0, desc: 0, photos: 0, price: 0, beds: 0, amenities: 0, address: 0 };
  for (const l of listings) {
    if (l.title || l.nickname)                                  s.title++;
    if (l.publicDescription?.summary || l.publicDescription?.space) s.desc++;
    if (l.pictures?.length > 0 || l.picture?.thumbnail)        s.photos++;
    if (l.prices?.basePrice > 0)                               s.price++;
    if (l.bedrooms > 0)                                        s.beds++;
    if (l.amenities?.length > 0)                               s.amenities++;
    if (l.address?.city || l.address?.country)                 s.address++;
  }

  const n = listings.length;
  const pct = v => `${v}/${n} (${Math.round(v/n*100)}%)`;
  console.log('─'.repeat(50));
  console.log(' DADOS DISPONÍVEIS POR PROPRIEDADE');
  console.log('─'.repeat(50));
  console.log(`  Nome/título:   ${pct(s.title)}`);
  console.log(`  Descrição:     ${pct(s.desc)}`);
  console.log(`  Fotos:         ${pct(s.photos)}`);
  console.log(`  Preço base:    ${pct(s.price)}`);
  console.log(`  Quartos:       ${pct(s.beds)}`);
  console.log(`  Amenidades:    ${pct(s.amenities)}`);
  console.log(`  Cidade:        ${pct(s.address)}`);

  // 3. Lista completa
  console.log('\n─'.repeat(50) + '\n TODAS AS PROPRIEDADES\n' + '─'.repeat(50));
  listings.forEach((l, i) => {
    const name  = (l.title || l.nickname || l._id).substring(0, 45);
    const price = l.prices?.basePrice > 0 ? `€${l.prices.basePrice}` : '€0  ⚠️';
    const imgs  = l.pictures?.length ?? 0;
    const city  = l.address?.city || '—';
    console.log(`  ${String(i+1).padStart(3)}. ${name.padEnd(46)} ${price.padEnd(8)} ${imgs} fotos  ${city}`);
  });

  // 4. Detalhe do primeiro listing
  const s0 = listings[0];
  console.log('\n─'.repeat(50) + '\n DETALHE — 1.º LISTING\n' + '─'.repeat(50));
  console.log('  Guesty ID:    ', s0._id);
  console.log('  Nome:         ', s0.title || s0.nickname);
  console.log('  Quartos:      ', s0.bedrooms ?? '—');
  console.log('  Capacidade:   ', s0.accommodates ?? '—');
  console.log('  Preço base:   ', s0.prices?.basePrice ?? '—', '€/noite');
  console.log('  Fotos:        ', s0.pictures?.length ?? 0);
  console.log('  Amenidades:   ', s0.amenities?.length ?? 0);
  console.log('  Cidade:       ', s0.address?.city || '—');
  if (s0.pictures?.[0]) {
    console.log('  1ª foto:      ', s0.pictures[0].original || s0.pictures[0].large || '—');
  }
  if (s0.publicDescription?.summary) {
    console.log('  Descrição:    ', s0.publicDescription.summary.substring(0, 120) + '...');
  }

  // 5. Teste do calendário
  console.log('\n─'.repeat(50) + '\n TESTE DE CALENDÁRIO / DISPONIBILIDADE\n' + '─'.repeat(50));
  const cal = await gGet(token, `/listings/${s0._id}/calendar`, {
    startDate: '2025-06-01',
    endDate:   '2025-08-31',
  });
  console.log(`  Status: ${cal.status} ${cal.ok ? '✅' : '❌'}`);
  if (cal.ok) {
    const days = cal.data?.days || cal.data || [];
    if (Array.isArray(days) && days.length > 0) {
      console.log(`  Dias retornados: ${days.length}`);
      console.log('  Exemplo (1.º dia):', JSON.stringify(days[0]));
    }
  }

  // 6. Guardar raw data
  const outPath = path.join(ROOT, 'scripts', 'guesty-raw-data.json');
  fs.writeFileSync(outPath, JSON.stringify({ token_preview: token.substring(0,12)+'...', total, listings }, null, 2));
  console.log(`\n💾  Raw data guardada em scripts/guesty-raw-data.json`);

  console.log('\n' + '═'.repeat(60));
  console.log(' ✅  TESTE OK — corre agora:');
  console.log('    node scripts/guesty-sync.mjs --dry-run');
  console.log('═'.repeat(60) + '\n');
}

main().catch(e => { console.error('❌', e.message); process.exit(1); });
