/**
 * The destination choices of every search picker (homepage hero, listing
 * page): regions first with their number of homes, then municipalities under
 * their region. One list, so the homepage and the listing can't drift apart
 * again (auditoria 29 out, ux-home-plp-05).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { trpc } from '@/lib/trpc';
import { getUniqueLocalities } from '@/lib/utils';
import type { Property } from '@/lib/types';
import { buildDestinationOptions, type DestinationOptionsModel, type LocalityChoice } from '@/lib/destinationSearch';

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

export default function DestinationOptions({ model }: { model: DestinationOptionsModel }) {
  const { t } = useTranslation();
  return (
    <>
      {model.regions.length > 0 && (
        <optgroup label={t('destinationSearch.regions', 'Regions')}>
          {model.regions.map((r) => (
            <option key={r.value} value={r.value}>
              {r.count == null
                ? regionLabel(t, r.region)
                : t('destinationSearch.regionWithCount', { region: regionLabel(t, r.region), count: r.count, defaultValue: '{{region}} ({{count}})' })}
            </option>
          ))}
        </optgroup>
      )}
      {model.groups.map((g) =>
        g.region ? (
          <optgroup key={`g-${g.region}`} label={regionLabel(t, g.region)}>
            {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </optgroup>
        ) : (
          g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)
        ),
      )}
    </>
  );
}
