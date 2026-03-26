import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams, useSearch } from "wouter";
import { useTranslation } from 'react-i18next';
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import AvailabilityCalendar from "@/components/booking/AvailabilityCalendar";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import RatePlanCards from "@/components/booking/RatePlanCards";
import { fetchCalendarWindow, fetchListing, fetchQuote, fetchRatePlans, type BookingListing, type BookingQuoteResponse } from "@/lib/booking-api";
import { patchBookingFlow, readBookingFlow } from "@/lib/booking-flow";

export default function BookingSummaryPage() {
  const { t } = useTranslation();
  const { listingId } = useParams<{ listingId: string }>();
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const stored = useMemo(() => readBookingFlow(listingId), [listingId]);
  const [listing, setListing] = useState<BookingListing | null>(null);
  const [quote, setQuote] = useState<BookingQuoteResponse | null>(null);
  const [metaRatePlans, setMetaRatePlans] = useState<any[]>([]);
  const [days, setDays] = useState<any[]>([]);
  const [checkIn, setCheckIn] = useState(params.get("checkIn") || stored.checkIn);
  const [checkOut, setCheckOut] = useState(params.get("checkOut") || stored.checkOut);
  const [guests, setGuests] = useState(Number(params.get("guests") || stored.guests || 2));
  const [selectedRatePlanId, setSelectedRatePlanId] = useState<string | undefined>(stored.ratePlanId);
  const [selectedRatePlanType, setSelectedRatePlanType] = useState<"flexible" | "non_refundable" | "other" | undefined>(stored.ratePlanType);
  /** Only set when the guest picks a plan — avoids a duplicate quote fetch when the API returns the default `ratePlanId`. */
  const [quoteRatePlanId, setQuoteRatePlanId] = useState<string | undefined>(undefined);
  const skipDateResetRef = useRef(true);
  const [loading, setLoading] = useState(true);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [listingData, calendarData, ratePlansData] = await Promise.all([
          fetchListing(listingId),
          fetchCalendarWindow(listingId, 3),
          fetchRatePlans(listingId),
        ]);
        if (!active) return;
        setListing(listingData);
        setDays(calendarData);
        setMetaRatePlans(ratePlansData.ratePlans || []);
        patchBookingFlow(listingId, { listingName: listingData.name });
      } catch (err: any) {
        if (!active) return;
        setError(err?.message || t('booking.loadError'));
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [listingId]);

  /** After first paint, when dates/guests change, request the default quote again (clear plan override). */
  useEffect(() => {
    if (skipDateResetRef.current) {
      skipDateResetRef.current = false;
      return;
    }
    setQuoteRatePlanId(undefined);
  }, [checkIn, checkOut, guests]);

  useEffect(() => {
    if (!checkIn || !checkOut || guests < 1) return;
    let active = true;
    setQuoteLoading(true);
    setError("");
    fetchQuote(listingId, {
      checkIn,
      checkOut,
      guests,
      ratePlanId: quoteRatePlanId,
    })
      .then((data) => {
        if (!active) return;
        setQuote(data);
        const resolvedPlanId = quoteRatePlanId || data.ratePlanId || undefined;
        setSelectedRatePlanId(resolvedPlanId);
        patchBookingFlow(listingId, {
          checkIn,
          checkOut,
          guests,
          ratePlanId: resolvedPlanId,
          ratePlanType: selectedRatePlanType,
          quoteId: data.quoteId,
        });
      })
      .catch((err: any) => {
        if (!active) return;
        setQuote(null);
        setError(err?.message || t('booking.priceError'));
      })
      .finally(() => {
        if (active) setQuoteLoading(false);
      });

    return () => {
      active = false;
    };
  }, [listingId, checkIn, checkOut, guests, quoteRatePlanId]);

  const ratePlanOptions = quote?.ratePlanOptions?.length ? quote.ratePlanOptions : metaRatePlans.map((plan) => ({
    ratePlanId: plan.id,
    name: plan.name,
    type: plan.type,
    cancellationPolicy: plan.cancellationPolicy,
    total: quote?.totalAfterTax || 0,
  }));

  const canContinue = !!quote && !!checkIn && !!checkOut;

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <section className="section-padding">
        <div className="container max-w-6xl">
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-3">{t('booking.bookingOverline')}</p>
          <div className="flex items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="headline-lg text-[#1A1A18] mb-3">{t('booking.summaryPageTitle')}</h1>
              <p className="body-md max-w-2xl">{t('booking.summaryPageSubtitle')}</p>
            </div>
            <Link href={`/homes/${listingId}`} className="btn-ghost">{t('booking.backToProperty')}</Link>
          </div>

          {loading ? (
            <div className="rounded-lg bg-[#F5F1EB] border border-[#E8E4DC] h-[240px] animate-pulse" />
          ) : error && !listing ? (
            <div className="rounded-lg bg-white border border-[#DC2626] p-5 text-[#DC2626]">{error}</div>
          ) : listing ? (
            <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
              <div className="space-y-6">
                <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-5">
                  <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-2">{listing.locality}</p>
                  <h2 className="headline-sm text-[#1A1A18] mb-3">{listing.name}</h2>
                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-2 block">{t('booking.guestsLabel')}</label>
                      <select
                        value={guests}
                        onChange={(e) => setGuests(Number(e.target.value))}
                        className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
                      >
                        {Array.from({ length: Math.max(listing.maxGuests, 1) }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>{t('search.guestsCount', { count: n })}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-2 block">{t('booking.travelWindow')}</label>
                      <div className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] flex items-center">
                        {checkIn && checkOut ? `${checkIn} → ${checkOut}` : t('booking.selectDatesBelow')}
                      </div>
                    </div>
                  </div>
                </div>

                <AvailabilityCalendar
                  days={days}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  onSelectRange={({ checkIn: nextIn, checkOut: nextOut }) => {
                    setCheckIn(nextIn);
                    setCheckOut(nextOut);
                  }}
                />

                {ratePlanOptions.length > 1 ? (
                  <RatePlanCards
                    options={ratePlanOptions}
                    selectedRatePlanId={selectedRatePlanId}
                    onSelect={(ratePlanId, type) => {
                      setSelectedRatePlanType(type);
                      setQuoteRatePlanId(ratePlanId);
                    }}
                  />
                ) : null}
              </div>

              <div className="space-y-6">
                {error ? (
                  <div className="rounded-lg bg-white border border-[#DC2626] p-5 text-[#DC2626]">{error}</div>
                ) : null}

                <PriceBreakdown
                  loading={quoteLoading}
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

                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => {
                    patchBookingFlow(listingId, {
                      listingName: listing.name,
                      checkIn,
                      checkOut,
                      guests,
                      ratePlanId: selectedRatePlanId,
                      ratePlanType: selectedRatePlanType,
                      quoteId: quote?.quoteId,
                    });
                    navigate(`/booking/${listingId}/details`);
                  }}
                  className="w-full rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 min-h-[48px] hover:bg-[#333330] disabled:opacity-50"
                >
                  {t('booking.continueGuestDetails')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>
      <Footer />
    </div>
  );
}
