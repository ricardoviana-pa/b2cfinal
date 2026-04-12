/* ==========================================================================
   HEADER V2
   Desktop: Hamburger + Logo (left) | Centre nav | Lang + Phone + BOOK NOW (right)
   Mobile: Logo (left) | BOOK button | Hamburger (right)
   ========================================================================== */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import {
  Menu, X, Phone, Mail, MessageCircle, Instagram, Facebook, Youtube, Linkedin,
  User, ChevronDown
} from 'lucide-react';
import { IMAGES } from '@/lib/images';
import { trpc } from '@/lib/trpc';
import LanguageSwitcher from './LanguageSwitcher';

interface HeaderProps {
  variant?: 'transparent' | 'solid';
}

export default function Header({ variant = 'solid' }: HeaderProps) {
  const { t } = useTranslation();
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const authUser = meQuery.data;
  const navItems = useMemo(
    () => [
      { label: t('nav.properties'), href: '/homes', hasDropdown: true },
      { label: t('nav.experiences', 'Experiences'), href: '/experiences' },
      { label: t('nav.events'), href: '/events' },
      { label: t('nav.journal'), href: '/blog' },
      { label: t('nav.about'), href: '/about' },
      { label: t('nav.contact'), href: '/contact' },
    ],
    [t]
  );
  const mobileNav = useMemo(
    () => [
      { label: t('nav.properties'), href: '/homes' },
      { label: t('nav.experiences', 'Experiences'), href: '/experiences' },
      { label: t('nav.concierge'), href: '/concierge' },
      { label: t('nav.destinations'), href: '/destinations' },
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
  const [location] = useLocation();
  const phoneRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);
  const propertiesTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const openProperties = () => { clearTimeout(propertiesTimeout.current); setPropertiesOpen(true); };
  const closeProperties = () => { propertiesTimeout.current = setTimeout(() => setPropertiesOpen(false), 180); };

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
  }, [location]);

  // Lock body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Escape key closes mobile menu & focus trap
  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
        return;
      }
      if (e.key === 'Tab' && menuPanelRef.current) {
        const focusable = menuPanelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (phoneRef.current && !phoneRef.current.contains(e.target as Node)) setPhoneOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const isTransparent = variant === 'transparent' && !scrolled && !menuOpen;
  const textColor = isTransparent ? 'text-white' : 'text-[#1A1A18]';
  const subtleColor = isTransparent ? 'text-white/70 hover:text-white' : 'text-[#6B6860] hover:text-[#1A1A18]';
  const dropdownBg = 'bg-white border border-[#E8E4DC]/60 shadow-lg';

  return (
    <>
      {/* Skip to main content — first focusable element */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-md focus:bg-[#1A1A18] focus:text-white focus:text-sm focus:outline-none"
      >
        {t('header.skipToContent', 'Skip to main content')}
      </a>
      <header
        role="banner"
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
                ref={menuToggleRef}
                onClick={() => setMenuOpen(v => !v)}
                className={`flex items-center justify-center w-11 h-11 ${textColor} transition-colors`}
                aria-label={menuOpen ? t('header.closeMenu') : t('header.openMenu')}
                aria-expanded={menuOpen}
                aria-controls="mobile-menu-panel"
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
            <nav className="hidden lg:flex items-center gap-6" aria-label="Main navigation">
              {navItems.map(item => (
                item.hasDropdown ? (
                  <div
                    key={item.href}
                    className="relative flex items-center"
                    onMouseEnter={openProperties}
                    onMouseLeave={closeProperties}
                  >
                    {(() => {
                      const isActiveDropdown = location.startsWith('/homes') || location.startsWith('/concierge') || location.startsWith('/services');
                      return (
                        <Link
                          href={item.href}
                          className={`relative inline-flex items-center gap-1 text-[13px] font-medium leading-none pb-1 transition-colors ${
                            isActiveDropdown
                              ? (isTransparent ? 'text-white' : 'text-[#1A1A18]')
                              : (isTransparent ? 'text-white/75 hover:text-white' : 'text-[#6B6860] hover:text-[#1A1A18]')
                          }`}
                          style={{ letterSpacing: '0.02em', minHeight: 'auto', minWidth: 'auto' }}
                        >
                          {item.label}
                          <ChevronDown className={`w-3 h-3 shrink-0 transition-transform duration-200 ${propertiesOpen ? 'rotate-180' : ''}`} />
                          {isActiveDropdown && (
                            <span
                              className={`absolute left-0 right-0 bottom-0 h-px ${
                                isTransparent ? 'bg-white' : 'bg-[#1A1A18]'
                              }`}
                            />
                          )}
                        </Link>
                      );
                    })()}

                    {/* Minimalist Properties dropdown */}
                    <div
                      className={`absolute top-full left-1/2 -translate-x-1/2 pt-3 transition-all duration-200 origin-top ${
                        propertiesOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
                      }`}
                    >
                      <div className={`${dropdownBg} w-[220px] py-2`}>
                        <Link
                          href="/homes"
                          className="block px-5 py-2.5 text-[13px] text-[#6B6860] hover:bg-[#FAFAF7] hover:text-[#1A1A18] transition-colors"
                        >
                          {t('header.allProperties', 'All properties')}
                        </Link>
                        <div className="mx-5 my-1 border-t border-[#E8E4DC]/50" />
                        <Link
                          href="/concierge"
                          className="block px-5 py-2.5 hover:bg-[#FAFAF7] transition-colors"
                        >
                          <span className="block text-[13px] text-[#6B6860] hover:text-[#1A1A18]">{t('nav.concierge')}</span>
                          <span className="block text-[10px] text-[#9E9A90] mt-0.5">Exclusive to our guests</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative inline-flex items-center text-[13px] font-medium leading-none pb-1 transition-colors ${
                      location === item.href
                        ? (isTransparent ? 'text-white' : 'text-[#1A1A18]')
                        : (isTransparent ? 'text-white/75 hover:text-white' : 'text-[#6B6860] hover:text-[#1A1A18]')
                    }`}
                    style={{ letterSpacing: '0.02em', minHeight: 'auto', minWidth: 'auto' }}
                  >
                    {item.label}
                    {location === item.href && (
                      <span
                        className={`absolute left-0 right-0 bottom-0 h-px ${
                          isTransparent ? 'bg-white' : 'bg-[#1A1A18]'
                        }`}
                      />
                    )}
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

              {/* Account / Login */}
              <Link
                href={authUser ? '/account' : '/login'}
                className={`hidden md:inline-flex items-center justify-center w-9 h-9 rounded-full transition-all duration-300 ${
                  isTransparent
                    ? 'text-white/70 hover:text-white hover:bg-white/10'
                    : 'text-[#6B6860] hover:text-[#1A1A18] hover:bg-[#F5F1EB]'
                }`}
                aria-label={authUser ? 'My Account' : 'Sign in'}
              >
                {authUser ? (
                  <div className="w-7 h-7 rounded-full bg-[#8B7355] flex items-center justify-center text-white text-[11px] font-display">
                    {(authUser.name || 'G')[0].toUpperCase()}
                  </div>
                ) : (
                  <User size={18} />
                )}
              </Link>

              {/* Desktop: Reserve button */}
              <Link
                href="/homes"
                className={`hidden md:inline-flex items-center px-6 py-2.5 text-[11px] font-medium uppercase transition-all duration-300 ${
                  isTransparent
                    ? 'border border-white/50 text-white hover:bg-white hover:text-[#1A1A18]'
                    : 'border border-[#1A1A18] text-[#1A1A18] hover:bg-[#1A1A18] hover:text-white'
                }`}
                style={{ letterSpacing: '0.14em' }}
              >
                {t('nav.bookNow')}
              </Link>

              {/* Mobile: Reserve button */}
              <Link
                href="/homes"
                className={`md:hidden inline-flex items-center px-4 py-2 text-[10px] font-medium uppercase transition-all duration-300 ${
                  isTransparent
                    ? 'border border-white/50 text-white hover:bg-white hover:text-[#1A1A18]'
                    : 'border border-[#1A1A18] text-[#1A1A18] hover:bg-[#1A1A18] hover:text-white'
                }`}
                style={{ letterSpacing: '0.14em' }}
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
        ref={menuPanelRef}
        id="mobile-menu-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t('header.menuLabel', 'Site navigation')}
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
              className="w-11 h-11 flex items-center justify-center text-[#1A1A18] hover:text-[#8B7355] transition-colors"
              aria-label={t('header.closeMenu')}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation links */}
          <nav className="flex-1 px-7 pt-6" aria-label="Mobile navigation">
            {mobileNav.map((item, i) => (
              <Link
                key={item.href}
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
            ))}
            {/* Account link */}
            <Link
              href={authUser ? '/account' : '/login'}
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 py-3.5 border-b border-[#E8E4DC]/30 transition-all duration-500 ${menuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
              style={{ transitionDelay: menuOpen ? '400ms' : '0ms' }}
            >
              {authUser ? (
                <div className="w-6 h-6 rounded-full bg-[#8B7355] flex items-center justify-center text-white text-[10px] font-display">
                  {(authUser.name || 'G')[0].toUpperCase()}
                </div>
              ) : (
                <User size={18} className="text-[#8B7355]" />
              )}
              <span className="text-[1.3rem]" style={{ fontFamily: 'var(--font-display)', color: '#1A1A18', fontWeight: 400 }}>
                {authUser ? t('nav.myAccount', 'My Account') : t('nav.signIn', 'Sign In')}
              </span>
            </Link>
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
              <a href="https://instagram.com/portugalactive" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors" aria-label="Instagram">
                <Instagram className="w-4.5 h-4.5" />
              </a>
              <a href="https://facebook.com/portugalactive" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors" aria-label="Facebook">
                <Facebook className="w-4.5 h-4.5" />
              </a>
              <a href="https://www.youtube.com/@portugalactivechannel" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors" aria-label="YouTube">
                <Youtube className="w-4.5 h-4.5" />
              </a>
              <a href="https://vimeo.com/portugalactive" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors" aria-label="Vimeo">
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609C15.906 19.988 13.08 22 10.68 22c-1.48 0-2.736-1.37-3.77-4.107C6.085 14.98 5.26 12.07 4.433 9.162c-.66-2.738-1.37-4.108-2.13-4.108-.165 0-.74.347-1.725 1.033L0 5.32c1.085-.953 2.157-1.906 3.21-2.858 1.447-1.254 2.531-1.913 3.26-1.98 1.713-.166 2.767 1.005 3.165 3.515.429 2.71.727 4.395.892 5.056.496 2.252 1.04 3.378 1.634 3.378.462 0 1.155-.73 2.08-2.19.924-1.46 1.42-2.572 1.486-3.336.132-1.262-.363-1.893-1.486-1.893-.53 0-1.075.12-1.637.36C13.75 2.152 16.047.186 19.082.013c2.253-.128 3.316 1.528 3.19 4.97l-.295 1.433z"/></svg>
              </a>
              <a href="https://linkedin.com/company/portugalactive" target="_blank" rel="noopener noreferrer" className="text-[#9E9A90] hover:text-[#1A1A18] transition-colors" aria-label="LinkedIn">
                <Linkedin className="w-4.5 h-4.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
