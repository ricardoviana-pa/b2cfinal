/* ==========================================================================
   SEARCH BAR — Le Collectionist-style
   Two modes:
   - "hero": Large, centred inside the hero section (static, scrolls away)
   - "fixed": Compact, fixed at top of viewport (appears on scroll)
   ========================================================================== */

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Search } from 'lucide-react';

const DESTINATIONS = [
  { label: 'All regions', value: 'all' },
  { label: 'Minho', value: 'minho' },
  { label: 'Porto', value: 'porto' },
  { label: 'Lisbon', value: 'lisbon' },
  { label: 'Alentejo', value: 'alentejo' },
  { label: 'Algarve', value: 'algarve' },
  { label: 'Brazil', value: 'brazil', disabled: true },
];

interface SearchBarProps {
  mode: 'hero' | 'fixed';
  className?: string;
}

export function SearchBarFields({ mode }: SearchBarProps) {
  const [, navigate] = useLocation();
  const [dest, setDest] = useState('all');
  const [checkin, setCheckin] = useState('');
  const [checkout, setCheckout] = useState('');
  const [guests, setGuests] = useState(1);

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (dest !== 'all') params.set('destination', dest);
    if (checkin) params.set('checkin', checkin);
    if (checkout) params.set('checkout', checkout);
    if (guests > 1) params.set('guests', String(guests));
    const query = params.toString();
    navigate(`/homes${query ? `?${query}` : ''}`);
  };

  const isHero = mode === 'hero';

  return (
    <div className={`flex items-center w-full ${
      isHero
        ? 'border border-white/25 bg-white/10 backdrop-blur-md'
        : 'border border-[#E8E4DC] bg-white shadow-lg shadow-black/5'
    }`}>
      {/* Destination */}
      <select
        value={dest}
        onChange={(e) => setDest(e.target.value)}
        className={`${isHero ? 'h-12 px-4' : 'h-11 px-3'} text-[13px] bg-transparent border-r ${
          isHero ? 'border-white/15 text-white/80' : 'border-[#E8E4DC] text-[#6B6860]'
        } focus:outline-none appearance-none cursor-pointer`}
        style={{ minHeight: 'auto', minWidth: isHero ? '140px' : '120px', fontFamily: 'var(--font-body)' }}
      >
        {DESTINATIONS.map(d => (
          <option key={d.value} value={d.value} disabled={d.disabled} className="text-[#1A1A18]">
            {d.label}{d.disabled ? ' (Coming soon)' : ''}
          </option>
        ))}
      </select>

      {/* Check-in */}
      <input
        type="date"
        value={checkin}
        onChange={(e) => setCheckin(e.target.value)}
        className={`${isHero ? 'h-12 px-4' : 'h-11 px-3'} text-[13px] bg-transparent border-r ${
          isHero ? 'border-white/15 text-white/80 [color-scheme:dark]' : 'border-[#E8E4DC] text-[#6B6860]'
        } focus:outline-none flex-1`}
        style={{ minHeight: 'auto', minWidth: isHero ? '110px' : '100px', fontFamily: 'var(--font-body)' }}
      />

      {/* Check-out */}
      <input
        type="date"
        value={checkout}
        onChange={(e) => setCheckout(e.target.value)}
        className={`${isHero ? 'h-12 px-4' : 'h-11 px-3'} text-[13px] bg-transparent border-r ${
          isHero ? 'border-white/15 text-white/80 [color-scheme:dark]' : 'border-[#E8E4DC] text-[#6B6860]'
        } focus:outline-none flex-1`}
        style={{ minHeight: 'auto', minWidth: isHero ? '110px' : '100px', fontFamily: 'var(--font-body)' }}
      />

      {/* Guests */}
      <div className={`flex items-center ${isHero ? 'h-12 px-4' : 'h-11 px-3'} border-r ${
        isHero ? 'border-white/15' : 'border-[#E8E4DC]'
      }`}>
        <select
          value={guests}
          onChange={(e) => setGuests(Number(e.target.value))}
          className={`text-[13px] bg-transparent ${
            isHero ? 'text-white/80' : 'text-[#6B6860]'
          } focus:outline-none appearance-none cursor-pointer`}
          style={{ minHeight: 'auto', minWidth: '70px', fontFamily: 'var(--font-body)' }}
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map(n => (
            <option key={n} value={n} className="text-[#1A1A18]">{n} guest{n > 1 ? 's' : ''}</option>
          ))}
        </select>
      </div>

      {/* Search button */}
      <button
        onClick={handleSearch}
        className={`${isHero ? 'h-12 px-6' : 'h-11 px-5'} bg-[#1A1A18] text-white text-[12px] font-medium tracking-[0.02em] hover:bg-[#333330] transition-colors flex items-center gap-2`}
        style={{ minHeight: 'auto', minWidth: 'auto' }}
      >
        <Search className="w-4 h-4" />
        Search
      </button>
    </div>
  );
}

/* Fixed search bar — appears when scrolled past hero on homepage, or always on other pages */
export function FixedSearchBar() {
  const [visible, setVisible] = useState(false);
  const [location] = useLocation();
  const isHomepage = location === '/';

  const handleScroll = useCallback(() => {
    if (isHomepage) {
      // Show when scrolled past hero (roughly 70vh)
      const threshold = window.innerHeight * 0.7;
      setVisible(window.scrollY > threshold);
    }
  }, [isHomepage]);

  useEffect(() => {
    if (isHomepage) {
      window.addEventListener('scroll', handleScroll, { passive: true });
      handleScroll();
      return () => window.removeEventListener('scroll', handleScroll);
    } else {
      // On non-homepage, always visible
      setVisible(true);
    }
  }, [isHomepage, handleScroll]);

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 z-[45] hidden lg:block w-full max-w-2xl px-4 transition-all duration-400 ${
        visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-4 pointer-events-none'
      }`}
    >
      <SearchBarFields mode="fixed" />
    </div>
  );
}
