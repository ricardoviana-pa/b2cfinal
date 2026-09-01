import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, Loader2 } from 'lucide-react';
import { trpc } from '@/lib/trpc';

/**
 * Booking panel for partner (Tripwix) homes.
 *
 * These cannot be booked instantly — the supplier confirms every stay before we
 * can — so this is deliberately a request, not a checkout. What it does not do
 * is send the guest somewhere else to make it: the previous version pushed them
 * to the generic contact form, which lost the dates they had just picked and
 * lost most of the intent with them.
 *
 * It also answers the question guests were actually writing in to ask. The
 * headline "from EUR X" is the cheapest night of the whole year, which is
 * rarely the night they want; once dates are picked this shows the real total
 * for those dates, with VAT, and says plainly that there is no separate
 * preparation fee.
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
  const [checkIn, setCheckIn] = useState(initialCheckIn ?? '');
  const [checkOut, setCheckOut] = useState(initialCheckOut ?? '');
  const [guests, setGuests] = useState(initialGuests ?? 2);

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
      new Intl.NumberFormat(i18n.language || 'en', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );

  const shortNights = quote && minNights ? quote.nights < minNights : false;

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
      <div className="bg-[#FAFAF7] border border-[#E8E4DC] p-6">
        <p className="font-display text-[20px] font-light text-[#1A1A18] mb-2">
          {t('partnerBooking.sentTitle', 'Request received')}
        </p>
        <p className="text-[13.5px] text-[#6B6860] leading-relaxed" style={{ fontWeight: 300 }}>
          {t(
            'partnerBooking.sentBody',
            'Our concierge is confirming these dates and will come back to you by email. Nothing is charged at this stage.',
          )}
        </p>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full mt-4">
          {t('property.needHelpConcierge', 'Need help? Talk to concierge')}
        </a>
      </div>
    );
  }

  return (
    <div className="bg-[#FAFAF7] border border-[#E8E4DC] p-6">
      <p className="font-display text-[20px] font-light text-[#1A1A18] mb-1">
        {quote
          ? money.format(quote.total)
          : fromPrice
            ? t('property.fromPerNight', { price: Math.round(fromPrice).toLocaleString('en-US') })
            : t('property.priceOnRequest')}
      </p>
      <p className="text-[12px] text-[#726D63] mb-4" style={{ fontWeight: 300 }}>
        {quote
          ? t('partnerBooking.totalFor', 'Total for {{nights}} nights, VAT included', { nights: quote.nights })
          : t('partnerBooking.pickDates', 'Pick your dates for the exact total')}
      </p>

      <div className="flex items-center gap-1.5 mb-4">
        <BadgeCheck size={14} className="text-[#8B7355]" />
        <span className="text-[11px] tracking-[0.02em] text-[#726D63] font-medium">
          {t('property.directConcierge')}
        </span>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.08em] text-[#726D63]">
              {t('partnerBooking.checkIn', 'Check-in')}
            </span>
            <input
              type="date"
              value={checkIn}
              onChange={(e) => setCheckIn(e.target.value)}
              className="w-full mt-1 border border-[#E8E4DC] bg-white px-2 py-2 text-[13px]"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-[0.08em] text-[#726D63]">
              {t('partnerBooking.checkOut', 'Check-out')}
            </span>
            <input
              type="date"
              value={checkOut}
              min={checkIn || undefined}
              onChange={(e) => setCheckOut(e.target.value)}
              className="w-full mt-1 border border-[#E8E4DC] bg-white px-2 py-2 text-[13px]"
            />
          </label>
        </div>

        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.08em] text-[#726D63]">
            {t('partnerBooking.guests', 'Guests')}
          </span>
          <input
            type="number"
            min={1}
            max={maxGuests || 20}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-full mt-1 border border-[#E8E4DC] bg-white px-2 py-2 text-[13px]"
          />
        </label>

        {isFetching && (
          <p className="flex items-center gap-2 text-[12px] text-[#726D63]">
            <Loader2 size={13} className="animate-spin" />
            {t('property.checkingPrice')}
          </p>
        )}

        {quote && (
          <div className="border-t border-[#E8E4DC] pt-3 space-y-1.5 text-[12.5px] text-[#6B6860]">
            <div className="flex justify-between">
              <span>
                {t('partnerBooking.nightsLine', '{{nights}} nights', { nights: quote.nights })}
              </span>
              <span>{money.format(quote.subtotal)}</span>
            </div>
            <div className="flex justify-between">
              <span>{t('partnerBooking.vat', 'VAT (6%)')}</span>
              <span>{money.format(quote.vat)}</span>
            </div>
            <div className="flex justify-between text-[#1A1A18] font-medium pt-1 border-t border-[#E8E4DC]">
              <span>{t('partnerBooking.total', 'Total')}</span>
              <span>{money.format(quote.total)}</span>
            </div>
            <p className="text-[11.5px] text-[#726D63] pt-1" style={{ fontWeight: 300 }}>
              {t('partnerBooking.noPrepFee', 'No separate preparation or cleaning fee — this is the full price of the stay.')}
            </p>
            {!quote.available && (
              <p className="text-[12px] text-[#8B5A3C] pt-1">
                {t('partnerBooking.someUnavailable', 'Some of these nights are taken. Send the request and we will propose the nearest dates.')}
              </p>
            )}
            {shortNights && (
              <p className="text-[12px] text-[#8B5A3C]">
                {t('partnerBooking.minNights', 'This home has a {{min}}-night minimum.', { min: minNights })}
              </p>
            )}
          </div>
        )}

        <div className="border-t border-[#E8E4DC] pt-3 space-y-2">
          <input
            type="text"
            required
            placeholder={t('partnerBooking.name', 'Your name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border border-[#E8E4DC] bg-white px-2 py-2 text-[13px]"
          />
          <input
            type="email"
            required
            placeholder={t('partnerBooking.email', 'Email')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-[#E8E4DC] bg-white px-2 py-2 text-[13px]"
          />
          <input
            type="tel"
            placeholder={t('partnerBooking.phone', 'Phone (optional)')}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-[#E8E4DC] bg-white px-2 py-2 text-[13px]"
          />
          <textarea
            rows={2}
            placeholder={t('partnerBooking.message', 'Anything we should know?')}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-full border border-[#E8E4DC] bg-white px-2 py-2 text-[13px]"
          />
        </div>

        <button type="submit" disabled={createLead.isPending} className="btn-primary w-full">
          {createLead.isPending
            ? t('partnerBooking.sending', 'Sending…')
            : t('partnerBooking.submit', 'Request these dates')}
        </button>
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost w-full">
          {t('property.askAboutHome')}
        </a>
      </form>
    </div>
  );
}
