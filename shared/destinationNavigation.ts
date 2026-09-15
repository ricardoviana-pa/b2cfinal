/** Published city guides use locality search; region guides use region search. */
export function destinationHomesHref(d: { slug: string; region: string }): string {
  return d.slug === 'viana-do-castelo'
    ? '/homes?location=viana-do-castelo'
    : `/homes?destination=${encodeURIComponent(d.region)}`;
}

export function localitySlug(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
