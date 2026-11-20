/**
 * The destination choices of every search picker (homepage hero, listing
 * page): the regions, each with its number of homes, and nothing else (o
 * Ricardo, 20 nov 2026). One list, so the homepage and the listing can't
 * drift apart again (auditoria 29 out, ux-home-plp-05).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { trpc } from '@/lib/trpc';
import { getUniqueLocalities } from '@/lib/utils';
import type { Property } from '@/lib/types';
import { buildDestinationOptions, localityLabel, type DestinationOptionsModel, type LocalityChoice } from '@/lib/destinationSearch';

/** Region name in the page language. The five hubs use the long-standing
 *  destinations.* labels; Douro and the Silver Coast have their own. */
export function regionLabel(t: TFunction, region: string): string {
  const fallback = region.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return t(`destinations.${region}`, {
    defaultValue: t(`destinationSearch.regionNames.${region}`, { defaultValue: fallback }),
  });
}

/** Localities (tiny, SSR-prefetched) + the catalogue when it is there (for the counts). */
export function useDestinationOptions(homes?: Property[] | null): { model: DestinationOptionsModel; localities: LocalityChoice[] } {
  const { data: localityOptions } = trpc.properties.localities.useQuery();
  const localities = useMemo(
    () => ((localityOptions?.length ? localityOptions : homes?.length ? getUniqueLocalities(homes) : []) as LocalityChoice[]),
    [localityOptions, homes],
  );
  const model = useMemo(() => buildDestinationOptions(localities, homes), [localities, homes]);
  return { model, localities };
}

/**
 * `current` is the picker's value when it is a municipality: a search from a
 * link made before the list was regions only (`?location=caminha`). It is
 * shown as its own line, first, so the picker says what the listing is
 * filtered on instead of falling back to its placeholder.
 */
export default function DestinationOptions({ model, current, localities }: {
  model: DestinationOptionsModel;
  current?: string;
  localities?: LocalityChoice[];
}) {
  const { t } = useTranslation();
  const municipality = current && !current.startsWith('region:') ? current : '';
  return (
    <>
      {municipality && <option value={municipality}>{localityLabel(localities, municipality)}</option>}
      {model.regions.map((r) => (
        <option key={r.value} value={r.value}>
          {r.count == null
            ? regionLabel(t, r.region)
            : t('destinationSearch.regionWithCount', { region: regionLabel(t, r.region), count: r.count, defaultValue: '{{region}} ({{count}})' })}
        </option>
      ))}
    </>
  );
}
