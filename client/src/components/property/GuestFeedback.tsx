import { forwardRef } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import { getDisplayName } from '@/lib/format';

export default forwardRef<HTMLDivElement>(function GuestFeedback(_, ref) {
  const { t, i18n } = useTranslation();
  const { data } = trpc.properties.guestFeedback.useQuery(undefined, { staleTime: 5 * 60 * 1000 });
  if (!data?.length) return null;
  return <section ref={ref} className="section-padding bg-white">
    <div className="container">
      <p className="eyebrow text-pa-gold-aa mb-3">{t('reviews.ourGuests')}</p>
      <h2 className="headline-lg text-pa-dark mb-3">{t('reviews.whatTheyRemember')}</h2>
      <p className="body-sm text-pa-earth mb-8">{t('conversion.recentFeedback')}</p>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {data.map(r => <article key={r.property.slug} className="flex flex-col rounded-xl border border-pa-sand bg-pa-cream p-5">
          <p className="body-sm text-pa-dark font-medium mb-3">{r.rating}/5</p>
          <blockquote className="body-sm text-pa-earth leading-relaxed line-clamp-5 flex-1">“{r.text}”</blockquote>
          <p className="caption text-pa-earth mt-4">{r.guestName || t('reviews.verifiedGuest')}{Date.parse(r.date) ? ` · ${new Date(r.date).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' })}` : ''}</p>
          <Link href={`/homes/${r.property.slug}#property-reviews`} className="body-sm font-medium text-pa-dark underline underline-offset-4 pt-3 min-h-11">{getDisplayName(r.property)}</Link>
        </article>)}
      </div>
    </div>
  </section>;
});
