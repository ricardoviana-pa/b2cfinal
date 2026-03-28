import { Resend } from "resend";

const FROM = "Portugal Active <noreply@portugalactive.com>";
const TEAM_EMAIL = "info@portugalactive.com";

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export async function sendContactConfirmation(to: string, name: string) {
  const resend = getResend();
  if (!resend) { console.warn("[Email] RESEND_API_KEY not set, skipping contact confirmation"); return; }

  await resend.emails.send({
    from: FROM,
    to,
    subject: "We received your message — Portugal Active",
    html: `
      <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A18">
        <p style="font-size:14px;color:#6B6860;line-height:1.7">Dear ${name},</p>
        <p style="font-size:14px;color:#6B6860;line-height:1.7">Thank you for reaching out. We have received your message and our concierge team will respond within 2 hours during business hours.</p>
        <p style="font-size:14px;color:#6B6860;line-height:1.7">In the meantime, feel free to reach us on <a href="https://wa.me/351927161771" style="color:#8B7355">WhatsApp</a> for immediate assistance.</p>
        <p style="font-size:14px;color:#6B6860;line-height:1.7;margin-top:24px">Warm regards,<br/><strong style="color:#1A1A18">The Portugal Active Team</strong></p>
        <hr style="border:none;border-top:1px solid #E8E4DC;margin:32px 0 16px"/>
        <p style="font-size:11px;color:#9E9A90">Portugal Active — Private Homes, Hotel Standards<br/>+351 927 161 771 · info@portugalactive.com</p>
      </div>
    `,
  });
}

export async function sendContactNotification(data: { name: string; email: string; phone?: string; subject: string; message: string }) {
  const resend = getResend();
  if (!resend) { console.warn("[Email] RESEND_API_KEY not set, skipping team notification"); return; }

  await resend.emails.send({
    from: FROM,
    to: TEAM_EMAIL,
    subject: `New contact: ${data.subject} — ${data.name}`,
    replyTo: data.email,
    html: `
      <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#1A1A18">
        <h2 style="font-size:18px;font-weight:400;color:#1A1A18">New Contact Form Submission</h2>
        <table style="font-size:14px;color:#6B6860;line-height:1.7;border-collapse:collapse">
          <tr><td style="padding:4px 16px 4px 0;font-weight:500;color:#1A1A18">Name</td><td>${data.name}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;font-weight:500;color:#1A1A18">Email</td><td><a href="mailto:${data.email}" style="color:#8B7355">${data.email}</a></td></tr>
          ${data.phone ? `<tr><td style="padding:4px 16px 4px 0;font-weight:500;color:#1A1A18">Phone</td><td>${data.phone}</td></tr>` : ''}
          <tr><td style="padding:4px 16px 4px 0;font-weight:500;color:#1A1A18">Subject</td><td>${data.subject}</td></tr>
        </table>
        <div style="margin-top:16px;padding:16px;background:#F5F1EB;border-radius:6px">
          <p style="font-size:14px;color:#1A1A18;margin:0;white-space:pre-wrap">${data.message}</p>
        </div>
      </div>
    `,
  });
}

export async function sendNewsletterWelcome(to: string) {
  const resend = getResend();
  if (!resend) { console.warn("[Email] RESEND_API_KEY not set, skipping newsletter welcome"); return; }

  await resend.emails.send({
    from: FROM,
    to,
    subject: "Welcome to Portugal Active",
    html: `
      <div style="font-family:'DM Sans',Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#1A1A18">
        <h1 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:28px;font-weight:300;color:#1A1A18;margin-bottom:8px">Welcome.</h1>
        <p style="font-size:14px;color:#6B6860;line-height:1.7">You are now part of the Portugal Active community. We will keep you updated with curated travel inspiration, new homes in our portfolio, and exclusive member offers.</p>
        <p style="font-size:14px;color:#6B6860;line-height:1.7">No spam. Only the best of Portugal, delivered to your inbox.</p>
        <a href="https://www.portugalactive.com/homes" style="display:inline-block;margin-top:16px;padding:14px 32px;background:#1A1A18;color:#FAFAF7;text-decoration:none;font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;border-radius:999px">EXPLORE OUR HOMES</a>
        <hr style="border:none;border-top:1px solid #E8E4DC;margin:32px 0 16px"/>
        <p style="font-size:11px;color:#9E9A90">Portugal Active — Private Homes, Hotel Standards<br/>+351 927 161 771 · info@portugalactive.com</p>
      </div>
    `,
  });
}
