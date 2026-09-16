import { corporateSchema, type CorporateCopy } from '@shared/corporateSchema';
import { Link } from 'wouter';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { usePageMeta } from '@/hooks/usePageMeta';
import { StructuredData, buildBreadcrumbSchema } from '@/components/seo/StructuredData';
import { corporatePlanning, corporateEnquiryHref } from '@/data/corporatePlanning';

export default function CorporateRetreats() {
  const { t, i18n } = useTranslation();
  const title = t('corporate.title');
  const description = t('corporate.intro');
  const planning = corporatePlanning(i18n.language);

  usePageMeta({ title: `${title} | Portugal Active`, description, url: '/corporate-retreats', image: '/events/event-corporate-retreats.webp' });
  const faqs = [1, 2].map(n => ({ question: t(`corporate.faq${n}q`), answer: t(`corporate.faq${n}a`) }));
  const cta = <Link href="/contact?subject=events&intent=corporate" className="btn-primary">{t('destinationGrowth.corporateCta')} <ArrowRight className="w-4 h-4" /></Link>;
  return <div className="min-h-screen bg-pa-paper">
    <StructuredData id="corporate" data={[
      ...corporateSchema(t('corporate', {returnObjects:true}) as CorporateCopy, i18n.language.split('-')[0]),
      buildBreadcrumbSchema([{ name: t('nav.home'), item: '/' }, { name: t('nav.events'), item: '/events' }, { name: title }]),
    ]} />
    <Header variant="solid" />
    <section className="page-intro">
      <div className="container grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        <div>
          <Link href="/events" className="inline-flex min-h-11 items-center text-sm text-pa-brown mb-3">← {t('nav.events')}</Link>
          <h1 className="headline-lg mb-6">{title}</h1>
          <p className="body-lg mb-7">{description}</p>
          {cta}
        </div>
        <img src="/events/event-corporate-retreats.webp" alt={t('events.typeCorporate')} width={800} height={533} fetchPriority="high" className="w-full aspect-[3/2] object-cover rounded-xl" />
      </div>
    </section>
    {planning && <section className="container py-12 lg:py-16">
      <h2 className="headline-lg max-w-3xl mb-4">{planning.title}</h2>
      <p className="body-md max-w-2xl mb-8">{planning.intro}</p>
      <div className="grid md:grid-cols-3 gap-5">
        {planning.formats.map(format => <div key={format.id} className="flex flex-col rounded-xl border border-pa-sand bg-white p-6 lg:p-8">
          <h3 className="font-display text-2xl mb-4">{format.title}</h3>
          <p className="body-md mb-6 flex-1">{format.text}</p>
          <Link href={corporateEnquiryHref(format.id)} className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-pa-brown">{format.cta}<ArrowRight className="w-4 h-4 shrink-0" /></Link>
        </div>)}
      </div>
      <p className="text-sm text-pa-stone-aa max-w-3xl mt-5">{planning.note}</p>
    </section>}
    <section className="container py-12 lg:py-16">
      <h2 className="headline-lg mb-9">{t('corporate.planTitle')}</h2>
      <ol className="grid md:grid-cols-3 gap-8">
        {['brief', 'venue', 'programme'].map((key, index) => <li key={key} className="border-t border-pa-sand pt-5">
          <span className="font-display text-3xl text-pa-brown">0{index+1}</span>
          <p className="body-md mt-4">{t(`corporate.${key}`)}</p>
        </li>)}
      </ol>
      <div className="flex flex-wrap gap-x-7 gap-y-2 mt-8">
        <Link href="/destinations/minho" className="btn-ghost">{t('destinations.minho')} <ArrowRight className="w-4 h-4" /></Link>
        <Link href="/experiences" className="btn-ghost">{t('nav.experiences')} <ArrowRight className="w-4 h-4" /></Link>
        <Link href="/concierge" className="btn-ghost">{t('nav.concierge')} <ArrowRight className="w-4 h-4" /></Link>
      </div>
    </section>
    {planning && <section className="container pb-12 lg:pb-16">
      <h2 className="headline-md mb-6">{planning.guides}</h2>
      <div className="grid md:grid-cols-2 gap-5">
        {planning.guideLinks.map(guide => <Link key={guide.slug} href={`/blog/${guide.slug}`} className="group flex items-center justify-between gap-6 rounded-xl border border-pa-sand p-6 hover:bg-white transition-colors">
          <span className="font-display text-xl">{guide.title}</span><ArrowRight className="w-5 h-5 shrink-0 text-pa-brown" />
        </Link>)}
      </div>
    </section>}
    <section className="bg-white border-y border-pa-sand py-12">
      <div className="container max-w-4xl">
        <h2 className="headline-md mb-6">{t('contact.faqTitle')}</h2>
        {faqs.map(f => <details key={f.question} className="site-faq border-b border-pa-sand"><summary>{f.question}</summary><p className="body-md pb-6">{f.answer}</p></details>)}
        <div className="mt-8">{cta}</div>
      </div>
    </section>
    <Footer />
  </div>;
}
