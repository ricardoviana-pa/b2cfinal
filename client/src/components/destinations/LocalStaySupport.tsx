import { Link, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { withEditorialTrip } from '@shared/editorialTripContext';
import { IMAGES } from '@/lib/images';
import { pushDL } from '@/lib/datalayer';
import { discoveryLanguages } from '@/data/destination-discovery';

export default function LocalStaySupport({ destination = 'index' }: { destination?: string }) {
  const { i18n } = useTranslation();
  const search = useSearch();
  const language = i18n.language.split('-')[0];
  if (!discoveryLanguages(language)) return null;
  const pt = language === 'pt';
  const contact = `/contact?subject=plan-my-stay${destination === 'index' ? '' : `&destination=${destination}`}`;
  return <section className="bg-pa-cream py-14 lg:py-20">
    <div className="container grid md:grid-cols-[0.8fr_1.2fr] items-center gap-8 lg:gap-16">
      <img src={IMAGES.aboutStory} alt={pt ? 'A equipa Portugal Active a preparar uma casa' : 'The Portugal Active team preparing a home'} width={960} height={720} loading="lazy" decoding="async" className="w-full aspect-[4/3] object-cover rounded-xl" />
      <div>
        <p className="text-xs uppercase tracking-widest text-pa-gold-aa mb-4">{pt ? 'Uma casa. Pessoas que ajudam.' : 'Your own home. People who care.'}</p>
        <h2 className="headline-lg">{pt ? 'A privacidade de uma casa. O apoio de uma equipa local.' : 'The privacy of a home. A local team by your side.'}</h2>
        <p className="body-md mt-5">{pt ? 'Diga-nos com quem vem e como imagina os seus dias. Ajudamos a escolher a casa e a zona, a preparar a chegada e a encontrar experiências para a sua viagem.' : 'Tell us who is coming and how you imagine your days. We help you choose your home and area, prepare your arrival and find experiences for your trip.'}</p>
        <ol className="grid sm:grid-cols-3 gap-5 border-y border-pa-sand py-6 my-6 text-sm leading-relaxed">
          {(pt ? ['Escolha a casa e confirme as datas.', 'Combine a chegada e os detalhes com a equipa.', 'Desfrute, com um contacto para o ajudar.'] : ['Choose your home and check your dates.', 'Arrange your arrival and details with the team.', 'Settle in, with someone to turn to.']).map((text, index) => <li key={text}><span className="block text-pa-gold-aa mb-2">0{index + 1}</span>{text}</li>)}
        </ol>
        <p className="text-sm text-pa-stone-aa leading-relaxed mb-6">{pt ? 'Shuttles, chef privado, experiências e limpeza adicional podem ser organizados a pedido, sujeitos a disponibilidade e orçamento. Consulte na casa os serviços incluídos.' : 'Airport shuttles, private chefs, experiences and extra cleaning can be arranged on request, subject to availability and a quote. Check your home for included services.'}</p>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
          <Link href={withEditorialTrip(contact, search)} onClick={() => pushDL({ event: 'destination_planning', destination, language, section: 'local-team', action: 'contact' })} className="btn-primary">{pt ? 'Ajudem-me a escolher a estadia' : 'Help me choose my stay'}<ArrowRight size={17} /></Link>
          <Link href="/about" className="inline-flex min-h-11 items-center underline underline-offset-4 text-sm">{pt ? 'Conheça a Portugal Active' : 'Meet Portugal Active'}</Link>
        </div>
      </div>
    </div>
  </section>;
}
