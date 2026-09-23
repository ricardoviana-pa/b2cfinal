import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'wouter';
import { CalendarDays, ChevronDown, Search } from 'lucide-react';
import { pushDL } from '@/lib/datalayer';
import { openDatePickerWithin } from '@/lib/datePicker';
import { addSearchDays, buildHomeSearchPath } from '@/lib/homeSearch';

export default function HeroSearch({ options, destination, checkin, checkout, guests, onDestination, onCheckin, onCheckout, onGuests }: {
  options: ReactNode; destination: string; checkin: string; checkout: string; guests: number;
  onDestination: (value: string) => void; onCheckin: (value: string) => void;
  onCheckout: (value: string) => void; onGuests: (value: number) => void;
}) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return (
    <form className="hero-search" aria-label={t('homes.searchHomes')} onSubmit={event => {
      event.preventDefault();
      pushDL({ event: 'search', search_location: destination || 'All Destinations', search_location_type: destination ? 'city' : 'all',
        search_checkin: checkin || null, search_checkout: checkout || null,
        search_nights: checkin && checkout ? Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86400000) : null,
        search_adults: guests, search_children: 0, search_source: window.matchMedia('(min-width: 1024px)').matches ? 'hero_desktop' : 'hero_mobile' });
      navigate(buildHomeSearchPath({ destination, checkin, checkout, guests }));
    }}>
      <label className="hero-search-field hero-search-destination">
        <span>{t('home.searchDestination')}</span>
        <select aria-label={t('home.searchDestination')} name="destination" value={destination} onChange={e => onDestination(e.target.value)}>
          <option value="">{t('adventures.allDestinations')}</option>{options}
        </select>
        <ChevronDown aria-hidden="true" className="hero-search-icon" />
      </label>
      {(['checkin', 'checkout'] as const).map(kind => {
        const value = kind === 'checkin' ? checkin : checkout;
        return <label className="hero-search-field hero-search-date" key={kind}
          onClick={e => openDatePickerWithin(e.currentTarget)}>
          <span>{t(kind === 'checkin' ? 'home.searchCheckin' : 'home.searchCheckout')}</span>
          <span className="hero-search-date-value" aria-hidden="true">{value ? value.split('-').reverse().join('/') : t('editorial.addDates')}</span>
          <input className="pa-date-hit" name={kind} aria-label={t(kind === 'checkin' ? 'home.searchCheckin' : 'home.searchCheckout')} type="date" value={value} required={Boolean(kind === 'checkin' ? checkout : checkin)}
            min={kind === 'checkout' && checkin ? addSearchDays(checkin, 1) : minDate}
            onInput={e => kind === 'checkin' ? onCheckin(e.currentTarget.value) : onCheckout(e.currentTarget.value)}
            onChange={e => kind === 'checkin' ? onCheckin(e.target.value) : onCheckout(e.target.value)} />
          <CalendarDays aria-hidden="true" className="hero-search-icon" />
        </label>;
      })}
      <label className="hero-search-field">
        <span>{t('home.searchGuests')}</span>
        <select aria-label={t('home.searchGuests')} name="guests" value={guests} onChange={e => onGuests(Number(e.target.value))}>
          {Array.from({ length: 30 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <ChevronDown aria-hidden="true" className="hero-search-icon" />
      </label>
      <button type="submit" className="btn-primary hero-search-submit"><Search aria-hidden="true" className="h-4 w-4" />{t('homes.searchHomes')}</button>
    </form>
  );
}
