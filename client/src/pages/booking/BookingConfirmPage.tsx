import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import { createReservation, fetchQuote } from "@/lib/booking-api";
import { clearBookingFlow, readBookingFlow } from "@/lib/booking-flow";

export default function BookingConfirmPage() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Review & Confirm | Secure Your Villa', description: 'Review your booking summary and confirm your luxury villa reservation with Portugal Active.' });
  const { listingId } = useParams<{ listingId: string }>();
  const [, navigate] = useLocation();
  const flow = useMemo(() => readBookingFlow(listingId), [listingId]);
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(Boolean(flow.acceptedTerms));
  const [acceptedPolicy, setAcceptedPolicy] = useState(Boolean(flow.acceptedPolicy));
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!flow.checkIn || !flow.checkOut) return;
    fetchQuote(listingId, {
      checkIn: flow.checkIn,
      checkOut: flow.checkOut,
      guests: flow.guests,
      ratePlanId: flow.ratePlanId,
    })
      .then((data) => {
        if (active) setQuote(data);
      })
      .catch((err: any) => {
        if (active) setError(err?.message || t('bookingConfirm.validationError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listingId, flow.checkIn, flow.checkOut, flow.guests, flow.ratePlanId]);

  const cancellationTone = flow.ratePlanType === "non_refundable" ? "text-[#DC2626]" : "text-[#8B7355]";

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <section className="section-padding">
        <div className="container max-w-3xl">
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-3">{t('bookingConfirm.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-3">{t('bookingConfirm.title')}</h1>
          <p className="body-md mb-8">{t('bookingConfirm.subtitle')}</p>

          {error ? <div className="rounded-lg bg-white border border-[#DC2626] p-5 text-[#DC2626] mb-6">{error}</div> : null}

          <div className="space-y-6">
            <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-6">
              <div className="grid md:grid-cols-2 gap-4 text-[13px]">
                <div>
                  <p className="text-[#9E9A90] mb-1">{t('bookingConfirm.accommodation')}</p>
                  <p className="text-[#1A1A18]">{flow.listingName || t('bookingConfirm.defaultAccommodation')}</p>
                </div>
                <div>
                  <p className="text-[#9E9A90] mb-1">{t('bookingConfirm.dates')}</p>
                  <p className="text-[#1A1A18]">{flow.checkIn} → {flow.checkOut}</p>
                </div>
                <div>
                  <p className="text-[#9E9A90] mb-1">{t('bookingConfirm.guests')}</p>
                  <p className="text-[#1A1A18]">{flow.guests}</p>
                </div>
                <div>
                  <p className="text-[#9E9A90] mb-1">{t('bookingConfirm.rate')}</p>
                  <p className={cancellationTone}>
                    {flow.ratePlanType === "non_refundable" ? t('bookingConfirm.nonRefundable') : flow.ratePlanType === "flexible" ? t('bookingConfirm.flexible') : t('bookingConfirm.standard')}
                  </p>
                </div>
              </div>
            </div>

            <PriceBreakdown
              loading={loading}
              currency={quote?.currency || "EUR"}
              nights={quote?.nights || 0}
              baseRent={quote?.baseRent || 0}
              cleaningFee={quote?.cleaningFee || 0}
              serviceFee={quote?.serviceFee || 0}
              touristTax={quote?.touristTax || 0}
              vat={quote?.vat || 0}
              totalBeforeTax={quote?.totalBeforeTax || 0}
              totalAfterTax={quote?.totalAfterTax || 0}
            />

            <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-6 space-y-4">
              <p className={`text-[13px] ${cancellationTone}`}>
                {flow.ratePlanType === "non_refundable"
                  ? t('bookingConfirm.nonRefundableNote')
                  : t('bookingConfirm.flexibleNote')}
              </p>
              <label className="flex items-start gap-3 text-[13px] text-[#6B6860]">
                <input type="checkbox" checked={acceptedPolicy} onChange={(e) => setAcceptedPolicy(e.target.checked)} className="mt-1" />
                {t('bookingConfirm.acceptPolicy')}
              </label>
              <label className="flex items-start gap-3 text-[13px] text-[#6B6860]">
                <input type="checkbox" checked={acceptedTerms} onChange={(e) => setAcceptedTerms(e.target.checked)} className="mt-1" />
                {t('bookingConfirm.acceptTerms')}
              </label>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href={`/booking/${listingId}/details`} className="btn-ghost">{t('bookingConfirm.backToDetails')}</Link>
              <button
                type="button"
                disabled={!quote || submitting || !acceptedPolicy || !acceptedTerms}
                onClick={async () => {
                  setSubmitting(true);
                  setError("");
                  try {
                    const response = await createReservation({
                      listingId,
                      checkInDateLocalized: flow.checkIn,
                      checkOutDateLocalized: flow.checkOut,
                      guest: {
                        firstName: flow.guestDetails.firstName,
                        lastName: flow.guestDetails.lastName,
                        email: flow.guestDetails.email,
                        phone: flow.guestDetails.phone,
                      },
                      adultsCount: flow.guestDetails.adultsCount,
                      childrenCount: flow.guestDetails.childrenCount,
                      countryOfResidence: flow.guestDetails.country,
                      estimatedArrivalTime: flow.guestDetails.estimatedArrivalTime,
                      specialRequests: flow.guestDetails.specialRequests,
                      ratePlanId: flow.ratePlanId,
                      policyAccepted: acceptedPolicy,
                      termsAccepted: acceptedTerms,
                    });
                    clearBookingFlow(listingId);
                    navigate(`/booking/confirmation/${response.reservationId}`);
                  } catch (err: any) {
                    setError(err?.message || t('bookingConfirm.completionError'));
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 min-h-[48px] hover:bg-[#333330] disabled:opacity-50"
              >
                {submitting ? t('bookingConfirm.confirming') : t('bookingConfirm.confirmReservation')}
              </button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
