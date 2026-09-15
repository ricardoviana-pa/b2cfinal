import { Link } from 'wouter';

export default function FaqItem({ item, id }: { item: { q: string; a: string; link?: { href: string; label: string } }; id?: string }) {
  return <details id={id} className="site-faq scroll-mt-28">
    <summary>{item.q}</summary>
    <div className="faq-answer">
      <p className="body-md">{item.a}</p>
      {item.link && <Link href={item.link.href} className="inline-flex min-h-11 items-center body-sm text-pa-dark underline underline-offset-4">{item.link.label}</Link>}
    </div>
  </details>;
}
