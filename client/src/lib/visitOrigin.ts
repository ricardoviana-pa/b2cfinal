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

/**
 * O que a página de checkout manda ao setOrigin, ou null quando não há nada a
 * mandar. Segue só uma escolha explícita no banner:
 *   - "Aceitar tudo": a origem deste aparelho, que o servidor junta à do intent
 *     (por exemplo um link de recuperação com UTM aberto no checkout);
 *   - "Apenas essenciais": { consent: false }, que apaga a origem do intent;
 *   - sem escolha: null. Nunca se apaga uma origem que outro aparelho (ou
 *     esta sessão, antes) recolheu com consentimento só porque aqui o banner
 *     ainda não teve resposta.
 */
export function checkoutOriginUpdate(): VisitOriginPayload | null {
  if (typeof window === "undefined") return null;
  const choice = getCookieChoice();
  if (choice === "all") return visitOriginPayload();
  if (choice === "essential") return { v: 1, consent: false };
  return null;
}

/**
 * Mantém a origem do intent em dia enquanto a página de checkout está aberta:
 * manda já o estado da escolha atual e volta a mandar a cada escolha no banner
 * (também feita noutro separador). Mandar já ao abrir cobre a retirada feita
 * noutra página (rodapé, página da casa) e a que se perde no recarregamento
 * que measurementConsent.ts faz quando o GTM estava carregado: a página volta
 * a abrir com "Apenas essenciais" e manda { consent: false }, idempotente.
 * Devolve a função que deixa de ouvir.
 */
export function watchCheckoutOrigin(send: (origin: VisitOriginPayload) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const push = () => {
    const origin = checkoutOriginUpdate();
    if (origin) send(origin);
  };
  push();
  window.addEventListener(COOKIE_CHOICE_EVENT, push);
  return () => window.removeEventListener(COOKIE_CHOICE_EVENT, push);
}
