const en = {
  title: 'What should your team leave with?',
  intro: 'Choose a starting point. We shape the venue, stay and programme around your group.',
  formats: [
    { id: 'working-retreat', title: 'A plan everyone owns', text: 'A working retreat with focused sessions, time together and an overnight stay.', cta: 'Plan a working retreat' },
    { id: 'team-building', title: 'A more connected team', text: 'Time to meet beyond the screen, with a shared activity and room to unwind.', cta: 'Plan team building' },
    { id: 'seasonal-gathering', title: 'A new chapter together', text: 'A year-end gathering or January kick-off, shaped around what comes next.', cta: 'Plan a team gathering' },
  ],
  note: 'Space, room arrangements, permitted use and programme are confirmed in your proposal. Share alternative dates if you can.',
  guides: 'Plan with a clearer brief',
  guideLinks: [
    { slug: 'two-day-company-retreat-northern-portugal', title: 'A two-day retreat: the agenda and venue checks' },
    { slug: 'team-building-with-accommodation-portugal', title: 'Team building with accommodation: compare the complete proposal' },
  ],
  formTitle: 'Tell us about your team',
  formIntro: 'Share what you know. We will help shape the rest and assess suitable spaces and services.',
  optional: 'A few details, if you already know them (optional)',
  dates: 'Preferred dates or month', datesPlaceholder: 'e.g. January, flexible midweek',
  people: 'Number of people', peoplePlaceholder: 'e.g. 12',
  rooms: 'Bedroom arrangements', roomsPlaceholder: 'e.g. private rooms, some sharing',
  message: 'What would you like to achieve?',
  prefill: 'I would like to plan a company retreat with accommodation.',
  selected: 'Starting point', submit: 'Request a team proposal',
};

const pt: typeof en = {
  title: 'O que quer que a equipa leve deste encontro?',
  intro: 'Escolha um ponto de partida. Adaptamos o espaço, a estadia e o programa ao seu grupo.',
  formats: [
    { id: 'working-retreat', title: 'Um plano partilhado', text: 'Um retiro de trabalho com sessões focadas, tempo para conviver e uma noite de alojamento.', cta: 'Planear um retiro' },
    { id: 'team-building', title: 'Uma equipa mais próxima', text: 'Tempo para estar juntos fora do ecrã, com uma atividade partilhada e espaço para descontrair.', cta: 'Planear team building' },
    { id: 'seasonal-gathering', title: 'Um novo capítulo', text: 'Um encontro de fim de ano ou um kick-off de janeiro, pensado em função do que vem a seguir.', cta: 'Planear um encontro' },
  ],
  note: 'O espaço, os quartos, as condições de utilização e o programa são confirmados na proposta. Se puder, indique datas alternativas.',
  guides: 'Prepare um pedido de proposta mais claro',
  guideLinks: [
    { slug: 'two-day-company-retreat-northern-portugal', title: 'Retiro de dois dias: o programa e a escolha do espaço' },
    { slug: 'team-building-with-accommodation-portugal', title: 'Team building com alojamento: comparar a proposta completa' },
  ],
  formTitle: 'Conte-nos o que pretende para a sua equipa',
  formIntro: 'Partilhe o que já sabe. Ajudamos a definir o resto e a avaliar espaços e serviços adequados.',
  optional: 'Alguns detalhes, se já os souber (opcional)',
  dates: 'Datas ou mês pretendido', datesPlaceholder: 'Ex.: janeiro, flexível durante a semana',
  people: 'Número de pessoas', peoplePlaceholder: 'Ex.: 12',
  rooms: 'Distribuição de quartos', roomsPlaceholder: 'Ex.: quartos individuais, alguns partilhados',
  message: 'O que gostava de alcançar?',
  prefill: 'Gostava de planear um retiro de empresa com alojamento.',
  selected: 'Ponto de partida', submit: 'Pedir proposta para a equipa',
};

export function corporatePlanning(language: string) {
  const lang = language.split('-')[0];
  return lang === 'pt' ? pt : lang === 'en' ? en : null;
}

export function corporateEnquiryHref(format: string) {
  return `/contact?subject=events&intent=corporate&format=${encodeURIComponent(format)}`;
}
