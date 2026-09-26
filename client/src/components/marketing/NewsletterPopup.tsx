/* ==========================================================================
   NEWSLETTER POP-UP — lazy chunk loaded by NewsletterPopupGate only after
   the trigger (20 s or 50% scroll). Desktop: Radix Dialog (focus trap, Esc,
   click outside). Phone: vaul bottom sheet that never covers the whole page
   (Google's interstitial rule), with a 44 px close target. z-[70]: above the
   PromoBar (52) and the CookieBanner (60), which is closed by the time this
   opens. No image, no new font: the chunk stays small for LCP/INP.
   ========================================================================== */

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Drawer as DrawerPrimitive } from 'vaul';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useIsMobile } from '@/hooks/useMobile';
import { trpc } from '@/lib/trpc';
import { getDisplayName } from '@shared/displayName';
import NewsletterForm from './NewsletterForm';

export type PopupCloseReason = 'x' | 'esc' | 'fundo' | 'agora_nao' | 'subscrito';

interface NewsletterPopupProps {
  open: boolean;
  onClose: (reason: PopupCloseReason) => void;
  /** Present on a home page: the interest line and the server-side house link. */
  propertySlug?: string;
}

function PopupBody({ onClose, propertySlug, titleId, descId }: { onClose: (r: PopupCloseReason) => void; propertySlug?: string; titleId: string; descId: string }) {
  const { t } = useTranslation();
  // Reads the property page's own cached query: no extra request on a home page.
  const property = trpc.properties.getBySlugForSite.useQuery({ slug: propertySlug ?? '' }, { enabled: !!propertySlug, staleTime: Infinity });
  const houseName = property.data ? getDisplayName(property.data as any) : '';

  return (
    <div className="px-6 pt-2 pb-6 sm:px-8 sm:pb-8" style={{ fontFamily: 'var(--font-body)' }}>
      <p className="eyebrow font-semibold tracking-[0.2em] uppercase text-pa-gold mb-3">{t('newsletter.popup.overline')}</p>
      <h2 id={titleId} className="font-display text-[24px] sm:text-[28px] font-light leading-[1.25] text-[#1A1A18] mb-3">
        {t('newsletter.popup.title')}
      </h2>
      <p id={descId} className="text-[13.5px] leading-relaxed text-[#6B6860] font-light mb-2">{t('newsletter.popup.body')}</p>
      {houseName && (
        <p className="text-[12.5px] text-[#1A1A18] mb-4">{t('newsletter.popup.interest', { house: houseName })}</p>
      )}
      <div className="mt-4">
        <NewsletterForm origin="popup" propertySlug={propertySlug} autoFocus />
      </div>
      <button
        type="button"
        onClick={() => onClose('agora_nao')}
        className="mt-4 text-[12px] text-[#78756F] hover:text-[#1A1A18] underline underline-offset-2 transition-colors min-h-[44px]"
      >
        {t('newsletter.form.close')}
      </button>
    </div>
  );
}

function CloseButton({ onClose, label, as: Component }: { onClose: () => void; label: string; as: typeof DialogPrimitive.Close | typeof DrawerPrimitive.Close }) {
  return (
    <Component
      onClick={onClose}
      aria-label={label}
      className="absolute top-2 right-2 flex items-center justify-center w-11 h-11 text-[#6B6860] hover:text-[#1A1A18] transition-colors"
    >
      <X className="w-5 h-5" aria-hidden />
    </Component>
  );
}

export default function NewsletterPopup({ open, onClose, propertySlug }: NewsletterPopupProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const titleId = 'newsletter-popup-title';
  const descId = 'newsletter-popup-desc';
  const closeLabel = t('newsletter.form.close');

  if (isMobile) {
    return (
      <DrawerPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose('fundo'); }} direction="bottom">
        <DrawerPrimitive.Portal>
          <DrawerPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/50" />
          <DrawerPrimitive.Content
            aria-labelledby={titleId}
            aria-describedby={descId}
            className="fixed inset-x-0 bottom-0 z-[70] flex flex-col rounded-t-2xl bg-[#FAFAF7] max-h-[80vh] overflow-y-auto outline-none"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="mx-auto mt-3 mb-1 h-1.5 w-12 shrink-0 rounded-full bg-[#E8E4DC]" />
            <CloseButton onClose={() => onClose('x')} label={closeLabel} as={DrawerPrimitive.Close} />
            <PopupBody onClose={onClose} propertySlug={propertySlug} titleId={titleId} descId={descId} />
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Portal>
      </DrawerPrimitive.Root>
    );
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose('fundo'); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-labelledby={titleId}
          aria-describedby={descId}
          onEscapeKeyDown={(e) => { e.preventDefault(); onClose('esc'); }}
          onPointerDownOutside={(e) => { e.preventDefault(); onClose('fundo'); }}
          className="fixed top-1/2 left-1/2 z-[70] w-full max-w-[calc(100%-2rem)] sm:max-w-lg -translate-x-1/2 -translate-y-1/2 bg-[#FAFAF7] shadow-2xl border border-[#E8E4DC] pt-8 outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <CloseButton onClose={() => onClose('x')} label={closeLabel} as={DialogPrimitive.Close} />
          <PopupBody onClose={onClose} propertySlug={propertySlug} titleId={titleId} descId={descId} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
