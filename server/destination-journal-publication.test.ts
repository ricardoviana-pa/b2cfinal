import { describe, expect, it } from 'vitest';
import { destinationJournalCards } from '../client/src/lib/destinationJournal';

const index = {
  'local-guide': { slug: 'local-guide', title: 'Local guide', publishedLocales: ['en', 'pt'] },
  'existing-guide': { slug: 'existing-guide', title: 'Existing translated guide' },
};

describe('destination Journal cards respect available editions', () => {
  it('hides an English fallback card when the requested edition is not published', () => {
    expect(destinationJournalCards(['local-guide', 'existing-guide'], index, 'fr').map(a => a.slug))
      .toEqual(['existing-guide']);
  });

  it.each(['en', 'pt', 'pt-PT'])('keeps the selected order in the published %s edition', language => {
    expect(destinationJournalCards(['missing', 'local-guide', 'existing-guide'], index, language).map(a => a.slug))
      .toEqual(['local-guide', 'existing-guide']);
  });
});
