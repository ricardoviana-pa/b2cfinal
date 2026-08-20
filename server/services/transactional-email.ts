/**
 * TRANSACTIONAL EMAIL SERVICE
 * Uses Resend when RESEND_API_KEY is set, otherwise logs to console (dev mode).
 */

import { Resend } from "resend";
import {
  emailLang,
  skuNameFor,
  INTL_TAG,
  RECOVERY_I18N,
  CONFIRMATION_I18N,
  type EmailLang,
} from "./email-i18n";

const resendKey = process.env.RESEND_API_KEY;
const isProduction = !!resendKey;
const resend = resendKey ? new Resend(resendKey) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "Portugal Active <booking@portugalactive.com>";

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

<!-- Brand band: dark ground with the white site logo -->
<tr><td style="background:#FDFBF7;text-align:center;padding:24px 20px 18px;border-radius:10px 10px 0 0;">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:.24em;color:#1A1A18;">PORTUGAL&nbsp;ACTIVE</div>
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
${brandFooter(pt)}

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
}

export async function sendBookingConfirmation(data: BookingConfirmationData): Promise<void> {
  const subject = `Your stay at ${data.propertyName} is confirmed`;
  const waLink = `https://wa.me/351927161771?text=${encodeURIComponent(`Hi, I just booked ${data.propertyName} (${data.confirmationCode}). Looking forward to my stay!`)}`;

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:26px;color:#1A1A18;margin:0;font-weight:400;">Your stay is confirmed.</h1>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Arial,sans-serif;font-size:15px;color:#6B6860;line-height:1.6;margin:0;">
    Dear ${data.guestName.split(" ")[0]}, thank you for choosing Portugal Active. We are preparing everything for your arrival.
  </p>
</td></tr>

<!-- Booking details -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Georgia,serif;font-size:18px;color:#1A1A18;margin:0 0 16px 0;">${data.propertyName}</p>
    ${data.destination ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;margin:0 0 12px 0;">${data.destination}</p>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      <tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Check-in</td>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.checkIn}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Check-out</td>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.checkOut}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Guests</td>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${data.guests}</td>
      </tr>
      ${data.totalPrice ? `<tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Total</td>
        <td style="padding:6px 0;font-family:Georgia,serif;font-size:16px;color:#1A1A18;text-align:right;">&euro;${data.totalPrice.toLocaleString()}</td>
      </tr>` : ""}
      <tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">Confirmation</td>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#8B7355;text-align:right;font-weight:600;">${data.confirmationCode}</td>
      </tr>
    </table>
  </td></tr>
</table>
</td></tr>

<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6B6860;line-height:1.6;margin:0;">
    Your dedicated concierge will reach out within 24 hours to help you plan your stay, arrange services, and answer any questions.
  </p>
</td></tr>

<!-- WhatsApp CTA -->
<tr><td style="padding:0 0 10px 0;text-align:center;">
  <a href="${waLink}" target="_blank" style="display:inline-block;background:#1A1A18;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:12px 24px;letter-spacing:0.04em;">CHAT WITH YOUR CONCIERGE</a>
</td></tr>`);

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
    Timestamp: ${data.timestamp} | Alert sent automatically by dev.portugalactive.com
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
}

export async function sendPreArrival(data: PreArrivalData): Promise<void> {
  const subject = `Your stay at ${data.propertyName} begins in 3 days`;
  const phone = data.conciergePhone || "+351 258 358 434";

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:26px;color:#1A1A18;margin:0;font-weight:400;">Your home is being prepared.</h1>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Arial,sans-serif;font-size:15px;color:#6B6860;line-height:1.6;margin:0;">
    Dear ${data.guestName.split(" ")[0]}, your stay at ${data.propertyName} begins on ${data.checkIn}. Our team is preparing everything for your arrival.
  </p>
</td></tr>

<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    ${data.propertyAddress ? `<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;margin:0 0 8px 0;"><strong>Address:</strong> ${data.propertyAddress}</p>` : ""}
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;margin:0 0 8px 0;"><strong>Check-in:</strong> ${data.checkIn}</p>
    <p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;margin:0;"><strong>Concierge:</strong> ${phone}</p>
  </td></tr>
</table>
</td></tr>

<tr><td style="padding:0 0 10px 0;">
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6B6860;line-height:1.6;margin:0;">
    If you need anything before your arrival — grocery delivery, airport transfer, restaurant reservations — just reply to this email or call your concierge directly.
  </p>
</td></tr>`);

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
}

export async function sendPostStay(data: PostStayData): Promise<void> {
  const subject = `How was your stay at ${data.propertyName}?`;
  const reviewUrl = data.reviewLink || "https://g.page/r/portugalactive/review";
  const homesUrl = "https://www.portugalactive.com/homes";

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:26px;color:#1A1A18;margin:0;font-weight:400;">Thank you for staying with us.</h1>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Arial,sans-serif;font-size:15px;color:#6B6860;line-height:1.6;margin:0;">
    Dear ${data.guestName.split(" ")[0]}, we hope you had a wonderful time at ${data.propertyName}. It was a pleasure hosting you.
  </p>
</td></tr>

<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6B6860;line-height:1.6;margin:0;">
    Your feedback means the world to us — and to future guests considering a stay with Portugal Active.
  </p>
</td></tr>

<!-- Review CTA -->
<tr><td style="padding:0 0 16px 0;text-align:center;">
  <a href="${reviewUrl}" target="_blank" style="display:inline-block;background:#1A1A18;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:12px 24px;letter-spacing:0.04em;">LEAVE A REVIEW</a>
</td></tr>

<!-- Explore CTA -->
<tr><td style="padding:0 0 10px 0;text-align:center;">
  <a href="${homesUrl}" target="_blank" style="display:inline-block;background:transparent;color:#8B7355;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:12px 24px;letter-spacing:0.04em;border:1px solid #8B7355;">EXPLORE MORE HOMES</a>
</td></tr>`);

  await sendEmail(data.guestEmail, subject, html);
}

