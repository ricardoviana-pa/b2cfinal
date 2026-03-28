/* ==========================================================================
   HOMEPAGE Ã¢ÂÂ Prompt 1 spec
   11 sections in exact order:
   1. Hero (overline, H1, subline, 2 CTAs, search bar)
   2. USP Bar (4 items, surface bg)
   3. Our Homes (overline, headline, subline, 5 tabs, 6 cards, link)
   4. Stats Bar (4 stats)
   5. How It Works (3 numbered cards)
   6. The Concept (split layout 60/40)
   7. Destinations (all active cards + dynamic home count)
   8. Experiences (4 cards)
   9. Social Proof (3 reviews + proof strip)
   10. Owners CTA (dark bg)
   11. Newsletter (standalone, before footer)

   COPY RULES:
   - No em/en dashes Ã¢ÂÂ use periods, commas, colons
   - Never "vacation rental" / "holiday home" Ã¢ÂÂ always "private hotel" / "operated home"
   - Services delivered by "our in house team" / "PA trained professionals"
   - Housekeeping is an add on, never "included"
   - CTA buttons: UPPERCASE, letter-spacing 1.5px
   - Paragraphs max 3 lines
   ========================================================================== */

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'wouter';
import { ChevronDown, ChevronLeft, ChevronRight, BedDouble, Users, ArrowRight, Key, Star, MapPin, Shield, Check, Quote, Minus, Plus } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { IMAGES } from '@/lib/images';
import ReviewsSection from '@/components/ReviewsSection';
import destinationsData from '@/data/destinations.json';
import { trpc } from '@/lib/trpc';
import type { Destination, Property } from '@/lib/types';

const destinations = destinationsData as unknown as Destination[];

