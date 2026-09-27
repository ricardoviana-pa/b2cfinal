/**
 * Origem da visita: de onde veio o hóspede que reservou no site.
 *
 * Partilhado pelo navegador (captura em client/src/lib/visitOrigin.ts) e pelo
 * servidor (validação em server/services/visit-origin.ts e linha "Origem:" na
 * nota da reserva do Guesty). Guarda só a origem da visita:
 *   - utm_source, utm_medium, utm_campaign, utm_content, utm_term;
 *   - o TIPO de identificador de clique (gclid, gbraid, wbraid, msclkid,
 *     fbclid), nunca o valor;
 *   - o domínio de quem nos mandou a visita (sem caminho nem query);
 *   - o caminho da página de entrada (sem query, ids trocados por ":id");
 *   - a hora de cada toque (primeira e última visita).
 * Um valor que pareça um email ou um telefone é recusado ("removido"). O
 * servidor volta a limpar tudo o que o navegador envia: estas funções são
 * idempotentes.
 *
 * Só se escreve no navegador com o consentimento "Aceitar tudo" (ver
 * measurementConsent.ts). Cada toque dura 30 dias, a janela mais longa de
 * atribuição do marketing (Google, parceiros e impresso).
 */

export const VISIT_ORIGIN_STORAGE_KEY = "pa-origin";
export const VISIT_ORIGIN_TTL_DAYS = 30;
export const VISIT_ORIGIN_TTL_MS = VISIT_ORIGIN_TTL_DAYS * 86_400_000;
/** O servidor aceita toques até 31 dias (margem de um dia sobre os 30). */
export const MAX_TOUCH_AGE_SEC = 31 * 86_400;
/** Relógios adiantados: um toque pode estar até 5 minutos "no futuro". */
export const MAX_FUTURE_SEC = 300;

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

/** Por ordem de prioridade quando o URL traz mais do que um. Só o tipo sai daqui. */
export const CLICK_ID_KEYS = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"] as const;
export type ClickIdType = (typeof CLICK_ID_KEYS)[number];

/** Marca de um valor recusado por parecer um dado pessoal. */
export const REMOVED = "removido";

const MAX_VALUE = 100;
const MAX_PATH = 150;

export type VisitTouch = Partial<Record<UtmKey, string>> & {
  clickId?: ClickIdType;
  /** Domínio de quem nos mandou a visita, sem "www.". */
  referrer?: string;
  /** Caminho da página de entrada, sem query. */
  landing?: string;
};

/** Toque guardado no navegador: hora em milissegundos do relógio do navegador. */
export type StoredTouch = VisitTouch & { at: number };

export interface StoredOriginState {
  v: 1;
  first: StoredTouch | null;
  last: StoredTouch | null;
}

/** Toque enviado ao servidor: idade em segundos, para o relógio do navegador não contar. */
export type PayloadTouch = VisitTouch & { ageSec: number };

export type VisitOriginPayload =
  | { v: 1; consent: false }
  | { v: 1; consent: true; stored: boolean; first: PayloadTouch | null; last: PayloadTouch | null };

/** "campaign": traz UTM, clique ou site de origem. "direct": entrada direta. "skip": não conta. */
export type LandingKind = "campaign" | "direct" | "skip";

export interface LandingResult {
  kind: LandingKind;
  touch: VisitTouch;
  at: number;
}

/**
 * Parece um dado pessoal: um email em qualquer forma, 7 ou mais algarismos
 * seguidos (ignorando espaços, parênteses e +), ou 9 ou mais algarismos
 * separados só por hífenes ou pontos (912-345-678). Uma data como 2026-10-03
 * (8 algarismos) passa.
 */
export function looksPersonal(raw: string): boolean {
  if (/@|%40/i.test(raw)) return true;
  if (/\d{7,}/.test(raw.replace(/[\s()+]/g, ""))) return true;
  return /\d{9,}/.test(raw.replace(/[\s()+.-]/g, ""));
}

