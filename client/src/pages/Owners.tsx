/* ==========================================================================
   OWNERS — V1.6 Redesign
   Hero, impact numbers, what we do, how it works, management link, form
   ========================================================================== */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { ArrowRight, Check, ExternalLink, Loader2 } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { trpc } from '@/lib/trpc';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Owners() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Property Management Portugal | Portugal Active for Owners', description: 'Maximise your rental income. Full-service villa management — marketing, bookings, housekeeping, maintenance, guest concierge.', url: '/owners' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerLocation, setOwnerLocation] = useState('');
  const [ownerType, setOwnerType] = useState('');
  const [ownerDescription, setOwnerDescription] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const createLead = trpc.leads.create.useMutation();

  const validateField = useCallback((field: string, value: string) => {
    if (field === 'ownerName' && !value.trim()) return t('owners.errorName', 'Please enter your name');
    if (field === 'ownerEmail' && !value.trim()) return t('owners.errorEmailRequired', 'Please enter your email');
    if (field === 'ownerEmail' && !EMAIL_RE.test(value)) return t('owners.errorEmailInvalid', 'Please enter a valid email address');
    if (field === 'ownerLocation' && !value.trim()) return t('owners.errorLocation', 'Please enter the property location');
    return '';
  }, [t]);

  const handleFieldBlur = useCallback((field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setFieldErrors(prev => ({ ...prev, [field]: validateField(field, value) }));
  }, [validateField]);

  const WHAT_WE_DO = useMemo(() => [
    {
      title: t('owners.service1Title'),
      body: t('owners.service1Body'),
    },
    {
      title: t('owners.service2Title'),
      body: t('owners.service2Body'),
    },
    {
      title: t('owners.service3Title'),
      body: t('owners.service3Body'),
    },
    {
      title: t('owners.service4Title'),
      body: t('owners.service4Body'),
    },
  ], [t]);

  const HOW_IT_WORKS = useMemo(() => [
    {
      step: '01',
      title: t('owners.step1Title'),
      body: t('owners.step1Body'),
    },
    {
      step: '02',
      title: t('owners.step2Title'),
      body: t('owners.step2Body'),
    },
    {
      step: '03',
      title: t('owners.step3Title'),
      body: t('owners.step3Body'),
    },
    {
      step: '04',
      title: t('owners.step4Title'),
      body: t('owners.step4Body'),
    },
  ], [t]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {
      ownerName: validateField('ownerName', ownerName),
      ownerEmail: validateField('ownerEmail', ownerEmail),
      ownerLocation: validateField('ownerLocation', ownerLocation),
    };
    setFieldErrors(errors);
    setTouched({ ownerName: true, ownerEmail: true, ownerLocation: true });
    if (Object.values(errors).some(Boolean)) return;

    setSubmitError('');
    setSubmitting(true);
    try {
      await createLead.mutateAsync({
        email: ownerEmail,
        name: ownerName,
        phone: ownerPhone || undefined,
        message: `[Owner Submission] Location: ${ownerLocation} | Type: ${ownerType || 'Not specified'} | ${ownerDescription}`,
        source: 'owner-submission',
        metadata: { location: ownerLocation, propertyType: ownerType },
      });
      setSubmitted(true);
    } catch {
      setSubmitError(t('owners.errorSubmit', 'Something went wrong. Please try again or contact us directly.'));
    } finally {
      setSubmitting(false);
    }
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
            {t('owners.heroTitle')}
          </h1>
          <p className="body-lg max-w-xl mb-8" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {t('owners.heroBody')}
          </p>
          <a
            href="#contact-form"
            className="inline-flex items-center gap-2 rounded-full bg-white text-[#1A1A18] text-[12px] tracking-[0.08em] font-medium px-7 py-4 hover:bg-[#F5F1EB] transition-colors"
          >
            {t('owners.requestAssessment')} <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      {/* Impact Numbers */}
      <section className="section-padding bg-white border-b border-[#E8E4DC]">
        <div className="container">
          <div className="flex gap-5 overflow-x-auto no-scrollbar pb-2 -mx-5 px-5 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4 lg:gap-8 lg:overflow-visible">
            {[
              { stat: '70+', label: t('owners.statHomes') },
              { stat: '4.9/5', label: t('owners.statRating') },
              { stat: '40%', label: t('owners.statRepeat') },
              { stat: '30+', label: t('owners.statTeam') },
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
            <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('owners.whatWeDoOverline')}</p>
            <h2 className="headline-lg text-[#1A1A18] mb-5">{t('owners.whatWeDoTitle')}</h2>
            <p className="body-lg text-[#6B6860]">
              {t('owners.whatWeDoBody')}
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
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('owners.howItWorksOverline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-10">{t('owners.howItWorksTitle')}</h2>
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
              <p className="text-[11px] font-medium text-[#8B7355] mb-2 tracking-[0.08em]">{t('owners.portalOverline')}</p>
              <h3 className="font-display text-[22px] text-[#1A1A18] mb-2">{t('owners.portalTitle')}</h3>
              <p className="text-[14px] text-[#6B6860] font-light">{t('owners.portalBody')}</p>
            </div>
            <a
              href="https://management.portugalactive.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[#1A1A18] text-[#1A1A18] text-[12px] tracking-[0.08em] font-medium px-7 py-4 hover:bg-[#1A1A18] hover:text-white transition-colors shrink-0"
            >
              {t('owners.portalCta')} <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* Submission Form */}
      <section id="contact-form" className="section-padding bg-[#FAFAF7]">
        <div className="container max-w-2xl mx-auto">
          <p className="text-[11px] font-medium text-[#8B7355] mb-4 tracking-[0.08em]">{t('owners.formOverline')}</p>
          <h2 className="headline-lg text-[#1A1A18] mb-3">{t('owners.formTitle')}</h2>
          <p className="body-lg text-[#6B6860] mb-10">
            {t('owners.formBody')}
          </p>

          {submitted ? (
            <div className="bg-[#F5F1EB] border border-[#E8E4DC] p-10 text-center" role="status" aria-live="polite">
              <div className="w-12 h-12 bg-[#8B7355] flex items-center justify-center mx-auto mb-4">
                <Check className="w-6 h-6 text-white" />
              </div>
              <h3 className="font-display text-[22px] text-[#1A1A18] mb-2">{t('owners.formSuccess')}</h3>
              <p className="body-md">{t('owners.formSuccessBody')}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.formName')} <span className="text-[#DC2626]">*</span></label>
                  <input
                    type="text"
                    required
                    value={ownerName}
                    onChange={e => { setOwnerName(e.target.value); if (touched.ownerName) setFieldErrors(prev => ({ ...prev, ownerName: validateField('ownerName', e.target.value) })); }}
                    onBlur={() => handleFieldBlur('ownerName', ownerName)}
                    autoComplete="name"
                    className={`w-full h-[52px] px-4 bg-white border text-[16px] text-[#1A1A18] focus:outline-none transition-colors ${touched.ownerName && fieldErrors.ownerName ? 'border-[#DC2626] ring-2 ring-[#DC2626]/10' : 'border-[#E8E4DC] focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 hover:border-[#C4A87C]'}`}
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                  {touched.ownerName && fieldErrors.ownerName && <p className="text-[12px] text-[#DC2626] mt-1.5">{fieldErrors.ownerName}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.formEmail')} <span className="text-[#DC2626]">*</span></label>
                  <input
                    type="email"
                    required
                    value={ownerEmail}
                    onChange={e => { setOwnerEmail(e.target.value); if (touched.ownerEmail) setFieldErrors(prev => ({ ...prev, ownerEmail: validateField('ownerEmail', e.target.value) })); }}
                    onBlur={() => handleFieldBlur('ownerEmail', ownerEmail)}
                    autoComplete="email"
                    inputMode="email"
                    className={`w-full h-[52px] px-4 bg-white border text-[16px] text-[#1A1A18] focus:outline-none transition-colors ${touched.ownerEmail && fieldErrors.ownerEmail ? 'border-[#DC2626] ring-2 ring-[#DC2626]/10' : 'border-[#E8E4DC] focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 hover:border-[#C4A87C]'}`}
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                  {touched.ownerEmail && fieldErrors.ownerEmail && <p className="text-[12px] text-[#DC2626] mt-1.5">{fieldErrors.ownerEmail}</p>}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.formPhone')}</label>
                <input
                  type="tel"
                  value={ownerPhone}
                  onChange={e => setOwnerPhone(e.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                  className="w-full h-[52px] px-4 bg-white border border-[#E8E4DC] text-[16px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 hover:border-[#C4A87C] transition-colors"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.formLocation')} <span className="text-[#DC2626]">*</span></label>
                <input
                  type="text"
                  required
                  value={ownerLocation}
                  onChange={e => { setOwnerLocation(e.target.value); if (touched.ownerLocation) setFieldErrors(prev => ({ ...prev, ownerLocation: validateField('ownerLocation', e.target.value) })); }}
                  onBlur={() => handleFieldBlur('ownerLocation', ownerLocation)}
                  placeholder={t('owners.formLocationPh')}
                  autoComplete="address-level2"
                  className={`w-full h-[52px] px-4 bg-white border text-[16px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none transition-colors ${touched.ownerLocation && fieldErrors.ownerLocation ? 'border-[#DC2626] ring-2 ring-[#DC2626]/10' : 'border-[#E8E4DC] focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 hover:border-[#C4A87C]'}`}
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
                {touched.ownerLocation && fieldErrors.ownerLocation && <p className="text-[12px] text-[#DC2626] mt-1.5">{fieldErrors.ownerLocation}</p>}
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.formType')}</label>
                <select
                  value={ownerType}
                  onChange={e => setOwnerType(e.target.value)}
                  className="w-full h-[52px] px-4 bg-white border border-[#E8E4DC] text-[16px] text-[#1A1A18] focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 hover:border-[#C4A87C] transition-colors appearance-none cursor-pointer"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                >
                  <option value="">{t('owners.formTypeSelect')}</option>
                  <option value="villa">{t('owners.formTypeVilla')}</option>
                  <option value="quinta">{t('owners.formTypeQuinta')}</option>
                  <option value="farmhouse">{t('owners.formTypeFarmhouse')}</option>
                  <option value="townhouse">{t('owners.formTypeTownhouse')}</option>
                  <option value="other">{t('owners.formTypeOther')}</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium tracking-[0.12em] text-[#9E9A90] mb-2 block">{t('owners.formDescription')}</label>
                <textarea
                  rows={4}
                  value={ownerDescription}
                  onChange={e => setOwnerDescription(e.target.value)}
                  placeholder={t('owners.formDescriptionPh')}
                  className="w-full px-4 py-3.5 bg-white border border-[#E8E4DC] text-[16px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:outline-none focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10 hover:border-[#C4A87C] transition-colors resize-none"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
              </div>

              {submitError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-[#DC2626]/20 rounded-md" role="alert" aria-live="assertive">
                  <p className="text-[13px] text-[#DC2626]">{submitError}</p>
                  <button type="button" onClick={() => setSubmitError('')} className="text-[#DC2626] text-[12px] underline ml-auto shrink-0">{t('owners.dismiss', 'Dismiss')}</button>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-[#8B7355] text-white text-[12px] tracking-[0.08em] font-medium px-8 py-4 hover:bg-[#7A6548] transition-colors self-start inline-flex items-center gap-2 disabled:opacity-50 min-h-[52px]"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {submitting ? t('owners.formSending', 'Sending...') : t('owners.formSubmit')}
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
