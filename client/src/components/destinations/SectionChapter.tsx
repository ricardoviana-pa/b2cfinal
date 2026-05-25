/* ==========================================================================
   SECTION CHAPTER — editorial wrapper for destination page sections
   ========================================================================

   Wraps a destination-page section with the Aman Journal / Mr & Mrs Smith
   chapter register: numeral, hairline rule, brand-bronze overline,
   serif heading, optional kicker, and IntersectionObserver-driven
   fade-up reveal on scroll. Each section in DestinationPage.tsx is now
   rendered through this wrapper rather than emitting its own <section>.

   Props are intentionally minimal so visual variants stay declarative:

     <SectionChapter
       number={2}
       overline="Why Viana do Castelo"
       heading="Why Viana do Castelo"
       background="white"
       maxWidth="3xl"
     >
       <p>…</p>
     </SectionChapter>

   The reveal is opt-out via `reveal={false}` for sections that already
   manage their own motion (the hero, the editorial interludes). All
   motion is also disabled under prefers-reduced-motion via the
   `.editorial-reveal` CSS in index.css.
   ========================================================================== */

import { useEffect, useRef, type ReactNode } from 'react';

export type ChapterBackground =
  | 'white'      // default — bg-white
  | 'cream'      // bg-[#FAFAF7]
  | 'warm'       // bg-[#F5F1EB]
  | 'sand'       // bg-[#E8E4DC]
  | 'dark'       // bg-[#1A1A18] text-white
  | 'green';     // bg-[#0B4541] text-white (used for the dual-CTA)

const BG_CLASS: Record<ChapterBackground, string> = {
  white: 'bg-white',
  cream: 'bg-[#FAFAF7]',
  warm: 'bg-[#F5F1EB]',
  sand: 'bg-[#E8E4DC]',
  dark: 'bg-[#1A1A18] text-white',
  green: 'bg-[#0B4541] text-white',
};

const MAX_WIDTH: Record<string, string> = {
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  full: '',
};

interface SectionChapterProps {
  /** Chapter number 1–12 (shown as zero-padded numeral). */
  number?: number;
  /** Small uppercase brand-bronze label above the heading. */
  overline?: string;
  /** Section heading rendered as <h2>. */
  heading: string;
  /** Optional 1-line kicker rendered below the heading. */
  kicker?: string;
  /** Background tone — controls colour swap between sections to break the
   *  wall of white. */
  background?: ChapterBackground;
  /** Inner-content max width. */
  maxWidth?: keyof typeof MAX_WIDTH;
  /** Center-align the chapter header block. Default true. */
  centeredHeader?: boolean;
  /** Stable id for sticky-TOC anchoring (also used as scroll target). */
  id?: string;
  /** Opt out of the IntersectionObserver fade-up. Default false. */
  reveal?: boolean;
  /** Outer section className override (rare — for full-bleed exceptions). */
  className?: string;
  /** Content. */
  children: ReactNode;
}

/** Format a chapter number as the leading "01", "02", … */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Toggle `.editorial-revealed` on the wrapper when it crosses the 15%-visible
 *  threshold. One-shot — once revealed we stop observing so the entry doesn't
 *  re-trigger on scroll-back. */
function useReveal(ref: React.RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      // SSR / no IO support → render in revealed state immediately.
      node?.classList.add('editorial-revealed');
      return;
    }
    // If the user has prefers-reduced-motion, the CSS short-circuits the
    // transition anyway — we still toggle the class for symmetry.
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('editorial-revealed');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -80px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [enabled]);
}

export function SectionChapter({
  number,
  overline,
  heading,
  kicker,
  background = 'white',
  maxWidth = '5xl',
  centeredHeader = false,
  id,
  reveal = true,
  className = '',
  children,
}: SectionChapterProps) {
  const ref = useRef<HTMLElement | null>(null);
  useReveal(ref, reveal);
  const isDark = background === 'dark' || background === 'green';
  const headerAlign = centeredHeader ? 'text-center mx-auto' : '';

  return (
    <section
      ref={ref}
      id={id}
      data-chapter={number}
      className={`relative ${BG_CLASS[background]} ${reveal ? 'editorial-reveal' : ''} ${className}`}
      style={{ paddingTop: '88px', paddingBottom: '88px' }}
    >
      <div className={`container ${MAX_WIDTH[maxWidth]} ${centeredHeader ? 'mx-auto' : ''}`}>
        {/* Chapter header — numeral · rule · overline · heading · kicker */}
        <div className={`mb-12 ${headerAlign}`}>
          {number !== undefined && (
            <div className={`flex items-end gap-4 mb-4 ${centeredHeader ? 'justify-center' : ''}`}>
              <span
                className="editorial-numeral"
                style={{ color: isDark ? '#C4A87C' : '#B8985A' }}
              >
                {pad2(number)}
              </span>
              <span
                className="editorial-rule"
                style={{ backgroundColor: isDark ? '#C4A87C' : '#B8985A', marginBottom: 10 }}
              />
              {overline && (
                <span
                  className="text-[11px] font-medium tracking-[0.18em] uppercase mb-1.5"
                  style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#8B7355' }}
                >
                  {overline}
                </span>
              )}
            </div>
          )}
          {number === undefined && overline && (
            <p
              className={`text-[11px] font-medium tracking-[0.18em] uppercase mb-3 ${headerAlign}`}
              style={{ color: isDark ? 'rgba(255,255,255,0.55)' : '#8B7355' }}
            >
              {overline}
            </p>
          )}
          <h2
            className={`text-[34px] md:text-[44px] leading-[1.05] tracking-[-0.01em] ${
              isDark ? 'text-white' : 'text-[#1A1A18]'
            }`}
            style={{ fontFamily: 'var(--font-display)', fontWeight: 400 }}
          >
            {heading}
          </h2>
          {kicker && (
            <p
              className={`mt-5 text-[17px] md:text-[18px] leading-relaxed max-w-2xl ${
                centeredHeader ? 'mx-auto' : ''
              } ${isDark ? 'text-white/70' : 'text-[#3A3A35]'}`}
              style={{ fontWeight: 300 }}
            >
              {kicker}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

export default SectionChapter;
