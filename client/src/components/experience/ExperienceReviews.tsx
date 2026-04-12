/* ==========================================================================
   EXPERIENCE REVIEWS — rating breakdown + filter chips + verified list
   Editorial luxury — no yellow stars, rating shown as italic number
   ========================================================================== */

import { useState, useMemo } from 'react';
import type { ExperienceReview, ExperienceAggregateRating } from '@/lib/types';
// Icons removed — no OTA-style badges on our own site

interface ExperienceReviewsProps {
  reviews: ExperienceReview[];
  aggregate?: ExperienceAggregateRating;
}

type SortKey = 'recent' | 'highest' | 'lowest';

const FLAG_MAP: Record<string, string> = {
  US: '🇺🇸', GB: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹', ES: '🇪🇸',
  CA: '🇨🇦', PT: '🇵🇹', NL: '🇳🇱', BE: '🇧🇪', CH: '🇨🇭', AT: '🇦🇹',
  IE: '🇮🇪', SE: '🇸🇪', NO: '🇳🇴', DK: '🇩🇰', BR: '🇧🇷', AU: '🇦🇺',
};

export default function ExperienceReviews({ reviews, aggregate }: ExperienceReviewsProps) {
  const [sort, setSort] = useState<SortKey>('recent');
  const [limit, setLimit] = useState<number>(6);

  const filtered = useMemo(() => {
    // Only show reviews >= 4 stars — this is our website, not an OTA
    let list = reviews.filter(r => r.rating >= 4);
    if (sort === 'recent') list.sort((a, b) => b.date.localeCompare(a.date));
    if (sort === 'highest') list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [reviews, sort]);

  // Rating breakdown — prefer real OTA data from aggregate, fallback to computing from local list
  const breakdown = useMemo(() => {
    if (aggregate?.ratingBreakdown) {
      const rb = aggregate.ratingBreakdown;
      return [
        rb['5'] || 0,
        rb['4'] || 0,
        rb['3'] || 0,
        rb['2'] || 0,
        rb['1'] || 0,
      ];
    }
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach(r => {
      const idx = Math.round(r.rating) - 1;
      if (idx >= 0 && idx < 5) counts[idx]++;
    });
    return counts.reverse(); // 5★ first
  }, [reviews, aggregate]);

  const totalCount = aggregate?.count ?? reviews.length;
  const avgValue = aggregate?.value ?? (reviews.reduce((s, r) => s + r.rating, 0) / (reviews.length || 1));

  if (!reviews || reviews.length === 0) return null;

  return (
    <div>
      {/* Header block */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-10 pb-10 border-b border-[#E8E4DC]">
        {/* Aggregate */}
        <div>
          <p className="text-[10px] tracking-[0.12em] uppercase text-[#8B7355] font-medium mb-3">
            Guest rating
          </p>
          <div className="flex items-baseline gap-3 mb-2">
            <span className="font-display text-[52px] leading-none text-[#1A1A18]">
              {avgValue.toFixed(1)}
            </span>
            <span className="text-[14px] text-[#9E9A90]" style={{ fontWeight: 300 }}>
              / 5
            </span>
          </div>
          <p className="text-[13px] text-[#6B6860] italic mb-1" style={{ fontWeight: 300 }}>
            {totalCount} guest reviews
          </p>
          {aggregate?.rank && (
            <p className="text-[11px] tracking-[0.04em] text-[#8B7355] mt-3">
              {aggregate.rank}
            </p>
          )}
        </div>

        {/* Breakdown bars */}
        <div className="md:col-span-2">
          <p className="text-[10px] tracking-[0.12em] uppercase text-[#8B7355] font-medium mb-4">
            Rating distribution
          </p>
          <div className="space-y-2">
            {breakdown.map((count, i) => {
              const stars = 5 - i;
              const breakdownTotal = breakdown.reduce((s, c) => s + c, 0) || 1;
              const pct = (count / breakdownTotal) * 100;
              return (
                <div key={stars} className="flex items-center gap-3 text-[12px]">
                  <span className="w-6 text-[#6B6860] tabular-nums" style={{ fontWeight: 300 }}>
                    {stars}
                  </span>
                  <div className="flex-1 h-[3px] bg-[#E8E4DC]">
                    <div
                      className="h-full bg-[#8B7355] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[#9E9A90] tabular-nums" style={{ fontWeight: 300 }}>
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Sort control */}
      <div className="flex items-center justify-end py-6 border-b border-[#E8E4DC]">
        <select
          value={sort}
          onChange={e => setSort(e.target.value as SortKey)}
          className="text-[12px] bg-transparent border border-[#E8E4DC] px-4 py-2 text-[#1A1A18] focus:border-[#1A1A18] focus:outline-none cursor-pointer"
          style={{ fontFamily: 'var(--font-body)', fontWeight: 300 }}
        >
          <option value="recent">Most recent</option>
          <option value="highest">Highest rated</option>
        </select>
      </div>

      {/* Reviews list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 py-10">
        {filtered.slice(0, limit).map((r, i) => (
          <article key={i} className="border-l-[1.5px] border-[#8B7355] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#F5F1EB] flex items-center justify-center text-[13px] text-[#8B7355] font-medium">
                {r.author.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-[13px] font-medium text-[#1A1A18] truncate">{r.author}</p>
                  {r.countryCode && FLAG_MAP[r.countryCode] && (
                    <span className="text-[13px]">{FLAG_MAP[r.countryCode]}</span>
                  )}
                </div>
                <p className="text-[11px] text-[#9E9A90]">
                  {new Date(r.date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}
                </p>
              </div>
              <span className="text-[13px] italic text-[#8B7355] shrink-0">
                {r.rating.toFixed(1)}/5
              </span>
            </div>
            <p className="text-[14px] text-[#1A1A18] leading-relaxed mb-3" style={{ fontWeight: 300 }}>
              "{r.text}"
            </p>
            {r.hostResponse && (
              <div className="mt-3 pl-4 border-l border-[#E8E4DC]">
                <p className="text-[10px] tracking-[0.08em] uppercase text-[#8B7355] font-medium mb-1">
                  Response from Portugal Active
                </p>
                <p className="text-[13px] text-[#6B6860]" style={{ fontWeight: 300 }}>
                  {r.hostResponse}
                </p>
              </div>
            )}
          </article>
        ))}
      </div>

      {filtered.length > limit && (
        <div className="text-center">
          <button
            onClick={() => setLimit(l => l + 6)}
            className="text-[11px] tracking-[0.12em] uppercase text-[#1A1A18] border border-[#1A1A18] px-8 py-3.5 hover:bg-[#1A1A18] hover:text-white transition-colors"
          >
            Show more reviews
          </button>
        </div>
      )}
    </div>
  );
}
