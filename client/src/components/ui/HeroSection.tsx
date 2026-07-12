/**
 * HeroSection — Portugal Active
 * Design: Le Collectionist-inspired. Full-bleed cinematic hero.
 */
import { cn } from '@/lib/utils';

interface HeroSectionProps {
  image: string;
  overline: string;
  headline: string;
  subtitle?: string;
  height?: string;
  centered?: boolean;
  children?: React.ReactNode;
}

export default function HeroSection({
  image,
  overline,
  headline,
  subtitle,
  height = 'h-[80vh]',
  centered = true,
  children,
}: HeroSectionProps) {
  return (
    <section className={cn('relative w-full overflow-hidden', height)}>
      <div
        className="absolute inset-0 bg-cover bg-center scale-[1.02]"
        style={{ backgroundImage: `url(${image})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/10" />
      <div className={cn(
        'relative h-full container flex flex-col',
        centered ? 'justify-center items-center text-center' : 'justify-end pb-20'
      )}>
        <p className="overline text-white/60 mb-5">
          {overline}
        </p>
        <h1 className="headline-xl text-white max-w-[800px] mb-5">
          {headline}
        </h1>
        {subtitle && (
          <p className="text-[17px] font-light leading-[1.75] text-white/70 max-w-[520px] mb-8" style={{ textTransform: 'none' }}>
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </section>
  );
}
