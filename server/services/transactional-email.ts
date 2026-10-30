import { formatQuotedMoney } from "@shared/booking-money";
/**
 * TRANSACTIONAL EMAIL SERVICE
 * Uses Resend when RESEND_API_KEY is set, otherwise logs to console (dev mode).
 */

import { Resend } from "resend";
import { isPreviewDeployment } from "../lib/preview-isolation";
import { getEmailSigner } from "@shared/concierges";
import { FUNNEL_I18N } from "./recovery-copy";
import { sanitizePropertyName } from "@shared/displayName";
import { companyLegalLine } from "@shared/company";
import { CHECKOUT_EMAIL_ORIGIN } from "../lib/checkout-email";
import { originEmailSummary, type ServerVisitOrigin } from "./visit-origin";
import { invoiceNif } from "./invoice-nif";
import {
  cancellationPolicyCopy,
  cancellationPolicyPath,
  describeCancellationPolicy,
} from "@shared/cancellationPolicy";
import {
  emailLang,
  skuNameFor,
  cleaningFeeLabel,
  INTL_TAG,
  RECOVERY_I18N,
  CONFIRMATION_I18N,
  type EmailLang,
  LEGACY_I18N,
  PAYPLAN_I18N,
  formatLisbonDay as lisbonDay,
  formatLisbonTime as lisbonTime,
  lisbonYmd,
  lisbonDaysUntil,
} from "./email-i18n";
import { sendBalanceFailedSms, sendBalanceLastCallSms } from "./sms";
import { TWO_PARTS_RULES } from "./payment-plan";
import type { CheckoutScheduledPayment } from "../../drizzle/schema";

const resendKey = process.env.RESEND_API_KEY;
const isProduction = !!resendKey;
const resend = resendKey ? new Resend(resendKey) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "Portugal Active <booking@portugalactive.com>";

/**
 * Os emails saem mesmo? Sem RESEND_API_KEY (preview, DEV) o sendEmail não
 * envia: escreve o email no log e não falha. Quem só pode dar um aviso por
 * entregue quando alguém o recebe (o alerta de nota do Guesty por gravar)
 * pergunta aqui.
 */
export function emailDeliveryConfigured(): boolean {
  return isProduction && !!resend;
}

/* ================================================================
   CORE SEND
   ================================================================ */
async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<void> {
  if (isProduction && resend) {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    console.info(`[EMAIL] Sent to ${to}: "${subject}"`);
  } else {
    console.log(`\n[EMAIL SERVICE - DEV MODE] To: ${to}${replyTo ? ` | Reply-To: ${replyTo}` : ""} | Subject: ${subject}`);
    console.log(html);
    console.log(`[EMAIL SERVICE - DEV MODE] End of email\n`);
  }
}

/* ================================================================
   TEMPLATE BASE
   ================================================================ */
function wrapTemplate(content: string, _preheader?: string, pt = false): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDFBF7;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDFBF7;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<!-- Brand band: imagem full-width com o logo real do site (fundo cozido de
     borda a borda — sem caixa possivel em dark mode) -->
<tr><td align="center" style="padding:0;">
  <img src="${BRAND_BAND_URL}" alt="Portugal Active" width="600" style="display:block;margin:0 auto;width:100%;max-width:600px;height:auto;" />
</td></tr>
<tr><td style="height:26px;background:#FFFFFF;border-left:1px solid #E8E4DC;border-right:1px solid #E8E4DC;"></td></tr>

<!-- Content -->
<tr><td style="background:#FFFFFF;border-left:1px solid #E8E4DC;border-right:1px solid #E8E4DC;border-bottom:1px solid #E8E4DC;border-radius:0 0 10px 10px;padding:0 28px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${content}
</table>
</td></tr>

<!-- Divider -->
<tr><td style="padding:30px 0 0 0;"><div style="height:1px;background:#8B7355;"></div></td></tr>

<!-- Footer -->
${brandFooter(legacyTagline(pt))}

</table>
</td></tr>
</table>
</body>
</html>`;
}

/* ================================================================
   BOOKING CONFIRMATION
   ================================================================ */
interface BookingConfirmationData {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  destination?: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  totalPrice?: number;
  confirmationCode: string;
  /** Guest language (site locale); falls back to English. */
  locale?: string | null;
  /** Policy of the booked rate (planPolicyCode) for the policy line. */
  cancellation?: EmailCancellation | null;
}

export async function sendBookingConfirmation(input: BookingConfirmationData): Promise<void> {
  const lang = emailLang(input.locale);
  const T = LEGACY_I18N[lang];
  const data = { ...input, propertyName: sanitizePropertyName(input.propertyName) };
  const firstName = (data.guestName || "").trim().split(" ")[0];
  const subject = T.confirmSubject(data.propertyName);
  const waLink = `https://wa.me/351927161771?text=${encodeURIComponent(T.whatsappMsg(data.propertyName, data.confirmationCode))}`;
  const row = (label: string, value: string, strong = false) => `<tr>
        <td style="padding:6px 0;font-family:${SANS};font-size:13px;color:${PA.stoneAA};">${label}</td>
        <td style="padding:6px 0;font-family:${strong ? SERIF : SANS};font-size:${strong ? "16px" : "14px"};color:${PA.dark};text-align:right;">${value}</td>
      </tr>`;

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:${SERIF};font-size:28px;color:${PA.dark};margin:0;font-weight:400;">${T.confirmHeadline}</h1>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:${SANS};font-size:15px;color:${PA.earth};line-height:1.6;margin:0;">${T.confirmIntro(firstName)}</p>
</td></tr>
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PA.warm};border:1px solid ${PA.sand};">
  <tr><td style="padding:20px;">
    <p style="font-family:${SERIF};font-size:20px;color:${PA.dark};margin:0 0 4px 0;">${data.propertyName}</p>
    ${data.destination ? `<p style="font-family:${SANS};font-size:12px;color:${PA.stoneAA};margin:0 0 14px 0;letter-spacing:.08em;text-transform:uppercase;">${data.destination}</p>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${row(T.checkInLabel, formatStayDate(data.checkIn, lang))}
      ${row(T.checkOutLabel, formatStayDate(data.checkOut, lang))}
      ${row(T.guestsLabel, String(data.guests))}
      ${data.totalPrice ? row(T.totalLabel, eur(data.totalPrice, lang), true) : ""}
      ${row(T.codeLabel, `<span style="color:${PA.gold};font-weight:600;">${data.confirmationCode}</span>`)}
    </table>
  </td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  ${cancellationEmailLine(data.cancellation, lang, data.checkIn)}
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:${SANS};font-size:14px;color:${PA.earth};line-height:1.6;margin:0;">${T.conciergeLine}</p>
</td></tr>
<tr><td style="padding:0 0 10px 0;text-align:center;">
  <a href="${waLink}" target="_blank" style="display:inline-block;background:${PA.dark};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:600;text-decoration:none;padding:14px 32px;letter-spacing:.06em;">${T.whatsappCta}</a>
</td></tr>
<tr><td style="padding:8px 0 0 0;">${conciergeSignature(lang, data.destination)}</td></tr>`, undefined, lang === "pt");

  await sendEmail(data.guestEmail, subject, html);
}

/* ================================================================
   BOOKING FAILURE ALERT (internal — to reservations team)
   Triggered when a booking attempt fails AFTER Stripe payment method
   was created. Guest may or may not have been charged.
   ================================================================ */
interface BookingFailureAlertData {
  quoteId: string;
  ratePlanId: string;
  ccTokenPrefix: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  propertyName?: string;
  listingId?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  totalPrice?: number;
  currency?: string;
  errorMessage: string;
  errorStatus?: number;
  durationMs?: number;
  timestamp: string;
}

const BOOKING_ALERT_EMAIL = process.env.BOOKING_ALERT_EMAIL || "booking@portugalactive.com";
/** Cópia de cada venda direta para a gestão (mudar/desligar via env). */
const SALES_COPY_EMAIL = process.env.SALES_COPY_EMAIL ?? "ricardo.viana@portugalactive.com";

/** Alerta operacional genérico para a equipa (saúde das quotes, filas, etc.).
 *  Nunca lança: um alerta não pode partir o funil que está a vigiar. */
/** Devolve true quando o email para booking@ saiu. A cópia à gestão é
 *  independente: uma falha numa não esconde nem impede a outra. */
export async function sendOpsAlert(
  subject: string,
  lines: string[],
  opts: { copyToSales?: boolean } = {},
): Promise<boolean> {
  let delivered = false;
  try {
    const html = wrapTemplate(`
<tr><td style="padding:0 0 16px 0;">
  <h1 style="font-family:Georgia,serif;font-size:22px;color:#DC2626;margin:0;font-weight:400;">${subject}</h1>
</td></tr>
${lines.map((l) => `<tr><td style="padding:0 0 10px 0;"><p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.6;margin:0;">${l}</p></td></tr>`).join("")}
<tr><td style="padding:8px 0 0 0;"><p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0;">Alerta automático · ${new Date().toISOString()}</p></td></tr>`);
    try {
      await sendEmail(BOOKING_ALERT_EMAIL, `[OPS] ${subject}`, html);
      delivered = true;
    } catch (err: any) {
      console.error(`[EMAIL] sendOpsAlert falhou: ${err?.message}`);
    }
    // Alertas com dinheiro em jogo vão também à gestão: o booking@ sozinho
    // não chega quando a caixa não é lida (spec duas partes, 3.2).
    if (opts.copyToSales && SALES_COPY_EMAIL && SALES_COPY_EMAIL !== BOOKING_ALERT_EMAIL) {
      try {
        await sendEmail(SALES_COPY_EMAIL, `[OPS] ${subject}`, html);
      } catch (err: any) {
        console.error(`[EMAIL] sendOpsAlert (copia a gestao) falhou: ${err?.message}`);
      }
    }
  } catch (err: any) {
    console.error(`[EMAIL] sendOpsAlert falhou: ${err?.message}`);
  }
  return delivered;
}

export async function sendBookingFailureAlert(data: BookingFailureAlertData): Promise<void> {
  const subject = `BOOKING FAILED — ${data.propertyName || data.listingId || "Unknown"} — ${data.guestName} — €${data.totalPrice || "?"}`;

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:22px;color:#DC2626;margin:0;font-weight:400;">Booking Attempt Failed</h1>
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#DC2626;margin:8px 0 0 0;">
    A guest tried to book and the payment may have been processed but the reservation failed. Immediate action required.
  </p>
</td></tr>

<!-- Guest Details -->
<tr><td style="padding:0 0 20px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FEF2F2;border:1px solid #FECACA;">
  <tr><td style="padding:20px;">
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Guest Information</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Name</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;font-weight:600;">${data.guestName}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Email</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">
          <a href="mailto:${data.guestEmail}" style="color:#1A1A18;">${data.guestEmail}</a>
        </td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Phone</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">
          <a href="https://wa.me/${data.guestPhone.replace(/[^0-9+]/g, "")}" style="color:#1A1A18;">${data.guestPhone}</a>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</td></tr>

<!-- Booking Details -->
<tr><td style="padding:0 0 20px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Booking Details</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Property</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.propertyName || "—"}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Listing ID</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.listingId || "—"}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Check-in / Check-out</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.checkIn || "—"} → ${data.checkOut || "—"}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Guests</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.guests || "—"}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Amount</td>
        <td style="padding:4px 0;font-family:Georgia,serif;font-size:16px;color:#DC2626;text-align:right;font-weight:600;">${data.currency || "EUR"} ${data.totalPrice ? data.totalPrice.toLocaleString() : "?"}</td>
      </tr>
    </table>
  </td></tr>
</table>
</td></tr>

<!-- Error Details -->
<tr><td style="padding:0 0 20px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF7ED;border:1px solid #FED7AA;">
  <tr><td style="padding:20px;">
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Error Details</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Quote ID</td>
        <td style="padding:4px 0;font-family:monospace;font-size:12px;color:#1A1A18;text-align:right;">${data.quoteId}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Rate Plan ID</td>
        <td style="padding:4px 0;font-family:monospace;font-size:12px;color:#1A1A18;text-align:right;">${data.ratePlanId}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Stripe PM prefix</td>
        <td style="padding:4px 0;font-family:monospace;font-size:12px;color:#1A1A18;text-align:right;">${data.ccTokenPrefix}...</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">HTTP Status</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#DC2626;text-align:right;font-weight:600;">${data.errorStatus || "Unknown"}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:13px;color:#6B6860;">Duration</td>
        <td style="padding:4px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.durationMs ? data.durationMs + "ms" : "—"}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding:8px 0 0 0;font-family:Arial,sans-serif;font-size:13px;color:#DC2626;word-break:break-word;">${data.errorMessage}</td>
      </tr>
    </table>
  </td></tr>
</table>
</td></tr>

<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#6B6860;line-height:1.6;margin:0;">
    <strong>Action required:</strong> Check Guesty and Stripe dashboards to verify if the guest was charged. If charged without a reservation, process a refund or create the reservation manually. Contact the guest proactively.
  </p>
</td></tr>

<tr><td style="padding:0 0 10px 0;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0;">
    Timestamp: ${data.timestamp} | Alert sent automatically by ${CHECKOUT_EMAIL_ORIGIN}
  </p>
</td></tr>`);

  try {
    await sendEmail(BOOKING_ALERT_EMAIL, subject, html);
  } catch (emailErr: any) {
    // Alert email must NEVER throw — log and move on
    console.error(`[EMAIL] CRITICAL: Failed to send booking failure alert to ${BOOKING_ALERT_EMAIL}: ${emailErr.message}`);
  }
}

/* ================================================================
   PRE-ARRIVAL (3 days before)
   ================================================================ */
interface PreArrivalData {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  checkIn: string;
  propertyAddress?: string;
  conciergePhone?: string;
  destination?: string | null;
  locality?: string | null;
  locale?: string | null;
}

export async function sendPreArrival(input: PreArrivalData): Promise<void> {
  const lang = emailLang(input.locale);
  const T = LEGACY_I18N[lang];
  const data = { ...input, propertyName: sanitizePropertyName(input.propertyName) };
  const firstName = (data.guestName || "").trim().split(" ")[0];
  const subject = T.arrivalSubject(data.propertyName);
  const phone = data.conciergePhone || "+351 258 358 434";

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:${SERIF};font-size:28px;color:${PA.dark};margin:0;font-weight:400;">${T.arrivalHeadline}</h1>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:${SANS};font-size:15px;color:${PA.earth};line-height:1.6;margin:0;">${T.arrivalIntro(firstName, data.propertyName, formatStayDate(data.checkIn, lang))}</p>
</td></tr>
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PA.warm};border:1px solid ${PA.sand};">
  <tr><td style="padding:20px;">
    ${data.propertyAddress ? `<p style="font-family:${SANS};font-size:14px;color:${PA.dark};margin:0 0 8px 0;"><strong>${T.addressLabel}:</strong> ${data.propertyAddress}</p>` : ""}
    <p style="font-family:${SANS};font-size:14px;color:${PA.dark};margin:0 0 8px 0;"><strong>${T.checkInLabel}:</strong> ${formatStayDate(data.checkIn, lang)}</p>
    <p style="font-family:${SANS};font-size:14px;color:${PA.dark};margin:0;"><strong>${T.conciergeLabel}:</strong> <a href="tel:${phone.replace(/\s+/g, "")}" style="color:${PA.gold};text-decoration:none;">${phone}</a></p>
  </td></tr>
</table>
</td></tr>
<tr><td style="padding:0 0 10px 0;">
  <p style="font-family:${SANS};font-size:14px;color:${PA.earth};line-height:1.6;margin:0;">${T.arrivalHelp}</p>
</td></tr>
<tr><td style="padding:8px 0 0 0;">${conciergeSignature(lang, data.destination, data.locality)}</td></tr>`, undefined, lang === "pt");

  await sendEmail(data.guestEmail, subject, html);
}

/* ================================================================
   POST-STAY
   ================================================================ */
interface PostStayData {
  guestName: string;
  guestEmail: string;
  propertyName: string;
  reviewLink?: string;
  destination?: string | null;
  locality?: string | null;
  locale?: string | null;
}

