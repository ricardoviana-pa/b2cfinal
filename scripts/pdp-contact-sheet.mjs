/**
 * A numbered contact sheet of each home's photos, to curate the page's grid
 * and the bedroom photos (client/src/config/propertyPhotos.ts). The numbers
 * are the catalogue indices the curation uses.
 *
 *   node scripts/pdp-contact-sheet.mjs                       # every home, 40 photos each
 *   node scripts/pdp-contact-sheet.mjs <guestyId> [...]      # only these homes, 60 photos each
 *   OUT=/tmp/sheet.html node scripts/pdp-contact-sheet.mjs
 *
 * Writes an HTML file (default: exports/pdp-contact-sheet.html — gitignored
 * folder) that loads the thumbnails from the Guesty CDN; open it in a
 * browser. Reads client/src/data/properties.json, nothing else.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = new URL('..', import.meta.url);
const props = JSON.parse(fs.readFileSync(new URL('client/src/data/properties.json', root), 'utf8'));
const wanted = new Set(process.argv.slice(2));
const homes = props.filter((p) => p.isActive !== false && (!wanted.size || wanted.has(p.guestyId)));
const perHome = wanted.size ? 60 : 40;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const thumb = (u) => (typeof u === 'string' && u.includes('assets.guesty.com/image/upload/') && !/\/image\/upload\/[a-z]{1,3}_/.test(u)
  ? u.replace('/image/upload/', '/image/upload/w_320,q_auto,f_auto/')
  : u);

let html = `<!doctype html><meta charset="utf-8"><title>PDP contact sheet</title>
<style>body{font-family:system-ui;margin:10px;background:#fff}h2{font-size:14px;margin:14px 0 4px}
.g{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}.g div{position:relative;aspect-ratio:4/3;background:#eee}
.g img{width:100%;height:100%;object-fit:cover;display:block}
.g span{position:absolute;left:2px;top:2px;background:rgba(0,0,0,.75);color:#fff;font:700 14px/1 system-ui;padding:3px 6px;border-radius:3px}
.rooms{font-size:12px;color:#555;margin:0 0 4px}</style>`;
for (const p of homes) {
  const imgs = (p.images || []).slice(0, perHome);
  const rooms = (p.rooms || [])
    .map((r, i) => `B${i + 1} ${(r.beds || []).map((b) => `${b.quantity} ${String(b.type).toLowerCase().replace('_bed', '')}`).join('+')}`)
    .join(' · ');
  html += `<section id="${esc(p.guestyId)}"><h2>${esc(p.name)} — ${esc(p.slug)} — ${esc(p.guestyId)} — ${(p.images || []).length} photos</h2>`;
  html += `<p class="rooms">${esc(rooms)}</p><div class="g">`;
  html += imgs.map((u, i) => `<div><img loading="lazy" src="${esc(thumb(u))}"><span>${i}</span></div>`).join('');
  html += '</div></section>';
}
const out = process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'exports', 'pdp-contact-sheet.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log(`${homes.length} homes → ${out}`);
