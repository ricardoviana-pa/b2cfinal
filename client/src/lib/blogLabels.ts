import type { TFunction } from 'i18next';

/** Category and author labels for the Journal, in the page's language.
 *  Articles store the category as an English slug ("destinations") and the
 *  in-house author as English copy ("Portugal Active Team", "Editorial
 *  Team"); printing those raw put English eyebrows and bylines on the PT and
 *  ES pages (auditoria set/2026). Named people keep their name and role
 *  (a personal title is only translated once it is confirmed). */

const CATEGORY_KEYS: Record<string, string> = {
  destinations: 'blog.catDestinations',
  lifestyle: 'blog.catLifestyle',
  'portugal-active': 'blog.catPA',
  video: 'blog.catVideo',
  people: 'blog.catPeople',
  guides: 'blog.catGuides',
};

export function blogCategoryLabel(category: string | undefined, t: TFunction): string {
  const key = category ? CATEGORY_KEYS[category] : undefined;
  return key ? t(key) : (category || '').replace(/-/g, ' ');
}

type Author = { id?: string; name?: string; role?: string } | undefined | null;

const ROLE_KEYS: Record<string, string> = {
  'Editorial Team': 'blog.authorRoleEditorial',
  Journal: 'blog.authorRoleJournal',
};

export function blogAuthorName(author: Author, t: TFunction): string {
  if (!author?.name) return '';
  return author.name === 'Portugal Active Team' ? t('blog.authorTeam') : author.name;
}

export function blogAuthorRole(author: Author, t: TFunction): string {
  const role = author?.role || '';
  return ROLE_KEYS[role] ? t(ROLE_KEYS[role]) : role;
}
