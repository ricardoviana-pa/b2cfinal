/**
 * META CONVERSIONS API (spec §13 — CAPI server-side "onde possível").
 *
 * Com o iOS a cortar cookies, o Pixel do browser perde uma fatia grande dos
 * purchases — o CAPI envia o evento do servidor com email/telefone hasheados
 * (match quality alta) e event_id = confirmationCode para deduplicar com o
 * Pixel do GTM (basta o GTM enviar o mesmo event_id no purchase).
 *
 * Config por env no Render (sem env → no-op silencioso):
 *   META_PIXEL_ID=1234567890
 *   META_CAPI_TOKEN=EAAB...
 *   META_CAPI_TEST_CODE=TEST123   (opcional, para o Test Events do Events Manager)
 *
 * Fail-soft SEMPRE: um evento de marketing nunca pode partir o funil.
 */
import { createHash } from "crypto";

const GRAPH_VERSION = "v21.0";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const normEmail = (e?: string | null) => (e ? sha256(e.trim().toLowerCase()) : undefined);
const normPhone = (p?: string | null) => {
  if (!p) return undefined;
  const digits = p.replace(/[^0-9]/g, "");
  return digits ? sha256(digits) : undefined;
};

export function isMetaCapiConfigured(): boolean {
  return !!(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

export async function sendMetaPurchase(d: {
  /** Dedup com o Pixel: o purchase do browser usa transaction_id = confirmationCode */
  eventId: string;
  value: number;
  currency?: string;
  email?: string | null;
  phone?: string | null;
  contentName?: string | null;
  sourceUrl?: string | null;
}): Promise<void> {
  try {
    if (!isMetaCapiConfigured()) return;
    if (!Number.isFinite(d.value) || d.value <= 0 || !d.eventId) return;
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: "Purchase",
          event_time: Math.floor(Date.now() / 1000),
          event_id: d.eventId,
          action_source: "website",
          ...(d.sourceUrl ? { event_source_url: d.sourceUrl } : {}),
          user_data: {
            ...(normEmail(d.email) ? { em: [normEmail(d.email)] } : {}),
            ...(normPhone(d.phone) ? { ph: [normPhone(d.phone)] } : {}),
          },
          custom_data: {
            value: Math.round(d.value * 100) / 100,
            currency: (d.currency || "EUR").toUpperCase(),
            ...(d.contentName ? { content_name: d.contentName } : {}),
            content_type: "product",
          },
        },
      ],
      ...(process.env.META_CAPI_TEST_CODE ? { test_event_code: process.env.META_CAPI_TEST_CODE } : {}),
    };
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
      console.warn(`[MetaCAPI] Purchase ${d.eventId} recusado (${res.status}): ${detail.slice(0, 300)}`);
    } else {
      console.info(`[MetaCAPI] Purchase ${d.eventId} enviado (${d.value} ${d.currency || "EUR"})`);
    }
  } catch (err: any) {
    console.warn(`[MetaCAPI] Purchase falhou: ${err?.message}`);
  }
}
