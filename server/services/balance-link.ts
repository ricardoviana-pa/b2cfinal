/**
 * Pagamento em duas partes: o link sem login da página "A segunda parte da
 * sua estadia" (/:lang/booking/balance/:intentId#t=…). Spec
 * docs/pagamento_duas_partes.md 4.1 (ponto 9) e 5.6.
 *
 * Porquê um token próprio e não o do opt-out da recuperação: este link
 * permite pagar, trocar de cartão, pausar a automação e CANCELAR a reserva
 * com reembolso. Por isso:
 * - tem prazo dentro do próprio token (`${exp}.${mac}`, exp em segundos
 *   Unix): o chamador passa max(H, D) + 3 dias (balanceLinkExpiresAt), e um link antigo deixa de abrir
 *   a página sem precisar de estado na BD;
 * - o HMAC cobre um prefixo de finalidade, o intent e o prazo, para que um
 *   token de outro uso do mesmo segredo (JWT_SECRET) nunca sirva aqui e
 *   para que não se possa esticar o prazo mexendo no número;
 * - sem segredo configurado NÃO há fallback fixo (ao contrário do opt-out):
 *   um segredo conhecido deixaria qualquer pessoa cancelar a reserva de
 *   outra. Gerar lança, verificar devolve false.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { CHECKOUT_EMAIL_ORIGIN } from "../lib/checkout-email";
import { emailLang } from "./email-i18n";

/** Prefixo de finalidade dentro do HMAC; mudar invalida todos os links. */
const PURPOSE = "pa-balance-link.v1";
/** 32 hex = 128 bits: chega para um link com prazo e não alonga o SMS. */
const MAC_HEX = 32;

/** Segredo lido a cada chamada (os testes e o Render podem mudá-lo). */
function balanceLinkSecret(): string | null {
  const s = process.env.BALANCE_LINK_SECRET || process.env.JWT_SECRET || "";
  return s.trim() ? s : null;
}

function mac(secret: string, intentId: string, expSeconds: number): string {
  return createHmac("sha256", secret)
    .update(`${PURPOSE}:${intentId}:${expSeconds}`)
    .digest("hex")
    .slice(0, MAC_HEX);
}

/**
 * Token do link: `${expSeconds}.${hmac32}`. Lança sem segredo, sem intent ou
 * com uma data inválida: um email com um link que não abre é pior do que
 * um email que não sai (o motor fica a saber e tenta de novo).
 */
export function balanceLinkToken(intentId: string, expiresAt: Date): string {
  const secret = balanceLinkSecret();
  if (!secret) throw new Error("BALANCE_LINK_SECRET (ou JWT_SECRET) em falta: link da 2.ª parte não gerado");
  if (!intentId) throw new Error("balanceLinkToken: intent em falta");
  const ms = expiresAt instanceof Date ? expiresAt.getTime() : NaN;
  if (!Number.isFinite(ms)) throw new Error("balanceLinkToken: prazo inválido");
  const exp = Math.floor(ms / 1000);
  return `${exp}.${mac(secret, intentId, exp)}`;
}

/**
 * Verificação em tempo constante. Qualquer coisa fora do formato, um prazo
 * já passado (o instante do prazo conta como expirado) ou a falta de
 * segredo dão false, nunca uma exceção: a rota responde "link expirado".
 */
export function verifyBalanceLinkToken(intentId: string, token: string, now: Date = new Date()): boolean {
  const secret = balanceLinkSecret();
  if (!secret || !intentId || typeof token !== "string") return false;
  const m = /^(\d{1,12})\.([0-9a-f]{32})$/.exec(token.trim().toLowerCase());
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= now.getTime()) return false;
  try {
    return timingSafeEqual(Buffer.from(mac(secret, intentId, exp), "utf8"), Buffer.from(m[2], "utf8"));
  } catch {
    return false;
  }
}

/**
 * Prazo do link: 3 dias depois do mais tarde de H e do fim do cancelamento
 * gratuito. Com H em D−3, um prazo só por H fechava a página ainda dentro do
 * cancelamento gratuito, e uma estadia paga deixava de se poder cancelar lá.
 */
export function balanceLinkExpiresAt(row: { hardStopAt: Date | string; freeCancelDeadline: Date | string }): Date {
  const latest = Math.max(new Date(row.hardStopAt).getTime(), new Date(row.freeCancelDeadline).getTime());
  return new Date(latest + 3 * 86_400_000);
}

/**
 * URL completo do link, sempre na origem que aceita pagamentos reais
 * (CHECKOUT_EMAIL_ORIGIN) e na língua do hóspede (fallback EN, como o site).
 */
export function balanceLinkUrl(intentId: string, locale: string | null | undefined, expiresAt: Date): string {
  const token = balanceLinkToken(intentId, expiresAt);
  // No fragmento (#t=): o browser não o envia ao servidor (não fica nos logs
  // do Render nem da Cloudflare) nem à analítica (page_location sem fragmento).
  return `${CHECKOUT_EMAIL_ORIGIN}/${emailLang(locale)}/booking/balance/${encodeURIComponent(intentId)}#t=${token}`;
}
