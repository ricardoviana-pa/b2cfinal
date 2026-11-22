import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '../client/src/entry-server';

(globalThis as any).React = React;

describe('split Home preserves its initial server-rendered hero', () => {
  it.each(['en', 'pt'])('/%s exposes the responsive high-priority hero before hydration', async (lang) => {
    const { appHtml } = await render(`/${lang}`);
    const hero = appHtml.match(/<img\b[^>]*src="\/hero\/home-carcavelos-cover-1920\.webp"[^>]*>/)?.[0];
    expect(hero).toBeDefined();
    expect(hero).toContain('loading="eager"');
    expect(hero).toContain('fetchPriority="high"');
    expect(hero).toContain('srcSet="/hero/home-carcavelos-cover-768.webp 768w, /hero/home-carcavelos-cover-960.webp 960w,');
    expect(hero).toContain('sizes="100vw"');
    expect(appHtml).toMatch(/<link rel="preload" as="image"[^>]*imageSrcSet="\/hero\/home-carcavelos-cover-768\.webp[^>]*fetchPriority="high"/);
    expect(appHtml).toMatch(/<h1\b/);
    expect(appHtml).toContain(`href="/${lang}/homes"`);
  });
});