/** Um parâmetro de campanha limpo: só [A-Za-z0-9._~-], no máximo 100 caracteres. */
export function cleanValue(raw: unknown, opts: { lower?: boolean } = {}): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (looksPersonal(trimmed)) return REMOVED;
  let value = trimmed.replace(/[^A-Za-z0-9._~-]/g, "_").slice(0, MAX_VALUE);
  // "-" é o vazio da linha da nota; um valor só de pontuação não diz nada.
  if (/^[-_.~]*$/.test(value)) return undefined;
  if (opts.lower) value = value.toLowerCase();
  return value;
}

/** Domínio de origem: minúsculas, sem "www.", só letras, algarismos, pontos e hífenes. */
export function cleanReferrerHost(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let host = raw.trim().toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  if (!host || host.length > MAX_VALUE || !host.includes(".") || !/^[a-z0-9.-]+$/.test(host)) return undefined;
  if (looksPersonal(host)) return REMOVED;
  return host;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX24_RE = /(^|\/)[0-9a-f]{24}(?=\/|$)/gi;

/** Caminho de entrada sem query nem fragmento. O id do intent em
 *  /checkout/<uuid> dá acesso aos dados do hóspede: sai como ":id". */
export function cleanLandingPath(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  let path = raw.split(/[?#]/)[0].trim();
  if (!path.startsWith("/")) return undefined;
  path = path.replace(UUID_RE, ":id").replace(HEX24_RE, "$1:id");
  if (looksPersonal(path)) return REMOVED;
  return path.replace(/[^A-Za-z0-9._~/:-]/g, "_").slice(0, MAX_PATH);
}

/** Só as chaves permitidas, cada uma limpa. Tudo o resto é ignorado. */
export function cleanTouch(input: unknown): VisitTouch {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const touch: VisitTouch = {};
  for (const key of UTM_KEYS) {
    const value = cleanValue(src[key], { lower: key === "utm_source" || key === "utm_medium" });
    if (value) touch[key] = value;
  }
  if (typeof src.clickId === "string" && (CLICK_ID_KEYS as readonly string[]).includes(src.clickId)) {
    touch.clickId = src.clickId as ClickIdType;
  }
  const referrer = cleanReferrerHost(src.referrer);
  if (referrer) touch.referrer = referrer;
  const landing = cleanLandingPath(src.landing);
  if (landing) touch.landing = landing;
  return touch;
}

/** Um toque de campanha traz UTM, identificador de clique ou site de origem. */
export function isCampaignTouch(touch: VisitTouch | null | undefined): boolean {
  if (!touch) return false;
  return UTM_KEYS.some((key) => !!touch[key]) || !!touch.clickId || !!touch.referrer;
}

/** Regressos dos pagamentos (Stripe, Klarna, PayPal) continuam a visita: não são origem. */
const PAYMENT_HOSTS = ["stripe.com", "stripe.network", "klarna.com", "klarna.net", "paypal.com", "paypalobjects.com"];

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

function isOwnHost(host: string, currentHost: string): boolean {
  return hostMatches(host, "portugalactive.com") || host === currentHost.toLowerCase();
}

function referrerHostname(referrer: string): string {
  if (!referrer) return "";
  try {
    return new URL(referrer).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export interface LandingInput {
  search: string;
  pathname: string;
  referrer: string;
  currentHost: string;
  /** PerformanceNavigationTiming.type: navigate, reload, back_forward, prerender. */
  navigationType?: string;
  at: number;
}

/** Lê a página de entrada de um carregamento completo. Não guarda nada. */
export function readLanding(input: LandingInput): LandingResult {
  const touch: VisitTouch = {};
  const skip = (): LandingResult => ({ kind: "skip", touch: {}, at: input.at });
  // Recarregar a página ou voltar atrás não é uma visita nova.
  if (input.navigationType === "reload" || input.navigationType === "back_forward") return skip();
  const path = input.pathname || "/";
  // /booking/klarna-return, /booking/paypal-return, /xx/booking/thank-you/...
  if (/^\/(?:[a-z]{2}\/)?booking(?:\/|$)/i.test(path)) return skip();
  const refHost = referrerHostname(input.referrer);
  if (refHost && PAYMENT_HOSTS.some((domain) => hostMatches(refHost, domain))) return skip();

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(input.search || "");
  } catch {
    params = new URLSearchParams();
  }
  for (const key of UTM_KEYS) {
    const value = cleanValue(params.get(key), { lower: key === "utm_source" || key === "utm_medium" });
    if (value) touch[key] = value;
  }
  const clickId = CLICK_ID_KEYS.find((key) => (params.get(key) || "").trim() !== "");
  if (clickId) touch.clickId = clickId;
  if (refHost && !isOwnHost(refHost, input.currentHost)) {
    const referrer = cleanReferrerHost(refHost);
    if (referrer) touch.referrer = referrer;
  }
  const landing = cleanLandingPath(path);
  if (landing) touch.landing = landing;
  return { kind: isCampaignTouch(touch) ? "campaign" : "direct", touch, at: input.at };
}

function aliveTouch(touch: StoredTouch | null | undefined, now: number): StoredTouch | null {
  if (!touch || !Number.isFinite(touch.at)) return null;
  if (now - touch.at >= VISIT_ORIGIN_TTL_MS) return null;
  if (touch.at - now > MAX_FUTURE_SEC * 1000) return null;
  return touch;
}

/** Cada toque expira 30 dias depois da sua hora; sem toques vivos não fica nada. */
export function pruneExpired(state: StoredOriginState | null, now: number): StoredOriginState | null {
  if (!state) return null;
  let first = aliveTouch(state.first, now);
  let last = aliveTouch(state.last, now);
  if (!first && !last) return null;
  if (!first) first = last;
  if (!last) last = first;
  return { v: 1, first, last };
}

/**
 * Junta a página de entrada ao que já estava guardado.
 * - Nada guardado: a entrada passa a primeira e última visita (mesmo direta).
 * - Entrada de campanha: passa a última visita; a primeira fica.
 * - Entrada direta: não apaga a última visita de campanha (último clique não direto).
 */
export function applyLanding(state: StoredOriginState | null, landing: LandingResult, now: number): StoredOriginState | null {
  const current = pruneExpired(state, now);
  if (landing.kind === "skip") return current;
  const touch: StoredTouch = { ...cleanTouch(landing.touch), at: landing.at };
  if (!current) return { v: 1, first: touch, last: touch };
  if (landing.kind === "campaign") return { v: 1, first: current.first ?? touch, last: touch };
  return current;
}

/** Lê o estado guardado no navegador, que pode vir estragado ou adulterado. */
export function parseStoredState(raw: string | null | undefined): StoredOriginState | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || data.v !== 1) return null;
    const touch = (value: unknown): StoredTouch | null => {
      if (!value || typeof value !== "object") return null;
      const at = Number((value as { at?: unknown }).at);
      if (!Number.isFinite(at) || at <= 0) return null;
      return { ...cleanTouch(value), at };
    };
    const first = touch(data.first);
    const last = touch(data.last);
    if (!first && !last) return null;
    return { v: 1, first: first ?? last, last: last ?? first };
  } catch {
    return null;
  }
}

/** O que vai com o pedido de checkout quando há consentimento. */
export function toPayload(state: StoredOriginState | null, stored: boolean, now: number): VisitOriginPayload {
  const touch = (value: StoredTouch | null | undefined): PayloadTouch | null => {
    if (!value) return null;
    const { at, ...rest } = value;
    return { ...cleanTouch(rest), ageSec: Math.max(0, Math.round((now - at) / 1000)) };
  };
  return { v: 1, consent: true, stored, first: touch(state?.first), last: touch(state?.last) };
}
