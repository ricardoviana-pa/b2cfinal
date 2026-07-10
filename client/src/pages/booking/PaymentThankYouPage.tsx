import { useEffect, useRef, useState } from "react";
import { useParams, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Lock, ShieldCheck, BadgeCheck, Headphones, Clock, CheckCircle2 } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { fetchReservation, readThankYou } from "@/lib/booking-api";
import { pushPurchaseOnce } from "@/lib/datalayer";
import { formatEurCents, formatBookingDate } from "@/lib/format";
import { cancellationPolicyText } from "@/lib/cancellation";

const CONCIERGE_EMAIL = "info@portugalactive.com";

type PaymentMethod = "paypal" | "klarna";

function PayPalLogo() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontWeight: 700,
        fontStyle: "italic",
        fontSize: "16px",
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
      aria-label="PayPal"
    >
      <span style={{ color: "#003087" }}>Pay</span>
      <span style={{ color: "#009cde" }}>Pal</span>
    </span>
  );
}

function KlarnaLogo() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ffb3c7",
        borderRadius: "6px",
        padding: "4px 8px",
        lineHeight: 1,
      }}
      aria-label="Klarna"
    >
      <span style={{ color: "#17120f", fontWeight: 700, fontSize: "13px" }}>Klarna</span>
    </span>
  );
}

