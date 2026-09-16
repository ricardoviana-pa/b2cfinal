/* ==========================================================================
   BLOG ARTICLE — Single article view with editorial layout
   ========================================================================== */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { getDisplayName } from '@shared/displayName';
import { useParams, Link } from 'wouter';
import ArticleBody from '@/components/blog/ArticleBody';
import { blogLanguageRedirect, isBlogLanguagePublished } from '@shared/blogPublication';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cdnResize, cdnSrcSet } from '@/lib/images';
import { ArrowLeft, Clock, Calendar, Share2, ArrowRight, Play, ExternalLink } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { StructuredData, buildArticleSchema, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import AnswerCapsule from '@/components/seo/AnswerCapsule';
import type { BlogArticle as BlogArticleType } from '@/lib/types';
import blogData from '@/data/blog.json';
import { useBlogOverrides, mergeBlogOverride } from '@/lib/localizeBlog';
import { trpc } from '@/lib/trpc';

const articles = (blogData as any).articles as BlogArticleType[];

/* ── Video embed: supports Vimeo (primary) and YouTube (fallback) ── */
function VideoEmbed({ vimeoId, videoId, title }: { vimeoId?: string; videoId?: string; title: string }) {
  const [embedFailed, setEmbedFailed] = useState(false);
  const handleError = useCallback(() => setEmbedFailed(true), []);

  const isVimeo = !!vimeoId;
  const embedSrc = isVimeo
    ? `https://player.vimeo.com/video/${vimeoId}?badge=0&autopause=0&player_id=0&app_id=58479&byline=0&title=0&portrait=0`
    : `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`;
  const watchUrl = isVimeo
    ? `https://vimeo.com/${vimeoId}`
    : `https://www.youtube.com/watch?v=${videoId}`;
  const thumbUrl = isVimeo
    ? undefined // Vimeo doesn't have a simple thumbnail URL pattern
    : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const platformLabel = isVimeo ? 'Vimeo' : 'YouTube';

  if (embedFailed) {
    return (
      <section className="pb-8">
        <div className="container max-w-4xl mx-auto">
          <a href={watchUrl} target="_blank" rel="noopener noreferrer"
            className="group relative block w-full aspect-video bg-[#1A1A18] rounded-sm overflow-hidden">
            {thumbUrl && (
              <img src={thumbUrl} alt={title} className="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:opacity-80 transition-opacity" />
            )}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <div className="w-16 h-16 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                <Play className="w-7 h-7 text-[#1A1A18] ml-1" fill="#1A1A18" />
              </div>
              <span className="flex items-center gap-2 text-white/90 text-sm font-medium">
                Watch on {platformLabel} <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </div>
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-8">
      <div className="container max-w-4xl mx-auto">
        <div className="relative w-full aspect-video bg-black rounded-sm overflow-hidden">
          <iframe
            src={embedSrc}
            title={title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
            loading="lazy"
            onError={handleError}
            referrerPolicy="origin"
          />
        </div>
      </div>
    </section>
  );
}

export default function BlogArticle() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  // Articles are authored in English; overlay per-locale translations
  // (slug-keyed), loading only the active language's file. EN fallback.
  const blogOverrides = useBlogOverrides(i18n.language);
  const rawArticle = articles.find(a => a.slug === slug && a.status === 'published');
  const article = useMemo(() => mergeBlogOverride(rawArticle, blogOverrides), [rawArticle, blogOverrides]);
  const redirect = rawArticle ? blogLanguageRedirect(rawArticle, i18n.language) : null;
  useEffect(() => { if (redirect) window.location.replace(redirect + window.location.search); }, [redirect]);
  usePageMeta({
    title: article?.seoTitle || article?.title,
    description: article?.seoDescription || article?.excerpt,
    publishedLocales: article?.publishedLocales,
    image: article?.featuredImage,
    url: article ? `/blog/${article.slug}` : undefined,
    type: 'article',
  });

  const articleSchema = useMemo(() => {
    if (!article) return null;
    const body = article.content || article.excerpt;
    return buildArticleSchema({
      title: article.title,
      slug: article.slug,
      description: article.excerpt,
      image: article.featuredImage || (article as any).coverImage,
      publishDate: article.publishDate,
      modifiedDate: article.publishDate,
      authorName: article.author.name,
      authorType: article.author.type,
      language: i18n.language,
      articleBody: body,
      wordCount: body ? body.split(/\s+/).filter(Boolean).length : null,
      readTimeMinutes: article.readTime ?? null,
    });
  }, [article, i18n.language]);

  // Homes to send the reader to. Keyed off rawArticle, not the merged one:
  // destinationTag is language-independent and the locale overrides load
  // asynchronously, so using the merged article would change the query key
  // mid-flight and refetch data the server already embedded.
  const { data: relatedHomesData } = trpc.properties.relatedHomes.useQuery(
    { destinationTag: (rawArticle as any)?.destinationTag ?? null, limit: 4 },
    { enabled: Boolean(rawArticle) && !redirect && rawArticle?.commercialIntent !== 'corporate' },
  );
  const relatedHomes = relatedHomesData ?? [];

  if (redirect) return null;

  if (!article) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header variant="solid" />
        <div className="pt-32 pb-20 text-center container">
          <h1 className="text-[#1A1A18] mb-4">{t('blogArticle.notFound')}</h1>
          <Link href="/blog" className="btn btn-ghost">{t('blogArticle.backToJournal')}</Link>
        </div>
        <Footer />
      </div>
    );
  }

  const relatedArticles = articles
    .filter(a => a.id !== article.id && a.status === 'published' && a.category === article.category && isBlogLanguagePublished(a, i18n.language))
    .slice(0, 3).map(a => mergeBlogOverride(a, blogOverrides)!);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      {articleSchema && <StructuredData id={`article-${article.slug}`} data={[
        articleSchema,
        buildBreadcrumbSchema([
          { name: 'Home', item: '/' },
          { name: 'Journal', item: '/blog' },
          { name: article.title },
        ]),
      ]} />}
      <Header variant="solid" />

      {/* Article Header */}
      <section className="pt-28 md:pt-36 pb-8">
        <div className="container max-w-3xl mx-auto">
          <Link href="/blog" className="inline-flex items-center gap-2 text-[0.8125rem] text-[#726D63] hover:text-[#1A1A18] transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> {t('blogArticle.backToJournal')}
          </Link>
          <p className="eyebrow mb-4">{article.category.replace('-', ' ')}</p>
          <h1 className="text-[#1A1A18] mb-6">{article.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[#726D63]">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(article.publishDate).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              {article.readTime} {t('blogArticle.minRead')}
            </span>
            <button
              onClick={() => navigator.clipboard.writeText(window.location.href)}
              className="flex items-center gap-1.5 hover:text-[#1A1A18] transition-colors"
              style={{ minHeight: 'auto', minWidth: 'auto' }}
            >
              <Share2 className="w-3.5 h-3.5" /> {t('blogArticle.share')}
            </button>
          </div>
        </div>
      </section>

      {/* Featured Image */}
      <section className="pb-12">
        <div className="container max-w-4xl mx-auto">
          <img
            src={cdnResize((article as any).coverImage || (article as any).featuredImage || '/images/destinations/minho-coast.webp', 1280)}
            srcSet={cdnSrcSet((article as any).coverImage || (article as any).featuredImage || '/images/destinations/minho-coast.webp', [640, 960, 1280])}
            sizes="(min-width: 896px) 896px, 100vw"
            alt={`${article.title} – Portugal Active journal`}
            className="w-full aspect-[16/9] object-cover"
            width={1200} height={675} fetchPriority="high"
          />
          {article.imageCaption && <p className="text-xs text-pa-stone-aa mt-3">{article.imageCaption}</p>}
        </div>
      </section>

      {/* Video Embed */}
      {((article as any).vimeoId || (article as any).videoId) && (
        <VideoEmbed vimeoId={(article as any).vimeoId} videoId={(article as any).videoId} title={article.title} />
      )}

      {/* Answer capsule — citable TL;DR for AI engines */}
      {article.excerpt && (
        <section className="pb-10">
          <div className="container max-w-3xl">
            <AnswerCapsule
              question={article.title}
              answer={article.excerpt}
              lastUpdated={article.publishDate}
              author={article.author?.name || 'Portugal Active'}
              hideQuestion
              emitSchema={article.commercialIntent !== 'corporate'}
              schemaId={`qa-blog-${article.slug}`}
            />
          </div>
        </section>
      )}

      {/* Article Content */}
      <section className="pb-16">
        <div className="container max-w-3xl mx-auto">
          <ArticleBody content={article.content} />
        </div>
      </section>

      {/* Author */}
      <section className="border-t border-[#E8E4DC] py-12">
        <div className="container max-w-3xl mx-auto">
          <div className="flex items-center gap-4">
            {article.author.photo ? (
              <img src={article.author.photo} alt={article.author.name} className="w-12 h-12 rounded-full object-cover" loading="lazy" width={48} height={48} />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[#F5F1EB] flex items-center justify-center">
                <span className="text-[#8B7355] font-display text-lg">{article.author.name.charAt(0)}</span>
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-[#1A1A18]">{article.author.name}</p>
              <p className="text-xs text-[#726D63]">{article.author.role}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contextual CTA */}
      <section className="py-12 lg:py-16" style={{ backgroundColor: '#1A1A18' }}>
        <div className="container max-w-2xl mx-auto text-center">
          <p className="eyebrow mb-3" style={{ color: '#C4A87C' }}>{t('blogArticle.ctaSubtitle')}</p>
          <h3 className="headline-md mb-4" style={{ color: '#FAFAF7' }}>
            {article.commercialIntent === 'corporate' ? t('corporate.title') : t('blogArticle.ctaTitle')}
          </h3>
          <p className="body-md mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {article.commercialIntent === 'corporate' ? t('corporate.brief') : t('blogArticle.ctaBody')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href={article.commercialIntent === 'corporate' ? '/contact?subject=events&intent=corporate' : '/homes'} className="btn-white inline-flex items-center gap-2">
              {article.commercialIntent === 'corporate' ? t('destinationGrowth.corporateCta') : t('blogArticle.ctaExplore')} <ArrowRight size={14} />
            </Link>
            <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-ghost-light inline-flex items-center gap-2">
              {t('blogArticle.ctaConcierge')}
            </a>
          </div>
        </div>
      </section>

      {/* Related Homes — the article's link into the portfolio. Prefetched on
          the server (see buildPrefetch) so these anchors are in the served
          HTML rather than appearing only after hydration. */}
      {article.commercialIntent !== 'corporate' && relatedHomes.length > 0 && (
        <section className="section-padding bg-[#FAFAF7]">
          <div className="container">
            <h2 className="text-[#1A1A18] mb-2">{t('blogArticle.relatedHomes')}</h2>
            <p className="text-pa-stone-aa mb-8">{t('blogArticle.relatedHomesSub')}</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {relatedHomes.map(home => (
                <Link key={home.slug} href={`/homes/${home.slug}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden bg-[#F5F1EB] mb-3">
                    {home.image && (
                      <img
                        src={cdnResize(home.image, 640)}
                        srcSet={cdnSrcSet(home.image, [320, 480, 640])}
                        sizes="(min-width: 768px) 22vw, 45vw"
                        alt={`${getDisplayName(home)} – Portugal Active`}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        loading="lazy"
                        width={640}
                        height={480}
                        decoding="async"
                      />
                    )}
                  </div>
                  <h3 className="text-base font-display text-[#1A1A18] group-hover:text-pa-gold-aa transition-colors line-clamp-2">
                    {getDisplayName(home)}
                  </h3>
                  {(home.locality || home.bedrooms) && (
                    <p className="text-sm text-pa-stone-aa mt-1">
                      {[home.locality, home.bedrooms ? t('blogArticle.bedroomCount', { count: home.bedrooms }) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <section className="section-padding bg-white">
          <div className="container">
            <h2 className="text-[#1A1A18] mb-8">{t('blogArticle.relatedStories')}</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {relatedArticles.map(a => (
                <Link key={a.id} href={`/blog/${a.slug}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden bg-[#F5F1EB] mb-4">
                    <img
                      src={cdnResize((a as any).coverImage || (a as any).featuredImage || '/images/destinations/minho-coast.webp', 768)}
                      srcSet={cdnSrcSet((a as any).coverImage || (a as any).featuredImage || '/images/destinations/minho-coast.webp', [400, 640, 768])}
                      sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 90vw"
                      alt={`${a.title} – Portugal Active journal`}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                      width={800}
                      height={600}
                      decoding="async"
                    />
                  </div>
                  <p className="eyebrow mb-2">{a.category.replace('-', ' ')}</p>
                  <h3 className="text-lg font-display text-[#1A1A18] group-hover:text-[#8B7355] transition-colors line-clamp-2">
                    {a.title}
                  </h3>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
