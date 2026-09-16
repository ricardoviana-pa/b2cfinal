import type { ReactNode } from 'react';

/** One readable introduction and action hierarchy across the editorial pages. */
export default function EditorialHero({ image, mobileImage, alt, eyebrow, title, description, children }: {
  image: string; mobileImage?: string; alt: string; eyebrow: string;
  title: string; description: string; children: ReactNode;
}) {
  return (
    <section className="editorial-hero">
      <picture className="absolute inset-0">
        {mobileImage && <source media="(max-width: 767px)" srcSet={mobileImage} />}
        <img src={image} alt={alt} width={1600} height={1067} fetchPriority="high" className="h-full w-full object-cover" />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/40 to-black/10" />
      <div className="container relative z-10">
        <p className="editorial-eyebrow text-white/80">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="editorial-hero-description">{description}</p>
        <div className="editorial-actions">{children}</div>
      </div>
    </section>
  );
}
