/* ==========================================================================
   BLOG ARTICLE — Single article view with editorial layout
   ========================================================================== */

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { ArrowLeft, Clock, Calendar, Share2, ArrowRight, Play, ExternalLink } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import type { BlogArticle as BlogArticleType } from '@/lib/types';
import blogData from '@/data/blog.json';

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
          />
        </div>
      </div>
    </section>
  );
}

export default function BlogArticle() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find(a => a.slug === slug);
  usePageMeta({
    title: article?.title,
    description: article ? `${article.excerpt?.slice(0, 130) || article.title}. Read on the Portugal Active journal.`.slice(0, 155) : undefined,
    image: article?.featuredImage,
    url: article ? `/blog/${article.slug}` : undefined,
    type: 'article',
  });

  useEffect(() => {
    if (!article) return;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "@id": `https://www.portugalactive.com/blog/${article.slug}`,
      "headline": article.title,
      "description": article.excerpt,
      "image": article.featuredImage || (article as any).coverImage,
      "datePublished": article.publishDate,
      "dateModified": article.publishDate,
      "author": {
        "@type": "Person",
        "name": article.author.name,
        "url": "https://www.portugalactive.com",
      },
      "publisher": {
        "@type": "Organization",
        "name": "Portugal Active",
        "url": "https://www.portugalactive.com",
        "logo": {
          "@type": "ImageObject",
          "url": "https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/portugal-active-logo-white_cbdf5c3f.webp",
          "width": 600,
          "height": 60,
        },
      },
      "mainEntityOfPage": {
        "@type": "WebPage",
        "@id": `https://www.portugalactive.com/blog/${article.slug}`,
      },
      "articleBody": article.content || article.excerpt,
      "wordCount": article.content ? article.content.split(/\s+/).length : article.excerpt.split(/\s+/).length,
      "timeRequired": `PT${article.readTime}M`,
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(jsonLd);
    script.id = "article-jsonld";
    document.querySelector("#article-jsonld")?.remove();
    document.head.appendChild(script);
    return () => { document.querySelector("#article-jsonld")?.remove(); };
  }, [article]);

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
    .filter(a => a.id !== article.id && a.status === 'published' && a.category === article.category)
    .slice(0, 3);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header variant="solid" />

      {/* Article Header */}
      <section className="pt-28 md:pt-36 pb-8">
        <div className="container max-w-3xl mx-auto">
          <Link href="/blog" className="inline-flex items-center gap-2 text-[0.8125rem] text-[#9E9A90] hover:text-[#1A1A18] transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" /> {t('blogArticle.backToJournal')}
          </Link>
          <p className="overline mb-4">{article.category.replace('-', ' ')}</p>
          <h1 className="text-[#1A1A18] mb-6">{article.title}</h1>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[#9E9A90]">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {new Date(article.publishDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
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
            src={(article as any).coverImage || (article as any).featuredImage || 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=1200&q=80'}
            alt={`${article.title} – Portugal Active journal`}
            className="w-full aspect-[16/9] object-cover"
            width={1200} height={675} fetchPriority="high"
          />
        </div>
      </section>

      {/* Video Embed */}
      {((article as any).vimeoId || (article as any).videoId) && (
        <VideoEmbed vimeoId={(article as any).vimeoId} videoId={(article as any).videoId} title={article.title} />
      )}

      {/* Article Content */}
      <section className="pb-16">
        <div className="container max-w-3xl mx-auto">
          <div className="prose prose-lg max-w-none">
            {article.content.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-[#6B6860] leading-relaxed mb-6">{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      {/* Author */}
      <section className="border-t border-[#E8E4DC] py-12">
        <div className="container max-w-3xl mx-auto">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-[#F5F1EB] flex items-center justify-center">
              <span className="text-[#8B7355] font-display text-lg">{article.author.name.charAt(0)}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-[#1A1A18]">{article.author.name}</p>
              <p className="text-xs text-[#9E9A90]">{article.author.role}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contextual CTA */}
      <section className="py-12 lg:py-16" style={{ backgroundColor: '#1A1A18' }}>
        <div className="container max-w-2xl mx-auto text-center">
          <p className="overline mb-3" style={{ color: '#C4A87C' }}>{t('blogArticle.ctaSubtitle')}</p>
          <h3 className="headline-md mb-4" style={{ color: '#FAFAF7' }}>
            {t('blogArticle.ctaTitle')}
          </h3>
          <p className="body-md mb-6" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {t('blogArticle.ctaBody')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/homes" className="btn-white inline-flex items-center gap-2">
              {t('blogArticle.ctaExplore')} <ArrowRight size={14} />
            </Link>
            <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="btn-ghost-light inline-flex items-center gap-2">
              {t('blogArticle.ctaConcierge')}
            </a>
          </div>
        </div>
      </section>

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
                      src={(a as any).coverImage || (a as any).featuredImage || 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80'}
                      alt={`${a.title} – Portugal Active journal`}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <p className="overline mb-2">{a.category.replace('-', ' ')}</p>
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
