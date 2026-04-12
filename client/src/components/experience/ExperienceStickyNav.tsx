/* ==========================================================================
   EXPERIENCE STICKY NAV — section anchors, appears after scrolling past hero
   Viator-inspired. Desktop only.
   ========================================================================== */

import { useEffect, useState } from 'react';

interface Section {
  id: string;
  label: string;
}

interface ExperienceStickyNavProps {
  sections: Section[];
}

export default function ExperienceStickyNav({ sections }: ExperienceStickyNavProps) {
  const [visible, setVisible] = useState(false);
  const [activeId, setActiveId] = useState<string>(sections[0]?.id || '');

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 600);
      // Active section detection
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.getBoundingClientRect().top < 140) {
          setActiveId(sections[i].id);
          break;
        }
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [sections]);

  const handleClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  };

  return (
    <div
      className={`hidden lg:block sticky top-[72px] z-30 bg-[#FAFAF7]/95 backdrop-blur-sm border-b border-[#E8E4DC] transition-all duration-300 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <nav className="container flex items-center gap-1 py-2 overflow-x-auto scrollbar-hide">
        {sections.map(s => {
          const isActive = s.id === activeId;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={e => handleClick(e, s.id)}
              className={`relative text-[11px] tracking-[0.08em] uppercase font-medium px-4 py-3 whitespace-nowrap transition-colors ${
                isActive ? 'text-[#1A1A18]' : 'text-[#9E9A90] hover:text-[#1A1A18]'
              }`}
            >
              {s.label}
              {isActive && (
                <span className="absolute left-4 right-4 bottom-1 h-px bg-[#1A1A18]" />
              )}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
