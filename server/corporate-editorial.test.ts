import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Router } from 'wouter';
import ArticleBody from '../client/src/components/blog/ArticleBody';
import { blogLanguages, blogLanguageRedirect, isBlogLanguagePublished } from '../shared/blogPublication';
import { __testing } from './_core/vite';
import data from '../client/src/data/blog.json';
import pt from '../client/src/data/blog.i18n/pt.json';
import { corporatePlanning } from '../client/src/data/corporatePlanning';

const corporate = data.articles.filter(a => 'commercialIntent' in a && a.commercialIntent === 'corporate');

describe('corporate publication across language editions', () => {
  it('publishes two original articles with a complete PT edition and unique covers', () => {
    expect(corporate).toHaveLength(2);
    expect(new Set(corporate.map(a => a.coverImage)).size).toBe(2);
    for (const article of corporate) {
      expect(article.status).toBe('published');
      expect(blogLanguages(article)).toEqual(['en', 'pt']);
      const translated = pt[article.slug as keyof typeof pt];
      expect(translated.title).not.toBe(article.title);
      expect(translated.content.length).toBeGreaterThan(2000);
      expect(article.content).toContain('/contact?subject=events&intent=corporate');
    }
  });
  it('does not advertise English fallback as a French translation', () => {
    for (const article of corporate) {
      expect(isBlogLanguagePublished(article, 'pt-PT')).toBe(true);
      expect(isBlogLanguagePublished(article, 'fr')).toBe(false);
      expect(blogLanguageRedirect(article, 'fr')).toBe(`/en/blog/${article.slug}`);
      expect(blogLanguageRedirect(article, 'pt')).toBeNull();
      const alternates = __testing.buildHreflangBlock(`/blog/${article.slug}`, blogLanguages(article));
      expect(alternates).toContain('hreflang="pt-PT"');
      expect(alternates).toContain('hreflang="x-default"');
      expect(alternates).not.toContain('hreflang="fr');
    }
    expect(blogLanguages({})).toHaveLength(9);
  });
  it('serves Portuguese metadata with organizational authorship and absolute images', async () => {
    const article = await __testing.getBlogArticleBySlugCached(corporate[0].slug, 'pt');
    expect(article.title).toBe(pt[corporate[0].slug as keyof typeof pt].title);
    const graph = __testing.buildBlogGraph(article, 'pt')['@graph'] as any[];
    expect(graph[0].author).toEqual({ '@type': 'Organization', name: 'Portugal Active' });
    expect(graph[0].inLanguage).toBe('pt');
    // Absolute URL: the site's own asset or a real home photo from Guesty.
    expect(graph[0].image[0]).toMatch(/^https:\/\/(www.portugalactive.com|assets.guesty.com)\//);
    expect(graph[0]['@id']).toContain('/pt/blog/');
  });
  it('every commercial guide link resolves to a published edition', () => {
    for (const language of ['en', 'pt']) {
      for (const link of corporatePlanning(language)!.guideLinks) {
        const article = corporate.find(a => a.slug === link.slug)!;
        expect(article).toBeDefined();
        expect(isBlogLanguagePublished(article, language)).toBe(true);
      }
    }
    expect(corporatePlanning('fr')).toBeNull();
  });
});

describe('readable article structure and conversion links', () => {
  const html = (content: string) => renderToStaticMarkup(React.createElement(Router, { base: '/pt', ssrPath: '/pt/blog' }, React.createElement(ArticleBody, { content })));
  it('turns a bold CTA into a real locale-aware link, without doubled locale paths', () => {
    const rendered = html('**[Pedir proposta](/pt/contact?subject=events&intent=corporate).**');
    expect(rendered).toContain('href="/pt/contact?subject=events&amp;intent=corporate"');
    expect(rendered).not.toContain('/pt/pt/');
    expect(rendered).not.toContain('[Pedir');
  });
  it('renders the actual programme as semantic lists and the comparison as a table', () => {
    expect(html(corporate[0].content).match(/<li>/g)!.length).toBeGreaterThanOrEqual(10);
    const comparison = html(corporate[1].content);
    expect(comparison).toContain('<table');
    expect(comparison.match(/<tr/g)).toHaveLength(7);
    expect(comparison).not.toContain('whitespace-nowrap');
  });
  it('keeps empty table cells and rejects unsafe link protocols', () => {
    const rendered = html('| One | Two |\n| --- | --- |\n| | Value |\n\n[unsafe](javascript:alert)');
    expect(rendered.match(/<td/g)).toHaveLength(2);
    expect(rendered).not.toContain('href="javascript:');
  });
});
