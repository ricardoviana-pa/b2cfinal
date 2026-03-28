/**
 * 404 Page — Portugal Active
 * Copy: "This page does not exist. But we know a few places that do."
 * CTA: EXPLORE OUR HOMES
 */
import { Link } from 'wouter';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';

export default function NotFound() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Page Not Found' });
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FAFAF7' }}>
      <Header />

      <section className="flex items-center justify-center" style={{ minHeight: '70vh', paddingTop: '100px' }}>
        <div className="text-center max-w-lg mx-auto px-6">
          <p
            className="overline mb-6"
            style={{ color: '#C4A87C' }}
          >
            {t('notFound.overline')}
          </p>
          <h1
            className="mb-6"
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(72px, 10vw, 120px)',
              fontWeight: 300,
              color: '#1A1A18',
              lineHeight: 1,
            }}
          >
            404
          </h1>
          <p
            className="body-lg mb-10"
            style={{ color: '#6B6860', maxWidth: '380px', margin: '0 auto 2.5rem' }}
          >
            {t('notFound.body')}
          </p>
          <Link href="/homes" className="btn-primary inline-flex items-center gap-2">
            {t('notFound.cta')}
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
