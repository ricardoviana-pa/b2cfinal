/* ==========================================================================
   The public address of a partner home's photos (auditoria de 14 nov 2026,
   segunda ronda técnica).

   The photos sit in client/public/homes/photos/<supplier reference>/, and
   that folder name was in every photo URL the site published. The files stay
   where they are; the site now publishes /homes/photos/<slug>/<file> and the
   server maps it back (server/lib/partnerPhotos.ts). These tests check that
   every published photo is still a file that is served, that the old
   addresses still work, and that the reference is in nothing the browser
   gets.
   ========================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PARTNER_PHOTO_ROOT, isPublicPhotoFolder, partnerPhotoAlias, publicPhotoUrl } from './lib/partnerPhotos';
import { getPropertiesForSite, partnerPhotoFolder, __testing as store } from './services/properties-store';
import { serveStatic } from './_core/vite';
import { isPartnerHome } from '../shared/partnerHome';
import raw from '../client/src/data/tripwix-properties.json';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'client/public');
const partners = raw as Array<{ slug: string; supplierReference: string; images: string[] }>;
const references = partners.map((p) => p.supplierReference);

describe('publicPhotoUrl', () => {
  it('swaps the folder on disk for the public one, and nothing else', () => {
    expect(publicPhotoUrl('/homes/photos/PT0009/00.webp', 'PT0009', 'mirante-1')).toBe('/homes/photos/mirante-1/00.webp');
    expect(publicPhotoUrl('/homes/photos/PT0009/01-480w.webp', 'PT0009', 'mirante-1')).toBe('/homes/photos/mirante-1/01-480w.webp');
    // Another home's folder, another place, another host: untouched.
    expect(publicPhotoUrl('/homes/photos/PT00090/00.webp', 'PT0009', 'mirante-1')).toBe('/homes/photos/PT00090/00.webp');
    expect(publicPhotoUrl('/hero/PT0009/00.webp', 'PT0009', 'mirante-1')).toBe('/hero/PT0009/00.webp');
    expect(publicPhotoUrl('https://cdn.example/homes/photos/PT0009/00.webp', 'PT0009', 'mirante-1')).toBe('https://cdn.example/homes/photos/PT0009/00.webp');
  });

  it('leaves the URL alone without a folder to swap, or with a public folder that is not a slug', () => {
    expect(publicPhotoUrl('/homes/photos/PT0009/00.webp', '', 'mirante-1')).toBe('/homes/photos/PT0009/00.webp');
    expect(publicPhotoUrl('/homes/photos/PT0009/00.webp', 'PT0009', '')).toBe('/homes/photos/PT0009/00.webp');
    expect(publicPhotoUrl('/homes/photos/PT0009/00.webp', 'PT0009', '../etc')).toBe('/homes/photos/PT0009/00.webp');
    expect(publicPhotoUrl(null, 'PT0009', 'mirante-1')).toBeNull();
    expect(publicPhotoUrl({ url: 'x' }, 'PT0009', 'mirante-1')).toEqual({ url: 'x' });
  });

  it('a public folder is a slug; a supplier reference never is one', () => {
    for (const ok of ['mirante-1', 'casa-de-caiz', '4-serras', 'a']) expect(isPublicPhotoFolder(ok), ok).toBe(true);
    for (const no of ['PT0009', 'Mirante', 'mirante_1', 'mirante--1', '-mirante', 'mirante-', '..', '', 'a/b', 'a.b']) expect(isPublicPhotoFolder(no), no).toBe(false);
    for (const r of references) expect(isPublicPhotoFolder(r), r).toBe(false);
    expect(isPublicPhotoFolder(undefined)).toBe(false);
  });
});

describe('the folder on disk behind a public folder (server only)', () => {
  afterEach(() => { vi.unstubAllEnvs(); store.reset(); });

  it('knows every partner home by its slug', async () => {
    expect(partners).toHaveLength(35);
    for (const p of partners) expect(await partnerPhotoFolder(p.slug), p.slug).toBe(p.supplierReference);
    expect(await partnerPhotoFolder('mirante-1')).toBe('PT0009');
  });

  it('answers null for anything that is not a partner home’s folder', async () => {
    for (const folder of ['zz-not-a-home', 'PT0009', 'photos', '', '..', 'mirante-1/..', 'Mirante-1']) {
      expect(await partnerPhotoFolder(folder), folder).toBeNull();
    }
  });

  it('keeps answering with the partner inventory switched off: destination covers and Journal photos use these addresses', async () => {
    vi.stubEnv('TRIPWIX_INVENTORY', '0');
    store.reset();
    expect((await getPropertiesForSite()).filter(isPartnerHome)).toHaveLength(0);
    expect(await partnerPhotoFolder('quinta-da-lameirinha')).toBe('PT0273');
  });

  it('answers null, without throwing, when the data file is missing', async () => {
    const prev = store.setPaths({ tripwix: path.join(os.tmpdir(), 'pa-no-such-partner-file.json') });
    try {
      expect(await partnerPhotoFolder('mirante-1')).toBeNull();
    } finally {
      store.setPaths(prev);
    }
  });
});

describe('every photo the site publishes for a partner home is a file on disk', () => {
  it('all of them, through the same lookup the server uses', async () => {
    const published = (await getPropertiesForSite()).filter(isPartnerHome) as Array<{ slug: string; images: string[] }>;
    expect(published).toHaveLength(partners.filter((p: any) => p.isActive !== false).length);
    let checked = 0;
    const missing: string[] = [];
    for (const home of published) {
      expect(home.images.length, home.slug).toBeGreaterThan(0);
      for (const url of home.images) {
        const m = url.match(/^\/homes\/photos\/([^/]+)\/([^/]+)$/);
        expect(m, url).toBeTruthy();
        expect(m![1], url).toBe(home.slug);
        const folder = await partnerPhotoFolder(m![1]);
        if (!folder || !fs.existsSync(path.join(PUBLIC, 'homes/photos', folder, m![2]))) missing.push(url);
        checked++;
      }
    }
    expect(missing).toEqual([]);
    expect(checked).toBe(partners.reduce((n, p) => n + p.images.length, 0));
  });

  it('the destination covers and the Journal photos that point at a partner home’s folder too', async () => {
    const files = ['client/src/data/destinations.json', 'client/src/data/blog.i18n/pt.json', 'client/src/data/blog.i18n/es.json', 'client/src/data/blog.json'];
    let checked = 0;
    for (const f of files) {
      const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
      for (const m of text.matchAll(/\/homes\/photos\/([^/"\\)\s]+)\/([^/"\\)\s]+\.webp)/g)) {
        const folder = await partnerPhotoFolder(m[1]);
        expect(folder, `${f}: ${m[0]}`).toBeTruthy();
        expect(fs.existsSync(path.join(PUBLIC, 'homes/photos', folder!, m[2])), `${f}: ${m[0]}`).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(10);
  });
});

describe('what the browser is sent carries no supplier reference', () => {
  function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : files(p);
      return /\.(tsx?|json|css|html)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
  }
  /** Code only: comments are not shipped (the bundler strips them). */
  const shipped = (file: string) => {
    const text = fs.readFileSync(file, 'utf8');
    return /\.tsx?$/.test(file) ? text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1') : text;
  };

  it('no client or shared file names a home by the supplier’s reference', () => {
    // The two catalogue files are read by the server only; no page may bundle
    // them (server/partner-public-record.test.ts checks that).
    const serverOnly = new Set(['client/src/data/tripwix-properties.json', 'client/src/data/properties.json'].map((f) => path.join(ROOT, f)));
    const offenders = [path.join(ROOT, 'client/src'), path.join(ROOT, 'shared'), path.join(ROOT, 'client/index.html')]
      .flatMap((p) => (fs.statSync(p).isDirectory() ? files(p) : [p]))
      .filter((f) => !serverOnly.has(f))
      .filter((f) => { const text = shipped(f); return references.some((r) => text.includes(r)); })
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('the homepage strip lists partner homes by their public id', () => {
    const order = fs.readFileSync(path.join(ROOT, 'client/src/config/propertyOrder.ts'), 'utf8');
    const keys = [...order.matchAll(/'(partner-[^']+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThanOrEqual(6);
    const slugs = new Set(partners.map((p) => p.slug));
    for (const key of keys) expect(slugs.has(key.replace(/^partner-/, '')), key).toBe(true);
  });
});

/* ── Served for real: the alias in front of express.static ───────────────── */
describe('served by the site', () => {
  let server: import('node:http').Server;
  let base = '';
  let tmp = '';
  const get = (p: string, init?: RequestInit) => fetch(base + p, { redirect: 'manual', ...init });

  beforeAll(async () => {
    // A small build: the shell and one partner home's folder, named as on disk.
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-photos-'));
    const pub = path.join(tmp, 'public');
    fs.mkdirSync(path.join(pub, 'homes/photos/PT0009'), { recursive: true });
    fs.writeFileSync(path.join(pub, 'index.html'), fs.readFileSync(path.join(ROOT, 'client/index.html'), 'utf8').replace('<script type="module" src="/src/main.tsx"></script>', ''));
    for (const f of ['00.webp', '01.webp', '01-480w.webp']) fs.copyFileSync(path.join(PUBLIC, 'homes/photos/PT0009', f), path.join(pub, 'homes/photos/PT0009', f));
    fs.writeFileSync(path.join(pub, 'homes/photos/x.webp'), 'img');
    const app = express();
    serveStatic(app, { distPath: pub });
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('the public address answers with the file, and with the headers of any other static photo', async () => {
    const file = fs.readFileSync(path.join(PUBLIC, 'homes/photos/PT0009/00.webp'));
    const res = await get('/homes/photos/mirante-1/00.webp');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(res.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(Buffer.from(await res.arrayBuffer()).equals(file)).toBe(true);
    // The card-sized copy of the cover, and a query string (cache busters) too.
    expect((await get('/homes/photos/mirante-1/01-480w.webp')).status).toBe(200);
    expect((await get('/homes/photos/mirante-1/00.webp?v=2')).status).toBe(200);
    const head = await get('/homes/photos/mirante-1/00.webp', { method: 'HEAD' });
    expect(head.status).toBe(200);
    expect(head.headers.get('content-length')).toBe(String(file.length));
  });

  it('the old address still answers: emails already sent, cached pages, tabs opened before the deploy', async () => {
    const old = await get('/homes/photos/PT0009/00.webp');
    expect(old.status).toBe(200);
    expect(old.headers.get('content-type')).toBe('image/webp');
    const now = await get('/homes/photos/mirante-1/00.webp');
    expect(Buffer.from(await old.arrayBuffer()).equals(Buffer.from(await now.arrayBuffer()))).toBe(true);
    // A file directly under /homes/photos is not touched either.
    expect(await (await get('/homes/photos/x.webp')).text()).toBe('img');
  });

  it('a photo that does not exist is a 404, under either kind of folder', async () => {
    for (const p of ['/homes/photos/mirante-1/99.webp', '/homes/photos/zz-not-a-home/00.webp', '/homes/photos/PT9999/00.webp', '/homes/photos/mirante-1/..%2F..%2Findex.html']) {
      expect((await get(p)).status, p).toBe(404);
    }
  });

  it('the home’s page is not mistaken for its photo folder', async () => {
    const page = await get('/en/homes/mirante-1');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toMatch(/^text\/html/);
  });
});

describe('the alias on its own', () => {
  const run = async (req: any, lookup = async (f: string) => (f === 'mirante-1' ? 'PT0009' : null)) => {
    const next = vi.fn();
    partnerPhotoAlias(lookup)(req, {} as any, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(next).toHaveBeenCalledWith();
    return req.url as string;
  };

  it('rewrites only GET and HEAD requests for a known public folder', async () => {
    expect(await run({ method: 'GET', url: '/mirante-1/00.webp' })).toBe('/PT0009/00.webp');
    expect(await run({ method: 'HEAD', url: '/mirante-1/00.webp?v=1' })).toBe('/PT0009/00.webp?v=1');
    expect(await run({ method: 'POST', url: '/mirante-1/00.webp' })).toBe('/mirante-1/00.webp');
    expect(await run({ method: 'GET', url: '/unknown-home/00.webp' })).toBe('/unknown-home/00.webp');
    expect(await run({ method: 'GET', url: '/PT0009/00.webp' })).toBe('/PT0009/00.webp');
    expect(await run({ method: 'GET', url: '/x.webp' })).toBe('/x.webp');
    expect(await run({ method: 'GET', url: '/mirante-1/a/b.webp' })).toBe('/mirante-1/a/b.webp');
  });

  it('a lookup that fails lets the request through untouched', async () => {
    expect(await run({ method: 'GET', url: '/mirante-1/00.webp' }, async () => { throw new Error('catalogue unreadable'); })).toBe('/mirante-1/00.webp');
  });

  it('the root it is mounted on', () => {
    expect(PARTNER_PHOTO_ROOT).toBe('/homes/photos/');
    const vite = fs.readFileSync(path.join(ROOT, 'server/_core/vite.ts'), 'utf8');
    const prod = vite.slice(vite.indexOf('export function serveStatic'));
    expect(prod.indexOf('app.use("/homes/photos", partnerPhotoAlias(partnerPhotoFolder));')).toBeGreaterThan(0);
    expect(prod.indexOf('app.use("/homes/photos", partnerPhotoAlias(partnerPhotoFolder));')).toBeLessThan(prod.indexOf('app.use(express.static(distPath, {'));
  });
});
