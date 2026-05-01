/**
 * TRANSACTIONAL EMAIL SERVICE
 * Uses Resend when RESEND_API_KEY is set, otherwise logs to console (dev mode).
 */

import { Resend } from "resend";

const resendKey = process.env.RESEND_API_KEY;
const isProduction = !!resendKey;
const resend = resendKey ? new Resend(resendKey) : null;

const FROM_EMAIL = process.env.EMAIL_FROM || "Portugal Active <hello@portugalactive.com>";

/* ================================================================
   CORE SEND
   ================================================================ */
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (isProduction && resend) {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    if (error) throw new Error(`Resend error: ${error.message}`);
    console.info(`[EMAIL] Sent to ${to}: "${subject}"`);
  } else {
    console.log(`\n[EMAIL SERVICE - DEV MODE] To: ${to} | Subject: ${subject}`);
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
  <p style="font-family:Arial,sans-serif;font-size:13px;color:#9E9A90;margin:4px 0 0 0;">+351 927 161 771 &middot; hello@portugalactive.com</p>
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
  const phone = data.conciergePhone || "+351 927 161 771";

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
