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

export default function Footer() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) { setSubscribed(true); setEmail(''); }
  };

  return (
    <footer className="bg-[#1A1A18] text-white">
      {/* Main grid */}
      <div className="container py-14 lg:py-20">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-10 lg:gap-8">

          {/* Column 1: Brand + Newsletter */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href="/">
              <img src={IMAGES.logoWhite} alt={t('header.logoAlt')} className="h-5 lg:h-6 w-auto object-contain mb-4" />
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
              <p className="text-[13px] flex items-center gap-2 text-[#C4A87C]">
                <Check className="w-3.5 h-3.5" /> {t('footer.welcomeInbox')}
              </p>
            ) : (
              <form onSubmit={handleSubscribe} className="flex">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('footer.emailPlaceholder')}
                  required
                  className="flex-1 px-3 py-2.5 text-[12px] bg-transparent border border-white/15 text-white placeholder:text-white/25 focus:outline-none focus:border-white/35 transition-colors min-w-0"
                  style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
                />
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-white text-[#1A1A18] text-[10px] font-semibold hover:bg-[#C4A87C] hover:text-white transition-colors flex-shrink-0"
                  style={{ letterSpacing: '1.5px' }}
                >
                  {t('footer.subscribe')}
                </button>
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
              <li><Link href="/destinations/algarve" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.algarve')}</Link></li>
              <li>
                <span className="text-[13px] text-white/20" style={{ fontWeight: 300 }}>
                  {t('footer.lisbon')} <span className="text-[10px] text-white/15">{t('footer.soon')}</span>
                </span>
              </li>
              <li>
                <span className="text-[13px] text-white/20" style={{ fontWeight: 300 }}>
                  {t('footer.alentejo')} <span className="text-[10px] text-white/15">{t('footer.soon')}</span>
                </span>
              </li>
              <li>
                <span className="text-[13px] text-white/15" style={{ fontWeight: 300 }}>
                  {t('footer.brazil')} <span className="text-[10px]">{t('footer.year2026')}</span>
                </span>
              </li>
            </ul>
          </div>

          {/* Column 3: Explore */}
          <div>
            <h4
              className="text-[11px] font-semibold text-[#C4A87C] mb-5"
              style={{ letterSpacing: '0.08em' }}
            >
              EXPLORE
            </h4>
            <ul className="flex flex-col gap-3">
              <li><Link href="/homes" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.bookStay')}</Link></li>
              <li><Link href="/experiences" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>Experiences</Link></li>
              <li><Link href="/events" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>{t('footer.events')}</Link></li>
            </ul>

            <h4
              className="text-[11px] font-semibold text-[#C4A87C] mb-5 mt-8"
              style={{ letterSpacing: '0.08em' }}
            >
              FOR GUESTS
            </h4>
            <ul className="flex flex-col gap-3">
              <li><Link href="/concierge" className="text-[13px] text-white/45 hover:text-white transition-colors" style={{ fontWeight: 300 }}>Concierge Services</Link></li>
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
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="container py-5">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* Left: Legal */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-1 text-[11px] text-white/20" style={{ fontWeight: 300 }}>
              <span>
                {t('footer.copyrightLine', {
                  year: new Date().getFullYear(),
                  rights: t('footer.allRightsReserved'),
                })}
              </span>
              <Link href="/legal/privacy" className="hover:text-white/50 transition-colors">{t('footer.privacy')}</Link>
              <Link href="/legal/terms" className="hover:text-white/50 transition-colors">{t('footer.terms')}</Link>
              <Link href="/legal/cookies" className="hover:text-white/50 transition-colors">{t('footer.cookies')}</Link>
              <Link href="/admin" className="hover:text-white/50 transition-colors">{t('footer.admin')}</Link>
            </div>

            {/* Right: Social + Payment */}
            <div className="flex items-center gap-6">
              {/* Social icons */}
              <div className="flex items-center gap-3.5">
                <a href="https://instagram.com/portugalactive" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-white/20 hover:text-white/60 transition-colors">
                  <Instagram className="w-4 h-4" />
                </a>
                <a href="https://youtube.com/@portugalactive" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-white/20 hover:text-white/60 transition-colors">
                  <Youtube className="w-4 h-4" />
                </a>
                <a href="https://linkedin.com/company/portugalactive" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="text-white/20 hover:text-white/60 transition-colors">
                  <Linkedin className="w-4 h-4" />
                </a>
                <a href="https://facebook.com/portugalactive" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-white/20 hover:text-white/60 transition-colors">
                  <Facebook className="w-4 h-4" />
                </a>
              </div>

              {/* Divider */}
              <div className="w-px h-4 bg-white/10" />

              {/* Payment method text logos — clean, minimal, Le Collectionist style */}
              <div className="flex items-center gap-3">
                {/* Visa */}
                <svg viewBox="0 0 48 16" className="h-3 w-auto" aria-label="Visa">
                  <text
                    x="0" y="13"
                    fill="rgba(255,255,255,0.25)"
                    fontSize="15"
                    fontWeight="700"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    fontStyle="italic"
                    letterSpacing="-0.5"
                  >
                    VISA
                  </text>
                </svg>
                {/* Mastercard */}
                <svg viewBox="0 0 28 18" className="h-3.5 w-auto" aria-label="Mastercard">
                  <circle cx="10" cy="9" r="7" fill="rgba(255,255,255,0.15)" />
                  <circle cx="18" cy="9" r="7" fill="rgba(255,255,255,0.20)" />
                </svg>
                {/* Amex */}
                <svg viewBox="0 0 48 16" className="h-3 w-auto" aria-label="American Express">
                  <text
                    x="0" y="12"
                    fill="rgba(255,255,255,0.25)"
                    fontSize="10"
                    fontWeight="700"
                    fontFamily="system-ui, -apple-system, sans-serif"
                    letterSpacing="0.5"
                  >
                    AMEX
                  </text>
                </svg>
                {/* Apple Pay */}
                <svg viewBox="0 0 56 16" className="h-3 w-auto" aria-label="Apple Pay">
                  <text
                    x="0" y="12"
                    fill="rgba(255,255,255,0.25)"
                    fontSize="10"
                    fontWeight="500"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    Apple Pay
                  </text>
                </svg>
                {/* Bank Transfer */}
                <svg viewBox="0 0 70 16" className="h-3 w-auto" aria-label="Bank Transfer">
                  <text
                    x="0" y="12"
                    fill="rgba(255,255,255,0.18)"
                    fontSize="9"
                    fontWeight="400"
                    fontFamily="system-ui, -apple-system, sans-serif"
                  >
                    Bank Transfer
                  </text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
