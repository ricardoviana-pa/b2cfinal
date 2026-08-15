import { cn } from '@/lib/utils';
import { Link } from 'wouter';

interface PAButtonProps {
  variant?: 'primary' | 'ghost' | 'white';
  href?: string;
  external?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit';
}

export default function PAButton({
  variant = 'primary',
  href,
  external,
  onClick,
  children,
  className,
  type = 'button',
}: PAButtonProps) {
  const baseStyles = 'btn-text inline-flex items-center justify-center transition-all duration-300';

  const variantStyles = {
    primary: 'rounded-full bg-[#1A1A18] text-[#FDFBF7] px-7 py-3 hover:bg-[#8B7355]',
    ghost: 'text-[#1A1A18] border-b border-[#1A1A18] pb-1 px-0 hover:text-[#8B7355] hover:border-[#8B7355]',
    white: 'rounded-full bg-white/10 backdrop-blur-sm text-white border border-white/30 px-7 py-3 hover:bg-white/20',
  };

  const styles = cn(baseStyles, variantStyles[variant], className);

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={styles}>
        {children}
      </a>
    );
  }

  if (href) {
    return (
      <Link href={href} className={styles}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={styles}>
      {children}
    </button>
  );
}
