/* ==========================================================================
   PROMO BAR — announcement bar de campanha no topo do site.
   Marquee lento e discreto (pausa em hover, estático com reduced-motion),
   clique copia o código e guarda-o para o checkout pré-preencher o campo
   de promo (localStorage pa_promo_code). Dispensável por campanha: o X
   guarda pa_promobar_<code>, uma campanha nova volta a aparecer.
   Config no servidor via env PROMO_BANNER (checkout.promoBanner) — sem
   deploy para trocar campanha. Fixed acima do Header; a altura entra no
   layout via --pa-promobar-h (body padding + top do header).
   ========================================================================== */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export const PROMO_CODE_STORAGE_KEY = 'pa_promo_code';
const BAR_HEIGHT_PX = 34;

export default function PromoBar() {
  const { t, i18n } = useTranslation();
  const bannerQuery = trpc.checkout.promoBanner.useQuery(undefined, {
    staleTime: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const code = bannerQuery.data?.code ?? null;
  const texts = bannerQuery.data?.texts ?? {};

  // Começa escondida até sabermos se esta campanha foi dispensada.
  const [dismissed, setDismissed] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code) return;
    try {
      setDismissed(localStorage.getItem(`pa_promobar_${code}`) === '1');
    } catch {
      setDismissed(false);
    }
  }, [code]);

  const visible = !!code && !dismissed;

  // O resto do layout compensa a barra via CSS var (body padding-top e o
  // top do header fixo) — 0 quando não há barra.
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--pa-promobar-h', visible ? `${BAR_HEIGHT_PX}px` : '0px');
    return () => { root.style.setProperty('--pa-promobar-h', '0px'); };
  }, [visible]);

  const copyCode = useCallback(() => {
    if (!code) return;
    try { localStorage.setItem(PROMO_CODE_STORAGE_KEY, code); } catch { /* privado */ }
    try { void navigator.clipboard?.writeText(code); } catch { /* sem clipboard */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2200);
  }, [code]);

  const dismiss = useCallback(() => {
    if (code) { try { localStorage.setItem(`pa_promobar_${code}`, '1'); } catch { /* ok */ } }
    setDismissed(true);
  }, [code]);

  if (!visible) return null;

  const lang = (i18n.language || 'en').slice(0, 2);
  const template =
    texts[lang] || texts.en || t('promoBar.defaultText', 'Use code {code} at checkout');
  const message = template.replace('{code}', code!);
  const copiedLabel = t('promoBar.copied', 'Code copied');
  // Repetido para encher o track do marquee; o texto real para leitores de
  // ecrã é a cópia estática visually-hidden.
  const items = Array.from({ length: 8 });

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[52] bg-pa-dark text-pa-cream overflow-hidden select-none"
      style={{ height: BAR_HEIGHT_PX }}
      role="region"
      aria-label={t('promoBar.ariaLabel', 'Current promotion')}
    >
      <style>{`
        @keyframes pa-promobar-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .pa-promobar-track {
          animation: pa-promobar-marquee 55s linear infinite;
        }
        .pa-promobar-btn:hover .pa-promobar-track,
        .pa-promobar-btn:focus-visible .pa-promobar-track {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .pa-promobar-track { animation: none; transform: none; justify-content: center; width: 100%; }
          .pa-promobar-track > span:not(:first-child) { display: none; }
        }
      `}</style>
      <span className="sr-only">{message}</span>
      <button
        type="button"
        onClick={copyCode}
        aria-label={`${message} — ${t('promoBar.copyAria', 'copy code')}`}
        className="pa-promobar-btn block w-full h-full cursor-pointer"
      >
        {copied ? (
          <span className="flex items-center justify-center gap-1.5 h-full text-[11.5px] tracking-[0.14em] uppercase text-pa-gold-light">
            <Check className="w-3.5 h-3.5" aria-hidden /> {copiedLabel} — {code}
          </span>
        ) : (
          <span className="pa-promobar-track flex items-center h-full w-max whitespace-nowrap" aria-hidden>
            {items.map((_, i) => (
              <span
                key={i}
                className="flex items-center gap-2 px-8 text-[11.5px] tracking-[0.14em] uppercase"
              >
                {message}
                <span className="text-pa-gold-light">·</span>
              </span>
            ))}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('promoBar.dismiss', 'Dismiss')}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-pa-cream/70 hover:text-pa-cream transition-colors"
      >
        <X className="w-3.5 h-3.5" aria-hidden />
      </button>
    </div>
  );
}
