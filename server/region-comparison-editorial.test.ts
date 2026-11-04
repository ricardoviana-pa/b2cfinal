import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import ArticleBody from '../client/src/components/blog/ArticleBody';
import blog from '../client/src/data/blog.json';
import destinations from '../client/src/data/destinations.json';
import products from '../client/src/data/products.json';
import { BLOG_LANGUAGES, blogLanguages, isBlogLanguagePublished } from '../shared/blogPublication';
import { articleContents, reviewedArticleDate } from '../shared/articleNavigation';
import { mergeBlogOverride } from '../client/src/lib/localizeBlog';

const slug = 'minho-vs-algarve';
const source = blog.articles.find(article => article.slug === slug)!;
const editions = BLOG_LANGUAGES.map(language => {
  const overrides = language === 'en' ? undefined : JSON.parse(readFileSync(
    new URL(`../client/src/data/blog.i18n/${language}.json`, import.meta.url), 'utf8',
  ));
  return { language, article: overrides ? mergeBlogOverride(source, overrides)! : source, override: overrides?.[slug] };
});

describe('regional comparison remains usable in all published languages', () => {
  it('retains every edition and gives only completed translations the shared revision date', () => {
    expect(source.status).toBe('published');
    expect(source.publishDate).toBe('2026-03-30');
    expect(blogLanguages(source)).toEqual(BLOG_LANGUAGES);
    expect(source.updatedLocales).toEqual(BLOG_LANGUAGES);
    expect(source.modifiedDate).toBe('2026-11-04');
    for (const { language, article, override } of editions) {
      expect(reviewedArticleDate(article, language)).toBe(source.modifiedDate);
      if (language !== 'en') {
        expect(override.content).not.toBe(source.content);
        expect(override.modifiedDate).toBe(source.modifiedDate);
        expect(override.cta.label).not.toBe(source.cta!.label);
      }
    }
  });

  it.each(editions)('$language: renders ten navigable sections and working regional home links', ({ language, article }) => {
    const headings = articleContents(article.content);
    expect(headings).toHaveLength(10);
    expect(headings.every(heading => heading.level === 3)).toBe(true);
    expect(new Set(headings.map(heading => heading.id)).size).toBe(10);
    const html = renderToStaticMarkup(React.createElement(Router, { base: `/${language}`, ssrPath: `/${language}/blog/${slug}` },
      React.createElement(ArticleBody, { content: article.content })));
    for (const heading of headings) expect(html).toContain(`id="${heading.id}"`);
    expect(html).toContain(`href="/${language}/homes?destination=minho"`);
    expect(html).toContain(`href="/${language}/homes?destination=algarve"`);
    expect(html).not.toContain(`/${language}/${language}/`);
    expect(html).not.toContain('?region=');
    expect(article.cta).toMatchObject({ action: 'homes', href: '/homes?destination=minho' });
    expect(article.cta!.label.length).toBeGreaterThan(0);
  });

  it('does not route translated readers to unpublished guides or inactive destinations/services', () => {
    for (const { language, article } of editions) {
      for (const [, href] of article.content.matchAll(/\]\((\/[^)]+)\)/g)) {
        const url = new URL(href, 'https://www.portugalactive.com');
        const [, section, linkedSlug] = url.pathname.split('/');
        if (section === 'blog') {
          const linked = blog.articles.find(item => item.slug === linkedSlug);
          expect(linked?.status).toBe('published');
          expect(isBlogLanguagePublished(linked!, language)).toBe(true);
        } else if (section === 'destinations') {
          expect(destinations.find(item => item.slug === linkedSlug)?.status).toBe('active');
        } else if (section === 'services' || section === 'experiences') {
          expect(products.find(item => item.slug === linkedSlug)?.isActive).toBe(true);
        } else if (section === 'homes' && !linkedSlug) {
          expect([...url.searchParams.keys()]).toEqual(['destination']);
          expect(['minho', 'algarve']).toContain(url.searchParams.get('destination'));
        }
      }
    }
  });
});
