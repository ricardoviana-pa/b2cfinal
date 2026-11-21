/* ==========================================================================
   FOOTER — V6.0 Modern Luxury
   Elevated design with better hierarchy, breathing room, and visual polish.
   ========================================================================== */

import { useState } from 'react';
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { openCookiePreferences } from '@/lib/measurementConsent';
import { IMAGES } from '@/lib/images';
import { Instagram, Youtube, Linkedin, Facebook, Check, Phone, Mail, MessageCircle, ArrowUpRight, BookOpen } from 'lucide-react';
import FooterPaymentLogos from './FooterPaymentLogos';
import { trpc } from '@/lib/trpc';
import { pushDL } from '@/lib/datalayer';
import { COMPLAINTS_BOOK_NAME, COMPLAINTS_BOOK_URL } from '@/lib/legalLinks';
import { FOOTER_BOTTOM_INSET } from '@/lib/fixedBottom';
import { keepDashes } from '@/lib/format';

export default function Footer() {
  const { t, i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const realEstateLanguage = ["pt", "fr", "es"].includes(language) ? language + "/" : "";
  const managementLanguage = language === "pt" ? "" : (["en", "fr", "es", "de", "it", "nl"].includes(language) ? language : "en") + "/";
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

  /* On a phone the links sit in two columns. At 15 px in two equal columns
     of 155 px, "Northern Portugal · Minho", "Reservar a sua estadia" and
     others broke in two and the columns lost their rows. Below 768 px the
     links are 14 px (13 px before the redesign; still 13 px on a phone
     narrower than 375 px), the first column is as wide as its longest link
     and the second takes the rest, 24 px apart: measured in the nine
     languages at 390, 375 and 360 px, no language has more broken links than it had.
     If a label still breaks, the dot goes down with the word after it
     ("Northern Portugal" / "· Minho"): the space after " · " is non-breaking. */
  const tied = (label: string) => label.replace(/ · /g, ' ·\u00A0');
  const footerLinks = (rawLabel: string, href: string, external?: boolean) => { const label = tied(rawLabel); return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-[13px] min-[390px]:text-[14px] md:text-[15px] text-white/65 hover:text-white transition-colors duration-200 inline-flex items-center gap-1" style={{ fontWeight: 400 }}>
          {label} <ArrowUpRight size={10} className="opacity-0 group-hover:opacity-100" />
        </a>
      ) : (
        <Link href={href} className="text-[13px] min-[390px]:text-[14px] md:text-[15px] text-white/65 hover:text-white transition-colors duration-200" style={{ fontWeight: 400 }}>
          {label}
        </Link>
      )}
    </li>
  ); };

  return (
    // The bottom padding is the page's fixed bar (a home's or an experience's,
    // on a phone) or the floating buttons' room, whichever is higher, plus the
    // cookie banner while it is open: scrolled to the end, the last row and
    // the Livro de Reclamações sit above all of them (lib/fixedBottom.ts).
    <footer className="bg-[#1A1A18] text-white" role="contentinfo" style={{ paddingBottom: FOOTER_BOTTOM_INSET }}>

      {/* Newsletter banner */}
      <details className="border-b border-white/[0.1]">
        <summary className="container py-5 flex items-center justify-between gap-4 cursor-pointer list-none">
          <span className="text-[15px] text-white/80">{t('footer.nlHeadline')}</span>
          <span className="text-[13px] text-white/70 flex items-center gap-3">{t('footer.subscribe')} <span aria-hidden="true">+</span></span>
        </summary>
        <div className="container pb-6">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
            <div className="max-w-md">

              <p
                className="text-[15px] text-white/65 leading-relaxed text-balance"
                style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
              >
                {keepDashes(t('footer.nlSub'))}
              </p>
            </div>
            <div className="w-full lg:w-auto lg:min-w-[380px]">
              {subscribed ? (
                <p className="text-[15px] flex items-center gap-2 text-[#C4A87C]" role="status" aria-live="polite">
                  <Check className="w-3.5 h-3.5" /> {t('footer.welcomeInbox')}
                </p>
              ) : (
                <form id="lead-newsletter" onSubmit={handleSubscribe} className="flex flex-col gap-1.5">
                  <div className="flex">
                    <input
                      type="email"
                      aria-label={t('footer.emailPlaceholder')}
                      value={email}
                      onChange={e => { setEmail(e.target.value); setNlError(''); }}
                      placeholder={t('footer.emailPlaceholder')}
                      required
                      autoComplete="email"
                      inputMode="email"
                      className="flex-1 h-[48px] px-4 text-[15px] rounded-l-lg bg-white/[0.04] border border-white/10 text-white placeholder:text-white/65 focus:outline-none focus:border-white/30 transition-colors min-w-0"
                      style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
                    />
                    <button
                      type="submit"
                      disabled={subscribing}
                      className="pa-action [--pa-action-radius:0_8px_8px_0] h-[48px] px-6 bg-[#C4A87C] text-[#1A1A18] text-[13px] font-semibold hover:bg-[#D4B88C] transition-colors flex-shrink-0 disabled:opacity-50"
                      style={{ letterSpacing: '1.5px' }}
                    >
                      {subscribing ? '...' : t('footer.subscribe')}
                    </button>
                  </div>
                  {nlError && <p className="text-[13px] text-red-400" role="alert" aria-live="assertive">{nlError}</p>}
                </form>
              )}
            </div>
          </div>
        </div>
      </details>

      {/* Main link grid */}
      <div className="container py-10 lg:py-12">
        {/* Phones up to 479 px: the first column as wide as its longest link
            ("Northern Portugal · Minho"), links 13 px below 390 px (French
            "Services de conciergerie" broke at 375 px with 14 px links); from
            480 px two equal columns (as wide as its link, the first left 128
            to 288 px empty at the right).
            Tablets (768 to 1023 px): the three link columns take the whole
            row, each as wide as its links (in four equal tracks they had 146 px
            and one track stayed empty, so 15 px links broke in two). From
            1024 px the services column is a little wider: "Ein Haus kaufen
            oder verkaufen" needs 217 px. */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] min-[480px]:grid-cols-2 md:grid-cols-[repeat(3,auto)] md:justify-between lg:grid-cols-[1.15fr_1fr_1.1fr_0.9fr] lg:justify-normal gap-x-6 gap-y-10 md:gap-10 lg:gap-8">

          {/* Column 1: Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <Link href="/">
              <img src={IMAGES.logoWhite} alt="Portugal Active — luxury villas in Portugal" className="h-8 lg:h-10 w-auto object-contain mb-5 -ml-1.5 lg:-ml-2" />
            </Link>
            <p
              className="text-[15px] text-white/65 mb-5 leading-relaxed max-w-[260px]"
              style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
            >
              {t('footer.tagline')}
            </p>
            {/* Contact shortcuts */}
            <div className="flex items-center gap-3 mb-2">
              <a href="tel:+351258358434" className="flex items-center gap-2 group">
                <Phone size={13} className="text-white/65 group-hover:text-[#C4A87C] transition-colors" />
                <span className="text-[13px] text-white/65 group-hover:text-white transition-colors" style={{ fontWeight: 400 }}>+351 258 358 434</span>
              </a>
            </div>
            <div className="flex items-center gap-3 mb-2">
              <a href="mailto:info@portugalactive.com" className="flex items-center gap-2 group">
                <Mail size={13} className="text-white/65 group-hover:text-[#C4A87C] transition-colors" />
                <span className="text-[13px] text-white/65 group-hover:text-white transition-colors" style={{ fontWeight: 400 }}>info@portugalactive.com</span>
              </a>
            </div>
            <div className="flex items-center gap-3">
              <a href="https://wa.me/351927161771" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 group">
                <MessageCircle size={13} className="text-white/65 group-hover:text-[#C4A87C] transition-colors" />
                <span className="text-[13px] text-white/65 group-hover:text-white transition-colors" style={{ fontWeight: 400 }}>+351 927 161 771 · {t('header.whatsapp')}</span>
              </a>
            </div>
            <p className="mt-4 text-[13px] leading-relaxed text-white/65">
              <span className="block text-white/80 font-medium">{t('footer.offices')}</span>
              <Link href="/contact" className="hover:text-white transition-colors">Viana do Castelo · Lisboa</Link>
            </p>
          </div>

          {/* Column 2: Destinations */}
          <div>
            <h4 className="text-[12px] font-semibold text-white/60 uppercase mb-5" style={{ letterSpacing: '0.12em' }}>
              {t('footer.destinationsTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {footerLinks(t('destinations.minho'), '/destinations/minho')}
              {footerLinks(t('footer.porto'), '/destinations/porto')}
              {footerLinks(t('footer.douro'), '/destinations/douro')}
              {footerLinks(t('footer.lisbon'), '/destinations/lisbon')}
              {footerLinks(t('footer.alentejo'), '/destinations/alentejo')}
              {footerLinks(t('footer.algarve'), '/destinations/algarve')}
            </ul>
          </div>

          {/* Column 3: Services */}
          <div>
            <h4 className="text-[12px] font-semibold text-white/60 uppercase mb-5" style={{ letterSpacing: '0.12em' }}>
              {t('footer.servicesTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {footerLinks(t('footer.bookStay'), '/homes')}
              {footerLinks(t('footer.experiences'), '/experiences')}
              {footerLinks(t('footer.conciergeServices'), '/concierge')}
              {footerLinks(t('footer.events'), '/events')}
              <li><a href={`https://www.portugalactive.com/realestate/${realEstateLanguage}`} className="text-[13px] min-[390px]:text-[14px] md:text-[15px] text-white/65 hover:text-white transition-colors duration-200" style={{ fontWeight: 400 }}>{t('footer.realEstate')}</a></li>

            </ul>
          </div>

          {/* Column 4: Company */}
          <div>
            <h4 className="text-[12px] font-semibold text-white/60 uppercase mb-5" style={{ letterSpacing: '0.12em' }}>
              {t('footer.companyTitle')}
            </h4>
            <ul className="flex flex-col gap-3">
              {footerLinks(t('footer.about'), '/about')}
              {footerLinks(t('footer.faq'), '/faq')}
              {footerLinks(t('footer.journal'), '/blog')}
              {footerLinks(t('footer.contact'), '/contact')}
              <li>
                <a href={`https://www.portugalactive.com/management/${managementLanguage}`} className="text-[13px] min-[390px]:text-[14px] md:text-[15px] text-white/65 hover:text-white transition-colors" style={{ fontWeight: 400 }}>
                  {t('footer.forOwners', 'For property owners')} →
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/[0.06]">
        <div className="container py-7">

          {/* Row 1: social + payments */}
          <div className="flex flex-col items-center gap-6 xl:flex-row xl:justify-between">
            {/* Social */}
            <div className="flex items-center justify-center gap-0.5 md:justify-start">
              {[
                { href: 'https://instagram.com/portugalactive', label: 'Instagram', Icon: Instagram },
                { href: 'https://www.youtube.com/@portugalactivechannel', label: 'YouTube', Icon: Youtube },
                { href: 'https://vimeo.com/portugalactive', label: 'Vimeo', Icon: () => <svg className="h-[14px] w-[14px]" viewBox="0 0 24 24" fill="currentColor"><path d="M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609C15.906 19.988 13.08 22 10.68 22c-1.48 0-2.736-1.37-3.77-4.107C6.085 14.98 5.26 12.07 4.433 9.162c-.66-2.738-1.37-4.108-2.13-4.108-.165 0-.74.347-1.725 1.033L0 5.32c1.085-.953 2.157-1.906 3.21-2.858 1.447-1.254 2.531-1.913 3.26-1.98 1.713-.166 2.767 1.005 3.165 3.515.429 2.71.727 4.395.892 5.056.496 2.252 1.04 3.378 1.634 3.378.462 0 1.155-.73 2.08-2.19.924-1.46 1.42-2.572 1.486-3.336.132-1.262-.363-1.893-1.486-1.893-.53 0-1.075.12-1.637.36C13.75 2.152 16.047.186 19.082.013c2.253-.128 3.316 1.528 3.19 4.97l-.295 1.433z"/></svg> },
                { href: 'https://linkedin.com/company/portugalactive', label: 'LinkedIn', Icon: Linkedin },
                { href: 'https://facebook.com/portugalactive', label: 'Facebook', Icon: Facebook },
              ].map(({ href, label, Icon }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="text-white/65 hover:text-white/60 transition-colors duration-200 flex items-center justify-center w-9 h-9">
                  <Icon className="h-[14px] w-[14px]" />
                </a>
              ))}
            </div>

            {/* Payments */}
            <div className="flex min-w-0 flex-col items-center gap-3 xl:items-end">
              <span className="text-[12px] uppercase tracking-[0.16em] text-white/65 xl:pr-12" style={{ fontFamily: 'var(--font-body)' }}>
                {t('footer.paymentSecure', 'Secure payment')}
              </span>
              <FooterPaymentLogos />
            </div>
          </div>

          {/* Livro de Reclamações Eletrónico: acesso visível e destacado em todas
              as páginas (DL 156/2005, alterado pelo DL 74/2017). O nome oficial
              fica em português em todas as línguas; nas outras segue a tradução.
              A identidade legal (denominação, NIPC, sede) não fica à vista no
              rodapé: está nos Termos, a um clique daqui (pedido do Ricardo,
              20 nov 2026). */}
          <div className="mt-7 flex flex-col items-center gap-3 xl:flex-row xl:items-center xl:justify-start xl:gap-5">
            <a
              href={COMPLAINTS_BOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('legalFooter.complaintsBookAria')}
              className="inline-flex items-center gap-2.5 rounded-lg border border-white/25 px-3.5 py-2 text-[13px] max-[389px]:text-[12px] leading-snug text-white/80 hover:border-white/50 hover:text-white transition-colors"
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <BookOpen size={15} className="flex-shrink-0 text-[#C4A87C]" aria-hidden="true" />
              {/* 12 px below 390 px: in Spanish and French the label broke
                  in two at 375 and 360 px. The translation never splits. */}
              <span className="text-center">
                <span lang="pt" className="font-medium">{COMPLAINTS_BOOK_NAME}</span>
                {language !== 'pt' && <span className="text-white/65"> · <span className="whitespace-nowrap">{t('legalFooter.complaintsBook')}</span></span>}
              </span>
            </a>
          </div>

          {/* Row 2: copyright + legal — single baseline, hairline divider.
              Side by side only from 1024 px: at 13 px the two together need up
              to 787 px (Spanish) and a tablet's row is 704 px, so between 768
              and 1023 px they stay one above the other, each on one line.
              lg:pr-16 keeps the right-aligned links ("Cookie settings" last)
              out of the WhatsApp button's corner on desktop. */}
          <div
            className="mt-7 pt-6 border-t border-white/[0.05] flex flex-col items-center gap-3 text-[13px] leading-none text-white/65 lg:flex-row lg:items-center lg:justify-between lg:pr-16"
            style={{ fontFamily: 'var(--font-body)', fontWeight: 400 }}
          >
            <span className="leading-none max-lg:leading-snug max-lg:text-center">
              {t('footer.copyrightLine', { year: new Date().getFullYear(), rights: t('footer.allRightsReserved') })}
            </span>
            {/* Inline links (with middot separators) so they share the copyright's
                text baseline reliably — a nested flex row mis-aligned them.
                On a phone there are no dots and the links are spaced apart and
                free to wrap: as one unbreakable run at 13 px the French row was
                wider than the screen, and in every language a dot was left
                hanging at the end of the first line. */}
            <span className="leading-loose md:leading-relaxed text-center [&>a]:mx-2.5 [&>button]:mx-2.5 md:[&>a]:mx-0 md:[&>button]:mx-0">
              <Link href="/legal/privacy" className="hover:text-white/60 transition-colors">{t('footer.privacy')}</Link>
              <span className="hidden md:inline mx-3 text-white/15" aria-hidden="true">·</span><wbr />
              <Link href="/legal/terms" className="hover:text-white/60 transition-colors">{t('footer.terms')}</Link>
              <span className="hidden md:inline mx-3 text-white/15" aria-hidden="true">·</span><wbr />
              <a href="/destinations/photography.html" className="hover:text-white/60 transition-colors">{({pt:"Fotografia",en:"Photography",de:"Fotografie",es:"Fotografía",fi:"Valokuvat",fr:"Photographie",it:"Fotografia",nl:"Fotografie",sv:"Fotografi"} as Record<string,string>)[language] || "Photography"}</a>
              <span className="hidden md:inline mx-3 text-white/15" aria-hidden="true">·</span><wbr />
              <Link href="/legal/cookies" className="hover:text-white/60 transition-colors">{t('footer.cookies')}</Link>
              <span className="hidden md:inline mx-3 text-white/15" aria-hidden="true">·</span><wbr />
              <button type="button" onClick={openCookiePreferences} className="hover:text-white transition-colors underline underline-offset-2">{t('cookieBanner.managePreferences')}</button>
            </span>
          </div>

        </div>
      </div>
    </footer>
  );
}
