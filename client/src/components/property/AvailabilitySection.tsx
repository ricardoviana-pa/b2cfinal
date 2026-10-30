import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '@/lib/trpc';
import AvailabilityCalendar, { type AvailabilityDay } from '@/components/booking/AvailabilityCalendar';
import { partnerCalendarView } from '@/lib/partnerAvailability';
import { useIsMobile } from '@/hooks/useMobile';
import { formatBookingDate } from '@/lib/format';

/**
 * The home's availability, on the page (after the amenities): two months on
 * a computer, one on a phone, the same calendar the booking card opens on a
 * click — so a guest sees when the home is free without touching anything,
 * and a stay picked here goes to the booking card (PropertyDetail passes it
 * down as the card's initial dates; the card adopts and prices it).
 *
 * Reads the same calendar window as the card (identical query input), so
 * the two share one cache entry and one request.
 */
export default function AvailabilitySection({
  guestyId,
  tripwixUid,
  minNights,
  checkIn,
  checkOut,
  onSelect,
}: {
  guestyId?: string | null;
  tripwixUid?: string;
  minNights?: number;
  checkIn: string;
  checkOut: string;
  onSelect: (next: { checkIn: string; checkOut: string; done: boolean }) => void;
}) {
  const { t, i18n } = useTranslation();
  const isMobile = useIsMobile();

  // The card's 18-month Guesty window (BookingWidget.tsx) …
  const guestyRange = useMemo(() => {
    const from = new Date().toISOString().split('T')[0];
    const toDate = new Date();
    toDate.setMonth(toDate.getMonth() + 18);
    return { from, to: toDate.toISOString().split('T')[0] };
  }, []);
  // … and the partner panel's 12-month one (PartnerBookingPanel.tsx).
  const partnerRange = useMemo(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 365 * 86400000);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }, []);

  const own = trpc.booking.getCalendar.useQuery(
    { listingId: guestyId ?? '', ...guestyRange },
    { enabled: !!guestyId && !tripwixUid, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false },
  );
  const partner = trpc.booking.partnerCalendar.useQuery(
    { tripwixUid: tripwixUid ?? '', ...partnerRange },
    { enabled: !!tripwixUid, staleTime: 15 * 60 * 1000, retry: 1, refetchOnWindowFocus: false },
  );
  const partnerView = useMemo(
    () => (tripwixUid ? partnerCalendarView({ calendar: partner.data, calendarError: partner.isError, windowEnd: partnerRange.endDate }) : null),
    [tripwixUid, partner.data, partner.isError, partnerRange.endDate],
  );

  if (!guestyId && !tripwixUid) return null;

  const days: AvailabilityDay[] = partnerView ? partnerView.days : (own.data?.days ?? []);
  const loading = tripwixUid ? partner.isLoading : own.isLoading;
  const nights = checkIn && checkOut ? Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000) : 0;

  return (
    <section id="property-availability" style={{ scrollMarginTop: '7rem' }}>
      <h2 className="font-display headline-sm font-light text-pa-dark mb-1.5">{t('propertyDetail.availabilityTitle', 'Availability')}</h2>
      <p className="body-sm text-pa-earth mb-5">
        {nights > 0
          ? `${formatBookingDate(checkIn, i18n.language)} → ${formatBookingDate(checkOut, i18n.language)} · ${t('bookingWidget.nightsCountShort', { count: nights })}`
          : t('propertyDetail.availabilityHint', 'Choose your check-in and check-out dates: the price of your stay appears in the booking card.')}
      </p>
      <div className="bg-white border border-pa-sand rounded-xl overflow-hidden">
        {loading ? (
          <div className="skeleton-shimmer h-[360px]" aria-hidden="true" />
        ) : (
          <AvailabilityCalendar
            inline
            singleMonth={isMobile}
            days={days}
            checkIn={checkIn}
            checkOut={checkOut}
            minNights={minNights}
            missingStatus={partnerView?.missing}
            missingUntil={partnerView?.missingUntil}
            unknownNote={partnerView ? t(partnerView.noteKey) : undefined}
            onSelectRange={onSelect}
          />
        )}
      </div>
    </section>
  );
}
