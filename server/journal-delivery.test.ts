import React from 'react';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import superjson from 'superjson';
import { render } from '../client/src/entry-server';
import { trpc } from '../client/src/lib/trpc';
import { mergeBlogOverride } from '../client/src/lib/localizeBlog';
import { BLOG_LANGUAGES, isBlogLanguagePublished } from '../shared/blogPublication';
import { journalCard, journalLocale } from '../shared/journal';
import { reviewedArticleDate } from '../shared/articleNavigation';
import { getJournalArticle, getJournalArticlePage, getJournalIndex } from './services/journal';
import { __testing } from './_core/vite';
import { blogRouter } from './routers/blog';

(globalThis as any).React = React;
const source = JSON.parse(fs.readFileSync('client/src/data/blog.json', 'utf8')).articles;
const slug = 'viana-do-castelo-guide';

describe('Journal delivery by article and language', () => {
  it.each(BLOG_LANGUAGES)('%s keeps the localized article, card order and publication rules', async language => {
    const overrides = language === 'en' ? {} : JSON.parse(fs.readFileSync(`client/src/data/blog.i18n/${language}.json`, 'utf8'));
    const base = source.find((a: any) => a.slug === slug);
    const expected = mergeBlogOverride(base, overrides)!;
    const page = await getJournalArticlePage(slug, language);
    expect(page.redirect).toBeNull();
    for (const key of ['title', 'content', 'excerpt', 'seoTitle', 'seoDescription', 'author', 'cta', 'readTime']) {
      expect((page.article as any)[key], key).toEqual(expected[key]);
    }
    const related = source.filter((a: any) => a.id !== base.id && a.status === 'published' && a.category === base.category &&
      (a.commercialIntent === 'corporate') === (base.commercialIntent === 'corporate') && isBlogLanguagePublished(a, language)
    ).slice(0, 3).map((a: any) => journalCard(mergeBlogOverride(a, overrides)!));
    expect(page.relatedArticles).toEqual(related);
    const expectedIndex = source.filter((a: any) => a.status === 'published' && isBlogLanguagePublished(a, language))
      .slice().sort((a: any, b: any) => (b.publishDate || '').localeCompare(a.publishDate || ''))
      .map((a: any) => journalCard(mergeBlogOverride(a, overrides)!));
    const index = await getJournalIndex(language);
    expect(index).toEqual(expectedIndex);
    expect(index.every(card => !('content' in card) && !('cta' in card) && !('bio' in card.author))).toBe(true);
    expect(await __testing.getBlogArticleBySlugCached(slug, language)).toEqual(await getJournalArticle(slug, language));
  });

  it('returns an unpublished-language redirect without returning an English body', async () => {
    const limited = source.find((a: any) => a.status === 'published' && a.publishedLocales?.includes('en') && !a.publishedLocales.includes('fr'));
    expect(limited).toBeTruthy();
    expect(await getJournalArticlePage(limited.slug, 'fr')).toEqual({ article: null, relatedArticles: [], redirect: `/en/blog/${limited.slug}` });
    expect((await getJournalIndex('fr')).some(a => a.slug === limited.slug)).toBe(false);
    expect(await getJournalArticlePage('missing-audit-article', 'pt')).toEqual({ article: null, relatedArticles: [], redirect: null });
  });

  it.each(['en', 'pt'])('%s article and index SSR hydrate their localized query, without the full catalogue', async language => {
    const locale = journalLocale(language);
    const data = await getJournalArticlePage(slug, locale);
    const { appHtml, dehydratedState } = await render(`/${locale}/blog/${slug}`, {
      prefetch: { journalArticle: { input: { locale, slug }, data } },
    });
    expect(appHtml).toContain(data.article!.title);
    expect(appHtml).toContain(`href="/${locale}/homes?location=viana-do-castelo`);
    const intro = appHtml.slice(appHtml.indexOf('<h1'), appHtml.indexOf('<section class="pb-12"'));
    expect(data.article!.cta?.action).toBe('homes');
    expect(intro).toContain(data.article!.cta!.label);
    expect(intro).toContain(`href="/${locale}${data.article!.cta!.href}"`);
    for (const card of data.relatedArticles) expect(appHtml).toContain(`href="/${locale}/blog/${card.slug}"`);
    const client = new QueryClient();
    hydrate(client, superjson.parse(dehydratedState));
    expect(client.getQueryData(getQueryKey(trpc.blog.siteArticle, { locale, slug }, 'query'))).toEqual(data);
    expect(client.getQueryData(getQueryKey(trpc.blog.siteArticle, { locale: locale === 'en' ? 'pt' : 'en', slug }, 'query'))).toBeUndefined();
    const articleQueries = dehydrate(client).queries.filter(q => String(q.queryKey[0]).startsWith('blog'));
    expect(articleQueries).toHaveLength(1);

    const index = await getJournalIndex(locale);
    const renderedIndex = await render(`/${locale}/blog`, { prefetch: { journalIndex: { input: { locale }, data: index } } });
    for (const card of index) expect(renderedIndex.appHtml).toContain(`href="/${locale}/blog/${card.slug}"`);
    expect(renderedIndex.appHtml).not.toContain(data.article!.content);
  });

  it('keeps only safe trip fields when choosing another article from the index', async () => {
    const data = await getJournalIndex('pt');
    const { appHtml } = await render('/pt/blog?checkin=2027-05-10&checkout=2027-05-17&guests=4&token=private', {
      prefetch: { journalIndex: { input: { locale: 'pt' }, data } },
    });
    for (const card of data) expect(appHtml).toContain(`href="/pt/blog/${card.slug}?checkin=2027-05-10&amp;checkout=2027-05-17&amp;guests=4"`);
    expect(appHtml).not.toContain('token=private');
  });

  it.each([
    { slug: 'viana-do-castelo-guide', destination: 'viana-do-castelo', filter: 'location=viana-do-castelo' },
    { slug: 'complete-guide-north-portugal', destination: 'minho', filter: 'destination=minho' },
    { slug: 'esposende-guide', destination: 'esposende', filter: 'location=esposende' },
  ].flatMap(guide => (['en', 'pt'] as const).map(locale => ({ ...guide, locale }))))(
    '$locale $slug keeps the intro and destination CTA local, with only safe trip fields',
    async ({ slug: articleSlug, destination, filter, locale }) => {
      const data = await getJournalArticlePage(articleSlug, locale);
      expect(data.article).not.toBeNull();
      expect(data.article!.cta?.action).toBe('homes');
      expect(data.article!.cta?.href).toBe(`/homes?${filter}`);
      const { appHtml } = await render(`/${locale}/blog/${articleSlug}?checkin=2027-05-10&checkout=2027-05-17&guests=4&token=private`, {
        prefetch: { journalArticle: { input: { locale, slug: articleSlug }, data } },
      });
      const trip = 'checkin=2027-05-10&amp;checkout=2027-05-17&amp;guests=4';
      const intro = appHtml.slice(appHtml.indexOf('<h1'), appHtml.indexOf('<section class="pb-12"'));
      expect(intro).toContain(data.article!.cta!.label);
      expect(intro).toContain(`href="/${locale}/homes?${filter}&amp;${trip}"`);
      expect(appHtml).toContain(`href="/${locale}/destinations/${destination}?${trip}"`);
      expect(appHtml).not.toContain('token=private');
    },
  );

  it.each(BLOG_LANGUAGES.filter(language => !['en', 'pt'].includes(language)))(
    '%s adds a localized Minho homes link without claiming a content review, and redirects unpublished Esposende',
    async language => {
      const locale = journalLocale(language);
      const articleSlug = 'complete-guide-north-portugal';
      const data = await getJournalArticlePage(articleSlug, locale);
      expect(data.article).not.toBeNull();
      expect(data.redirect).toBeNull();
      const overrides = JSON.parse(fs.readFileSync(`client/src/data/blog.i18n/${locale}.json`, 'utf8'));
      const base = source.find((article: any) => article.slug === articleSlug);
      expect(data.article!.content).toBe(mergeBlogOverride(base, overrides)!.content);
      expect(reviewedArticleDate(data.article!, locale)).toBeUndefined();
      const { appHtml } = await render(`/${locale}/blog/${articleSlug}?checkin=2027-05-10&checkout=2027-05-17&guests=4&token=private`, {
        prefetch: { journalArticle: { input: { locale, slug: articleSlug }, data } },
      });
      const intro = appHtml.slice(appHtml.indexOf('<h1'), appHtml.indexOf('<section class="pb-12"'));
      const labels = JSON.parse(fs.readFileSync(`client/src/i18n/locales/${locale}.json`, 'utf8'));
      expect(intro).toContain(labels.blogArticle.ctaExplore);
      expect(intro).toContain(`href="/${locale}/homes?destination=minho&amp;checkin=2027-05-10&amp;checkout=2027-05-17&amp;guests=4"`);
      expect(intro).not.toContain(base.cta.label);
      expect(intro).not.toContain(labels.planning.updated);
      expect(appHtml).not.toContain('token=private');
      expect(await getJournalArticlePage('esposende-guide', locale)).toEqual({
        article: null, relatedArticles: [], redirect: '/en/blog/esposende-guide',
      });
      expect((await getJournalIndex(locale)).some(article => article.slug === 'esposende-guide')).toBe(false);
    },
  );

  it('does not present loading as an article-not-found page', async () => {
    const { appHtml } = await render('/pt/blog/viana-do-castelo-guide');
    expect(appHtml).toContain('role="status"');
    expect(appHtml).toContain('aria-busy="true"');
    expect(appHtml).not.toContain('Artigo não encontrado');
  });

  it('deduplicates the same article request and isolates language/slug changes', async () => {
    const client = new QueryClient();
    const queryFn = vi.fn(() => getJournalArticlePage(slug, 'pt'));
    const queryKey = getQueryKey(trpc.blog.siteArticle, { locale: 'pt', slug }, 'query');
    const options = { queryKey, queryFn, staleTime: 300_000 };
    const [a, b] = await Promise.all([client.fetchQuery(options), client.fetchQuery(options)]);
    expect(a).toEqual(b);
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(getQueryKey(trpc.blog.siteArticle, { locale: 'en', slug }, 'query'))).toBeUndefined();
    expect(client.getQueryData(getQueryKey(trpc.blog.siteArticle, { locale: 'pt', slug: 'surfing-minho-coast' }, 'query'))).toBeUndefined();
  });

  it('the public API returns the same narrow payload and rejects invalid locale input', async () => {
    const res = { setHeader: vi.fn() };
    const caller = blogRouter.createCaller({ user: null, req: {}, res } as any);
    expect(await caller.siteArticle({ locale: 'pt', slug })).toEqual(await getJournalArticlePage(slug, 'pt'));
    expect(await caller.siteIndex({ locale: 'en' })).toEqual(await getJournalIndex('en'));
    await expect(caller.siteArticle({ locale: '../../en' as any, slug })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', expect.stringContaining('s-maxage=300'));
  });
});
