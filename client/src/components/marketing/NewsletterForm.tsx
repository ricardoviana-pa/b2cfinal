/* ==========================================================================
   NEWSLETTER FORM — the one form behind the pop-up, the house block, the
   article block and the footer.

   Email and one button. The sentence under it says what the person agrees to
   and that a confirmation email follows (the same sentence the server records
   with the sign-up, shared/newsletter.ts). No checkbox: the form exists only
   to subscribe, pressing the button is the consent, and the click in the
   confirmation email is the second, mandatory step. Honeypot against bots.

   After the sign-up: "one more step" message and an optional question (what
   kind of stay), one tap, no free text. It feeds the segmentation.
   Measurement: newsletter_signup (newsletter_origin popup | house |
   article | footer) and newsletter_interest in the dataLayer, only with the
   "Aceitar tudo" choice (pushDL). Never the address, never a hash of it.
   Not generate_lead on purpose: the tags that already listen to
   generate_lead (lead forms, possibly primary conversions in Google Ads and
   the Meta Lead) would count every pop-up sign-up as a sales lead.
   ========================================================================== */

import { useId, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { pushDL } from '@/lib/datalayer';
import { visitOriginPayload } from '@/lib/visitOrigin';
import {
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_INTERESTS,
  NEWSLETTER_PRIVACY_LABEL,
  NL_SUBSCRIBED_KEY,
  newsletterLang,
  pageKind,
  type NewsletterDevice,
  type NewsletterInterest,
  type NewsletterOrigin,
  type NewsletterTrigger,
} from '@shared/newsletter';

interface NewsletterFormProps {
  origin: NewsletterOrigin;
  /** House page: the server resolves the name from the slug (PA houses only). */
  propertySlug?: string;
  /** 'dark' on the footer, 'light' everywhere else. */
  variant?: 'light' | 'dark';
  /** Phone sheet: smaller type, the interest question in two columns. */
  compact?: boolean;
  trigger?: NewsletterTrigger;
  device?: NewsletterDevice;
  autoFocus?: boolean;
  onSubscribed?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const INTEREST_KEY: Record<NewsletterInterest, string> = {
  family: 'family',
  couple: 'couple',
  friends: 'friends',
  celebration: 'celebration',
  work: 'work',
  'long-stay': 'longStay',
};

type ErrorKey = 'errorInvalid' | 'errorProxy' | 'errorGeneric';

export default function NewsletterForm({
  origin, propertySlug, variant = 'light', compact = false, trigger, device, autoFocus, onSubscribed,
}: NewsletterFormProps) {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const id = useId();
  const [email, setEmail] = useState('');
  const [hp, setHp] = useState('');
  const [sending, setSending] = useState(false);
  const [ref, setRef] = useState<string | null>(null);
  const [interest, setInterest] = useState<NewsletterInterest | null>(null);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);

  const subscribe = trpc.newsletter.subscribe.useMutation();
  const saveInterest = trpc.newsletter.interest.useMutation();
  const dark = variant === 'dark';
  const lang = newsletterLang(i18n.language);
  const path = location.split('?')[0] || '/';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) { setErrorKey('errorInvalid'); return; }
    setErrorKey(null);
    setSending(true);
    try {
      const result = await subscribe.mutateAsync({
        email: value,
        locale: lang,
        origin,
        page: path.slice(0, 300),
        propertySlug: propertySlug || undefined,
        trigger: origin === 'popup' ? trigger : undefined,
        device,
        visitOrigin: visitOriginPayload(),
        hp,
      });
      try { window.localStorage.setItem(NL_SUBSCRIBED_KEY, '1'); } catch { /* storage unavailable */ }
      // Its own event, never generate_lead: a GTM tag that fires on
      // generate_lead without a filter (the sales-lead conversion, the 300 €
      // stop rule of the Google campaigns, the Meta Lead) would count every
      // pop-up sign-up as a lead and bidding would drift away from bookings.
      // GA4, Google Ads (secondary) and the Pixel map newsletter_signup apart.
      pushDL({
        event: 'newsletter_signup',
        lead_source: `newsletter-${origin}`,
        newsletter_origin: origin,
        ...(origin === 'popup' && trigger ? { newsletter_trigger: trigger } : {}),
        ...(device ? { newsletter_device: device } : {}),
        page_kind: pageKind(path),
      });
      setRef(result.ref);
      setEmail('');
      onSubscribed?.();
    } catch (err: any) {
      const message = String(err?.message ?? '');
      const code = err?.data?.code as string | undefined;
      if (message === 'PROXY_EMAIL') setErrorKey('errorProxy');
      else if (code === 'BAD_REQUEST') setErrorKey('errorInvalid');
      else setErrorKey('errorGeneric');
    } finally {
      setSending(false);
    }
  };

  const chooseInterest = (value: NewsletterInterest) => {
    if (!ref || interest) return;
    setInterest(value);
    saveInterest.mutate({ ref, interest: value });
    pushDL({ event: 'newsletter_interest', newsletter_origin: origin, newsletter_interest: value });
  };

  const muted = dark ? 'text-white/70' : 'text-[#6B6860]';
  const strong = dark ? 'text-[#C4A87C]' : 'text-[#1A1A18]';
  const linkClass = dark ? 'text-[#C4A87C] hover:text-white' : 'text-[#806A48] hover:text-[#1A1A18]';

  if (ref) {
    return (
      <div className="flex flex-col gap-4" style={{ fontFamily: 'var(--font-body)' }}>
        <p className={`text-[13px] leading-relaxed flex items-start gap-2 ${strong}`} role="status" aria-live="polite">
          <Check className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
          <span>{t('newsletter.form.success')}</span>
        </p>
        {interest ? (
          <p className={`text-[12.5px] ${muted}`} role="status" aria-live="polite">{t('newsletter.interest.thanks')}</p>
        ) : (
          <fieldset className="min-w-0">
            <legend className={`text-[12.5px] leading-relaxed mb-2.5 ${muted}`}>{t('newsletter.interest.title')}</legend>
            <div className={compact ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}>
              {NEWSLETTER_INTERESTS.map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => chooseInterest(value)}
                  className={`min-h-[40px] px-3.5 text-[12.5px] text-left border transition-colors ${dark
                    ? 'border-white/20 text-white/85 hover:border-[#C4A87C] hover:text-white'
                    : 'border-[#E8E4DC] bg-white text-[#1A1A18] hover:border-[#8B7355]'}`}
                >
                  {t(`newsletter.interest.${INTEREST_KEY[value]}`)}
                </button>
              ))}
            </div>
          </fieldset>
        )}
      </div>
    );
  }

  const inputClass = dark
    ? 'flex-1 h-[48px] px-4 text-[14px] bg-white/[0.06] border border-white/15 text-white placeholder:text-white/60 focus:outline-none focus:border-white/40 transition-colors min-w-0'
    : 'flex-1 h-[48px] px-4 text-[16px] sm:text-[14px] bg-white border border-[#D9D4CA] text-[#1A1A18] placeholder:text-[#78756F] focus:outline-none focus:border-[#8B7355] transition-colors min-w-0';
  const buttonClass = dark
    ? 'pa-action h-[48px] px-5 sm:px-6 bg-[#C4A87C] text-[#1A1A18] text-[11px] font-semibold uppercase hover:bg-[#D4B88C] transition-colors flex-shrink-0 disabled:opacity-60'
    : 'pa-action h-[48px] px-5 sm:px-6 bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-semibold uppercase hover:bg-[#333330] transition-colors flex-shrink-0 disabled:opacity-60';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2.5" noValidate data-nl-origin={origin}>
      <label htmlFor={`${id}-email`} className="sr-only">{t('newsletter.form.email')}</label>
      <div className="flex">
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setErrorKey(null); }}
          placeholder={t('newsletter.form.email')}
          required
          autoComplete="email"
          inputMode="email"
          enterKeyHint="send"
          autoFocus={autoFocus}
          aria-invalid={errorKey === 'errorInvalid' || errorKey === 'errorProxy' ? true : undefined}
          aria-describedby={`${id}-consent${errorKey ? ` ${id}-error` : ''}`}
          className={inputClass}
          style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
        />
        <button type="submit" disabled={sending} className={buttonClass} style={{ letterSpacing: '1.5px' }}>
          {sending ? t('newsletter.form.sending') : t('newsletter.form.cta')}
        </button>
      </div>

      {/* Honeypot: hidden from people, filled by bots. Not display:none, which some bots skip. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor={`${id}-hp`}>Website</label>
        <input id={`${id}-hp`} type="text" name="website" tabIndex={-1} autoComplete="off" value={hp} onChange={e => setHp(e.target.value)} />
      </div>

      {errorKey && (
        <p id={`${id}-error`} className={`text-[12px] ${dark ? 'text-red-300' : 'text-[#B42318]'}`} role="alert">
          {t(`newsletter.form.${errorKey}`)}
        </p>
      )}

      <p
        id={`${id}-consent`}
        className={`${compact ? 'text-[11px]' : 'text-[11.5px]'} leading-relaxed ${muted}`}
        style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
      >
        {NEWSLETTER_CONSENT_TEXT[lang]}{' '}
        <Link href="/legal/privacy" className={`underline underline-offset-2 transition-colors ${linkClass}`}>
          {NEWSLETTER_PRIVACY_LABEL[lang]}
        </Link>
      </p>
    </form>
  );
}
