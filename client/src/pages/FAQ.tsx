/* ==========================================================================
   FAQ — V1.6 Redesign
   Hero, 9 questions, final CTA
   ========================================================================== */

import { useState, useMemo } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

function FAQItem({ item, id }: { item: { q: string; a: string }; id?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div id={id} className="border-b border-[#E8E4DC] scroll-mt-24">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left"
        style={{ minHeight: 'auto', minWidth: 'auto' }}
      >
        <span className="text-[16px] pr-6" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, color: '#1A1A18' }}>
          {item.q}
        </span>
        <ChevronDown
          size={18}
          className="shrink-0 transition-transform duration-300"
          style={{ color: '#8B7355', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
        />
      </button>
      <div
        className="overflow-hidden transition-all duration-300"
        style={{ maxHeight: open ? '400px' : '0', opacity: open ? 1 : 0 }}
      >
        <p className="body-md pb-5 pr-10">{item.a}</p>
      </div>
    </div>
  );
}

export default function FAQ() {
  const { t } = useTranslation();
  usePageMeta({ title: 'FAQ', description: 'Frequently asked questions about booking, services, and your stay.' });

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
    },
  ], [t]);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header variant="solid" />

      {/* Hero */}
      <section className="pt-28 pb-12 bg-white border-b border-[#E8E4DC]">
        <div className="container max-w-3xl">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('faq.overline')}</p>
          <h1 className="headline-xl text-[#1A1A18] mb-4">{t('faq.title')}</h1>
          <p className="body-lg text-[#6B6860]">{t('faq.subtitle')}</p>
        </div>
      </section>

      {/* Questions */}
      <section className="section-padding">
        <div className="container max-w-3xl">
          <div className="border-t border-[#E8E4DC]">
            {FAQ_ITEMS.map((item, idx) => (
              <FAQItem key={idx} item={item} id={item.q.includes('cancellation') ? 'cancellation' : undefined} />
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-3xl text-center">
          <p className="body-lg text-[#6B6860] mb-6">{t('faq.cantFind')}</p>
          <Link
            href="/contact"
            className="inline-flex items-center gap-2 rounded-full bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#333] transition-colors"
          >
            {t('faq.contactTeam')} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
