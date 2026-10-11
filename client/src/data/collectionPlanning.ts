type Guide = { q: string; a: string; link?: { href: string; label: string } };

const guides: Record<string, Record<string, Guide[]>> = {
  'villas-with-private-pool': {
    en: [
      { q: 'How do I choose a villa with a pool?', a: 'Start with your dates and group size, then compare bedrooms, outdoor space and location. This collection includes homes with a pool; the individual listing explains whether it is private or shared.' },
      { q: 'Can the pool be heated?', a: 'Heating varies by home and may carry an extra charge. Ask the team to confirm availability, operating dates and the cost for your stay before booking.' },
      { q: 'Where should we stay in northern Portugal?', a: 'Compare the Atlantic coast around Viana do Castelo and Caminha with a quieter countryside base in Minho. Choose the setting that suits your beach days, walks and time together.', link: { href: '/destinations/minho', label: 'Explore Northern Portugal and Minho' } },
    ],
    pt: [
      { q: 'Como escolher uma casa com piscina?', a: 'Comece pelas datas e pelo número de hóspedes, depois compare quartos, espaço exterior e localização. Esta coleção reúne casas com piscina; cada anúncio indica se é privada ou partilhada.' },
      { q: 'É possível aquecer a piscina?', a: 'O aquecimento depende da casa e pode ter um custo adicional. Confirme com a equipa a disponibilidade, a época de funcionamento e o valor para a sua estadia antes de reservar.' },
      { q: 'Onde ficar no Norte de Portugal?', a: 'Compare a costa atlântica de Viana do Castelo e Caminha com uma base mais tranquila no campo, no Minho. Escolha o cenário para os seus dias de praia, caminhadas e tempo em família.', link: { href: '/destinations/minho', label: 'Explorar o Minho e o Norte de Portugal' } },
    ],
  },
  'sea-view-villas': {
    en: [
      { q: 'Does a sea view mean direct beach access?', a: 'Sea views and beach access are different features. Check the photographs and location of each home, and ask about the walking route to the sand if that matters to your stay.' },
      { q: 'Which coastal setting suits us?', a: 'Viana do Castelo combines beaches with a historic centre and restaurants. Caminha and Moledo offer a different base near the river mouth and the Atlantic coast.', link: { href: '/destinations/viana-do-castelo', label: 'Plan a stay in Viana do Castelo' } },
    ],
    pt: [
      { q: 'Vista mar significa acesso direto à praia?', a: 'Vista mar e acesso à praia são características diferentes. Consulte as fotografias e a localização de cada casa e confirme o percurso a pé até ao areal, se for importante para a sua estadia.' },
      { q: 'Que zona da costa escolher?', a: 'Viana do Castelo combina praias com centro histórico e restaurantes. Caminha e Moledo oferecem outra base junto à foz do rio e à costa atlântica.', link: { href: '/destinations/viana-do-castelo', label: 'Planear uma estadia em Viana do Castelo' } },
    ],
  },
  'large-group-villas': {
    en: [
      { q: 'How do we choose a home for twelve or more guests?', a: 'Compare the bedroom layout, bathrooms and dining spaces as well as the total capacity. Check whether the listing is one home or a group of units, so everyone knows how the space is arranged.' },
      { q: 'Can we arrange a chef or celebrate an occasion?', a: 'Tell the team about your plans before booking. Private chefs and transfers can be requested separately, subject to availability and a quote. Events, parties and extra visitors need specific approval for the chosen home.' },
    ],
    pt: [
      { q: 'Como escolher uma casa para doze ou mais pessoas?', a: 'Compare a distribuição dos quartos, as casas de banho e os espaços para refeições, além da capacidade total. Confirme se o anúncio corresponde a uma casa ou a um conjunto de unidades.' },
      { q: 'Podemos pedir um chef ou celebrar uma ocasião?', a: 'Conte à equipa o que tem em mente antes de reservar. Chef privado e transfers podem ser pedidos à parte, sujeitos a disponibilidade e orçamento. Eventos, festas e visitantes adicionais exigem aprovação específica para a casa escolhida.' },
    ],
  },
  'pet-friendly-villas': {
    en: [
      { q: 'What should I confirm before travelling with my dog?', a: 'Tell the team the number, size and type of pets travelling with you. Confirm any charges, house rules and whether the outdoor space is enclosed. A pet-friendly policy does not by itself mean a fenced garden.' },
      { q: 'Where can we plan walks during our stay?', a: 'Use the destination guide to choose between coast, countryside and mountain routes. Access rules for pets vary by beach, season and protected area, so confirm them for your dates.', link: { href: '/destinations/minho', label: 'Discover nature in Northern Portugal' } },
    ],
    pt: [
      { q: 'O que confirmar antes de viajar com o meu cão?', a: 'Indique à equipa quantos animais leva, o tamanho e a espécie. Confirme eventuais custos, regras da casa e se o espaço exterior é vedado. Aceitar animais não significa, por si só, ter um jardim fechado.' },
      { q: 'Onde podemos passear durante a estadia?', a: 'Use o guia de destino para escolher entre costa, campo e serra. As regras de acesso com animais variam conforme a praia, a época e a área protegida; confirme-as para as suas datas.', link: { href: '/destinations/minho', label: 'Descobrir a natureza no Norte de Portugal' } },
    ],
  },
  'villas-with-jacuzzi': {
    en: [
      { q: 'What should I check about the jacuzzi or hot tub?', a: 'Check the listing for its location, capacity and whether it is private or shared. Ask the team to confirm operating dates, heating and any extra charge for your stay.' },
      { q: 'Can we add a special dinner?', a: 'A private chef can be requested for selected stays, subject to availability and a separate quote. Share your dates and preferences with the team.', link: { href: '/services/private-chef', label: 'Explore the private chef service' } },
    ],
    pt: [
      { q: 'O que confirmar sobre o jacuzzi?', a: 'Veja no anúncio a localização, a capacidade e se o jacuzzi é privado ou partilhado. Confirme com a equipa a época de funcionamento, o aquecimento e eventuais custos para a sua estadia.' },
      { q: 'Podemos acrescentar um jantar especial?', a: 'Pode pedir um chef privado para estadias selecionadas, sujeito a disponibilidade e orçamento à parte. Partilhe as datas e preferências com a equipa.', link: { href: '/services/private-chef', label: 'Conhecer o serviço de chef privado' } },
    ],
  },
  'beach-villas': {
    en: [
      { q: 'How close are these homes to the beach?', a: 'This collection uses the beach amenities listed for each home. Distance and access vary: check the individual location and ask whether the route is walkable before choosing.' },
      { q: 'Where should we base a beach holiday in the North?', a: 'Explore Viana do Castelo for beach days with city life, or Caminha and Moledo for a base near the river and coast. Match your home to the beach, surf or walking plans you have in mind.', link: { href: '/destinations/caminha', label: 'Discover Caminha and Moledo' } },
    ],
    pt: [
      { q: 'A que distância ficam as casas da praia?', a: 'Esta coleção usa as comodidades de praia indicadas em cada casa. A distância e o acesso variam: confirme a localização e se o percurso pode ser feito a pé antes de escolher.' },
      { q: 'Onde ficar para umas férias de praia no Norte?', a: 'Explore Viana do Castelo para combinar praia e cidade, ou Caminha e Moledo para uma base junto ao rio e à costa. Escolha a casa de acordo com os seus planos de praia, surf e passeios.', link: { href: '/destinations/caminha', label: 'Descobrir Caminha e Moledo' } },
    ],
  },
};

export function collectionPlanning(slug: string, lang: string) {
  const questions = guides[slug]?.[lang];
  if (!questions) return null;
  return lang === 'pt' ? {
    title: 'Encontre a casa para os seus dias cá',
    help: 'Partilhe as datas e o grupo. A nossa equipa ajuda a escolher a casa e a preparar os detalhes da estadia.',
    contact: 'Ajude-me a escolher', questionsTitle: 'Antes de escolher a sua casa', questions,
  } : {
    title: 'Find the home for your time here',
    help: 'Share your dates and group size. Our local team can help you choose a home and plan the details of your stay.',
    contact: 'Help me choose', questionsTitle: 'Choosing your holiday home', questions,
  };
}
