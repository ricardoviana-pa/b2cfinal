import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BLACK_FRIDAY_HERO_CODE } from '@/hooks/useBlackFriday2026';

/** Seasonal copy inside the homepage cover. Copying never applies a coupon. */
export default function BlackFridayHeroCopy() {
  const { t } = useTranslation();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(BLACK_FRIDAY_HERO_CODE);
      setCopyStatus('copied');
    } catch {
      // Keep the code selectable when clipboard permission is unavailable.
      setCopyStatus('failed');
    }
  };

  return (
    <>
      <p className="bf-hero-overline font-body">
        {t('home.blackFriday.overline')}
      </p>
      <h1 className="bf-hero-title text-white font-display font-normal">
        {t('home.blackFriday.title')}
      </h1>
      <p className="bf-hero-description font-body">
        {t('home.blackFriday.description')}
      </p>
      <div className="bf-hero-coupon font-body">
        <div className="bf-hero-code">
          <span>{t('home.blackFriday.codeLabel')}</span>
          <code>{BLACK_FRIDAY_HERO_CODE}</code>
        </div>
        <button type="button" className="btn-white bf-hero-copy" onClick={copyCode}>
          {copyStatus === 'copied' ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {t(copyStatus === 'copied' ? 'home.blackFriday.copied' : 'home.blackFriday.copyCode')}
        </button>
      </div>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {copyStatus === 'copied' ? t('home.blackFriday.copied') : ''}
      </p>
      {copyStatus === 'failed' && (
        <p className="bf-hero-copy-error font-body" role="status">
          {t('home.blackFriday.copyFailed')}
        </p>
      )}
      <p className="bf-hero-terms font-body">{t('home.blackFriday.terms')}</p>
    </>
  );
}
