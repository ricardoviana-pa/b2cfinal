import { Link, useSearch } from 'wouter';
import { withEditorialTrip } from '@shared/editorialTripContext';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Waves, Users, PawPrint, Sun } from 'lucide-react';

const collections = [
  { slug: 'villas-with-private-pool', key: 'pool', Icon: Waves },
  { slug: 'large-group-villas', key: 'groups', Icon: Users },
  { slug: 'pet-friendly-villas', key: 'pets', Icon: PawPrint },
  { slug: 'sea-view-villas', key: 'sea', Icon: Sun },
] as const;

export default function StayCollections() {
  const { t } = useTranslation();
  const search = useSearch();
  return (
    <section className="bg-pa-warm border-y border-pa-sand py-10 md:py-14">
      <div className="container">
        <p className="eyebrow text-pa-gold-aa mb-3">{t('collections.eyebrow')}</p>
        <h2 className="headline-md text-pa-dark mb-6">{t('conversion.chooseStay')}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {collections.map(({ slug, key, Icon }) => (
            /* On a phone the tiles are 169 px wide: with 20 px of padding a
               15 px label such as "Traga o seu cão" or "Häuser mit Pool" broke
               in two beside a one-line neighbour. 16 px of padding and a 6 px
               gap to the arrow give the label the 8 px it lacked; the arrow
               stays on the first line when a label does need two. */
            <Link key={slug} href={withEditorialTrip(`/collections/${slug}`, search)} className="group flex flex-col gap-6 rounded-xl border border-pa-sand bg-white p-4 sm:p-5 hover:border-pa-gold transition-colors">
              <Icon size={22} className="text-pa-gold-aa" />
              <span className="flex items-start justify-between gap-1.5 sm:gap-2 body-sm text-pa-dark font-medium">{t(`conversion.${key}`)}<ArrowUpRight size={17} className="mt-[3px] shrink-0 group-hover:translate-x-0.5 transition-transform" /></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
