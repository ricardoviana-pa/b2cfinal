import { useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/usePageMeta';
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import PhoneInput from "@/components/booking/PhoneInput";
import { patchBookingFlow, readBookingFlow } from "@/lib/booking-flow";
import { isValidEmail, isValidPhone } from "@/lib/validation";

export default function BookingDetailsPage() {
  const { t } = useTranslation();
  usePageMeta({ title: 'Guest Details | Complete Your Booking', description: 'Enter your details to complete your Portugal Active villa reservation. Secure booking, instant confirmation.' });
  const { listingId } = useParams<{ listingId: string }>();
  const [, navigate] = useLocation();
  const initial = useMemo(() => readBookingFlow(listingId), [listingId]);
  const [form, setForm] = useState(initial.guestDetails);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const errors = useMemo(() => {
    return {
      firstName: form.firstName.trim() ? "" : t('errors.firstNameRequired'),
      lastName: form.lastName.trim() ? "" : t('errors.lastNameRequired'),
      email: isValidEmail(form.email) ? "" : t('errors.emailInvalid'),
      phone: isValidPhone(form.phone) ? "" : t('errors.phoneInvalid'),
      country: form.country.trim() ? "" : t('errors.countryRequired'),
    };
  }, [form, t]);

  const isValid = Object.values(errors).every((value) => !value);

  return (
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <section className="section-padding">
        <div className="container max-w-3xl">
          <p className="text-[11px] font-medium tracking-[0.12em] uppercase text-[#8B7355] mb-3">{t('bookingDetails.overline')}</p>
          <h1 className="headline-lg text-[#1A1A18] mb-3">{t('bookingDetails.title')}</h1>
          <p className="body-md mb-8">{t('bookingDetails.subtitle')}</p>

          <div className="rounded-lg bg-white border border-[#E8E4DC] shadow-[0_4px_24px_rgba(0,0,0,0.08)] p-6 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <input
                  value={form.firstName}
                  onBlur={() => setTouched((prev) => ({ ...prev, firstName: true }))}
                  onChange={(e) => setForm((prev) => ({ ...prev, firstName: e.target.value }))}
                  placeholder={t('bookingDetails.firstNamePh')}
                  className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
                />
                {touched.firstName && errors.firstName ? <p className="text-[12px] text-[#DC2626] mt-2">{errors.firstName}</p> : null}
              </div>
              <div>
                <input
                  value={form.lastName}
                  onBlur={() => setTouched((prev) => ({ ...prev, lastName: true }))}
                  onChange={(e) => setForm((prev) => ({ ...prev, lastName: e.target.value }))}
                  placeholder={t('bookingDetails.lastNamePh')}
                  className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
                />
                {touched.lastName && errors.lastName ? <p className="text-[12px] text-[#DC2626] mt-2">{errors.lastName}</p> : null}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <input
                  value={form.email}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder={t('bookingDetails.emailPh')}
                  className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
                />
                {touched.email && errors.email ? <p className="text-[12px] text-[#DC2626] mt-2">{errors.email}</p> : null}
              </div>
              <div>
                <PhoneInput value={form.phone} onChange={(value) => setForm((prev) => ({ ...prev, phone: value }))} />
                {touched.phone && errors.phone ? <p className="text-[12px] text-[#DC2626] mt-2">{errors.phone}</p> : null}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <input
                value={form.country}
                onBlur={() => setTouched((prev) => ({ ...prev, country: true }))}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                placeholder={t('bookingDetails.countryPh')}
                className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
              />
              <input
                value={form.estimatedArrivalTime}
                onChange={(e) => setForm((prev) => ({ ...prev, estimatedArrivalTime: e.target.value }))}
                placeholder={t('bookingDetails.arrivalTimePh')}
                className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
              />
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <input
                type="number"
                min={1}
                value={form.adultsCount}
                onChange={(e) => setForm((prev) => ({ ...prev, adultsCount: Math.max(1, Number(e.target.value) || 1) }))}
                placeholder={t('bookingDetails.adultsPh')}
                className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
              />
              <input
                type="number"
                min={0}
                value={form.childrenCount}
                onChange={(e) => setForm((prev) => ({ ...prev, childrenCount: Math.max(0, Number(e.target.value) || 0) }))}
                placeholder={t('bookingDetails.childrenPh')}
                className="h-[52px] rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
              />
            </div>

            <textarea
              value={form.specialRequests}
              onChange={(e) => setForm((prev) => ({ ...prev, specialRequests: e.target.value }))}
              placeholder={t('bookingDetails.specialRequestsPh')}
              rows={4}
              className="rounded-md border border-[#E8E4DC] bg-white px-3 py-2 text-[13px] text-[#1A1A18] placeholder:text-[#9E9A90] focus:ring-2 focus:ring-[#8B7355] font-light w-full"
            />

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <Link href={`/booking/${listingId}/summary`} className="btn-ghost">{t('bookingDetails.backToSummary')}</Link>
              <button
                type="button"
                disabled={!isValid}
                onClick={() => {
                  patchBookingFlow(listingId, { guestDetails: form });
                  navigate(`/booking/${listingId}/confirm`);
                }}
                className="rounded-full bg-[#1A1A18] text-[#FAFAF7] text-[11px] font-medium tracking-[0.12em] uppercase px-8 py-3.5 min-h-[48px] hover:bg-[#333330] disabled:opacity-50"
              >
                {t('bookingDetails.continueToConfirm')}
              </button>
            </div>
          </div>
        </div>
      </section>
      <Footer />
    </div>
  );
}
