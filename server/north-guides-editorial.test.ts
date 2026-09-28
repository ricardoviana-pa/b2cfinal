import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import ArticleBody from '../client/src/components/blog/ArticleBody';
import data from '../client/src/data/blog.json';
import pt from '../client/src/data/blog.i18n/pt.json';
import destinations from '../client/src/data/destinations.json';
import { blogLanguages, isBlogLanguagePublished } from '../shared/blogPublication';
import { mergeBlogOverride } from '../client/src/lib/localizeBlog';
import { getPropertiesForDestination } from './services/properties-store';

const slugs = ['viana-do-castelo-guide', 'when-to-visit-north-portugal'];
const guides = data.articles.filter(article => slugs.includes(article.slug));
const editions = guides.flatMap(article => [
  { language: 'en', article },
  { language: 'pt', article: mergeBlogOverride(article, pt)! },
]);

describe('revised northern Portugal guides retain publication integrity', () => {
  it('keeps established URLs, publication dates and language editions', () => {
    expect(guides).toHaveLength(2);
    for (const article of guides) {
      expect(article.status).toBe('published');
      expect(article.publishDate).toBe('2026-03-30');
      expect(blogLanguages(article)).toEqual(['en', 'pt', 'fr', 'es', 'it', 'fi', 'de', 'nl', 'sv']);
      expect(article).toMatchObject({ modifiedDate: '2026-09-28', updatedLocales: ['en', 'pt'] });
    }
    for (const { article } of editions) {
      expect(article.author).toMatchObject({ type: 'Organization', name: 'Portugal Active' });
      expect(article.author.bio).toBe('');
    }
  });

  it('links to published guides and active destination pages, without legacy aliases', () => {
    const internalLinks = editions.flatMap(({ language, article }) =>
      [...article.content.matchAll(/\]\((\/[^)]+)\)/g)].map(match => ({ language, href: match[1] })),
    );
    expect(internalLinks.length).toBeGreaterThan(10);
    for (const { language, href } of internalLinks) {
      const url = new URL(href, 'https://www.portugalactive.com');
      const [, section, slug] = url.pathname.split('/');
      expect(['homes', 'destinations', 'blog']).toContain(section);
      if (section === 'blog') {
        const linked = data.articles.find(article => article.slug === slug);
        expect(linked?.status).toBe('published');
        expect(isBlogLanguagePublished(linked!, language)).toBe(true);
      } else if (section === 'destinations') {
        expect(destinations.find(destination => destination.slug === slug)?.status).toBe('active');
      } else {
        expect(slug).toBeUndefined();
        expect([...url.searchParams.keys()]).not.toContain('region');
        if (url.search) expect(url.searchParams.get('location')).toBe('viana-do-castelo');
      }
    }
  });

  it('the linked Viana locality has public homes in the current catalog', async () => {
    const homes = await getPropertiesForDestination('viana-do-castelo');
    expect(homes.length).toBeGreaterThan(0);
    expect(homes.every(home => home.locality === 'Viana do Castelo')).toBe(true);
  });

  it('reuses an existing city image and an existing regional asset', () => {
    const city = guides.find(article => article.slug === slugs[0])!;
    const region = destinations.find(destination => destination.slug === 'viana-do-castelo')!;
    expect(new URL(city.featuredImage).pathname).toBe(new URL(region.regionImage!).pathname);
    const seasons = guides.find(article => article.slug === slugs[1])!;
    expect(fs.existsSync(path.join(process.cwd(), 'client/public', seasons.featuredImage))).toBe(true);
    expect(seasons.featuredImage).toBe(seasons.coverImage);
  });
});

describe('guide body links and tables are usable in both revised languages', () => {
  it.each(editions)('$language: $article.slug renders real links and a semantic comparison table', ({ language, article }) => {
    const html = renderToStaticMarkup(React.createElement(Router, { base: `/${language}`, ssrPath: `/${language}/blog/${article.slug}` },
      React.createElement(ArticleBody, { content: article.content })));
    expect(html).toContain('<table');
    expect(html).toContain(`href="/${language}/destinations/`);
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).not.toContain(`/${language}/${language}/`);
    expect(html).not.toContain('](/');
  });
});