export async function sendPostStay(input: PostStayData): Promise<void> {
  const lang = emailLang(input.locale);
  const T = LEGACY_I18N[lang];
  const data = { ...input, propertyName: sanitizePropertyName(input.propertyName) };
  const firstName = (data.guestName || "").trim().split(" ")[0];
  const subject = T.postSubject(data.propertyName);
  const reviewUrl = data.reviewLink || "https://g.page/r/portugalactive/review";
  const homesUrl = `https://www.portugalactive.com/${lang}/homes`;

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:${SERIF};font-size:28px;color:${PA.dark};margin:0;font-weight:400;">${T.postHeadline}</h1>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:${SANS};font-size:15px;color:${PA.earth};line-height:1.6;margin:0;">${T.postIntro(firstName, data.propertyName)}</p>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:${SANS};font-size:14px;color:${PA.earth};line-height:1.6;margin:0;">${T.postFeedback}</p>
</td></tr>
<tr><td style="padding:0 0 16px 0;text-align:center;">
  <a href="${reviewUrl}" target="_blank" style="display:inline-block;background:${PA.dark};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:600;text-decoration:none;padding:14px 32px;letter-spacing:.06em;">${T.reviewCta}</a>
</td></tr>
<tr><td style="padding:0 0 10px 0;text-align:center;">
  <a href="${homesUrl}" target="_blank" style="display:inline-block;color:${PA.gold};font-family:${SANS};font-size:13px;text-decoration:underline;text-underline-offset:3px;">${T.exploreCta}</a>
</td></tr>
<tr><td style="padding:8px 0 0 0;">${conciergeSignature(lang, data.destination, data.locality)}</td></tr>`, undefined, lang === "pt");

  await sendEmail(data.guestEmail, subject, html);
}

/* ================================================================
   CONTACT FORM INQUIRY (internal — to the booking inbox; per the team,
   EVERYTHING guest-facing lands on booking@, one inbox to watch)
   Reply-To is set to the visitor's email so replies go directly to them.
   ================================================================ */
interface ContactInquiryData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}


const SUBJECT_LABELS: Record<string, string> = {
  "plan-my-stay": "Plan My Stay",
  "property-info": "Property Information",
  "services": "Services",
  "partnerships": "Partnerships",
  "other": "Other",
  "general": "General",
};

export async function sendContactInquiryNotification(data: ContactInquiryData): Promise<void> {
  const subjectLabel = SUBJECT_LABELS[data.subject] || data.subject;
  const emailSubject = `New enquiry: ${subjectLabel} — ${data.name}`;

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:22px;color:#1A1A18;margin:0;font-weight:400;">New contact form submission</h1>
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;margin:6px 0 0 0;">Reply to this email to respond directly to the enquirer.</p>
</td></tr>

<tr><td style="padding:0 0 20px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0 0 12px 0;text-transform:uppercase;letter-spacing:0.05em;">Enquirer</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;width:80px;">Name</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;font-weight:600;">${data.name}</td>
      </tr>
      <tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Email</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#8B7355;">
          <a href="mailto:${data.email}" style="color:#8B7355;text-decoration:none;">${data.email}</a>
        </td>
      </tr>
      ${data.phone ? `<tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Phone</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;">
          <a href="https://wa.me/${data.phone.replace(/[^0-9+]/g, "")}" style="color:#1A1A18;text-decoration:none;">${data.phone}</a>
        </td>
      </tr>` : ""}
      <tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Subject</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;">${subjectLabel}</td>
      </tr>
    </table>
  </td></tr>
</table>
</td></tr>

<tr><td style="padding:0 0 8px 0;">
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0;white-space:pre-wrap;">${data.message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
  </td></tr>
</table>
</td></tr>`);

  await sendEmail(BOOKING_NOTIFICATION_EMAIL, emailSubject, html, data.email);
}

/* ================================================================
   CHECKOUT RECOVERY — Fase 4 (spec §12/§16)
   Two-touch abandonment sequence: a gentle reminder ~1h after the
   guest leaves, and a guaranteed-price nudge ~20h in (the Guesty
   quote dies at ~23h, so the urgency is real, per spec §2).
   Every visible word follows the intent locale (9 languages, EN
   fallback): copy in recovery-copy.ts and email-i18n.ts, labels of the
   stay card as the checkout showed them, footer tagline included.
   ================================================================ */
/** Duas partes como o checkout as oferece no momento do envio (cêntimos). */
export interface RecoveryTwoParts {
  todayCents: number;
  laterCents: number;
  chargeAt: Date;
}

/** A linha das duas partes só vale com valores inteiros e positivos que somem
 *  ao cêntimo o total do cartão da estadia. Os extras pagos, a receção e o
 *  Flex não aparecem nesse cartão, por isso com eles o "hoje" e o "depois"
 *  somavam mais do que o total mostrado (parecia que as duas partes custavam
 *  mais): na dúvida, sem linha. */
export function twoPartsMatchCard(t: RecoveryTwoParts | null | undefined, cardTotal: number | null | undefined): t is RecoveryTwoParts {
  if (!t || cardTotal == null || !Number.isFinite(Number(cardTotal))) return false;
  const ok = (c: number) => Number.isSafeInteger(c) && c > 0;
  if (!ok(t.todayCents) || !ok(t.laterCents)) return false;
  if (!(t.chargeAt instanceof Date) || !Number.isFinite(t.chargeAt.getTime())) return false;
  return t.todayCents + t.laterCents === Math.round(Number(cardTotal) * 100);
}

interface CheckoutRecoveryData {
  guestEmail: string;
  guestFirstName?: string | null;
  propertyName?: string | null;
  destination?: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  total?: number | null;
  /** Quote snapshot from the intent — drives the checkout-style price breakdown */
  quote?: {
    nightlyRate?: number;
    nights?: number;
    totalNights?: number;
    cleaningFee?: number;
    taxesAndFees?: number;
    total?: number;
  } | null;
  /** Hero photo of the property (Guesty/Cloudinary URL, already sized) */
  imageUrl?: string | null;
  /** Real quote expiry — powers the "guaranteed until" line (spec: real urgency only) */
  expiresAt?: Date | null;
  resumeUrl: string;
  /** Link de opt-out dos lembretes (rodapé) */
  optoutUrl?: string | null;
  locale?: string | null;
  /** Contacto do funil (recovery-funnel.ts): 1h, 20h, 3d, 7d */
  stage: 1 | 2 | 3 | 4;
  /** Contacto 1: o hóspede parou no passo de pagamento */
  paymentStep?: boolean;
  /** Contacto 1 no pagamento: chegou a carregar em Pagar (cobrança tentada,
   *  checkout-recovery.ts). Sem isto o texto é o de quem ainda não tentou,
   *  "ficou alguma dúvida?", sem falar de cartões recusados. */
  paymentAttempted?: boolean;
  /** Contacto 1 depois de uma tentativa: o Klarna pode ser sugerido
   *  (checkout-recovery.ts decide; hoje nunca, com o país de faturação do
   *  Klarna forçado a PT). Sem isto o Klarna não é sugerido. */
  klarna?: boolean;
  /** Contacto 1 no pagamento (as duas variantes): política da tarifa
   *  (planPolicyCode), para a linha do cancelamento gratuito (só quando ainda
   *  há prazo). */
  cancellation?: EmailCancellation | null;
  /** Contacto 1 no pagamento (as duas variantes): duas partes como o checkout
   *  as oferece no envio. Ausente ou sem bater com o total do cartão: sem linha. */
  twoParts?: RecoveryTwoParts | null;
  /** Contacto 2: escassez real do calendário (só quando é verdade) */
  scarcity?: { unavailable: number; total: number } | null;
  /** Contacto 3: Flex oferecido */
  flexGift?: { until: Date; value: number; days: number } | null;
  /** Contacto 4: casas alternativas livres nas mesmas datas. Sem preço: o
   *  priceFrom do catálogo não é o preço destas datas e a unidade (noite ou
   *  pessoa) não está confirmada; o preço real vê-se na página da casa. */
  alternatives?: Array<{ name: string; imageUrl?: string; url: string; locality?: string }>;
  /** Contacto 4: link para voltar à casa original */
  propertyUrl?: string | null;
}

/* Brand tokens mirrored from client/src/index.css (@theme --color-pa-*) so the
   email reads as one system with the checkout page. */
const PA = {
  dark: "#1A1A18",
  earth: "#6B6860",
  stoneAA: "#78756F",
  sand: "#E8E4DC",
  warm: "#F5F1EB",
  gold: "#8B7355",
} as const;
/** Badge da marca (logo com fundo cozido) — imutável em dark mode dos clientes
 *  de email; a versão transparente ficava invisível/encaixotada no Gmail dark.
 *  Auto-hospedada: o CDN da plataforma original morreu a 24 ago 2026. */
const BRAND_BAND_URL = "https://www.portugalactive.com/email/brand-band.png";

/** Tagline antiga, só PT ou EN, dos emails que ainda não a pedem por língua.
 *  O email de recuperação usa RECOVERY_I18N[lang].footerTagline. */
function legacyTagline(pt: boolean): string {
  return pt ? "A privacidade de uma casa. O serviço de um hotel." : "The privacy of a home. The service of a hotel.";
}

/** Rodapé de marca partilhado: hairline dourada, badge, contactos, tagline e a
 *  identidade legal (denominação, NIPC e, quando confirmada, a sede), a mesma
 *  de shared/company.ts que o checkout e o rodapé do site mostram. */
function brandFooter(tagline: string): string {
  return `
<tr><td style="padding:30px 20px 36px;text-align:center;">
  <div style="height:1px;background:#C9A96A;opacity:.5;max-width:120px;margin:0 auto 22px;"></div>
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:.22em;color:#726D63;">PORTUGAL&nbsp;ACTIVE</div>
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#726D63;margin:14px 0 0;">
    <a href="tel:+351258358434" style="color:#726D63;text-decoration:none;">+351 258 358 434</a>
    &nbsp;·&nbsp;<a href="mailto:booking@portugalactive.com" style="color:#8B7355;text-decoration:none;">booking@portugalactive.com</a>
    &nbsp;·&nbsp;<a href="https://wa.me/351927161771" style="color:#8B7355;text-decoration:none;">WhatsApp</a>
  </p>
  <p style="font-family:Georgia,serif;font-style:italic;font-size:12.5px;color:#9E9A90;margin:10px 0 0;">${tagline}</p>
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:10px 0 0;">${companyLegalLine()}</p>
</td></tr>`;
}
/** Signature block: the region's concierge when confirmed (name, photo, "your
 *  concierge"), otherwise the brand: "Portugal Active" with "Concierge" under
 *  it. Never an invented person (Ricardo, 29 out 2026). */
function conciergeSignature(lang: EmailLang, destination?: string | null, locality?: string | null): string {
  const C = CONFIRMATION_I18N[lang];
  const signer = getEmailSigner(destination, locality);
  const photo = signer.photo
    ? `<img src="https://www.portugalactive.com${signer.photo}" alt="${signer.fullName}" width="44" height="44" style="display:block;border-radius:22px;width:44px;height:44px;object-fit:cover;margin:0 0 8px 0;" />`
    : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0 0;"><tr><td style="border-left:2px solid ${PA.gold};padding:2px 0 2px 14px;">
    ${photo}
    <p style="font-family:${SANS};font-size:12.5px;color:${PA.stoneAA};margin:0 0 5px 0;">${C.regards}</p>
    <p style="font-family:${SERIF};font-size:21px;color:${PA.dark};margin:0;letter-spacing:.2px;">${signer.name}</p>
    <p style="font-family:${SANS};font-size:10.5px;color:${PA.gold};letter-spacing:.16em;text-transform:uppercase;margin:5px 0 0 0;">${signer.brand ? C.conciergeTeam : C.yourConcierge}</p>
  </td></tr></table>`;
}

/** Site display font with the email-safe serif fallback */
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'DM Sans',Arial,Helvetica,sans-serif";

/** Policy of the booked rate, already classified (planPolicyCode). */
export interface EmailCancellation {
  policy?: unknown;
}

const escapeHtml = (v: string): string =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The booking's cancellation policy in one line — the rule of its Guesty
 *  code (shared/cancellationPolicy.ts); unknown code → "the cancellation
 *  terms of your rate" and a link to them. Never an invented rule, never
 *  Guesty's internal plan name. */
function cancellationEmailLine(c: EmailCancellation | null | undefined, lang: EmailLang, checkIn?: string | null): string {
  const copy = cancellationPolicyCopy(lang);
  const d = describeCancellationPolicy(c?.policy, { lang, checkIn });
  const link = d.known
    ? ""
    : ` <a href="${CHECKOUT_EMAIL_ORIGIN}${cancellationPolicyPath(lang)}" target="_blank" style="color:${PA.gold};text-decoration:underline;">${escapeHtml(copy.termsLink)}</a>`;
  return `<p style="font-family:${SANS};font-size:12.5px;color:${PA.earth};line-height:1.6;margin:0;"><span style="color:${PA.dark};font-weight:600;">${escapeHtml(copy.label)}</span> &middot; ${escapeHtml(d.text)}${link}</p>`;
}

/** A mesma linha, só quando ainda há cancelamento gratuito por gozar (uma
 *  tarifa reembolsável conhecida e o prazo à frente). Para um email que vende:
 *  na não reembolsável, com o prazo já passado ou sem código conhecido, nada. */
function freeCancellationEmailLine(c: EmailCancellation | null | undefined, lang: EmailLang, checkIn?: string | null): string {
  const d = describeCancellationPolicy(c?.policy, { lang, checkIn });
  return d.known && d.deadline ? cancellationEmailLine(c, lang, checkIn) : "";
}

function formatStayDate(iso: string, lang: EmailLang): string {
  try {
    return new Intl.DateTimeFormat(INTL_TAG[lang] ?? "en-GB", {
      day: "numeric",
      month: "long",
    }).format(new Date(`${iso}T12:00:00Z`));
  } catch {
    return iso;
  }
}

/** The same quoted amount and cents shown at checkout. */
function eur(amount: number, lang: EmailLang): string {
  return formatQuotedMoney(amount, INTL_TAG[lang] ?? "en-GB");
}

/** "sábado, 12 de julho às 21:45" / "Saturday, 12 July at 21:45" (Lisbon time) */
function formatGuaranteeUntil(expiresAt: Date, lang: EmailLang, atWord: string): string {
  try {
    const tag = INTL_TAG[lang] ?? "en-GB";
    const day = new Intl.DateTimeFormat(tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "Europe/Lisbon",
    }).format(expiresAt);
    const time = new Intl.DateTimeFormat(tag, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "Europe/Lisbon",
    }).format(expiresAt);
    return `${day} ${atWord} ${time}`;
  } catch {
    return "";
  }
}

export async function sendCheckoutRecovery(data: CheckoutRecoveryData): Promise<void> {
  const lang = emailLang(data.locale);
  const T = RECOVERY_I18N[lang];
  const F = FUNNEL_I18N[lang];
  const house = data.propertyName || CONFIRMATION_I18N[lang].yourHome;
  const firstName = (data.guestFirstName || "").trim().split(" ")[0];
  const greeting = firstName ? T.greetingNamed(firstName) : T.greeting;
  // Contacto 1 no passo de pagamento. Com tentativa de pagar: o texto das
  // falhas de sempre, com o Klarna só quando quem chama o sugere. Sem
  // tentativa (a maioria): "ficou alguma dúvida?", sem falar de cartões recusados.
  const atPayment = data.stage === 1 && !!data.paymentStep;
  const pay = atPayment && !!data.paymentAttempted;
  const ask = atPayment && !data.paymentAttempted;
  const klarna = pay && data.klarna === true;
  const gift = data.stage === 3 ? data.flexGift ?? null : null;
  const alts = data.stage === 4 ? (data.alternatives ?? []) : [];
  const until = data.expiresAt ? formatGuaranteeUntil(data.expiresAt, lang, T.atTime) : "";
  const timeOnly = data.expiresAt
    ? new Intl.DateTimeFormat(INTL_TAG[lang] ?? "en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Lisbon" }).format(data.expiresAt)
    : "";

  // ── Texto por contacto ──
  let subject: string, preheader: string, headline: string, body: string, personal: string, cta: string, ctaUrl: string;
  switch (data.stage) {
    case 1:
      subject = ask ? F.subject1Ask(house) : pay ? F.subject1Pay(house) : F.subject1(house);
      preheader = ask ? F.preheader1Ask : pay ? F.preheader1Pay(klarna) : F.preheader1;
      headline = ask ? F.headline1Ask : pay ? F.headline1Pay : F.headline1;
      body = ask ? F.body1Ask(greeting, house) : pay ? F.body1Pay(greeting, house, klarna) : F.body1(greeting, house);
      personal = ask ? F.personal1Ask : pay ? F.personal1Pay : F.personal1;
      cta = T.cta; ctaUrl = data.resumeUrl;
      break;
    case 2:
      subject = timeOnly ? F.subject2(house, timeOnly) : T.subject2(house);
      preheader = F.preheader2;
      headline = F.headline2;
      body = until ? F.body2(greeting, house, until) : T.body2(greeting, house);
      personal = T.closing;
      cta = T.cta; ctaUrl = data.resumeUrl;
      break;
    case 3:
      subject = F.subject3(house);
      preheader = gift ? F.preheader3Gift : F.preheader3;
      headline = F.headline3;
      body = F.body3(greeting, house);
      personal = T.closing;
      cta = gift ? F.cta3Gift : F.cta3; ctaUrl = data.resumeUrl;
      break;
    default:
      subject = alts.length ? F.subject4(house) : F.subject4None(house);
      preheader = F.preheader4;
      headline = F.headline4;
      body = alts.length ? F.body4(greeting, house) : F.body4None(greeting, house);
      personal = F.lastNote;
      cta = F.ownLink(house); ctaUrl = data.propertyUrl || data.resumeUrl;
  }

  // ── Cartão da estadia (contactos 1 a 3) ──
  const q = data.quote || {};
  const line = (label: string, value: string, strong = false) => `
      <tr>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${strong ? PA.gold : PA.earth};">${label}</td>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${strong ? PA.gold : PA.dark};text-align:right;">${value}</td>
      </tr>`;
  let priceLines = "";
  if (q.nights && q.totalNights != null) priceLines += line(`${q.nights} ${T.nightsLabel}`, eur(q.totalNights, lang));
  if (q.cleaningFee && q.cleaningFee > 0) priceLines += line(cleaningFeeLabel(lang), eur(q.cleaningFee, lang));
  if (q.taxesAndFees && q.taxesAndFees > 0) priceLines += line(T.taxesLabel, eur(q.taxesAndFees, lang));
  if (gift) priceLines += line(F.flexIncluded, `<s style="color:${PA.stoneAA};">${eur(gift.value, lang)}</s> &nbsp;${eur(0, lang)}`, true);
  const total = q.total ?? data.total;
  // Contacto 1 no pagamento, com ou sem tentativa: as duas razões para
  // reservar já, por baixo do total. Depois de uma tentativa, as duas partes
  // são também a resposta a "um limite do banco": metade hoje, no mesmo cartão.
  // O cancelamento gratuito só com prazo por gozar (nunca na não reembolsável,
  // nunca "as condições da sua tarifa"); as duas partes só como o checkout as
  // oferece agora e a bater com o total do cartão.
  const freeCancelLine = atPayment ? freeCancellationEmailLine(data.cancellation, lang, data.checkIn) : "";
  const twoParts = data.twoParts;
  const twoPartsText = atPayment && twoPartsMatchCard(twoParts, total)
    ? F.twoPartsLine(eurCents(twoParts.todayCents, lang), eurCents(twoParts.laterCents, lang), lisbonDay(twoParts.chargeAt, lang))
    : "";
  const destination = data.destination ? data.destination.charAt(0).toUpperCase() + data.destination.slice(1) : "";
  const photo = data.imageUrl
    ? `<tr><td style="border-radius:12px 12px 0 0;overflow:hidden;"><img src="${data.imageUrl}" alt="${house}" width="600" style="display:block;width:100%;height:auto;border-radius:12px 12px 0 0;" /></td></tr>`
    : "";
  const stayCard = data.stage === 4 ? "" : `
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
  ${photo}
  <tr><td style="padding:22px 24px 4px 24px;">
    <p style="font-family:${SERIF};font-size:21px;line-height:1.3;color:${PA.dark};margin:0;">${house}</p>
    ${destination ? `<p style="font-family:${SANS};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PA.stoneAA};margin:5px 0 0 0;">${destination}</p>` : ""}
    <p style="font-family:${SANS};font-size:13px;color:${PA.earth};margin:10px 0 0 0;">${formatStayDate(data.checkIn, lang)} &rarr; ${formatStayDate(data.checkOut, lang)} &nbsp;&middot;&nbsp; ${data.guests} ${T.guestsLabel}</p>
  </td></tr>
  ${priceLines ? `<tr><td style="padding:14px 24px 0 24px;"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${priceLines}</table></td></tr>` : ""}
  ${total ? `<tr><td style="padding:10px 24px 0 24px;"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${PA.sand};"><tr>
    <td style="padding:12px 0 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:${PA.dark};">${LEGACY_I18N[lang].totalLabel}</td>
    <td style="padding:12px 0 0 0;font-family:${SANS};font-size:21px;color:${PA.dark};text-align:right;">${eur(total, lang)}</td>
  </tr></table></td></tr>` : ""}
  ${until ? `<tr><td style="padding:14px 24px 0 24px;"><p style="font-family:${SANS};font-size:11.5px;color:${PA.gold};line-height:1.5;margin:0;">${T.guaranteedUntil} ${until}</p></td></tr>` : ""}
  ${freeCancelLine ? `<tr><td style="padding:12px 24px 0 24px;">${freeCancelLine}</td></tr>` : ""}
  ${twoPartsText ? `<tr><td style="padding:8px 24px 0 24px;"><p style="font-family:${SANS};font-size:12.5px;color:${PA.earth};line-height:1.6;margin:0;">${escapeHtml(twoPartsText)}</p></td></tr>` : ""}
  <tr><td style="padding:0 0 20px 0;"></td></tr>
</table>
</td></tr>`;

  // ── Blocos específicos ──
  const scarcityBlock = data.stage === 2 && data.scarcity ? `
<tr><td style="padding:0 0 24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:2px solid ${PA.gold};"><tr><td style="padding:4px 0 4px 16px;">
    <p style="font-family:${SERIF};font-size:19px;line-height:1.4;color:${PA.dark};margin:0;">${F.scarcity(data.scarcity.unavailable, data.scarcity.total)}</p>
  </td></tr></table>
</td></tr>` : "";

  const giftBlock = gift ? `
<tr><td style="padding:0 0 24px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.gold};border-radius:12px;"><tr><td style="padding:22px 24px;">
    <p style="font-family:${SANS};font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:${PA.gold};margin:0 0 8px 0;">Flex</p>
    <p style="font-family:${SERIF};font-size:24px;line-height:1.25;color:${PA.dark};margin:0 0 10px 0;">${F.giftTitle}</p>
    <p style="font-family:${SANS};font-size:14px;line-height:1.65;color:${PA.earth};margin:0;">${F.giftBody(formatGuaranteeUntil(gift.until, lang, T.atTime), gift.days, eur(gift.value, lang))}</p>
  </td></tr></table>
</td></tr>` : "";

  const altBlock = alts.length ? alts.map((a) => `
<tr><td style="padding:0 0 18px 0;">
  <a href="${a.url}" target="_blank" style="text-decoration:none;display:block;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
    ${a.imageUrl ? `<tr><td><img src="${a.imageUrl}" alt="${a.name}" width="600" style="display:block;width:100%;height:auto;border-radius:12px 12px 0 0;" /></td></tr>` : ""}
    <tr><td style="padding:18px 22px 20px 22px;">
      <p style="font-family:${SERIF};font-size:20px;line-height:1.3;color:${PA.dark};margin:0;">${a.name}</p>
      ${a.locality ? `<p style="font-family:${SANS};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PA.stoneAA};margin:5px 0 0 0;">${a.locality}</p>` : ""}
      <p style="font-family:${SANS};font-size:13px;color:${PA.earth};margin:10px 0 0 0;">${formatStayDate(data.checkIn, lang)} &rarr; ${formatStayDate(data.checkOut, lang)}</p>
    </td></tr>
  </table>
  </a>
</td></tr>`).join("") : "";

  const optout = data.optoutUrl
    ? `<tr><td style="padding:0 20px 30px;text-align:center;"><a href="${data.optoutUrl}" style="font-family:${SANS};font-size:11px;color:${PA.stoneAA};text-decoration:underline;">${T.optout}</a></td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${PA.warm};font-family:${SANS};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PA.warm};">
