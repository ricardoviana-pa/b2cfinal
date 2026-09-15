import { useTranslation } from 'react-i18next';
import type { Destination } from '@/lib/types';

// Mainland outline: Natural Earth 1:110m admin-0, public domain.
// https://www.naturalearthdata.com/about/terms-of-use/
// Lightweight SVG links: no map SDK, tiles, geolocation or external requests.
const OUTLINE = "M83.3,54.0L101.5,37.5L122.0,28.0L134.6,59.8L164.2,59.8L172.8,51.6L202.0,53.8L216.0,86.4L192.9,104.0L192.2,154.7L184.1,164.3L182.1,195.0L160.4,200.3L180.5,239.3L166.6,282.0L183.9,301.3L177.1,319.0L158.5,343.4L162.6,364.9L142.5,381.8L116.0,372.6L90.2,379.8L97.8,328.9L93.1,288.9L70.7,282.9L58.7,258.3L62.7,215.8L82.7,192.2L86.2,165.9L96.7,126.8L95.6,99.3L85.6,75.9L83.3,54.0Z";
const POINTS: Record<string, {x: number; y: number; labelY: number}> = {"minho": {"x": 105.2, "y": 59.3, "labelY": 66}, "porto": {"x": 104.7, "y": 100.9, "labelY": 120}, "lisbon": {"x": 78.1, "y": 259.5, "labelY": 244}, "alentejo": {"x": 140.3, "y": 286.8, "labelY": 300}, "algarve": {"x": 132.7, "y": 364.7, "labelY": 357}};

export default function PortugalMap({ destinations }: { destinations: Destination[] }) {
  const { t, i18n } = useTranslation();
  return <svg viewBox="0 0 480 420" className="block w-full max-w-lg mx-auto" role="group" aria-label={t('destinationsPage.titleFull')}>
    <title>{t('destinationsPage.titleFull')}</title>
    <path d={OUTLINE} fill="#e4ebe5" stroke="#b5c4b7" strokeWidth="1.2" />
    {destinations.map(d => {
      const p = POINTS[d.slug];
      if (!p) return null;
      return <a key={d.slug} href={`/${i18n.language.split('-')[0]}/destinations/${d.slug}`}
        aria-label={t('destinationGrowth.explore', { name: d.name })} className="group">
        <path d={`M${p.x},${p.y} L228,${p.labelY} H250`} fill="none" stroke="#8b9e91" strokeWidth="1" />
        <circle cx={p.x} cy={p.y} r="5" fill="#0b4541" className="group-hover:fill-pa-brown" />
        <rect x="246" y={p.labelY-22} width="215" height="44" rx="8" fill="transparent" className="group-hover:fill-white group-focus:fill-white" />
        <text x="260" y={p.labelY+6} fontSize="19" fill="#1a1a18" style={{fontFamily:'var(--font-display)'}}>{d.name}</text>
        <text x="435" y={p.labelY+5} fontSize="18" fill="#0b4541" aria-hidden="true">→</text>
      </a>;
    })}
  </svg>;
}
