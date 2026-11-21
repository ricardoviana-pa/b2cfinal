/* ==========================================================================
   BLOG / JOURNAL — V1.6 Redesign
   Hero, 6 categories, featured article, article grid
   ========================================================================== */

import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { blogAuthorName, blogCategoryLabel } from '@/lib/blogLabels';
import { journalLocale, type JournalCard } from '@shared/journal';
import { trpc } from '@/lib/trpc';
import JournalRequestState from '@/components/blog/JournalRequestState';
import { usePageMeta } from '@/hooks/usePageMeta';
import { cdnResize, cdnSrcSet } from '@/lib/images';
import { Link, useSearch } from 'wouter';
import { withEditorialTrip } from '@shared/editorialTripContext';
import { Clock, ArrowRight, Calendar, Play } from 'lucide-react';
import BookingCTA from '@/components/property/BookingCTA';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import type { BlogCategory } from '@/lib/types';
import { formatSiteDate } from '@shared/siteDate';

// Article dates are calendar days: the same text on the server and in every
// browser time zone (auditoria 29 out, Regression:P1 — US visitors saw them a
// day early and React threw #418).
const articleDate = (date: string, lang: string) =>
  formatSiteDate(date, lang, { day: 'numeric', month: 'short', year: 'numeric' });

const FALLBACK_IMAGES: Record<string, string> = {
  destinations: "/destinations/minho-coast.webp",
  guides: "/hero/home-villa.webp",
  lifestyle: "/experiences/exp-wellness.webp",
  "portugal-active": "/hero/about-team-suite.webp",
  video: "/videos/can-am-poster.webp",
  people: "/experiences/team-curation.webp",
};

function getArticleImage(article: JournalCard): string {
  return (article as any).coverImage || (article as any).featuredImage || FALLBACK_IMAGES[article.category] || FALLBACK_IMAGES.destinations;
}

/** Articles added to the grid by each "show more". */
const JOURNAL_PAGE_SIZE = 12;

