/* ==========================================================================
   EDITORIAL CHROME — supporting components for the destination template
   ========================================================================

   Three pieces that frame the chapter body in DestinationPage.tsx:

     1. <EditorialInterlude /> — full-bleed dark band with a large serif
        pull-quote. Inserted between chapter groups (after Why, after
        Eat-Drink) to break the wall-of-text rhythm. Aman Journal uses
        this pattern liberally; we use it sparingly.

     2. <DestinationTOC /> — sticky right-side chapter index, desktop
        only (≥1024px). Lists chapters 01–12, highlights the one
        currently in viewport via IntersectionObserver, click to scroll.

     3. <StickyBookingBar /> — fixed bottom bar that slides up after the
        visitor scrolls past the hero. Carries the two primary CTAs
        (view homes + speak to concierge). Plain text + arrows; no live
        pricing yet because that would need Guesty availability wiring.
   ========================================================================== */

import { useEffect, useState, useRef } from 'react';
import { Link } from 'wouter';
import { ArrowRight, MessageCircle } from 'lucide-react';

/* ── EditorialInterlude ───────────────────────────────────────────────── */

interface EditorialInterludeProps {
  /** Background image URL (atmospheric, low-contrast preferred). */
  image: string;
  /** Pull-quote text — kept under 25 words for readability at large scale. */
  quote: string;
  /** Quote attribution (publication, source, year). */
  attribution?: string;
  /** Visual height — 'tall' for major interludes, 'short' for accent. */
  height?: 'short' | 'tall';
  /** Optional anchor id for the TOC. */
  id?: string;
}

export function EditorialInterlude({
  image,
  quote,
  attribution,
  height = 'short',
  id,
}: EditorialInterludeProps) {
  const heightClass = height === 'tall' ? 'min-h-[480px] md:min-h-[600px]' : 'min-h-[320px] md:min-h-[420px]';
  return (
    <section
      id={id}
      className={`relative w-full ${heightClass} flex items-center justify-center overflow-hidden`}
    >
      <div className="absolute inset-0 editorial-ken-burns">
        <img
          src={image}
          alt=""
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          aria-hidden="true"
        />
      </div>
      <div className="absolute inset-0 bg-[#0B0B0A]/70" />
      <div className="relative z-10 container max-w-4xl mx-auto px-6 text-center text-white">
        <p
          className="text-[26px] md:text-[40px] leading-[1.18] tracking-[-0.005em] italic"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 300 }}
        >
          &ldquo;{quote}&rdquo;
        </p>
        {attribution && (
          <p className="mt-8 text-[11px] tracking-[0.18em] uppercase text-white/55">
            {attribution}
          </p>
        )}
      </div>
    </section>
  );
}

/* ── DestinationTOC ───────────────────────────────────────────────────── */

interface ChapterRef {
  number: number;
  id: string;
  label: string;
}

interface DestinationTOCProps {
  chapters: ChapterRef[];
}

/** Sticky chapter index, right-anchored, desktop-only.
 *  Uses IntersectionObserver to track which chapter has the most viewport
 *  coverage and highlights it. Click jumps to the section via anchor. */
export function DestinationTOC({ chapters }: DestinationTOCProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return;

    // Reveal the TOC only after the hero scrolls out (>320px scroll).
    const onScroll = () => setVisible(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const targets = chapters
      .map(c => document.getElementById(c.id))
      .filter((el): el is HTMLElement => !!el);

    const observer = new IntersectionObserver(
      entries => {
        // Pick the most-visible entry in this batch.
        const intersecting = entries.filter(e => e.isIntersecting);
        if (intersecting.length === 0) return;
        const top = intersecting.reduce((a, b) =>
          a.intersectionRatio > b.intersectionRatio ? a : b,
        );
        setActiveId(top.target.id);
      },
      { rootMargin: '-30% 0px -55% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const t of targets) observer.observe(t);
    return () => {
      window.removeEventListener('scroll', onScroll);
      observer.disconnect();
    };
  }, [chapters]);

  if (!visible) return null;

  return (
    <nav
      aria-label="Chapters"
      className="hidden lg:block fixed right-6 top-1/2 -translate-y-1/2 z-30 editorial-toc-enter"
    >
      <ol className="space-y-3.5 pr-4 border-r border-[#1A1A18]/15">
        {chapters.map(c => {
          const isActive = c.id === activeId;
          return (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                onClick={e => {
                  e.preventDefault();
                  const el = document.getElementById(c.id);
                  if (el) {
                    window.scrollTo({
                      top: el.offsetTop - 60,
                      behavior: 'smooth',
                    });
                  }
                }}
                className={`group flex items-center gap-3 justify-end text-right transition-colors ${
                  isActive ? 'text-[#1A1A18]' : 'text-[#9E9A90] hover:text-[#1A1A18]'
                }`}
              >
                <span
                  className={`text-[11px] tracking-[0.08em] uppercase max-w-[10rem] truncate transition-opacity ${
                    isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  }`}
                >
                  {c.label}
                </span>
                <span
                  className="text-[11px] font-medium tracking-[0.04em] tabular-nums"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {c.number < 10 ? `0${c.number}` : c.number}
                </span>
                <span
                  className={`block w-3 h-px transition-all ${
                    isActive ? 'w-6 bg-[#1A1A18]' : 'bg-[#9E9A90]'
                  }`}
                />
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/* ── StickyBookingBar ─────────────────────────────────────────────────── */

interface StickyBookingBarProps {
  destinationName: string;
  destinationRegion: string;
  /** Phone number (if provided, surfaced as a concierge call CTA on mobile). */
  whatsappUrl?: string;
}

/** Slides up from the bottom after the visitor scrolls past the hero (~600px).
 *  Carries the two primary CTAs of the page — book a stay, speak to concierge.
 *  Sits above WhatsAppFloat (z-40 vs z-50). */
export function StickyBookingBar({
  destinationName,
  destinationRegion,
  whatsappUrl,
}: StickyBookingBarProps) {
  const [visible, setVisible] = useState(false);
  const lastY = useRef(0);
  const hiddenByScroll = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY.current + 6;
      const goingUp = y < lastY.current - 6;
      // Reveal after hero, hide while scrolling down aggressively (so the
      // bar doesn't fight the content), restore on scroll up.
      if (y > 600 && !goingDown) {
        setVisible(true);
        hiddenByScroll.current = false;
      } else if (goingDown && y > 600) {
        setVisible(false);
        hiddenByScroll.current = true;
      } else if (y < 600) {
        setVisible(false);
      } else if (goingUp && hiddenByScroll.current) {
        setVisible(true);
      }
      lastY.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
        visible ? 'translate-y-0' : 'translate-y-full'
      }`}
      aria-hidden={!visible}
    >
      <div className="bg-[#1A1A18] text-white shadow-[0_-10px_30px_rgba(0,0,0,0.15)]">
        <div className="container max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] tracking-[0.18em] uppercase text-white/55 mb-0.5">
              Stay in
            </p>
            <p
              className="text-[15px] sm:text-[17px] text-white truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {destinationName}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:inline-flex items-center gap-2 text-[12px] text-white/80 hover:text-white border border-white/20 hover:border-white/40 px-3 py-2 transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Concierge
              </a>
            )}
            <Link
              href={`/homes?destination=${destinationRegion}`}
              className="inline-flex items-center gap-2 text-[12px] sm:text-[13px] font-medium bg-white text-[#1A1A18] px-4 sm:px-5 py-2.5 hover:bg-[#F5F1EB] transition-colors"
            >
              View villas <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
