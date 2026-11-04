import { describe, expect, it, vi } from 'vitest';

const reads = vi.hoisted(() => ({ translated: 0 }));
vi.mock('node:fs', () => ({ default: { readFileSync: (file: string) => {
  if (file.endsWith('blog.json')) return JSON.stringify({ articles: [
    { id: 'one', slug: 'one', status: 'published', title: 'English title', content: 'English body', category: 'guides', author: { name: 'Team' } },
    { id: 'draft', slug: 'draft', status: 'draft', title: 'Draft', content: 'Private draft', author: { name: 'Team' } },
  ] });
  if (file.endsWith('pt.json')) {
    if (++reads.translated === 1) throw new Error('Temporary translation read failure');
    return JSON.stringify({ one: { title: 'Título português', content: 'Corpo português' } });
  }
  throw new Error('Unexpected file');
} } }));

import { getJournalArticlePage, getJournalIndex } from './services/journal';

describe('Journal error recovery', () => {
  it('rejects transient errors and succeeds on retry without caching an English fallback', async () => {
    await expect(getJournalArticlePage('one', 'pt')).rejects.toThrow('Temporary translation read failure');
    const retried = await getJournalArticlePage('one', 'pt');
    expect(retried.article?.content).toBe('Corpo português');
    expect(reads.translated).toBe(2);
    expect((await getJournalIndex('pt'))[0].title).toBe('Título português');
    expect(reads.translated).toBe(2);
  });

  it('never exposes draft bodies through article or index', async () => {
    expect(await getJournalArticlePage('draft', 'en')).toEqual({ article: null, relatedArticles: [], redirect: null });
    expect((await getJournalIndex('en')).map(card => card.slug)).toEqual(['one']);
  });
});
