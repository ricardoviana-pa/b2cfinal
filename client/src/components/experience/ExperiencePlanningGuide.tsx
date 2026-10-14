import { Link, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { withEditorialTrip } from '@shared/editorialTripContext';

const guides: Record<string, { slug: string; image: string; en: string; pt: string }> = {
  'horseback-riding': { slug: 'horse-riding-viana-first-time-guide', image: '/experiences/horseback-riding/03.webp', en: 'Your first horse ride in Viana do Castelo', pt: 'O primeiro passeio a cavalo em Viana do Castelo' },
  'ebike-tours': { slug: 'cycling-minho-portugal-guide', image: '/experiences/ebike-tours/cover.webp', en: 'Cycling in the Minho: choose your kind of day', pt: 'Bicicleta no Minho: escolha o seu tipo de passeio' },
  'surf-lessons': { slug: 'surfing-minho-coast', image: '/experiences/surf-lessons/cover.webp', en: 'Plan a surf stay on the Minho coast', pt: 'Prepare uma estadia de surf na costa do Minho' },
};

export default function ExperiencePlanningGuide({ slug }: { slug: string }) {
  const { i18n } = useTranslation();
  const search = useSearch();
  const language = i18n.language.split('-')[0];
  const guide = guides[slug];
  if (!guide || (language !== 'en' && language !== 'pt')) return null;
  return <aside className="rounded-xl border border-[#E8E4DC] overflow-hidden bg-[#F5F1EB]">
    <Link href={withEditorialTrip(`/blog/${guide.slug}`, search)} className="group grid sm:grid-cols-[150px_1fr] items-center">
      <img src={guide.image} alt="" width={300} height={200} loading="lazy" className="w-full h-36 sm:h-full object-cover" />
      <div className="p-5">
        <p className="text-xs text-[#756044] mb-2">Portugal Active Journal</p>
        <h2 className="font-display text-xl text-[#1A1A18] mb-2">{guide[language]}</h2>
        <span className="text-sm text-[#756044] underline underline-offset-4">{language === 'pt' ? 'Ler o guia para preparar a experiência' : 'Read the guide to planning your experience'}</span>
      </div>
    </Link>
  </aside>;
}
