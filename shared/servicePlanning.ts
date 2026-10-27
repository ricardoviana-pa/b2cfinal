type ServicePlanning = {
  seoTitle: string;
  seoDescription: string;
  heading: string;
  introduction: string;
  steps: { title: string; text: string }[];
  questions: { q: string; a: string }[];
  guideLabel: string;
  requestLabel: string;
};

const privateChef: Record<string, ServicePlanning> = {
  en: {
    seoTitle: 'Private Chef in Portugal for Your Villa Stay | Portugal Active',
    seoDescription: 'Arrange a private chef for your villa stay in Portugal. Share your dates, group and menu preferences for a proposal tailored to your holiday home.',
    heading: 'An evening worth staying in for',
    introduction: 'A table set for your favourite people, regional ingredients and time to enjoy every course. Shape the evening around your holiday: a relaxed family dinner, a celebration or a meal for two.',
    steps: [
      { title: 'Choose your evening', text: 'Tell us the date, the home or area, and how many adults and children will be at the table.' },
      { title: 'Make the menu yours', text: 'Share the occasion, favourite flavours, dietary requirements and an approximate budget.' },
      { title: 'Confirm the details', text: 'We check availability and suitability for the home. Agree the menu, inclusions, total and booking terms before confirming.' },
    ],
    questions: [
      { q: 'How much does a private chef cost?', a: 'The starting price below comes from our current service catalogue. Your total depends on the menu, party size, location and agreed service. Ask for a proposal showing drinks, staff, travel and any other charges.' },
      { q: 'Can children and dietary requirements be accommodated?', a: 'Include children’s ages and any allergies or dietary requirements in your request. The chef confirms suitable menu options and preparation arrangements for your group.' },
      { q: 'Can a chef come to any holiday home?', a: 'Send us the property name or location so we can check coverage, kitchen facilities and access. For a partner property or another host’s home, the host must also allow the service.' },
      { q: 'Are drinks and clearing up included?', a: 'These are agreed in the proposal. Confirm the drinks, table service, kitchen clean-up and any equipment before booking so the evening is organised as you expect.' },
    ],
    guideLabel: 'Read our guide to planning a private chef dinner',
    requestLabel: 'Request your private chef',
  },
  pt: {
    seoTitle: 'Chef privado em Portugal para a sua estadia | Portugal Active',
    seoDescription: 'Peça um chef privado para a sua casa de férias em Portugal. Partilhe datas, número de pessoas e preferências para uma proposta à medida da estadia.',
    heading: 'Uma noite que apetece passar em casa',
    introduction: 'A mesa preparada para as suas pessoas, ingredientes da região e tempo para saborear cada prato. Pense numa refeição descontraída em família, numa celebração ou num jantar a dois.',
    steps: [
      { title: 'Escolha a ocasião', text: 'Indique a data, a casa ou localidade e o número de adultos e crianças à mesa.' },
      { title: 'Dê forma à ementa', text: 'Partilhe os sabores de que gosta, as necessidades alimentares e um orçamento aproximado.' },
      { title: 'Combine os detalhes', text: 'Verificamos a disponibilidade e a adequação à casa. Ementa, inclusões, total e condições ficam acordados antes da confirmação.' },
    ],
    questions: [
      { q: 'Quanto custa contratar um chef privado?', a: 'O preço desde apresentado abaixo vem do catálogo atual do serviço. O total depende da ementa, grupo, localização e serviço acordado. Peça uma proposta que detalhe bebidas, equipa, deslocação e outros encargos.' },
      { q: 'É possível adaptar a ementa a crianças e necessidades alimentares?', a: 'Indique as idades das crianças, alergias e necessidades alimentares no pedido. O chef confirma as opções e condições de preparação adequadas ao grupo.' },
      { q: 'O chef pode ir a qualquer casa de férias?', a: 'Envie o nome da casa ou a localização para verificarmos a cobertura, os equipamentos da cozinha e o acesso. Numa casa de parceiro ou de outro anfitrião, o serviço também precisa de ser permitido pelo anfitrião.' },
      { q: 'As bebidas e a arrumação estão incluídas?', a: 'Esses detalhes ficam definidos na proposta. Confirme bebidas, serviço de mesa, limpeza da cozinha e equipamentos antes de reservar.' },
    ],
    guideLabel: 'Leia o guia para preparar um jantar com chef privado',
    requestLabel: 'Pedir um chef privado',
  },
};

/** Unreviewed languages retain their published catalogue copy. */
export function servicePlanning(slug: string, language: string): ServicePlanning | undefined {
  return slug === 'private-chef' ? privateChef[language.toLowerCase().split('-')[0]] : undefined;
}
