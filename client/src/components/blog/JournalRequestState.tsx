import { useTranslation } from 'react-i18next';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

/** Only shown on a new client navigation or a failed read, never a fake 404. */
export default function JournalRequestState({ failed, retry }: { failed: boolean; retry: () => void }) {
  const { t } = useTranslation();
  return <div className="min-h-screen bg-[#FAFAF7]">
    <Header variant="solid" />
    <main className="pt-32 pb-20 text-center container" role={failed ? 'alert' : 'status'} aria-busy={!failed}>
      <h1 className="text-[#1A1A18] mb-4">{t(failed ? 'errorBoundary.title' : 'common.loading')}</h1>
      {failed && <>
        <p className="text-pa-stone-aa mb-6">{t('errorBoundary.body')}</p>
        <button type="button" className="btn btn-ghost" onClick={retry}>{t('property.retry')}</button>
      </>}
    </main>
    <Footer />
  </div>;
}
