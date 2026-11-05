import { describe, expect, it } from 'vitest';
import blog from '../client/src/data/blog.json';
import { articleSitemapLastmod, localizedArticleSitemapDates } from './lib/sitemap-blog';
import { getJournalArticle } from './services/journal';

describe('Journal sitemap lastmod', () => {
  const refreshedGuides = [
    'complete-guide-north-portugal',
    'viana-do-castelo-guide',
    'when-to-visit-north-portugal',
    'surfing-minho-coast',
    'private-chef-portugal-villa',
  ];

  it.each(refreshedGuides)('reflects the review only in the updated editions of %s', async (slug) => {
    const article = blog.articles.find((entry) => entry.slug === slug)!;
    for (const lang of ['en', 'pt']) {
      expect(articleSitemapLastmod(article, lang, '2026-11-04')).toBe(['viana-do-castelo-guide', 'complete-guide-north-portugal'].includes(slug) ? '2026-11-04' : '2026-10-14');
    }
    for (const lang of ['fr', 'es', 'it', 'fi', 'de', 'nl', 'sv']) {
      const localized = await getJournalArticle(slug, lang);
      expect(localized).not.toBeNull();
      expect(articleSitemapLastmod(localized!, lang, '2026-11-05')).toBe(
        ['viana-do-castelo-guide', 'complete-guide-north-portugal'].includes(slug) ? '2026-11-05' : '2026-03-30',
      );
    }
  });

  it('uses a review that applies to every edition, including regional locale codes', () => {
    expect(articleSitemapLastmod({ publishDate: '2026-03-30', modifiedDate: '2026-10-14' }, 'pt-PT', '2026-11-03')).toBe('2026-10-14');
  });

  it('retains the fallback for an undated article', () => {
    expect(articleSitemapLastmod({}, 'en', '2026-11-03')).toBe('2026-11-03');
  });

  it('keeps every published edition when one translation temporarily fails, without claiming a review', async () => {
    const article = { slug: 'synthetic-guide', publishDate: '2026-03-30', modifiedDate: '2026-11-04' };
    const dates = await localizedArticleSitemapDates(article, ['en', 'fr', 'de'], '2026-11-05', async (_slug, language) => {
      if (language === 'fr') throw new Error('temporary translation read failure');
      if (language === 'de') return null;
      return article;
    });
    expect(Object.fromEntries(dates)).toEqual({ en: '2026-11-04', fr: '2026-03-30', de: '2026-03-30' });
  });
});
