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

export type AdSignals = { fbp?: string; fbc?: string };

/** Formato dos cookies do pixel: fb.<subdomínio>.<ms>.<valor> */
const FB_COOKIE_RE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{1,500}$/;

function readCookie(name: string): string | undefined {
  try {
    for (const part of document.cookie.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === name) {
        const value = decodeURIComponent(v.join("="));
        return FB_COOKIE_RE.test(value) ? value : undefined;
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
  return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc } : {}) };
}

/** Id de evento partilhado entre o pixel (GTM) e a CAPI do servidor. */
export function newMetaEventId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${rand}`;
}