<tr><td align="center" style="padding:0;">
  <img src="${BRAND_BAND_URL}" alt="Portugal Active" width="600" style="display:block;margin:0 auto;width:100%;max-width:600px;height:auto;" />
</td></tr>
<tr><td align="center" style="padding:36px 20px 44px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="padding:0 0 12px 0;">
  <h1 style="font-family:${SERIF};font-size:30px;line-height:1.2;color:${PA.dark};margin:0;font-weight:400;">${headline}</h1>
</td></tr>
<tr><td style="padding:0 0 24px 0;">
  <p style="font-family:${SANS};font-size:15px;color:${PA.earth};line-height:1.65;margin:0;">${body}</p>
</td></tr>
${scarcityBlock}
${giftBlock}
${stayCard}
${altBlock}
<tr><td style="padding:0 0 24px 0;">
  <a href="${ctaUrl}" target="_blank" style="display:block;background:${PA.dark};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:600;text-decoration:none;text-align:center;padding:15px 24px;letter-spacing:0.1em;text-transform:uppercase;border-radius:8px;">${cta}</a>
  <p style="text-align:center;margin:14px 0 0;"><a href="https://wa.me/351927161771?text=${encodeURIComponent(T.whatsappMsg(String(data.propertyName ?? house)))}" style="font-family:${SANS};font-size:13px;color:${PA.gold};text-decoration:underline;">${T.whatsappLine}</a></p>
</td></tr>
<tr><td style="padding:0 0 8px 0;">
  <p style="font-family:${SANS};font-size:13.5px;color:${PA.earth};line-height:1.6;margin:0;">${personal}</p>
  ${conciergeSignature(lang, data.destination)}
</td></tr>
${brandFooter(T.footerTagline)}
${optout}
</table>
</td></tr>
</table>
</body>
</html>`;

  // Reply-To explícito para a caixa de reservas: o contacto 1 diz "Lemos
  // todas as respostas", e isso só é verdade se a resposta cair na caixa que a
  // equipa lê, mesmo que o EMAIL_FROM volte a apontar para outro remetente.
  await sendEmail(data.guestEmail, subject, html, BOOKING_NOTIFICATION_EMAIL);
}

/** Alerta interno: abandono no pagamento de valor alto — ligar ao hóspede. */
export async function sendConciergeCallAlert(d: {
  intentId: string; guestName: string; guestEmail: string; guestPhone: string;
  propertyName: string; checkIn: string; checkOut: string; guests: number;
  total: number; locale?: string | null; resumeUrl: string;
}): Promise<void> {
  const wa = `https://wa.me/${d.guestPhone.replace(/[^0-9]/g, "")}`;
  const html = wrapTemplate(`
<tr><td style="padding:0 0 16px 0;">
  <h1 style="font-family:Georgia,serif;font-size:22px;color:#1A1A18;margin:0;font-weight:400;">Ligar ao hóspede: reserva de ${Math.round(d.total).toLocaleString("pt-PT")} EUR parada no pagamento</h1>
</td></tr>
<tr><td style="padding:0 0 12px 0;"><p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.6;margin:0;">
  <strong>${d.guestName || "Hóspede"}</strong> chegou ao pagamento de <strong>${d.propertyName}</strong> (${d.checkIn} a ${d.checkOut}, ${d.guests} hóspedes) e não concluiu há mais de uma hora.
</p></td></tr>
<tr><td style="padding:0 0 12px 0;"><p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.8;margin:0;">
  Telefone: <a href="tel:${d.guestPhone}">${d.guestPhone}</a> · <a href="${wa}">WhatsApp</a><br>
  Email: <a href="mailto:${d.guestEmail}">${d.guestEmail}</a> · Língua: ${d.locale || "en"}<br>
  Checkout do hóspede: <a href="${d.resumeUrl}">abrir</a>
</p></td></tr>
<tr><td style="padding:0 0 10px 0;"><p style="font-family:Arial,sans-serif;font-size:13px;color:#6B6860;line-height:1.6;margin:0;">
  Contactar nas próximas 2 horas. O hóspede já recebeu o email automático "Ficou algo por resolver?". Um alerta por checkout.
</p></td></tr>`);
  await sendEmail(BOOKING_ALERT_EMAIL, `[CS] Ligar: ${d.propertyName} · ${Math.round(d.total)} EUR parado no pagamento`, html);
}

/* ================================================================
   CHECKOUT 2.0 — CONFIRMAÇÃO PREMIUM AO HÓSPEDE
   Enviada no hook paid do updateIntent, a seguir à ficha do CS.
   O email do Guesty é genérico; este replica o checkout do site:
   logótipo, foto da casa como hero, cartão de resumo com o breakdown
   de preços e o total, "A sua estadia à medida" e próximos passos.
   PT quando o locale do intent começa por pt, EN para o resto.
   Fire-and-forget: nunca trava um pagamento nem lança erro.
   ================================================================ */

const CONCIERGE_WA_LINK = "https://wa.me/351927161771";

/** "private-chef" → "Private chef" (nome legível a partir do sku, PT/EN apenas) */
const SKU_LABELS: Record<string, { pt: string; en: string }> = {
  "transfer-porto": { pt: "Transfer aeroporto do Porto", en: "Porto airport transfer" },
  "transfer-porto-van": { pt: "Transfer aeroporto do Porto, van", en: "Porto airport transfer, van" },
  "transfer-lisbon": { pt: "Transfer aeroporto de Lisboa", en: "Lisbon airport transfer" },
  "transfer-lisbon-van": { pt: "Transfer aeroporto de Lisboa, van", en: "Lisbon airport transfer, van" },
  "daily-cleaning": { pt: "Limpeza diária", en: "Daily cleaning" },
  "deep-cleaning": { pt: "Limpeza profunda", en: "Deep cleaning" },
  "babysitter": { pt: "Babysitter", en: "Babysitter" },
  "travel-crib": { pt: "Berço de viagem", en: "Travel crib" },
  "baby-chair": { pt: "Cadeira de bebé", en: "High chair" },
  "pet-fee": { pt: "Animais de estimação", en: "Pets" },
  "pet-kit": { pt: "Kit pet, cama e taças", en: "Pet kit, bed and bowls" },
  "pet-food": { pt: "Comida para o animal", en: "Pet food" },
  "breakfast-box": { pt: "Breakfast box", en: "Breakfast box" },
  "private-chef": { pt: "Chef privado", en: "Private chef" },
  "grocery-setup": { pt: "Compras feitas e entregues", en: "Grocery setup and delivery" },
  "massage": { pt: "Massagem na casa", en: "In-home massage" },
  "private-yoga": { pt: "Yoga privado", en: "Private yoga" },
  "personal-trainer": { pt: "Personal trainer", en: "Personal trainer" },
};

