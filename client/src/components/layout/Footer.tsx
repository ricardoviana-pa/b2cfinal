/* ==========================================================================
   FOOTER — V6.0 Modern Luxury
   Elevated design with better hierarchy, breathing room, and visual polish.
   ========================================================================== */

import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { IMAGES } from '@/lib/images';
import { Instagram, Youtube, Linkedin, Facebook, Check, Phone, Mail, MessageCircle, ArrowUpRight } from 'lucide-react';
import FooterPaymentLogos from './FooterPaymentLogos';
import { trpc } from '@/lib/trpc';
import { pushDL } from '@/lib/datalayer';

export default function Footer() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [nlError, setNlError] = useState('');

  const createLead = trpc.leads.create.useMutation();
  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setSubscribing(true);
    setNlError('');
    try {
      await createLead.mutateAsync({ email, source: 'newsletter-footer' });
      setSubscribed(true);
      setEmail('');
      pushDL({ event: 'generate_lead', lead_source: 'newsletter-footer', lead_type: 'newsletter' });
    } catch {
      setNlError(t('footer.nlError'));
    } finally {
      setSubscribing(false);
    }
  };

  const footerLinks = (label: string, href: string, external?: boolean) => (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[13px] text-white/50 hover:text-white transition-colors duration-200 inline-flex items-center gap-1" style={{ fontWeight: 300 }}>
          {label} <ArrowUpRight size={10} className="opacity-0 group-hover:opacity-100" />
        </a>
      ) : (
        <Link href={href} className="text-[13px] text-white/50 hover:text-white transition-colors duration-200" style={{ fontWeight: 300 }}>
          {label}
        </Link>
      )}
    </li>
  );

  return (
    <footer className="bg-[#1A1A18] text-white" role="contentinfo">

      {/* Newsletter banner */}
      <div className="border-b border-white/[0.06]">
        <div className="container py-12 lg:py-16">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-md">
              <h3 className="font-display text-[clamp(1.25rem,2.5vw,1.75rem)] font-light text-white leading-tight mb-2">
                {t('footer.nlHeadline')}
              </h3>
              <p
                className="text-[13px] text-white/40 leading-relaxed"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
              >
                {t('footer.nlSub')}
              </p>
            </div>
            <div className="w-full lg:w-auto lg:min-w-[380px]">
              {subscribed ? (
                <p className="text-[13px] flex items-center gap-2 text-[#C4A87C]" role="status" aria-live="polite">
                  <Check className="w-3.5 h-3.5" /> {t('footer.welcomeInbox')}
                </p>
              ) : (
                <form onSubmit={handleSubscribe} className="flex flex-col gap-1.5" noValidate>
                  <div className="flex">
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setNlError(''); }}
                      placeholder={t('footer.emailPlaceholder')}
                      required
                      autoComplete="email"
                      inputMode="email"
                      className="flex-1 h-[48px] px-4 text-[13px] bg-white/[0.04] border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-white/30 transition-colors min-w-0"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                    />
                    <button
                      type="submit"
                      disabled={subscribing}
                      className="h-[48px] px-6 bg-[#C4A87C] text-[#1A1A18] text-[11px] font-semibold hover:bg-[#D4B88C] transition-colors flex-shrink-0 disabled:opacity-50"
                      style={{ letterSpacing: '1.5px' }}
                    >
                      {subscribing ? '...' : t('footer.subscribe')}
                    </button>
                  </div>
                  {nlError && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{nlError}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main link grid */}
      <div className="container py-14 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-10 lg:gap-8">

          {/* Column 1: Brand */}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <Link href="/">
              <img src={IMAGES.logoWhite} alt="Portugal Active – luxury villa management in Portugal" className="h-5 lg:h-6 w-auto object-contain mb-5" />
            </Link>
            <p
              className="text-[13px] text-white/35 mb-8 leading-relaxed max-w-[260px]"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            >
              {t('footer.tagline')}
            </p>
            {/* Contact shortcuts */}
            <div className="flex items-center gap-3 mb-2">
              <a href="tel:+351927161771" className="flex items-center gap-2 group" aria-label="Call us">
                <Phone size={13} className="text-white/30 group-hover:text-[#C4A87C] transition-colors" />
                <span className="text-[12px] text-white/40 group-hover:text-white transition-colors" style={{ fontWeight: 300 }}>+351 927 161 771</span>
              </a>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <a href="mailto:info@portugalactive.com" className="flex items-center gap-2 group" aria-label="Email us">
                <Mail size={13} className="text-white/30 group-hover:text-[#C4A87C] transition-colors" />
                <span className="text-[12px] text-white/40 group-hover:text-white transition-colors" style={{ fontWeight: 300 }}>info@portugalactive.com</span>
              </a>
            </div>
            <div className="flex items-center gap-3">
              <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group" aria-label="WhatsApp">
                <MessageCircle size={13} className="text-white/30 group-hover:text-[#C4A87C] transition-colors" />
                <span className="text-[12px] text-white/40 group-hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('header.whatsapp')}</span>
              </a>
            </div>
          </div>

          {/* Column 2: Destinations */}
          <div>
            <h4 className="text-[10px] font-semibold text-white/60 uppercase mb-5" style={{ letterSpacing: '0.12em' }}>
              {t('footer.destinationsTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {footerLinks(t('footer.minhoCoast'), '/destinations/minho')}
              {footerLinks(t('footer.portoDouro'), '/destinations/porto')}
              {footerLinks(t('footer.lisbon'), '/destinations/lisbon')}
              {footerLinks(t('footer.alentejo'), '/destinations/alentejo')}
              {footerLinks(t('footer.algarve'), '/destinations/algarve')}
              <li>
                <span className="text-[13px] text-white/20" style={{ fontWeight: 300 }}>
                  {t('footer.brazil')} <span className="text-[9px] text-[#C4A87C]/40 ml-1 uppercase tracking-wider">{t('footer.soon')}</span>
                </span>
              </li>
            </ul>
          </div>

          {/* Column 3: Services */}
          <div>
            <h4 className="text-[10px] font-semibold text-white/60 uppercase mb-5" style={{ letterSpacing: '0.12em' }}>
              {t('footer.servicesTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {footerLinks(t('footer.bookStay'), '/homes')}
              {footerLinks(t('footer.experiences'), '/experiences')}
              {footerLinks(t('footer.conciergeServices'), '/concierge')}
              {footerLinks(t('footer.events'), '/events')}
              <li>
                <a
                  href="https://wa.me/351927161771?text=Hi%2C%20I%27d%20like%20to%20speak%20with%20a%20concierge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-white/50 hover:text-white transition-colors duration-200"
                  style={{ fontWeight: 300 }}
                >
                  {t('footer.meetConcierge')}
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Company */}
          <div>
            <h4 className="text-[10px] font-semibold text-white/60 uppercase mb-5" style={{ letterSpacing: '0.12em' }}>
              {t('footer.companyTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {footerLinks(t('footer.about'), '/about')}
              {footerLinks(t('footer.faq'), '/faq')}
              {footerLinks(t('footer.journal'), '/blog')}
              {footerLinks(t('footer.careers'), '/careers')}
              {footerLinks(t('footer.forOwners'), '/owners')}
              {footerLinks(t('footer.contact'), '/contact')}
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06]">
        <div className="container py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">

            {/* Left: copyright + legal */}
            <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
              <span className="text-[11px] text-white/20" style={{ fontWeight: 300 }}>
                {t('footer.copyrightLine', { year: new Date().getFullYear(), rights: t('footer.allRightsReserved') })}
              </span>
              <div className="flex items-center gap-4 text-[11px] text-white/20" style={{ fontWeight: 300 }}>
                <Link href="/legal/privacy" className="hover:text-white/50 transition-colors">{t('footer.privacy')}</Link>
                <Link href="/legal/terms" className="hover:text-white/50 transition-colors">{t('footer.terms')}</Link>
                <Link href="/legal/cookies" className="hover:text-white/50 transition-colors">{t('footer.cookies')}</Link>
                <Link href="/admin" className="hover:text-white/50 transition-colors">{t('footer.admin')}</Link>
              </div>
            </div>

            {/* Center: social */}
            <div className="flex items-center gap-0.5">
              {[
                { href: 'https://instagram.com/portugalactive', label: 'Instagram', Icon: Instagram },
                { href: 'https://www.youtube.com/@portugalactivechannel', label: 'YouTube', Icon: Youtube },
                { href: 'https://vimeo.com/portugalactive', label: 'Vimeo', Icon: () => <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609C15.906 19.988 13.08 22 10.68 22c-1.48 0-2.736-1.37-3.77-4.107C6.085 14.98 5.26 12.07 4.433 9.162c-.66-2.738-1.37-4.108-2.13-4.108-.165 0-.74.347-1.725 1.033L0 5.32c1.085-.953 2.157-1.906 3.21-2.858 1.447-1.254 2.531-1.913 3.26-1.98 1.713-.166 2.767 1.005 3.165 3.515.429 2.71.727 4.395.892 5.056.496 2.252 1.04 3.378 1.634 3.378.462 0 1.155-.73 2.08-2.19.924-1.46 1.42-2.572 1.486-3.336.132-1.262-.363-1.893-1.486-1.893-.53 0-1.075.12-1.637.36C13.75 2.152 16.047.186 19.082.013c2.253-.128 3.316 1.528 3.19 4.97l-.295 1.433z"/></svg> },
                { href: 'https://linkedin.com/company/portugalactive', label: 'LinkedIn', Icon: Linkedin },
                { href: 'https://facebook.com/portugalactive', label: 'Facebook', Icon: Facebook },
              ].map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="text-white/20 hover:text-white/60 transition-colors duration-200 flex items-center justify-center w-9 h-9">
                  <Icon className="h-[14px] w-[14px]" />
                </a>
              ))}
            </div>

            {/* Right: payment */}
            <FooterPaymentLogos />

          </div>
        </div>
      </div>
    </footer>
  );
}
