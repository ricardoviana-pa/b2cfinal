/* ==========================================================================
   EXPERIENCE GALLERY — GYG-style 1 large + 2x2 grid, luxury brand
   Mobile: swipe carousel (mirrors PropertyDetail). Desktop: editorial grid.
   ========================================================================== */

import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { bokunResize, bokunSrcSet } from '@/lib/images';

interface ExperienceGalleryProps {
  images: string[];
  alt: string;
}

export default function ExperienceGallery({ images, alt }: ExperienceGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [currentMobile, setCurrentMobile] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartX = useRef(0);
  const isDragging = useRef(false);

  const safeImages = images && images.length > 0 ? images : [''];
  const total = safeImages.length;
  const main = safeImages[0];
  const grid = safeImages.slice(1, 5);

  const openLightbox = (i: number) => {
    setLightboxIndex(i);
    setLightboxOpen(true);
  };

  const closeLightbox = () => setLightboxOpen(false);

  const next = useCallback(() => setLightboxIndex(i => (i + 1) % total), [total]);
  const prev = useCallback(() => setLightboxIndex(i => (i - 1 + total) % total), [total]);

  // Keyboard navigation: ←/→ arrows + Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prev(); }
      else if (e.key === 'Escape') closeLightbox();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lightboxOpen, next, prev]);

  // Preload the neighbouring lightbox images so ←/→ navigation is instant
  // instead of "click and wait for it to load".
  useEffect(() => {
    if (!lightboxOpen) return;
    [lightboxIndex - 1, lightboxIndex + 1].forEach((n) => {
      const src = safeImages[(n + total) % total];
      if (src) { const im = new Image(); im.src = bokunResize(src, 1600); }
    });
  }, [lightboxOpen, lightboxIndex, safeImages, total]);

  // Mobile touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    isDragging.current = true;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    setDragOffset(e.touches[0].clientX - touchStartX.current);
  };
  const handleTouchEnd = () => {
    if (Math.abs(dragOffset) > 50) {
      if (dragOffset < 0 && currentMobile < total - 1) setCurrentMobile(c => c + 1);
      if (dragOffset > 0 && currentMobile > 0) setCurrentMobile(c => c - 1);
    }
    setDragOffset(0);
    isDragging.current = false;
  };

  return (
    <>
      {/* Mobile — swipe carousel */}
      <div
        className="lg:hidden relative w-full overflow-hidden bg-[#F5F1EB] aspect-[4/3]"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => openLightbox(currentMobile)}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(-${(currentMobile / total) * 100}% + ${dragOffset}px))`,
            transition: dragOffset ? 'none' : 'transform 300ms ease',
            width: `${total * 100}%`,
            willChange: 'transform',
          }}
        >
          {safeImages.map((img, i) => (
            <div key={i} className="relative shrink-0 h-full" style={{ width: `${100 / total}%` }}>
              {img && (
                <img
                  src={bokunResize(img, 1080)}
                  srcSet={bokunSrcSet(img, [640, 1080])}
                  sizes="100vw"
                  alt={`${alt} – image ${i + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading={i === 0 ? 'eager' : 'lazy'}
                  decoding="async"
                  draggable={false}
                />
              )}
            </div>
          ))}
        </div>
        <div className="absolute bottom-3 left-3 z-10 text-white/90 text-[12px] bg-black/30 backdrop-blur-sm px-2.5 py-1">
          {currentMobile + 1} / {total}
        </div>
      </div>

      {/* Desktop — 1 large left + 2x2 grid right */}
      <div className="hidden lg:grid container grid-cols-12 gap-2 pt-4">
        <div
          className="col-span-7 relative aspect-[4/3] overflow-hidden bg-[#F5F1EB] cursor-pointer group"
          onClick={() => openLightbox(0)}
        >
          {main && (
            <img
              src={bokunResize(main, 1200)}
              srcSet={bokunSrcSet(main, [768, 1200, 1600])}
              sizes="(min-width: 1024px) 58vw, 100vw"
              alt={`${alt} – main image`}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              loading="eager"
              fetchPriority="high"
              decoding="async"
            />
          )}
        </div>
        <div className="col-span-5 grid grid-cols-2 grid-rows-2 gap-2">
          {Array.from({ length: 4 }).map((_, i) => {
            const img = grid[i];
            const isLast = i === 3;
            return (
              <div
                key={i}
                className="relative aspect-[4/3] overflow-hidden bg-[#F5F1EB] cursor-pointer group"
                onClick={() => openLightbox(Math.min(i + 1, total - 1))}
              >
                {img ? (
                  <img
                    src={bokunResize(img, 700)}
                    srcSet={bokunSrcSet(img, [400, 700])}
                    sizes="(min-width: 1024px) 21vw, 50vw"
                    alt={`${alt} – image ${i + 2}`}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[#E8E4DC]" />
                )}
                {isLast && total > 5 && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-white text-[11px] font-medium tracking-[0.12em] uppercase">
                      View all {total}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* View all photos button (desktop, below grid) */}
      <div className="hidden lg:flex container justify-end pt-3">
        <button
          onClick={() => openLightbox(0)}
          className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#1A1A18] border border-[#E8E4DC] px-5 py-3 hover:border-[#1A1A18] transition-colors"
        >
          View all photos ({total})
        </button>
      </div>

      {/* Lightbox */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={closeLightbox}>
          <button
            onClick={closeLightbox}
            className="absolute top-5 right-5 touch-target text-white hover:text-[#C4A87C] transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            className="absolute left-5 top-1/2 -translate-y-1/2 touch-target text-white hover:text-[#C4A87C] transition-colors"
            aria-label="Previous image"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            className="absolute right-5 top-1/2 -translate-y-1/2 touch-target text-white hover:text-[#C4A87C] transition-colors"
            aria-label="Next image"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
          <img
            src={bokunResize(safeImages[lightboxIndex], 1600)}
            srcSet={bokunSrcSet(safeImages[lightboxIndex], [1080, 1600, 2048])}
            sizes="92vw"
            alt={`${alt} – lightbox image ${lightboxIndex + 1}`}
            className="max-w-[92vw] max-h-[88vh] object-contain"
            decoding="async"
            onClick={e => e.stopPropagation()}
          />
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/70 text-[12px] tracking-[0.08em]">
            {lightboxIndex + 1} / {total}
          </div>
        </div>
      )}
    </>
  );
}