export default function Blog() {
  const { t, i18n } = useTranslation();
  const search = useSearch();
  usePageMeta({ title: 'Portugal Travel Journal | Guides, Tips & Inspiration', description: 'Insider guides to Portugal — best beaches, hidden restaurants, wine regions, and travel tips from our local concierge team.', url: '/blog' });
  // Journal opens on All, newest first; the video tab is one tap away.
  const [searchText, setSearchText] = useState('');
  const [activeCategory, setActiveCategory] = useState<BlogCategory | "all">("all");

  // Localized card metadata only, newest first; hydrated from the same SSR query.
  const indexQuery = trpc.blog.siteIndex.useQuery(
    { locale: journalLocale(i18n.language) },
    { staleTime: 5 * 60 * 1000, retry: 1 },
  );
  const locArticles = indexQuery.data ?? [];

  const blogGraph = useMemo(() => {
    const publishedArticles = locArticles.filter((a) => a.status === 'published');
    return [
      {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        '@id': `https://www.portugalactive.com/${i18n.language}/blog`,
        name: 'Portugal Travel Journal',
        description:
          'Insider guides to Portugal — best beaches, hidden restaurants, wine regions, and travel tips from our local concierge team.',
        url: `https://www.portugalactive.com/${i18n.language}/blog`,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: publishedArticles.map((article, idx) => ({
            '@type': 'ListItem',
            position: idx + 1,
            item: {
              '@type': 'BlogPosting',
              '@id': `https://www.portugalactive.com/${i18n.language}/blog/${article.slug}`,
              headline: article.title,
              description: article.excerpt,
              image: getArticleImage(article),
              datePublished: article.publishDate,
              author: {
                '@type': article.author.type || 'Person',
                name: article.author.name,
              },
            },
          })),
        },
      },
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Journal' },
      ]),
    ];
  }, [locArticles, i18n.language]);

  const CATEGORIES = useMemo(() => [
    { label: t('blog.catAll'), value: 'all' as const },
    { label: t('blog.catDestinations'), value: 'destinations' as const },
    { label: t('blog.catLifestyle'), value: 'lifestyle' as const },
    { label: t('blog.catPA'), value: 'portugal-active' as const },
    { label: t('blog.catVideo'), value: 'video' as const },
    { label: t('blog.catPeople'), value: 'people' as const },
    { label: t('blog.catGuides'), value: 'guides' as const },
  ], [t]);

  const filtered = useMemo(() => {
    const normalize = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
    const query = normalize(searchText.trim());
    return locArticles.filter(a => a.status === 'published' && (activeCategory === 'all' || a.category === activeCategory) && (!query || normalize(`${a.title} ${a.excerpt || ''}`).includes(query)));
  }, [activeCategory, locArticles, searchText]);
  const featured = activeCategory === 'all' && !searchText.trim() ? filtered[0] : undefined;
  const rest = featured ? filtered.slice(1) : filtered;
  // Twelve articles at a time (auditoria de design, 14 nov 2026: the Journal
  // was 27 phone screens). The titles of the others are listed under the
  // grid, so every article keeps a link in the served HTML.
  const [visibleCount, setVisibleCount] = useState(JOURNAL_PAGE_SIZE);
  useEffect(() => { setVisibleCount(JOURNAL_PAGE_SIZE); }, [activeCategory, searchText]);

  if (!indexQuery.data) return <JournalRequestState failed={indexQuery.isError} retry={() => { void indexQuery.refetch(); }} />;

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <StructuredData id="blog-graph" data={blogGraph} />
      <Header />

      {/* Hero */}
      <section className="page-intro">
        <div className="container">
          <p className="text-[13px] font-medium text-pa-gold-aa mb-4 tracking-[0.08em]">{t('blog.overline')}</p>
          <h1 className="headline-xl text-[#1A1A18] mb-4">{t('blog.title')}</h1>
          <p className="body-lg text-pa-earth max-w-xl">
            {t('blog.subtitle')}
          </p>
        </div>
      </section>

      <div className="container py-6">
        <input type="search" value={searchText} onChange={e => setSearchText(e.target.value)} aria-label={t('siteUx.searchJournal')} placeholder={t('siteUx.searchJournal')} className="w-full max-w-xl min-h-12 border border-pa-sand rounded-lg bg-white px-4 text-base" />
      </div>
      {/* Category Filter */}
      <section className="border-b border-[#E8E4DC] sticky top-16 md:top-20 bg-[#FAFAF7]/95 backdrop-blur-md z-30">
        <div className="container">
          <div className="flex gap-1 overflow-x-auto no-scrollbar py-3">
            {CATEGORIES.map((cat, idx) => (
              <button
                key={`${cat.value}-${idx}`}
                onClick={() => setActiveCategory(cat.value)}
                className={`pa-action px-4 py-2 text-[15px] font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat.value
                    ? 'bg-[#1A1A18] text-white'
                    : 'text-pa-earth hover:text-[#1A1A18] hover:bg-[#F5F1EB]'
                }`}
                style={{ minHeight: '44px', minWidth: 'auto' }}
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
            <Link href={withEditorialTrip(`/blog/${featured.slug}`, search)} className="group block">
              <div className="grid md:grid-cols-2 gap-8 md:gap-12">
                <div className="aspect-[4/3] overflow-hidden rounded-xl bg-[#F5F1EB] relative">
                  <img
                    src={cdnResize(getArticleImage(featured), 1080)}
                    srcSet={cdnSrcSet(getArticleImage(featured), [400, 768, 1080])}
                    sizes="(min-width: 768px) 50vw, 100vw"
                    alt={featured.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="eager"
                    fetchPriority="high"
                    width={800}
                    height={600}
                    decoding="async"
                  />
                  {((featured as any).videoId || (featured as any).vimeoId) && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-16 h-16 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                        <Play className="w-7 h-7 text-[#1A1A18] ml-1" fill="#1A1A18" />
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex flex-col justify-center">
                  <p className="text-[13px] font-medium text-pa-gold-aa mb-3 tracking-[0.08em]">{blogCategoryLabel(featured.category, t).toUpperCase()}</p>
                  <h2 className="font-display text-[2rem] lg:text-[2.5rem] text-[#1A1A18] leading-tight mb-4 group-hover:text-pa-gold-aa transition-colors">
                    {featured.title}
                  </h2>
                  <p className="text-[16px] text-pa-earth font-normal leading-relaxed mb-6 line-clamp-3">{featured.excerpt}</p>
                  <div className="flex items-center gap-4 text-[13px] text-pa-stone mb-6">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {articleDate(featured.publishDate, i18n.language)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {featured.readTime} {t("blog.minRead")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[13px] font-medium tracking-[0.06em] text-pa-gold-aa group-hover:gap-3 transition-all">
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
              <p className="text-pa-stone">{t('blog.noArticles')}</p>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {rest.slice(0, visibleCount).map(article => (
                <Link key={article.id} href={withEditorialTrip(`/blog/${article.slug}`, search)} className="group block">
                  <div className="aspect-[4/3] overflow-hidden rounded-xl bg-[#F5F1EB] mb-4 relative">
                    <img
                      src={cdnResize(getArticleImage(article), 768)}
                      srcSet={cdnSrcSet(getArticleImage(article), [400, 640, 768])}
                      sizes="(min-width: 1024px) 30vw, (min-width: 768px) 45vw, 90vw"
                      alt={article.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                      width={800}
                      height={600}
                      decoding="async"
                    />
                    {((article as any).videoId || (article as any).vimeoId) && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-12 h-12 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                          <Play className="w-5 h-5 text-[#1A1A18] ml-0.5" fill="#1A1A18" />
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-[12px] font-medium text-pa-gold-aa mb-2 tracking-[0.08em]">{blogCategoryLabel(article.category, t).toUpperCase()}</p>
                  <h3 className="font-display text-[18px] text-[#1A1A18] mb-2 group-hover:text-pa-gold-aa transition-colors line-clamp-2">
                    {article.title}
                  </h3>
                  <p className="text-[15px] text-pa-earth font-normal line-clamp-2 mb-3">{article.excerpt}</p>
                  {/* One run of text that wraps between items, never inside
                      one ("30 de mar. de" / "2026" on two lines). */}
                  <p className="text-[13px] leading-relaxed text-pa-stone">
                    <span className="whitespace-nowrap">{articleDate(article.publishDate, i18n.language)}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="whitespace-nowrap">{article.readTime} {t("blog.minRead")}</span>
                    {article.author?.name && (<><span aria-hidden="true"> · </span><span className="whitespace-nowrap">{blogAuthorName(article.author, t)}</span></>)}
                  </p>
                </Link>
              ))}
            </div>
          )}
          {rest.length > visibleCount && (
            <>
              <div className="flex flex-col items-center gap-2 mt-12">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + JOURNAL_PAGE_SIZE)}
                  className="btn-ghost"
                >
                  {t('reviews.showMore', 'Show more')}
                </button>
                <p className="caption text-pa-stone tabular-nums" aria-live="polite">{visibleCount} / {rest.length}</p>
              </div>
              <nav aria-labelledby="more-articles-index" className="mt-12 border-t border-pa-sand pt-8">
                <h2 id="more-articles-index" className="eyebrow text-pa-stone mb-4">{t('blog.overline')}</h2>
                <ul className="columns-1 md:columns-2 gap-x-10 body-sm">
                  {rest.slice(visibleCount).map((article) => (
                    <li key={article.id} className="break-inside-avoid py-1">
                      <Link href={withEditorialTrip(`/blog/${article.slug}`, search)} className="text-pa-dark underline-offset-4 hover:underline">{article.title}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            </>
          )}
        </div>
      </section>

      <BookingCTA />
      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
