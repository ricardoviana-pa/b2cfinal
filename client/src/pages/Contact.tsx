import { useState, useMemo, useCallback, useEffect, useRef, useLayoutEffect } from 'react';
import { pushDL } from '@/lib/datalayer';
import { Phone, Mail, MapPin, MessageCircle, Calendar, ChevronDown, Check, ArrowRight, Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import { IMAGES } from '@/lib/images';
import Header from '@/components/layout/Header';
import PhoneInput from '@/components/booking/PhoneInput';
import Footer from '@/components/layout/Footer';
import WhatsAppFloat from '@/components/layout/WhatsAppFloat';
import { StructuredData, buildBreadcrumbSchema, buildFaqPageSchema } from '@/components/seo/StructuredData';
import AnswerCapsule from '@/components/seo/AnswerCapsule';
import { trpc } from '@/lib/trpc';
import { useSearch } from 'wouter';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FAQItem({ item, isLast }: { item: { q: string; a: string }; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={isLast ? '' : 'border-b border-[#E8E4DC]'}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span
          className="text-[15px] pr-6 transition-colors group-hover:text-[#8B7355]"
          style={{ fontFamily: 'var(--font-body)', fontWeight: 400, color: open ? '#8B7355' : '#1A1A18' }}
        >
          {item.q}
        </span>
        <div
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-all duration-300"
          style={{
            borderColor: open ? '#8B7355' : '#E8E4DC',
            backgroundColor: open ? '#8B7355' : 'transparent',
          }}
        >
          <ChevronDown
            size={13}
            className="transition-transform duration-300"
            style={{ color: open ? '#FAFAF7' : '#9E9A90', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </div>
      </button>
      <div
        className="grid transition-all duration-300 ease-in-out"
        style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <p
            className="pb-5 text-[14px] leading-relaxed text-[#6B6860]"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
          >
            {item.a}
          </p>
        </div>
      </div>
    </div>
  );
}

const CONTACT_CHANNELS = [
  {
    icon: Phone,
    href: 'tel:+351927161771',
    external: false,
    titleKey: 'contact.phoneNumber' as const,
    titleFallback: '+351 927 161 771',
    subKey: 'contact.phoneAvailable' as const,
  },
  {
    icon: MessageCircle,
    href: 'https://wa.me/351927161771?text=Hi%2C%20I%27d%20like%20to%20talk%20to%20your%20concierge.',
    external: true,
    titleKey: 'contact.whatsapp' as const,
    titleFallback: 'WhatsApp',
    subKey: 'contact.whatsappSub' as const,
  },
  {
    icon: Mail,
    href: 'mailto:info@portugalactive.com',
    external: false,
    titleKey: 'contact.emailAddress' as const,
    titleFallback: 'info@portugalactive.com',
    subKey: 'contact.emailResponse' as const,
  },
  {
    icon: Calendar,
    href: 'https://calendly.com/portugalactive',
    external: true,
    titleKey: 'contact.scheduleCall' as const,
    titleFallback: 'Schedule a call',
    subKey: 'contact.scheduleCallSub' as const,
  },
] as const;

export default function Contact() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Contact Portugal Active — Book a Lodge or Adventure', description: 'Ready to book your perfect stay or adventure in Portugal? Get in touch — we reply within 24 hours and help you plan the perfect trip to Minho.', url: '/contact' });

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('plan-my-stay');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');

  const formLoadTimeRef = useRef<number | null>(null);
  const createLead = trpc.leads.create.useMutation();
  const searchString = useSearch();
  const prefilledFromProperty = useRef(false);

  useLayoutEffect(() => {
    if (formLoadTimeRef.current === null) {
      formLoadTimeRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (prefilledFromProperty.current) return;
    const params = new URLSearchParams(searchString);
    const slug = params.get('property');
    const intent = params.get('intent');
    if (slug && intent === 'availability') {
      prefilledFromProperty.current = true;
      setSubject('plan-my-stay');
      setMessage(
        t('contact.prefillAvailability', {
          slug,
          defaultValue:
            'I would like to check availability for this home. Property reference: {{slug}}. Please contact me with next steps.',
        })
      );
    }
  }, [searchString, t]);

  const FAQ_ITEMS = useMemo(() => [
    { q: t('contact.faq1q'), a: t('contact.faq1a') },
    { q: t('contact.faq2q'), a: t('contact.faq2a') },
    { q: t('contact.faq3q'), a: t('contact.faq3a') },
    { q: t('contact.faq4q'), a: t('contact.faq4a') },
    { q: t('contact.faq5q'), a: t('contact.faq5a') },
    { q: t('contact.faq6q'), a: t('contact.faq6a') },
  ], [t]);

  const contactGraph = useMemo(
    () => [
      buildBreadcrumbSchema([
        { name: 'Home', item: '/' },
        { name: 'Contact' },
      ]),
      buildFaqPageSchema(FAQ_ITEMS.map((item) => ({ question: item.q, answer: item.a }))),
    ],
    [FAQ_ITEMS],
  );

  const validateField = useCallback((field: string, value: string) => {
    if (field === 'name' && !value.trim()) return t('contact.errorName', 'Please enter your name');
    if (field === 'email' && !value.trim()) return t('contact.errorEmailRequired', 'Please enter your email');
    if (field === 'email' && !EMAIL_RE.test(value)) return t('contact.errorEmailInvalid', 'Please enter a valid email address');
    if (field === 'message' && !value.trim()) return t('contact.errorMessage', 'Please enter a message');
    return '';
  }, [t]);

  const handleBlur = useCallback((field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    const err = validateField(field, value);
    setFieldErrors(prev => ({ ...prev, [field]: err }));
  }, [validateField]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Honeypot check: if filled, silently reject
    if (honeypot.trim()) {
      return;
    }

    // Timing check: if submitted in less than 2 seconds, silently reject (bots are fast)
    const timeElapsed = formLoadTimeRef.current ? Date.now() - formLoadTimeRef.current : 0;
    if (timeElapsed < 2000) {
      return;
    }

    const errors: Record<string, string> = {
      name: validateField('name', name),
      email: validateField('email', email),
      message: validateField('message', message),
    };
    setFieldErrors(errors);
    setTouched({ name: true, email: true, message: true });
    if (Object.values(errors).some(Boolean)) return;

    setError('');
    setSubmitting(true);
    try {
      await createLead.mutateAsync({
        email,
        name,
        phone: phone || undefined,
        message: `[${subject}] ${message}`,
        source: 'contact-form',
        metadata: { subject },
      });
      setSubmitted(true);
      pushDL({ event: 'generate_lead', lead_source: 'contact-form', lead_type: 'contact', lead_subject: subject });
    } catch {
      setError(t('contact.errorSubmit', 'Something went wrong. Please try again or contact us directly.'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClasses = (field: string, hasError: boolean) =>
    `w-full h-[52px] rounded-md border bg-white px-4 text-[16px] text-[#1A1A18] transition-all duration-200 focus:outline-none ${
      hasError
        ? 'border-[#DC2626] ring-2 ring-[#DC2626]/10'
        : 'border-[#E8E4DC] hover:border-[#C4A87C] focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10'
    }`;

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <StructuredData id="contact-graph" data={contactGraph} />
      <Header />

      {/* Hero with image */}
      <section className="relative h-[50vh] min-h-[380px] flex items-end overflow-hidden">
        <img
          src={IMAGES.contactHero}
          alt={t('contact.heroAlt', 'Contact Portugal Active')}
          className="absolute inset-0 w-full h-full object-cover object-top"
          width={1200}
          height={674}
          fetchPriority="high"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-black/5" />
        <div className="relative container max-w-[1100px] pb-12 lg:pb-16 z-10">
          <p
            className="text-[11px] font-medium tracking-[0.14em] uppercase text-white/50 mb-4"
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {t('contact.heroOverline', 'GET IN TOUCH')}
          </p>
          <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] font-light leading-[1.08] text-white mb-4">
            {t('contact.heroTitle')}
          </h1>
          <p
            className="text-[16px] md:text-[18px] text-white/70 max-w-lg leading-relaxed"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
          >
            {t('contact.heroSubtitle')}
          </p>
        </div>
      </section>

      {/* Quick Answer — SEO / AI citable summary */}
      <section className="py-8 bg-[#FAFAF7]">
        <div className="container max-w-[1100px]">
          <AnswerCapsule
            question="How do I contact Portugal Active?"
            answer="Portugal Active's concierge team is available by phone (+351 927 161 771), WhatsApp, or email (info@portugalactive.com). Response time is typically under two hours. You can also schedule a video call to plan your stay. The team assists with property selection, experience booking, airport transfers, private chefs, and any special requests. Book direct for the best rate and complimentary concierge planning."
            emitSchema
            schemaId="qa-contact"
          />
        </div>
      </section>

      {/* Form + Contact channels */}
      <section className="py-14 md:py-20 lg:py-24">
        <div className="container max-w-[1100px]">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-14 lg:gap-20">

            {/* Left: Form */}
            <div>
              <h2
                className="font-display text-[24px] md:text-[28px] font-light text-[#1A1A18] mb-2"
              >
                {t('contact.formTitle', 'Send us a message')}
              </h2>
              <p
                className="text-[14px] text-[#9E9A90] mb-8"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
              >
                {t('contact.formSubtitle', 'We typically respond within 2 hours.')}
              </p>

              {submitted ? (
                <div className="rounded-lg border border-[#E8E4DC] bg-white p-10 md:p-14 text-center" role="status" aria-live="polite">
                  <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#8B7355]">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-display text-[22px] text-[#1A1A18] mb-2">{t('contact.messageSentTitle')}</h3>
                  <p
                    className="text-[14px] text-[#6B6860] max-w-sm mx-auto"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  >
                    {t('contact.messageSentBody')}
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-6 text-[12px] font-medium tracking-[0.1em] uppercase text-[#8B7355] hover:text-[#6B5A42] transition-colors"
                  >
                    {t('contact.sendAnother', 'Send another message')}
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
                  {/* Honeypot field - hidden from real users */}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={e => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    style={{ position: 'absolute', left: '-9999px' }}
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
                        {t('contact.nameLabel')} <span className="text-[#DC2626]">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={e => { setName(e.target.value); if (touched.name) setFieldErrors(prev => ({ ...prev, name: validateField('name', e.target.value) })); }}
                        onBlur={() => handleBlur('name', name)}
                        placeholder={t('contact.namePlaceholder', 'Your full name')}
                        autoComplete="name"
                        className={inputClasses('name', !!(touched.name && fieldErrors.name))}
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                      />
                      {touched.name && fieldErrors.name && <p className="text-[12px] text-[#DC2626] mt-1.5">{fieldErrors.name}</p>}
                    </div>
                    <div>
                      <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
                        {t('contact.emailLabel')} <span className="text-[#DC2626]">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => { setEmail(e.target.value); if (touched.email) setFieldErrors(prev => ({ ...prev, email: validateField('email', e.target.value) })); }}
                        onBlur={() => handleBlur('email', email)}
                        placeholder={t('contact.emailPlaceholder', 'your@email.com')}
                        autoComplete="email"
                        inputMode="email"
                        className={inputClasses('email', !!(touched.email && fieldErrors.email))}
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                      />
                      {touched.email && fieldErrors.email && <p className="text-[12px] text-[#DC2626] mt-1.5">{fieldErrors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
                        {t('contact.phoneLabel')}
                      </label>
                      <PhoneInput
                        value={phone}
                        onChange={setPhone}
                        placeholder={t('contact.phonePlaceholder', 'Phone number')}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
                        {t('contact.subjectLabel')}
                      </label>
                      <select
                        value={subject}
                        onChange={e => setSubject(e.target.value)}
                        className={`${inputClasses('subject', false)} appearance-none cursor-pointer`}
                        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                      >
                        <option value="plan-my-stay">{t('contact.subjectBookHome')}</option>
                        <option value="services-enquiry">{t('contact.subjectServices')}</option>
                        <option value="events">{t('contact.subjectEvents')}</option>
                        <option value="property-management">{t('contact.subjectProperty')}</option>
                        <option value="general">{t('contact.subjectGeneral')}</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#9E9A90] mb-2 block" style={{ fontFamily: 'var(--font-body)' }}>
                      {t('contact.messageLabel')} <span className="text-[#DC2626]">*</span>
                    </label>
                    <textarea
                      required
                      rows={5}
                      value={message}
                      onChange={e => { setMessage(e.target.value); if (touched.message) setFieldErrors(prev => ({ ...prev, message: validateField('message', e.target.value) })); }}
                      onBlur={() => handleBlur('message', message)}
                      placeholder={t('contact.messagePlaceholder', 'Tell us about your trip — dates, group size, anything we should know...')}
                      className={`w-full rounded-md border bg-white px-4 py-3.5 text-[16px] text-[#1A1A18] placeholder:text-[#9E9A90] transition-all duration-200 focus:outline-none resize-none ${
                        touched.message && fieldErrors.message
                          ? 'border-[#DC2626] ring-2 ring-[#DC2626]/10'
                          : 'border-[#E8E4DC] hover:border-[#C4A87C] focus:border-[#8B7355] focus:ring-2 focus:ring-[#8B7355]/10'
                      }`}
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                    />
                    {touched.message && fieldErrors.message && <p className="text-[12px] text-[#DC2626] mt-1.5">{fieldErrors.message}</p>}
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-[#DC2626]/20 rounded-md" role="alert" aria-live="assertive">
                      <p className="text-[13px] text-[#DC2626]">{error}</p>
                      <button type="button" onClick={() => setError('')} className="text-[#DC2626] text-[12px] underline ml-auto shrink-0">{t('contact.dismiss', 'Dismiss')}</button>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 hover:bg-[#333330] active:bg-[#0D0D0C] transition-colors self-start inline-flex items-center gap-2.5 min-h-[48px] disabled:opacity-50"
                  >
                    {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    {submitting ? t('contact.sending', 'Sending...') : t('contact.sendMessage')}
                  </button>
                </form>
              )}
            </div>

            {/* Right: Contact channels */}
            <div className="lg:pt-[72px]">
              <div className="rounded-lg border border-[#E8E4DC] bg-white overflow-hidden">
                <div className="px-6 pt-6 pb-4">
                  <h3
                    className="font-display text-[20px] font-light text-[#1A1A18] mb-1"
                  >
                    {t('contact.preferToTalk')}
                  </h3>
                  <p className="text-[13px] text-[#9E9A90]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                    {t('contact.preferToTalkSub', 'Reach us however works best for you.')}
                  </p>
                </div>

                <div className="px-6 pb-2">
                  {CONTACT_CHANNELS.map((ch, i) => {
                    const Icon = ch.icon;
                    const title = t(ch.titleKey, ch.titleFallback);
                    const sub = t(ch.subKey);
                    return (
                      <a
                        key={i}
                        href={ch.href}
                        target={ch.external ? '_blank' : undefined}
                        rel={ch.external ? 'noopener noreferrer' : undefined}
                        className="flex items-center gap-4 py-3.5 group transition-colors border-b border-[#E8E4DC] last:border-0"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F5F1EB] transition-colors group-hover:bg-[#8B7355]">
                          <Icon size={16} className="text-[#8B7355] transition-colors group-hover:text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] text-[#1A1A18] group-hover:text-[#8B7355] transition-colors truncate" style={{ fontWeight: 500 }}>
                            {title}
                          </p>
                          <p className="text-[12px] text-[#9E9A90] mt-0.5" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                            {sub}
                          </p>
                        </div>
                        <ArrowRight size={14} className="shrink-0 text-[#E8E4DC] group-hover:text-[#8B7355] transition-all group-hover:translate-x-0.5" />
                      </a>
                    );
                  })}
                </div>

                {/* HQ */}
                <div className="bg-[#F5F1EB]/50 px-6 py-4 flex items-center gap-3">
                  <MapPin size={14} className="text-[#9E9A90] shrink-0" />
                  <p className="text-[12px] text-[#6B6860]" style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
                    {t('contact.hqLocation')} {t('contact.hqOperating')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-[#E8E4DC]">
        <div className="container max-w-[720px] py-16 md:py-24 lg:py-28">
          <div className="text-center mb-10 md:mb-14">
            <p
              className="text-[11px] font-medium tracking-[0.14em] uppercase text-[#8B7355] mb-4"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {t('contact.faqOverline')}
            </p>
            <h2 className="font-display text-[clamp(1.5rem,3.5vw,2.25rem)] font-light text-[#1A1A18]">
              {t('contact.faqTitle')}
            </h2>
          </div>
          <div className="border-t border-[#E8E4DC]">
            {FAQ_ITEMS.map((item, idx) => (
              <FAQItem key={idx} item={item} isLast={idx === FAQ_ITEMS.length - 1} />
            ))}
          </div>
        </div>
      </section>

      <Footer />
      <WhatsAppFloat />
    </div>
  );
}
