/* ==========================================================================
   BOKUN WIDGET MODAL — full experience widget in a centred overlay
   Used for multi-option activities (e.g. the ebike tour: City / Road /
   Gravel) where the compact inline calendar can only show the default rate.
   The full Bókun "experience" widget includes the rate/option selector, but
   is too tall for the sidebar — so it opens here with room to scroll.
   ========================================================================== */

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import BokunCalendarWidget from './BokunCalendarWidget';

interface BokunWidgetModalProps {
  open: boolean;
  onClose: () => void;
  bokunActivityId: number;
  experienceName: string;
}

export default function BokunWidgetModal({ open, onClose, bokunActivityId, experienceName }: BokunWidgetModalProps) {
  // Lock body scroll + close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Book ${experienceName}`}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative w-full sm:max-w-[520px] max-h-full sm:max-h-[90vh] bg-white sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E4DC] shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-[#8B7355]">Book your experience</p>
            <h3 className="font-display text-[16px] text-[#1A1A18] leading-tight truncate">{experienceName}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#F5F1EB] transition-colors shrink-0"
          >
            <X className="w-4 h-4 text-[#1A1A18]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <BokunCalendarWidget
            bokunActivityId={bokunActivityId}
            experienceName={experienceName}
            variant="experience"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
