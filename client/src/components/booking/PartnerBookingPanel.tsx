import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Check, Loader2, Minus, Plus, User } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { pushDL } from '@/lib/datalayer';
import { formatEur, formatBookingDate } from '@/lib/format';
import AvailabilityCalendar from './AvailabilityCalendar';
import PhoneInput from './PhoneInput';

/**
 * Booking panel for partner (Tripwix) homes.
 *
 * Visually this IS the BookingWidget — same card, same 32px total, same date
 * box over the same AvailabilityCalendar, same guest stepper, same black CTA.
 * A guest moving through the portfolio should not be able to tell that some
 * homes are sourced differently, so anything that repeats is shared or copied
 * verbatim rather than re-invented.
 *
 * What genuinely differs is the transaction, and that is stated instead of
 * disguised: the supplier confirms every stay before we can, so this takes no
 * payment and promises no confirmation.
 *
 * Honesty about the total is the other difference, and it is the one that bit
 * us. The supplier quotes cleaning and a refundable deposit per booking and
 * exposes neither through their API; until those are filled in per house the
 * panel says the total is still to be confirmed. It previously claimed the
 * opposite — "no separate preparation or cleaning fee" — and a guest arrived
 * at the concierge with a screenshot of it against a quote EUR 1,194 higher.
 *
 * Nothing here reaches the supplier: the enquiry becomes a lead on our side.
 */
