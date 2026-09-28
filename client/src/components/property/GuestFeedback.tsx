/**
 * Homepage guest feedback: the latest review from up to 20 homes, in a
 * horizontal rail with arrows. The list is server-rendered (prefetched on
 * "/"), so every quote is in the HTML for crawlers; the arrows only move a
 * native scroll-snap track, no carousel library.
 */
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { getDisplayName } from '@/lib/format';

export default forwardRef<HTMLDivElement>(function GuestFeedback(_, ref) {
  const { t, i18n } = useTranslation();
  const { data } = trpc.properties.guestFeedback.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);
  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); };
  }, [measure, data?.length]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('article');
    const step = card ? card.offsetWidth + 16 : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step * (window.innerWidth >= 1024 ? 2 : 1), behavior: 'smooth' });
  };

  if (!data?.length) return null;
  const arrow = (dir: 1 | -1, disabled: boolean) => (
    <button
      type="button"
      onClick={() => page(dir)}
      disabled={disabled}
      aria-label={dir < 0 ? t('reviews.previous', 'Previous reviews') : t('reviews.next', 'Next reviews')}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-pa-sand bg-white text-pa-dark transition-colors hover:border-pa-gold hover:text-pa-gold-aa disabled:opacity-30 disabled:hover:border-pa-sand disabled:hover:text-pa-dark"
    >
      {dir < 0 ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
    </button>
  );

  return <section ref={ref} className="section-padding bg-white">
    <div className="container">
      <div className="flex items-end justify-between gap-6 mb-8">
        <div>
          <p className="eyebrow text-pa-gold-aa mb-3">{t('reviews.ourGuests')}</p>
          <h2 className="headline-lg text-pa-dark mb-3">{t('reviews.whatTheyRemember')}</h2>
          <p className="body-sm text-pa-earth">{t('conversion.recentFeedback')}</p>
        </div>
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {arrow(-1, edge.start)}
          {arrow(1, edge.end)}
        </div>
      </div>
    </div>
    {/* Same gutters as the container; the last visible card is cut off on the
        right so it reads as "there is more". The arrows do the rest. */}
    <div
      ref={track}
      className="container reviews-track flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory"
    >
      {data.map(r => <article key={r.property.slug} className="snap-start flex flex-col rounded-xl border border-pa-sand bg-pa-cream p-5 w-[82vw] sm:w-[360px] lg:w-[320px] shrink-0">
        <p className="body-sm text-pa-dark font-medium mb-3">{r.rating}/5</p>
        <blockquote className="body-sm text-pa-earth leading-relaxed line-clamp-6 flex-1">“{r.text}”</blockquote>
        <p className="caption text-pa-earth mt-4">{r.guestName || t('reviews.verifiedGuest')}{Date.parse(r.date) ? ` · ${new Date(r.date).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' })}` : ''}</p>
        <Link href={`/homes/${r.property.slug}#property-reviews`} className="body-sm font-medium text-pa-dark underline underline-offset-4 pt-3 min-h-11">{getDisplayName(r.property)}</Link>
      </article>)}
    </div>
    <div className="container mt-6 flex items-center gap-2 md:hidden">
      {arrow(-1, edge.start)}
      {arrow(1, edge.end)}
    </div>
  </section>;
});
