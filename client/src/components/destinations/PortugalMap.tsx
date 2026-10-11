import { Link, useSearch } from 'wouter';
import { pushDL } from '@/lib/datalayer';
import { withEditorialTrip } from '@shared/editorialTripContext';
import { useTranslation } from 'react-i18next';
import type { Destination } from '@/lib/types';

// Mainland outline: Natural Earth 1:110m admin-0, public domain.
// https://www.naturalearthdata.com/about/terms-of-use/
// Lightweight SVG links: no map SDK, tiles, geolocation or external requests.
export const PORTUGAL_MAINLAND_OUTLINE = "M83.3,54.0L101.5,37.5L122.0,28.0L134.6,59.8L164.2,59.8L172.8,51.6L202.0,53.8L216.0,86.4L192.9,104.0L192.2,154.7L184.1,164.3L182.1,195.0L160.4,200.3L180.5,239.3L166.6,282.0L183.9,301.3L177.1,319.0L158.5,343.4L162.6,364.9L142.5,381.8L116.0,372.6L90.2,379.8L97.8,328.9L93.1,288.9L70.7,282.9L58.7,258.3L62.7,215.8L82.7,192.2L86.2,165.9L96.7,126.8L95.6,99.3L85.6,75.9L83.3,54.0Z";
const POINTS: Record<string, {x: number; y: number; labelY: number}> = {"minho": {"x": 105.2, "y": 59.3, "labelY": 66}, "douro": {"x": 159, "y": 113, "labelY": 175}, "porto": {"x": 104.7, "y": 100.9, "labelY": 120}, "lisbon": {"x": 78.1, "y": 259.5, "labelY": 244}, "alentejo": {"x": 140.3, "y": 286.8, "labelY": 300}, "algarve": {"x": 132.7, "y": 364.7, "labelY": 357}};

export default function PortugalMap({ destinations }: { destinations: Destination[] }) {
  const { t, i18n } = useTranslation();
  const search = useSearch();
  return <nav className="grid grid-cols-[minmax(90px,0.7fr)_minmax(0,1.3fr)] sm:grid-cols-[1fr_1.2fr] gap-3 sm:gap-6 w-full max-w-lg mx-auto items-center" aria-label={t('destinationsPage.titleFull')}>
    <svg viewBox="45 20 185 380" className="w-full max-h-[350px]" aria-hidden="true">
      <path d={PORTUGAL_MAINLAND_OUTLINE} fill="#e4ebe5" stroke="#b5c4b7" strokeWidth="1.2" />
      {destinations.map((d, index) => {
        const p = POINTS[d.slug];
        return p ? <g key={d.slug}><circle cx={p.x} cy={p.y} r="12" fill="#0b4541" /><text x={p.x} y={p.y + 4} textAnchor="middle" fill="white" fontSize="12">{index + 1}</text></g> : null;
      })}
    </svg>
    <ol className="space-y-2 py-3">
      {destinations.map((d, index) => <li key={d.slug}>
        <Link href={withEditorialTrip(`/destinations/${d.slug}`, search)}
          onClick={() => pushDL({event:'destination_planning',destination:d.slug,language:i18n.language.split('-')[0],section:'map',action:'guide'})}
          aria-label={t('destinationGrowth.explore', { name: d.name })}
          className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2">
          <span className="text-xs text-pa-gold-aa shrink-0" aria-hidden="true">0{index + 1}</span>
          <span className="text-base leading-snug flex-1">{d.slug === 'minho' ? d.name.split(' · ').map((part, i) => <span key={part} className={i ? 'block text-sm text-pa-stone-aa mt-1' : 'block'}>{part}</span>) : d.name}</span>
          <span aria-hidden="true" className="text-pa-dark">→</span>
        </Link>
      </li>)}
    </ol>
  </nav>;
}
