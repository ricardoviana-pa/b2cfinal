// Warm the CloudFront/Cloudinary cache for the photo sizes the redesigned
// PDP grid requests (29 Oct 2026). One GET per URL: the CDN in front of
// assets.guesty.com ignores Accept (f_auto resolves to JPEG for everyone),
// so a single variant serves every browser.
import fs from 'node:fs';

const props = JSON.parse(fs.readFileSync(process.argv[2] || new URL('../client/src/data/properties.json', import.meta.url), 'utf8'));
// The curated order per home (client/src/config/propertyPhotos.ts): the grid
// shows those five first, and the bedroom cards their own photos.
const curation = JSON.parse(fs.readFileSync(new URL('../client/src/data/pdp-photos.json', import.meta.url), 'utf8'));
const WIDTHS_BY_INDEX = [
  [640, 828, 1080, 1440],        // hero: desktop big tile (46vw) + phone slide 1 (100vw)
  [400, 640, 828, 1080, 1440],   // tile 1 + phone slide 2 (eager)
  [400, 640, 828],
  [400, 640, 828],
  [400, 640, 828],
];
const ROOM_WIDTHS = [400, 640, 828];
const urls = [];
const transformable = (u) => typeof u === 'string' && u.includes('assets.guesty.com/image/upload/') && !/\/image\/upload\/[a-z]{1,3}_/.test(u);
const sized = (u, w) => u.replace('/image/upload/', `/image/upload/w_${w},q_auto,f_auto/`);
for (const p of props) {
  if (p.isActive === false || !Array.isArray(p.images)) continue;
  const cur = curation[p.guestyId] || {};
  const grid = Array.isArray(cur.grid) && cur.grid.length ? cur.grid.filter((i) => Number.isInteger(i) && i >= 0 && i < p.images.length) : [];
  const seen = new Set(grid);
  const ordered = [...grid.map((i) => p.images[i]), ...p.images.filter((_, i) => !seen.has(i))];
  ordered.slice(0, 5).forEach((u, i) => {
    if (!transformable(u)) return;
    for (const w of WIDTHS_BY_INDEX[i]) urls.push(sized(u, w));
  });
  for (const i of Array.isArray(cur.rooms) ? cur.rooms : []) {
    const u = Number.isInteger(i) ? p.images[i] : null;
    if (!transformable(u)) continue;
    for (const w of ROOM_WIDTHS) urls.push(sized(u, w));
  }
}
const unique = [...new Set(urls)];
console.log(`homes ${props.length}, urls ${unique.length}`);

const headers = {
  Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};
const stats = { hit: 0, miss: 0, other: 0, error: 0, bytes: 0 };
let next = 0;
async function worker() {
  while (next < unique.length) {
    const url = unique[next++];
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
        const buf = await res.arrayBuffer();
        stats.bytes += buf.byteLength;
        const xc = (res.headers.get('x-cache') || '').toLowerCase();
        if (!res.ok) { stats.other++; console.log(`HTTP ${res.status} ${url}`); }
        else if (xc.startsWith('hit')) stats.hit++;
        else if (xc.startsWith('miss')) stats.miss++;
        else stats.other++;
        break;
      } catch (e) {
        if (attempt === 1) { stats.error++; console.log(`ERR ${e.message} ${url}`); }
      }
    }
    const done = stats.hit + stats.miss + stats.other + stats.error;
    if (done % 100 === 0) console.log(`${done}/${unique.length} hit=${stats.hit} miss=${stats.miss} other=${stats.other} err=${stats.error} ${(stats.bytes / 1e6).toFixed(0)} MB`);
  }
}
const started = Date.now();
await Promise.all(Array.from({ length: 8 }, worker));
console.log(`DONE in ${((Date.now() - started) / 1000).toFixed(0)}s: ${unique.length} urls, hit(before)=${stats.hit} miss(generated now)=${stats.miss} other=${stats.other} err=${stats.error}, ${(stats.bytes / 1e6).toFixed(0)} MB`);
