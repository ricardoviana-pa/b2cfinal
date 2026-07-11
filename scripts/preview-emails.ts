/**
 * Pré-visualização dos emails do checkout 2.0 (recuperação 1h/20h + confirmação).
 *
 * Sem RESEND_API_KEY o serviço de email faz console.log do HTML em vez de
 * enviar, por isso este script captura esse output e escreve um .html por
 * email em /tmp/pa-emails para abrir no browser:
 *
 *   npx tsx scripts/preview-emails.ts
 *   open /tmp/pa-emails/*.html
 */
import fs from "fs";
import path from "path";

delete process.env.RESEND_API_KEY; // força o modo dev (log em vez de envio)

const OUT_DIR = "/tmp/pa-emails";
fs.mkdirSync(OUT_DIR, { recursive: true });

const captured: { subject: string; html: string }[] = [];
const origLog = console.log;
let buffer: string[] | null = null;
console.log = (...args: unknown[]) => {
  const line = args.map(String).join(" ");
  if (line.includes("[EMAIL SERVICE - DEV MODE] To:")) {
    buffer = [];
    const m = line.match(/Subject: (.*)$/);
    captured.push({ subject: m?.[1] ?? "email", html: "" });
    return;
  }
  if (line.includes("[EMAIL SERVICE - DEV MODE] End of email")) {
    if (buffer && captured.length) captured[captured.length - 1].html = buffer.join("\n");
    buffer = null;
    return;
  }
  if (buffer) { buffer.push(line); return; }
  origLog(...args);
};

const DEMO_IMAGE =
  "https://assets.guesty.com/image/upload/listing_images_s3/production/property-photos/37fa8987056cd492c04e218f5de336d16b8597815897dd91/696533722def930014e914e2/41dffdd6-99b5-4f-GO4s9";

async function main() {
  const { sendCheckoutRecovery, sendCheckoutGuestConfirmation } = await import(
    "../server/services/transactional-email"
  );

  const base = {
    guestEmail: "demo@example.com",
    guestFirstName: "Maria",
    propertyName: "Villa Aurora",
    destination: "alentejo",
    checkIn: "2026-08-12",
    checkOut: "2026-08-16",
    guests: 6,
    quote: { nightlyRate: 750, nights: 4, totalNights: 3000, cleaningFee: 180, taxesAndFees: 120, total: 3300 },
    total: 3300,
    imageUrl: DEMO_IMAGE,
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    locale: "pt",
  };

  await sendCheckoutRecovery({ ...base, stage: 1, resumeUrl: "https://dev.portugalactive.com/pt/checkout/demo?utm_campaign=cart_recovery&utm_content=1h" });
  await sendCheckoutRecovery({ ...base, stage: 2, resumeUrl: "https://dev.portugalactive.com/pt/checkout/demo?utm_campaign=cart_recovery&utm_content=20h" });
  await sendCheckoutGuestConfirmation({
    email: "demo@example.com",
    guestFirstName: "Maria",
    propertyName: "Villa Aurora",
    destination: "alentejo",
    checkIn: "2026-08-12",
    checkOut: "2026-08-16",
    guests: 6,
    confirmationCode: "PA-48291",
    reception: { type: "hosted", late: true },
    receptionAmount: 90,
    extras: [
      { sku: "private-chef", people: 6, amount: 480, fulfillment: "needs_confirmation" },
      { sku: "grocery-delivery", qty: 1, amount: 60 },
      { sku: "in-villa-spa", amount: null, fulfillment: "on_request" },
    ],
    flex: true,
    flexPrice: 250,
    quote: base.quote,
    imageUrl: DEMO_IMAGE,
    viewUrl: "https://dev.portugalactive.com/pt/checkout/demo",
    locale: "pt",
    intentId: "demo-intent",
  });

  console.log = origLog;
  const names = ["recovery-1h", "recovery-20h", "confirmation"];
  captured.forEach((c, i) => {
    const file = path.join(OUT_DIR, `${names[i] ?? `email-${i}`}.html`);
    fs.writeFileSync(file, c.html, "utf-8");
    console.info(`${file}  —  ${c.subject}`);
  });
  console.info(`\nAbrir com: open ${OUT_DIR}/*.html`);
}

main().catch((e) => { console.log = origLog; console.error(e); process.exit(1); });
