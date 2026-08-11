#!/usr/bin/env node
/**
 * Bloco 4 — reembolso parcial por linha do checkout 2.0 (até haver UI).
 *
 * Dry-run por omissão (mostra as linhas do PI e o valor que seria devolvido);
 * com --execute faz o reembolso REAL no PI original, pela conta de PLATAFORMA.
 *
 *   STRIPE_SECRET_KEY=... DATABASE_URL=... \
 *   npx tsx scripts/refund-checkout-line.mjs --intent <intentId> --sku <sku> [--execute]
 *
 * skus aceites: qualquer sku de extra da cobrança, mais os pseudo-skus
 * "reception" e "flex". Idempotente por (PI, sku): repetir o comando com o
 * mesmo sku é recusado. NOTA: correr com npx tsx (importa serviços TS).
 */

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const INTENT = getArg("intent");
const SKU = getArg("sku");
const EXECUTE = args.includes("--execute");

if (!INTENT || !SKU) {
  console.error("Uso: npx tsx scripts/refund-checkout-line.mjs --intent <intentId> --sku <sku> [--execute]");
  process.exit(1);
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY em falta no ambiente.");
  process.exit(1);
}

const { refundCheckoutLine } = await import("../server/services/checkout-card-charge.ts");

try {
  const r = await refundCheckoutLine(INTENT, SKU, { execute: EXECUTE });
  const eur = (c) => `${(c / 100).toFixed(2)} EUR`;
  console.log(`PI: ${r.paymentIntentId}`);
  console.log(`Linhas conhecidas: ${r.lines.map((l) => `${l.sku}=${eur(l.cents)}`).join(", ") || "(nenhuma)"}`);
  if (r.alreadyRefundedSkus.length) console.log(`Já reembolsado: ${r.alreadyRefundedSkus.join(", ")}`);
  if (r.executed) {
    console.log(`✔ REEMBOLSADO ${SKU}: ${eur(r.cents)} (refund ${r.refundId}). Resta reembolsável: ${eur(r.remainingCents)}.`);
  } else {
    console.log(`DRY-RUN: reembolsaria ${SKU} = ${eur(r.cents)}. Reembolsável no PI: ${eur(r.remainingCents)}.`);
    console.log("Acrescenta --execute para efetivar.");
  }
} catch (err) {
  console.error(`ERRO: ${err?.message || err}`);
  process.exit(1);
}
