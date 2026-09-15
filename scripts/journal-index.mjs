// Small destination-card catalogue: never bundle entire blog articles into
// every destination. Rebuilt from the editorial source for all nine locales.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const data = new URL('../client/src/data/', import.meta.url);
const read = file => JSON.parse(readFileSync(new URL(file, data), 'utf8'));
const articles = read('blog.json').articles;
const selection = read('destination-journal.json');
const wanted = new Set(Object.values(selection).flat());
for (const slug of wanted) {
  if (!articles.some(a => a.slug === slug && a.status === 'published')) throw new Error(`Unpublished journal link: ${slug}`);
}
mkdirSync(new URL('journal-index/', data), { recursive: true });
for (const lang of ['en', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'sv', 'fi']) {
  const overrides = lang === 'en' ? {} : read(`blog.i18n/${lang}.json`);
  const index = Object.fromEntries(articles.filter(a => wanted.has(a.slug)).map(a => {
    const localized = { ...a, ...(overrides[a.slug] || {}) };
    return [a.slug, {
      slug: a.slug, title: localized.title, excerpt: localized.excerpt,
      coverImage: a.coverImage || a.featuredImage, publishedAt: a.publishDate,
    }];
  }));
  writeFileSync(new URL(`journal-index/${lang}.json`, data), JSON.stringify(index, null, 2) + '\n');
}
