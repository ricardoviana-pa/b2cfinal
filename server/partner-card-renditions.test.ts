/**
 * Revisão 2 do PR #175 (perf-strip-full-size-partner-photos). The partner
 * homes' photos are static /homes/photos files; a card drew the 1600 px cover
 * in a 272–358 px box with srcSet="" (guestySrcSet only knows Cloudinary).
 * The destination guides' strip puts two of those cards inside Chrome's
 * lazy-load margin: 363 KB (Algarve), 543 KB (Lisbon), 612 KB (Douro) on a
 * phone that never scrolled. Card-sized copies of each cover now sit next to
 * it (scripts/partner-card-renditions.py) and the cards get a srcset.
 */
import { Writable } from 'node:stream';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Router } from 'wouter';
import { describe, expect, it } from 'vitest';
import PropertyCard from '../client/src/components/property/PropertyCard';
import { cardPriority } from '../client/src/lib/listingImagePriority';
import { cardSrcSet, partnerCoverSrcSet } from '../client/src/lib/images';
import renditions from '../client/src/data/partner-card-renditions.json';
import partners from '../client/src/data/tripwix-properties.json';

(globalThis as any).React = React;

const PUBLIC = fileURLToPath(new URL('../client/public', import.meta.url));
const covers = renditions.covers as Record<string, number>;

/** Width and height of a .webp, from its header (VP8 / VP8L / VP8X). */
function webpSize(file: string): { width: number; height: number } {
  const b = fs.readFileSync(file);
  expect(b.toString('ascii', 0, 4) + b.toString('ascii', 8, 12), file).toBe('RIFFWEBP');
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === 'VP8L') { const bits = b.readUInt32LE(21); return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) }; }
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`${file}: unknown chunk ${chunk}`);
}

/** The candidate a browser takes for a slot: the smallest at least `pixels` wide, else the largest. */
function pick(srcSet: string, pixels: number): string {
  const candidates = srcSet.split(', ').map((c) => { const [url, w] = c.split(' '); return { url, w: parseInt(w, 10) }; }).sort((a, b) => a.w - b.w);
  return (candidates.find((c) => c.w >= pixels) ?? candidates[candidates.length - 1]).url;
}
const bytes = (url: string) => fs.statSync(`${PUBLIC}${url}`).size;

describe('card-sized copies of the partner covers', () => {
  it('every partner home’s card cover has them (run scripts/partner-card-renditions.py after an import moves a cover)', () => {
    const missing = (partners as Array<{ slug: string; images: string[] }>)
      .filter((p) => p.images?.[0]?.startsWith('/homes/photos/') && !covers[p.images[0]])
      .map((p) => `${p.slug}: ${p.images[0]}`);
    expect(missing).toEqual([]);
    expect(Object.keys(covers).length).toBeGreaterThanOrEqual(35);
  });

  it('each copy exists, is as wide as its name says, keeps the ratio and weighs less than the cover', () => {
    for (const [url, width] of Object.entries(covers)) {
      const original = webpSize(`${PUBLIC}${url}`);
      expect(original.width, url).toBe(width);
      for (const w of renditions.widths.filter((x) => x < width)) {
        const copy = `${url.replace(/\.webp$/, '')}-${w}w.webp`;
        const size = webpSize(`${PUBLIC}${copy}`);
        expect(size.width, copy).toBe(w);
        expect(Math.abs(size.height - (original.height * w) / original.width), copy).toBeLessThanOrEqual(1);
        expect(bytes(copy), copy).toBeLessThan(bytes(url));
      }
    }
  });
});

describe('the srcset of a card photo', () => {
  it('a partner cover lists its copies, then itself at its own width', () => {
    expect(partnerCoverSrcSet('/homes/photos/PT0009/01.webp')).toBe(
      '/homes/photos/PT0009/01-480w.webp 480w, /homes/photos/PT0009/01-800w.webp 800w, /homes/photos/PT0009/01-1080w.webp 1080w, /homes/photos/PT0009/01.webp 1600w',
    );
    expect(cardSrcSet('/homes/photos/PT0009/01.webp')).toBe(partnerCoverSrcSet('/homes/photos/PT0009/01.webp'));
  });

  it('a photo without copies keeps its single file; Guesty photos keep their Cloudinary widths', () => {
    expect(cardSrcSet('/homes/photos/PT0009/02.webp')).toBe('');
    expect(cardSrcSet('/hero/home-cliff-villa.webp')).toBe('');
    expect(cardSrcSet(undefined)).toBe('');
    expect(cardSrcSet('https://assets.guesty.com/image/upload/v1/production/a.jpg')).toBe(
      ['400', '640', '768', '1080'].map((w) => `https://assets.guesty.com/image/upload/w_${w},q_auto,f_auto/v1/production/a.jpg ${w}w`).join(', '),
    );
  });

  it('the Algarve strip’s first two covers on a phone: about a tenth of the bytes at 1.75×, under half at 3×', () => {
    // the strip's slot is 272 CSS px on a phone (DestinationHomesStrip imageSizes)
    const first = ['/homes/photos/PT0009/01.webp', '/homes/photos/PT0253/00.webp'];
    const before = first.reduce((s, url) => s + bytes(url), 0);
    const at = (dpr: number) => first.reduce((s, url) => s + bytes(pick(cardSrcSet(url), 272 * dpr)), 0);
    expect(before).toBeGreaterThan(350_000);
    expect(at(1.75)).toBeLessThan(before * 0.15);
    expect(at(3)).toBeLessThan(before * 0.5);
  });
});

describe('in the server HTML', () => {
  const home = (slug: string) => ({ ...(partners as any[]).find((p) => p.slug === slug), source: 'tripwix' });
  function render(children: React.ReactElement[]): Promise<string> {
    const tree = React.createElement(Router, { base: '/en', ssrPath: '/en/destinations/algarve' }, ...children);
    return new Promise((resolve, reject) => {
      let html = '';
      const sink = new Writable({ write(chunk, _e, cb) { html += chunk.toString(); cb(); } });
      sink.on('finish', () => resolve(html));
      const { pipe } = renderToPipeableStream(tree, { onAllReady: () => pipe(sink), onError: reject });
    });
  }

  it('a strip card with a partner cover ships the copies and the strip’s sizes', async () => {
    const html = await render([
      React.createElement(PropertyCard, { key: 'a', property: home('mirante-1'), imageSizes: '(max-width: 639px) 272px, (max-width: 767px) 300px, 30vw' }),
    ]);
    const img = html.match(/<img[^>]*PT0009\/01\.webp[^>]*>/)?.[0] ?? '';
    expect(img).toMatch(/srcSet="\/homes\/photos\/PT0009\/01-480w\.webp 480w, [^"]*01\.webp 1600w"/);
    expect(img).toMatch(/sizes="\(max-width: 639px\) 272px/);
    expect(img).toMatch(/loading="lazy"/);
  });

  it('as the listing’s first card, React preloads the same srcset (no second download)', async () => {
    const html = await render([
      React.createElement(PropertyCard, { key: 'a', property: home('villa-belvedere'), ...cardPriority('homes', 0) }),
    ]);
    const preload = (html.match(/<link rel="preload" as="image"[^>]*>/g) ?? []).find((l) => l.includes('PT0253'));
    expect(preload).toBeTruthy();
    expect(preload).toMatch(/imageSrcSet="\/homes\/photos\/PT0253\/00-480w\.webp 480w/);
  });
});
