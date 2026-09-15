import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';

export default function BookingCTA({ href = '/homes' }: { href?: string }) {
  const { t } = useTranslation();
  return <section className="bg-pa-warm border-t border-pa-sand py-12 md:py-16">
    <div className="container flex flex-col md:flex-row md:items-center justify-between gap-6">
      <div className="max-w-xl">
        <h2 className="headline-md text-pa-dark mb-3">{t('siteUx.readyTitle')}</h2>
        <p className="body-md">{t('siteUx.readyBody')}</p>
      </div>
      <Link href={href} className="btn-primary self-start md:shrink-0">{t('siteUx.findStay')} <ArrowRight className="w-4 h-4" /></Link>
    </div>
  </section>;
}
