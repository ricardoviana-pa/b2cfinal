export interface CorporateCopy {
  title: string; intro: string; faq1q: string; faq1a: string; faq2q: string; faq2a: string;
}

export function corporateSchema(copy: CorporateCopy, lang: string) {
  const url = `https://www.portugalactive.com/${lang}/corporate-retreats`;
  return [
    { '@type': 'Service', '@id': url, url, name: copy.title, description: copy.intro,
      serviceType: 'Corporate retreats and team building', areaServed: { '@type': 'Country', name: 'Portugal' },
      provider: { '@type': 'Organization', name: 'Portugal Active', url: 'https://www.portugalactive.com' },
    },
    { '@type': 'FAQPage', mainEntity: [
      { '@type': 'Question', name: copy.faq1q, acceptedAnswer: { '@type': 'Answer', text: copy.faq1a } },
      { '@type': 'Question', name: copy.faq2q, acceptedAnswer: { '@type': 'Answer', text: copy.faq2a } },
    ] },
  ];
}
