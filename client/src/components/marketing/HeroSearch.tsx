import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { CalendarDays, ChevronDown, Search } from 'lucide-react';
import { pushDL } from '@/lib/datalayer';
import { openDatePickerWithin } from '@/lib/datePicker';
import { addSearchDays, buildHomeSearchPath, parseDestinationSelection } from '@/lib/homeSearch';
import { useDateRangePicker } from '@/components/booking/useDateRangePicker';
import SearchDatesPicker, { SearchDateButton, nativeDateInputProps, useSearchDatesReady } from '@/components/booking/SearchDatesPicker';

export default function HeroSearch({ options, destination, checkin, checkout, guests, guestsChosen = true, onDestination, onCheckin, onCheckout, onGuests }: {
  options: ReactNode; destination: string; checkin: string; checkout: string; guests: number;
  /** False while the guest count is still the default: it then stays out of the URL. */
  guestsChosen?: boolean;
  onDestination: (value: string) => void; onCheckin: (value: string) => void;
  onCheckout: (value: string) => void; onGuests: (value: number) => void;
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  /* The same calendar as on a home's page (SearchDatesPicker). The native
     date inputs below stay for the moment before the page is interactive. */
  const formRef = useRef<HTMLFormElement>(null);
  const datePicker = useDateRangePicker(!!checkin);
  const calendarReady = useSearchDatesReady();
  return (
    <>
    <form ref={formRef} className="hero-search" aria-label={t('homes.searchHomes')} onSubmit={event => {
      event.preventDefault();
      const pick = parseDestinationSelection(destination);
      pushDL({ event: 'search', search_location: pick.destination || pick.location || 'All Destinations', search_location_type: pick.destination ? 'region' : pick.location ? 'city' : 'all',
        search_checkin: checkin || null, search_checkout: checkout || null,
        search_nights: checkin && checkout ? Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000) : null,
        search_adults: guests, search_children: 0, search_source: window.matchMedia('(min-width: 1024px)').matches ? 'hero_desktop' : 'hero_mobile' });
      navigate(buildHomeSearchPath({ destination, checkin, checkout, guests: guestsChosen ? guests : 0 }));
    }}>
      <label className="hero-search-field hero-search-destination">
        <span>{t('home.searchDestination')}</span>
        <select aria-label={t('home.searchDestination')} name="destination" value={destination} onChange={e => onDestination(e.target.value)}>
          <option value="">{t('adventures.allDestinations')}</option>{options}
        </select>
        <ChevronDown aria-hidden="true" className="hero-search-icon" />
      </label>
      <div ref={datePicker.containerRef} className="contents">
      {(['checkin', 'checkout'] as const).map(kind => {
        const value = kind === 'checkin' ? checkin : checkout;
        const field = kind === 'checkin' ? 'check-in' : 'check-out';
        const label = t(kind === 'checkin' ? 'home.searchCheckin' : 'home.searchCheckout');
        const shown = value ? value.split('-').reverse().join('/') : '';
        return <label className="hero-search-field hero-search-date" key={kind}
          onClick={calendarReady ? undefined : e => openDatePickerWithin(e.currentTarget)}>
          <span>{label}</span>
          <span className={value ? 'hero-search-date-value' : 'hero-search-date-value is-placeholder'} aria-hidden="true">{value ? shown : t('editorial.addDates')}</span>
          <input className="pa-date-hit" name={kind} aria-label={label} type="date" value={value} required={Boolean(kind === 'checkin' ? checkout : checkin)}
            min={kind === 'checkout' && checkin ? addSearchDays(checkin, 1) : minDate}
            onInput={e => kind === 'checkin' ? onCheckin(e.currentTarget.value) : onCheckout(e.currentTarget.value)}
            onChange={e => kind === 'checkin' ? onCheckin(e.target.value) : onCheckout(e.target.value)}
            // One date without the other: open the calendar on the missing
            // one instead of the browser's "fill in this field" bubble.
            onInvalid={calendarReady ? e => { e.preventDefault(); datePicker.openField(field); } : undefined}
            {...nativeDateInputProps(calendarReady)} />
          {calendarReady && <SearchDateButton label={label} shown={shown} expanded={datePicker.open && datePicker.phase === field} onOpen={() => datePicker.openField(field)} />}
          <CalendarDays aria-hidden="true" className="hero-search-icon" />
        </label>;
      })}
      </div>
      <label className="hero-search-field">
        <span>{t('home.searchGuests')}</span>
        <select aria-label={t('home.searchGuests')} name="guests" value={guests} onChange={e => onGuests(Number(e.target.value))}>
          {Array.from({ length: 30 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="hero-search-icon" />
      </label>
      <button type="submit" className="btn-primary hero-search-submit"><Search aria-hidden="true" className="h-4 w-4" />{t('homes.searchHomes')}</button>
    </form>
    <SearchDatesPicker picker={datePicker} anchorRef={formRef} checkIn={checkin} checkOut={checkout}
      onChange={next => { onCheckin(next.checkIn); onCheckout(next.checkOut); }} />
    </>
  );
}
