/* ==========================================================================
   BLOG / JOURNAL — V1.6 Redesign
   Hero, 6 categories, featured article, article grid
   ========================================================================== */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { Clock, ArrowRight, Calendar } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import type { BlogArticle, BlogCategory } from '@/lib/types';
import blogData from '@/data/blog.json';

const articles = (blogData as any).articles as BlogArticle[];

const FALLBACK_IMAGES: Record<string, string> = {
  destinations: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=800&q=80',
  lifestyle: 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800&q=80',
  'portugal-active': 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
  video: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=800&q=80',
  people: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&q=80',
};

function getArticleImage(article: BlogArticle): string {
  return (article as any).coverImage || (article as any).featuredImage || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.destinations;
}

export default function Blog() {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<BlogCategory | 'all'>('all');

  const CATEGORIES = useMemo(() => [
    { label: t('blog.categories.all'), value: 'all' as const },
    { label: t('blog.categories.destinations'), value: 'destinations' as const },
    { label: t('blog.categories.lifestyle'), value: 'lifestyle' as const },
    { label: t('blog.categories.portugallActive'), value: 'portugal-active' as const },
    { label: t('blog.categories.video'), value: 'video' as const },
    { label: t('blog.categories.people'), value: 'people' as const },
    { label: t('blog.categories.guides'), value: 'destinations' as const }, // maps to destinations
  ], [t]);

  const filtered = useMemo(() => {
    const published = articles.filter(a => a.status === 'published');
    if (activeCategory === 'all') return published;
    return published.filter(a => a.category === activeCategory);
  }, [activeCategory]);

  const featured = articles.find(a => a.isFeatured && a.status === 'published');
  const rest = filtered.filter(a => a.id !== featured?.id);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="pt-28 md:pt-36 pb-12 md:pb-16 bg-white border-b border-[#E8E4DC]">
        <div className="container">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('blog.hero.overline')}</p>
          <h1 className="headline-xl text-[#1A1A18] mb-4">{t('blog.hero.title')}</h1>
          <p className="body-lg text-[#6B6860] max-w-xl">
            {t('blog.hero.description')}
          </p>
        </div>
      </section>

      {/* Category Filter */}
      <section className="border-b border-[#E8E4DC] sticky top-16 md:top-20 bg-[#FAFAF7]/95 backdrop-blur-md z-30">
        <div className="container">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-3">
            {CATEGORIES.map((cat, idx) => (
              <button
                key={`${cat.value}-${idx}`}
                onClick={() => setActiveCategory(cat.value)}
                className={`px-4 py-2 text-[13px] font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat.value
                    ? 'bg-[#1A1A18] text-white'
                    : 'text-[#6B6860] hover:text-[#1A1A18] hover:bg-[#F5F1EB]'
                }`}
                style={{ minHeight: '40px', minWidth: 'auto' }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Article */}
      {featured && activeCategory === 'all' && (
        <section className="section-padding">
          <div className="container">
            <Link href={`/blog/${featured.slug}`} className="group block">
              <div className="grid md:grid-cols-2 gap-8 md:gap-12">
                <div className="aspect-[4/3] overflow-hidden bg-[#F5F1EB]">
                  <img
                    src={getArticleImage(featured)}
                    alt={featured.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[11px] font-medium text-[#8B7355] mb-3 tracking-[0.08em]">{featured.category.replace('-', ' ').toUpperCase()}</p>
                  <h2 className="font-display text-[2rem] lg:text-[2.5rem] text-[#1A1A18] leading-tight mb-4 group-hover:text-[#8B7355] transition-colors">
                    {featured.title}
                  </h2>
                  <p className="text-[15px] text-[#6B6860] font-light leading-relaxed mb-6 line-clamp-3">{featured.excerpt}</p>
                  <div className="flex items-center gap-4 text-[12px] text-[#9E9A90] mb-6">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(featured.publishDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {t('blog.readTime', { minutes: featured.readTime })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[12px] font-medium tracking-[0.06em] text-[#8B7355] group-hover:gap-3 transition-all">
                    {t('blog.readArticle')} <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </section>
      )}

      {/* Article Grid */}
      <section className="section-padding bg-white">
        <div className="container">
          {rest.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[#9E9A90]">{t('blog.noArticles')}</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {rest.map(article => (
                <Link key={article.id} href={`/blog/${article.slug}`} className="group block">
                  <div className="aspect-[4/3] overflow-hidden bg-[#F5F1EB] mb-4">
                    <img
                      src={getArticleImage(article)}
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <p className="text-[10px] font-medium text-[#8B7355] mb-2 tracking-[0.08em]">{article.category.replace('-', ' ').toUpperCase()}</p>
                  <h3 className="font-display text-[18px] text-[#1A1A18] mb-2 group-hover:text-[#8B7355] transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-[13px] text-[#6B6860] font-light line-clamp-2 mb-3">{article.excerpt}</p>
                  <div className="flex items-center gap-3 text-[11px] text-[#9E9A90]">
                    <span>{new Date(article.publishDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    <span>·</span>
                    <span>{t('blog.minRead', { minutes: article.readTime })}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
