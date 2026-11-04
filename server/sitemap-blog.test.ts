import { describe, expect, it } from 'vitest';
import blog from '../client/src/data/blog.json';
import { articleSitemapLastmod } from './lib/sitemap-blog';

describe('Journal sitemap lastmod', () => {
  const refreshedGuides = [
    'complete-guide-north-portugal',
    'viana-do-castelo-guide',
    'when-to-visit-north-portugal',
    'surfing-minho-coast',
    'private-chef-portugal-villa',
  ];

  it.each(refreshedGuides)('reflects the review only in the updated editions of %s', (slug) => {
    const article = blog.articles.find((entry) => entry.slug === slug)!;
    for (const lang of ['en', 'pt']) {
      expect(articleSitemapLastmod(article, lang, '2026-11-04')).toBe(slug === 'viana-do-castelo-guide' ? '2026-11-04' : '2026-10-14');
    }
    for (const lang of ['fr', 'es', 'it', 'fi', 'de', 'nl', 'sv']) {
      expect(articleSitemapLastmod(article, lang, '2026-11-03')).toBe('2026-03-30');
    }
  });

  it('uses a review that applies to every edition, including regional locale codes', () => {
    expect(articleSitemapLastmod({ publishDate: '2026-03-30', modifiedDate: '2026-10-14' }, 'pt-PT', '2026-11-03')).toBe('2026-10-14');
  });

  it('retains the fallback for an undated article', () => {
    expect(articleSitemapLastmod({}, 'en', '2026-11-03')).toBe('2026-11-03');
  });
});
