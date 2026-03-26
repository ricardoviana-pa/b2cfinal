/* ==========================================================================
   OWNERS — V1.6 Redesign
   Hero, impact numbers, what we do, how it works, management link, form
   ========================================================================== */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, ExternalLink } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

export default function Owners() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);

  const WHAT_WE_DO = useMemo(() => [
    {
      title: t('owners.whatWeDo.0.title'),
      body: t('owners.whatWeDo.0.body'),
    },
    {
      title: t('owners.whatWeDo.1.title'),
      body: t('owners.whatWeDo.1.body'),
    },
    {
      title: t('owners.whatWeDo.2.title'),
      body: t('owners.whatWeDo.2.body'),
    },
    {
      title: t('owners.whatWeDo.3.title'),
      body: t('owners.whatWeDo.3.body'),
    },
  ], [t]);

  const HOW_IT_WORKS = useMemo(() => [
    {
      step: '01',
      title: t('owners.howItWorks.0.title'),
      body: t('owners.howItWorks.0.body'),
    },
    {
      step: '02',
      title: t('owners.howItWorks.1.title'),
      body: t('owners.howItWorks.1.body'),
    },
    {
      step: '03',
      title: t('owners.howItWorks.2.title'),
      body: t('owners.howItWorks.2.body'),
    },
    {
      step: '04',
      title: t('owners.howItWorks.3.title'),
      body: t('owners.howItWorks.3.body'),
    },
  ], [t]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />

      {/* Hero */}
      <section className="relative h-[60vh] min-h-[400px] flex items-end overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1600&q=80"
          alt="Portugal Active property management"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-black/10" />
        <div className="relative container pb-12 lg:pb-20 z-10">
          <h1 className="headline-xl text-white mb-4 max-w-2xl">
            {t('owners.hero.title')}
          </h1>
          <p className="body-lg max-w-xl mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {t('owners.hero.description')}
          </p>
          <a
            href="#contact-form"
            className="inline-flex items-center gap-2 rounded-full bg-white text-[#1A1A18] text-[12px] tracking-[0.08em] font-medium px-7 py-4 hover:bg-[#F5F1EB] transition-colors"
          >
            {t('owners.hero.cta')} <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Impact Numbers */}
      <section className="section-padding bg-white border-b border-[#E8E4DC]">
        <div className="container">
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4 lg:gap-8 lg:overflow-visible">
            {[
              { stat: '50+', label: t('owners.stats.0') },
              { stat: '4.9/5', label: t('owners.stats.1') },
              { stat: '40%', label: t('owners.stats.2') },
              { stat: '30+', label: t('owners.stats.3') },
            ].map(item => (
              <div key={item.label} className="text-center py-4 flex-shrink-0 w-[200px] lg:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <div className="font-display text-[2.8rem] lg:text-[3.5rem] text-[#1A1A18] leading-none mb-2">{item.stat}</div>
                <div className="text-[12px] font-medium text-[#9E9A90] tracking-[0.06em]">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What We Do */}
      <section className="section-padding">
        <div className="container">
          <div className="max-w-3xl mx-auto mb-12">
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('owners.whatWeDo.overline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-5">{t('owners.whatWeDo.title')}</h2>
            <p className="body-lg text-[#6B6860]">
              {t('owners.whatWeDo.description')}
            </p>
          </div>
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-auto md:px-0 md:grid md:grid-cols-2 md:gap-6 md:overflow-visible max-w-3xl">
            {WHAT_WE_DO.map((item, idx) => (
              <div key={idx} className="bg-[#F5F1EB] border border-[#E8E4DC] p-8 flex-shrink-0 w-[280px] md:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <div className="w-8 h-8 bg-[#8B7355] flex items-center justify-center mb-5">
                  <Check className="w-4 h-4 text-white" />
                </div>
                <h3 className="font-display text-[20px] text-[#1A1A18] mb-3">{item.title}</h3>
                <p className="text-[14px] text-[#6B6860] font-light leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-3xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('owners.howItWorks.overline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-10">{t('owners.howItWorks.title')}</h2>
          <div className="flex gap-6 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 md:mx-0 md:px-0 md:flex-col md:gap-8 md:overflow-visible">
            {HOW_IT_WORKS.map((step, idx) => (
              <div key={idx} className="flex gap-6 flex-shrink-0 w-[280px] md:w-auto" style={{ scrollSnapAlign: 'start' }}>
                <div className="font-display text-[3rem] text-[#E8E4DC] leading-none shrink-0 w-16">{step.step}</div>
                <div className="pt-2">
                  <h3 className="font-display text-[20px] text-[#1A1A18] mb-2">{step.title}</h3>
                  <p className="text-[14px] text-[#6B6860] font-light leading-relaxed">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Management Platform Link */}
      <section className="section-padding bg-white border-y border-[#E8E4DC]">
        <div className="container max-w-3xl mx-auto">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <p className="text-[11px] font-medium text-[#8B7355] mb-2 tracking-[0.08em]">{t('owners.portal.overline')}</p>
              <h3 className="font-display text-[22px] text-[#1A1A18] mb-2">{t('owners.portal.title')}</h3>
              <p className="text-[14px] text-[#6B6860] font-light">{t('owners.portal.description')}</p>
            </div>
            <a
              href="https://management.portugalactive.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[#1A1A18] text-[#1A1A18] text-[12px] tracking-[0.08em] font-medium px-7 py-4 hover:bg-[#1A1A18] hover:text-white transition-colors shrink-0"
            >
              {t('owners.portal.cta')} <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Submission Form */}
      <section id="contact-form" className="section-padding bg-[#FAFAF7]">
        <div className="container max-w-2xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('owners.form.overline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-3">{t('owners.form.title')}</h2>
          <p className="body-lg text-[#6B6860] mb-10">
            {t('owners.form.description')}
          </p>

          {submitted ? (
            <div className="bg-[#F5F1EB] border border-[#E8E4DC] p-10 text-center">
              <div className="w-12 h-12 bg-[#8B7355] flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-display text-[22px] text-[#1A1A18] mb-2">{t('owners.form.successTitle')}</h3>
              <p className="body-md">{t('owners.form.successMessage')}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.form.fields.name')}</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.form.fields.email')}</label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.form.fields.phone')}</label>
                <input
                  type="tel"
                  className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.form.fields.location')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('owners.form.fields.locationPlaceholder')}
                  className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] placeholder:text-[#E8E4DC] focus:outline-none focus:border-[#8B7355] transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.form.fields.type')}</label>
                <select
                  className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                >
                  <option value="">{t('owners.form.fields.selectType')}</option>
                  <option value="villa">{t('owners.form.fields.villa')}</option>
                  <option value="quinta">{t('owners.form.fields.quinta')}</option>
                  <option value="farmhouse">{t('owners.form.fields.farmhouse')}</option>
                  <option value="townhouse">{t('owners.form.fields.townhouse')}</option>
                  <option value="other">{t('owners.form.fields.other')}</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.form.fields.description')}</label>
                <textarea
                  rows={4}
                  placeholder={t('owners.form.fields.descriptionPlaceholder')}
                  className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] placeholder:text-[#E8E4DC] focus:outline-none focus:border-[#8B7355] transition-colors resize-none"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
              </div>
              <button
                type="submit"
                className="rounded-full bg-[#8B7355] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#7A6548] transition-colors self-start inline-flex items-center gap-2"
                style={{ minHeight: '52px' }}
              >
                {t('owners.form.submitButton')}
              </button>
            </form>
          )}
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
