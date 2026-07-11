/**
 * TRANSACTIONAL EMAIL SERVICE
 * Uses Resend when RESEND_API_KEY is set, otherwise logs to console (dev mode).
 */

import { Resend } from "resend";

const resendKey = process.env.RESEND_API_KEY;
const isProduction = !!resendKey;
const resend = resendKey ? new Resend(resendKey) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "Portugal Active <info@portugalactive.com>";

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
function wrapTemplate(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#FDFBF7;font-family:Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDFBF7;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

<!-- Logo -->
<tr><td style="padding:0 0 30px 0;text-align:center;">
  <span style="font-family:Georgia,serif;font-size:22px;color:#1A1A18;letter-spacing:0.02em;">Portugal Active</span>
</td></tr>

<!-- Divider -->
<tr><td style="padding:0 0 30px 0;"><div style="height:1px;background:#8B7355;"></div></td></tr>

<!-- Content -->
${content}

<!-- Divider -->
<tr><td style="padding:30px 0 0 0;"><div style="height:1px;background:#8B7355;"></div></td></tr>

<!-- Footer -->
<tr><td style="padding:30px 0 0 0;text-align:center;">
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;margin:0;">Portugal Active</p>
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;margin:4px 0 0 0;">+351 258 358 434 &middot; info@portugalactive.com</p>
  <p style="font-family:Arial,sans-serif;font-size:11px;color:#C4C0B8;margin:16px 0 0 0;">Luxury private villas across Portugal, managed with hotel-grade service.</p>
</td></tr>

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
  resumeUrl: string;
  locale?: string | null;
  /** 1 = 1h email, 2 = 20h email */
  stage: 1 | 2;
}

function formatStayDate(iso: string, locale: "pt" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "pt" ? "pt-PT" : "en-GB", {
      day: "numeric",
      month: "long",
    }).format(new Date(`${iso}T12:00:00Z`));
  } catch {
    return iso;
  }
}

