import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/**
 * Booking panel for partner (Tripwix) homes.
 *
 * Visually this is the BookingWidget — same white card, same 32px price header,
 * same guest stepper, same black CTA — because a guest browsing the portfolio
 * should not be able to tell that some homes are sourced differently. What
 * changes is the behaviour underneath.
 *
 * These homes cannot be booked instantly: the supplier confirms every stay
 * before we can, so this is deliberately a request and never takes payment. It
 * also does not send the guest away to make it. The earlier version pushed them
 * to the generic contact form, which threw away the dates they had just picked.
 *
 * Nothing here reaches the supplier. The enquiry becomes a lead on our side and
 * the guest's details stay with us — we ask the supplier to hold dates, not to
 * meet our customer.
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

  const datesValid = !!checkIn && !!checkOut && checkOut > checkIn;

  const { data: quote, isFetching } = trpc.booking.partnerQuote.useQuery(
    { tripwixUid, checkIn, checkOut },
    { enabled: datesValid, staleTime: 15 * 60 * 1000 },
  );

  const createLead = trpc.leads.create.useMutation();

  const money = useMemo(
    () =>
      new Intl.NumberFormat(lang, {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }),
    [lang],
  );

  const fmtDate = (d: string) =>
    d ? new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`)) : '';

  const nightlyRate = quote && quote.nights ? quote.subtotal / quote.nights : null;
  const shortStay = quote && minNights ? quote.nights < minNights : false;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
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
    setSent(true);
  }

  if (sent) {
    return (
      <div className="booking-widget bg-white border border-black/10 overflow-hidden shadow-sm">
        <div className="bg-black px-6 py-5 text-center">
          <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <p className="text-white text-[15px] font-light">
            {t('partnerBooking.sentTitle', 'Request received')}
          </p>
        </div>
        <div className="px-5 pt-5 pb-6 space-y-3">
          <p className="text-[13px] text-black/60 leading-relaxed">
            {t(
              'partnerBooking.sentBody',
              'Our concierge is confirming these dates and will come back to you by email. Nothing is charged at this stage.',
            )}
          </p>
          <div className="bg-black/[0.02] border border-black/5 p-3 space-y-1">
            <p className="text-[12px] text-black">{propertyName}</p>
            <p className="text-[11px] text-black/40">
              {fmtDate(checkIn)} → {fmtDate(checkOut)}
              {quote ? ` · ${quote.nights} ${t('bookingWidget.nightsLabel', 'nights')}` : ''} · {guests}{' '}
              {t('booking.guestsLabel', 'guests')}
            </p>
          </div>
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="block w-full text-center text-[12px] text-black/30 hover:text-black transition py-1">
            {t('property.needHelpConcierge', 'Need help? Talk to concierge')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-widget bg-white border border-black/10 overflow-hidden shadow-sm">
      {/* Price header — mirrors the instant-book widget: the total once dates
          are picked, the "from" rate until then. */}
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
                {money.format(quote.total)}
              </span>
              <span className="text-sm text-black/40 font-normal">{t('property.totalLabel')}</span>
            </div>
            <p className="text-sm text-black/50 mt-1 tracking-wide">
              {t('partnerBooking.nightsRate', '{{count}} nights · {{rate}} per night', {
                count: quote.nights,
                rate: nightlyRate ? money.format(nightlyRate) : '',
              })}
            </p>
          </>
        ) : fromPrice ? (
          <>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-light tracking-tight text-black tabular-nums">
                {money.format(fromPrice)}
              </span>
              <span className="text-sm text-black/40 font-normal">
                {t('partnerBooking.perNight', 'per night')}
              </span>
            </div>
            <p className="text-sm text-black/50 mt-1 tracking-wide">
              {t('partnerBooking.pickDates', 'Pick your dates for the exact total')}
            </p>
          </>
        ) : (
          <>
            <p className="text-[22px] font-light tracking-tight text-black">
              {t('property.priceOnRequest')}
            </p>
            <p className="text-sm text-black/50 mt-1 tracking-wide">
              {t('partnerBooking.pickDates', 'Pick your dates for the exact total')}
            </p>
          </>
        )}
      </div>

      <form onSubmit={submit}>
        {/* Dates + guests */}
        <div className="px-5">
          <div className="grid grid-cols-2 border border-black/15">
            <label className="block px-4 py-3 border-r border-black/15">
              <span className="block text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-1">
                {t('partnerBooking.checkIn', 'Check-in')}
              </span>
              <input
                type="date"
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full bg-transparent text-[14px] text-black outline-none"
              />
            </label>
            <label className="block px-4 py-3">
              <span className="block text-[10px] font-medium tracking-[0.15em] uppercase text-black/35 mb-1">
                {t('partnerBooking.checkOut', 'Check-out')}
              </span>
              <input
                type="date"
                value={checkOut}
                min={checkIn || undefined}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full bg-transparent text-[14px] text-black outline-none"
              />
            </label>
          </div>

          <div className="border border-black/15 border-t-0 px-4 py-3">
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
              <span className="min-w-[3ch] text-center text-[15px] text-black tabular-nums" aria-live="polite">
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
          {quote && (
            <div className="bg-black/[0.02] border border-black/5 p-3 space-y-1.5 text-[12.5px]">
              <div className="flex justify-between text-black/60">
                <span>
                  {nightlyRate ? money.format(nightlyRate) : ''} × {quote.nights}
                </span>
                <span className="tabular-nums">{money.format(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between text-black/60">
                <span>{t('partnerBooking.vat', 'VAT (6%)')}</span>
                <span className="tabular-nums">{money.format(quote.vat)}</span>
              </div>
              <div className="border-t border-black/10 pt-1.5 flex justify-between text-black font-medium">
                <span>{t('partnerBooking.total', 'Total')}</span>
                <span className="tabular-nums">{money.format(quote.total)}</span>
              </div>
              <p className="text-[11px] text-black/40 pt-1">
                {t('partnerBooking.noPrepFee', 'No separate preparation or cleaning fee — this is the full price of the stay.')}
              </p>
            </div>
          )}

          {quote && !quote.available && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50/80 border border-amber-200/60 text-[12px] text-black/70">
              {t('partnerBooking.someUnavailable', 'Some of these nights are taken. Send the request and we will propose the nearest dates.')}
            </div>
          )}

          {shortStay && (
            <div className="flex items-start gap-2.5 p-3 bg-amber-50/80 border border-amber-200/60 text-[12px] text-black/70">
              {t('partnerBooking.minNights', 'This home has a {{min}}-night minimum.', { min: minNights })}
            </div>
          )}

          <div className="space-y-2">
            <input
              type="text"
              required
              placeholder={t('partnerBooking.name', 'Your name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full min-h-[44px] border border-black/15 bg-white px-3 text-[13px] text-black outline-none focus:border-black transition-colors"
            />
            <input
              type="email"
              required
              placeholder={t('partnerBooking.email', 'Email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full min-h-[44px] border border-black/15 bg-white px-3 text-[13px] text-black outline-none focus:border-black transition-colors"
            />
            <input
              type="tel"
              placeholder={t('partnerBooking.phone', 'Phone (optional)')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full min-h-[44px] border border-black/15 bg-white px-3 text-[13px] text-black outline-none focus:border-black transition-colors"
            />
            <textarea
              rows={2}
              placeholder={t('partnerBooking.message', 'Anything we should know?')}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full border border-black/15 bg-white px-3 py-2 text-[13px] text-black outline-none focus:border-black transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={createLead.isPending}
            className="w-full min-h-[52px] bg-black text-white text-[12px] font-medium tracking-[0.12em] uppercase px-8 py-4 hover:bg-black/85 transition-colors disabled:opacity-40"
          >
            {createLead.isPending
              ? t('partnerBooking.sending', 'Sending…')
              : t('partnerBooking.submit', 'Request these dates')}
          </button>

          <p className="text-[11px] text-black/40 text-center leading-relaxed">
            {t('partnerBooking.noCharge', 'No payment now — our concierge confirms availability first.')}
          </p>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center text-[12px] text-black/30 hover:text-black transition py-1"
          >
            {t('property.askAboutHome')}
          </a>
        </div>
      </form>
    </div>
  );
}
