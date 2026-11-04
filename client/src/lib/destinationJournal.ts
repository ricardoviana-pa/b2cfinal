import { isBlogLanguagePublished } from '@shared/blogPublication';

export interface DestinationJournalCard {
  slug: string;
  title: string;
  excerpt?: string;
  coverImage?: string;
  publishedLocales?: string[];
}

/** An English index fallback must not advertise an unpublished translation. */
export function destinationJournalCards(
  slugs: string[],
  index: Record<string, DestinationJournalCard>,
  language: string,
): DestinationJournalCard[] {
  return slugs.map(slug => index[slug]).filter((article): article is DestinationJournalCard =>
    Boolean(article) && isBlogLanguagePublished(article, language));
}
