/** OpenAI Ads: server-side counterpart to the GTM Pixel. No Meta credentials
 * or Meta cookies are forwarded. Call only with current, consented ad signals.
 * Enable explicitly after approving the privacy notice and consent scope.
 */
import type { StoredAdSignals } from "./ad-signals-store";

export type OpenAICapiEvent = {
  eventName: "order_created" | "checkout_started";
  eventId: string;
  value: number;
  currency?: string;
  contentId?: string | null;
  contentName?: string | null;
  signals: StoredAdSignals | null;
};

export function isOpenAICapiConfigured(): boolean {
  return process.env.OPENAI_CAPI_ENABLED === "true" &&
    !!process.env.OPENAI_ADS_PIXEL_ID?.trim() &&
    !!process.env.OPENAI_CONVERSIONS_API_KEY?.trim();
}

export function buildOpenAICapiBody(d: OpenAICapiEvent, now = Date.now()) {
  const currency = (d.currency || "EUR").toUpperCase();
  const amount = Math.round(d.value * 100);
  const id = String(d.contentId || "").replace(/^(PROP|EXP)-/, "").replace(/^guesty-/, "");
  const { oppref, obref } = d.signals || {};
  return {
    ...(process.env.OPENAI_CAPI_VALIDATE_ONLY === "true" ? { validate_only: true } : {}),
    events: [{
      id: d.eventId,
      type: d.eventName,
      timestamp_ms: now,
      action_source: "web",
      // Never leak the capability URL (checkout intent UUID) or query params.
      source_url: "https://www.portugalactive.com/",
      ...(oppref ? { oppref } : {}),
      ...(obref ? { user: { obref } } : {}),
      data: {
        type: "contents",
        ...(Number.isSafeInteger(amount) && amount > 0 && currency === "EUR" ? { amount, currency } : {}),
        ...(id ? { contents: [{ id, ...(d.contentName ? { name: d.contentName } : {}), content_type: "product", quantity: 1 }] } : {}),
      },
    }],
  };
}

export async function sendOpenAIEvent(d: OpenAICapiEvent): Promise<void> {
  if (!isOpenAICapiConfigured() || d.signals?.openaiMeasurement !== true || !d.eventId.trim()) return;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const url = "https://bzr.openai.com/v1/events?pid=" + encodeURIComponent(process.env.OPENAI_ADS_PIXEL_ID!.trim());
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + process.env.OPENAI_CONVERSIONS_API_KEY!.trim(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildOpenAICapiBody(d)),
      signal: controller.signal,
    });
    // Don't log payload, event IDs, response bodies, or secrets.
    if (!res.ok) console.warn("[OpenAI CAPI] event rejected: " + res.status);
  } catch {
    console.warn("[OpenAI CAPI] delivery failed");
  } finally {
    clearTimeout(timeout);
  }
}