/* ================================================================
   CONTACT FORM INQUIRY (internal — to info@portugalactive.com)
   Reply-To is set to the visitor's email so replies go directly to them.
   ================================================================ */
interface ContactInquiryData {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}

const CONTACT_NOTIFICATION_EMAIL = process.env.CONTACT_NOTIFICATION_EMAIL || "info@portugalactive.com";

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

  await sendEmail(CONTACT_NOTIFICATION_EMAIL, emailSubject, html, data.email);
}

/* ================================================================
   CHECKOUT RECOVERY — Fase 4 (spec §12/§16)
   Two-touch abandonment sequence: a gentle reminder ~1h after the
   guest leaves, and a guaranteed-price nudge ~20h in (the Guesty
   quote dies at ~23h, so the urgency is real, per spec §2).
   PT copy when the intent locale is pt; EN for everything else.
   ================================================================ */
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
  /** Bloco 2: link de opt-out dos lembretes (rodapé). Sem ele o rodapé segue sem link. */
  optoutUrl?: string | null;
  locale?: string | null;
  /** 1 = 1h email, 2 = 20h email */
  stage: 1 | 2;
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
/** Same asset the site header uses (client/src/lib/images.ts logoColor) */
/** Badge da marca (logo com fundo cozido) — imutável em dark mode dos clientes
 *  de email; a versão transparente ficava invisível/encaixotada no Gmail dark. */
const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663406256832/TrgtKZm5wvwi7gPLiBhuvN/portugal-active-logo_0b76cb12.webp";

/** Rodapé de marca partilhado: hairline dourada, badge, contactos, tagline */
function brandFooter(pt: boolean): string {
  return `
<tr><td style="padding:30px 20px 36px;text-align:center;">
  <div style="height:1px;background:#C9A96A;opacity:.5;max-width:120px;margin:0 auto 22px;"></div>
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;letter-spacing:.22em;color:#726D63;">PORTUGAL&nbsp;ACTIVE</div>
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#726D63;margin:14px 0 0;">
    <a href="tel:+351258358434" style="color:#726D63;text-decoration:none;">+351 258 358 434</a>
    &nbsp;·&nbsp;<a href="mailto:booking@portugalactive.com" style="color:#8B7355;text-decoration:none;">booking@portugalactive.com</a>
    &nbsp;·&nbsp;<a href="https://wa.me/351927161771" style="color:#8B7355;text-decoration:none;">WhatsApp</a>
  </p>
  <p style="font-family:Georgia,serif;font-style:italic;font-size:12.5px;color:#9E9A90;margin:10px 0 0;">${pt ? "A privacidade de uma casa. O serviço de um hotel." : "The privacy of a home. The service of a hotel."}</p>
</td></tr>`;
}
/** Site display font with the email-safe serif fallback */
const SERIF = "'Cormorant Garamond',Georgia,'Times New Roman',serif";
const SANS = "'DM Sans',Arial,Helvetica,sans-serif";

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

