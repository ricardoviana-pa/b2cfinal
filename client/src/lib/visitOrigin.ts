/**
 * Origem da visita no navegador (regras em shared/visit-origin.ts).
 *
 * Em cada carregamento completo lê-se a página de entrada (UTM, tipo de
 * clique, domínio de origem, caminho). Com o consentimento "Aceitar tudo"
 * junta-se a localStorage["pa-origin"] (primeira e última visita, 30 dias por
 * toque) e segue com o pedido de checkout. Sem esse consentimento não se
 * escreve nada no aparelho e o checkout leva só { consent: false }: a reserva
 * fica com "Origem: sem consentimento". A leitura da página de entrada fica
 * em memória, como o landingLocation do App: se o consentimento chegar mais
 * tarde na mesma página, a entrada é guardada com a hora a que aconteceu.
 * Retirar o consentimento apaga a chave (aqui e em measurementConsent.ts).
 */
import {
  VISIT_ORIGIN_STORAGE_KEY,
  applyLanding,
  parseStoredState,
  pruneExpired,
  readLanding,
  toPayload,
  type LandingResult,
  type StoredOriginState,
  type VisitOriginPayload,
} from "@shared/visit-origin";
import { COOKIE_CHOICE_EVENT, getCookieChoice } from "./measurementConsent";

let started = false;
let landing: LandingResult | null = null;
let landingPathname = "";
let landingApplied = false;
/** Estado desta página quando o armazenamento não está disponível. */
let memory: StoredOriginState | null = null;
let storageOk = false;
/** A última escrita falhou: a memória tem o que o armazenamento não tem. */
let memoryAhead = false;

function consentGranted(): boolean {
  return getCookieChoice() === "all";
}

function navigationType(): string | undefined {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    return entry?.type;
  } catch {
    return undefined;
  }
}

function readStorage(): { ok: boolean; state: StoredOriginState | null } {
  try {
    return { ok: true, state: parseStoredState(window.localStorage.getItem(VISIT_ORIGIN_STORAGE_KEY)) };
  } catch {
    return { ok: false, state: null };
  }
}

function writeStorage(state: StoredOriginState | null): boolean {
  try {
    if (state) window.localStorage.setItem(VISIT_ORIGIN_STORAGE_KEY, JSON.stringify(state));
    else window.localStorage.removeItem(VISIT_ORIGIN_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Só com consentimento: junta a entrada desta página ao que estava guardado. */
function sync(now = Date.now()): StoredOriginState | null {
  if (!consentGranted()) return null;
  // Relê o armazenamento: outro separador pode ter registado uma visita nova.
  const read = readStorage();
  let state = pruneExpired(read.ok && !memoryAhead ? read.state : memory, now);
  if (landing && !landingApplied) {
    state = applyLanding(state, landing, now);
    landingApplied = true;
  }
  storageOk = read.ok && writeStorage(state);
  memoryAhead = !storageOk;
  memory = state;
  return state;
}

function forget(): void {
  memory = null;
  storageOk = false;
  memoryAhead = false;
  landingApplied = false;
  try {
    window.localStorage.removeItem(VISIT_ORIGIN_STORAGE_KEY);
  } catch {
    /* armazenamento indisponível: não havia nada guardado */
  }
}

function onCookieChoice(): void {
  if (consentGranted()) sync();
  else forget();
}

/** Uma vez por carregamento completo, antes de qualquer navegação interna. */
export function startVisitOrigin(): void {
  if (typeof window === "undefined" || started) return;
  started = true;
  landingPathname = window.location.pathname;
  landing = readLanding({
    search: window.location.search,
    pathname: window.location.pathname,
    referrer: typeof document !== "undefined" ? document.referrer : "",
    currentHost: window.location.hostname,
    navigationType: navigationType(),
    at: Date.now(),
  });
  onCookieChoice();
  window.addEventListener(COOKIE_CHOICE_EVENT, onCookieChoice);
}

/** O que segue com o pedido de checkout. Sem consentimento: só { consent: false }. */
export function visitOriginPayload(): VisitOriginPayload {
  if (typeof window === "undefined" || !consentGranted()) return { v: 1, consent: false };
  const now = Date.now();
  const state = sync(now);
  return toPayload(state, storageOk, now);
}

/** Esta página abriu diretamente em /checkout/<intentId> com UTM, clique ou
 *  site de origem (por exemplo um email de recuperação do carrinho). */
export function landedOnCheckoutWithNewTouch(intentId: string): boolean {
  return !!landing && landing.kind === "campaign" && landingPathname.includes(`/checkout/${intentId}`);
}