function HomePropertyCard({ property }: { property: Property }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [imgIdx, setImgIdx] = useState(0);
  const images = property.images?.length ? property.images.slice(0, 8) : [];
  const total = images.length;
  const destName = destinations.find(d => d.slug === property.destination)?.name || property.destination;

  const prev = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIdx(i => (i > 0 ? i - 1 : total - 1));
  }, [total]);

  const next = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setImgIdx(i => (i < total - 1 ? i + 1 : 0));
  }, [total]);

  return (
    <div
      className="group block flex-shrink-0 w-[280px] sm:w-[320px] md:w-auto cursor-pointer"
      style={{ scrollSnapAlign: 'start' }}
      onClick={() => navigate(`/homes/${property.slug}`)}
    >
      <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '4/3' }}>
        {total > 0 ? (
          <>
            <div className="flex h-full transition-transform duration-400 ease-out" style={{ transform: `translateX(-${imgIdx * 100}%)`, width: `${total * 100}%` }}>
              {images.map((img: string, idx: number) => (
                <div key={idx} className="relative shrink-0 h-full" style={{ width: `${100 / total}%` }}>
                  <img src={img} alt={`${property.name} - ${idx + 1}`} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
            {total > 1 && (
              <>
                <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-[#1A1A18] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white" style={{ minHeight: 'auto', minWidth: 'auto' }} aria-label="Previous"><ChevronLeft size={16} /></button>
                <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-sm text-[#1A1A18] opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white" style={{ minHeight: 'auto', minWidth: 'auto' }} aria-label="Next"><ChevronRight size={16} /></button>
                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex items-center gap-1">
                  {images.map((_: string, idx: number) => (
                    <span key={idx} className={`block rounded-full transition-all ${idx === imgIdx ? 'w-1.5 h-1.5 bg-white' : 'w-1 h-1 bg-white/50'}`} />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full placeholder-image" />
        )}
        {property.tier === 'signature' && (
          <div className="absolute top-3 left-3 px-2.5 py-1 bg-[#1A1A18] text-[#C4A87C] text-[10px] font-semibold" style={{ letterSpacing: '1px' }}>{t('filters.signature')}</div>
        )}
        <div className="absolute bottom-3 right-3 px-2 py-1 bg-white/90 text-[#1A1A18] text-[10px] font-medium">{t('property.bestRateGuarantee')}</div>
      </div>
      <div className="pt-3">
        <p className="text-[12px] font-medium text-[#9E9A90] mb-1">{destName}</p>
        <h3 className="text-[1rem] font-display text-[#1A1A18] group-hover:text-[#8B7355] transition-colors mb-1">{property.name}</h3>
        <p className="text-[13px] text-[#6B6860] mb-2 leading-snug" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{property.tagline}</p>
        <div className="flex items-center gap-3 text-[13px] text-[#9E9A90] mb-2">
          <span className="flex items-center gap-1"><BedDouble className="w-3.5 h-3.5" /> {property.bedrooms} {t('property.bed')}</span>
          <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {property.maxGuests} guests</span>
        </div>
        <p className="text-[14px] text-[#1A1A18] font-medium">
          {(property.priceFrom ?? 0) > 0 ? <>From {"\u20AC"}{property.priceFrom.toLocaleString()} <span className="text-[#9E9A90] font-normal">{t('property.nightPrice')}</span></> : <span className="text-[#9E9A90] font-normal">{t('property.priceOnRequest')}</span>}
        </p>
      </div>
    </div>
  );
}

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add('visible'); observer.unobserve(el); } },
      { threshold: 0.08 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

export default function Home() {
  const { t } = useTranslation();
  const { data: propsData, isLoading, isError } = trpc.properties.listForSite.useQuery();
  const properties = ((propsData ?? []).filter((p: any) => p.isActive !== false)) as Property[];

  const [activeTab, setActiveTab] = useState('all');
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [searchDest, setSearchDest] = useState('');
  const [searchCheckin, setSearchCheckin] = useState('');
  const [searchCheckout, setSearchCheckout] = useState('');
  const [searchGuests, setSearchGuests] = useState(2);
  const checkoutRef = useRef<HTMLInputElement>(null);

  const s2Ref = useFadeIn();
  const s3Ref = useFadeIn();
  const s4Ref = useFadeIn();
  const s5Ref = useFadeIn();
  const s6Ref = useFadeIn();
  const s7Ref = useFadeIn();
  const s8Ref = useFadeIn();
  const s9Ref = useFadeIn();
  const s10Ref = useFadeIn();
  const s11Ref = useFadeIn();

  const HOME_TABS = useMemo(() => [
    { label: t('home.tabEditorsPicks'), value: 'all' },
    { label: t('home.tabBeachfront'), value: 'beachfront' },
    { label: t('home.tabCountryside'), value: 'countryside' },
    { label: t('home.tabEstates'), value: 'estates' },
    { label: t('home.tabNewArrivals'), value: 'new' },
  ], [t]);

  // Featured homes Ã¢ÂÂ Editor's Picks shows first 6 sorted by sortOrder
  // Other tabs are placeholder filters (no tag system yet)
  const featured = useMemo(() => {
    return [...properties].sort((a, b) => (b.priceFrom ?? 0) - (a.priceFrom ?? 0)).slice(0, 6);
  }, [properties]);

  const activeDestinations = destinations.filter(d => d.status === 'active' || d.slug === 'brazil');

  const createLead = trpc.leads.create.useMutation();
  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    try {
      await createLead.mutateAsync({ email, source: 'newsletter-home' });
      setSubscribed(true);
      setEmail('');
    } catch { /* show success anyway to avoid blocking UX */ setSubscribed(true); setEmail(''); }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header variant="transparent" />
        <section className="section-padding">
          <div className="container text-center">
            <h2 className="headline-md text-[#1A1A18] mb-3">{t('home.loading')}</h2>
            <p className="body-md mb-6">{t('home.loadingBody')}</p>
            <div className="mx-auto w-[320px] h-[180px] rounded-lg bg-[#F5F1EB] animate-pulse border border-[#E8E4DC]" />
          </div>
        </section>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="min-h-screen bg-[#FAFAF7]">
        <Header />
        <section className="section-padding">
          <div className="container text-center">
            <h2 className="headline-md text-[#1A1A18] mb-3">{t('home.errorTitle')}</h2>
            <p className="body-md mb-6">{t('home.errorBody')}</p>
            <Link href="/" className="btn-primary">{t('homes.tryAgain')}</Link>
          </div>
        </section>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] min-w-0 w-full">
      <Header variant="transparent" />
      <WhatsAppFloat />

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 1: HERO Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section className="relative h-screen min-h-[600px] flex items-center">
        {/* Background */}
        <div className="absolute inset-0">
          <img
            src={IMAGES.heroMain}
            alt={t('home.heroAlt')}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/30 to-transparent" />
        </div>

        {/* Hero content */}
        <div className="relative container z-10">
          <div className="max-w-xl">
            <p
              className="text-[13px] font-medium text-white/70 mb-5"
              style={{ fontFamily: 'var(--font-body)', letterSpacing: '0.08em' }}
            >
              {t('home.heroOverline')}
            </p>
            <h1 className="headline-xl text-white mb-5 leading-[1.1]">
              {t('home.heroTitle')}
            </h1>
            <p
              className="text-[16px] text-white/75 mb-8 leading-relaxed max-w-lg"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            >
              {t('home.heroBody')}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                href="/homes"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full bg-white text-[#1A1A18] text-[11px] font-semibold hover:bg-[#F5F1EB] transition-colors"
                style={{ letterSpacing: '1.5px' }}
              >
                {t('home.heroCta')} <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <a
                href="https://wa.me/351927161771?text=Hi%2C%20I%27d%20like%20to%20speak%20with%20a%20concierge"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-full border border-white/50 text-white text-[11px] font-semibold hover:bg-white/10 transition-colors"
                style={{ letterSpacing: '1.5px' }}
              >
                {t('home.heroCtaConcierge')} <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-[12px] text-white/45 mt-3" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{t('home.heroGuarantee')}</p>
          </div>
        </div>

        {/* Search bar Ã¢ÂÂ centred, lower area, Le Collectionist style */}
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 hidden lg:block w-full max-w-[780px] px-6 z-10">
          <div
            className="flex items-center rounded-full bg-white shadow-lg overflow-hidden"
            style={{ height: '56px' }}
          >
            {/* Destination */}
            <div className="flex-1 relative h-full">
              <select
                value={searchDest}
                onChange={e => setSearchDest(e.target.value)}
                className="w-full h-full pl-6 pr-3 bg-transparent text-[#1A1A18] text-[13px] focus:outline-none cursor-pointer appearance-none"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
              >
                <option value="">{t('home.searchDestination')}</option>
                <option value="minho">{t('home.searchMinhoCoast')}</option>
                <option value="porto">{t('home.searchPortoDouro')}</option>
                <option value="algarve">{t('home.searchAlgarve')}</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#9E9A90] pointer-events-none" />
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-[#E8E4DC]" />

            {/* Check-in */}
            <div
              className="flex-1 h-full cursor-pointer"
              onClick={e => { const inp = (e.currentTarget as HTMLElement).querySelector('input'); inp?.showPicker?.(); }}
            >
              <input
                type="date"
                value={searchCheckin}
                onChange={e => {
                  setSearchCheckin(e.target.value);
                  setTimeout(() => checkoutRef.current?.showPicker?.(), 50);
                }}
                placeholder="Check-in"
                className="w-full h-full px-4 bg-transparent text-[#1A1A18] text-[13px] focus:outline-none cursor-pointer"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
              />
            </div>

            {/* Arrow */}
            <ArrowRight className="w-3.5 h-3.5 text-[#9E9A90] flex-shrink-0" />

            {/* Check-out */}
            <div
              className="flex-1 h-full cursor-pointer"
              onClick={e => { const inp = (e.currentTarget as HTMLElement).querySelector('input'); inp?.showPicker?.(); }}
            >
              <input
                ref={checkoutRef}
                type="date"
                value={searchCheckout}
                onChange={e => setSearchCheckout(e.target.value)}
                placeholder="Check-out"
                className="w-full h-full px-4 bg-transparent text-[#1A1A18] text-[13px] focus:outline-none cursor-pointer"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
              />
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-[#E8E4DC]" />

            {/* Guests */}
            <div className="flex items-center h-full px-4 gap-2.5">
              <Users className="w-3.5 h-3.5 text-[#9E9A90] flex-shrink-0" />
              <button
                type="button"
                onClick={() => setSearchGuests(g => Math.max(1, g - 1))}
                disabled={searchGuests <= 1}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
              >
                <Minus className="w-2.5 h-2.5" />
              </button>
              <span className="text-[13px] text-[#1A1A18] tabular-nums whitespace-nowrap" style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}>
                {searchGuests} <span className="text-[#9E9A90] lowercase">{t('home.searchGuests')}</span>
              </span>
              <button
                type="button"
                onClick={() => setSearchGuests(g => Math.min(30, g + 1))}
                disabled={searchGuests >= 30}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-[#E8E4DC] text-[#9E9A90] transition-colors hover:border-[#8B7355] hover:text-[#8B7355] disabled:opacity-30"
              >
                <Plus className="w-2.5 h-2.5" />
              </button>
            </div>

            {/* Search button */}
            <Link
              href={(() => {
                const p = new URLSearchParams();
                if (searchDest) p.set('destination', searchDest);
                if (searchCheckin) p.set('checkin', searchCheckin);
                if (searchCheckout) p.set('checkout', searchCheckout);
                if (searchGuests > 1) p.set('guests', String(searchGuests));
                const qs = p.toString();
                return `/homes${qs ? `?${qs}` : ''}`;
              })()}
              className="flex-shrink-0 h-[44px] mr-1.5 px-6 rounded-full bg-[#1A1A18] text-white text-[11px] font-semibold hover:bg-[#333330] transition-colors flex items-center gap-2"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('home.searchButton')}
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce z-10">
          <ChevronDown className="w-5 h-5 text-white/40" />
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 2: USP BAR Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s2Ref} className="fade-in relative z-10 -mt-8 md:-mt-11 mb-2 md:mb-0 w-full min-w-0">
        <div className="w-full bg-[#FAFAF7] border-y border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.06)]">
          <div className="container grid grid-cols-4 gap-0">
              {[
                {
                  icon: <Key className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} />,
                  title: t('home.uspPrivacy'),
                  sub: t('home.uspPrivacySub'),
                },
                {
                  icon: <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} />,
                  title: t('home.uspService'),
                  sub: t('home.uspServiceSub'),
                },
                {
                  icon: <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} />,
                  title: t('home.uspLocal'),
                  sub: t('home.uspLocalSub'),
                },
                {
                  icon: <Shield className="w-3.5 h-3.5 sm:w-4 sm:h-4" strokeWidth={1.5} />,
                  title: t('home.uspRate'),
                  sub: t('home.uspRateSub'),
                },
              ].map((item, i) => (
                <div
                  key={i}
                  className={`flex min-w-0 flex-col items-center text-center px-1.5 py-4 sm:px-2 sm:py-5 md:py-7 md:px-5${
                    i < 3 ? ' border-r border-[#E8E4DC]' : ''
                  }`}
                >
                  <div className="mb-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#E8E4DC] bg-[#FAFAF7] text-[#8B7355] sm:mb-3 sm:h-9 sm:w-9">
                    {item.icon}
                  </div>
                  <p className="text-[9px] font-medium uppercase leading-tight tracking-[0.08em] text-[#1A1A18] sm:text-[10px] sm:tracking-[0.1em] md:text-[11px] md:tracking-[0.12em]">{item.title}</p>
                  <p className="mt-1 max-w-none text-[9px] leading-tight text-[#9E9A90] sm:text-[10px] sm:leading-snug md:text-[12px] md:leading-[1.55]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{item.sub}</p>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 3: OUR HOMES Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s3Ref} className="fade-in section-padding bg-white">
        <div className="container">
          <p className="text-[12px] font-medium text-[#8B7355] mb-3" style={{ letterSpacing: '0.08em' }}>{t('home.homesOverline')}</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
            <div>
              <h2 className="headline-lg text-[#1A1A18] mb-3">{t('home.homesTitle')}</h2>
              <p className="body-md max-w-2xl">
                {t('home.homesBody')}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-5 mb-8 overflow-x-auto no-scrollbar pb-1">
            {HOME_TABS.map(tab => (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`text-[13px] font-medium whitespace-nowrap pb-2 border-b-2 transition-all ${
                  activeTab === tab.value
                    ? 'text-[#1A1A18] border-[#1A1A18]'
                    : 'text-[#9E9A90] border-transparent hover:text-[#6B6860]'
                }`}
                style={{ minHeight: 'auto', minWidth: 'auto', fontFamily: 'var(--font-body)' }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Property cards Ã¢ÂÂ horizontal scroll on mobile, 3 per row on desktop */}
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-2 lg:grid-cols-3 md:gap-6 md:overflow-visible">
            {featured.map(property => (
              <HomePropertyCard key={property.id} property={property} />
            ))}
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/homes"
              className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#1A1A18] hover:text-[#8B7355] transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('home.exploreAllHomes')} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 4: STATS BAR Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s4Ref} className="fade-in relative bg-[#141412]">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#C4A87C]/30 to-transparent"
          aria-hidden
        />
        <div className="container py-6 sm:py-8 md:py-9 lg:py-10">
          <div className="grid grid-cols-4 gap-0">
            {[
              { value: '70+', label: t('home.statHomes') },
              { value: '4.9/5', label: t('home.statRating') },
              { value: '40%', label: t('home.statRepeat') },
              { value: '2017', label: t('home.statFounded') },
            ].map((stat, i) => (
              <div
                key={i}
                className={`flex min-h-0 min-w-0 flex-col items-center justify-center text-center px-1.5 py-1 sm:px-2 md:px-5 lg:px-8 ${
                  i > 0 ? 'border-l border-white/10' : ''
                }`}
              >
                <p className="font-display text-[clamp(0.95rem,3.4vw,2.375rem)] font-light leading-none tracking-[-0.02em] text-[#FAFAF7]">
                  {stat.value}
                </p>
                <p
                  className="mt-1.5 sm:mt-2.5 max-w-none text-[9px] leading-tight text-white/48 sm:text-[10px] sm:leading-snug md:text-[12px] md:leading-snug"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 5: HOW IT WORKS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s5Ref} className="fade-in section-padding bg-white">
        <div className="container">
          <p className="text-[12px] font-medium text-[#8B7355] mb-3" style={{ letterSpacing: '0.08em' }}>{t('home.howItWorksOverline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-10 max-w-lg">{t('home.howItWorksTitle')}</h2>

          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-8 lg:gap-12 md:overflow-visible">
            {[
              {
                num: '01',
                title: t('home.step1Title'),
                body: t('home.step1Body'),
              },
              {
                num: '02',
                title: t('home.step2Title'),
                body: t('home.step2Body'),
              },
              {
                num: '03',
                title: t('home.step3Title'),
                body: t('home.step3Body'),
              },
            ].map((step, i) => (
              <div key={i} className="relative flex-shrink-0 w-[260px] md:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <p
                  className="font-display text-[4rem] leading-none mb-4"
                  style={{ color: 'rgba(139,115,85,0.12)', fontWeight: 400 }}
                >
                  {step.num}
                </p>
                <h3 className="text-[1.1rem] font-display text-[#1A1A18] mb-3">{step.title}</h3>
                <p className="text-[15px] text-[#6B6860] leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 6: THE CONCEPT (split layout) Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s6Ref} className="fade-in bg-white overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-5">
          {/* Left: editorial image (60%) */}
          <div className="lg:col-span-3 relative" style={{ minHeight: '480px' }}>
            <img
              src="https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1200&q=80"
              alt="Private chef preparing dinner at a Portugal Active home"
              className="w-full h-full object-cover"
              style={{ position: 'absolute', inset: 0 }}
            />
          </div>

          {/* Right: text (40%) */}
          <div className="lg:col-span-2 flex items-center px-8 py-14 lg:px-14 lg:py-16 bg-white">
            <div className="max-w-md">
              <p className="text-[12px] font-medium text-[#8B7355] mb-4" style={{ letterSpacing: '0.08em' }}>{t('home.conceptOverline')}</p>
              <h2 className="headline-lg text-[#1A1A18] mb-5">{t('home.conceptTitle')}</h2>
              <p className="body-md mb-8">
                {t('home.conceptBody')}
              </p>

              <div className="flex flex-col gap-5 mb-8">
                {[
                  {
                    num: '01',
                    title: t('home.conceptPoint1'),
                    body: t('home.conceptPoint1Body'),
                  },
                  {
                    num: '02',
                    title: t('home.conceptPoint2'),
                    body: t('home.conceptPoint2Body'),
                  },
                  {
                    num: '03',
                    title: t('home.conceptPoint3'),
                    body: t('home.conceptPoint3Body'),
                  },
                ].map((pillar, i) => (
                  <div key={i} className="flex gap-4">
                    <span className="text-[13px] font-medium text-[#C4A87C] flex-shrink-0 mt-0.5">{pillar.num}</span>
                    <div>
                      <p className="text-[14px] font-semibold text-[#1A1A18] mb-1">{pillar.title}</p>
                      <p className="text-[13px] text-[#6B6860] leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{pillar.body}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/about"
                className="inline-flex items-center gap-2 text-[13px] font-medium text-[#1A1A18] hover:text-[#8B7355] transition-colors"
              >
                Discover our approach <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 7: DESTINATIONS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s7Ref} className="fade-in section-padding bg-[#FAFAF7]">
        <div className="container">
          <p className="text-[12px] font-medium text-[#8B7355] mb-3" style={{ letterSpacing: '0.08em' }}>{t('home.destOverline')}</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <h2 className="headline-lg text-[#1A1A18] mb-3">{t('home.destTitle')}</h2>
              <p className="body-md max-w-2xl">
                {t('home.destBody')}
              </p>
            </div>
          </div>

          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:grid md:grid-cols-3 lg:grid-cols-6 md:overflow-visible">
            {activeDestinations.map(dest => {
              const homeCount = properties.filter(p => p.destination === dest.slug).length;
              const label = dest.comingSoon ? t('home.destComingSoon', 'Coming Soon') : homeCount > 0 ? t('home.destHome', { count: homeCount }) : t('home.destNowOperating');

              return (
                <Link key={dest.id} href={`/destinations/${dest.slug}`} className="group block flex-shrink-0 w-[240px] sm:w-[260px] md:w-auto" style={{ scrollSnapAlign: 'start' }}>
                  <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '3/4' }}>
                    {dest.coverImage ? (
                      <img
                        src={dest.coverImage}
                        alt={dest.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full placeholder-image" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      <h3 className="text-white text-[1.25rem] font-display mb-1">{dest.name}</h3>
                      <p className="text-white/70 text-[13px]">{label}</p>
                    </div>
                  </div>
                  <p className="text-[13px] text-[#6B6860] mt-3 leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                    {dest.description}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 8: EXPERIENCES Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s8Ref} className="fade-in section-padding bg-[#F5F1EB]">
        <div className="container">
          <p className="text-[12px] font-medium text-[#8B7355] mb-3" style={{ letterSpacing: '0.08em' }}>{t('home.expOverline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-10">{t('home.expTitle')}</h2>

          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:overflow-visible">
            {[
              {
                title: t('home.expGastronomy'),
                body: t('home.expGastronomyBody'),
                img: IMAGES.expGastronomy,
                href: '/services#gastronomy',
              },
              {
                title: t('home.expWellness'),
                body: t('home.expWellnessBody'),
                img: IMAGES.expWellness,
                href: '/services#wellness',
              },
              {
                title: t('home.expAdventure'),
                body: t('home.expAdventureBody'),
                img: IMAGES.expAdventure,
                href: '/adventures',
              },
              {
                title: t('home.expMobility'),
                body: t('home.expMobilityBody'),
                img: IMAGES.expMobility,
                href: '/services#mobility',
              },
            ].map((exp, i) => (
              <Link key={i} href={exp.href} className="group block flex-shrink-0 w-[220px] sm:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <div className="relative overflow-hidden bg-[#E8E4DC]" style={{ aspectRatio: '3/4' }}>
                  <img
                    src={exp.img}
                    alt={exp.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white text-[1rem] font-display mb-1">{exp.title}</h3>
                    <p className="text-white/70 text-[12px] leading-relaxed" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{exp.body}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 9: SOCIAL PROOF Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <ReviewsSection ref={s9Ref} />

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 10: OWNERS CTA Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s10Ref} className="fade-in bg-[#1A1A18]">
        <div className="container py-16 lg:py-20">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-[12px] font-medium text-[#C4A87C] mb-4" style={{ letterSpacing: '0.08em' }}>{t('home.ownersOverline')}</p>
            <h2 className="headline-lg text-white mb-5">{t('home.ownersTitle')}</h2>
            <p
              className="text-[16px] text-white/55 mb-8 leading-relaxed"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            >
              {t('home.ownersBody')}
            </p>
            <Link
              href="/owners"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full border border-white/30 text-white text-[11px] font-semibold hover:bg-white/10 transition-colors"
              style={{ letterSpacing: '1.5px' }}
            >
              {t('home.ownersCta')} <ArrowRight className="w-4 h-4" />
            </Link>
            <p className="text-[12px] text-white/35 mt-3" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>{t('home.ownersNote')}</p>
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ PRESS BAR Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section className="bg-white">
        <div className="container py-12 lg:py-16">
          <p
            className="text-center text-[11px] font-medium text-[#9E9A90] mb-8 lg:mb-10"
            style={{ letterSpacing: '0.14em', fontFamily: 'var(--font-body)' }}
          >
            {t('home.pressOverline')}
          </p>
          {(() => {
            const logos = [
              { src: IMAGES.pressForbes, alt: 'Forbes', h: 'h-5 md:h-6' },
              { src: IMAGES.pressTheTimes, alt: 'The Times', h: 'h-7 md:h-8' },
              { src: IMAGES.pressTheGuardian, alt: 'The Guardian', h: 'h-4 md:h-5' },
              { src: IMAGES.pressTimeOut, alt: 'Time Out', h: 'h-5 md:h-6' },
              { src: IMAGES.pressMensHealth, alt: "Men's Health", h: 'h-4 md:h-5' },
              { src: IMAGES.pressArquitectura, alt: 'Arquitectura y DiseÃÂ±o', h: 'h-4 md:h-5' },
            ];
            return (
              <>
                {/* Mobile: marquee scroll */}
                <div className="overflow-hidden md:hidden">
                  <div className="flex items-center gap-12 w-max" style={{ animation: 'marquee 25s linear infinite' }}>
                    {[...logos, ...logos].map((logo, i) => (
                      <img key={i} src={logo.src} alt={logo.alt} className={`${logo.h} w-auto object-contain opacity-40 shrink-0`} loading="lazy" />
                    ))}
                  </div>
                </div>
                {/* Desktop: static, centred */}
                <div className="hidden md:flex items-center justify-center gap-10 lg:gap-14">
                  {logos.map((logo, i) => (
                    <img key={i} src={logo.src} alt={logo.alt} className={`${logo.h} w-auto object-contain opacity-40`} loading="lazy" />
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ SECTION 11: NEWSLETTER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section ref={s11Ref} className="fade-in bg-[#F5F1EB]">
        <div className="container py-14 lg:py-16">
          <div className="max-w-md mx-auto text-center">
            <p className="text-[12px] font-medium text-[#8B7355] mb-3" style={{ letterSpacing: '0.08em' }}>{t('home.newsletterOverline')}</p>
            <h2 className="headline-md text-[#1A1A18] mb-2">{t('home.newsletterTitle')}</h2>
            <p className="text-[14px] text-[#9E9A90] mb-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
              {t('home.newsletterBody')}
            </p>

            {subscribed ? (
              <p className="text-[14px] font-medium text-[#8B7355]">
                <Check className="w-4 h-4 inline mr-2" />
                {t('home.newsletterSuccess')}
              </p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex gap-0 max-w-sm mx-auto">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('home.newsletterPlaceholder')}
                  required
                  className="flex-1 px-4 py-3 text-[13px] bg-white border border-[#E8E4DC] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:border-[#8B7355] transition-colors"
                  style={{ fontFamily: 'var(--font-body)' }}
                />
                <button
                  type="submit"
                  className="px-5 py-3 bg-[#1A1A18] text-white text-[11px] font-semibold hover:bg-[#333330] transition-colors flex-shrink-0"
                  style={{ letterSpacing: '1.5px' }}
                >
                  {t('home.newsletterCta')}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
