import { reviewedArticleDate } from '../../shared/articleNavigation';

type ArticleDates = { publishDate?: string; modifiedDate?: string; updatedLocales?: string[] };

/** Match the visible review date and Article schema for this language edition. */
export function articleSitemapLastmod(
  article: ArticleDates,
  language: string,
  fallback: string,
): string {
  const date = reviewedArticleDate(article, language) || article.publishDate;
  return date ? new Date(date).toISOString().split('T')[0] : fallback;
}

/** A temporary translation read failure must not drop published URLs or assign
 * another edition's review date. Retain the original publication date instead. */
export async function localizedArticleSitemapDates(
  article: ArticleDates & { slug: string },
  languages: string[],
  fallback: string,
  load: (slug: string, language: string) => Promise<ArticleDates | null>,
): Promise<Map<string, string>> {
  return new Map(await Promise.all(languages.map(async language => {
    let localized: ArticleDates | null = null;
    try { localized = await load(article.slug, language); } catch { /* safe date fallback below */ }
    return [language, articleSitemapLastmod(localized || { publishDate: article.publishDate }, language, fallback)] as const;
  })));
}
