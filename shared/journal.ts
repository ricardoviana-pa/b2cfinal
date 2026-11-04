import type { BlogArticle } from '../client/src/lib/types';
import { BLOG_LANGUAGES } from './blogPublication';

export type JournalLocale = 'en' | 'pt' | 'fr' | 'es' | 'it' | 'fi' | 'de' | 'nl' | 'sv';

/** Public cards carry no article body, biography or booking CTA. */
export type JournalCard = Pick<BlogArticle,
  'id' | 'slug' | 'title' | 'excerpt' | 'category' | 'coverImage' | 'featuredImage' |
  'publishDate' | 'readTime' | 'videoId' | 'vimeoId' | 'status' | 'publishedLocales'
> & { author: Pick<BlogArticle['author'], 'name' | 'type'> };

export interface JournalArticlePage {
  article: BlogArticle | null;
  relatedArticles: JournalCard[];
  redirect: string | null;
}

export function journalLocale(language: string | undefined): JournalLocale {
  const code = (language || 'en').toLowerCase().split('-')[0];
  return BLOG_LANGUAGES.includes(code) ? code as JournalLocale : 'en';
}

export function journalCard(article: BlogArticle): JournalCard {
  const { id, slug, title, excerpt, category, coverImage, featuredImage, publishDate,
    readTime, videoId, vimeoId, status, publishedLocales, author } = article;
  return { id, slug, title, excerpt, category, coverImage, featuredImage, publishDate,
    readTime, videoId, vimeoId, status, publishedLocales,
    author: { name: author.name, ...(author.type ? { type: author.type } : {}) } };
}