export function PartnerBookingPanel({
  tripwixUid,
  propertyName,
  propertySlug,
  fromPrice,
  maxGuests,
  minNights,
  initialCheckIn,
  initialCheckOut,
  initialGuests,
  whatsappUrl,
}: {
  tripwixUid: string;
  propertyName: string;
  propertySlug: string;
  fromPrice?: number | null;
  maxGuests: number;
  minNights?: number;
  initialCheckIn?: string;
  initialCheckOut?: string;
  initialGuests?: number;
  whatsappUrl: string;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';

  const [checkIn, setCheckIn] = useState(initialCheckIn ?? '');
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? '');
  const [guests, setGuests] = useState(initialGuests || 2);
  const [showCalendar, setShowCalendar] = useState(false);

  // The dates arrive from the URL when a guest clicks through from a dated
  // search, but they are not there on the first render — useState would keep
  // the empty value it was given and silently drop them, which is the whole
  // reason someone searched by date. Seed once they show up, without stamping
  // over anything the guest has since changed.
  useEffect(() => {
    if (initialCheckIn) setCheckIn((v) => v || initialCheckIn);
    if (initialCheckOut) setCheckOut((v) => v || initialCheckOut);
    if (initialGuests) setGuests((v) => (v === 2 ? initialGuests : v));
  }, [initialCheckIn, initialCheckOut, initialGuests]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;

  // Same 12-month horizon the widget asks Guesty for.
  const calendarRange = useMemo(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 365 * 86400000);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }, []);

  const { data: calendarDays, isLoading: calendarLoading } = trpc.booking.partnerCalendar.useQuery(
    { tripwixUid, ...calendarRange },
    { enabled: !!tripwixUid, staleTime: 15 * 60 * 1000 },
  );

  const { data: quote, isFetching, isError } = trpc.booking.partnerQuote.useQuery(
    { tripwixUid, checkIn, checkOut },
    { enabled: datesValid, staleTime: 15 * 60 * 1000, retry: 1 },
  );

  const createLead = trpc.leads.create.useMutation();

  // Every figure below is already VAT-inclusive: the service adds the 6% before
  // anything leaves it, so a partner night and one of our own compare like for
  // like instead of one being quoted net.
  const nightlyRate = quote && quote.nights ? quote.accommodation / quote.nights : null;
  const shortStay = quote && minNights ? quote.nights < minNights : false;

  useEffect(() => {
    if (!quote) return;
    pushDL({
      event: quote.available ? 'quote' : 'quote_unavailable',
      property_id: propertySlug,
      checkin_date: checkIn,
      checkout_date: checkOut,
      guests_adults: guests,
      value: quote.total,
      currency: 'EUR',
    });
  }, [quote, propertySlug, checkIn, checkOut, guests]);

  const clearDates = () => {
    setSubmitError('');
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSubmitError('');
    try {
      await createLead.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        source: 'partner-home-request',
        message: message.trim() || undefined,
        metadata: {
          property: propertySlug,
          propertyName,
          checkin: checkIn || '—',
          checkout: checkOut || '—',
          guests: String(guests),
          nights: quote ? String(quote.nights) : '—',
          total: quote ? String(quote.total) : '—',
        },
      });
      pushDL({
        event: 'generate_lead',
        property_id: propertySlug,
        value: quote?.total ?? 0,
        currency: 'EUR',
      });
      setSent(true);
    } catch {
      // Before this the rejection was swallowed: the guest clicked and nothing
      // happened at all.
      setSubmitError(
        t('partnerBooking.submitError', 'We could not send your request. Please try again, or message the concierge.'),
      );
    }
  }

  if (sent) {
    return (
      <div className="booking-widget bg-white border border-black/10 overflow-hidden shadow-sm">
        <div className="bg-black px-6 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-white" />
          </div>
          <p className="text-white text-[18px]" style={{ fontFamily: 'var(--font-display)' }}>
            {t('partnerBooking.sentTitle', 'Request received')}
          </p>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-black/60 leading-relaxed">
            {t(
              'partnerBooking.sentBody',
              'Our concierge is confirming these dates with the property and will come back to you by email with the final total. Nothing is charged at this stage.',
            )}
          </p>
          <div className="bg-black/[0.02] p-4 space-y-1">
            <p className="text-[10px] text-black/30 uppercase tracking-wider mb-1">
              {t('partnerBooking.requestDetails', 'Request details')}
            </p>
            <p className="text-[12px] text-black">{propertyName}</p>
            <p className="text-[11px] text-black/40">
              {formatBookingDate(checkIn, lang)} → {formatBookingDate(checkOut, lang)}
              {quote ? ` · ${quote.nights} ${t('bookingWidget.nightsLabel', 'nights')}` : ''} · {guests}{' '}
              {t('booking.guestsLabel', 'guests')}
            </p>
          </div>
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full min-h-[52px] bg-black text-white text-xs font-medium tracking-[0.12em] uppercase px-8 flex items-center justify-center gap-2 hover:bg-black/85 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.174.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.465 3.488" />
            </svg>
            {t('property.talkConciergeMobile', 'TALK TO CONCIERGE')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-widget bg-white border border-black/10 overflow-hidden shadow-sm">
      {/* Price header — the widget's three states, same type ramp. */}
      <div className="px-6 pt-6 pb-4">
        {isFetching && datesValid ? (
          <div className="space-y-2 animate-pulse w-full">
            <div className="h-5 bg-black/5 rounded w-3/4" />
            <div className="h-4 bg-black/5 rounded w-1/2" />
          </div>
        ) : quote ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-light tracking-tight text-black tabular-nums">
                {formatEur(quote.total, lang)}
              </span>
              <span className="text-sm text-black/40 font-normal">
                {quote.feesKnown
                  ? t('property.totalLabel')
                  : t('partnerBooking.soFarLabel', 'so far')}
              </span>
            </div>
            <p className="text-sm text-black/50 mt-1 tracking-wide">
              {t('bookingWidget.nightsLine', {
                count: quote.nights,
                rate: nightlyRate ? formatEur(nightlyRate, lang) : '',
              })}
            </p>
          </>
        ) : (
          <>
            <span
              className="text-[28px] text-[#1A1A18]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {fromPrice
                ? t('property.fromPerNight', { price: Math.round(fromPrice).toLocaleString('en-US') })
                : t('property.priceOnRequest')}
            </span>
            {fromPrice ? (
              <span className="text-[14px] text-[#726D63] ml-1">
                {t('partnerBooking.perNight', 'per night')}
              </span>
            ) : null}
            <p className="text-[11.5px] text-[#806A48] mt-1" style={{ fontWeight: 400 }}>
              {t('partnerBooking.pickDates', 'Pick your dates for the exact total')}
            </p>
          </>
        )}
      </div>

      <form onSubmit={submit}>
        {/* Dates — the portfolio's own calendar, not a native picker. */}
        <div className="mx-5">
          <div
            role="button"
            tabIndex={0}
            aria-expanded={showCalendar}
            onClick={() => setShowCalendar((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setShowCalendar((v) => !v);
              }
            }}
            className={`border overflow-hidden cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black ${
              showCalendar ? 'border-black rounded-t-lg' : 'border-black/15 hover:border-black/30 rounded-lg'
            }`}
          >
            <div className="grid grid-cols-2 divide-x divide-black/10">
              <div className="px-4 py-3.5 transition-colors hover:bg-black/[0.02]">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-1">
                  {t('bookingWidget.checkInLabel')}
                </p>
                <p className={`text-[15px] font-normal ${checkIn ? 'text-black' : 'text-black/30'}`}>
                  {checkIn ? formatBookingDate(checkIn, lang) : t('bookingWidget.selectDate', 'Select')}
                </p>
              </div>
              <div className="px-4 py-3.5 transition-colors hover:bg-black/[0.02]">
                <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-1">
                  {t('bookingWidget.checkOutLabel')}
                </p>
                <p className={`text-[15px] font-normal ${checkOut ? 'text-black' : 'text-black/30'}`}>
                  {checkOut ? formatBookingDate(checkOut, lang) : t('bookingWidget.selectDate', 'Select')}
                </p>
              </div>
            </div>
          </div>

          {showCalendar && (
            <div className="border border-black border-t-0 rounded-b-lg overflow-hidden shadow-[0_8px_24px_rgba(26,26,24,0.08)] bg-white">
              {calendarLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-4 h-4 animate-spin text-black/30" />
                  <span className="ml-2 text-xs text-black/40">
                    {t('bookingWidget.loadingCalendar', 'Loading availability...')}
                  </span>
                </div>
              ) : (
                <AvailabilityCalendar
                  singleMonth
                  days={calendarDays ?? []}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  minNights={minNights}
                  onSelectRange={({ checkIn: ci, checkOut: co }) => {
                    setCheckIn(ci);
                    setCheckOut(co);
                    clearDates();
                    if (ci && co) setShowCalendar(false);
                  }}
                />
              )}
            </div>
          )}

          {minNights && minNights > 1 && (
            <p className="text-[11px] text-black/50 mt-2 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {t('bookingWidget.minNightMinimum', { count: minNights })}
            </p>
          )}

          {shortStay && (
            <div className="flex items-start gap-2.5 p-3 mt-2 bg-amber-50/80 border border-amber-200/60">
              <span className="text-amber-600 text-sm shrink-0 leading-none mt-0.5">!</span>
              <p className="text-xs text-amber-800 font-medium leading-snug">
                {t('partnerBooking.minNights', 'This home has a {{min}}-night minimum.', { min: minNights })}
              </p>
            </div>
          )}

          <div className="border border-black/15 mt-3 px-4 py-3">
            <p className="text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-2">
              {t('booking.guestsLabel')}
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setGuests((g) => Math.max(1, g - 1))}
                disabled={guests <= 1}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-black/40 transition-colors hover:border-black hover:text-black disabled:opacity-20"
                aria-label={t('booking.decreaseGuests', 'Decrease guests')}
              >
                <Minus className="w-3 h-3" />
              </button>
              <span
                className="min-w-[3ch] text-center text-[15px] text-black tabular-nums font-normal"
                aria-live="polite"
                aria-atomic="true"
              >
                {guests}
              </span>
              <button
                type="button"
                onClick={() => setGuests((g) => Math.min(maxGuests > 0 ? maxGuests : 30, g + 1))}
                disabled={guests >= (maxGuests > 0 ? maxGuests : 30)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-black/40 transition-colors hover:border-black hover:text-black disabled:opacity-20"
                aria-label={t('booking.increaseGuests', 'Increase guests')}
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 pt-5 pb-6 space-y-3">
          {isError && datesValid && (
            <div className="flex items-start gap-2 p-3 bg-red-50/70 border border-red-200/50" role="alert">
              <span className="text-red-500 mt-0.5 shrink-0 font-medium text-xs">!</span>
              <p className="text-red-600 leading-snug text-xs">
                {t('partnerBooking.quoteError', 'We could not price these dates just now. Send the request and the concierge will confirm the total.')}
              </p>
            </div>
          )}

          {quote && (
            <div className="bg-black/[0.02] border border-black/10 overflow-hidden">
              <div className="p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-black/50">
                    {nightlyRate ? formatEur(nightlyRate, lang) : ''} × {quote.nights}
                  </span>
                  <span className="text-sm text-black tabular-nums">
                    {formatEur(quote.accommodation, lang)}
                  </span>
                </div>

                {quote.cleaningFee > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-black/50">{t('property.cleaningFee', 'Home preparation')}</span>
                    <span className="text-sm text-black tabular-nums">{formatEur(quote.cleaningFee, lang)}</span>
                  </div>
                )}

                <div className="border-t border-black/10 pt-3 flex justify-between items-baseline">
                  <span className="text-[15px] font-medium text-black">
                    {quote.feesKnown
                      ? t('partnerBooking.total', 'Total')
                      : t('partnerBooking.totalSoFar', 'Total so far')}
                  </span>
                  <span className="text-[24px] font-light tabular-nums tracking-tight text-black">
                    {formatEur(quote.total, lang)}
                  </span>
                </div>

                <p className="text-[11px] text-black/35 leading-snug">
                  {t('partnerBooking.vatIncluded', 'VAT included.')}{' '}
                  {quote.feesKnown
                    ? quote.securityDeposit > 0
                      ? t('partnerBooking.depositNote', 'A refundable security deposit of {{amount}} is held by the property.', {
                          amount: formatEur(quote.securityDeposit, lang),
                        })
                      : ''
                    : t(
                        'partnerBooking.feesPending',
                        'This property may add a cleaning fee and a refundable deposit. The concierge confirms the final total before anything is charged.',
                      )}
                </p>
              </div>
            </div>
          )}

          {quote && !quote.available && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50/80 border border-amber-200/60">
              <span className="text-amber-600 text-sm shrink-0 leading-none mt-0.5">!</span>
              <p className="text-xs text-amber-800 font-medium leading-snug">
                {t('partnerBooking.someUnavailable', 'Some of these nights are taken. Send the request and we will propose the nearest dates.')}
              </p>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <div className="w-5 h-5 rounded-full bg-black flex items-center justify-center shrink-0">
              <User className="w-2.5 h-2.5 text-white" />
            </div>
            <p className="text-sm text-black font-medium">
              {t('partnerBooking.guestInfo', 'Your details')}
            </p>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              required
              placeholder={t('partnerBooking.name', 'Full name *')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-[48px] border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors"
            />
            <input
              type="email"
              required
              placeholder={t('partnerBooking.email', 'Email *')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-[48px] border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors"
            />
            <PhoneInput
              value={phone}
              onChange={setPhone}
              placeholder={t('partnerBooking.phone', 'Phone number')}
            />
            <textarea
              rows={2}
              placeholder={t('partnerBooking.message', 'Anything we should know?')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-black/15 bg-white px-3 py-2 text-sm text-black placeholder:text-black/30 focus:ring-1 focus:ring-black focus:border-black outline-none transition-colors"
            />
          </div>

          {submitError && (
            <div className="flex items-start gap-2 p-3 bg-red-50/70 border border-red-200/50" role="alert">
              <span className="text-red-500 mt-0.5 shrink-0 font-medium text-xs">!</span>
              <p className="text-red-600 leading-snug text-xs">{submitError}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={createLead.isPending}
            className="w-full min-h-[52px] px-8 text-xs font-medium tracking-[0.15em] uppercase bg-black text-white hover:bg-black/85 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {createLead.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {t('partnerBooking.sending', 'Sending…')}
              </span>
            ) : (
              t('partnerBooking.submit', 'Request these dates')
            )}
          </button>

          <p className="text-[11px] text-black/30 text-center leading-relaxed">
            {t('partnerBooking.noCharge', 'No payment now — our concierge confirms availability and the final total first.')}
          </p>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 text-[12px] text-[#8B7355] hover:text-black transition-colors pt-3 mt-1 border-t border-black/[0.06]"
          >
            {t('property.needHelpConcierge', 'Need help? Talk to concierge')}
          </a>
        </div>
      </form>
    </div>
  );
}
