/* ==========================================================================
   BLOG ARTICLE — Single article view with editorial layout
   ========================================================================== */

import { useParams, Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Clock, Calendar, Share2, ArrowRight } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import type { BlogArticle as BlogArticleType } from '@/lib/types';
import blogData from '@/data/blog.json';

const articles = (blogData as any).articles as BlogArticleType[];

export default function BlogArticle() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find(a => a.slug === slug);

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
            alt={article.title}
            className="w-full aspect-[16/9] object-cover"
          />
        </div>
      </section>

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
                      alt={a.title}
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