export async function sendCheckoutRecovery(data: CheckoutRecoveryData): Promise<void> {
  const pt = (data.locale || "").toLowerCase().startsWith("pt");
  const lang: "pt" | "en" = pt ? "pt" : "en";
  const house = data.propertyName || (pt ? "a sua casa" : "your home");
  const firstName = (data.guestFirstName || "").trim().split(" ")[0];

  const subject =
    data.stage === 1
      ? pt
        ? `A sua estadia em ${house} está a um passo`
        : `Your stay at ${house} is one step away`
      : pt
        ? `O preço garantido para ${house} termina em breve`
        : `Your guaranteed price for ${house} ends soon`;

  const greeting = firstName
    ? pt ? `Olá ${firstName},` : `Hello ${firstName},`
    : pt ? "Olá," : "Hello,";

  const headline =
    data.stage === 1
      ? pt ? "O seu preço está garantido." : "Your price is guaranteed."
      : pt ? "O seu preço garantido termina em breve." : "Your guaranteed price ends soon.";

  const body =
    data.stage === 1
      ? pt
        ? `${greeting} guardámos tudo tal como deixou. Pode retomar a sua reserva em ${house} a qualquer momento, no mesmo dispositivo ou noutro, exatamente onde parou.`
        : `${greeting} we kept everything exactly as you left it. You can pick up your booking at ${house} anytime, on this device or another, right where you stopped.`
      : pt
        ? `${greeting} o preço garantido da sua estadia em ${house} termina dentro de algumas horas. Depois disso teremos de calcular um novo valor, e as datas continuam abertas a outros hóspedes até ao pagamento.`
        : `${greeting} your booking at ${house} is still saved, but the guaranteed price ends in a few hours. After that we will need to work out a new rate for your dates.`;

  const cta = pt ? "RETOMAR A MINHA RESERVA" : "RESUME MY BOOKING";
  const labels = pt
    ? { checkIn: "Check-in", checkOut: "Check-out", guests: "Hóspedes", total: "Total" }
    : { checkIn: "Check-in", checkOut: "Check-out", guests: "Guests", total: "Total" };
  const closing = pt
    ? "Se tiver alguma dúvida, basta responder a este email. A nossa equipa ajuda com todo o gosto."
    : "If you have any questions, just reply to this email. Our team is happy to help.";

  const detailRow = (k: string, v: string) => `
      <tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">${k}</td>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${v}</td>
      </tr>`;

  const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:26px;color:#1A1A18;margin:0;font-weight:400;">${headline}</h1>
</td></tr>
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Arial,sans-serif;font-size:15px;color:#6B6860;line-height:1.6;margin:0;">${body}</p>
</td></tr>

<!-- Stay details -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Georgia,serif;font-size:18px;color:#1A1A18;margin:0 0 16px 0;">${house}</p>
    ${data.destination ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;margin:-8px 0 12px 0;">${data.destination}</p>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${detailRow(labels.checkIn, formatStayDate(data.checkIn, lang))}
      ${detailRow(labels.checkOut, formatStayDate(data.checkOut, lang))}
      ${detailRow(labels.guests, String(data.guests))}
      ${data.total ? `<tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">${labels.total}</td>
        <td style="padding:6px 0;font-family:Georgia,serif;font-size:16px;color:#1A1A18;text-align:right;">&euro;${Math.round(data.total).toLocaleString(pt ? "pt-PT" : "en-GB")}</td>
      </tr>` : ""}
    </table>
  </td></tr>
</table>
</td></tr>

<!-- Resume CTA -->
<tr><td style="padding:0 0 20px 0;text-align:center;">
  <a href="${data.resumeUrl}" target="_blank" style="display:inline-block;background:#1A1A18;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:12px 24px;letter-spacing:0.04em;">${cta}</a>
</td></tr>

<tr><td style="padding:0 0 10px 0;">
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6B6860;line-height:1.6;margin:0;">${closing}</p>
</td></tr>`);

  await sendEmail(data.guestEmail, subject, html);
}

/* ================================================================
   CHECKOUT 2.0 — CONFIRMAÇÃO PREMIUM AO HÓSPEDE
   Enviada no hook paid do updateIntent, a seguir à ficha do CS.
   O email do Guesty é genérico; este é ao nível do site. PT quando
   o locale do intent começa por pt, EN para o resto. Fire-and-forget:
   nunca trava um pagamento nem lança erro.
   ================================================================ */

const CONCIERGE_WA_LINK = "https://wa.me/351927161771";

/** "private-chef" → "Private chef" (nome legível a partir do sku, PT/EN apenas) */
function skuLabel(sku: string): string {
  const s = String(sku).replace(/-/g, " ").trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : String(sku);
}

/** "2026-08-12" → "12 de agosto de 2026" / "12 August 2026" (com ano, para a confirmação) */
function formatFullDate(ymd: string | null | undefined, pt: boolean): string {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd || "?";
  try {
    return new Intl.DateTimeFormat(pt ? "pt-PT" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${ymd}T12:00:00Z`));
  } catch {
    return ymd;
  }
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
  extras?: Array<Record<string, unknown>> | null;
  flex?: boolean | null;
  total?: number | null;
  locale?: string | null;
  intentId: string;
}): Promise<void> {
  try {
    const pt = String(d.locale || "").toLowerCase().startsWith("pt");
    const property = d.propertyName || (pt ? "a sua casa" : "your home");
    const subject = pt
      ? `A sua estadia na ${property} está confirmada`
      : `Your stay at ${property} is confirmed`;

    const firstName = (d.guestFirstName || "").trim().split(" ")[0];
    const euro = (n: number) =>
      "&euro;" + Math.round(n).toLocaleString(pt ? "pt-PT" : "en-GB");

    const detailRow = (k: string, v: string, serifValue = false) => `
      <tr>
        <td style="padding:6px 0;font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;">${k}</td>
        <td style="padding:6px 0;font-family:${serifValue ? "Georgia,serif" : "Arial,sans-serif"};font-size:${serifValue ? "16px" : "14px"};color:#1A1A18;text-align:right;">${v}</td>
      </tr>`;

    // ── "A sua estadia à medida": receção + extras pagos + Flex ──
    const extras = Array.isArray(d.extras) ? d.extras : [];
    const paidExtras = extras.filter((e) => e.amount != null);
    const requestExtras = extras.filter((e) => e.amount == null);

    const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const extraLine = (e: Record<string, unknown>): string => {
      const bits: string[] = [skuLabel(String(e.sku))];
      if (e.qty && Number(e.qty) > 1) bits.push("x" + e.qty);
      if (e.people) bits.push(unit(Number(e.people), pt ? "pessoa" : "person", pt ? "pessoas" : "people"));
      if (e.sessions) bits.push(unit(Number(e.sessions), pt ? "sessão" : "session", pt ? "sessões" : "sessions"));
      if (e.days) bits.push(unit(Number(e.days), pt ? "dia" : "day", pt ? "dias" : "days"));
      return `
      <tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;">${bits.join(" · ")}</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${e.amount != null ? euro(Number(e.amount)) : ""}</td>
      </tr>`;
    };

    const receptionLabel = d.reception
      ? d.reception.type === "hosted"
        ? pt
          ? `Receção presencial${d.reception.late ? " após as 21h" : ""}`
          : `Hosted arrival${d.reception.late ? " after 9pm" : ""}`
        : pt
          ? "Self check-in, incluído na estadia"
          : "Self check-in, included in your stay"
      : "";

    const tailoredRows: string[] = [];
    if (receptionLabel) {
      tailoredRows.push(`
      <tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;">${pt ? "Chegada" : "Arrival"}</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;text-align:right;">${receptionLabel}</td>
      </tr>`);
    }
    for (const e of paidExtras) tailoredRows.push(extraLine(e));
    if (d.flex) {
      tailoredRows.push(`
      <tr>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;">Flex</td>
        <td style="padding:5px 0;font-family:Arial,sans-serif;font-size:14px;color:#8B7355;text-align:right;">${pt ? "Remarcação garantida ativa" : "Guaranteed rebooking active"}</td>
      </tr>`);
    }

    const tailoredBlock = tailoredRows.length
      ? `
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF8F3;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Georgia,serif;font-size:17px;color:#1A1A18;margin:0 0 12px 0;font-weight:400;">${pt ? "A sua estadia à medida" : "Your stay, tailored"}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${tailoredRows.join("")}</table>
  </td></tr>
</table>
</td></tr>`
      : "";

    const conciergeBlock = requestExtras.length
      ? `
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Georgia,serif;font-size:17px;color:#1A1A18;margin:0 0 10px 0;font-weight:400;">${pt ? "Pedidos ao concierge" : "Concierge requests"}</p>
    ${requestExtras.map((e) => `<p style="font-family:Arial,sans-serif;font-size:14px;color:#1A1A18;margin:3px 0;">&bull; ${skuLabel(String(e.sku))}</p>`).join("")}
    <p style="font-family:Arial,sans-serif;font-size:13px;color:#6B6860;line-height:1.6;margin:12px 0 0 0;">
      ${pt
        ? "O nosso concierge envia-lhe um orçamento personalizado nas próximas 24 horas. Estes pedidos só são confirmados depois da sua aprovação."
        : "Our concierge will send you a tailored quote within the next 24 hours. These requests are only confirmed after your approval."}
    </p>
  </td></tr>
</table>
</td></tr>`
      : "";

    const html = wrapTemplate(`
<tr><td style="padding:0 0 24px 0;">
  <h1 style="font-family:Georgia,serif;font-size:26px;color:#1A1A18;margin:0;font-weight:400;">${pt ? "A sua estadia está confirmada." : "Your stay is confirmed."}</h1>
</td></tr>
<tr><td style="padding:0 0 24px 0;">
  <p style="font-family:Arial,sans-serif;font-size:15px;color:#6B6860;line-height:1.6;margin:0;">
    ${firstName ? (pt ? `Olá ${firstName}, obrigado` : `Hello ${firstName}, thank you`) : pt ? "Obrigado" : "Thank you"}
    ${pt
      ? `por reservar diretamente com a Portugal Active. A nossa equipa já começou a preparar a ${property} para o receber.`
      : `for booking directly with Portugal Active. Our team has already started preparing ${property} for your arrival.`}
  </p>
</td></tr>

<!-- Código de confirmação -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF8F3;border:1px solid #E8E4DC;">
  <tr><td style="padding:24px;text-align:center;">
    <p style="font-family:Arial,sans-serif;font-size:11px;color:#9E9A90;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.08em;">${pt ? "Código de confirmação" : "Confirmation code"}</p>
    <p style="font-family:Georgia,serif;font-size:30px;color:#1A1A18;margin:0;letter-spacing:0.04em;font-weight:400;">${d.confirmationCode || "&mdash;"}</p>
  </td></tr>
</table>
</td></tr>

<!-- Bloco da estadia -->
<tr><td style="padding:0 0 24px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;border:1px solid #E8E4DC;">
  <tr><td style="padding:20px;">
    <p style="font-family:Georgia,serif;font-size:18px;color:#1A1A18;margin:0 0 4px 0;font-weight:400;">${property}</p>
    ${d.destination ? `<p style="font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;margin:0 0 14px 0;">${d.destination}</p>` : `<div style="height:10px;"></div>`}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
      ${detailRow("Check-in", formatFullDate(d.checkIn, pt))}
      ${detailRow("Check-out", formatFullDate(d.checkOut, pt))}
      ${detailRow(pt ? "Hóspedes" : "Guests", String(d.guests ?? "?"))}
      ${d.total != null && d.total > 0 ? detailRow(pt ? "Total da estadia" : "Stay total", euro(d.total), true) : ""}
    </table>
  </td></tr>
</table>
</td></tr>

${tailoredBlock}
${conciergeBlock}

<!-- Próximos passos -->
<tr><td style="padding:0 0 20px 0;">
  <p style="font-family:Georgia,serif;font-size:17px;color:#1A1A18;margin:0 0 10px 0;font-weight:400;">${pt ? "Próximos passos" : "What happens next"}</p>
  <p style="font-family:Arial,sans-serif;font-size:14px;color:#6B6860;line-height:1.7;margin:0;">
    ${pt
      ? "Na véspera da chegada recebe por email as instruções de check-in, com todos os detalhes de acesso à casa. Até lá, o seu concierge está disponível para qualquer pedido, de reservas de restaurante a transferes."
      : "The day before arrival you will receive your check-in instructions by email, with every detail you need to reach the house. Until then, your concierge is available for any request, from restaurant reservations to transfers."}
  </p>
</td></tr>

<!-- Concierge CTA -->
<tr><td style="padding:0 0 24px 0;text-align:center;">
  <a href="${CONCIERGE_WA_LINK}" target="_blank" style="display:inline-block;background:#1A1A18;color:#ffffff;font-family:Arial,sans-serif;font-size:13px;font-weight:600;text-decoration:none;padding:13px 26px;letter-spacing:0.04em;">${pt ? "FALAR COM O CONCIERGE" : "CHAT WITH YOUR CONCIERGE"}</a>
</td></tr>

<!-- Melhor preço garantido -->
<tr><td style="padding:0 0 10px 0;text-align:center;">
  <p style="font-family:Arial,sans-serif;font-size:12px;color:#9E9A90;line-height:1.6;margin:0;">
    ${pt
      ? "Reservou diretamente com a Portugal Active, com o melhor preço garantido."
      : "You booked directly with Portugal Active, with our best price guaranteed."}
  </p>
</td></tr>`);

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
}): Promise<void> {
  try {
    const rows: string[] = [];
    const row = (k: string, v: string) =>
      rows.push('<tr><td style="padding:4px 12px 4px 0;color:#6B6860;font:13px Arial;">' + k + '</td><td style="padding:4px 0;color:#1A1A18;font:13px Arial;">' + v + "</td></tr>");
    row("Casa", d.propertyName || "?");
    row("Datas", (d.checkIn || "?") + " ate " + (d.checkOut || "?") + " · " + (d.guests ?? "?") + " hospedes");
    row("Hospede", (d.guestName || "?") + " · " + (d.email || "?") + " · " + (d.guestPhone || "?"));
    row("Reserva", (d.confirmationCode || "pendente") + " (Guesty " + (d.reservationId || "?") + ")");
    row("Rececao", d.reception?.type === "hosted" ? "PRESENCIAL" + (d.reception.late ? " (apos as 21h)" : "") : "self check-in (incluido)");
    row("Flex", d.flex ? "SIM (remarcacao garantida)" : "nao");
    const extras = Array.isArray(d.extras) ? d.extras : [];
    const fmt = (e: Record<string, unknown>) => {
      const bits = [String(e.sku)];
      if (e.qty) bits.push("x" + e.qty);
      if (e.days) bits.push(e.days + " dias");
      if (e.people) bits.push(e.people + " pessoas");
      if (e.sessions) bits.push(e.sessions + " sessoes");
      bits.push(e.amount != null ? e.amount + " EUR" : "(sob orcamento)");
      if (e.fulfillment === "needs_confirmation") bits.push("CONFIRMAR EM 24H");
      return bits.join(" · ");
    };
    const paid = extras.filter((e) => e.amount != null);
    const reqs = extras.filter((e) => e.amount == null);
    const list = (title: string, items: Array<Record<string, unknown>>) =>
      items.length
        ? '<p style="font:600 13px Arial;color:#1A1A18;margin:14px 0 4px;">' + title + "</p>" +
          items.map((e) => '<p style="font:13px Arial;color:#1A1A18;margin:2px 0;">• ' + fmt(e) + "</p>").join("")
        : "";
    const html =
      '<h2 style="font:400 20px Georgia;color:#1A1A18;">Ficha de servicos, checkout</h2>' +
      "<table>" + rows.join("") + "</table>" +
      list("Extras pagos", paid) + list("Pedidos ao concierge (orcamentar)", reqs) +
      '<p style="font:11px Arial;color:#9E9A90;margin-top:16px;">Intent ' + d.intentId + " · gerado pelo checkout 2.0</p>";
    await sendEmail(BOOKING_ALERT_EMAIL, "[CS] Servicos da reserva " + (d.confirmationCode || d.intentId.slice(0, 8)) + " - " + (d.propertyName || ""), html);
    console.info("[OpsManifest] enviado (intent " + d.intentId + ")");
  } catch (err: any) {
    console.error("[OpsManifest] falhou (intent " + d.intentId + "):", err?.message);
  }
}
