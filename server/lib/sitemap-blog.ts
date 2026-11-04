import { reviewedArticleDate } from '../../shared/articleNavigation';

/** Match the visible review date and Article schema for this language edition. */
export function articleSitemapLastmod(
  article: { publishDate?: string; modifiedDate?: string; updatedLocales?: string[] },
  language: string,
  fallback: string,
): string {
  const date = reviewedArticleDate(article, language) || article.publishDate;
  return date ? new Date(date).toISOString().split('T')[0] : fallback;
}
