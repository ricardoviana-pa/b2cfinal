import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { fetchReservation } from "@/lib/booking-api";
import { pushDL, pushPurchaseOnce } from "@/lib/datalayer";
import { formatEurCents, formatBookingDate } from "@/lib/format";
import { reservationStatusLabel } from "@/lib/cancellation";

export default function BookingConfirmationPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  usePageMeta({
    title: t('bookingConfirmation.pageTitle'),
    description: t('bookingConfirmation.pageDescription'),
  });
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const purchaseFiredRef = useRef(false);

  useEffect(() => {
    let active = true;
    fetchReservation(id)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err: any) => {
        if (active) setError(err?.message || t('bookingConfirmation.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Report purchase once per transaction — persistent guard, so refreshes and
  // the other confirmation surfaces can't double-fire (F7).
  useEffect(() => {
    if (!data || purchaseFiredRef.current) return;
    purchaseFiredRef.current = true;

    pushPurchaseOnce(data.confirmationCode, {
      event: 'purchase',
      ecommerce: {
        transaction_id: data.confirmationCode,
        value: data.totalCents != null ? data.totalCents / 100 : undefined,
        currency: data.currency || 'EUR',
        items: [
          {
            item_id: data.listingId ? `PROP-${data.listingId}` : data.listingName,
            item_name: data.listingName,
            item_category: 'villa',
            price: data.nightlyRateCents != null ? data.nightlyRateCents / 100 : undefined,
            quantity: data.nights ?? undefined,
            checkin_date: data.checkIn ?? undefined,
            checkout_date: data.checkOut ?? undefined,
            guests_adults: data.guestsCount ?? undefined,
          },
        ],
      },
    });
  }, [data]);

  return (
    <div className="min-h-screen bg-pa-cream">
      <Header />
      <section className="section-padding">
        <div className="container max-w-3xl">
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-3">{t('bookingConfirmation.overline')}</p>
          <h1 className="headline-lg text-pa-dark mb-3">{t('bookingConfirmation.title')}</h1>
          <p className="body-md mb-8">{t('bookingConfirmation.subtitle')}</p>

          {loading ? (
            <div className="rounded-lg bg-pa-warm border border-pa-sand h-[240px] animate-pulse" />
          ) : error ? (
            <div className="rounded-lg bg-white border border-destructive p-5 text-destructive">{error}</div>
          ) : data ? (
            <div className="space-y-6">
              <div className="rounded-lg bg-white border border-pa-sand shadow-[0_4px_24px_rgba(26,26,24,0.06)] p-6">
                <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-2">{t('bookingConfirmation.reference')}</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(data.confirmationCode)}
                  className="headline-md text-pa-dark hover:text-pa-gold transition-colors"
                >
                  {data.confirmationCode}
                </button>
                <p className="body-sm mt-2">{t('common.clickToCopy')}</p>
              </div>

              <div className="rounded-lg bg-white border border-pa-sand shadow-[0_4px_24px_rgba(26,26,24,0.06)] p-6">
                <div className="grid md:grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <p className="text-pa-stone-aa mb-1">{t('bookingConfirmation.accommodation')}</p>
                    <p className="text-pa-dark">{data.listingName}</p>
                  </div>
                  <div>
                    <p className="text-pa-stone-aa mb-1">{t('bookingConfirmation.status')}</p>
                    <p className="text-pa-dark">{reservationStatusLabel(data.status, t)}</p>
                  </div>
                  <div>
                    <p className="text-pa-stone-aa mb-1">{t('bookingConfirmation.checkIn')}</p>
                    <p className="text-pa-dark">{formatBookingDate(data.checkIn, lang, true)}</p>
                  </div>
                  <div>
                    <p className="text-pa-stone-aa mb-1">{t('bookingConfirmation.checkOut')}</p>
                    <p className="text-pa-dark">{formatBookingDate(data.checkOut, lang, true)}</p>
                  </div>
                  <div>
                    <p className="text-pa-stone-aa mb-1">{t('bookingConfirmation.guests')}</p>
                    <p className="text-pa-dark">{data.guestsCount}</p>
                  </div>
                  <div>
                    <p className="text-pa-stone-aa mb-1">{t('bookingConfirmation.total')}</p>
                    <p className="text-pa-dark">{formatEurCents(data.totalCents, lang, t('bookingConfirmation.toConfirm'))}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-white border border-pa-sand shadow-[0_4px_24px_rgba(26,26,24,0.06)] p-6">
                <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-2">{t('bookingConfirmation.checkInInstructions')}</p>
                <p className="body-md">{data.checkInInstructions || t('bookingConfirmation.checkInDefault')}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {data.googleCalendarUrl ? (
                  <a href={data.googleCalendarUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    {t('bookingConfirmation.addToCalendar')}
                  </a>
                ) : null}
                <a
                  href={`https://wa.me/351927161771?text=${encodeURIComponent(t('bookingConfirmation.whatsappPrefill'))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => pushDL({ event: 'whatsapp_click', source: 'booking_confirmation', property_id: data.listingId })}
                  className="btn-primary"
                >
                  {t('bookingConfirmation.whatsappConcierge')}
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      <Footer />
    </div>
  );
}