/** Whole-euro currency in the site's format (formatEur: rounded, 0 decimals) */
function eur(amount: number, lang: EmailLang): string {
  try {
    return new Intl.NumberFormat(INTL_TAG[lang] ?? "en-GB", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    }).format(Math.round(amount));
  } catch {
    return `€${Math.round(amount)}`;
  }
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
  // Bloco 5: 9 línguas pelo locale do intent (fallback EN, como o site)
  const lang = emailLang(data.locale);
  const T = RECOVERY_I18N[lang];
  const house = data.propertyName || CONFIRMATION_I18N[lang].yourHome;
  const firstName = (data.guestFirstName || "").trim().split(" ")[0];

  const subject = data.stage === 1 ? T.subject1(house) : T.subject2(house);

  const greeting = firstName ? T.greetingNamed(firstName) : T.greeting;

  const headline = data.stage === 1 ? T.headline1 : T.headline2;

  const body = data.stage === 1 ? T.body1(greeting, house) : T.body2(greeting, house);

  const cta = T.cta;
  const closing = T.closing;

  const nightsLabel = T.nightsLabel;
  const guestsLabel = T.guestsLabel;
  const cleaningLabel = "Service fee"; // rótulo do site (decisão 12 jul)
  const taxesLabel = T.taxesLabel;
  const totalLabel = "Total";

  // Price lines exactly like the checkout summary (CheckoutPage summaryLines)
  const q = data.quote || {};
  const line = (label: string, value: string) => `
      <tr>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${PA.earth};">${label}</td>
        <td style="padding:5px 0;font-family:${SANS};font-size:13px;color:${PA.dark};text-align:right;">${value}</td>
      </tr>`;
  let priceLines = "";
  if (q.nightlyRate && q.nights && q.totalNights) {
    priceLines += line(`${eur(q.nightlyRate, lang)} × ${q.nights} ${nightsLabel}`, eur(q.totalNights, lang));
  }
  if (q.cleaningFee && q.cleaningFee > 0) priceLines += line(cleaningLabel, eur(q.cleaningFee, lang));
  if (q.taxesAndFees && q.taxesAndFees > 0) priceLines += line(taxesLabel, eur(q.taxesAndFees, lang));

  const total = q.total ?? data.total;
  const destination = data.destination
    ? data.destination.charAt(0).toUpperCase() + data.destination.slice(1)
    : "";

  const guaranteeUntil = data.expiresAt ? formatGuaranteeUntil(data.expiresAt, lang, T.atTime) : "";
  const guaranteeLine = guaranteeUntil
    ? `<tr><td style="padding:14px 24px 0 24px;">
        <p style="font-family:${SANS};font-size:11.5px;color:${PA.gold};line-height:1.5;margin:0;">
          ${T.guaranteedUntil} ${guaranteeUntil}
        </p>
      </td></tr>`
    : "";

  const photo = data.imageUrl
    ? `<tr><td style="border-radius:12px 12px 0 0;overflow:hidden;">
        <img src="${data.imageUrl}" alt="${house}" width="600" style="display:block;width:100%;height:auto;border-radius:12px 12px 0 0;" />
      </td></tr>`
    : "";

  const preheader = data.stage === 1 ? T.preheader1 : T.preheader2;
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:${PA.warm};font-family:${SANS};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PA.warm};">

<!-- Top bar: brand-dark band with the white logo (the logoColor asset is
     white-on-transparent, so it needs the dark background to show) -->
<tr><td style="background:#FDFBF7;padding:22px 20px 18px;text-align:center;">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:.24em;color:#1A1A18;">PORTUGAL&nbsp;ACTIVE</div>
</td></tr>

<tr><td align="center" style="padding:36px 20px 44px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<!-- Headline -->
<tr><td style="padding:0 0 12px 0;">
  <h1 style="font-family:${SERIF};font-size:30px;line-height:1.2;color:${PA.dark};margin:0;font-weight:400;">${headline}</h1>
