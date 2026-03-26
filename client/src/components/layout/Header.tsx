/* ==========================================================================
   HEADER V2
   Desktop: Hamburger + Logo (left) | Centre nav with Properties dropdown | Lang + Phone + BOOK NOW (right)
   Mobile: Logo (left) | BOOK button | Hamburger (right)
   Properties mega-dropdown: destinations + Concierge
   ========================================================================== */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import {
  Menu, X, Phone, Mail, MessageCircle, Instagram, Youtube, Linkedin,
  ChevronDown, ChevronRight, MapPin, Sparkles, ArrowRight
} from 'lucide-react';
import { IMAGES } from '@/lib/images';
import LanguageSwitcher from './LanguageSwitcher';

interface HeaderProps {
  variant?: 'transparent' | 'solid';
}

export default function Header({ variant = 'transparent' }: HeaderProps) {
  const { t } = useTranslation();
  const destinations = useMemo(
    () =>
      [
        { slug: 'minho' as const },
        { slug: 'porto' as const },
        { slug: 'lisbon' as const },
        { slug: 'alentejo' as const },
        { slug: 'algarve' as const },
      ].map((d) => ({ label: t(`destinations.${d.slug}`), slug: d.slug })),
    [t]
  );
  const navItems = useMemo(
    () => [
      { label: t('nav.properties'), href: '/homes', hasDropdown: true },
      { label: t('nav.destinations'), href: '/destinations' },
      { label: t('nav.events'), href: '/events' },
      { label: t('nav.journal'), href: '/blog' },
      { label: t('nav.about'), href: '/about' },
      { label: t('nav.contact'), href: '/contact' },
    ],
    [t]
  );
  const mobileNav = useMemo(
    () => [
      { label: t('nav.properties'), href: '/homes', isParent: true },
      { label: t('nav.destinations'), href: '/destinations' },
      { label: t('nav.concierge'), href: '/services', isParent: false },
      { label: t('nav.events'), href: '/events' },
      { label: t('nav.journal'), href: '/blog' },
      { label: t('nav.about'), href: '/about' },
      { label: t('nav.contact'), href: '/contact' },
    ],
    [t]
  );
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [mobilePropertiesOpen, setMobilePropertiesOpen] = useState(false);
  const [location] = useLocation();
  const phoneRef = useRef<HTMLDivElement>(null);
  const propertiesRef = useRef<HTMLDivElement>(null);
  const propertiesTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleScroll = useCallback(() => {
    setScrolled(window.scrollY > 60);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Close everything on route change
  useEffect(() => {
    setMenuOpen(false);
    setPhoneOpen(false);
    setPropertiesOpen(false);
    setMobilePropertiesOpen(false);
  }, [location]);

  // Lock body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (phoneRef.current && !phoneRef.current.contains(e.target as Node)) setPhoneOpen(false);
      if (propertiesRef.current && !propertiesRef.current.contains(e.target as Node)) setPropertiesOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isTransparent = variant === 'transparent' && !scrolled && !menuOpen;
  const textColor = isTransparent ? 'text-white' : 'text-[#1A1A18]';
  const subtleColor = isTransparent ? 'text-white/70 hover:text-white' : 'text-[#6B6860] hover:text-[#1A1A18]';
  const dropdownBg = 'bg-white border border-[#E8E4DC]/60 shadow-lg';

  // Hover intent for Properties dropdown
  const openProperties = () => {
    clearTimeout(propertiesTimeout.current);
    setPropertiesOpen(true);
    setPhoneOpen(false);
  };
  const closeProperties = () => {
    propertiesTimeout.current = setTimeout(() => setPropertiesOpen(false), 150);
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isTransparent
            ? 'bg-transparent'
            : 'bg-white/96 backdrop-blur-md border-b border-[#E8E4DC]/50'
        }`}
      >
        <div className="container">
          <div className="flex items-center justify-between h-16 md:h-20">

            {/* LEFT: Hamburger + Logo */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className={`flex items-center justify-center w-10 h-10 ${textColor} transition-colors`}
                style={{ minHeight: 'auto', minWidth: 'auto' }}
                aria-label={menuOpen ? t('header.closeMenu') : t('header.openMenu')}
              >
                {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>

              <Link href="/" className="flex-shrink-0 flex items-center">
                <img
                  src={IMAGES.logoWhite}
                  alt={t('header.logoAlt')}
                  className="h-8 md:h-10 w-auto transition-all duration-500 object-contain"
                  style={{
                    filter: isTransparent ? 'none' : 'invert(1)',
                  }}
                />
              </Link>
            </div>

            {/* CENTRE: Desktop nav with Properties dropdown */}
            <nav className="hidden lg:flex items-center gap-6">
              {navItems.map(item => (
                item.hasDropdown ? (
                  <div
                    key={item.href}
                    ref={propertiesRef}
                    className="relative"
                    onMouseEnter={openProperties}
                    onMouseLeave={closeProperties}
                  >
                    <Link
                      href={item.href}
                      className={`flex items-center gap-1 text-[13px] font-medium transition-colors ${
                        location.startsWith('/homes') || location.startsWith('/services')
                          ? (isTransparent ? 'text-white' : 'text-[#1A1A18]')
                          : (isTransparent ? 'text-white/75 hover:text-white' : 'text-[#6B6860] hover:text-[#1A1A18]')
                      }`}
                      style={{ letterSpacing: '0.02em' }}
                    >
                      {item.label}
                      <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${propertiesOpen ? 'rotate-180' : ''}`} />
                    </Link>

                    {/* Properties mega-dropdown */}
                    <div
                      className={`absolute top-full left-1/2 -translate-x-1/2 mt-3 ${dropdownBg} w-[340px] py-2 transition-all duration-200 origin-top ${
                        propertiesOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                      }`}
                    >
                      {/* All Properties */}
                      <Link
                        href="/homes"
                        className="flex items-center justify-between px-5 py-3 hover:bg-[#FAFAF7] transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 flex items-center justify-center bg-[#F5F1EB] group-hover:bg-[#1A1A18] transition-colors">
                            <ArrowRight className="w-3.5 h-3.5 text-[#8B7355] group-hover:text-white transition-colors" />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-[#1A1A18]">{t('header.allProperties')}</p>
                            <p className="text-[11px] text-[#9E9A90]">{t('header.browseCollection')}</p>
                          </div>
                        </div>
                      </Link>

                      <div className="mx-4 my-1 border-t border-[#E8E4DC]/40" />

                      {/* By Destination */}
                      <p className="px-5 pt-2 pb-1 text-[10px] font-medium text-[#9E9A90] tracking-[0.06em] uppercase">{t('header.byDestination')}</p>
                      {destinations.map(dest => (
                        <Link
                          key={dest.slug}
                          href={`/homes?destination=${dest.slug}`}
                          className="flex items-center gap-3 px-5 py-2.5 hover:bg-[#FAFAF7] transition-colors group"
                        >
                          <MapPin className="w-3.5 h-3.5 text-[#9E9A90] group-hover:text-[#8B7355] transition-colors" />
                          <span className="text-[13px] text-[#6B6860] group-hover:text-[#1A1A18] transition-colors">{dest.label}</span>
                        </Link>
                      ))}

                      <div className="mx-4 my-1 border-t border-[#E8E4DC]/40" />

                      {/* Concierge */}
                      <Link
                        href="/services"
                        className="flex items-center justify-between px-5 py-3 hover:bg-[#FAFAF7] transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 flex items-center justify-center bg-[#F5F1EB] group-hover:bg-[#8B7355] transition-colors">
                            <Sparkles className="w-3.5 h-3.5 text-[#8B7355] group-hover:text-white transition-colors" />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-[#1A1A18]">{t('nav.concierge')}</p>
                            <p className="text-[11px] text-[#9E9A90]">{t('header.conciergeSubtitle')}</p>
                          </div>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-[#9E9A90] group-hover:text-[#8B7355] transition-colors" />
                      </Link>
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`text-[13px] font-medium transition-colors ${
                      location === item.href
                        ? (isTransparent ? 'text-white' : 'text-[#1A1A18]')
                        : (isTransparent ? 'text-white/75 hover:text-white' : 'text-[#6B6860] hover:text-[#1A1A18]')
                    }`}
                    style={{ letterSpacing: '0.02em' }}
                  >
                    {item.label}
                  </Link>
                )
              ))}
            </nav>

            {/* RIGHT: Language + Phone dropdown + BOOK NOW */}
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <LanguageSwitcher tone={isTransparent ? 'dark' : 'light'} />

              {/* Phone icon with dropdown (desktop) */}
              <div ref={phoneRef} className="relative hidden md:block">
                <button
                  onClick={() => { setPhoneOpen(v => !v); }}
                  className={`flex items-center justify-center w-9 h-9 transition-all duration-200 ${
                    phoneOpen
                      ? 'bg-[#1A1A18] text-white'
                      : `${subtleColor}`
                  }`}
                  style={{ minHeight: 'auto', minWidth: 'auto' }}
                  aria-label={t('header.contactOptions')}
                >
                  <Phone className="w-[17px] h-[17px]" />
                </button>

                <div
                  className={`absolute top-full right-0 mt-2 ${dropdownBg} py-2 w-[260px] transition-all duration-200 origin-top-right ${
                    phoneOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                  }`}
                >
                  <a
                    href="tel:+351927161771"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF7] transition-colors group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-[#F5F1EB] group-hover:bg-[#1A1A18] group-hover:text-white transition-colors">
                      <Phone className="w-3.5 h-3.5 text-[#8B7355] group-hover:text-white" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1A1A18]">+351 927 161 771</p>
                      <p className="text-[11px] text-[#9E9A90]">{t('header.callUsDirectly')}</p>
                    </div>
                  </a>

                  <a
                    href="mailto:info@portugalactive.com"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF7] transition-colors group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-[#F5F1EB] group-hover:bg-[#1A1A18] group-hover:text-white transition-colors">
                      <Mail className="w-3.5 h-3.5 text-[#8B7355] group-hover:text-white" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1A1A18]">info@portugalactive.com</p>
                      <p className="text-[11px] text-[#9E9A90]">{t('header.sendEmail')}</p>
                    </div>
                  </a>

                  <div className="mx-4 my-1 border-t border-[#E8E4DC]/50" />

                  <a
                    href="https://wa.me/351927161771?text=Hi%2C%20I%27d%20like%20to%20speak%20with%20a%20concierge"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF7] transition-colors group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-[#F5F1EB] group-hover:bg-[#8B7355] group-hover:text-white transition-colors">
                      <MessageCircle className="w-3.5 h-3.5 text-[#8B7355] group-hover:text-white" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1A1A18]">{t('header.whatsapp')}</p>
                      <p className="text-[11px] text-[#9E9A90]">{t('header.chatConcierge')}</p>
                    </div>
                  </a>
                </div>
              </div>

              {/* Desktop: BOOK NOW button */}
              <Link
                href="/homes"
                className={`hidden md:inline-flex items-center rounded-full px-5 py-2.5 text-[11px] font-semibold transition-all duration-300 ${
                  isTransparent
                    ? 'border border-white/40 text-white hover:bg-white/15 hover:border-white/60'
                    : 'border border-[#1A1A18] text-[#1A1A18] hover:bg-[#1A1A18] hover:text-white'
                }`}
                style={{ letterSpacing: '1.5px' }}
              >
                {t('nav.bookNow')}
              </Link>

              {/* Mobile: BOOK button */}
              <Link
                href="/homes"
                className={`md:hidden inline-flex items-center rounded-full px-4 py-2 text-[10px] font-semibold transition-all duration-300 ${
                  isTransparent
                    ? 'border border-white/40 text-white hover:bg-white/15'
                    : 'border border-[#1A1A18] text-[#1A1A18] hover:bg-[#1A1A18] hover:text-white'
                }`}
                style={{ letterSpacing: '1.5px' }}
              >
                {t('nav.book')}
              </Link>
            </div>

          </div>
        </div>
      </header>

      {/* ─── MOBILE MENU ─── */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[54] transition-all duration-500 ${menuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMenuOpen(false)}
        style={{ backgroundColor: 'rgba(26,26,24,0.35)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
      />

      {/* Panel — slides from left */}
      <div
        className={`fixed top-0 left-0 bottom-0 z-[55] w-[85vw] sm:w-[380px] lg:w-[420px] bg-white shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${menuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-full flex flex-col overflow-y-auto">

          {/* Top bar: Logo + Close — aligned on same row */}
          <div className="flex items-center justify-between px-7 pt-6 pb-4 border-b border-[#E8E4DC]/30">
            <Link href="/" onClick={() => setMenuOpen(false)}>
              <img
                src={IMAGES.logoWhite}
                alt={t('header.logoAlt')}
                className="h-9 w-auto"
                style={{ filter: 'invert(1)' }}
              />
            </Link>
            <button
              onClick={() => setMenuOpen(false)}
              className="w-10 h-10 flex items-center justify-center text-[#1A1A18] hover:text-[#8B7355] transition-colors"
              style={{ minHeight: 'auto', minWidth: 'auto' }}
              aria-label={t('header.closeMenu')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 px-7 pt-6">
            {mobileNav.map((item, i) => (
              <div key={item.href}>
                {item.isParent ? (
                  /* Properties with expandable sub-items */
                  <div
                    className={`transition-all duration-500 ${menuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                    style={{ transitionDelay: menuOpen ? `${80 + i * 50}ms` : '0ms' }}
                  >
                    <div className="flex items-center justify-between py-3.5 border-b border-[#E8E4DC]/30">
                      <Link
                        href={item.href}
                        onClick={() => setMenuOpen(false)}
                        className="flex-1"
                      >
                        <span
                          className="text-[1.3rem]"
                          style={{
                            fontFamily: 'var(--font-display)',
                            color: location.startsWith('/homes') ? '#8B7355' : '#1A1A18',
                            fontWeight: 400,
                          }}
                        >
                          {item.label}
                        </span>
                      </Link>
                      <button
                        onClick={() => setMobilePropertiesOpen(v => !v)}
                        className="w-8 h-8 flex items-center justify-center text-[#9E9A90] hover:text-[#1A1A18] transition-colors"
                        style={{ minHeight: 'auto', minWidth: 'auto' }}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${mobilePropertiesOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Expandable sub-items */}
                    <div
                      className="overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)]"
                      style={{
                        maxHeight: mobilePropertiesOpen ? '400px' : '0px',
                        opacity: mobilePropertiesOpen ? 1 : 0,
                      }}
                    >
                      <div className="pl-3 py-2 space-y-0.5">
                        <Link
                          href="/homes"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 py-2.5 text-[14px] text-[#6B6860] hover:text-[#1A1A18] transition-colors"
                        >
                          <ArrowRight className="w-3.5 h-3.5 text-[#9E9A90]" />
                          {t('header.allProperties')}
                        </Link>
                        {destinations.map(dest => (
                          <Link
                            key={dest.slug}
                            href={`/homes?destination=${dest.slug}`}
                            onClick={() => setMenuOpen(false)}
                            className="flex items-center gap-2.5 py-2.5 text-[14px] text-[#6B6860] hover:text-[#1A1A18] transition-colors"
                          >
                            <MapPin className="w-3.5 h-3.5 text-[#9E9A90]" />
                            {dest.label}
                          </Link>
                        ))}
                        <Link
                          href="/services"
                          onClick={() => setMenuOpen(false)}
                          className="flex items-center gap-2.5 py-2.5 text-[14px] text-[#8B7355] font-medium hover:text-[#8B7355] transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-[#8B7355]" />
                          {t('nav.concierge')}
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : item.href === '/services' ? (
                  /* Concierge — skip in mobile nav since it's under Properties */
                  null
                ) : (
                  /* Regular nav item */
                  <Link
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={`block py-3.5 border-b border-[#E8E4DC]/30 transition-all duration-500 ${menuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                    style={{ transitionDelay: menuOpen ? `${80 + i * 50}ms` : '0ms' }}
                  >
                    <span
                      className="text-[1.3rem]"
                      style={{
                        fontFamily: 'var(--font-display)',
                        color: location === item.href ? '#8B7355' : '#1A1A18',
                        fontWeight: 400,
                      }}
                    >
                      {item.label}
                    </span>
                  </Link>
                )}
              </div>
            ))}
          </nav>

          {/* Bottom: contact + language + social */}
          <div
            className={`px-7 pb-8 pt-5 border-t border-[#E8E4DC]/30 space-y-4 transition-all duration-500 ${menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: menuOpen ? '450ms' : '0ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <a href="tel:+351927161771" className="flex items-center gap-2.5 text-[13px] text-[#1A1A18] font-medium">
                <Phone className="w-4 h-4 text-[#8B7355]" />
                +351 927 161 771
              </a>
              <a href="mailto:info@portugalactive.com" className="flex items-center gap-2.5 text-[13px] text-[#6B6860]">
                <Mail className="w-4 h-4 text-[#8B7355]" />
                info@portugalactive.com
              </a>
            </div>

            {/* Social */}
            <div className="flex items-center gap-4">
              <a href="https://instagram.com/portugalactive" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors">
                <Instagram className="w-4.5 h-4.5" />
              </a>
              <a href="https://youtube.com/@portugalactive" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors">
                <Youtube className="w-4.5 h-4.5" />
              </a>
              <a href="https://linkedin.com/company/portugalactive" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors">
                <Linkedin className="w-4.5 h-4.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
