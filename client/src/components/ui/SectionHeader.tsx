/**
 * SectionHeader — Portugal Active
 * Design: Le Collectionist-inspired. UPPERCASE overlines. Clean hierarchy.
 */
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  overline: string;
  headline: string;
  body?: string;
  centered?: boolean;
  light?: boolean;
  showDivider?: boolean;
  className?: string;
}

export default function SectionHeader({
  overline,
  headline,
  body,
  centered = false,
  light = false,
  showDivider = false,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn(centered && 'text-center', className)}>
      <p className={cn('overline mb-4', light ? 'text-[#C4A87C]' : 'text-[#8B7355]')}>
        {overline}
      </p>
      <h2 className={cn('headline-lg mb-4', light ? 'text-white' : 'text-[#1A1A18]')}>
        {headline}
      </h2>
      {showDivider && (
        <div className={cn('w-[60px] h-px bg-[#8B7355] mb-6', centered && 'mx-auto')} />
      )}
      {body && (
        <p className={cn('body-lg max-w-[680px]', centered && 'mx-auto', light && 'text-white/70')} style={{ textTransform: 'none' }}>
          {body}
        </p>
      )}
    </div>
  );
}
