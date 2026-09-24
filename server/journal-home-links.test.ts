import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { redirectTarget } from './lib/redirects';

const root = process.cwd();
const read = (p: string) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const list = (d: any) => (Array.isArray(d) ? d : d.properties ?? []);
const live = new Set<string>([
  ...list(read('client/src/data/properties.json')).map((p: any) => p.slug),
  ...list(read('client/src/data/tripwix-properties.json')).map((p: any) => p.slug).filter(Boolean),
]);
const files = ['client/src/data/blog.json', ...['pt', 'es', 'fr', 'de', 'nl', 'it', 'fi', 'sv'].map((l) => `client/src/data/blog.i18n/${l}.json`)];

describe('Journal links to homes', () => {
  it.each(files)('%s links only to homes that exist', (file) => {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const broken = [...text.matchAll(/\/homes\/([a-z0-9-]+)/g)].map((m) => m[1]).filter((slug) => !live.has(slug));
    expect([...new Set(broken)]).toEqual([]);
  });

  it('redirects a short home name to the current page, in the same language', () => {
    expect(redirectTarget('/pt/homes/cabedelo-beach-lodge')).toBe('/pt/homes/portugal-active-cabedelo-beach-lodge-heated-pool-16f0b2');
    expect(redirectTarget('/es/homes/eben-lodge')).toBe('/es/homes/portugal-active-eben-lodge-heated-pool-10ecfe');
  });

  it('leaves current home pages alone', () => {
    expect(redirectTarget('/pt/homes/portugal-active-cabedelo-beach-lodge-heated-pool-16f0b2')).toBeNull();
    expect(redirectTarget('/en/homes/not-a-known-home')).toBeNull();
  });
});
