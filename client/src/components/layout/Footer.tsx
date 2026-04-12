/* ==========================================================================
   FOOTER — V5.0 Final Polish
   Le Collectionist-inspired: contact icons, clean payment text logos, clean grid.
   Sharp architectural design. No rounded elements.
   ========================================================================== */

import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { IMAGES } from '@/lib/images';
import { Instagram, Youtube, Linkedin, Facebook, Check, Phone, Mail, MessageCircle, Calendar } from 'lucide-react';
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
      setNlError(t('footer.nlError', 'Something went wrong. Please try again.'));
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <footer className="bg-[#1A1A18] text-white" role="contentinfo">
      {/* Main grid */}
      <div className="container py-14 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-10 lg:gap-8">

          {/* Column 1: Brand + Newsletter */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href="/">
              <img src={IMAGES.logoWhite} alt="Portugal Active – luxury villa management in Portugal" className="h-5 lg:h-6 w-auto object-contain mb-4" />
            </Link>
            <p
              className="text-[13px] text-white/40 mb-6 leading-relaxed max-w-[240px]"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            >
              {t('footer.tagline')}
            </p>
            <p
              className="text-[11px] text-white/25 mb-3"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
            >
              {t('footer.newsletterHint')}
            </p>
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
                    className="flex-1 h-[44px] px-3 text-[12px] bg-transparent border border-white/15 text-white placeholder:text-white/25 focus:outline-none focus:border-white/35 transition-colors min-w-0"
                    style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                  />
                  <button
                    type="submit"
                    disabled={subscribing}
                    className="h-[44px] px-4 bg-white text-[#1A1A18] text-[10px] font-semibold hover:bg-[#C4A87C] hover:text-white transition-colors flex-shrink-0 disabled:opacity-50"
                    style={{ letterSpacing: '1.5px' }}
                  >
                    {subscribing ? '...' : t('footer.subscribe')}
                  </button>
                </div>
                {nlError && <p className="text-[11px] text-red-400" role="alert" aria-live="assertive">{nlError}</p>}
              </form>
            )}
          </div>

          {/* Column 2: Destinations */}
          <div>
            <h4
              className="text-[11px] font-semibold text-[#C4A87C] mb-5"
              style={{ letterSpacing: '0.08em' }}
            >
              {t('footer.destinationsTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              <li><Link href="/destinations/minho" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.minhoCoast')}</Link></li>
              <li><Link href="/destinations/porto" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.portoDouro')}</Link></li>
              <li><Link href="/destinations/lisbon" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.lisbon')}</Link></li>
              <li><Link href="/destinations/alentejo" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.alentejo')}</Link></li>
              <li><Link href="/destinations/algarve" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.algarve')}</Link></li>
              <li>
                <span className="text-[13px] text-white/20" style={{ fontWeight: 300 }}>
                  {t('footer.brazil')} <span className="text-[10px] text-white/15 ml-1">{t('footer.soon')}</span>
                </span>
              </li>
            </ul>
          </div>

          {/* Column 3: Services */}
          <div>
            <h4
              className="text-[11px] font-semibold text-[#C4A87C] mb-5"
              style={{ letterSpacing: '0.08em' }}
            >
              {t('footer.servicesTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              <li><Link href="/homes" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.bookStay')}</Link></li>
              <li><Link href="/experiences" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.experiences')}</Link></li>
              <li><Link href="/concierge" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.conciergeServices', 'Concierge services')}</Link></li>
              <li><Link href="/events" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.events')}</Link></li>
              <li>
                <a
                  href="https://wa.me/351927161771?text=Hi%2C%20I%27d%20like%20to%20speak%20with%20a%20concierge"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[13px] text-white/45 hover:text-white transition-colors"
                  style={{ fontWeight: 300 }}
                >
                  {t('footer.meetConcierge')}
                </a>
              </li>
            </ul>
          </div>

          {/* Column 4: Company */}
          <div>
            <h4
              className="text-[11px] font-semibold text-[#C4A87C] mb-5"
              style={{ letterSpacing: '0.08em' }}
            >
              {t('footer.companyTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              <li><Link href="/about" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.about')}</Link></li>
              <li><Link href="/faq" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.faq')}</Link></li>
              <li><Link href="/blog" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.journal')}</Link></li>
              <li><Link href="/careers" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.careers')}</Link></li>
              <li>
                <Link href="/owners" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>
                  {t('footer.forOwners')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 5: Contact — with icons like Le Collectionist */}
          <div>
            <h4
              className="text-[11px] font-semibold text-[#C4A87C] mb-5"
              style={{ letterSpacing: '0.08em' }}
            >
              {t('footer.contactTitle')}
            </h4>
            <ul className="flex flex-col gap-4">
              <li>
                <a href="tel:+351927161771" className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors">
                    <Phone className="w-3 h-3 text-white/40 group-hover:text-white/70 transition-colors" />
                  </div>
                  <span className="text-[13px] text-white/45 group-hover:text-white transition-colors" style={{ fontWeight: 300 }}>
                    +351 927 161 771
                  </span>
                </a>
              </li>
              <li>
                <a href="mailto:info@portugalactive.com" className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors">
                    <Mail className="w-3 h-3 text-white/40 group-hover:text-white/70 transition-colors" />
                  </div>
                  <span className="text-[13px] text-white/45 group-hover:text-white transition-colors" style={{ fontWeight: 300 }}>
                    info@portugalactive.com
                  </span>
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/351927161771"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 group"
                >
                  <div className="w-7 h-7 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors">
                    <MessageCircle className="w-3 h-3 text-white/40 group-hover:text-white/70 transition-colors" />
                  </div>
                  <span className="text-[13px] text-white/45 group-hover:text-white transition-colors" style={{ fontWeight: 300 }}>
                    {t('header.whatsapp')}
                  </span>
                </a>
              </li>
              <li>
                <Link href="/contact" className="flex items-center gap-2.5 group">
                  <div className="w-7 h-7 flex items-center justify-center border border-white/10 group-hover:border-white/30 transition-colors">
                    <Calendar className="w-3 h-3 text-white/40 group-hover:text-white/70 transition-colors" />
                  </div>
                  <span className="text-[13px] text-white/45 group-hover:text-white transition-colors" style={{ fontWeight: 300 }}>
                    {t('footer.scheduleCall')}
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06]">
        <div className="container py-5">
          <div className="flex items-center justify-between">

            <div className="flex items-center gap-6">
              <span className="text-[11px] text-white/20" style={{ fontWeight: 300 }}>
                {t('footer.copyrightLine', { year: new Date().getFullYear(), rights: t('footer.allRightsReserved') })}
              </span>

              <div className="hidden items-center gap-4 text-[11px] text-white/20 md:flex" style={{ fontWeight: 300 }}>
                <Link href="/legal/privacy" className="hover:text-white/45 transition-colors">{t('footer.privacy')}</Link>
                <Link href="/legal/terms" className="hover:text-white/45 transition-colors">{t('footer.terms')}</Link>
                <Link href="/legal/cookies" className="hover:text-white/45 transition-colors">{t('footer.cookies')}</Link>
                <Link href="/admin" className="hover:text-white/45 transition-colors">{t('footer.admin')}</Link>
              </div>

              <div className="hidden h-3.5 w-px bg-white/[0.08] lg:block" />

              <div className="hidden items-center gap-1 lg:flex">
                <a href="https://instagram.com/portugalactive" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-white/20 hover:text-white/45 transition-colors flex items-center justify-center w-11 h-11" style={{ minHeight: 'auto', minWidth: 'auto' }}><Instagram className="h-[15px] w-[15px]" /></a>
                <a href="https://www.youtube.com/@portugalactivechannel" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-white/20 hover:text-white/45 transition-colors flex items-center justify-center w-11 h-11" style={{ minHeight: 'auto', minWidth: 'auto' }}><Youtube className="h-[15px] w-[15px]" /></a>
                <a href="https://vimeo.com/portugalactive" target="_blank" rel="noopener noreferrer" aria-label="Vimeo" className="text-white/20 hover:text-white/45 transition-colors flex items-center justify-center w-11 h-11" style={{ minHeight: 'auto', minWidth: 'auto' }}><svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609C15.906 19.988 13.08 22 10.68 22c-1.48 0-2.736-1.37-3.77-4.107C6.085 14.98 5.26 12.07 4.433 9.162c-.66-2.738-1.37-4.108-2.13-4.108-.165 0-.74.347-1.725 1.033L0 5.32c1.085-.953 2.157-1.906 3.21-2.858 1.447-1.254 2.531-1.913 3.26-1.98 1.713-.166 2.767 1.005 3.165 3.515.429 2.71.727 4.395.892 5.056.496 2.252 1.04 3.378 1.634 3.378.462 0 1.155-.73 2.08-2.19.924-1.46 1.42-2.572 1.486-3.336.132-1.262-.363-1.893-1.486-1.893-.53 0-1.075.12-1.637.36C13.75 2.152 16.047.186 19.082.013c2.253-.128 3.316 1.528 3.19 4.97l-.295 1.433z"/></svg></a>
                <a href="https://linkedin.com/company/portugalactive" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-white/20 hover:text-white/45 transition-colors flex items-center justify-center w-11 h-11" style={{ minHeight: 'auto', minWidth: 'auto' }}><Linkedin className="h-[15px] w-[15px]" /></a>
                <a href="https://facebook.com/portugalactive" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-white/20 hover:text-white/45 transition-colors flex items-center justify-center w-11 h-11" style={{ minHeight: 'auto', minWidth: 'auto' }}><Facebook className="h-[15px] w-[15px]" /></a>
              </div>
            </div>

            <FooterPaymentLogos />

          </div>
        </div>
      </div>
    </footer>
  );
}