</td></tr>
<tr><td style="padding:0 0 24px 0;">
  <p style="font-family:${SANS};font-size:15px;color:${PA.earth};line-height:1.65;margin:0;">${body}</p>
</td></tr>

<!-- Summary card: photo + stay + breakdown, mirroring the checkout's lateral summary -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${PA.sand};border-radius:12px;">
  ${photo}
  <tr><td style="padding:22px 24px 4px 24px;">
    <p style="font-family:${SERIF};font-size:21px;line-height:1.3;color:${PA.dark};margin:0;">${house}</p>
    ${destination ? `<p style="font-family:${SANS};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${PA.stoneAA};margin:5px 0 0 0;">${destination}</p>` : ""}
    <p style="font-family:${SANS};font-size:13px;color:${PA.earth};margin:10px 0 0 0;">
      ${formatStayDate(data.checkIn, lang)} &rarr; ${formatStayDate(data.checkOut, lang)} &nbsp;&middot;&nbsp; ${data.guests} ${guestsLabel}
    </p>
  </td></tr>
  ${priceLines ? `<tr><td style="padding:14px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${priceLines}
    </table>
  </td></tr>` : ""}
  ${total ? `<tr><td style="padding:10px 24px 0 24px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${PA.sand};">
      <tr>
        <td style="padding:12px 0 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:${PA.dark};">${totalLabel}</td>
        <td style="padding:12px 0 0 0;font-family:${SANS};font-size:21px;color:${PA.dark};text-align:right;">${eur(total, lang)}</td>
      </tr>
    </table>
  </td></tr>` : ""}
  ${guaranteeLine}
  <tr><td style="padding:0 0 20px 0;"></td></tr>
</table>
</td></tr>

<!-- Resume CTA: full-width black button like the checkout's continue bar -->
<tr><td style="padding:0 0 24px 0;">
  <a href="${data.resumeUrl}" target="_blank" style="display:block;background:${PA.dark};color:#ffffff;font-family:${SANS};font-size:13px;font-weight:600;text-decoration:none;text-align:center;padding:15px 24px;letter-spacing:0.1em;text-transform:uppercase;border-radius:8px;">${cta}</a>
  <p style="text-align:center;margin:14px 0 0;"><a href="https://wa.me/351927161771?text=${encodeURIComponent(T.whatsappMsg(String(data.propertyName ?? house)))}" style="font-family:${SANS};font-size:13px;color:${PA.gold};text-decoration:underline;">${T.whatsappLine}</a></p>
</td></tr>

<tr><td style="padding:0 0 8px 0;">
  <p style="font-family:${SANS};font-size:13.5px;color:${PA.earth};line-height:1.6;margin:0;">${closing}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0 0;"><tr><td style="border-left:2px solid ${PA.gold};padding:2px 0 2px 14px;">
    <p style="font-family:${SANS};font-size:12.5px;color:${PA.stoneAA};margin:0 0 5px 0;">${CONFIRMATION_I18N[lang].regards}</p>
    <p style="font-family:${SERIF};font-size:21px;color:${PA.dark};margin:0;letter-spacing:.2px;">Sara</p>
    <p style="font-family:${SANS};font-size:10.5px;color:${PA.gold};letter-spacing:.16em;text-transform:uppercase;margin:5px 0 0 0;">${CONFIRMATION_I18N[lang].yourConcierge} · Portugal Active</p>
  </td></tr></table>
</td></tr>

<!-- Footer -->
${brandFooter(lang === "pt")}

</table>
</td></tr>
</table>
</body>
</html>`;

  await sendEmail(data.guestEmail, subject, html);
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
  intentId: string;
}): Promise<void> {
  try {
    // Bloco 5: 9 línguas pelo locale do intent (fallback EN, como o site)
    const lang = emailLang(d.locale);
    const C = CONFIRMATION_I18N[lang];
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
    if (q.nightlyRate && q.nights && q.totalNights) {
      priceLines += line(`${eur(q.nightlyRate, lang)} × ${q.nights} ${C.nightsLabel}`, eur(q.totalNights, lang));
    }
    if (q.cleaningFee && q.cleaningFee > 0) priceLines += line("Service fee", eur(q.cleaningFee, lang));
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
     white-on-transparent, so it needs the dark background to show) -->
<tr><td style="background:#FDFBF7;padding:22px 20px 18px;text-align:center;">
  <div style="font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:.24em;color:#1A1A18;">PORTUGAL&nbsp;ACTIVE</div>
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
        <td style="padding:12px 0 0 0;font-family:${SANS};font-size:14px;font-weight:500;color:${PA.dark};">Total</td>
        <td style="padding:12px 0 0 0;font-family:${SANS};font-size:21px;color:${PA.dark};text-align:right;">${eur(total, lang)}</td>
      </tr>
    </table>
  </td></tr>` : ""}
  <tr><td style="padding:0 0 20px 0;"></td></tr>
