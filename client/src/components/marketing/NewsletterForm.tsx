/* ==========================================================================
   NEWSLETTER FORM — the one form behind the pop-up, the inline block and the
   footer. Email + explicit consent (unchecked by default, link to the privacy
   policy) + honeypot. Calls newsletter.subscribe on its own (never batched,
   so the per-path rate limit sees it) and shows the "one more step" message:
   the subscription only exists after the click in Brevo's confirmation email.
   On success it writes pa_nl_subscribed so the pop-up never shows again.
   ========================================================================== */

import { useId, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'wouter';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { pushDL } from '@/lib/datalayer';
import { NL_SUBSCRIBED_KEY } from '@shared/newsletterPopup';

export type NewsletterOrigin = 'popup' | 'house' | 'article' | 'footer';

interface NewsletterFormProps {
  origin: NewsletterOrigin;
  /** Slug of the house on the property page: the server resolves the name. */
  propertySlug?: string;
  /** 'dark' on the footer, 'light' everywhere else. */
  variant?: 'light' | 'dark';
  onSuccess?: () => void;
  autoFocus?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Status = 'idle' | 'sending' | 'success';

export default function NewsletterForm({ origin, propertySlug, variant = 'light', onSuccess, autoFocus }: NewsletterFormProps) {
  const { t, i18n } = useTranslation();
  const [location] = useLocation();
  const id = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorKey, setErrorKey] = useState<'errorInvalid' | 'errorProxy' | 'errorGeneric' | null>(null);

  const subscribe = trpc.newsletter.subscribe.useMutation();
  const dark = variant === 'dark';

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === 'sending') return;
    const value = email.trim();
    if (!EMAIL_RE.test(value)) { setErrorKey('errorInvalid'); return; }
    if (!consent) return;
    setErrorKey(null);
    setStatus('sending');
    try {
      await subscribe.mutateAsync({
        email: value,
        locale: (i18n.language || 'en').slice(0, 2),
        origin,
        page: location.split('?')[0].slice(0, 200),
        propertySlug: propertySlug || undefined,
        consent: true,
        hp,
      });
      try { window.localStorage.setItem(NL_SUBSCRIBED_KEY, '1'); } catch { /* storage unavailable */ }
      pushDL({ event: 'generate_lead', lead_source: `newsletter-${origin}`, lead_type: 'newsletter' });
      setStatus('success');
      setEmail('');
      onSuccess?.();
    } catch (err: any) {
      const message = String(err?.message ?? '');
      const code = err?.data?.code as string | undefined;
      if (message === 'PROXY_EMAIL') setErrorKey('errorProxy');
      else if (code === 'BAD_REQUEST') setErrorKey('errorInvalid');
      else setErrorKey('errorGeneric');
      setStatus('idle');
    }
  };

  if (status === 'success') {
    return (
      <p
        className={`text-[13px] leading-relaxed flex items-start gap-2 ${dark ? 'text-[#C4A87C]' : 'text-[#1A1A18]'}`}
        role="status"
        aria-live="polite"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        <Check className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
        <span>{t('newsletter.form.success')}</span>
      </p>
    );
  }

  const inputClass = dark
    ? 'flex-1 h-[48px] px-4 text-[13px] bg-white/[0.04] border border-white/10 text-white placeholder:text-white/65 focus:outline-none focus:border-white/30 transition-colors min-w-0'
    : 'flex-1 h-[48px] px-4 text-[14px] bg-white border border-[#E8E4DC] text-[#1A1A18] placeholder:text-[#78756F] focus:outline-none focus:border-[#8B7355] transition-colors min-w-0';
  const buttonClass = dark
    ? 'pa-action h-[48px] px-6 bg-[#C4A87C] text-[#1A1A18] text-[11px] font-semibold hover:bg-[#D4B88C] transition-colors flex-shrink-0 disabled:opacity-50'
    : 'pa-action h-[48px] px-6 bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-semibold hover:bg-[#333330] transition-colors flex-shrink-0 disabled:opacity-50';
  const textClass = dark ? 'text-white/70' : 'text-[#6B6860]';
  const linkClass = dark ? 'text-[#C4A87C] hover:text-white' : 'text-[#8B7355] hover:text-[#1A1A18]';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate data-nl-origin={origin}>
      <div className="flex">
        <input
          id={`${id}-email`}
          type="email"
          name="email"
          aria-label={t('newsletter.form.email')}
          value={email}
          onChange={e => { setEmail(e.target.value); setErrorKey(null); }}
          placeholder={t('newsletter.form.email')}
          required
          autoComplete="email"
          inputMode="email"
          autoFocus={autoFocus}
          aria-invalid={errorKey === 'errorInvalid' || errorKey === 'errorProxy' ? true : undefined}
          aria-describedby={errorKey ? `${id}-error` : undefined}
          className={inputClass}
          style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
        />
        <button
          type="submit"
          disabled={status === 'sending' || !consent}
          className={buttonClass}
          style={{ letterSpacing: '1.5px' }}
        >
          {status === 'sending' ? t('newsletter.form.sending') : t('newsletter.form.cta')}
        </button>
      </div>

      {/* Honeypot: hidden from people, filled by bots. Not display:none, which some bots respect. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
        <label htmlFor={`${id}-hp`}>Website</label>
        <input id={`${id}-hp`} type="text" name="website" tabIndex={-1} autoComplete="off" value={hp} onChange={e => setHp(e.target.value)} />
      </div>

      <label htmlFor={`${id}-consent`} className={`flex items-start gap-2.5 text-[12px] leading-relaxed cursor-pointer ${textClass}`} style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}>
        <input
          id={`${id}-consent`}
          type="checkbox"
          name="consent"
          checked={consent}
          onChange={e => setConsent(e.target.checked)}
          className="mt-[3px] h-4 w-4 shrink-0 accent-[#8B7355] cursor-pointer"
        />
        <span>
          {t('newsletter.form.consent')}{' '}
          <Link href="/legal/privacy" className={`underline underline-offset-2 transition-colors ${linkClass}`}>
            {t('newsletter.form.consentPrivacy')}
          </Link>
          .
        </span>
      </label>

      {errorKey && (
        <p id={`${id}-error`} className="text-[12px] text-red-500" role="alert" aria-live="assertive">
          {t(`newsletter.form.${errorKey}`)}
        </p>
      )}
    </form>
  );
}
