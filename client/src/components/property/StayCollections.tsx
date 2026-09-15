import { Link } from 'wouter';
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
  return (
    <section className="bg-pa-warm border-y border-pa-sand py-10 md:py-14">
      <div className="container">
        <p className="eyebrow text-pa-gold-aa mb-3">{t('collections.eyebrow')}</p>
        <h2 className="headline-md text-pa-dark mb-6">{t('conversion.chooseStay')}</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {collections.map(({ slug, key, Icon }) => (
            <Link key={slug} href={`/collections/${slug}`} className="group flex flex-col gap-6 rounded-xl border border-pa-sand bg-white p-5 hover:border-pa-gold transition-colors">
              <Icon size={22} className="text-pa-gold-aa" />
              <span className="flex items-center justify-between gap-2 body-sm text-pa-dark font-medium">{t(`conversion.${key}`)}<ArrowUpRight size={17} className="shrink-0 group-hover:translate-x-0.5 transition-transform" /></span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
