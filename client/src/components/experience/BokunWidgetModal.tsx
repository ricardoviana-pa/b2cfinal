/* ==========================================================================
   BOKUN WIDGET MODAL
   Luxury-styled modal that lazy-loads the official Bókun booking widget.
   Keeps our sticky card design intact; Bókun handles the checkout flow.
   ========================================================================== */

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface BokunWidgetModalProps {
  open: boolean;
  onClose: () => void;
  experienceName: string;
  bokunActivityId: number;
}

const BOKUN_CHANNEL_UUID = import.meta.env.VITE_BOKUN_CHANNEL_UUID as string | undefined;
const LOADER_SRC = BOKUN_CHANNEL_UUID
  ? `https://widgets.bokun.io/assets/javascripts/apps/build/BokunWidgetsLoader.js?bookingChannelUUID=${BOKUN_CHANNEL_UUID}`
  : '';

function ensureLoader(): void {
  if (!LOADER_SRC) return;
  if (document.querySelector(`script[src="${LOADER_SRC}"]`)) return;
  const s = document.createElement('script');
  s.src = LOADER_SRC;
  s.async = true;
  document.body.appendChild(s);
}

export default function BokunWidgetModal({
  open,
  onClose,
  experienceName,
  bokunActivityId,
}: BokunWidgetModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    ensureLoader();
    // Bókun's loader scans the DOM for .bokunWidget elements and mounts iframes.
    // If it's already loaded, poke it to rescan.
    const w = window as any;
    if (w.BokunWidgetsLoader?.refresh) {
      setTimeout(() => w.BokunWidgetsLoader.refresh(), 100);
    }
    // Lock body scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widgetSrc = BOKUN_CHANNEL_UUID
    ? `https://widgets.bokun.io/online-sales/${BOKUN_CHANNEL_UUID}/experience/${bokunActivityId}`
    : '';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Book ${experienceName}`}
    >
      <div
        className="relative bg-[#FAFAF7] w-full max-w-[720px] my-6 mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DC] bg-white">
          <div>
            <p className="text-[10px] tracking-[0.14em] uppercase text-[#9E9A90] font-medium">
              Reserve
            </p>
            <p className="text-[15px] font-display text-[#1A1A18] mt-0.5 leading-tight">
              {experienceName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center border border-[#E8E4DC] hover:border-[#1A1A18] transition-colors"
          >
            <X className="w-4 h-4 text-[#1A1A18]" />
          </button>
        </div>

        {/* Widget area */}
        <div ref={containerRef} className="p-4 min-h-[520px]">
          {BOKUN_CHANNEL_UUID ? (
            <div
              className="bokunWidget"
              data-src={widgetSrc}
              key={`${bokunActivityId}-${BOKUN_CHANNEL_UUID}`}
            />
          ) : (
            <div className="p-8 text-center text-[13px] text-[#6B6860] border border-dashed border-[#E8E4DC]" style={{ fontWeight: 300 }}>
              <p className="mb-2 font-medium text-[#1A1A18]">Bókun widget not configured.</p>
              <p>
                Set <code className="bg-[#F5F1EB] px-1.5 py-0.5">VITE_BOKUN_CHANNEL_UUID</code> in
                <code className="bg-[#F5F1EB] px-1.5 py-0.5 ml-1">.env.local</code> to enable the
                embedded booking widget.
              </p>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 text-center text-[11px] text-[#9E9A90] border-t border-[#E8E4DC]" style={{ fontWeight: 300 }}>
          Secure booking powered by Bókun · Free cancellation policies apply
        </div>
      </div>
    </div>
  );
}
