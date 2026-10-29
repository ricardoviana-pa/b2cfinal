/**
 * Cabeçalhos e ficheiros de segurança que a Helmet não cobre (auditoria de
 * 29 out 2026: tracking-legal-security-hardening e
 * tracking-legal-security-corp-blocks-email-images).
 *
 * - Permissions-Policy: desliga só funcionalidades do browser que o site não
 *   usa (ver PERMISSIONS_POLICY_DISABLED). Pagamentos (Apple Pay / Google Pay
 *   nos iframes da Stripe), geolocalização, ecrã inteiro, autoplay e os
 *   sensores que o embed do YouTube pede ficam como estão.
 * - Cross-Origin-Resource-Policy: a Helmet põe `same-origin` em tudo, o que
 *   partia o logótipo no topo de cada email transacional
 *   (/email/brand-band.png) nos clientes que carregam imagens num motor de
 *   browser, e as fotos ligadas a partir de outros sites. Os ficheiros
 *   estáticos públicos (imagens, vídeo, fontes, JS e CSS) passam a
 *   `cross-origin`; o HTML e a API continuam `same-origin`.
 * - /.well-known/security.txt (RFC 9116): contacto para quem encontra uma
 *   falha de segurança.
 */
import type { Express, RequestHandler } from "express";
import type { ServerResponse } from "node:http";

/**
 * Funcionalidades que o site não usa, nem diretamente nem nos iframes que
 * embebe (Stripe, PayPal, Bókun, YouTube, Vimeo, Google Maps). Antes de usar
 * uma delas, tirá-la daqui: o teste em server/security-headers.test.ts falha
 * se o código do cliente começar a pedir uma destas APIs.
 *
 * Fora da lista de propósito:
 * - payment, publickey-credentials-get, otp-credentials: Apple Pay / Google Pay
 *   e a autenticação forte (3-D Secure, Link) nos iframes da Stripe;
 * - geolocation: sem prova de que nenhum widget de terceiros a usa;
 * - accelerometer, gyroscope, autoplay, encrypted-media, picture-in-picture,
 *   fullscreen, clipboard-write: delegadas ao embed do YouTube e do Vimeo
 *   (BlogArticle.tsx, ExperienceDetail.tsx) e usadas pelos botões de partilha;
 * - browsing-topics, attribution-reporting e afins: decisão de marketing
 *   (Google Ads), não de segurança.
 */
export const PERMISSIONS_POLICY_DISABLED = [
  "camera",
  "microphone",
  "display-capture",
  "usb",
  "serial",
  "hid",
  "bluetooth",
  "midi",
  "magnetometer",
  "idle-detection",
  "xr-spatial-tracking",
] as const;

export const PERMISSIONS_POLICY = PERMISSIONS_POLICY_DISABLED.map((feature) => `${feature}=()`).join(", ");

/** Ficheiros estáticos que nunca são um documento: não precisam de Permissions-Policy. */
const NON_DOCUMENT_FILE = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|bmp|mp4|webm|mov|mp3|woff2?|ttf|otf|eot|js|mjs|css|map|json|txt|xml|webmanifest)$/i;

export function isNonDocumentFile(pathname: string): boolean {
  return NON_DOCUMENT_FILE.test(pathname);
}

/**
 * Permissions-Policy em todas as respostas exceto ficheiros estáticos que não
 * são documentos. Assim cobre o HTML do SPA e do SSR, o que o prerender devolve
 * aos bots, os .html de client/public e as páginas HTML de /api (o opt-out dos
 * lembretes). Num JSON o browser ignora o cabeçalho.
 */
export const permissionsPolicyHeader: RequestHandler = (req, res, next) => {
  if (!isNonDocumentFile(req.path)) res.setHeader("Permissions-Policy", PERMISSIONS_POLICY);
  next();
};

/** Ficheiros públicos que outros sites (e os emails) podem embeber. HTML, JSON e texto não. */
const CROSS_ORIGIN_FILE = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?|ttf|otf|css|js|mjs)$/i;

export function isCrossOriginStaticFile(filePath: string): boolean {
  return CROSS_ORIGIN_FILE.test(filePath);
}

/**
 * `setHeaders` do express.static (server/_core/vite.ts, serveStatic): corre só
 * quando um ficheiro é mesmo servido, depois da Helmet, e troca o
 * `same-origin` por `cross-origin` nas imagens, vídeos, fontes, JS e CSS.
 */
export function setStaticFileHeaders(res: Pick<ServerResponse, "setHeader">, filePath: string): void {
  if (isCrossOriginStaticFile(filePath)) res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

export const SECURITY_CONTACT = "mailto:info@portugalactive.com";

/**
 * security.txt (RFC 9116). O Expires é calculado no pedido: o mesmo dia do
 * próximo ano, às 00:00 UTC. Fica sempre um pouco abaixo de um ano, como a RFC
 * recomenda, e nunca caduca por esquecimento.
 */
export function securityTxt(now: Date = new Date()): string {
  const expires = new Date(Date.UTC(now.getUTCFullYear() + 1, now.getUTCMonth(), now.getUTCDate()));
  return [
    `Contact: ${SECURITY_CONTACT}`,
    `Expires: ${expires.toISOString().replace(".000Z", "Z")}`,
    "Preferred-Languages: en, pt",
    "",
  ].join("\n");
}

export function registerSecurityTxtRoutes(app: Express): void {
  app.get("/.well-known/security.txt", (_req, res) => {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    // O Expires muda à meia-noite UTC: um dia de cache chega.
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(securityTxt());
  });
  // RFC 9116 §3: o caminho antigo pode redirecionar para o de /.well-known.
  app.get("/security.txt", (_req, res) => {
    res.redirect(301, "/.well-known/security.txt");
  });
}
