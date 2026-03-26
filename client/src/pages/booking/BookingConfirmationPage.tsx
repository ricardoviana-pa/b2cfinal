import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { useTranslation } from 'react-i18next';
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { fetchReservation } from "@/lib/booking-api";

function formatMoney(cents: number | null, currency = "EUR", t?: any): string {
  if (cents == null) return t?.('bookingConfirmation.toConfirm') || "Por confirmar";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export default function BookingConfirmationPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <section className="section-padding">
        <div className="container max-w-3xl">
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-3">{t('bookingConfirmation.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-3">{t('bookingConfirmation.title')}</h1>
          <p className="body-md mb-8">{t('bookingConfirmation.subtitle')}</p>

          {loading ? (
            <div className="rounded-lg bg-[#F5F1EB] border border-[#E8E4DC] h-[240px] animate-pulse" />
          ) : error ? (
            <div className="rounded-lg bg-white border border-[#DC2626] p-5 text-[#DC2626]">{error}</div>
          ) : data ? (
            <div className="space-y-6">
              <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-6">
                <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-2">{t('bookingConfirmation.reference')}</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(data.confirmationCode)}
                  className="headline-md text-[#1A1A18] hover:text-[#8B7355] transition-colors"
                >
                  {data.confirmationCode}
                </button>
                <p className="body-sm mt-2">{t('common.clickToCopy')}</p>
              </div>

              <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-6">
                <div className="grid md:grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <p className="text-[#9E9A90] mb-1">{t('bookingConfirmation.accommodation')}</p>
                    <p className="text-[#1A1A18]">{data.listingName}</p>
                  </div>
                  <div>
                    <p className="text-[#9E9A90] mb-1">{t('bookingConfirmation.status')}</p>
                    <p className="text-[#1A1A18]">{data.status}</p>
                  </div>
                  <div>
                    <p className="text-[#9E9A90] mb-1">{t('bookingConfirmation.checkIn')}</p>
                    <p className="text-[#1A1A18]">{data.checkIn}</p>
                  </div>
                  <div>
                    <p className="text-[#9E9A90] mb-1">{t('bookingConfirmation.checkOut')}</p>
                    <p className="text-[#1A1A18]">{data.checkOut}</p>
                  </div>
                  <div>
                    <p className="text-[#9E9A90] mb-1">{t('bookingConfirmation.guests')}</p>
                    <p className="text-[#1A1A18]">{data.guestsCount}</p>
                  </div>
                  <div>
                    <p className="text-[#9E9A90] mb-1">{t('bookingConfirmation.total')}</p>
                    <p className="text-[#1A1A18]">{formatMoney(data.totalCents, data.currency, t)}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-6">
                <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-2">{t('bookingConfirmation.checkInInstructions')}</p>
                <p className="body-md">{data.checkInInstructions || t('bookingConfirmation.checkInDefault')}</p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {data.googleCalendarUrl ? (
                  <a href={data.googleCalendarUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost">
                    {t('bookingConfirmation.addToCalendar')}
                  </a>
                ) : null}
                <a
                  href="https://wa.me/351927161771?text=Hi%2C%20I%20need%20help%20with%20my%20booking"
                  target="_blank"
                  rel="noopener noreferrer"
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
