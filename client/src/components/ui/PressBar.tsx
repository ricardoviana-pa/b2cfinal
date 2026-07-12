/**
 * PressBar — Portugal Active
 * Design: Le Collectionist-inspired. "As Seen In" label. Clean logos.
 */
import { IMAGES } from '@/lib/images';

const PRESS_LOGOS = [
  { name: 'Forbes', src: IMAGES.pressForbes, height: 22 },
  { name: 'The Times', src: IMAGES.pressTheTimes, height: 28 },
  { name: 'The Guardian', src: IMAGES.pressTheGuardian, height: 24 },
  { name: 'Time Out', src: IMAGES.pressTimeOut, height: 24 },
  { name: "Men's Health", src: IMAGES.pressMensHealth, height: 20 },
  { name: 'Arquitectura y Diseño', src: IMAGES.pressArquitectura, height: 30 },
];

interface PressBarProps {
  className?: string;
}

export default function PressBar({ className = '' }: PressBarProps) {
  return (
    <div className={`bg-white border-b border-[#E8E4DC] ${className}`}>
      <div className="container py-7 lg:py-9">
        <p className="btn-text text-[#9E9A90] text-center mb-5">AS SEEN IN</p>
        <div className="flex items-center justify-center gap-8 sm:gap-12 lg:gap-16 flex-wrap">
          {PRESS_LOGOS.map((logo) => (
            <img
              key={logo.name}
              src={logo.src}
              alt={logo.name}
              className="opacity-40 hover:opacity-70 transition-opacity duration-300 grayscale"
              style={{ height: `${logo.height}px`, width: 'auto' }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