function skuLabel(sku: string, pt = false): string {
  const known = SKU_LABELS[String(sku)];
  if (known) return pt ? known.pt : known.en;
  const s = String(sku).replace(/-/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(sku);
}

/** Bloco 5: nome do extra na língua do intent — 1.º os i18n do site (o que o
 *  hóspede viu no checkout), depois o dicionário PT/EN local, depois o sku. */
function skuLabelLang(sku: string, lang: EmailLang): string {
  return skuNameFor(String(sku), lang) ?? skuLabel(String(sku), lang === "pt");
}

/** Valores canónicos (computeChargeBreakdown) — quando presentes, os emails
 *  mostram EXATAMENTE o que foi cobrado, nunca valores vindos do cliente. */
export interface CanonicalCharge {
  lines: Array<{ sku: string; cents: number }>;
  receptionCents: number;
  flexCents: number;
  totalCents: number;
}

/**
 * Pagamento em duas partes já agendado (a linha de checkout_scheduled_payments),
 * para a confirmação e o manifesto. Ausente ou null = pagamento integral: os
 * dois emails saem exatamente como antes, byte a byte.
 */
export interface CheckoutPlanSummary {
  /** O que o PI da 1.ª parte cobrou hoje. */
  amountTodayCents: number;
  /** A 2.ª parte, congelada no settle. */
  amountLaterCents: number;
  /** C: a 2.ª cobrança (10:00 de Lisboa). */
  chargeAt: Date;
  /** D: fim do cancelamento gratuito (23:59 de Lisboa). */
  freeCancelDeadlineAt: Date;
  /** Últimos 4 dígitos do cartão guardado; sem eles o email diz "no mesmo cartão". */
  cardLast4?: string | null;
  /** Link "Gerir o pagamento" (balanceLinkUrl). Sem ele não há botão nem a
   *  frase "basta um clique", que seria falsa. */
  manageUrl?: string | null;
}

/** Plano utilizável ou null (com log): um bloco com valores errados é pior
 *  do que nenhum, e nunca pode impedir o resto da confirmação de sair. */
function usablePlan(plan: CheckoutPlanSummary | null | undefined, where: string): CheckoutPlanSummary | null {
  if (!plan) return null;
  // Linhas da BD podem chegar serializadas (ISO): lê-se a data, não se inventa.
  const asDate = (v: unknown) => (v instanceof Date ? v : typeof v === "string" ? new Date(v) : null);
  const chargeAt = asDate(plan.chargeAt);
  const freeCancelDeadlineAt = asDate(plan.freeCancelDeadlineAt);
  const ok =
    Number.isSafeInteger(plan.amountTodayCents) && plan.amountTodayCents > 0 &&
    Number.isSafeInteger(plan.amountLaterCents) && plan.amountLaterCents > 0 &&
    isValidDate(chargeAt) && isValidDate(freeCancelDeadlineAt);
  if (!ok) {
    console.error(`[${where}] plano em duas partes inválido: bloco do plano omitido`);
    return null;
  }
  return { ...plan, chargeAt: chargeAt as Date, freeCancelDeadlineAt: freeCancelDeadlineAt as Date };
}

/** Bloco "O seu plano de pagamento" da confirmação ao hóspede (spec 4.2, E0). */
function guestPlanBlock(plan: CheckoutPlanSummary, lang: EmailLang): string {
  const P = PAYPLAN_I18N[lang];
  const last4 = cleanLast4(plan.cardLast4);
  const manage = safeGuestLink(plan.manageUrl);
  const note = manage ? `${P.planNote} ${P.planNoteManage}` : P.planNote;
  return `
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.gold};border-radius:12px;">
  <tr><td style="padding:22px 24px;">
    <p style="font-family:${SANS};font-size:10.5px;letter-spacing:0.16em;text-transform:uppercase;color:${PA.gold};margin:0 0 8px 0;">${P.productName}</p>
    <p style="font-family:${SERIF};font-size:19px;color:${PA.dark};margin:0 0 12px 0;font-weight:400;">${P.planTitle}</p>
    <p style="font-family:${SANS};font-size:14px;color:${PA.dark};line-height:1.6;margin:0 0 4px 0;">${P.planToday(eurCents(plan.amountTodayCents, lang), last4)}</p>
    <p style="font-family:${SANS};font-size:14px;color:${PA.dark};line-height:1.6;margin:0;">${P.planLater(lisbonDay(plan.chargeAt, lang), eurCents(plan.amountLaterCents, lang))}</p>
    <p style="font-family:${SANS};font-size:13px;color:${PA.earth};line-height:1.65;margin:12px 0 0 0;">${P.planDeadline(balanceDeadline(plan.freeCancelDeadlineAt, lang))} ${note}</p>
    ${manage ? `<p style="margin:16px 0 0 0;"><a href="${escapeHtml(manage)}" target="_blank" style="display:inline-block;background:${PA.dark};color:#ffffff;font-family:${SANS};font-size:12px;font-weight:600;text-decoration:none;padding:12px 22px;letter-spacing:0.1em;text-transform:uppercase;border-radius:8px;">${P.planCta}</a></p>` : ""}
    <p style="font-family:${SANS};font-size:11.5px;color:${PA.stoneAA};line-height:1.55;margin:14px 0 0 0;">${P.noWithdrawal}</p>
  </td></tr>
</table>
</td></tr>`;
}

export async function sendCheckoutGuestConfirmation(d: {
  email: string;
  guestFirstName?: string | null;
  propertyName?: string | null;
  destination?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  guests?: number | null;
  confirmationCode?: string | null;
  reception?: { type: string; late?: boolean } | null;
  /** Preço da receção presencial calculado pelo caller a partir da config */
  receptionAmount?: number | null;
  extras?: Array<Record<string, unknown>> | null;
  flex?: boolean | null;
  /** Preço do Flex (config do servidor), só usado quando flex é true */
  flexPrice?: number | null;
  canonical?: CanonicalCharge | null;
  /** Snapshot da quote do intent — alimenta o breakdown igual ao checkout */
  quote?: {
    nightlyRate?: number;
    nights?: number;
    totalNights?: number;
    cleaningFee?: number;
    taxesAndFees?: number;
    total?: number;
  } | null;
  /** Foto da casa (CDN Guesty, já dimensionada). Sem foto o cartão segue sem hero. */
  imageUrl?: string | null;
  /** Link "Ver a minha reserva" (checkout pago mostra o estado confirmado) */
  viewUrl?: string | null;
  locale?: string | null;
  /** Política da tarifa paga (planPolicyCode) para a linha da política */
  cancellation?: EmailCancellation | null;
  intentId: string;
  /** Pagamento em duas partes: o bloco do plano (E0). Ausente = como antes. */
  plan?: CheckoutPlanSummary | null;
}): Promise<void> {
  try {
    // Bloco 5: 9 línguas pelo locale do intent (fallback EN, como o site)
    const lang = emailLang(d.locale);
    const C = CONFIRMATION_I18N[lang];
    const plan = usablePlan(d.plan, "GuestConfirmation");
    const planBlock = plan ? guestPlanBlock(plan, lang) : "";
    const house = d.propertyName || C.yourHome;
    const subject = C.subject(house);

    const firstName = (d.guestFirstName || "").trim().split(" ")[0];
    const inShort = d.checkIn ? formatStayDate(d.checkIn, lang) : "?";
    const outShort = d.checkOut ? formatStayDate(d.checkOut, lang) : "?";

    const headline = C.headline(house, inShort, outShort);

    const body = firstName ? C.bodyNamed(firstName) : C.body;

    // ── Extras: pagos entram no cartão de preços; on_request vão ao concierge ──
    const extras = Array.isArray(d.extras) ? d.extras : [];
    const paidExtras = extras.filter((e) => e.amount != null);
    const requestExtras = extras.filter((e) => e.amount == null);

    const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const extraLabel = (e: Record<string, unknown>): string => {
      const bits: string[] = [skuLabelLang(String(e.sku), lang)];
      if (e.qty && Number(e.qty) > 1) bits.push("x" + e.qty);
      if (e.people) bits.push(unit(Number(e.people), C.personOne, C.personMany));
      if (e.sessions) bits.push(unit(Number(e.sessions), C.sessionOne, C.sessionMany));
      if (e.days) bits.push(unit(Number(e.days), C.dayOne, C.dayMany));
      return bits.join(" · ");
    };

    // ── Cartão de resumo: linhas de preço iguais ao resumo do checkout ──
    const q = d.quote || {};
    const line = (label: string, value: string) => `
      <tr>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${PA.earth};">${label}</td>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${PA.dark};text-align:right;">${value}</td>
      </tr>`;

    let priceLines = "";
    if (q.nights && q.totalNights != null) {
      priceLines += line(`${q.nights} ${C.nightsLabel}`, eur(q.totalNights, lang));
    }
    // O rótulo do resumo do checkout nessa língua ("Limpeza final"), como na
    // recuperação: o "Service fee" em inglês, nas 9 línguas, contradizia o
    // "sem taxas de reserva" que o checkout acabou de prometer.
    if (q.cleaningFee && q.cleaningFee > 0) priceLines += line(cleaningFeeLabel(lang), eur(q.cleaningFee, lang));
    if (q.taxesAndFees && q.taxesAndFees > 0) priceLines += line(C.taxesLabel, eur(q.taxesAndFees, lang));
    const receptionAmt = d.receptionAmount ?? 0;
    if (d.reception?.type === "hosted" && receptionAmt > 0) {
      priceLines += line(
        d.reception.late ? C.hostedArrivalLate : C.hostedArrival,
        eur(receptionAmt, lang),
      );
    }
    const canonBySku = new Map((d.canonical?.lines ?? []).map((l) => [l.sku, l.cents / 100]));
    let hasNeedsConfirmation = false;
    for (const e of paidExtras) {
      // valor canónico quando existe (o que foi cobrado); Incluído em vez de 0 €
      const amt = canonBySku.has(String(e.sku)) ? canonBySku.get(String(e.sku))! : Number(e.amount);
      const v = amt === 0 ? C.included : eur(amt, lang);
      // Mesma honestidade do checkout: itens a confirmar em 24h dizem-no aqui
      const needs = e.fulfillment === "needs_confirmation";
      if (needs) hasNeedsConfirmation = true;
      const label = needs
        ? `${extraLabel(e)} <span style="color:${PA.stoneAA};font-size:11.5px;">· ${C.confirm24h}</span>`
        : extraLabel(e);
      priceLines += line(label, v);
    }
    const flexAmt = d.canonical ? d.canonical.flexCents / 100 : d.flex && d.flexPrice ? d.flexPrice : 0;
    if (flexAmt > 0) priceLines += line(C.flexLine, eur(flexAmt, lang));
    // Flex oferecido pelo funil de recuperação: o hóspede tem de o ver na
    // confirmação (é o que o fez reservar), a 0
    else if (d.flex) priceLines += line(C.flexLine, `${FUNNEL_I18N[lang].flexIncluded}, ${eur(0, lang)}`);
    // Compras: a conta do supermercado é à parte, ao custo — dizê-lo também aqui
    if (hasNeedsConfirmation) {
      priceLines += `<tr><td colspan="2" style="padding:2px 0 6px;font-family:${SANS};font-size:11.5px;color:${PA.stoneAA};">${C.refund24hNote}</td></tr>`;
    }
    if (paidExtras.some((e) => e.sku === "grocery-setup")) {
      priceLines += `<tr><td colspan="2" style="padding:2px 0 6px;font-family:${SANS};font-size:11.5px;color:${PA.stoneAA};">${C.groceriesNote}</td></tr>`;
    }
    const extrasSum = paidExtras.reduce((s, e) => s + (canonBySku.has(String(e.sku)) ? canonBySku.get(String(e.sku))! : Number(e.amount || 0)), 0);
    const total = d.canonical ? d.canonical.totalCents / 100 : (q.total ?? 0) + receptionAmt + extrasSum + flexAmt;

    const destination = d.destination
      ? d.destination.charAt(0).toUpperCase() + d.destination.slice(1)
      : "";

    const photo = d.imageUrl
      ? `<tr><td style="border-radius:12px 12px 0 0;overflow:hidden;">
        <img src="${d.imageUrl}" alt="${house}" width="600" style="display:block;width:100%;height:auto;border-radius:12px 12px 0 0;" />
      </td></tr>`
      : "";

    // ── Chegada quando é self check-in (sem custo, não entra nas linhas de preço) ──
    const selfCheckInLine =
      d.reception && d.reception.type !== "hosted"
        ? `<p style="font-family:${SANS};font-size:12px;color:${PA.gold};margin:10px 0 0 0;">${C.selfCheckIn}</p>`
        : "";

    // ── Pedidos ao concierge (on_request, sob orçamento) ──
    const conciergeBlock = requestExtras.length
      ? `
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
  <tr><td style="padding:22px 24px;">
    <p style="font-family:${SERIF};font-size:19px;color:${PA.dark};margin:0 0 10px 0;font-weight:400;">${C.conciergeRequestsTitle}</p>
    ${requestExtras.map((e) => `<p style="font-family:${SANS};font-size:13.5px;color:${PA.dark};margin:4px 0;">&bull; ${extraLabel(e)}</p>`).join("")}
    <p style="font-family:${SANS};font-size:12.5px;color:${PA.earth};line-height:1.6;margin:12px 0 0 0;">
      ${C.conciergeRequestsBody}
    </p>
  </td></tr>
</table>
</td></tr>`
      : "";

    const cta = C.cta;
    const ctaBlock = d.viewUrl
      ? `
<tr><td style="padding:0 0 14px 0;">
  <a href="${d.viewUrl}" target="_blank" style="display:block;background:${PA.dark};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:600;text-decoration:none;text-align:center;padding:15px 24px;letter-spacing:0.1em;text-transform:uppercase;border-radius:8px;">${cta}</a>
</td></tr>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${PA.warm};font-family:${SANS};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${C.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PA.warm};">

<!-- Top bar: brand-dark band with the white logo (the logoColor asset is
     imagem full-width com o logo real: fundo cozido borda a borda -->
<tr><td align="center" style="padding:0;">
  <img src="${BRAND_BAND_URL}" alt="Portugal Active" width="600" style="display:block;margin:0 auto;width:100%;max-width:600px;height:auto;" />
</td></tr>

<tr><td align="center" style="padding:36px 20px 44px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<!-- Headline -->
<tr><td style="padding:0 0 12px 0;">
  <h1 style="font-family:${SERIF};font-size:30px;line-height:1.25;color:${PA.dark};margin:0;font-weight:400;">${headline}</h1>
</td></tr>
<tr><td style="padding:0 0 24px 0;">
  <p style="font-family:${SANS};font-size:15px;color:${PA.earth};line-height:1.65;margin:0;">${body}</p>
</td></tr>

<!-- Código de confirmação -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
  <tr><td style="padding:22px 24px;text-align:center;">
    <p style="font-family:${SANS};font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${PA.stoneAA};margin:0 0 8px 0;">${C.confirmationCodeLabel}</p>
    <p style="font-family:${SERIF};font-size:30px;color:${PA.dark};margin:0;letter-spacing:0.05em;font-weight:400;">${d.confirmationCode || "&mdash;"}</p>
  </td></tr>
</table>
</td></tr>

<!-- Summary card: photo + stay + breakdown, mirroring the checkout's lateral summary -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
  ${photo}
  <tr><td style="padding:22px 24px 4px 24px;">
    <p style="font-family:${SERIF};font-size:21px;line-height:1.3;color:${PA.dark};margin:0;">${house}</p>
    ${destination ? `<p style="font-family:${SANS};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PA.stoneAA};margin:5px 0 0 0;">${destination}</p>` : ""}
    <p style="font-family:${SANS};font-size:13px;color:${PA.earth};margin:10px 0 0 0;">
      ${inShort} &rarr; ${outShort} &nbsp;&middot;&nbsp; ${d.guests ?? "?"} ${C.guestsLabel}
    </p>
    ${selfCheckInLine}
  </td></tr>
  ${priceLines ? `<tr><td style="padding:14px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${priceLines}
    </table>
  </td></tr>` : ""}
  ${total > 0 ? `<tr><td style="padding:10px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${PA.sand};">
      <tr>
        <td style="padding:12px 0 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:${PA.dark};">${LEGACY_I18N[lang].totalLabel}</td>
        <td style="padding:12px 0 0 0;font-family:${SANS};font-size:21px;color:${PA.dark};text-align:right;">${eur(total, lang)}</td>
      </tr>
    </table>
  </td></tr>` : ""}
  <tr><td style="padding:14px 24px 20px 24px;">
    ${cancellationEmailLine(d.cancellation, lang, d.checkIn)}
  </td></tr>
</table>
</td></tr>

${planBlock}${conciergeBlock}

<!-- Próximos passos -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
  <tr><td style="padding:22px 24px;">
    <p style="font-family:${SERIF};font-size:19px;color:${PA.dark};margin:0 0 10px 0;font-weight:400;">${C.nextTitle}</p>
    <p style="font-family:${SANS};font-size:13.5px;color:${PA.earth};line-height:1.7;margin:0;">
      ${C.nextBody}
    </p>
  </td></tr>
</table>
</td></tr>

<!-- CTAs -->
${ctaBlock}
<tr><td style="padding:0 0 24px 0;text-align:center;">
  <a href="${CONCIERGE_WA_LINK}" target="_blank" style="font-family:${SANS};font-size:13px;color:${PA.gold};text-decoration:underline;">${C.whatsappLine}</a>
</td></tr>

<!-- Melhor preço garantido -->
<tr><td style="padding:0 0 8px 0;text-align:center;">
  <p style="font-family:${SANS};font-size:12px;color:${PA.stoneAA};line-height:1.6;margin:0;">
    ${C.bestPriceLine}
  </p>
</td></tr>

<tr><td style="padding:0 0 8px 0;">
  ${conciergeSignature(lang, d.destination)}
</td></tr>

<!-- Footer: a frase da marca na língua do hóspede (a antiga só existia em PT e EN) -->
${brandFooter(C.footerTagline)}

</table>
</td></tr>
</table>
</body>
</html>`;

    await sendEmail(d.email, subject, html);
    console.info(`[GuestConfirmation] enviado a ${d.email} (intent ${d.intentId})`);
  } catch (err: any) {
    console.error(`[GuestConfirmation] falhou (intent ${d.intentId}):`, err?.message);
  }
}

/** Ficha de serviços do checkout 2.0 para o CS — enviada quando um intent passa
 *  a paid (todos os métodos; hook no updateIntent). Nunca trava um pagamento. */
export async function sendCheckoutOpsManifest(d: {
  confirmationCode?: string | null; reservationId?: string | null;
  propertyName?: string | null; checkIn?: string | null; checkOut?: string | null;
  guests?: number | null; email?: string | null; guestName?: string | null;
  guestPhone?: string | null; reception?: { type: string; late?: boolean } | null;
  extras?: Array<Record<string, unknown>> | null; flex?: boolean | null; intentId: string;
  canonical?: CanonicalCharge | null;
  imageUrl?: string | null;
  /** Só na cópia [Venda direta]: a equipa de CS não precisa da origem. */
  origin?: ServerVisitOrigin | null;
  couponCode?: string | null;
  /** Pagamento em duas partes: destaque "NÃO cobrar" e "Pago hoje" com o
   *  valor do PI. Ausente = manifesto exatamente como antes. */
  plan?: CheckoutPlanSummary | null;
  /** NIF que o hóspede pediu na fatura (texto livre do checkout). Com NIF, é
   *  a 1.ª ação do email; sem NIF, o manifesto fica como antes. */
  nif?: string | null;
}): Promise<void> {
  try {
    const plan = usablePlan(d.plan, "OpsManifest");
    const nif = invoiceNif(d.nif);
    const extras = Array.isArray(d.extras) ? d.extras : [];
    const needs = extras.filter((e) => e.fulfillment === "needs_confirmation");
    const requests = extras.filter((e) => e.amount == null);
    const paid = extras.filter((e) => e.amount != null && e.fulfillment !== "needs_confirmation");
    const nice = (sku: unknown) => skuLabel(String(sku), true);
    const canonBySku = new Map((d.canonical?.lines ?? []).map((l) => [l.sku, l.cents / 100]));
    const amountOf = (e: Record<string, unknown>) =>
      canonBySku.has(String(e.sku)) ? canonBySku.get(String(e.sku))! : Number(e.amount ?? 0);
    const qty = (e: Record<string, unknown>) =>
      [e.qty ? "x" + e.qty : "", e.days ? e.days + " dias" : "", e.people ? e.people + " pessoas" : "", e.sessions ? e.sessions + " sessoes" : ""].filter(Boolean).join(" ");
    const deadline = new Date(Date.now() + 24 * 3600_000).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

    // ── AÇÕES: o que a equipa tem de tratar, por ordem de urgência ──
    // Regras específicas por sku primeiro (operação real); genéricas depois.
    const actions: Array<{ urgent: boolean; text: string }> = [];
    // O NIF primeiro: o Guesty não o recebe (o campo que a Hostkit lê está
    // por confirmar, spec 5.13, e os serviços nem entram no folio), por isso a
    // fatura só sai com ele se alguém o puser. Uma fatura que já saiu sem o
    // NIF pedido tem de ser anulada e emitida outra.
    if (nif) {
      actions.push({
        urgent: true,
        text: `FATURA COM NIF ${escapeHtml(nif)}: o hospede pediu a fatura com este NIF. Garantir que a fatura da estadia (Hostkit) e a dos servicos, se houver, saem com ele; se alguma ja saiu sem NIF, anular e emitir outra.`,
      });
    }
    const handled = new Set<string>();
    for (const e of paid) {
      const sku = String(e.sku);
      if (sku === "grocery-setup") {
        actions.push({ urgent: true, text: `PEDIR JA A LISTA DE COMPRAS a ${d.guestName || "hospede"} (${d.guestPhone || d.email || "?"}) e agendar compra e entrega antes do check-in de ${d.checkIn || "?"}. Conta do supermercado a parte, ao custo (fee de ${amountOf(e)} EUR ja cobrado).` });
        handled.add(sku);
      } else if (sku === "daily-cleaning" || sku === "deep-cleaning") {
        actions.push({ urgent: false, text: `AGENDAR ${e.qty || 1} ${sku === "daily-cleaning" ? "limpeza(s) diaria(s)" : "limpeza(s) profunda(s)"} com a equipa e combinar datas com o hospede (${amountOf(e)} EUR cobrados).` });
        handled.add(sku);
      } else if (sku.startsWith("transfer-")) {
        actions.push({ urgent: true, text: `CONFIRMAR VOO E HORA de recolha do ${nice(sku)} ${qty(e)} com o hospede (${amountOf(e)} EUR cobrados).` });
        handled.add(sku);
      } else if (sku === "pet-fee") {
        actions.push({ urgent: false, text: `PREPARAR a casa para ${e.qty || 1} animal(is) de estimacao (taxa ${amountOf(e)} EUR cobrada).` });
        handled.add(sku);
      }
    }
    for (const e of needs) {
      actions.push({ urgent: true, text: `CONFIRMAR ${nice(e.sku)} ${qty(e)} ATE ${deadline}. Sem fornecedor disponivel: avisar o hospede e reembolsar a linha (${amountOf(e)} EUR).` });
    }
    if (requests.length) {
      actions.push({ urgent: true, text: `ORGANIZAR COM O CLIENTE: ligar ou WhatsApp a ${d.guestName || "hospede"} (${d.guestPhone || d.email || "?"}) para orcamentar: ${requests.map((e) => nice(e.sku)).join(", ")}.` });
    }
    if (d.reception?.type === "hosted") {
      actions.push({ urgent: false, text: `AGENDAR ANFITRIAO para a chegada de ${d.checkIn || "?"}${d.reception.late ? " APOS AS 21H" : ""} (rececao presencial paga).` });
    }
    for (const e of paid) {
      if (handled.has(String(e.sku))) continue;
      actions.push({ urgent: false, text: `PREPARAR ${nice(e.sku)} ${qty(e)}${amountOf(e) === 0 ? " (incluido, exige preparacao)" : ""}.` });
    }
    if (d.flex) actions.push({ urgent: false, text: `REGISTAR Flex ativo nesta reserva (remarcacao garantida${d.canonical ? `, ${d.canonical.flexCents / 100} EUR` : ""}).` });

    const actionHtml = actions.length
      ? `<div style="background:#FDFBF7;border:1px solid #E5DFD3;border-left:4px solid ${actions.some((a) => a.urgent) ? "#B23A2E" : "#C9A96A"};border-radius:10px;padding:18px 20px;margin:0 0 22px;">
           <p style="font:700 11px Arial;color:${actions.some((a) => a.urgent) ? "#B23A2E" : "#8B7355"};margin:0 0 14px;letter-spacing:.14em;">TRATAR AGORA · POR ORDEM</p>
           ${actions.map((a, i) => `
           <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>
             <td valign="top" style="padding-right:12px;"><div style="width:22px;height:22px;border-radius:11px;background:${a.urgent ? "#B23A2E" : "#1A1A18"};color:#fff;font:700 12px/22px Arial;text-align:center;">${i + 1}</div></td>
             <td style="font:${a.urgent ? "600" : "400"} 13.5px/1.55 Arial;color:#1A1A18;">${a.text}</td>
           </tr></table>`).join("")}
         </div>`
      : "";

    const rows: string[] = [];
    const row = (k: string, v: string) =>
      rows.push(`<tr><td style="padding:4px 12px 4px 0;color:#6B6860;font:13px Arial;">${k}</td><td style="padding:4px 0;color:#1A1A18;font:13px Arial;">${v}</td></tr>`);
    row("Casa", d.propertyName || "?");
    row("Datas", `${d.checkIn || "?"} ate ${d.checkOut || "?"} · ${d.guests ?? "?"} hospedes`);
    row("Hospede", `${d.guestName || "?"} · ${d.email || "?"} · ${d.guestPhone || "?"}`);
    row("Reserva", `${d.confirmationCode || "pendente"} (Guesty ${d.reservationId || "?"})`);
    // Valor da venda sempre visivel (pedido do Ricardo, 20 ago): total pago e,
    // quando ha servicos, o split estadia/servicos do calculo canonico.
    if (plan) {
      // Duas partes: hoje so entrou o PI da 1.a parte. Mostrar o total como
      // "pago" levava o CS a dar a reserva por liquidada (ou, ao ver o
      // "Partially paid" no Guesty, a cobrar o resto a mao).
      const hoje = plan.amountTodayCents / 100;
      const servicos = d.canonical
        ? (d.canonical.lines.reduce((s, l) => s + l.cents, 0) + d.canonical.receptionCents + d.canonical.flexCents) / 100
        : 0;
      row("Pago hoje", `<strong>${hoje.toFixed(2)} EUR</strong>${servicos > 0 ? ` (estadia ${(hoje - servicos).toFixed(2)} + servicos ${servicos.toFixed(2)})` : ""}`);
      row("2.ª parte", `${(plan.amountLaterCents / 100).toFixed(2)} EUR a ${ddmmyyyyLisbon(plan.chargeAt)}, cobrada automaticamente pela plataforma`);
      if (d.canonical) row("Total da reserva", `${(d.canonical.totalCents / 100).toFixed(2)} EUR`);
    } else if (d.canonical) {
      const tot = d.canonical.totalCents / 100;
      const servicos = (d.canonical.lines.reduce((s, l) => s + l.cents, 0) + d.canonical.receptionCents + d.canonical.flexCents) / 100;
      const estadia = tot - servicos;
      row("Total pago", `<strong>${tot.toFixed(2)} EUR</strong>${servicos > 0 ? ` (estadia ${estadia.toFixed(2)} + servicos ${servicos.toFixed(2)})` : ""}`);
    }
    // Cópia de vendas: de onde veio a venda (cupão e origem da visita). Os
    // valores já vêm limpos (shared/visit-origin.ts); escapam-se na mesma.
    const salesRows = [...rows];
    const esc = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const coupon = String(d.couponCode ?? "").replace(/[^\p{L}\p{N} %._-]/gu, "").trim().slice(0, 60).toUpperCase();
    salesRows.push(`<tr><td style="padding:4px 12px 4px 0;color:#6B6860;font:13px Arial;">Cupao</td><td style="padding:4px 0;color:#1A1A18;font:13px Arial;">${esc(coupon || "sem codigo")}</td></tr>`);
    salesRows.push(`<tr><td style="padding:4px 12px 4px 0;color:#6B6860;font:13px Arial;">Origem da visita</td><td style="padding:4px 0;color:#1A1A18;font:13px Arial;">${esc(originEmailSummary(d.origin))}</td></tr>`);
    const fmtLine = (e: Record<string, unknown>) =>
      `<p style="font:13px Arial;color:#1A1A18;margin:2px 0;">• ${nice(e.sku)} ${qty(e)} · ${e.amount != null ? amountOf(e) + " EUR" : "sob orcamento"}</p>`;
    // Sempre com a marca: moldura com logo (wrapTemplate) + foto da casa —
    // a equipa reconhece a propriedade num relance (12 jul, Ricardo)
    const photoHtml = d.imageUrl
      ? `<img src="${d.imageUrl}" alt="${d.propertyName || ""}" width="600" style="display:block;width:100%;height:auto;border-radius:8px;margin:0 0 16px;" />`
      : "";
    // Duas partes: o destaque vem antes de tudo, porque o erro caro é o CS
    // cobrar a 2.a parte pelo Guesty (cobrança dupla) ou pedir o cartão.
    const planHtml = plan
      ? `<div style="background:#FDFBF7;border:1px solid #E5DFD3;border-left:4px solid #B23A2E;border-radius:10px;padding:16px 20px;margin:0 0 22px;">
           <p style="font:700 11px Arial;color:#B23A2E;margin:0 0 8px;letter-spacing:.14em;">PAGAMENTO EM DUAS PARTES</p>
           <p style="font:600 13.5px/1.55 Arial;color:#1A1A18;margin:0;">PAGAMENTO EM DUAS PARTES: pago ${(plan.amountTodayCents / 100).toFixed(2)} EUR; ${(plan.amountLaterCents / 100).toFixed(2)} EUR agendado para ${ddmmyyyyLisbon(plan.chargeAt)}, cobrado AUTOMATICAMENTE pela plataforma. NÃO cobrar.</p>
           <p style="font:13px/1.55 Arial;color:#1A1A18;margin:6px 0 0;">NÃO cobrar no Guesty · não criar payment link · não pedir cartão ao hóspede · não dividir pagamentos à mão. Cancelamento gratuito até ${ddmmyyyyLisbon(plan.freeCancelDeadlineAt)} às ${lisbonTime(plan.freeCancelDeadlineAt, "pt")} (Lisboa); alterações e cancelamentos só pelo site.</p>
         </div>`
      : "";
    const render = (tableRows: string[]) => wrapTemplate(
      `<p style="font:700 10.5px Arial;color:#8B7355;letter-spacing:.16em;margin:0 0 6px;">NOVA RESERVA DIRETA · CHECKOUT 2.0</p>` +
      `<h2 style="font:400 24px Georgia;color:#1A1A18;margin:0 0 16px;">${d.propertyName || ""}</h2>` +
      planHtml +
      actionHtml +
      photoHtml +
      `<table>${tableRows.join("")}</table>` +
      (extras.length
        ? `<p style="font:600 13px Arial;margin:14px 0 4px;color:#1A1A18;">Detalhe dos servicos</p>` + extras.map(fmtLine).join("")
        : `<p style="font:13px Arial;color:#6B6860;margin:14px 0 4px;">Sem servicos extra — so a estadia${d.reception?.type === "hosted" ? " e rececao presencial" : ", self check-in"}.</p>`) +
      (d.reservationId ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;"><tr><td style="background:#1A1A18;border-radius:8px;">
        <a href="https://app.guesty.com/reservations/${d.reservationId}/summary" style="display:inline-block;padding:12px 22px;font:600 12px Arial;letter-spacing:.1em;color:#ffffff;text-decoration:none;">ABRIR NO GUESTY →</a>
      </td></tr></table>` : "") +
      `<p style="font:10.5px Arial;color:#9E9A90;margin-top:16px;">Intent ${d.intentId} · gerado pelo checkout 2.0</p>`,
      undefined,
      true,
    );
    const html = render(rows);
    const urgentFlag = needs.length || requests.length ? "ACAO ATE 24H — " : "";
    const planFlag = plan ? " · DUAS PARTES, NAO COBRAR" : "";
    const nifFlag = nif ? " · FATURA COM NIF" : "";
    await sendEmail(BOOKING_ALERT_EMAIL, `[CS] ${urgentFlag}Reserva ${d.confirmationCode || d.intentId.slice(0, 8)} · ${d.propertyName || ""}${planFlag}${nifFlag}`, html);
    console.info(`[OpsManifest] enviado (intent ${d.intentId}, ${actions.length} acoes)`);
    // Cópia de vendas para a gestão: cada reserva direta com casa, valor e
    // extras — pedido do Ricardo (16 ago) para acompanhar o que o site vende.
    if (SALES_COPY_EMAIL && SALES_COPY_EMAIL !== BOOKING_ALERT_EMAIL) {
      await sendEmail(SALES_COPY_EMAIL, `[Venda direta] ${d.propertyName || ""} · ${d.confirmationCode || d.intentId.slice(0, 8)}`, render(salesRows)).catch((err: any) =>
        console.error(`[OpsManifest] copia de vendas falhou (intent ${d.intentId}):`, err?.message),
      );
    }
  } catch (err: any) {
    console.error(`[OpsManifest] falhou (intent ${d.intentId}):`, err?.message);
  }
}

/* ================================================================
   PAGAMENTO EM DUAS PARTES — emails e SMS da 2.ª parte (Fase 2a)
   Spec docs/pagamento_duas_partes.md 2.4 (linha temporal), 4.2 (copy)
   e 5.6. Quem decide QUANDO enviar é o motor (checkout-balance.ts),
   com um claim por efeito; aqui só se monta e entrega a mensagem.

   Regras desta secção:
   - todas devolvem true SÓ quando o fornecedor aceitou o envio (Resend
     com id, Twilio com sid). Sem Resend, num preview/DEV ou com um
     erro, false e log: o motor não pode dar por enviado um aviso que
     conta os 7 dias da regra Visa e que não saiu;
   - nunca lançam (o motor trata o false);
   - frases que dependem do relógio ("amanhã", "daqui a uma semana")
     só saem quando são verdade no calendário de Lisboa; fora disso,
     false em vez de um texto errado;
   - o que veio do hóspede (nome) e do Guesty (casa) é escapado no HTML.
   ================================================================ */

const LISBON_TZ = "Europe/Lisbon";

function isValidDate(d: unknown): d is Date {
  return d instanceof Date && Number.isFinite(d.getTime());
}

/** Só 4 algarismos; tudo o resto conta como "sem últimos dígitos". */
function cleanLast4(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}$/.test(s) ? s : null;
}

/** Links nos emails ao hóspede só para a origem que aceita pagamentos
 *  reais: um link de DEV ou de preview nunca chega a um hóspede. */
function safeGuestLink(url: string | null | undefined): string | null {
  const u = String(url ?? "").trim();
  return u.startsWith(`${CHECKOUT_EMAIL_ORIGIN}/`) ? u : null;
}

function eurCents(cents: number, lang: EmailLang): string {
  return eur(cents / 100, lang);
}

/** Prazo com dia, hora e fuso, na língua do hóspede. A hora lê-se do
 *  instante (nunca escrita à mão), para dizer sempre o que o motor aplica. */
function balanceDeadline(at: Date, lang: EmailLang): string {
  return PAYPLAN_I18N[lang].deadline(lisbonDay(at, lang), lisbonTime(at, lang));
}

/** "28/06/2027" no calendário de Lisboa (manifesto e digest, só PT). */
function ddmmyyyyLisbon(at: Date): string {
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: LISBON_TZ }).format(at);
}

function validCents(v: unknown, allowZero = false): v is number {
  return Number.isSafeInteger(v) && ((v as number) > 0 || (allowZero && v === 0));
}

const subjectLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

const CARD_BRANDS: Record<string, string> = {
  visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover",
  diners: "Diners Club", jcb: "JCB", unionpay: "UnionPay", cartes_bancaires: "Cartes Bancaires",
};
function cardText(brand: string | null | undefined, last4: string | null): string | null {
  if (!last4) return null;
  const b = brand ? CARD_BRANDS[String(brand).toLowerCase()] ?? "" : "";
  return `${b ? `${b} ` : ""}••••${last4}`;
}

/** Contexto comum a todos os emails da 2.ª parte. */
function balanceContext(d: { locale?: string | null; guestFirstName?: string | null; propertyName?: string | null }) {
  const lang = emailLang(d.locale);
  const P = PAYPLAN_I18N[lang];
  const house = sanitizePropertyName(String(d.propertyName ?? "")).trim() || CONFIRMATION_I18N[lang].yourHome;
  const first = String(d.guestFirstName ?? "").trim().split(/\s+/)[0] || "";
  return {
    lang,
    P,
    /** Casa em texto simples (assunto) e escapada (HTML). */
    house,
    houseHtml: escapeHtml(house),
    greeting: P.hello(first ? escapeHtml(first) : null),
  };
}

/**
 * Entrega de um email da 2.ª parte. true só com o id do Resend; nunca lança.
 * Reply-To na caixa de reservas, como o funil de recuperação: se o hóspede
 * responder, cai onde a equipa lê.
 */
async function deliverBalanceEmail(to: string | null | undefined, subject: string, html: string, tag: string): Promise<boolean> {
  const email = String(to ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) {
    console.warn(`${tag} sem email válido: não enviado`);
    return false;
  }
  if (isPreviewDeployment()) {
    console.warn(`${tag} preview/DEV: email ao hóspede não enviado`);
    return false;
  }
  if (!resend) {
    console.log(`[EMAIL SERVICE - DEV MODE] ${tag} não enviado (sem RESEND_API_KEY) · ${subject}`);
    return false;
  }
  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject: subjectLine(subject),
      html,
      replyTo: BOOKING_NOTIFICATION_EMAIL,
    });
    if (error || !data?.id) {
      console.error(`${tag} Resend recusou: ${error?.message ?? "sem id"}`);
      return false;
    }
    console.info(`${tag} enviado (${data.id})`);
    return true;
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}

/** Cartão da estadia com linhas rótulo/valor (valores já em HTML seguro). */
function balanceCard(houseHtml: string, dates: string, rows: Array<[string, string | null]>): string {
  const lines = rows
    .filter((r): r is [string, string] => !!r[1])
    .map(([k, v]) => `
      <tr>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${PA.earth};">${k}</td>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${PA.dark};text-align:right;">${v}</td>
      </tr>`)
    .join("");
  return `
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
  <tr><td style="padding:22px 24px 4px 24px;">
    <p style="font-family:${SERIF};font-size:21px;line-height:1.3;color:${PA.dark};margin:0;">${houseHtml}</p>
    ${dates ? `<p style="font-family:${SANS};font-size:13px;color:${PA.earth};margin:8px 0 0 0;">${dates}</p>` : ""}
  </td></tr>
  ${lines ? `<tr><td style="padding:12px 24px 18px 24px;"><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${PA.sand};">${lines}</table></td></tr>` : `<tr><td style="padding:0 0 18px 0;"></td></tr>`}
</table>
</td></tr>`;
}

/** Moldura dos emails da 2.ª parte: a mesma do checkout (banda, título
 *  serif, cartão, botão, assinatura do concierge, rodapé na língua). */
function renderBalanceEmail(p: {
  lang: EmailLang;
  preheader: string;
  headline: string;
  paragraphs: string[];
  card?: string;
  cta?: { label: string; url: string } | null;
  notes?: string[];
  whatsapp?: boolean;
}): string {
  const R = RECOVERY_I18N[p.lang];
  const para = (t: string) => `
<tr><td style="padding:0 0 16px 0;">
  <p style="font-family:${SANS};font-size:15px;color:${PA.earth};line-height:1.65;margin:0;">${t}</p>
</td></tr>`;
  const note = (t: string) => `<p style="font-family:${SANS};font-size:12.5px;color:${PA.stoneAA};line-height:1.6;margin:0 0 8px 0;">${t}</p>`;
  return `<!DOCTYPE html>
<html lang="${p.lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${PA.warm};font-family:${SANS};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${p.preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PA.warm};">
<tr><td align="center" style="padding:0;">
  <img src="${BRAND_BAND_URL}" alt="Portugal Active" width="600" style="display:block;margin:0 auto;width:100%;max-width:600px;height:auto;" />
</td></tr>
<tr><td align="center" style="padding:36px 20px 44px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
<tr><td style="padding:0 0 14px 0;">
  <h1 style="font-family:${SERIF};font-size:30px;line-height:1.2;color:${PA.dark};margin:0;font-weight:400;">${p.headline}</h1>
</td></tr>
${p.paragraphs.map(para).join("")}
<tr><td style="padding:8px 0 0 0;"></td></tr>
${p.card ?? ""}
${p.cta ? `<tr><td style="padding:0 0 22px 0;">
  <a href="${escapeHtml(p.cta.url)}" target="_blank" style="display:block;background:${PA.dark};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:600;text-decoration:none;text-align:center;padding:15px 24px;letter-spacing:0.1em;text-transform:uppercase;border-radius:8px;">${p.cta.label}</a>
</td></tr>` : ""}
${p.notes?.length ? `<tr><td style="padding:0 0 12px 0;">${p.notes.map(note).join("")}</td></tr>` : ""}
${p.whatsapp ? `<tr><td style="padding:0 0 12px 0;text-align:center;"><a href="${CONCIERGE_WA_LINK}" target="_blank" style="font-family:${SANS};font-size:13px;color:${PA.gold};text-decoration:underline;">${CONFIRMATION_I18N[p.lang].whatsappLine}</a></td></tr>` : ""}
<tr><td style="padding:0 0 8px 0;">
  ${conciergeSignature(p.lang)}
</td></tr>
${brandFooter(R.footerTagline)}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Dia da estadia (YYYY-MM-DD) escrito como as outras datas da 2.ª parte
 *  (mesmo formatador, com o "1er"/"1º" onde a língua o pede). */
function balanceStayDay(iso: string, lang: EmailLang): string {
  const at = new Date(`${iso}T12:00:00Z`);
  return isValidDate(at) ? lisbonDay(at, lang, false) : escapeHtml(String(iso ?? ""));
}

function stayDates(lang: EmailLang, checkIn?: string | null, checkOut?: string | null): string {
  const i = checkIn ? balanceStayDay(checkIn, lang) : "";
  const o = checkOut ? balanceStayDay(checkOut, lang) : "";
  return i && o ? `${i} &rarr; ${o}` : i;
}

/** E1 (C−7) e E2 (C−1): lembretes antes da 2.ª cobrança. */
export async function sendBalanceReminder(d: {
  stage: 1 | 2;
  email: string;
  locale?: string | null;
  guestFirstName?: string | null;
  propertyName?: string | null;
  checkIn: string;
  checkOut: string;
  amountCents: number;
  chargeAt: Date;
  cardBrand?: string | null;
  cardLast4?: string | null;
  /** O cartão expira antes de C: o E1 pede para o atualizar. */
  cardExpiresBeforeCharge: boolean;
  /** Link da página da 2.ª parte (balanceLinkUrl). */
  link: string;
  /** O "agora" que decide se "amanhã"/"uma semana" é verdade (testes). */
  now?: Date;
}): Promise<boolean> {
  const tag = `[Balance E${d.stage === 2 ? 2 : 1}]`;
  try {
    const link = safeGuestLink(d.link);
    if ((d.stage !== 1 && d.stage !== 2) || !validCents(d.amountCents) || !isValidDate(d.chargeAt) || !link) {
      console.error(`${tag} dados inválidos (valor, data ou link): não enviado`);
      return false;
    }
    const days = lisbonDaysUntil(d.chargeAt, d.now ?? new Date());
    // O E2 diz "amanhã": só sai na véspera (Lisboa). O E1 precisa de pelo
    // menos 2 dias; mais perto disso, o lembrete certo é o E2.
    if (d.stage === 2 ? days !== 1 : days < 2) {
      console.warn(`${tag} fora de tempo (${days} dias até à cobrança): não enviado`);
      return false;
    }
    const { lang, P, house, houseHtml, greeting } = balanceContext(d);
    const last4 = cleanLast4(d.cardLast4);
    const amount = eurCents(d.amountCents, lang);
    const date = lisbonDay(d.chargeAt, lang);
    const subject = d.stage === 2
      ? P.remind1Subject(house)
      : days === 7 ? P.remind7Subject(house) : P.remindSubjectDated(house, date);
    const headline = d.stage === 2 ? P.remind1Headline(amount) : P.remind7Headline(date, amount);
    const paragraphs = [
      P.remindBody({
        greeting, date, amount, last4, house: houseHtml,
        checkIn: balanceStayDay(d.checkIn, lang), checkOut: balanceStayDay(d.checkOut, lang),
      }),
    ];
    if (d.cardExpiresBeforeCharge && last4) paragraphs.push(P.cardExpires(last4, date));
    if (d.stage === 1) paragraphs.push(P.limitTip);
    const html = renderBalanceEmail({
      lang,
      preheader: headline,
      headline,
      paragraphs,
      card: balanceCard(houseHtml, stayDates(lang, d.checkIn, d.checkOut), [
        [P.amountLabel, amount],
        [P.chargeDateLabel, date],
        [P.cardLabel, cardText(d.cardBrand, last4)],
      ]),
      cta: { label: P.planCta, url: link },
    });
    return await deliverBalanceEmail(d.email, subject, html, tag);
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}

/**
 * E3: aviso escrito de falha, no próprio dia (é este envio que conta os
 * 7 dias da regra Visa). Variantes: soft (retentativas automáticas), auth
 * (o banco pede 3DS no mesmo cartão), hard (outro cartão; lost/stolen/
 * fraudulent chegam aqui sem a causa). auth e hard nunca prometem nova
 * tentativa; soft só promete as que ainda caem antes de H.
 */
export async function sendBalanceFailed(d: {
  variant: "soft" | "auth" | "hard";
  email: string;
  locale?: string | null;
  guestFirstName?: string | null;
  propertyName?: string | null;
  checkIn: string;
  amountCents: number;
  nextRetryAt: Date | null;
  hardStopAt: Date;
  freeCancelDeadlineAt: Date;
  cardLast4?: string | null;
  link: string;
  /** Todas as retentativas automáticas que ainda faltam, por ordem (opcional;
   *  sem isto vale só nextRetryAt). */
  retryAts?: Date[] | null;
  /** O que já foi pago (1.ª parte), para dizer o valor a devolver. */
  amountPaidCents?: number | null;
  now?: Date;
}): Promise<boolean> {
  const tag = `[Balance E3 ${d.variant}]`;
  try {
    const link = safeGuestLink(d.link);
    const now = d.now ?? new Date();
    if (
      !["soft", "auth", "hard"].includes(d.variant) || !validCents(d.amountCents) ||
      !isValidDate(d.hardStopAt) || !isValidDate(d.freeCancelDeadlineAt) || !link
    ) {
      console.error(`${tag} dados inválidos (valor, prazos ou link): não enviado`);
      return false;
    }
    if (d.hardStopAt.getTime() <= now.getTime()) {
      // Um aviso com um prazo já passado não dá os 7 dias a ninguém.
      console.error(`${tag} H já passou: aviso não enviado`);
      return false;
    }
    const { lang, P, houseHtml, greeting } = balanceContext(d);
    const last4 = cleanLast4(d.cardLast4);
    const amount = eurCents(d.amountCents, lang);
    const deadline = balanceDeadline(d.hardStopAt, lang);
    const slots = { greeting, amount, last4 };
    const retries = d.variant === "soft"
      ? (d.retryAts?.length ? d.retryAts : d.nextRetryAt ? [d.nextRetryAt] : [])
          .filter(isValidDate)
          .filter((r) => r.getTime() > now.getTime() && r.getTime() < d.hardStopAt.getTime())
          .sort((a, b) => a.getTime() - b.getTime())
      : [];
    const body = d.variant === "auth" ? P.failedBodyAuth(slots) : d.variant === "hard" ? P.failedBodyHard(slots) : P.failedBody(slots);
    const deadlineLine = retries.length
      ? P.deadlineSoft(deadline, retries.map((r) => lisbonDay(r, lang)))
      : P.deadlineHard(deadline);
    const paid = validCents(d.amountPaidCents) ? eurCents(d.amountPaidCents, lang) : null;
    const headline = d.variant === "auth" ? P.failedHeadlineAuth : P.failedHeadline;
    const cta = d.variant === "auth" ? P.failedCtaAuth(last4) : d.variant === "hard" ? P.failedCtaHard : P.failedCta;
    const html = renderBalanceEmail({
      lang,
      preheader: headline,
      headline,
      paragraphs: [body, deadlineLine, P.consequence(paid)],
      card: balanceCard(houseHtml, stayDates(lang, d.checkIn), [
        [P.amountLabel, amount],
        [P.cardLabel, last4 ? `••••${last4}` : null],
        [P.payByLabel, deadline],
        [P.freeCancelLabel, balanceDeadline(d.freeCancelDeadlineAt, lang)],
      ]),
      cta: { label: cta, url: link },
      notes: [P.help],
    });
    return await deliverBalanceEmail(d.email, P.failedSubject, html, tag);
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}

/** E3b (H−1): último aviso. Diz "amanhã", por isso só sai na véspera de H. */
export async function sendBalanceLastCall(d: {
  email: string;
  locale?: string | null;
  guestFirstName?: string | null;
  propertyName?: string | null;
  checkIn: string;
  amountCents: number;
  hardStopAt: Date;
  link: string;
  now?: Date;
}): Promise<boolean> {
  const tag = "[Balance E3b]";
  try {
    const link = safeGuestLink(d.link);
    const now = d.now ?? new Date();
    if (!validCents(d.amountCents) || !isValidDate(d.hardStopAt) || !link) {
      console.error(`${tag} dados inválidos (valor, prazo ou link): não enviado`);
      return false;
    }
    if (d.hardStopAt.getTime() <= now.getTime() || lisbonDaysUntil(d.hardStopAt, now) !== 1) {
      console.warn(`${tag} H não é amanhã (Lisboa): não enviado`);
      return false;
    }
    const { lang, P, house, houseHtml, greeting } = balanceContext(d);
    const amount = eurCents(d.amountCents, lang);
    const deadline = balanceDeadline(d.hardStopAt, lang);
    const html = renderBalanceEmail({
      lang,
      preheader: P.lastCallHeadline,
      headline: P.lastCallHeadline,
      paragraphs: [P.lastCallBody(greeting, amount, deadline)],
      card: balanceCard(houseHtml, stayDates(lang, d.checkIn), [
        [P.amountLabel, amount],
        [P.payByLabel, deadline],
      ]),
      cta: { label: P.failedCta, url: link },
      notes: [P.help],
    });
    return await deliverBalanceEmail(d.email, P.lastCallSubject(house), html, tag);
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}

/** E4: a 2.ª parte foi cobrada, a estadia está paga na totalidade. */
export async function sendBalancePaid(d: {
  email: string;
  locale?: string | null;
  guestFirstName?: string | null;
  propertyName?: string | null;
  checkIn: string;
  checkOut: string;
  amountCents: number;
  totalPaidCents: number;
  cardLast4?: string | null;
  confirmationCode?: string | null;
  /** Só depois da verificação (a) da spec 5.13: "a fatura segue em email
   *  separado". Por omissão: "a fatura é emitida após a estadia". */
  invoiceBySeparateEmail?: boolean;
}): Promise<boolean> {
  const tag = "[Balance E4]";
  try {
    if (!validCents(d.amountCents) || !validCents(d.totalPaidCents) || d.totalPaidCents < d.amountCents) {
      console.error(`${tag} valores inválidos: não enviado`);
      return false;
    }
    const { lang, P, house, houseHtml, greeting } = balanceContext(d);
    const last4 = cleanLast4(d.cardLast4);
    const amount = eurCents(d.amountCents, lang);
    const checkIn = balanceStayDay(d.checkIn, lang);
    const code = String(d.confirmationCode ?? "").trim();
    const html = renderBalanceEmail({
      lang,
      preheader: P.paidSubject(houseHtml),
      headline: P.paidHeadline(checkIn),
      paragraphs: [P.paidBody({
        greeting, amount, last4, house: houseHtml, checkIn, checkOut: balanceStayDay(d.checkOut, lang),
        invoiceLine: d.invoiceBySeparateEmail ? P.invoiceSeparate : P.invoiceAfterStay,
      })],
      card: balanceCard(houseHtml, stayDates(lang, d.checkIn, d.checkOut), [
        [P.amountLabel, amount],
        [P.totalPaidLabel, eurCents(d.totalPaidCents, lang)],
        [CONFIRMATION_I18N[lang].confirmationCodeLabel, code ? escapeHtml(code) : null],
      ]),
      whatsapp: true,
    });
    return await deliverBalanceEmail(d.email, P.paidSubject(house), html, tag);
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}

/**
 * E5 (kind "unpaid": cancelada pela PA em H), E7 (kind "guest": cancelada
 * a pedido do hóspede, dentro do prazo) e o da equipa (kind "team": "Devolver
 * tudo" no admin; assunto e título do E5, texto neutro, sem "a seu pedido",
 * sem "dentro do prazo" e sem falta de pagamento). O motor só chama isto
 * depois de o reembolso estar succeeded ou pending (spec 2.4), por isso o
 * texto afirma a devolução sem condicionais.
 */
export async function sendBalanceCancelled(d: {
  kind: "unpaid" | "guest" | "team";
  email: string;
  locale?: string | null;
  guestFirstName?: string | null;
  propertyName?: string | null;
  checkIn: string;
  checkOut: string;
  refundCents: number;
  confirmationCode?: string | null;
  /** E5: o H que passou sem pagamento (sem ele: "dentro do prazo"). */
  deadlineAt?: Date | null;
  /** Últimos 4 dos cartões que recebem a devolução, por ordem (1.ª parte,
   *  depois a 2.ª se foi paga noutro cartão). Vazia: "o cartão com que pagou". */
  refundCardsLast4?: string[] | null;
  /** Número da nota de crédito, quando já emitida. */
  creditNoteRef?: string | null;
}): Promise<boolean> {
  const tag = `[Balance ${d.kind === "guest" ? "E7" : d.kind === "team" ? "E5/equipa" : "E5"}]`;
  try {
    if ((d.kind !== "unpaid" && d.kind !== "guest" && d.kind !== "team") || !validCents(d.refundCents, true)) {
      console.error(`${tag} dados inválidos: não enviado`);
      return false;
    }
    const { lang, P, house, houseHtml, greeting } = balanceContext(d);
    // Só 4 dígitos, sem repetidos e pela ordem recebida (o que não for 4
    // dígitos sai: melhor sem número do que com um número errado).
    const cards = (Array.isArray(d.refundCardsLast4) ? d.refundCardsLast4 : [])
      .map(cleanLast4)
      .filter((l, i, all): l is string => !!l && all.indexOf(l) === i);
    const refund = d.refundCents > 0 ? eurCents(d.refundCents, lang) : null;
    const creditNote = String(d.creditNoteRef ?? "").trim() ? escapeHtml(String(d.creditNoteRef).trim()) : null;
    const code = String(d.confirmationCode ?? "").trim();
    const checkIn = balanceStayDay(d.checkIn, lang);
    const checkOut = balanceStayDay(d.checkOut, lang);
    const guestSlots = { greeting, house: houseHtml, checkIn, checkOut, refund, cards, creditNote };
    const headline = d.kind === "guest" ? P.guestCancelledHeadline : P.cancelledHeadline;
    const paragraphs =
      d.kind === "unpaid"
        ? [
            P.cancelledBody({
              greeting, house: houseHtml, refund, cards, creditNote,
              deadline: isValidDate(d.deadlineAt) ? balanceDeadline(d.deadlineAt, lang) : null,
            }),
            P.rebook,
          ]
        : d.kind === "team"
          ? [P.teamCancelledBody(guestSlots)]
          : [P.guestCancelledBody(guestSlots)];
    const html = renderBalanceEmail({
      lang,
      preheader: headline,
      headline,
      paragraphs,
      card: balanceCard(houseHtml, stayDates(lang, d.checkIn, d.checkOut), [
        [P.refundLabel, refund],
        [CONFIRMATION_I18N[lang].confirmationCodeLabel, code ? escapeHtml(code) : null],
      ]),
      whatsapp: true,
    });
    const subject = d.kind === "guest" ? P.guestCancelledSubject(house) : P.cancelledSubject(house);
    return await deliverBalanceEmail(d.email, subject, html, tag);
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}

/** E6: o hóspede trocou o cartão da 2.ª parte pelo link (spec 4.2). */
export async function sendBalanceCardUpdated(d: {
  email: string;
  locale?: string | null;
  guestFirstName?: string | null;
  propertyName?: string | null;
  checkIn: string;
  checkOut?: string | null;
  amountCents: number;
  chargeAt: Date;
  cardBrand?: string | null;
  cardLast4: string;
  link?: string | null;
}): Promise<boolean> {
  const tag = "[Balance E6]";
  try {
    const last4 = cleanLast4(d.cardLast4);
    if (!validCents(d.amountCents) || !isValidDate(d.chargeAt) || !last4) {
      console.error(`${tag} dados inválidos: não enviado`);
      return false;
    }
    const { lang, P, houseHtml, greeting } = balanceContext(d);
    const date = lisbonDay(d.chargeAt, lang);
    const link = safeGuestLink(d.link);
    const html = renderBalanceEmail({
      lang,
      preheader: P.cardUpdatedSubject,
      headline: P.cardUpdatedSubject,
      paragraphs: [`${greeting} ${P.cardUpdatedBody(last4, date)}`],
      card: balanceCard(houseHtml, stayDates(lang, d.checkIn, d.checkOut), [
        [P.amountLabel, eurCents(d.amountCents, lang)],
        [P.chargeDateLabel, date],
        [P.cardLabel, cardText(d.cardBrand, last4)],
      ]),
      cta: link ? { label: P.planCta, url: link } : null,
    });
    return await deliverBalanceEmail(d.email, P.cardUpdatedSubject, html, tag);
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}

/** S1 (falha) ou S2 (véspera de H): o texto e o envio vivem em sms.ts, para
 *  o motor os poder chamar sem passar pelo módulo de email. true só se o
 *  fornecedor aceitou; nunca lança. */
export async function sendBalanceSms(d: {
  kind: "failed" | "lastCall";
  phone: string | null | undefined;
  locale?: string | null;
  propertyName?: string | null;
  hardStopAt: Date;
  link: string;
  now?: Date;
}): Promise<boolean> {
  const { kind, ...rest } = d;
  return kind === "lastCall" ? sendBalanceLastCallSms(rest) : sendBalanceFailedSms(rest);
}

/* ── Digest diário das duas partes (spec 3.3), só para a equipa, em pt-PT ── */

type ScheduledStatus = CheckoutScheduledPayment["status"];

/** Linha tal como sai de listBalanceDigest (campos em falta toleram-se). */
export type BalanceDigestRow = Partial<CheckoutScheduledPayment> & { id: string };

export interface BalanceDigestData {
  /** Instante do digest (o motor também o pode mandar como generatedAt). */
  now?: Date;
  generatedAt?: Date;
  /** false marca o digest como de TESTE; ausente = sem marca. */
  livemode?: boolean;
  siteOrigin?: string;
  counts: Partial<Record<ScheduledStatus, number>>;
  upcoming7d: BalanceDigestRow[];
  failing: BalanceDigestRow[];
  review: BalanceDigestRow[];
  cancelled24h: BalanceDigestRow[];
  postChargeIncomplete: BalanceDigestRow[];
  stuckCharging: BalanceDigestRow[];
  /** Cancelamentos parados há mais de 30 min (Guesty ou reembolso por fazer). */
  stuckCancelling?: BalanceDigestRow[];
  /** Opcional: cobradas nas últimas 24 h. */
  succeeded24h?: BalanceDigestRow[];
  /** Reembolsos falhados ainda por resolver (refund_status fora de
   *  succeeded/pending/nothing/manual), em qualquer estado e de qualquer data. */
  refundFailures?: BalanceDigestRow[];
  /** Último sweep (balance_sweep_last_run_at). */
  heartbeatAt?: Date | null;
  /** CHECKOUT_BALANCE ligado. Desligado (o kill switch), o motor não cobra,
   *  não avisa e não cancela: o digest abre com isso. */
  chargesEnabled?: boolean;
  /** Linhas extra do motor, já em texto simples. */
  notes?: string[];
}

const STATUS_PT: Record<ScheduledStatus, string> = {
  scheduled: "agendado", charging: "a cobrar", retry: "nova tentativa marcada",
  needs_action: "a resolver pelo hóspede", succeeded: "cobrado", paid_externally: "pago por fora",
  needs_review: "a resolver por nós", cancelling: "a cancelar", cancelled_unpaid: "cancelado por falta de pagamento",
  cancelled_by_guest: "cancelado pelo hóspede",
};

/** Motivo da recusa em português simples (só para a equipa). */
function declinePt(code: string | null | undefined): string {
  const c = String(code ?? "").toLowerCase();
  if (!c) return "sem código";
  if (c === "insufficient_funds") return "saldo insuficiente";
  if (c === "authentication_required") return "o banco pede autenticação (3DS)";
  if (c === "expired_card") return "cartão expirado";
  if (["lost_card", "stolen_card", "fraudulent", "pickup_card", "restricted_card"].includes(c)) {
    return "recusa grave do banco (não dizer o motivo ao hóspede)";
  }
  if (c === "card_velocity_exceeded") return "limite do cartão excedido";
  if (["generic_decline", "do_not_honor"].includes(c)) return "recusa genérica do banco";
  if (["processing_error", "try_again_later"].includes(c)) return "erro temporário do banco";
  return c;
}

function digestDateTime(at: unknown): string {
  if (!isValidDate(at)) return "?";
  return new Intl.DateTimeFormat("pt-PT", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: LISBON_TZ,
  }).format(at);
}

/** "2 500 €" (o pt-PT do ICU não agrupa 4 algarismos por omissão). */
function eurPtGrouped(cents: number): string {
  const digits = cents % 100 === 0 ? 0 : 2;
  return new Intl.NumberFormat("pt-PT", {
    style: "currency", currency: "EUR", minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: "always",
  }).format(cents / 100);
}

export async function sendBalanceDigest(d: BalanceDigestData): Promise<boolean> {
  try {
    const now = isValidDate(d.now) ? d.now : isValidDate(d.generatedAt) ? d.generatedAt : new Date();
    const esc = (v: unknown) => escapeHtml(String(v ?? ""));
    const rowsOf = (v: BalanceDigestRow[] | undefined) => (Array.isArray(v) ? v : []);
    const ref = (r: BalanceDigestRow) =>
      [r.confirmationCode || r.reservationId || r.intentId?.slice(0, 8) || r.id.slice(0, 8), r.propertyName, r.checkIn ? `check-in ${r.checkIn}` : ""]
        .filter(Boolean).map(esc).join(" · ");
    const money = (c: unknown) => (Number.isSafeInteger(c) ? `${((c as number) / 100).toFixed(2)} EUR` : "? EUR");
    const ageDays = (r: BalanceDigestRow) => {
      const since = r.updatedAt ?? r.createdAt;
      return isValidDate(since) ? Math.max(0, Math.floor((now.getTime() - since.getTime()) / 86_400_000)) : null;
    };
    const block = (title: string, items: string[]) =>
      `<strong>${title} (${items.length})</strong><br>${items.length ? items.map((t) => `• ${t}`).join("<br>") : "nada"}`;

    const today = lisbonYmd(now);
    const tomorrow = lisbonYmd(new Date(now.getTime() + 86_400_000));
    const upcoming = rowsOf(d.upcoming7d);
    const failing = rowsOf(d.failing);
    const due = (r: BalanceDigestRow) => (isValidDate(r.nextAttemptAt) ? r.nextAttemptAt : r.chargeAt);
    const chargingToday = [...upcoming, ...failing.filter((r) => r.status === "retry")]
      .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
      .filter((r) => isValidDate(due(r)) && lisbonYmd(due(r) as Date) === today);
    const chargingTodayCents = chargingToday.reduce((s, r) => s + (Number(r.balanceCents) || 0), 0);
    // Só cancela sozinha a linha cujo aviso escrito de 7 dias cabe antes de H
    // (spec 2.3); as outras vão para decisão humana antes de D (C28).
    const noticeFits = (r: BalanceDigestRow) =>
      isValidDate(r.failureNoticeSentAt) && isValidDate(r.hardStopAt) &&
      r.failureNoticeSentAt.getTime() + TWO_PARTS_RULES.noticeDays * 86_400_000 <= r.hardStopAt.getTime();
    const hAhead = (r: BalanceDigestRow) => isValidDate(r.hardStopAt) && r.hardStopAt.getTime() > now.getTime();
    const autoCancel = failing.filter((r) => hAhead(r) && noticeFits(r));
    const humanDecision = failing.filter((r) => hAhead(r) && !noticeFits(r));
    const in48h = autoCancel.filter((r) => (r.hardStopAt as Date).getTime() <= now.getTime() + 48 * 3600_000);
    // Amanhã no calendário de Lisboa (não "até amanhã": H de hoje às 12:00 não conta).
    const cancelTomorrow = autoCancel.filter((r) => lisbonYmd(r.hardStopAt as Date) === tomorrow);
    const cancelled = rowsOf(d.cancelled24h);
    const stuckCancelling = rowsOf(d.stuckCancelling);
    const refundFailures = rowsOf(d.refundFailures);
    const REFUND_OK = ["succeeded", "pending", "nothing", "manual"];
    // Reembolsos por confirmar das linhas do dia (fechadas há menos de 24 h ou
    // paradas em "a cancelar") que não estejam já em REEMBOLSOS POR RESOLVER.
    const refundOpen = [...cancelled, ...stuckCancelling]
      .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i)
      .filter((r) => r.refundStatus && !REFUND_OK.includes(String(r.refundStatus)))
      .filter((r) => !refundFailures.some((x) => x.id === r.id));

    const ours = [
      ...rowsOf(d.review).map((r) => {
        const age = ageDays(r);
        const paid = isValidDate(r.succeededAt) ? ` · 2.ª parte JÁ PAGA pela plataforma (${money(r.balanceCents)}): manter = Retomar; cancelar = Devolver tudo` : "";
        return `${ref(r)} · ${esc(r.reviewReason || "sem motivo")}${paid}${age != null ? ` · há ${age} dia(s)` : ""} · decidir até ${digestDateTime(r.reviewDueAt)}`;
      }),
      ...refundOpen.map((r) => `${ref(r)} · REEMBOLSO por confirmar (${esc(r.refundStatus || "sem estado")}, ${money(r.refundCents)}, ${esc(r.refundId || "sem id")})`),
      ...rowsOf(d.postChargeIncomplete).map((r) => {
        const missing = [!r.guestyBalanceRecordedAt && "registo no Guesty", !r.noteClaimedAt && "nota na reserva", !r.emailPaidClaimedAt && "email E4"].filter(Boolean).join(", ");
        return `${ref(r)} · cobrado ${money(r.balanceCents)} mas falta: ${missing || "?"}${r.lastError ? ` · ${esc(r.lastError)}` : ""}`;
      }),
      ...rowsOf(d.stuckCharging).map((r) => `${ref(r)} · PRESA em "a cobrar" desde ${digestDateTime(r.claimedAt)} (${esc(r.claimSource || "?")})`),
      ...stuckCancelling
        .filter((r) => !refundOpen.some((x) => x.id === r.id) && !refundFailures.some((x) => x.id === r.id))
        .map((r) => `${ref(r)} · CANCELAMENTO parado: ${r.guestyCancelledAt ? "reembolso" : "cancelamento no Guesty"} por fazer (${esc(r.reviewReason || "?")})`),
    ];
    const refundItems = refundFailures.map((r) =>
      `${ref(r)} · ${esc(STATUS_PT[r.status as ScheduledStatus] ?? r.status ?? "?")} · reembolso ${money(r.refundCents)} FALHOU (${esc(r.refundStatus || "?")}, ${esc(r.refundId || "sem id")}) · devolver por outra via e marcar como resolvido no admin`,
    );
    const humanItems = humanDecision.map((r) =>
      `${ref(r)} · ${money(r.balanceCents)} por pagar · H ${digestDateTime(r.hardStopAt)} sem os 7 dias de aviso escrito cumpridos (aviso ${isValidDate(r.failureNoticeSentAt) ? digestDateTime(r.failureNoticeSentAt) : "por enviar"}): NÃO cancela sozinha · decidir antes de ${digestDateTime(r.freeCancelDeadline)}`,
    );
    // "A RESOLVER POR NÓS" conta também as duas secções que se seguem.
    const oursTotal = ours.length + refundItems.length + humanItems.length;
    /** E3/E3b: 2 = véspera enviada; 3 = véspera fechada sem email. */
    const noticeText = (r: BalanceDigestRow) => {
      const stage = Number(r.failureNoticeStage) || 0;
      if (stage === 3) return `email ${isValidDate(r.failureNoticeSentAt) ? 1 : 0}/2 (véspera sem email)`;
      return `email ${Math.min(stage, 2)}/2`;
    };
    // Com o motor desligado nada cobra nem cancela sozinho: as secções que o
    // dizem trocam de título, e as linhas não prometem tentativas nem
    // cancelamentos que o sweep parado não vai fazer.
    const engineOff = d.chargesEnabled === false;
    const guest = failing.map((r) =>
      `${ref(r)} · ${money(r.balanceCents)} · ${esc(declinePt(r.lastDeclineCode))} · ${engineOff ? (r.status === "retry" ? `tentativa prevista ${digestDateTime(r.nextAttemptAt)} (parada)` : "só o hóspede resolve (link)") : r.status === "retry" ? `próxima tentativa ${digestDateTime(r.nextAttemptAt)}` : "só o hóspede resolve (link)"} · ${engineOff ? "NÃO cancela sozinha (motor desligado), H" : noticeFits(r) ? "cancela" : "NÃO cancela sozinha, H"} ${digestDateTime(r.hardStopAt)} · avisos enviados: ${noticeText(r)}, SMS ${Math.min(Number(r.smsStage) || 0, 2)}/2`,
    );
    const succeeded = rowsOf(d.succeeded24h);
    const upcomingCents = upcoming.reduce((s, r) => s + (Number(r.balanceCents) || 0), 0);
    const counts = Object.entries(d.counts ?? {})
      .filter(([, n]) => Number(n) > 0)
      .map(([s, n]) => `${STATUS_PT[s as ScheduledStatus] ?? esc(s)}: ${Number(n)}`)
      .join(" · ");
    const heartbeat = isValidDate(d.heartbeatAt)
      ? `último sweep ${digestDateTime(d.heartbeatAt)} (há ${Math.max(0, Math.round((now.getTime() - d.heartbeatAt.getTime()) / 60_000))} min)`
      : "último sweep: sem registo";

    const openCount = (["scheduled", "charging", "retry", "needs_action", "needs_review", "cancelling"] as ScheduledStatus[])
      .reduce((n, st) => n + (Number(d.counts?.[st]) || 0), 0);
    const lines = [
      ...(engineOff
        ? [`<strong>MOTOR DESLIGADO: nada é cobrado nem cancelado automaticamente; ${openCount} linhas abertas.</strong><br>Lembretes, avisos de falha e cancelamentos em H também param. Pagamentos feitos pelo hóspede no link continuam a ser registados.`]
        : []),
      `<strong>A RESOLVER POR NÓS (${oursTotal})</strong><br>${ours.length ? ours.map((t) => `• ${t}`).join("<br>") : oursTotal ? "ver as secções abaixo" : "nada"}`,
      ...(refundItems.length ? [block("REEMBOLSOS POR RESOLVER", refundItems)] : []),
      ...(humanItems.length ? [block("DECISÃO HUMANA ANTES DE D", humanItems)] : []),
      block("A RESOLVER PELO HÓSPEDE", guest),
      engineOff
        ? block("H NAS PRÓXIMAS 48 H (motor desligado: NÃO cancelam sozinhas, decidir à mão)", in48h.map((r) => `${ref(r)} · ${money(r.balanceCents)} por pagar · H ${digestDateTime(r.hardStopAt)}`))
        : block("CANCELAM AUTOMATICAMENTE NAS PRÓXIMAS 48 H", in48h.map((r) => `${ref(r)} · ${money(r.balanceCents)} por pagar · cancela e devolve ${digestDateTime(r.hardStopAt)}`)),
      engineOff
        ? block("PREVISTAS PARA HOJE (motor desligado: NÃO são cobradas)", chargingToday.map((r) => `${ref(r)} · ${money(r.balanceCents)} · ${digestDateTime(due(r))}`))
        : block("COBRAM HOJE", chargingToday.map((r) => `${ref(r)} · ${money(r.balanceCents)} · ${digestDateTime(due(r))}`)),
      ...(d.succeeded24h ? [block("COBRADAS NAS ÚLTIMAS 24 H", succeeded.map((r) => `${ref(r)} · ${money(r.balanceCents)} · PI ${esc(r.balancePaymentIntentId || r.guestPaymentIntentId || "?")} · Guesty ${r.guestyBalanceRecordedAt ? "registado" : "POR REGISTAR"}`))] : []),
      block("CANCELADAS NAS ÚLTIMAS 24 H", cancelled.map((r) => `${ref(r)} · ${r.status === "cancelled_by_guest" ? (r.reviewReason === "cancel:admin" ? "pela equipa" : "pelo hóspede") : "por falta de pagamento"} · reembolso ${money(r.refundCents)} (${esc(r.refundStatus || "?")}, ${esc(r.refundId || "sem id")}) · NC ${esc(r.creditNoteRef || "por emitir")}`)),
      `<strong>PRÓXIMOS 7 DIAS</strong><br>${upcoming.length} cobrança(s), ${eurPtGrouped(upcomingCents)}`,
      `<strong>SAÚDE</strong><br>${heartbeat} · motor ${engineOff ? "DESLIGADO (CHECKOUT_BALANCE)" : d.chargesEnabled ? "LIGADO" : "?"} · linhas presas em "a cobrar": ${rowsOf(d.stuckCharging).length}${counts ? `<br>Por estado: ${counts}` : ""}${d.livemode === false ? "<br>modo de TESTE (linhas livemode=0)" : d.livemode ? "<br>modo real" : ""}${d.siteOrigin ? ` · ${esc(d.siteOrigin)}` : ""}`,
      ...(lisbonYmd(now).endsWith("-01")
        ? ["<strong>VERIFICAÇÃO MENSAL</strong><br>Confirmar em Guest payments → Payment automation e em Message automations que nenhuma regra usa All sources e que website-checkout, website-paypal e website-klarna não constam de nenhuma."]
        : []),
      ...(d.notes ?? []).map(esc),
    ];
    const subject = engineOff
      ? `Duas partes${d.livemode === false ? " (TESTE)" : ""} · MOTOR DESLIGADO · ${openCount} linha(s) aberta(s) · ` +
        `A RESOLVER POR NÓS: ${oursTotal} · PREVISTAS HOJE (não cobradas): ${chargingToday.length} · H AMANHÃ: ${cancelTomorrow.length}`
      : `Duas partes${d.livemode === false ? " (TESTE)" : ""} · HOJE: ${chargingToday.length} cobrança(s) (${eurPtGrouped(chargingTodayCents)}) · ` +
        `A RESOLVER POR NÓS: ${oursTotal} · CANCELAM AMANHÃ: ${cancelTomorrow.length}`;
    // O mesmo envio dos alertas (booking@ + cópia à gestão): se o digest das
    // 09:00 não chegar, o sweep está parado (spec 3.1, controlo 9).
    return await sendOpsAlert(subject, lines, { copyToSales: true });
  } catch (err: any) {
    console.error(`[Balance digest] falhou: ${err?.message}`);
    return false;
  }
}


/* ================================================================
   AVAILABILITY REQUEST (internal — to info@portugalactive.com)

   Fires when a guest searched dates the site could not serve and left their
   email. These are the enquiries we used to lose silently: the dates are
   usually blocked by a season rule (Saturday-only arrivals, 7-night minimum),
   not by the house being full — so most are winnable if someone replies while
   the guest is still deciding. Reply-To is the guest, so a reply goes straight
   to them.
   ================================================================ */
/** Availability requests are booking traffic, not general enquiries — the
 *  booking inbox is the one the team works from. Override in Render with
 *  BOOKING_NOTIFICATION_EMAIL if that changes. */
const BOOKING_NOTIFICATION_EMAIL =
  process.env.BOOKING_NOTIFICATION_EMAIL || "booking@portugalactive.com";

export interface AvailabilityRequestData {
  name?: string;
  email: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  nights: string;
}

export async function sendAvailabilityRequestNotification(
  data: AvailabilityRequestData,
): Promise<void> {
  const who = data.name?.trim() || data.email;
  const emailSubject = `Availability request: ${data.checkIn} → ${data.checkOut} · ${data.guests} guests`;

  const row = (label: string, value: string) => `
      <tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:13px;color:#726D63;width:90px;">${label}</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;font-weight:600;">${value}</td>
      </tr>`;

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:22px;color:#1A1A18;margin:0;font-weight:400;">Guest couldn't find these dates</h1>
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#726D63;margin:6px 0 0 0;">The site showed no availability, so they asked us to check. Reply to this email to answer them directly.</p>
</td></tr>

<tr><td style="padding:0 0 20px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${row("Dates", `${data.checkIn} → ${data.checkOut}`)}
      ${row("Nights", data.nights)}
      ${row("Guests", data.guests)}
      ${row("Guest", who)}
      ${row("Email", `<a href="mailto:${data.email}" style="color:#806A48;text-decoration:none;">${data.email}</a>`)}
    </table>
  </td></tr>
</table>
</td></tr>

<tr><td style="padding:0 0 8px 0;">
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#726D63;margin:0;">
    Often the dates are blocked by a season rule (arrival day or minimum stay) rather than by a booking — worth checking the nearest valid window before replying.
  </p>
</td></tr>
`);

  await sendEmail(BOOKING_NOTIFICATION_EMAIL, emailSubject, html, data.email);
}

/* ================================================================
   AVAILABILITY REQUEST — GUEST AUTO-CONFIRMATION

   The guest just told us the site couldn't serve their dates and handed us
   their email. Silence at that moment reads as "nobody's home" — exactly the
   doubt that sends them back to the OTA tab. This lands immediately, from
   booking@ (replies flow straight back into the booking inbox), in the
   guest's language when we know it (pt), English otherwise.
   ================================================================ */
export async function sendAvailabilityRequestConfirmation(data: {
  email: string;
  name?: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  locale?: string;
}): Promise<void> {
  const isPt = (data.locale || "").toLowerCase().startsWith("pt");
  const first = data.name?.trim().split(/\s+/)[0];

  const subject = isPt
    ? `Recebemos o seu pedido — ${data.checkIn} → ${data.checkOut}`
    : `We received your request — ${data.checkIn} → ${data.checkOut}`;

  const greeting = first ? (isPt ? `Olá ${first},` : `Hello ${first},`) : (isPt ? "Olá," : "Hello,");

  const body = isPt
    ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0 0 14px 0;">${greeting}</p>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0 0 14px 0;">Recebemos o seu pedido para <strong>${data.checkIn} → ${data.checkOut}</strong> (${data.guests} hóspedes). A nossa equipa local está a verificar as opções — normalmente respondemos no próprio dia.</p>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0 0 14px 0;">Se preferir falar já connosco, responda a este email ou fale com o nosso concierge no WhatsApp: <a href="https://wa.me/351927161771" style="color:#806A48;">+351 927 161 771</a>.</p>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0;">Portugal Active</p>`
    : `<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0 0 14px 0;">${greeting}</p>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0 0 14px 0;">We received your request for <strong>${data.checkIn} → ${data.checkOut}</strong> (${data.guests} guests). Our local team is checking the options — we usually come back to you the same day.</p>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0 0 14px 0;">If you'd rather talk now, just reply to this email or reach our concierge on WhatsApp: <a href="https://wa.me/351927161771" style="color:#806A48;">+351 927 161 771</a>.</p>
<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0;">Portugal Active</p>`;

  const html = wrapTemplate(`<tr><td style="padding:0 0 8px 0;">${body}</td></tr>`, undefined, isPt);
  await sendEmail(data.email, subject, html, BOOKING_NOTIFICATION_EMAIL);
}

/* ================================================================
   DATES-OPENED ALERT (guest-facing)

   Fired by the cron in dates-opened-alert.ts when a cancellation frees the
   exact dates a guest once asked about. No OTA sends this on our behalf; it
   is the highest-intent email this system can produce — the guest already
   told us the dates, the party size, and their email.
   ================================================================ */
export async function sendDatesOpenedEmail(data: {
  email: string;
  name?: string;
  checkIn: string;
  checkOut: string;
  guests: string;
  locale?: string;
  homes: Array<{ name: string; slug: string }>;
}): Promise<void> {
  const isPt = (data.locale || "").toLowerCase().startsWith("pt");
  const lang = isPt ? "pt" : "en";
  const first = data.name?.trim().split(/\s+/)[0];
  const link = `https://www.portugalactive.com/${lang}/homes?checkin=${data.checkIn}&checkout=${data.checkOut}&guests=${encodeURIComponent(data.guests)}`;
  const homeNames = data.homes.map(h => h.name).join(" · ");

  const subject = isPt
    ? `Boas notícias — as suas datas abriram (${data.checkIn} → ${data.checkOut})`
    : `Good news — your dates just opened (${data.checkIn} → ${data.checkOut})`;

  const greeting = first ? (isPt ? `Olá ${first},` : `Hello ${first},`) : (isPt ? "Olá," : "Hello,");
  const P = (t: string) => `<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;line-height:1.7;margin:0 0 14px 0;">${t}</p>`;

  const body = isPt
    ? P(greeting) +
      P(`Quando nos contactou, não tínhamos disponibilidade para <strong>${data.checkIn} → ${data.checkOut}</strong> (${data.guests} hóspedes). Acabou de abrir — nomeadamente em: <strong>${homeNames}</strong>.`) +
      P(`<a href="${link}" style="display:inline-block;background:#1A1A18;color:#FFFFFF;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:0.08em;">VER DISPONIBILIDADE</a>`) +
      P(`As datas boas voltam a desaparecer depressa — se preferir, responda a este email ou fale connosco no WhatsApp: <a href="https://wa.me/351927161771" style="color:#806A48;">+351 927 161 771</a>.`) +
      P(`Portugal Active`)
    : P(greeting) +
      P(`When you reached out, we had no availability for <strong>${data.checkIn} → ${data.checkOut}</strong> (${data.guests} guests). It just opened — specifically at: <strong>${homeNames}</strong>.`) +
      P(`<a href="${link}" style="display:inline-block;background:#1A1A18;color:#FFFFFF;text-decoration:none;padding:12px 22px;font-size:13px;letter-spacing:0.08em;">SEE AVAILABILITY</a>`) +
      P(`Good dates tend to disappear again quickly — reply to this email or reach us on WhatsApp: <a href="https://wa.me/351927161771" style="color:#806A48;">+351 927 161 771</a>.`) +
      P(`Portugal Active`);

  const html = wrapTemplate(`<tr><td style="padding:0 0 8px 0;">${body}</td></tr>`, undefined, isPt);
  await sendEmail(data.email, subject, html, BOOKING_NOTIFICATION_EMAIL);
}


/** Partner enquiries are requests, never reservations. Provider acceptance is
 * recorded separately from delivery; DEV must never pretend an email was sent. */
export async function sendPartnerRequestEmail(data: {
  id: number; email: string; name?: string | null; phone?: string | null;
  message?: string | null; metadata: Record<string, string>;
}, channel: "team" | "guest"): Promise<string> {
  if (isPreviewDeployment() || !resend) throw new Error("PARTNER_EMAIL_UNAVAILABLE");
  const esc = (s: string | null | undefined) => (s || "—").replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
  const m = data.metadata;
  const pt = channel === "team" || m.locale?.startsWith("pt");
  const title = channel === "team" ? `Pedido de casa parceira #${data.id}` : pt ? "Recebemos o seu pedido" : "We received your request";
  const subject = `${title} · ${m.propertyName || m.property}`.replace(/[\r\n]/g, " ");
  const rows = [
    [pt ? "Casa" : "Home", m.propertyName || m.property],
    [pt ? "Entrada" : "Check-in", m.checkin], [pt ? "Saída" : "Check-out", m.checkout],
    [pt ? "Hóspedes" : "Guests", m.guests],
    ...(channel === "team" ? [["Nome", data.name], ["Email", data.email], ["Telefone", data.phone],
      ["Valor apresentado (EUR, por confirmar)", m.total], ["Estado do orçamento", m.quoteStatus || "unknown"]] : []),
    [pt ? "Mensagem" : "Message", data.message],
  ];
  const intro = channel === "team"
    ? "Pedido guardado no painel de leads. Contactar o hóspede e confirmar disponibilidade, encargos e total com o parceiro antes de propor a reserva."
    : pt ? "O seu pedido ficou registado. A nossa equipa irá verificar a disponibilidade e o total final com a casa. A reserva ainda não está confirmada e não foi efetuado qualquer pagamento."
      : "Your request has been saved. Our team will check availability and the final total with the home. This is not a confirmed reservation and no payment has been taken.";
  const html = wrapTemplate(`<h1>${esc(title)}</h1><p>${intro}</p><table>${rows.map(([label, value]) =>
    `<tr><td style="padding:8px;vertical-align:top">${esc(label)}</td><td style="padding:8px;white-space:pre-wrap">${esc(value)}</td></tr>`).join("")}</table><p>${pt ? "Referência" : "Reference"}: PA-${data.id}</p>`, title, !!pt);
  const { data: result, error } = await resend.emails.send({
    from: FROM_EMAIL, to: channel === "team" ? BOOKING_NOTIFICATION_EMAIL : data.email,
    replyTo: channel === "team" ? data.email : BOOKING_NOTIFICATION_EMAIL, subject, html,
  }, { idempotencyKey: `partner-request-${data.id}-${channel}-v1` });
  if (error || !result?.id) throw new Error("PARTNER_EMAIL_REJECTED");
  console.info(`[Partner request] provider accepted lead=${data.id} channel=${channel}`);
  return result.id;
}

/* ── Fase 2b: novo link da página do saldo ("Enviar novo link") ── */

const BALANCE_LINK_I18N: Record<EmailLang, { subject: (house: string) => string; headline: string; body: (greeting: string, house: string) => string; cta: string; note: string }> = {
  pt: {
    subject: (h) => `O seu link para a segunda parte · ${h}`,
    headline: "O seu link novo",
    body: (g, h) => `${g} Aqui está o link novo para a segunda parte da sua estadia em ${h}. Nesta página pode pagar, mudar de cartão ou cancelar dentro do prazo.`,
    cta: "Abrir a página",
    note: "Se não pediu este link, pode ignorar este email.",
  },
  en: {
    subject: (h) => `Your link for the second part · ${h}`,
    headline: "Your new link",
    body: (g, h) => `${g} Here is your new link for the second part of your stay at ${h}. On this page you can pay, change your card or cancel within the deadline.`,
    cta: "Open the page",
    note: "If you did not ask for this link, you can ignore this email.",
  },
  es: {
    subject: (h) => `Su enlace para la segunda parte · ${h}`,
    headline: "Su nuevo enlace",
    body: (g, h) => `${g} Aquí tiene el nuevo enlace para la segunda parte de su estancia en ${h}. En esta página puede pagar, cambiar de tarjeta o cancelar dentro del plazo.`,
    cta: "Abrir la página",
    note: "Si no ha pedido este enlace, puede ignorar este correo.",
  },
  fr: {
    subject: (h) => `Votre lien pour la seconde partie · ${h}`,
    headline: "Votre nouveau lien",
    body: (g, h) => `${g} Voici votre nouveau lien pour la seconde partie de votre séjour à ${h}. Sur cette page, vous pouvez payer, changer de carte ou annuler dans les délais.`,
    cta: "Ouvrir la page",
    note: "Si vous n'avez pas demandé ce lien, vous pouvez ignorer cet e-mail.",
  },
  it: {
    subject: (h) => `Il suo link per la seconda parte · ${h}`,
    headline: "Il suo nuovo link",
    body: (g, h) => `${g} Ecco il nuovo link per la seconda parte del suo soggiorno a ${h}. In questa pagina può pagare, cambiare carta o cancellare entro la scadenza.`,
    cta: "Apri la pagina",
    note: "Se non ha richiesto questo link, può ignorare questa email.",
  },
  de: {
    subject: (h) => `Ihr Link für den zweiten Teil · ${h}`,
    headline: "Ihr neuer Link",
    body: (g, h) => `${g} Hier ist Ihr neuer Link für den zweiten Teil Ihres Aufenthalts in ${h}. Auf dieser Seite können Sie bezahlen, die Karte wechseln oder innerhalb der Frist stornieren.`,
    cta: "Seite öffnen",
    note: "Wenn Sie diesen Link nicht angefordert haben, können Sie diese E-Mail ignorieren.",
  },
  nl: {
    subject: (h) => `Uw link voor het tweede deel · ${h}`,
    headline: "Uw nieuwe link",
    body: (g, h) => `${g} Hier is uw nieuwe link voor het tweede deel van uw verblijf in ${h}. Op deze pagina kunt u betalen, van kaart wisselen of binnen de termijn annuleren.`,
    cta: "Pagina openen",
    note: "Heeft u deze link niet aangevraagd, dan kunt u deze e-mail negeren.",
  },
  sv: {
    subject: (h) => `Din länk för den andra delen · ${h}`,
    headline: "Din nya länk",
    body: (g, h) => `${g} Här är din nya länk för den andra delen av din vistelse i ${h}. På sidan kan du betala, byta kort eller avboka inom tidsfristen.`,
    cta: "Öppna sidan",
    note: "Om du inte har bett om den här länken kan du bortse från mejlet.",
  },
  fi: {
    subject: (h) => `Linkkisi toiseen osaan · ${h}`,
    headline: "Uusi linkkisi",
    body: (g, h) => `${g} Tässä on uusi linkki oleskelusi toiseen osaan kohteessa ${h}. Sivulla voit maksaa, vaihtaa korttia tai peruuttaa määräajan sisällä.`,
    cta: "Avaa sivu",
    note: "Jos et pyytänyt tätä linkkiä, voit jättää tämän viestin huomiotta.",
  },
};

/** Novo link para a página do saldo, sempre para o email da reserva (nunca para outro). */
export async function sendBalanceLinkEmail(d: {
  email: string;
  locale?: string | null;
  guestFirstName?: string | null;
  propertyName?: string | null;
  link: string;
}): Promise<boolean> {
  const tag = "[Balance link]";
  try {
    if (!String(d.link ?? "").startsWith(`${CHECKOUT_EMAIL_ORIGIN}/`)) {
      console.error(`${tag} link fora da origem de produção: não enviado`);
      return false;
    }
    const { lang, house, houseHtml, greeting } = balanceContext(d);
    const L = BALANCE_LINK_I18N[lang];
    const html = renderBalanceEmail({
      lang,
      preheader: L.subject(houseHtml),
      headline: L.headline,
      paragraphs: [L.body(greeting, houseHtml)],
      cta: { label: L.cta, url: d.link },
      notes: [L.note],
      whatsapp: true,
    });
    return await deliverBalanceEmail(d.email, L.subject(house), html, tag);
  } catch (err: any) {
    console.error(`${tag} falhou: ${err?.message}`);
    return false;
  }
}
