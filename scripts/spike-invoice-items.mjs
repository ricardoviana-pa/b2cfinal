#!/usr/bin/env node
/**
 * Spike Fase 1 — invoice items custom numa reserva Guesty (docs/spike-invoice-items.md).
 *
 * Read-only por omissão. Com --execute cria movimentos financeiros REAIS e
 * IRREVERSÍVEIS via API (invoice items não têm delete). Usar apenas numa
 * reserva de teste escolhida por um humano.
 *
 *   GUESTY_CLIENT_ID=... GUESTY_CLIENT_SECRET=... \
 *   node scripts/spike-invoice-items.mjs --reservation <ID> [--amount 49] [--execute]
 *
 * Auth: Open API client_credentials (mesmo bootstrap de scripts/guesty-test.mjs).
 * NOTA: a quota OAuth Guesty é 3 renovações/24h partilhada com o servidor em
 * produção — correr com moderação.
 */

const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;
const BASE_URL = process.env.GUESTY_BASE_URL || "https://open-api.guesty.com";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const RESERVATION_ID = getArg("reservation");
const AMOUNT = Number(getArg("amount") || 49);
const EXECUTE = args.includes("--execute");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET em falta no ambiente.");
  process.exit(1);
}
if (!RESERVATION_ID) {
  console.error("Uso: node scripts/spike-invoice-items.mjs --reservation <ID> [--amount 49] [--execute]");
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`${BASE_URL}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "open-api",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`OAuth ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE_URL}/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

function money(r) {
  const m = r?.money ?? r;
  return {
    hostPayout: m?.hostPayout,
    totalPaid: m?.totalPaid,
    balanceDue: m?.balanceDue,
    invoiceItems: (m?.invoiceItems || []).map((i) => ({ title: i.title, amount: i.amount, type: i.normalType })),
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const token = await getToken();
  console.log("✓ OAuth OK\n");

  // ── Estado financeiro atual ──
  const before = await api(token, "GET", `/reservations/${RESERVATION_ID}?fields=money confirmationCode status`);
  if (!before.ok) {
    console.error(`GET reservation falhou (${before.status}):`, before.body);
    process.exit(1);
  }
  console.log("ANTES:", JSON.stringify(money(before.body), null, 2));

  if (!EXECUTE) {
    console.log("\n(read-only — usa --execute para correr o spike completo; movimentos são IRREVERSÍVEIS)");
    return;
  }

  // ── CALL 1: criar invoice item ──
  console.log(`\n→ POST /invoice-items/reservation/${RESERVATION_ID} (${AMOUNT} EUR)…`);
  const item = await api(token, "POST", `/invoice-items/reservation/${RESERVATION_ID}`, {
    title: "SPIKE TEST — Rebooking Protection",
    amount: AMOUNT,
    normalType: "AFE",
    secondIdentifier: "INSURANCE",
    isUpsellFee: true,
    description: "Fase 1 spike — validar invoice items custom (pode ser ignorado)",
  });
  console.log(`invoice item: HTTP ${item.status}`, item.ok ? "✓" : item.body);
  if (!item.ok) process.exit(1);

  // 60s rule dos docs — deixar o folio assentar
  console.log("… a aguardar 90 s (regra dos 60 s dos docs Guesty)");
  await sleep(90_000);

  const mid = await api(token, "GET", `/reservations/${RESERVATION_ID}?fields=money`);
  const midMoney = money(mid.body);
  console.log("DEPOIS DO ITEM:", JSON.stringify(midMoney, null, 2));
  const beforeMoney = money(before.body);
  const delta = (midMoney.balanceDue ?? 0) - (beforeMoney.balanceDue ?? 0);
  console.log(delta === AMOUNT ? `✓ balanceDue subiu exatamente ${AMOUNT}` : `⚠️ delta balanceDue = ${delta} (esperado ${AMOUNT})`);

  // ── CALL 2: registar pagamento pelo saldo (incerteza nº1: schema do paymentMethod) ──
  const payAmount = midMoney.balanceDue;
  if (!payAmount || payAmount <= 0) {
    console.log("balanceDue não positivo — pagamento não registado.");
    return;
  }
  console.log(`\n→ POST /reservations/${RESERVATION_ID}/payments (${payAmount} EUR, BANK_TRANSFER record)…`);
  const payment = await api(token, "POST", `/reservations/${RESERVATION_ID}/payments`, {
    paymentMethod: { method: "BANK_TRANSFER", id: "5dee4ebd32acdf7051cd6ed6", saveForFutureUse: false },
    amount: payAmount,
    paidAt: new Date().toISOString(),
    note: "SPIKE TEST — recorded payment (simula Stripe PI externo)",
  });
  console.log(`payment: HTTP ${payment.status}`, payment.ok ? "✓" : JSON.stringify(payment.body, null, 2));

  await sleep(10_000);
  const after = await api(token, "GET", `/reservations/${RESERVATION_ID}?fields=money`);
  console.log("\nFINAL:", JSON.stringify(money(after.body), null, 2));
  console.log("\nDocumentar o resultado (sobretudo o schema aceite do paymentMethod) em docs/spike-invoice-items.md.");
})().catch((e) => {
  console.error("Spike falhou:", e);
  process.exit(1);
});
