import { useEffect, useRef, useState } from "react";
import { useParams, useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { Lock, ShieldCheck, Heart, Headphones, Clock, CheckCircle2 } from "lucide-react";
import { usePageMeta } from "@/hooks/usePageMeta";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { fetchReservation } from "@/lib/booking-api";
import { pushEcommerce } from "@/lib/datalayer";

const CONCIERGE_EMAIL = "info@portugalactive.com";

type PaymentMethod = "paypal" | "klarna";

function formatMoney(cents: number | null | undefined, currency = "EUR"): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** "22 Jun 2026" — locale-aware, zero-padded day. Accepts ISO or YYYY-MM-DD. */
function formatDateDisplay(dateStr: string, locale = "en-GB"): string {
  if (!dateStr) return "";
  const iso = dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return dateStr;
  const day = String(date.getDate()).padStart(2, "0");
  const monthYear = date.toLocaleDateString(locale, { month: "short", year: "numeric" });
  return `${day} ${monthYear}`;
}

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
    title: "Booking Confirmed | Thank You",
    description:
      "Your Portugal Active villa booking is confirmed. Check your email for details and prepare for your stay.",
  });

  const { id } = useParams<{ id: string }>();
  const searchParams = new URLSearchParams(useSearch());
  const method: PaymentMethod = searchParams.get("method") === "klarna" ? "klarna" : "paypal";

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
        if (active) setError(err?.message || t("bookingConfirmation.loadError"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // Fire purchase event once on data load — parity with BookingConfirmationPage (deduped by transaction_id).
  useEffect(() => {
    if (!data || purchaseFiredRef.current) return;
    purchaseFiredRef.current = true;
    pushEcommerce({
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
    <div className="min-h-screen bg-[#FAFAF7]">
      <Header />
      <section className="section-padding">
        <div className="container max-w-[1080px]">
          {loading ? (
            <div className="mx-auto max-w-[420px] rounded-[18px] bg-[#F5F1EB] border border-[#E8E4DC] h-[520px] animate-pulse" />
          ) : error ? (
            <div className="mx-auto max-w-[420px] rounded-lg bg-white border border-[#DC2626] p-5 text-[#DC2626]">
              {error}
            </div>
          ) : data ? (
            <ThankYouCard data={data} method={method} t={t} />
          ) : null}
        </div>
      </section>
      <Footer />
    </div>
  );
}

function ThankYouCard({ data, method, t }: { data: any; method: PaymentMethod; t: any }) {
  const currency = data.currency || "EUR";
  const checkInLabel = formatDateDisplay(data.checkIn);
  const checkOutLabel = formatDateDisplay(data.checkOut);

  const subject = `Reservation ${data.confirmationCode} - Information Request`;
  const body =
    `Hello,\n\nI have a question about my reservation ${data.confirmationCode} ` +
    `(${data.listingName}, ${checkInLabel}–${checkOutLabel}).\n\n`;
  const conciergeHref = `mailto:${CONCIERGE_EMAIL}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;

  const hasBreakdown = data.nightlyRateCents != null && data.nights != null;

  return (
    <div className="mx-auto max-w-[420px] lg:max-w-[1080px]">
      <div className="overflow-hidden rounded-[18px] lg:rounded-[24px] border border-[#E8E4DC] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04),0_18px_50px_rgba(26,26,24,0.07)] lg:grid lg:grid-cols-[340px_1fr]">
        {/* ---- Dark header / left panel ---- */}
        <div className="flex flex-col items-center justify-center bg-[#161513] px-[30px] py-[40px] text-center text-white lg:items-start lg:bg-gradient-to-b lg:from-[#1d1b18] lg:to-[#131211] lg:px-[44px] lg:py-[56px] lg:text-left">
          <div className="mb-5 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#2a2825] lg:mb-[26px] lg:h-[58px] lg:w-[58px]">
            <CheckCircle2 className="h-7 w-7 text-white" strokeWidth={2} />
          </div>
          <h1 className="mb-[9px] text-[21px] font-medium leading-tight lg:text-[30px]">
            {t("paymentThankYou.title", { defaultValue: "Booking Confirmed" })}
          </h1>
          <div className="text-[13px] tracking-[0.08em] text-[#a7a39a] tabular-nums">
            {data.confirmationCode}
          </div>
          <p className="mt-[22px] hidden border-t border-[#322f2b] pt-[22px] text-[13px] leading-relaxed text-[#8f8b82] lg:block lg:max-w-[240px]">
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
                <div className="mb-[26px] rounded-[10px] border border-[#d8e7df] bg-[#eef5f0] px-[14px] py-3 text-center text-[12.5px] leading-snug text-[#3d6b54]">
                  {t("paymentThankYou.emailSent", { defaultValue: "Confirmation email sent to" })}{" "}
                  <a
                    href={`mailto:${data.guestEmail}`}
                    className="font-semibold text-[#2f7d5b] no-underline"
                  >
                    {data.guestEmail}
                  </a>
                </div>
              ) : null}

              <h2 className="mb-1.5 text-[19px] font-semibold leading-tight text-[#1A1A18] lg:text-[24px]">
                {data.listingName}
              </h2>
              {data.location ? (
                <p className="mb-[22px] text-[13px] text-[#6b6860]">{data.location}</p>
              ) : (
                <div className="mb-[22px]" />
              )}

              <div className="grid grid-cols-3 gap-3 border-b border-[#E8E4DC] pb-[22px]">
                <MetaItem k={t("bookingConfirmation.checkIn")} v={checkInLabel} />
                <MetaItem k={t("bookingConfirmation.checkOut")} v={checkOutLabel} />
                <MetaItem k={t("bookingConfirmation.guests")} v={String(data.guestsCount)} />
              </div>

              {data.guestName ? (
                <div className="mt-[22px] border-b border-[#E8E4DC] pb-[22px]">
                  <div className="mb-[9px] text-[10px] font-semibold uppercase tracking-[0.09em] text-[#6b6860]">
                    {t("paymentThankYou.bookedBy", { defaultValue: "Booked by" })}
                  </div>
                  <div className="mb-0.5 text-[14.5px] font-semibold text-[#1A1A18]">
                    {data.guestName}
                  </div>
                  <div className="text-[12.5px] text-[#6b6860]">
                    {[data.guestEmail, data.guestPhone].filter(Boolean).join(" · ")}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Right column */}
            <div className="mt-[22px] min-w-0 lg:mt-0">
              {/* Price summary */}
              <div className="rounded-[12px] bg-[#F5F1EB] px-[18px] pb-4 pt-[18px]">
                <div className="mb-[14px] text-[10px] font-semibold uppercase tracking-[0.09em] text-[#6b6860]">
                  {t("paymentThankYou.priceSummary", { defaultValue: "Price summary" })}
                </div>
                {hasBreakdown ? (
                  <div className="mb-2.5 flex items-baseline justify-between text-[13.5px] text-[#45433d]">
                    <span>
                      {formatMoney(data.nightlyRateCents, currency)} ×{" "}
                      {t("paymentThankYou.nights", {
                        count: data.nights,
                        defaultValue: "{{count}} nights",
                      })}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(data.nightlyRateCents * data.nights, currency)}
                    </span>
                  </div>
                ) : null}
                {data.cleaningFeeCents != null ? (
                  <div className="mb-2.5 flex items-baseline justify-between text-[13.5px] text-[#45433d]">
                    <span>
                      {t("paymentThankYou.cleaning", { defaultValue: "Final cleaning" })}
                    </span>
                    <span className="tabular-nums">
                      {formatMoney(data.cleaningFeeCents, currency)}
                    </span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t border-[#E8E4DC] pt-[13px]">
                  <span className="text-[15px] font-semibold text-[#1A1A18]">
                    {t("paymentThankYou.totalPaid", { defaultValue: "Total paid" })}
                  </span>
                  <span className="text-[19px] font-semibold tabular-nums text-[#1A1A18]">
                    {formatMoney(data.totalCents, currency)}
                  </span>
                </div>
                {data.cancellationPolicy?.length ? (
                  <div className="mt-[11px] flex items-center gap-1.5 text-[11.5px] text-[#6b6860]">
                    <Clock className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                    {data.cancellationPolicy[0]}
                  </div>
                ) : null}
              </div>

              {/* Paid row */}
              <div className="mt-[22px] flex items-center gap-3 rounded-[12px] border border-[#E8E4DC] px-4 py-3.5">
                <div className="flex w-[46px] shrink-0 items-center justify-center">
                  {method === "klarna" ? <KlarnaLogo /> : <PayPalLogo />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-[#1A1A18]">
                    {method === "klarna"
                      ? t("paymentThankYou.paidKlarna", { defaultValue: "Paying with Klarna" })
                      : t("paymentThankYou.paidPaypal", { defaultValue: "Paid in full with PayPal" })}
                  </div>
                  <div className="mt-0.5 text-[11.5px] tabular-nums text-[#6b6860]">
                    {method === "klarna"
                      ? t("paymentThankYou.klarnaSub", { defaultValue: "Interest-free instalments" })
                      : `PayPal · ${data.guestEmail || ""}`}
                  </div>
                </div>
                <div className="whitespace-nowrap text-[14.5px] font-semibold tabular-nums text-[#1A1A18]">
                  {formatMoney(data.totalCents, currency)}
                </div>
              </div>
            </div>

            {/* CTA — full width beneath both columns */}
            <div className="mt-[22px] lg:col-span-2 lg:mt-1">
              <a
                href={conciergeHref}
                className="flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[12px] bg-[#1A1A18] text-[14px] font-semibold tracking-[0.02em] text-white no-underline transition-[filter] hover:brightness-[1.35]"
              >
                <Headphones className="h-[17px] w-[17px]" strokeWidth={1.8} />
                {t("paymentThankYou.cta", {
                  defaultValue: "Need Help? Talk With Your Concierge",
                })}
              </a>
              <p className="mt-3 text-center text-[11.5px] leading-relaxed text-[#6b6860]">
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
        <TrustItem icon={<Lock className="h-[15px] w-[15px] text-[#8b7355] md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustSecure", { defaultValue: "Secure booking" })}
        </TrustItem>
        <TrustItem icon={<ShieldCheck className="h-[15px] w-[15px] text-[#8b7355] md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustRate", { defaultValue: "Best rate guaranteed" })}
        </TrustItem>
        <TrustItem icon={<Heart className="h-[15px] w-[15px] text-[#8b7355] md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustCancel", { defaultValue: "Flexible cancellation" })}
        </TrustItem>
        <TrustItem icon={<Headphones className="h-[15px] w-[15px] text-[#8b7355] md:h-[18px] md:w-[18px]" strokeWidth={1.8} />}>
          {t("paymentThankYou.trustConcierge", { defaultValue: "Concierge included" })}
        </TrustItem>
      </div>
    </div>
  );
}

function MetaItem({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="mb-[7px] text-[10px] font-semibold uppercase tracking-[0.09em] text-[#6b6860]">
        {k}
      </div>
      <div className="text-[14.5px] font-medium tabular-nums text-[#1A1A18] lg:text-[16px]">{v}</div>
    </div>
  );
}

function TrustItem({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 text-[12px] text-[#6b6860] md:flex-col md:gap-1.5 md:text-center">
      {icon}
      {children}
    </div>
  );
}
