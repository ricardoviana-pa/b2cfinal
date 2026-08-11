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
  const { sendCheckoutRecovery, sendCheckoutGuestConfirmation, sendCheckoutOpsManifest } = await import(
    "../server/services/transactional-email"
  );

  const base = {
    guestEmail: "demo@example.com",
    guestFirstName: "Maria",
    propertyName: "Abreu Retreat Palace",
    destination: "minho",
    checkIn: "2026-09-09",
    checkOut: "2026-09-14",
    guests: 4,
    quote: { nightlyRate: 500, nights: 5, totalNights: 2500, cleaningFee: 200, taxesAndFees: 0, total: 2700 },
    total: 3300,
    imageUrl: DEMO_IMAGE,
    expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000),
    locale: "pt",
  };

  const demoOptout = "https://dev.portugalactive.com/api/checkout/recovery-optout?intent=demo&t=00000000000000000000000000000000";
  await sendCheckoutRecovery({ ...base, stage: 1, optoutUrl: demoOptout, resumeUrl: "https://dev.portugalactive.com/pt/checkout/demo?utm_campaign=cart_recovery&utm_content=1h" });
  await sendCheckoutRecovery({ ...base, stage: 2, optoutUrl: demoOptout, resumeUrl: "https://dev.portugalactive.com/pt/checkout/demo?utm_campaign=cart_recovery&utm_content=20h" });
  // Catálogo real (12 jul): grocery-setup, limpezas por casa, pets em escalão
  const extras = [
    { sku: "transfer-porto", qty: 1, amount: 120, fulfillment: "instant" },
    { sku: "grocery-setup", qty: 1, amount: 120, fulfillment: "instant" },
    { sku: "daily-cleaning", qty: 3, amount: 255, fulfillment: "instant" },
    { sku: "breakfast-box", people: 4, days: 5, amount: 500, fulfillment: "instant" },
    { sku: "pet-fee", qty: 2, amount: 150, fulfillment: "instant" },
    { sku: "travel-crib", qty: 1, amount: 0, fulfillment: "instant" },
    { sku: "private-chef", people: 4, amount: 380, fulfillment: "needs_confirmation" },
    { sku: "canyoning", amount: null, fulfillment: "on_request" },
  ];
  const { computeChargeBreakdown } = await import("../server/services/checkout-pricing");
  const b = computeChargeBreakdown({
    quoteTotal: 2700, totalNights: 2500, nights: 5,
    reception: { type: "hosted", late: true },
    extras: extras as any, flex: true,
    unitPriceOverrides: { "daily-cleaning": 85, "deep-cleaning": 240 },
  });
  const canonical = { lines: b.lines, receptionCents: b.receptionCents, flexCents: b.flexCents, totalCents: b.totalCents };

  await sendCheckoutGuestConfirmation({
    canonical,
    email: "demo@example.com",
    guestFirstName: "Maria",
    propertyName: "Abreu Retreat Palace",
    destination: "minho",
    checkIn: "2026-09-09",
    checkOut: "2026-09-14",
    guests: 4,
    confirmationCode: "18293476",
    reception: { type: "hosted", late: true },
    receptionAmount: 90,
    extras,
    flex: true,
    flexPrice: 250,
    quote: base.quote,
    imageUrl: DEMO_IMAGE,
    viewUrl: "https://dev.portugalactive.com/pt/checkout/demo",
    locale: "pt",
    intentId: "demo-intent",
  });

  await sendCheckoutOpsManifest({
    canonical,
    imageUrl: DEMO_IMAGE,
    confirmationCode: "18293476",
    reservationId: "res-demo",
    propertyName: "Abreu Retreat Palace",
    checkIn: "2026-09-09",
    checkOut: "2026-09-14",
    guests: 4,
    email: "demo@example.com",
    guestName: "Maria Fonseca",
    guestPhone: "+351 910 000 000",
    reception: { type: "hosted", late: true },
    extras,
    flex: true,
    intentId: "demo-intent",
  });

  console.log = origLog;
  const names = ["recovery-1h", "recovery-20h", "confirmation", "cs-manifest"];
  captured.forEach((c, i) => {
    const file = path.join(OUT_DIR, `${names[i] ?? `email-${i}`}.html`);
    fs.writeFileSync(file, c.html, "utf-8");
    console.info(`${file}  —  ${c.subject}`);
  });
  console.info(`\nAbrir com: open ${OUT_DIR}/*.html`);
}

main().catch((e) => { console.log = origLog; console.error(e); process.exit(1); });
