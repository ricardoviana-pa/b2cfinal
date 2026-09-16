/** Small image curation helpers shared by destination pages. */

/**
 * Compare the source image rather than the rendered CDN variant. This keeps a
 * responsive srcSet from being counted as three different photographs.
 */
export function imageIdentity(source?: string | null): string {
  if (!source) return '';
  try {
    const url = new URL(source, 'https://www.portugalactive.com');
    url.search = '';
    return url.toString().replace(/\/w_\d+,q_auto,f_auto\//g, '/');
  } catch {
    return source.split('?')[0];
  }
}

/** Keep editorial links and order; omit only a photograph already used on the page. */
export function withoutRepeatedImages<T extends { coverImage?: string }>(
  items: T[],
  excluded: Array<string | undefined> = [],
  limit?: number,
): T[] {
  const seen = new Set(excluded.map(imageIdentity).filter(Boolean));
  return items.slice(0, limit).map(item => {
    const identity = imageIdentity(item.coverImage);
    if (identity && seen.has(identity)) return { ...item, coverImage: undefined };
    if (identity) seen.add(identity);
    return item;
  });
}
