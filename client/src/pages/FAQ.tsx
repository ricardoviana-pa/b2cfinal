/* ==========================================================================
   FAQ — V1.6 Redesign
   Hero, 9 questions, final CTA
   ========================================================================== */

import { useState, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import FAQItem from '@/components/ui/FaqItem';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema, buildFaqPageSchema } from '@/components/seo/StructuredData';

export default function FAQ() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const normalize = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  usePageMeta({ title: 'FAQ | Booking, Check-in & Villa Services Explained', description: 'Answers to common questions about booking, check-in, cancellation, concierge services, and what to expect at your villa.', url: '/faq' });

  const FAQ_ITEMS = useMemo(() => [
    {
      q: t('faq.q1'),
      a: t('faq.a1'),
    },
    {
      q: t('faq.q2'),
      a: t('faq.a2'),
    },
    {
      q: t('faq.q3'),
      a: t('faq.a3'),
    },
    {
      q: t('faq.q4'),
      a: t('faq.a4'),
    },
    {
      q: t('faq.q5'),
      a: t('faq.a5'),
    },
    {
      q: t('faq.q6'),
      a: t('faq.a6'),
    },
    {
      q: t('faq.q7'),
      a: t('faq.a7'),
    },
    {
      q: t('faq.q8'),
      a: t('faq.a8'),
    },
    {
      q: t('faq.q9'),
      a: t('faq.a9'),
      link: { href: '/best-rate-guarantee', label: t('trust.guaranteeTerms', 'How the guarantee works') },
    },
    {
      q: t('faq.q10'),
      a: t('faq.a10'),
    },
    { q: t('securityDeposit.title'), a: t('securityDeposit.notice') },
  ], [t]);

  const filteredQuestions = FAQ_ITEMS.map((item, index) => ({ item, index })).filter(({ item }) => normalize(`${item.q} ${item.a}`).includes(normalize(query.trim())));

  const faqGraph = useMemo(
    () => [
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'FAQ' },
      ]),
      buildFaqPageSchema(FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a }))),
    ],
    [FAQ_ITEMS],
  );

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <StructuredData id="faq-graph" data={faqGraph} />
      <Header variant="solid" />

      {/* Hero */}
      <section className="page-intro">
        <div className="container max-w-3xl">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('faq.overline')}</p>
          <h1 className="headline-xl text-[#1A1A18] mb-4">{t('faq.title')}</h1>
          <p className="body-lg text-[#6B6860]">{t('faq.subtitle')}</p>
        </div>
      </section>

      {/* Questions */}
      <section className="section-padding">
        <div className="container max-w-3xl">
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} aria-label={t('siteUx.searchQuestions')} placeholder={t('siteUx.searchQuestions')} className="w-full min-h-12 rounded-lg border border-pa-sand bg-white px-4 mb-8 text-base" />
          <div className="border-t border-[#E8E4DC]">
            {filteredQuestions.map(({ item, index }) => <FAQItem key={index} item={item} id={index === 3 ? 'cancellation' : undefined} />)}
            {filteredQuestions.length === 0 && <p className="body-md py-6" role="status">{t('siteUx.noQuestions')}</p>}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-3xl text-center">
          <p className="body-lg text-[#6B6860] mb-6">{t('faq.cantFind')}</p>
          <div className="flex flex-wrap justify-center gap-3">
          <Link href="/homes" className="btn-primary">{t('siteUx.findStay')}</Link>
          <Link
            href="/contact"
            className="btn-ghost"
          >
            {t('faq.contactTeam')} <ArrowRight className="w-4 h-4" />
          </Link>
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