export default function PaymentThankYouPage() {
  const { t } = useTranslation();
  usePageMeta({
    title: t("paymentThankYou.pageTitle"),
    description: t("paymentThankYou.pageDescription"),
  });

  const { id } = useParams<{ id: string }>();
  const searchParams = new URLSearchParams(useSearch());

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const purchaseFiredRef = useRef(false);

  // Prefer the payload stashed by the return page (Open-API reservations aren't
  // reliably readable via GET right after creation). Fall back to the server
  // fetch only when the stash is missing (e.g. a later direct visit).
  const stash = readThankYou(id);
  const method: PaymentMethod =
    stash?.method ?? (searchParams.get("method") === "klarna" ? "klarna" : "paypal");

  useEffect(() => {
    if (stash) {
      setData(stash);
      setLoading(false);
      return;
    }
    let active = true;
    fetchReservation(id)
      .then((response) => {
        if (active) setData(response);
      })
      .catch((err: any) => {
        if (active) setError(err?.message || t("bookingConfirmation.loadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Report purchase once per transaction — pushPurchaseOnce persists the guard
  // in localStorage, so refreshes and the earlier return-page push can't double-fire.
  useEffect(() => {
    if (!data || purchaseFiredRef.current) return;
    purchaseFiredRef.current = true;
    pushPurchaseOnce(data.confirmationCode, {
      event: "purchase",
      ecommerce: {
        transaction_id: data.confirmationCode,
        value: data.totalCents != null ? data.totalCents / 100 : undefined,
        currency: data.currency || "EUR",
        items: [
          {
            item_id: data.listingId ? `PROP-${data.listingId}` : data.listingName,
            item_name: data.listingName,
            item_category: "villa",
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
        <div className="container max-w-[1080px]">
          {loading ? (
            <div className="mx-auto max-w-[420px] rounded-lg bg-pa-warm border border-pa-sand h-[520px] animate-pulse" />
          ) : error ? (
            <div className="mx-auto max-w-[420px] rounded-lg bg-white border border-destructive p-5 text-destructive">
              {error}
            </div>
          ) : data ? (
            <ThankYouCard data={data} method={method} />
          ) : null}
        </div>
      </section>
      <Footer />
    </div>
  );
}

function ThankYouCard({ data, method }: { data: any; method: PaymentMethod }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const currency = data.currency || "EUR";
  const checkInLabel = formatBookingDate(data.checkIn, lang, true);
  const checkOutLabel = formatBookingDate(data.checkOut, lang, true);

  const subject = t("paymentThankYou.mailSubject", { code: data.confirmationCode });
  const body = t("paymentThankYou.mailBody", {
    code: data.confirmationCode,
    property: data.listingName,
    checkIn: checkInLabel,
    checkOut: checkOutLabel,
  });
  const conciergeHref = `mailto:${CONCIERGE_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;

  const hasBreakdown = data.nightlyRateCents != null && data.nights != null;

  return (
    <div className="mx-auto max-w-[420px] lg:max-w-[1080px]">
      <div className="overflow-hidden rounded-lg border border-pa-sand bg-white shadow-[0_4px_24px_rgba(26,26,24,0.06)] lg:grid lg:grid-cols-[340px_1fr]">
        {/* ---- Dark header / left panel ---- */}
        <div className="flex flex-col items-center justify-center bg-pa-dark px-[30px] py-[40px] text-center text-white lg:items-start lg:px-[44px] lg:py-[56px] lg:text-left">
          <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white/10 lg:mb-[26px] lg:h-[58px] lg:w-[58px]">
            <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="headline-md mb-[9px] text-white">
            {t("paymentThankYou.title", { defaultValue: "Booking Confirmed" })}
          </h1>
          <div className="text-[13px] tracking-[0.08em] text-white/50 tabular-nums">
            {data.confirmationCode}
          </div>
          <p className="mt-[22px] hidden border-t border-white/10 pt-[22px] text-[13px] leading-relaxed text-white/60 lg:block lg:max-w-[240px]">
            {t("paymentThankYou.reassurance", {
              defaultValue:
                "A confirmation email is on its way. Your concierge will be in touch within 24 hours to help plan your stay.",
            })}
          </p>
        </div>

        {/* ---- Body / right panel ---- */}
        <div className="px-[26px] py-[28px] lg:px-[46px] lg:py-[44px]">
          <div className="lg:grid lg:grid-cols-2 lg:gap-x-[40px]">
            {/* Left column */}
            <div className="min-w-0">
              {data.guestEmail ? (
                <div className="mb-[26px] rounded-lg border border-pa-sand bg-pa-warm px-[14px] py-3 text-center text-[12.5px] leading-snug text-pa-earth">
                  {t("paymentThankYou.emailSent", { defaultValue: "Confirmation email sent to" })}{" "}
                  <a
                    href={`mailto:${data.guestEmail}`}
                    className="font-medium text-pa-gold no-underline"
                  >
                    {data.guestEmail}
                  </a>
                </div>
              ) : null}

              <h2 className="headline-sm mb-1.5 text-pa-dark">
                {data.listingName}
              </h2>
              {data.location ? (
                <p className="mb-[22px] text-[13px] text-pa-earth">{data.location}</p>
              ) : (
                <div className="mb-[22px]" />
              )}

              <div className="grid grid-cols-3 gap-3 border-b border-pa-sand pb-[22px]">
                <MetaItem k={t("bookingConfirmation.checkIn")} v={checkInLabel} />
                <MetaItem k={t("bookingConfirmation.checkOut")} v={checkOutLabel} />
                <MetaItem k={t("bookingConfirmation.guests")} v={String(data.guestsCount)} />
              </div>

              {data.guestName ? (
                <div className="mt-[22px] border-b border-pa-sand pb-[22px]">
                  <div className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-[9px]">
                    {t("paymentThankYou.bookedBy", { defaultValue: "Booked by" })}
                  </div>
                  <div className="mb-0.5 text-[14.5px] font-medium text-pa-dark">
                    {data.guestName}
                  </div>
                  <div className="text-[12.5px] text-pa-earth">
                    {[data.guestEmail, data.guestPhone].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Right column */}
            <div className="mt-[22px] min-w-0 lg:mt-0">
              {/* Price summary */}
              <div className="rounded-lg bg-pa-warm px-[18px] pb-4 pt-[18px]">
                <div className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-[14px]">
                  {t("paymentThankYou.priceSummary", { defaultValue: "Price summary" })}
                </div>
                {hasBreakdown ? (
                  <div className="mb-2.5 flex items-baseline justify-between text-[13.5px] text-pa-earth">
                    <span>
                      {formatEurCents(data.nightlyRateCents, lang)} ×{" "}
                      {t("paymentThankYou.nights", {
                        count: data.nights,
                        defaultValue: "{{count}} nights",
                      })}
                    </span>
                    <span className="tabular-nums">
                      {formatEurCents(data.nightlyRateCents * data.nights, lang)}
                    </span>
                  </div>
                ) : null}
                {data.cleaningFeeCents != null ? (
                  <div className="mb-2.5 flex items-baseline justify-between text-[13.5px] text-pa-earth">
                    <span>
                      {t("paymentThankYou.cleaning", { defaultValue: "Home preparation service" })}
                    </span>
                    <span className="tabular-nums">
                      {formatEurCents(data.cleaningFeeCents, lang)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t border-pa-sand pt-[13px]">
                  <span className="text-[15px] font-medium text-pa-dark">
                    {t("paymentThankYou.totalPaid", { defaultValue: "Total paid" })}
                  </span>
                  <span className="text-[19px] font-medium tabular-nums text-pa-dark">
                    {formatEurCents(data.totalCents, lang)}
                  </span>
                </div>
                {data.cancellationPolicy?.length ? (
                  <div className="mt-[11px] flex items-center gap-1.5 text-[11.5px] text-pa-earth">
                    <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    {cancellationPolicyText(data.cancellationPolicy[0], data.checkIn, t, lang)}
                  </div>
                ) : null}
              </div>

              {/* Paid row */}
              <div className="mt-[22px] flex items-center gap-3 rounded-lg border border-pa-sand px-4 py-3.5">
                <div className="flex w-[46px] shrink-0 items-center justify-center">
                  {method === "klarna" ? <KlarnaLogo /> : <PayPalLogo />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-pa-dark">
                    {method === "klarna"
                      ? t("paymentThankYou.paidKlarna", { defaultValue: "Paying with Klarna" })
                      : t("paymentThankYou.paidPaypal", { defaultValue: "Paid in full with PayPal" })}
                  </div>
                  <div className="mt-0.5 text-[11.5px] tabular-nums text-pa-earth">
                    {method === "klarna"
                      ? t("paymentThankYou.klarnaSub", { defaultValue: "Interest-free instalments" })
                      : `PayPal · ${data.guestEmail || ""}`}
                  </div>
                </div>
                <div className="whitespace-nowrap text-[14.5px] font-medium tabular-nums text-pa-dark">
                  {formatEurCents(data.totalCents, lang)}
                </div>
              </div>
            </div>

            {/* CTA — full width beneath both columns */}
            <div className="mt-[22px] lg:col-span-2 lg:mt-1">
              <a href={conciergeHref} className="btn-primary w-full gap-2.5">
                <Headphones className="h-[17px] w-[17px]" strokeWidth={1.8} />
                {t("paymentThankYou.cta", {
                  defaultValue: "Need Help? Talk With Your Concierge",
                })}
              </a>
              <p className="mt-3 text-center text-[11.5px] leading-relaxed text-pa-earth">
                {t("paymentThankYou.ctaNote", {
                  defaultValue:
                    "Your dedicated concierge will reach out within 24 hours to help plan your stay.",
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Trust badges */}
      <div className="mx-auto mt-[26px] grid max-w-[420px] grid-cols-2 gap-x-6 gap-y-3.5 md:grid-cols-4 lg:max-w-[1080px]">
        <TrustItem icon={<Lock className="h-[15px] w-[15px] text-pa-gold md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustSecure", { defaultValue: "Secure booking" })}
        </TrustItem>
        <TrustItem icon={<ShieldCheck className="h-[15px] w-[15px] text-pa-gold md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustRate", { defaultValue: "Best rate guaranteed" })}
        </TrustItem>
        <TrustItem icon={<BadgeCheck className="h-[15px] w-[15px] text-pa-gold md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustFees", { defaultValue: "No booking fees" })}
        </TrustItem>
        <TrustItem icon={<Headphones className="h-[15px] w-[15px] text-pa-gold md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustConcierge", { defaultValue: "Concierge included" })}
        </TrustItem>
      </div>
    </div>
  );
}

function MetaItem({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium tracking-[0.12em] uppercase text-pa-gold mb-[7px]">
        {k}
      </div>
      <div className="text-[14.5px] font-medium tabular-nums text-pa-dark lg:text-[16px]">{v}</div>
    </div>
  );
}

function TrustItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-pa-earth md:flex-col md:gap-1.5 md:text-center">
      {icon}
      {children}
    </div>
  );
}
