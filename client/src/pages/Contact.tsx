/* ==========================================================================
   CONTACT — V1.6 Redesign
   Hero, form with subject dropdown, sidebar, 6 FAQ questions
   ========================================================================== */

import { useState, useMemo } from 'react';
import { Phone, Mail, MapPin, MessageCircle, Calendar, ChevronDown, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IMAGES } from '@/lib/images';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';

function FAQItem({ item }: { item: { q: string; a: string } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[#E8E4DC]">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left"
      >
        <span className="text-[15px] pr-4" style={{ fontFamily: 'var(--font-body)', fontWeight: 400, color: '#1A1A18' }}>
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
        style={{ maxHeight: open ? '300px' : '0', opacity: open ? 1 : 0 }}
      >
        <p className="body-md pb-5">{item.a}</p>
      </div>
    </div>
  );
}

export default function Contact() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);

  const FAQ_ITEMS = useMemo(() => [
    {
      q: t('contact.faq1q'),
      a: t('contact.faq1a'),
    },
    {
      q: t('contact.faq2q'),
      a: t('contact.faq2a'),
    },
    {
      q: t('contact.faq3q'),
      a: t('contact.faq3a'),
    },
    {
      q: t('contact.faq4q'),
      a: t('contact.faq4a'),
    },
    {
      q: t('contact.faq5q'),
      a: t('contact.faq5a'),
    },
    {
      q: t('contact.faq6q'),
      a: t('contact.faq6a'),
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
      <section className="relative h-[50vh] min-h-[350px] flex items-end overflow-hidden">
        <img
          src={IMAGES.destinationPorto}
          alt="Contact Portugal Active"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/10" />
        <div className="relative container pb-12 lg:pb-16 z-10">
          <h1 className="headline-xl text-white mb-3">{t('contact.heroTitle')}</h1>
          <p className="body-lg max-w-lg" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {t('contact.heroSubtitle')}
          </p>
        </div>
      </section>

      {/* Form + Sidebar */}
      <section className="section-padding">
        <div className="container">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-16 lg:gap-20">

            {/* Left: Form */}
            <div>
              {submitted ? (
                <div className="bg-[#F5F1EB] p-10 text-center">
                  <div className="w-12 h-12 bg-[#8B7355] flex items-center justify-center mx-auto mb-4">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-display text-[22px] text-[#1A1A18] mb-2">{t('contact.successTitle')}</h3>
                  <p className="body-md">{t('contact.successMessage')}</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('contact.nameLabelRequired')}</label>
                      <input
                        type="text"
                        required
                        className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('contact.emailLabelRequired')}</label>
                      <input
                        type="email"
                        required
                        className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('contact.phoneLabel')}</label>
                    <input
                      type="tel"
                      className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('contact.subjectLabel')}</label>
                    <select
                      className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                    >
                      <option value="book-a-home">{t('contact.subjectBookHome')}</option>
                      <option value="services-enquiry">{t('contact.subjectServices')}</option>
                      <option value="events">{t('contact.subjectEvents')}</option>
                      <option value="property-management">{t('contact.subjectPropertyMgmt')}</option>
                      <option value="general">{t('contact.subjectGeneral')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('contact.messageLabelRequired')}</label>
                    <textarea
                      required
                      rows={5}
                      className="w-full px-4 py-3.5 bg-transparent border border-[#E8E4DC] text-[15px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] transition-colors resize-none"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-full bg-[#1A1A18] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#333] transition-colors self-start inline-flex items-center gap-2"
                    style={{ minHeight: '52px' }}
                  >
                    {t('contact.sendButton')} →
                  </button>
                </form>
              )}
            </div>

            {/* Right: Sidebar */}
            <div>
              <h2 className="font-display text-[22px] text-[#1A1A18] mb-8">{t('contact.preferToTalk')}</h2>
              <div className="flex flex-col gap-7">
                <a href="tel:+351927161771" className="flex items-start gap-4 group">
                  <div className="w-10 h-10 bg-[#F5F1EB] flex items-center justify-center shrink-0">
                    <Phone size={15} style={{ color: '#8B7355' }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A18] group-hover:text-[#8B7355] transition-colors">+351 927 161 771</p>
                    <p className="text-[12px] text-[#9E9A90] font-light mt-0.5">{t('contact.phoneAvailability')}</p>
                  </div>
                </a>

                <a
                  href="https://wa.me/351927161771?text=Hi%2C%20I%27d%20like%20to%20talk%20to%20your%20concierge."
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 group"
                >
                  <div className="w-10 h-10 bg-[#F5F1EB] flex items-center justify-center shrink-0">
                    <MessageCircle size={15} style={{ color: '#8B7355' }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A18] group-hover:text-[#8B7355] transition-colors">WhatsApp</p>
                    <p className="text-[12px] text-[#9E9A90] font-light mt-0.5">{t('contact.whatsappSubtitle')}</p>
                  </div>
                </a>

                <a href="mailto:info@portugalactive.com" className="flex items-start gap-4 group">
                  <div className="w-10 h-10 bg-[#F5F1EB] flex items-center justify-center shrink-0">
                    <Mail size={15} style={{ color: '#8B7355' }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A18] group-hover:text-[#8B7355] transition-colors">info@portugalactive.com</p>
                    <p className="text-[12px] text-[#9E9A90] font-light mt-0.5">{t('contact.emailSubtitle')}</p>
                  </div>
                </a>

                <a
                  href="https://calendly.com/portugalactive"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-4 group"
                >
                  <div className="w-10 h-10 bg-[#F5F1EB] flex items-center justify-center shrink-0">
                    <Calendar size={15} style={{ color: '#8B7355' }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A18] group-hover:text-[#8B7355] transition-colors">{t('contact.scheduleCall')}</p>
                    <p className="text-[12px] text-[#9E9A90] font-light mt-0.5">{t('contact.scheduleCallSubtitle')}</p>
                  </div>
                </a>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-[#F5F1EB] flex items-center justify-center shrink-0">
                    <MapPin size={15} style={{ color: '#8B7355' }} />
                  </div>
                  <div>
                    <p className="text-[15px] font-medium text-[#1A1A18]">{t('contact.headquartersTitle')}</p>
                    <p className="text-[12px] text-[#9E9A90] font-light mt-0.5">{t('contact.headquartersSubtitle')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-padding bg-[#F5F1EB]">
        <div className="container max-w-[700px] mx-auto">
          <div className="mb-10">
            <p className="text-[11px] font-medium text-[#8B7355] mb-3 tracking-[0.08em]">{t('contact.faqLabel')}</p>
            <h2 className="headline-lg text-[#1A1A18]">{t('contact.faqTitle')}</h2>
          </div>
          <div>
            {FAQ_ITEMS.map((item, idx) => (
              <FAQItem key={idx} item={item} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
