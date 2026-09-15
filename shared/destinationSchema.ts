import type { Destination, Property } from '../client/src/lib/types';
import { getDisplayName } from './displayName';

/** Destination pages describe places and link to homes. Detailed rental
 * markup belongs on the home page, not on incomplete listing stubs. */
export function buildDestinationGraph(d: Destination, properties: Property[], baseUrl = 'https://www.portugalactive.com', lang = 'en'): Record<string, unknown>[] {
  const url = `${baseUrl}/${lang}/destinations/${d.slug}`;
  const image = d.coverImage?.startsWith('/') ? `${baseUrl}${d.coverImage}` : d.coverImage;
  const placeId = `${url}#destination`;
  return [
    {
      '@type': 'TouristDestination', '@id': placeId, name: d.name,
      description: d.heroSubtitle || d.description || d.tagline, url, image,
      ...(d.geo && { geo: { '@type': 'GeoCoordinates', latitude: d.geo.latitude, longitude: d.geo.longitude } }),
      ...(properties.length > 0 && { containsPlace: properties.slice(0, 6).map(p => ({
        '@type': 'Place', name: getDisplayName(p), url: `${baseUrl}/${lang}/homes/${p.slug}`,
      })) }),
    },
    {
      '@type': 'CollectionPage', '@id': url, url, name: d.seoTitle || d.name,
      description: d.seoDescription || d.tagline, inLanguage: lang, image,
      about: { '@id': placeId },
    },
    {
      '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${baseUrl}/${lang}` },
        { '@type': 'ListItem', position: 2, name: 'Destinations', item: `${baseUrl}/${lang}/destinations` },
        { '@type': 'ListItem', position: 3, name: d.name },
      ],
    },
    ...(d.faqs?.length ? [{
      '@type': 'FAQPage', mainEntity: d.faqs.map(f => ({
        '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    }] : []),
  ];
}
