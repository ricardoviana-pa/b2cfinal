/** Optional editorial summary. Site-authored content is not a Q&A forum. */
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';

export interface AnswerCapsuleCitation { label: string; href: string }
export interface AnswerCapsuleProps {
  question: string;
  answer: string;
  lastUpdated?: string;
  author?: string;
  cite?: AnswerCapsuleCitation[];
  hideQuestion?: boolean;
  /** Kept for old callers; editorial summaries never emit QAPage. */
  emitSchema?: boolean;
  schemaId?: string;
  className?: string;
}

export default function AnswerCapsule({ question, answer, cite, hideQuestion, schemaId, className }: AnswerCapsuleProps) {
  const { t } = useTranslation();
  return (
    <details id={schemaId} className={className || 'site-faq border-t border-[#E8E4DC]'}>
      <summary>{t('siteUx.quickFacts')}</summary>
      <div className="faq-answer">
        {!hideQuestion && <p className="font-medium text-pa-dark mb-2">{question}</p>}
        <p className="body-md">{answer}</p>
        {!!cite?.length && <p className="mt-3 flex flex-wrap gap-4">{cite.map(c => c.href.startsWith('http')
          ? <a key={c.href} href={c.href} className="body-sm underline underline-offset-4">{c.label}</a>
          : <Link key={c.href} href={c.href} className="body-sm underline underline-offset-4">{c.label}</Link>)}</p>}
      </div>
    </details>
  );
}
