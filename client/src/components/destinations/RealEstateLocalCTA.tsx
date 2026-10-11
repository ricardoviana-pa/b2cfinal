import { useTranslation } from 'react-i18next';
const copy = {
  en: ['Could Viana be home?', 'If a stay becomes something more, our local real estate team can help you explore buying or selling in Viana do Castelo.', 'Explore homes for sale', 'Sell a home in Viana'],
  pt: ['E se Viana fosse a sua casa?', 'Se uma estadia despertar outros planos, a nossa equipa imobiliária local pode acompanhá-lo na compra ou venda de casa em Viana do Castelo.', 'Explore casas à venda', 'Vender casa em Viana'],
  fr: ['Et si Viana devenait votre chez-vous ?', 'Si un séjour vous donne de nouvelles envies, notre équipe immobilière locale peut vous accompagner pour acheter ou vendre à Viana do Castelo.', 'Découvrez les maisons à vendre', 'Vendre une maison à Viana'],
  es: ['¿Y si Viana fuera su hogar?', 'Si una estancia despierta nuevos planes, nuestro equipo inmobiliario local puede acompañarle en la compra o venta de una casa en Viana do Castelo.', 'Explore casas en venta', 'Vender una casa en Viana'],
};
export function RealEstateLocalCTA({slug}:{slug:string}) {
  const { i18n } = useTranslation();
  if (slug !== 'viana-do-castelo') return null;
  const locale = i18n.language.split('-')[0];
  const lang = Object.hasOwn(copy,locale) ? locale as keyof typeof copy : 'en';
  const [title,body,buy,sell] = copy[lang];
  const base = `/realestate/${lang === 'en' ? '' : lang + '/'}`;
  return <section className="border-t border-pa-sand bg-pa-cream py-12 md:py-16" aria-labelledby="viana-real-estate-title"><div className="container max-w-5xl"><p className="text-xs uppercase tracking-[.16em] text-pa-charcoal/65 mb-3">Portugal Active Real Estate</p><h2 id="viana-real-estate-title" className="headline-lg mb-4">{title}</h2><p className="max-w-2xl text-base leading-relaxed text-pa-charcoal/80">{body}</p><div className="mt-6 flex flex-col sm:flex-row gap-4 sm:gap-8"><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`${base}viana-do-castelo/`}>{buy} ↗</a><a className="inline-flex min-h-11 items-center underline underline-offset-4" href={`${base}selling-viana-do-castelo/`}>{sell} ↗</a></div></div></section>;
}