</table>
</td></tr>

${conciergeBlock}

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
  <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0;"><tr><td style="border-left:2px solid ${PA.gold};padding:2px 0 2px 14px;">
    <p style="font-family:${SANS};font-size:12.5px;color:${PA.stoneAA};margin:0 0 5px 0;">${C.regards}</p>
    <p style="font-family:${SERIF};font-size:21px;color:${PA.dark};margin:0;letter-spacing:.2px;">Sara</p>
    <p style="font-family:${SANS};font-size:10.5px;color:${PA.gold};letter-spacing:.16em;text-transform:uppercase;margin:5px 0 0 0;">${C.yourConcierge} · Portugal Active</p>
  </td></tr></table>
</td></tr>

<!-- Footer -->
${brandFooter(lang === "pt")}

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
}): Promise<void> {
  try {
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
    if (d.canonical) {
      const tot = d.canonical.totalCents / 100;
      const servicos = (d.canonical.lines.reduce((s, l) => s + l.cents, 0) + d.canonical.receptionCents + d.canonical.flexCents) / 100;
      const estadia = tot - servicos;
      row("Total pago", `<strong>${tot.toFixed(2)} EUR</strong>${servicos > 0 ? ` (estadia ${estadia.toFixed(2)} + servicos ${servicos.toFixed(2)})` : ""}`);
    }
    const fmtLine = (e: Record<string, unknown>) =>
      `<p style="font:13px Arial;color:#1A1A18;margin:2px 0;">• ${nice(e.sku)} ${qty(e)} · ${e.amount != null ? amountOf(e) + " EUR" : "sob orcamento"}</p>`;
    // Sempre com a marca: moldura com logo (wrapTemplate) + foto da casa —
    // a equipa reconhece a propriedade num relance (12 jul, Ricardo)
    const photoHtml = d.imageUrl
      ? `<img src="${d.imageUrl}" alt="${d.propertyName || ""}" width="600" style="display:block;width:100%;height:auto;border-radius:8px;margin:0 0 16px;" />`
      : "";
    const html = wrapTemplate(
      `<p style="font:700 10.5px Arial;color:#8B7355;letter-spacing:.16em;margin:0 0 6px;">NOVA RESERVA DIRETA · CHECKOUT 2.0</p>` +
      `<h2 style="font:400 24px Georgia;color:#1A1A18;margin:0 0 16px;">${d.propertyName || ""}</h2>` +
      actionHtml +
      photoHtml +
      `<table>${rows.join("")}</table>` +
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
    const urgentFlag = needs.length || requests.length ? "ACAO ATE 24H — " : "";
    await sendEmail(BOOKING_ALERT_EMAIL, `[CS] ${urgentFlag}Reserva ${d.confirmationCode || d.intentId.slice(0, 8)} · ${d.propertyName || ""}`, html);
    console.info(`[OpsManifest] enviado (intent ${d.intentId}, ${actions.length} acoes)`);
    // Cópia de vendas para a gestão: cada reserva direta com casa, valor e
    // extras — pedido do Ricardo (16 ago) para acompanhar o que o site vende.
    if (SALES_COPY_EMAIL && SALES_COPY_EMAIL !== BOOKING_ALERT_EMAIL) {
      await sendEmail(SALES_COPY_EMAIL, `[Venda direta] ${d.propertyName || ""} · ${d.confirmationCode || d.intentId.slice(0, 8)}`, html).catch((err: any) =>
        console.error(`[OpsManifest] copia de vendas falhou (intent ${d.intentId}):`, err?.message),
      );
    }
  } catch (err: any) {
    console.error(`[OpsManifest] falhou (intent ${d.intentId}):`, err?.message);
  }
}

