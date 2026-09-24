/** Spoke guides whose homes are found by locality on /homes (the locality
 *  slug equals the destination slug: "Viana do Castelo", "Caminha",
 *  "Esposende", and the partner homes whose locality is "Douro"). */
const LOCALITY_SPOKES = new Set(['viana-do-castelo', 'caminha', 'esposende', 'douro']);

/** Published city guides use locality search; region guides use region search. */
export function destinationHomesHref(d: { slug: string; region: string }): string {
  return LOCALITY_SPOKES.has(d.slug)
    ? `/homes?location=${encodeURIComponent(d.slug)}`
    : `/homes?destination=${encodeURIComponent(d.region)}`;
}

export function localitySlug(value: string | null | undefined): string {
  return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
