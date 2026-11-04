import fs from 'node:fs';
import path from 'node:path';
import type { BlogArticle } from '../../client/src/lib/types';
import { deepMerge } from '../../client/src/lib/deepMerge';
import { blogLanguageRedirect, isBlogLanguagePublished } from '../../shared/blogPublication';
import { journalCard, journalLocale, type JournalArticlePage, type JournalCard } from '../../shared/journal';

const TTL_MS = 10 * 60 * 1000;
let articles: { expiresAt: number; data: BlogArticle[] } | undefined;
const translations = new Map<string, { expiresAt: number; data: Record<string, Partial<BlogArticle>> }>();

function sourceArticles(): BlogArticle[] {
  if (!articles || articles.expiresAt <= Date.now()) {
    const source = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'client/src/data/blog.json'), 'utf8'));
    if (!Array.isArray(source.articles)) throw new Error('Journal source has no article list');
    articles = { expiresAt: Date.now() + TTL_MS, data: source.articles };
  }
  return articles.data;
}

function overrides(locale: string): Record<string, Partial<BlogArticle>> {
  if (locale === 'en') return {};
  const cached = translations.get(locale);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  // A read failure is transient: do not cache empty translations or serve an
  // English body as if it were this edition. The request can be retried.
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'client/src/data/blog.i18n', `${locale}.json`), 'utf8'));
  translations.set(locale, { expiresAt: Date.now() + TTL_MS, data });
  return data;
}

function localize(article: BlogArticle, locale: string): BlogArticle {
  const translated = deepMerge(article, overrides(locale)[article.slug] || {});
  // Language-independent routing/publication fields come from the source.
  return { ...translated, id: article.id, slug: article.slug, status: article.status,
    category: article.category, destinationTag: article.destinationTag,
    commercialIntent: article.commercialIntent, publishedLocales: article.publishedLocales };
}

/** Same record for metadata, SSR and the public article query; never drafts. */
export async function getJournalArticle(slug: string, language: string): Promise<BlogArticle | null> {
  const article = sourceArticles().find(item => item.slug === slug && item.status === 'published');
  return article ? localize(article, journalLocale(language)) : null;
}

export async function getJournalIndex(language: string): Promise<JournalCard[]> {
  const locale = journalLocale(language);
  return sourceArticles()
    .filter(article => article.status === 'published' && isBlogLanguagePublished(article, locale))
    .slice().sort((a, b) => (b.publishDate || '').localeCompare(a.publishDate || ''))
    .map(article => journalCard(localize(article, locale)));
}

export async function getJournalArticlePage(slug: string, language: string): Promise<JournalArticlePage> {
  const locale = journalLocale(language);
  const source = sourceArticles();
  const base = source.find(article => article.slug === slug && article.status === 'published');
  if (!base) return { article: null, relatedArticles: [], redirect: null };
  const redirect = blogLanguageRedirect(base, locale);
  if (redirect) return { article: null, relatedArticles: [], redirect };
  const article = localize(base, locale);
  const relatedArticles = source.filter(candidate => candidate.id !== base.id &&
    candidate.status === 'published' && candidate.category === base.category &&
    (candidate.commercialIntent === 'corporate') === (base.commercialIntent === 'corporate') &&
    isBlogLanguagePublished(candidate, locale)
  ).slice(0, 3).map(candidate => journalCard(localize(candidate, locale)));
  return { article, relatedArticles, redirect: null };
}
