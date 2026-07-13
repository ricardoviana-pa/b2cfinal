#!/usr/bin/env node
/**
 * Diagnóstico read-only: porque é que uma reserva está "Not paid"?
 *
 * Para cada reserva: estado financeiro (balanceDue, totalPaid), registos de
 * pagamento (incluindo tentativas falhadas e agendamentos), e a política de
 * auto-payments do listing (é ela que decide se o Guesty cobra o cartão de
 * uma reserva BE API — "Next payment: Unscheduled" = nenhuma política aplicou).
 *
 *   GUESTY_CLIENT_ID=... GUESTY_CLIENT_SECRET=... \
 *   node scripts/check-reservation-payment.mjs --reservation <ID>[,<ID>...] [--listing <ID>]
 *
 * Auth: Open API client_credentials (mesmo bootstrap de scripts/spike-invoice-items.mjs).
 * NOTA: a quota OAuth Guesty é 3 renovações/24h partilhada com o servidor —
 * o script usa UM token para todas as chamadas; correr com moderação.
 */

const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;
const BASE_URL = process.env.GUESTY_BASE_URL || "https://open-api.guesty.com";

const args = process.argv.slice(2);
const getArg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const RESERVATION_IDS = (getArg("reservation") || "").split(",").filter(Boolean);
const LISTING_ID = getArg("listing");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET em falta no ambiente.");
  process.exit(1);
}
if (RESERVATION_IDS.length === 0 && !LISTING_ID) {
  console.error("Uso: node scripts/check-reservation-payment.mjs --reservation <ID>[,<ID>...] [--listing <ID>]");
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

async function api(token, path) {
  const res = await fetch(`${BASE_URL}/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, ok: res.ok, body: json };
}

function describePayments(money) {
  const payments = money?.payments || [];
  if (payments.length === 0) return "  (nenhum registo de pagamento — nem tentativa, nem agendamento)";
  return payments
    .map((p) => {
      const method = p.paymentMethod?.method || p.method || "?";
      const when = p.shouldBePaidAt || p.paidAt || p.createdAt || "?";
      return `  - ${p.status || "?"} · ${p.amount} ${p.currency || ""} · método=${method} · data=${when}` +
        (p.failureReason || p.note ? ` · ${p.failureReason || p.note}` : "");
    })
    .join("\n");
}

(async () => {
  const token = await getToken();
  console.log("✓ OAuth OK\n");

  const listingIds = new Set(LISTING_ID ? [LISTING_ID] : []);

  for (const id of RESERVATION_IDS) {
    console.log(`═══ Reserva ${id} ═══`);
    const r = await api(token, `/reservations/${id}?fields=${encodeURIComponent("money status source confirmationCode ratePlanId listingId checkInDateLocalized checkOutDateLocalized createdAt")}`);
    if (!r.ok) {
      console.error(`  GET falhou (${r.status}):`, JSON.stringify(r.body).slice(0, 400));
      continue;
    }
    const b = r.body;
    if (b.listingId) listingIds.add(b.listingId);
    console.log(`  confirmação=${b.confirmationCode} · status=${b.status} · source=${b.source ?? "?"} · ratePlanId=${b.ratePlanId ?? "(nenhum)"}`);
    console.log(`  listing=${b.listingId} · ${b.checkInDateLocalized} → ${b.checkOutDateLocalized} · criada=${b.createdAt}`);
    const m = b.money || {};
    console.log(`  hostPayout=${m.hostPayout} · totalPaid=${m.totalPaid} · balanceDue=${m.balanceDue} · autoPayments(reserva)=${JSON.stringify(m.autoPayments ?? b.autoPayments ?? null)}`);
    console.log(`  pagamentos:`);
    console.log(describePayments(m));
    console.log();
  }

  for (const lid of listingIds) {
    console.log(`═══ Listing ${lid} — auto-payment policy ═══`);
    const l = await api(token, `/listings/${lid}?fields=${encodeURIComponent("title autoPayments pms.autoPayments")}`);
    if (!l.ok) {
      console.error(`  GET falhou (${l.status}):`, JSON.stringify(l.body).slice(0, 400));
      continue;
    }
    const ap = l.body.autoPayments ?? l.body.pms?.autoPayments ?? null;
    console.log(`  título: ${l.body.title}`);
    if (!ap || (Array.isArray(ap.policy) && ap.policy.length === 0)) {
      console.log("  ⚠️  SEM política de auto-payments — o Guesty nunca agenda a cobrança do cartão");
      console.log("      (raw:", JSON.stringify(ap), ")");
    } else {
      console.log("  política:", JSON.stringify(ap, null, 2));
    }
    console.log();
  }

  console.log("Interpretação:");
  console.log("  · totalPaid=0 sem registos + política vazia  → configurar Auto Payments no Guesty (100% at confirmation)");
  console.log("  · registo FAILED                              → o Guesty tentou cobrar e o cartão/conta recusou (ver Stripe conectada)");
  console.log("  · registo futuro/agendado                     → a política difere a cobrança (não é bug)");
  console.log("  · reserva PayPal/Klarna sem registo           → o recordExternalPayment falhou no servidor (ver logs Render)");
})();
