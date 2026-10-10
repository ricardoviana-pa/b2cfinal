/**
 * META CONVERSIONS API (spec §13 — CAPI server-side "onde possível").
 *
 * Com o iOS a cortar cookies, o Pixel do browser perde uma fatia grande dos
 * purchases — o CAPI envia o evento do servidor com email/telefone hasheados
 * (match quality alta) e o MESMO event_id do pixel, para a Meta deduplicar:
 *   - Purchase: event_id = confirmationCode (código da reserva Guesty), igual ao
 *     eventID da tag Purchase do GTM (ecommerce.transaction_id);
 *   - InitiateCheckout: event_id gerado no browser no clique "Reservar"
 *     (begin_checkout.event_id) e passado ao createIntent.
 * O payload replica o do pixel: value (só a estadia, em EUR), currency,
 * order_id, content_ids (= id do catálogo, o guestyId), content_type.
 *
 * Consentimento: só se envia para intents com sinais gravados
 * (booking_intent_ad_signals), o que só acontece com "Aceitar tudo" no site
 * live. Sem registo → nada sai para a Meta.
 *
 * Config por env no Render (sem env → no-op silencioso):
 *   META_PIXEL_ID=1428229772653572
 *   META_CAPI_TOKEN=EAAB...
 *   META_CAPI_TEST_CODE=TEST123   (opcional, só para o "Testar eventos";
 *                                  retirar depois do teste)
 *
 * Fail-soft SEMPRE: um evento de marketing nunca pode partir o funil.
 */
import { createHash } from "crypto";
import type { StoredAdSignals } from "./ad-signals-store";

const GRAPH_VERSION = "v21.0";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const normEmail = (e?: string | null) => {
  const v = (e || "").trim().toLowerCase();
  return v.includes("@") ? sha256(v) : undefined;
};
/** Telefone: só algarismos com indicativo, sem zeros à esquerda (regra da Meta). */
const normPhone = (p?: string | null) => {
  if (!p) return undefined;
  const raw = p.trim();
  let digits = raw.replace(/[^0-9]/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits.length >= 7 ? sha256(digits) : undefined;
};

export function isMetaCapiConfigured(): boolean {
  return !!(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

export type MetaCapiEvent = {
  eventName: "Purchase" | "InitiateCheckout";
  eventId: string;
  value: number;
  currency?: string;
  /** Id do catálogo Meta (guestyId), sem o prefixo PROP- */
  contentId?: string | null;
  contentName?: string | null;
  orderId?: string | null;
  numItems?: number | null;
  sourceUrl: string;
  email?: string | null;
  phone?: string | null;
  signals: StoredAdSignals;
};

/** Corpo do pedido à Graph API. Exportado para os testes. */
export function buildMetaCapiBody(d: MetaCapiEvent, now = Date.now()): Record<string, unknown> {
  const em = normEmail(d.email);
  const ph = normPhone(d.phone);
  const contentId = d.contentId ? String(d.contentId).replace(/^PROP-/, "").replace(/^guesty-/, "") : "";
  return {
    data: [
      {
        event_name: d.eventName,
        event_time: Math.floor(now / 1000),
        event_id: d.eventId,
        action_source: "website",
        event_source_url: d.sourceUrl,
        user_data: {
          ...(em ? { em: [em] } : {}),
          ...(ph ? { ph: [ph] } : {}),
          ...(d.signals.fbp ? { fbp: d.signals.fbp } : {}),
          ...(d.signals.fbc ? { fbc: d.signals.fbc } : {}),
          ...(d.signals.clientIp ? { client_ip_address: d.signals.clientIp } : {}),
          ...(d.signals.userAgent ? { client_user_agent: d.signals.userAgent } : {}),
        },
        custom_data: {
          value: Math.round(d.value * 100) / 100,
          currency: (d.currency || "EUR").toUpperCase(),
          content_type: "product",
          ...(contentId ? { content_ids: [contentId] } : {}),
          ...(d.contentName ? { content_name: d.contentName } : {}),
          ...(d.orderId ? { order_id: d.orderId } : {}),
          ...(d.numItems ? { num_items: d.numItems } : {}),
        },
      },
    ],
    ...(process.env.META_CAPI_TEST_CODE ? { test_event_code: process.env.META_CAPI_TEST_CODE } : {}),
  };
}

export async function sendMetaEvent(d: MetaCapiEvent): Promise<void> {
  try {
    if (!isMetaCapiConfigured()) return;
    if (!Number.isFinite(d.value) || d.value <= 0 || !d.eventId) return;
    // A Meta exige o user agent nos eventos de website
    if (!d.signals.userAgent) return;
    const body = buildMetaCapiBody(d);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(process.env.META_CAPI_TOKEN!)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`[MetaCAPI] ${d.eventName} ${d.eventId} recusado (${res.status}): ${detail.slice(0, 300)}`);
    } else {
      console.info(`[MetaCAPI] ${d.eventName} ${d.eventId} enviado (${d.value} ${d.currency || "EUR"})`);
    }
  } catch (err: any) {
    console.warn(`[MetaCAPI] ${d.eventName} falhou: ${err?.message}`);
  }
}
