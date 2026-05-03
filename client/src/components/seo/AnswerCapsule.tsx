/* ==========================================================================
   AnswerCapsule — citable, LLM-friendly summary block
   ========================================================================

   What it is
   ----------
   A small, high-contrast block that renders *near the top of a page* with:
     - a question framing (visible or sr-only, depending on page intent)
     - a 40–80 word self-contained answer
     - a provenance line (brand, last-updated, optional author)
     - optional outbound citation links

   Why it exists
   -------------
   Generative engines (ChatGPT, Perplexity, Claude, Gemini, Google AI
   Overviews) preferentially cite content that is:
     1. Near the top of the DOM
     2. Short, complete, and attributable
     3. Wrapped in predictable semantic/structural signals

   AnswerCapsule delivers all three. The semantic wrapper uses
   `role="doc-abstract"` (DPUB-ARIA) which is widely understood by
   scrapers and search indexers as "this is the TL;DR of the page."

   When `emitSchema` is true, a matching QAPage Question/Answer pair is
   emitted via <StructuredData>, so the same content appears in JSON-LD
   for crawlers that prefer structured extraction. Do not set this on
   pages that already emit FAQPage — QAPage and FAQPage should not
   coexist on the same URL per Google's guidance.

   Usage
   -----
   <AnswerCapsule
     question="What is Portugal Active?"
     answer="Portugal Active is a Portuguese property-management company
             operating 60+ private hotels across Portugal, each managed
             like a luxury hotel with concierge, private chef, and
             housekeeping included."
     lastUpdated="2026-04-17"
     cite={[{ label: 'About the company', href: '/about' }]}
   />

   The component deliberately forwards very few visual-customization props.
   Consistency across pages is a feature: scrapers learn to trust the
   pattern when it is repeated verbatim.
   ========================================================================== */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'wouter';
import { StructuredData, type JsonLd } from './StructuredData';

export interface AnswerCapsuleCitation {
  label: string;
  /** Internal paths are routed via <Link>; external URLs open in the same tab with rel=noopener. */
  href: string;
}

export interface AnswerCapsuleProps {
  /** The question the capsule answers. Shown visibly unless `hideQuestion` is true. */
  question: string;
  /** 40–80 word answer. Keep it self-contained — assume the reader has no other context. */
  answer: string;
  /** ISO date (YYYY-MM-DD) of last content review. Rendered as "Updated {Month YYYY}". */
  lastUpdated?: string;
  /** Author or team attribution. Defaults to "Portugal Active concierge". */
  author?: string;
  /** Optional citations displayed below the answer as small links. */
  cite?: AnswerCapsuleCitation[];
  /** If true, the question is hidden visually (sr-only) but remains in the DOM for assistive tech and scrapers. */
  hideQuestion?: boolean;
  /** When true, also emits JSON-LD QAPage with Question/acceptedAnswer. Default false. */
  emitSchema?: boolean;
  /** DOM id prefix for the JSON-LD script. Required when emitSchema is true. */
  schemaId?: string;
  /** Optional override className for the outer container. */
  className?: string;
}

function formatUpdated(iso: string | undefined, locale: string = 'en-GB'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { month: 'short', year: 'numeric' });
}

function Citation({ c }: { c: AnswerCapsuleCitation }) {
  const isExternal = c.href.startsWith('http');
  const className =
    'text-[12px] font-medium text-[#8B7355] underline underline-offset-4 decoration-[#D4C5A9] hover:text-[#1A1A18] hover:decoration-[#8B7355] transition-colors';
  if (isExternal) {
    return (
      <a href={c.href} target="_blank" rel="noopener noreferrer" className={className}>
        {c.label}
      </a>
    );
  }
  return (
    <Link href={c.href} className={className}>
      {c.label}
    </Link>
  );
}

export default function AnswerCapsule({
  question,
  answer,
  lastUpdated,
  author = 'Portugal Active concierge',
  cite,
  hideQuestion = false,
  emitSchema = false,
  schemaId,
  className,
}: AnswerCapsuleProps) {
  const { i18n } = useTranslation();
  const updatedLabel = formatUpdated(lastUpdated, i18n.language);

  const qaSchema = useMemo<JsonLd | null>(() => {
    if (!emitSchema) return null;
    return {
      '@context': 'https://schema.org',
      '@type': 'QAPage',
      mainEntity: {
        '@type': 'Question',
        name: question,
        ...(lastUpdated && { dateCreated: lastUpdated }),
        answerCount: 1,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
          ...(lastUpdated && { datePublished: lastUpdated }),
          author: {
            '@type': 'Organization',
            '@id': 'https://www.portugalactive.com/#organization',
            name: 'Portugal Active',
          },
        },
      },
    };
  }, [emitSchema, question, answer, lastUpdated]);

  return (
    <>
      {qaSchema && schemaId && <StructuredData id={schemaId} data={qaSchema} />}
      <aside
        role="doc-abstract"
        aria-label="Quick answer"
        className={
          className ??
          'relative border-l-2 border-[#8B7355] bg-[#F5F1EB]/60 pl-5 pr-4 py-5 md:pl-6 md:pr-5 md:py-6 rounded-r-sm'
        }
      >
        <p className="overline mb-2" style={{ color: '#8B7355' }}>
          Quick answer
        </p>
        <p
          className={hideQuestion ? 'sr-only' : 'headline-sm text-[#1A1A18] mb-3'}
        >
          {question}
        </p>
        <p className="body-md text-[#1A1A18]" style={{ fontWeight: 400 }}>
          {answer}
        </p>
        <p className="mt-3 text-[12px] text-[#6B6860]">
          — {author}
          {updatedLabel && (
            <>
              {' · '}
              <span>Updated {updatedLabel}</span>
            </>
          )}
        </p>
        {cite && cite.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {cite.map((c, idx) => (
              <Citation key={idx} c={c} />
            ))}
          </p>
        )}
      </aside>
    </>
  );
}
