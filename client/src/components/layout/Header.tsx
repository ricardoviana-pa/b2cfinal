/* ==========================================================================
   HEADER V2
   Desktop: Hamburger + Logo (left) | Centre nav | Lang + Phone + BOOK NOW (right)
   Mobile: Logo (left) | BOOK button | Hamburger (right)
   ========================================================================== */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Link, useLocation, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import {
  Menu, X, Phone, Mail, MessageCircle, Instagram, Facebook, Youtube, Linkedin
} from 'lucide-react';
import { IMAGES } from '@/lib/images';
import LanguageSwitcher from './LanguageSwitcher';
import PromoBar from './PromoBar';
import { withEditorialTrip } from '@shared/editorialTripContext';

interface HeaderProps {
  variant?: 'transparent' | 'solid';
}

export default function Header({ variant = 'solid' }: HeaderProps) {
  const { t } = useTranslation();
  const search = useSearch();
  // Auth temporarily disabled
  // const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  // const authUser = meQuery.data;
  // One list and one order for the computer and the phone (decisão E13 do
  // Ricardo, 20 nov 2026): "Concierge" existed only in the phone menu, and on
  // the computer it sat inside a two-item menu under "Homes". That menu is
  // gone: its other entry, "All properties", was the "Homes" link itself.
  const navItems = useMemo(
    () => [
      { label: t('nav.properties'), href: '/homes' },
      { label: t('nav.destinations'), href: '/destinations' },
      { label: t('nav.experiences'), href: '/experiences' },
      { label: t('nav.concierge'), href: '/concierge' },
      { label: t('nav.events'), href: '/events' },
      { label: t('nav.journal'), href: '/blog' },
      { label: t('nav.about'), href: '/about' },
      { label: t('nav.contact'), href: '/contact' },
    ],
    [t]
  );
  const mobileNav = navItems;
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [location] = useLocation();
  // On a home's own page the RESERVE button books THAT home: it used to link
  // to the catalogue, pulling the guest away from the house they were reading.
  // PropertyDetail listens for the event and opens its booking sheet/card.
  const onHomePage = /^\/homes\/[^/]+/.test(location);
  const reserveHome = (e: { preventDefault: () => void }) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('pa:reserve'));
  };
  const phoneRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

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
  }, [location]);

  // Lock body scroll when menu is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Escape key closes mobile menu & focus trap
  useEffect(() => {
    if (!menuOpen) return;
    menuPanelRef.current?.querySelector<HTMLElement>('a[href], button')?.focus();

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
  // A section's link is the current one on its own pages too: /homes/<slug>
  // under Homes, /services/<slug> under Concierge.
  const isActiveNav = (href: string) =>
    location === href || location.startsWith(`${href}/`) || (href === '/concierge' && location.startsWith('/services'));
  const textColor = isTransparent ? 'text-white' : 'text-[#1A1A18]';
  const subtleColor = isTransparent ? 'text-white/70 hover:text-white' : 'text-pa-earth hover:text-[#1A1A18]';
  const dropdownBg = 'bg-white border border-[#E8E4DC]/60 shadow-lg';

  return (
    <>
      <PromoBar />
      <header
        role="banner"
        style={{ top: 'var(--pa-promobar-h, 0px)' }}
        className={`fixed left-0 right-0 z-50 transition-all duration-500 ${
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
                className={`flex lg:hidden items-center justify-center w-11 h-11 ${textColor} transition-colors`}
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

            {/* CENTRE: Desktop nav — the same eight links, in the same order, as
                the phone menu. 13 px between 1024 and 1279 px (the size it had
                before, with seven links): at 14 px the Dutch menu touched the
                logo and RESERVE. 15 px from 1280. */}
            <nav className="hidden lg:flex items-center gap-3 xl:gap-6" aria-label="Main navigation">
              {navItems.map(item => {
                const active = isActiveNav(item.href);
                return (
                  <Link
                    key={item.href}
                    href={withEditorialTrip(item.href,search)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative inline-flex items-center text-[13px] xl:text-[15px] font-medium leading-none pb-1 whitespace-nowrap transition-colors ${
                      active
                        ? (isTransparent ? 'text-white' : 'text-[#1A1A18]')
                        : (isTransparent ? 'text-white/80 hover:text-white' : 'text-pa-earth hover:text-[#1A1A18]')
                    }`}
                    style={{ letterSpacing: '0.02em', minHeight: 'auto', minWidth: 'auto' }}
                  >
                    {item.label}
                    {active && (
                      <span
                        className={`absolute left-0 right-0 bottom-0 h-px ${
                          isTransparent ? 'bg-white' : 'bg-[#1A1A18]'
                        }`}
                      />
                    )}
                  </Link>
                );
              })}
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
                    phoneOpen ? 'visible opacity-100 scale-100 pointer-events-auto' : 'invisible opacity-0 scale-95 pointer-events-none'
                  }`}
                >
                  <a
                    href="tel:+351258358434"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF7] transition-colors group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-[#F5F1EB] group-hover:bg-[#1A1A18] group-hover:text-white transition-colors">
                      <Phone className="w-3.5 h-3.5 text-pa-gold-aa group-hover:text-white" />
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[#1A1A18]">+351 258 358 434</p>
                      <p className="text-[13px] text-pa-stone">{t('header.office', 'Office')} · {t('header.callUsDirectly')}</p>
                    </div>
                  </a>

                  <a
                    href="mailto:info@portugalactive.com"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#FAFAF7] transition-colors group"
                  >
                    <div className="w-8 h-8 flex items-center justify-center bg-[#F5F1EB] group-hover:bg-[#1A1A18] group-hover:text-white transition-colors">
                      <Mail className="w-3.5 h-3.5 text-pa-gold-aa group-hover:text-white" />
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[#1A1A18]">info@portugalactive.com</p>
                      <p className="text-[13px] text-pa-stone">{t('header.sendEmail')}</p>
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
                      <MessageCircle className="w-3.5 h-3.5 text-pa-gold-aa group-hover:text-white" />
                    </div>
                    <div>
                      <p className="text-[15px] font-medium text-[#1A1A18]">+351 927 161 771</p>
                      <p className="text-[13px] text-pa-stone">{t('header.whatsapp')} · {t('header.chatConcierge')}</p>
                    </div>
                  </a>
                </div>
              </div>

              {/* Account / Login — temporarily disabled */}

              {/* Desktop: Reserve button */}
              <Link
                href={withEditorialTrip("/homes",search)}
                onClick={onHomePage ? reserveHome : undefined}
                className={`pa-action hidden md:inline-flex items-center px-6 py-2.5 text-[12px] font-medium uppercase transition-all duration-300 ${
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
                href={withEditorialTrip("/homes",search)}
                onClick={onHomePage ? reserveHome : undefined}
                className={`pa-action md:hidden inline-flex items-center px-4 py-2 min-h-[44px] text-[12px] font-medium uppercase transition-all duration-300 ${
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
        inert={!menuOpen}
        aria-modal="true"
        aria-label={t('header.menuLabel')}
        className={`fixed top-0 left-0 bottom-0 z-[55] w-[85vw] sm:w-[380px] lg:w-[420px] bg-white shadow-2xl transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${menuOpen ? 'visible translate-x-0' : 'invisible -translate-x-full'}`}
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
              className="w-11 h-11 flex items-center justify-center text-[#1A1A18] hover:text-pa-gold-aa transition-colors"
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
                href={withEditorialTrip(item.href,search)}
                onClick={() => setMenuOpen(false)}
                className={`block py-3.5 border-b border-[#E8E4DC]/30 transition-all duration-500 ${menuOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                style={{ transitionDelay: menuOpen ? `${80 + i * 50}ms` : '0ms' }}
              >
                <span
                  className="text-[1.3rem]"
                  style={{
                    fontFamily: 'var(--font-display)',
                    color: isActiveNav(item.href) ? '#806A48' : '#1A1A18',
                    fontWeight: 400,
                  }}
                >
                  {item.label}
                </span>
              </Link>
            ))}
            {/* Account link — temporarily disabled */}
          </nav>

          {/* Bottom: contact + language + social */}
          <div
            className={`px-7 pb-8 pt-5 border-t border-[#E8E4DC]/30 space-y-4 transition-all duration-500 ${menuOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
            style={{ transitionDelay: menuOpen ? '450ms' : '0ms' }}
          >
            <div className="flex flex-col gap-2.5">
              <a href="tel:+351258358434" className="flex items-center gap-2.5 text-[15px] text-[#1A1A18] font-medium">
                <Phone className="w-4 h-4 text-pa-gold-aa" />
                +351 258 358 434
              </a>
              <a href="mailto:info@portugalactive.com" className="flex items-center gap-2.5 text-[15px] text-pa-earth">
                <Mail className="w-4 h-4 text-pa-gold-aa" />
                info@portugalactive.com
              </a>
            </div>

            {/* Social */}
            <div className="flex items-center gap-4">
              <a href="https://instagram.com/portugalactive" target="_blank" rel="noopener noreferrer" className="text-pa-stone hover:text-[#1A1A18] transition-colors" aria-label="Instagram">
                <Instagram className="w-4.5 h-4.5" />
              </a>
              <a href="https://facebook.com/portugalactive" target="_blank" rel="noopener noreferrer" className="text-pa-stone hover:text-[#1A1A18] transition-colors" aria-label="Facebook">
                <Facebook className="w-4.5 h-4.5" />
              </a>
              <a href="https://www.youtube.com/@portugalactivechannel" target="_blank" rel="noopener noreferrer" className="text-pa-stone hover:text-[#1A1A18] transition-colors" aria-label="YouTube">
                <Youtube className="w-4.5 h-4.5" />
              </a>
              <a href="https://vimeo.com/portugalactive" target="_blank" rel="noopener noreferrer" className="text-pa-stone hover:text-[#1A1A18] transition-colors" aria-label="Vimeo">
                <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609C15.906 19.988 13.08 22 10.68 22c-1.48 0-2.736-1.37-3.77-4.107C6.085 14.98 5.26 12.07 4.433 9.162c-.66-2.738-1.37-4.108-2.13-4.108-.165 0-.74.347-1.725 1.033L0 5.32c1.085-.953 2.157-1.906 3.21-2.858 1.447-1.254 2.531-1.913 3.26-1.98 1.713-.166 2.767 1.005 3.165 3.515.429 2.71.727 4.395.892 5.056.496 2.252 1.04 3.378 1.634 3.378.462 0 1.155-.73 2.08-2.19.924-1.46 1.42-2.572 1.486-3.336.132-1.262-.363-1.893-1.486-1.893-.53 0-1.075.12-1.637.36C13.75 2.152 16.047.186 19.082.013c2.253-.128 3.316 1.528 3.19 4.97l-.295 1.433z"/></svg>
              </a>
              <a href="https://linkedin.com/company/portugalactive" target="_blank" rel="noopener noreferrer" className="text-pa-stone hover:text-[#1A1A18] transition-colors" aria-label="LinkedIn">
                <Linkedin className="w-4.5 h-4.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
