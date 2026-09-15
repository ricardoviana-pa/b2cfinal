import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function SecurityDepositNotice() {
  const { t } = useTranslation();

  return (
    <div className="mb-4 flex items-start gap-3 rounded-lg border border-pa-sand bg-pa-warm p-4">
      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pa-gold" aria-hidden="true" />
      <div>
        <p className="body-sm font-medium text-pa-dark mb-1">{t('securityDeposit.title')}</p>
        <p className="body-sm text-pa-earth leading-relaxed">{t('securityDeposit.notice')}</p>
      </div>
    </div>
  );
}
