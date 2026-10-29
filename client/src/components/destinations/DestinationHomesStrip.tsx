/**
 * The destination's homes right under the hero (auditoria 29 out,
 * ux-home-plp-04): on a phone the Algarve, Lisbon, Porto, Alentejo and Douro
 * guides showed their first home about 14 screens down, after eight editorial
 * chapters. The guide stays as it was below; this strip only puts the homes,
 * their real "from" prices and the way to all of them first.
 *
 * Compact on purpose: a swipeable row of cards on phones, the first three on
 * wider screens. It reads exactly the homes and prices of the "Homes in …"
 * section at the end of the guide (visibleDestinationHomes), so the two blocks
 * share one price request.
 */
import { useMemo } from 'react';
import { Link, useSearch } from 'wouter';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { destinationHomesHref } from '@shared/destinationNavigation';
import { editorialTripContext, withEditorialTrip } from '@shared/editorialTripContext';
import { trpc } from '@/lib/trpc';
import { usePartnerPrices } from '@/hooks/usePartnerPrices';
import { pushDL } from '@/lib/datalayer';
import { listedDestinationHomes, visibleDestinationHomes } from '@/lib/destinationHomes';
import PropertyCard from '@/components/property/PropertyCard';
import type { Destination, Property } from '@/lib/types';

export function DestinationHomesStrip({ destination: d, name, properties, viewAllHref }: {
  destination: Destination;
  /** Destination name in the page language. */
  name: string;
  /** The same list the guide's main "Homes in …" section receives. */
  properties: Property[];
  /** The same "view all" target as that section. */
  viewAllHref?: string;
}) {
  const { t, i18n } = useTranslation();
  const search = useSearch();
  const trip = editorialTripContext(search);
  const listed = useMemo(() => listedDestinationHomes(properties), [properties]);
  const visible = useMemo(() => visibleDestinationHomes(properties, { slug: d.slug }), [properties, d.slug]);
  const listingIds = useMemo(() => visible.filter((p) => p.guestyId).map((p) => p.guestyId!), [visible]);
  const { data: fromPrices } = trpc.booking.lowestNightlyBatch.useQuery({ listingIds }, { enabled: listingIds.length > 0, staleTime: 5 * 60_000 });
  const partner = usePartnerPrices(visible);
  if (!visible.length) return null;

  const count = listed.length;
  const allHref = withEditorialTrip(viewAllHref || destinationHomesHref(d), search);
  const track = () => pushDL({ event: 'destination_planning', destination: d.slug, language: i18n.language.split('-')[0], section: 'homes_strip', action: 'homes' });

  return (
    <section data-testid="destination-homes-strip" aria-labelledby="destination-homes-strip-title" className="destination-homes-strip bg-white border-b border-pa-sand">
      <div className="container">
        <div className="destination-homes-strip-head">
          <div>
            <p className="minho-kicker">{t('destinationStrip.kicker', { name, count })}</p>
            <h2 id="destination-homes-strip-title">{t('destinationStrip.title')}</h2>
            {!trip.checkin && <p className="destination-homes-strip-note">{t('homes.filters.priceNote')}</p>}
          </div>
          {count > 1 && (
            <Link href={allHref} onClick={track} className="minho-text-link shrink-0">
              {t('destinationStrip.viewAll', { count })}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          )}
        </div>
        <div className="flex gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-5 px-5 scroll-px-5 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible">
          {visible.map((p, index) => (
            <div key={p.id} className={`snap-start shrink-0 w-[272px] sm:w-[300px] md:w-auto ${index >= 3 ? 'md:hidden' : ''}`}>
              <PropertyCard
                property={p}
                imageSizes="(max-width: 639px) 272px, (max-width: 767px) 300px, 30vw"
                checkin={trip.checkin}
                checkout={trip.checkout}
                guests={trip.guests}
                hidePrice={!!trip.checkin}
                listId={`destination_${d.slug}_top`}
                listName={d.name}
                itemIndex={index}
                fromPrice={p.supplierUid ? partner.prices[p.supplierUid] : fromPrices?.[p.guestyId ?? '']}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default DestinationHomesStrip;
