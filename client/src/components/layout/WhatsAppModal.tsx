import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface WhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  whatsappUrl: string;
}

export default function WhatsAppModal({ isOpen, onClose, whatsappUrl }: WhatsAppModalProps) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6 space-y-6 relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-[#F5F1EB] rounded-full transition-colors"
          aria-label={t('whatsapp.close')}
        >
          <X size={20} className="text-[#9E9A90]" />
        </button>

        {/* Content */}
        <div className="space-y-3 pt-2">
          <h2 className="text-[20px] font-light text-[#1A1A18]" style={{ fontFamily: 'var(--font-display)' }}>
            {t('whatsapp.title')}
          </h2>
          <p className="text-[14px] text-[#6B6860] leading-relaxed">
            {t('whatsapp.body')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-full border border-[#E8E4DC] text-[12px] font-medium tracking-[0.06em] uppercase text-[#6B6860] hover:border-[#9E9A90] hover:text-[#1A1A18] transition-colors"
          >
            {t('whatsapp.cancel')}
          </button>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-full bg-[#C7A574] text-white text-[12px] font-medium tracking-[0.06em] uppercase hover:bg-[#B89560] transition-colors flex items-center justify-center gap-2"
          >
            {t('whatsapp.continue')}
          </a>
        </div>
      </div>
    </div>
  );
}
