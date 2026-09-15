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

/** Return the first items with distinct photographs, optionally excluding a set. */
export function uniqueByImage<T extends { coverImage?: string }>(
  items: T[],
  excluded: Array<string | undefined> = [],
  limit?: number,
): T[] {
  const seen = new Set(excluded.map(imageIdentity).filter(Boolean));
  const result: T[] = [];
  for (const item of items) {
    const identity = imageIdentity(item.coverImage);
    if (identity && seen.has(identity)) continue;
    if (identity) seen.add(identity);
    result.push(item);
    if (limit && result.length >= limit) break;
  }
  return result;
}
