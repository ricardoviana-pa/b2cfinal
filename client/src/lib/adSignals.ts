/**
 * Sinais da Meta para a API de Conversões do servidor (server/services/meta-capi.ts).
 *
 * Só com "Aceitar tudo" no site live (hasMeasurementConsent): é a mesma
 * autorização que deixa o pixel arrancar no GTM. Sem ela devolve undefined e o
 * servidor não envia nada à Meta para este intent. Com ela manda os cookies
 * `_fbp` / `_fbc` do pixel (quando existem); o servidor junta o user agent e o
 * IP do pedido e guarda tudo em booking_intent_ad_signals, apagado 31 dias
 * depois. Nunca entra na origem da visita, na nota do Guesty nem no dataLayer.
 */
import { hasMeasurementConsent } from "./measurementConsent";
import { isLiveSiteHostname } from "@shared/deployment";

export type AdSignals = { fbp?: string; fbc?: string; oppref?: string; obref?: string; openaiMeasurement?: boolean };

/** Formato dos cookies do pixel: fb.<subdomínio>.<ms>.<valor> */
const FB_COOKIE_RE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{1,500}$/;

function readCookie(name: string, valid: (value: string) => boolean = value => FB_COOKIE_RE.test(value)): string | undefined {
  try {
    for (const part of document.cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === name) {
        const value = decodeURIComponent(v.join("="));
        return valid(value) ? value : undefined;
      }
    }
  } catch { /* cookies indisponíveis */ }
  return undefined;
}

export function adSignalsPayload(): AdSignals | undefined {
  if (typeof window === "undefined" || !isLiveSiteHostname(window.location.hostname)) return undefined;
  if (!hasMeasurementConsent()) return undefined;
  const fbp = readCookie("_fbp");
  const fbc = readCookie("_fbc");
  // Enable only after consent and privacy notice review.
  if (import.meta.env.VITE_OPENAI_CAPI_ENABLED !== 'true') return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
  const validRef = (v: string) => v.length > 0 && v.length <= 1024 && !/[\x00-\x20\x7f]/.test(v);
  const click = new URLSearchParams(window.location.search).get("oppref");
  const oppref = click && validRef(click) ? click : readCookie("__oppref", validRef);
  const obref = readCookie("__obref", validRef);
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}), ...(oppref ? { oppref } : {}), ...(obref ? { obref } : {}), openaiMeasurement: true };
}

/** Id de evento partilhado entre o pixel (GTM) e a CAPI do servidor. */
export function newMetaEventId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}
