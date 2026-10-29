/* ==========================================================================
   BÓKUN ANALYTICS GUARD (auditoria 29 out 2026,
   tracking-legal-security-bokun-datalayer-relay)

   O widget da Bókun corre num iframe de widgets.bokun.io. Com o Google Tag
   Manager ligado no canal de reservas da Bókun, o iframe reencaminha para esta
   página, por postMessage, cada push do seu dataLayer e cada chamada gtag:
   { messageType: 'GaEvent', args }. O script da Bókun na página
   (BokunWidgets.js) repete-os aqui:
     Array.isArray(args) ? window.gtag(...args) : window.dataLayer.push(args)
   Isto passa ao lado do nosso consentimento (pushDL) e põe os eventos GA4 da
   Bókun no nosso GTM: view_item, add_to_cart, begin_checkout e purchase com o
   valor da experiência, o id da reserva Bókun e `affiliation: 'Bokun widgets'`.
   As tags de conversão das casas (Google Ads "Reserva B2C", GA4 purchase,
   Meta Purchase) disparam só pelo nome do evento, logo uma experiência
   reservada no widget contava como reserva de casa.

   Esta guarda ouve essas mensagens antes do listener da Bókun e trava-as
   (stopImmediatePropagation). Tem de ser registada ANTES do script da Bókun:
   nos eventos da window o browser chama os listeners pela ordem de registo,
   mesmo os de captura (Chromium 148, verificado). Por isso é instalada em
   ensureBokunLoader, antes de injetar o loader, o único sítio que carrega
   scripts da Bókun (o teste falha se aparecer outro). O `capture: true` só
   ajuda nos browsers que correm a captura primeiro.
   - eventos (objeto com `event`, ou gtag('event', nome, params)) passam a
     `bokun_<nome>`, com o conteúdo original em `bokun` e sem `ecommerce` no
     topo, e entram por pushDL, ou seja, só com "Aceitar tudo". Nenhuma tag do
     GTM ouve estes nomes; ficam disponíveis se um dia quiserem medir as
     experiências à parte;
   - outros comandos gtag (consent, set, config, js, get) e pushes sem evento
     são descartados: um "consent update" vindo da Bókun nunca pode mudar o
     nosso;
   - o arranque do GTM pedido pelo iframe (InitializeTagManager) é confirmado
     aqui, sem correr o código da Bókun que acrescentaria um gtag('config')
     ou um segundo GTM à página. Sem confirmação, o iframe carregaria o GTM
     dentro dele, fora do nosso aviso de cookies.

   Os nossos eventos não passam por aqui (nunca viajam por postMessage) e o
   window.dataLayer.push fica intacto: o GTM enfileira cada push antes de
   chamar o push anterior, por isso um filtro no próprio push não os pararia, e
   um filtro pelo prefixo dos item_id apanharia eventos nossos (SKUs dos extras,
   FLEX, RECEPTION-…).
   ========================================================================== */

import { pushDL } from './datalayer';

/** Origens que o script da Bókun aceita (BokunWidgets.js, listas Ub e zb). */
const BOKUN_ORIGINS = ['https://widgets.bokun.io', 'https://bookings.bokun.io', 'https://bokuntest.com', 'http://localhost'];
const BOKUN_HOST_SUFFIXES = ['.bokun.io', '.bokuntest.com', '.bokun.tools'];

export const BOKUN_EVENT_PREFIX = 'bokun_';

export function isBokunOrigin(origin: unknown): boolean {
  if (typeof origin !== 'string' || !origin) return false;
  if (BOKUN_ORIGINS.some((o) => origin === o || origin.startsWith(`${o}:`))) return true;
  let hostname: string;
  try { hostname = new URL(origin).hostname; } catch { return false; }
  return BOKUN_HOST_SUFFIXES.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Eventos que o próprio GTM gera; o iframe da Bókun já os filtra, mas fica a guarda. */
const GTM_LIFECYCLE = /^gtm\./;

/**
 * O que um `args` de uma mensagem GaEvent da Bókun pode deixar entrar no
 * nosso dataLayer: o evento renomeado, ou null (descartado).
 */
export function renameBokunAnalytics(args: unknown): Record<string, unknown> | null {
  if (Array.isArray(args)) {
    // Comando gtag reencaminhado: ['event', nome, params], ['consent', …], ['set', …]…
    const [command, name, params] = args;
    if (command !== 'event' || typeof name !== 'string' || !name || GTM_LIFECYCLE.test(name)) return null;
    return { event: `${BOKUN_EVENT_PREFIX}${name}`, bokun: isPlainObject(params) ? { ...params } : {} };
  }
  if (isPlainObject(args)) {
    // Push de dataLayer reencaminhado: { event, ecommerce, gclid, … }
    const { event, ...payload } = args;
    if (typeof event !== 'string' || !event || GTM_LIFECYCLE.test(event)) return null;
    return { event: `${BOKUN_EVENT_PREFIX}${event}`, bokun: payload };
  }
  return null;
}

/** Como pushEcommerce faz ao `ecommerce`: limpa o objeto anterior no modelo do GTM. */
function pushRenamed(event: Record<string, unknown>): void {
  pushDL({ bokun: null });
  pushDL(event);
}

type MessageTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>;
type PostMessageSource = { postMessage: (message: unknown, targetOrigin: string) => void };

function acknowledge(event: MessageEvent, messageType: string, requestId: unknown): void {
  if (typeof requestId !== 'string' || !requestId) return;
  const source = event.source as unknown as PostMessageSource | null;
  try { source?.postMessage({ messageType, requestId }, event.origin || '*'); } catch { /* iframe já fechou */ }
}

let uninstallGlobal: (() => void) | null = null;

/**
 * Instala a guarda (idempotente na janela da página). Chamar ANTES de
 * carregar o BokunWidgetsLoader: um listener registado depois do da Bókun
 * chega tarde. Devolve a função que a retira.
 */
export function installBokunAnalyticsGuard(
  target: MessageTarget = window,
  push: (event: Record<string, unknown>) => void = pushRenamed,
): () => void {
  const isPageWindow = typeof window !== 'undefined' && target === window;
  if (isPageWindow && uninstallGlobal) return uninstallGlobal;

  const onMessage = (event: MessageEvent) => {
    if (!isBokunOrigin(event.origin)) return;
    const data = event.data as { messageType?: unknown; args?: unknown; requestId?: unknown } | null;
    if (!isPlainObject(data)) return;
    if (data.messageType === 'GaEvent') {
      event.stopImmediatePropagation();
      acknowledge(event, 'GaEventAck', data.requestId);
      const renamed = renameBokunAnalytics(data.args);
      if (renamed) push(renamed);
    } else if (data.messageType === 'InitializeTagManager') {
      event.stopImmediatePropagation();
      acknowledge(event, 'InitializeTagManagerAck', data.requestId);
    }
  };
  target.addEventListener('message', onMessage as EventListener, true);
  const uninstall = () => {
    target.removeEventListener('message', onMessage as EventListener, true);
    if (isPageWindow) uninstallGlobal = null;
  };
  if (isPageWindow) uninstallGlobal = uninstall;
  return uninstall;
}
