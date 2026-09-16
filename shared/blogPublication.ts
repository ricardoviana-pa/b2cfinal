export const BLOG_LANGUAGES = ['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv'];

type Publication = { publishedLocales?: string[] };

/** Older articles keep their existing translations. New articles explicitly
 * declare the editions that are ready; fallback copy is not a translation. */
export function blogLanguages(article: Publication): string[] {
  return article.publishedLocales
    ? BLOG_LANGUAGES.filter(lang => article.publishedLocales!.includes(lang))
    : BLOG_LANGUAGES;
}

export function isBlogLanguagePublished(article: Publication, language: string): boolean {
  return blogLanguages(article).includes(language.toLowerCase().split('-')[0]);
}

export function blogLanguageRedirect(article: Publication & { slug: string }, language: string): string | null {
  if (isBlogLanguagePublished(article, language)) return null;
  const languages = blogLanguages(article);
  const fallback = languages.includes('en') ? 'en' : languages[0];
  return fallback ? `/${fallback}/blog/${article.slug}` : null;
}
