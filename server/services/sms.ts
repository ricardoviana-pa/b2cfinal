/**
 * SMS transacional do pagamento em duas partes (S1 na falha, S2 na véspera
 * do prazo). Spec docs/pagamento_duas_partes.md 3.1 (controlo 14) e 5.6.
 *
 * Porquê SMS: o aviso de falha é o que conta os 7 dias da regra Visa, e o
 * email sozinho cai em spam ou numa caixa que ninguém lê; o SMS é a segunda
 * via, nunca a única (o email continua a sair).
 *
 * Fornecedor: Twilio por REST, com fetch e sem SDK (uma chamada só, nada
 * a mais no bundle). Liga-se com CHECKOUT_SMS_PROVIDER=twilio e as três
 * variáveis TWILIO_*; TWILIO_FROM pode ser um número (+351…) ou o SID de
 * um Messaging Service (MG…).
 *
 * Regras:
 * - nunca lança: um SMS que falha não pode partir o sweep que o pediu;
 * - devolve true só quando a Twilio aceitou a mensagem (resposta 2xx com sid);
 * - sem configuração, num preview ou com um número ambíguo: false e log,
 *   nunca um envio "à sorte" (um número sem indicativo podia ser de outra
 *   pessoa noutro país);
 * - nunca regista o número completo nem o texto (o texto leva o link).
 */
import { isPreviewDeployment } from "../lib/preview-isolation";
import { CHECKOUT_EMAIL_ORIGIN } from "../lib/checkout-email";
import { sanitizePropertyName } from "@shared/displayName";
import {
  emailLang,
  formatLisbonDay,
  formatLisbonTime,
  lisbonDaysUntil,
  PAYPLAN_SMS_I18N,
} from "./email-i18n";

/** Limite da Twilio para o corpo de uma mensagem. Acima disto, não se corta: um link cortado não abre. */
const TWILIO_MAX_BODY = 1600;
const SMS_TIMEOUT_MS = 10_000;

export function smsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.CHECKOUT_SMS_PROVIDER === "twilio" &&
    !!env.TWILIO_ACCOUNT_SID &&
    !!env.TWILIO_AUTH_TOKEN &&
    !!env.TWILIO_FROM
  );
}

/**
 * Número em E.164 (+indicativo e número) ou null. Aceita espaços, pontos,
 * traços, parênteses e o prefixo internacional 00; não adivinha indicativos.
 */
export function normalizeSmsNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let n = String(raw).trim().replace(/[\s.\-()\u00a0]/g, "");
  if (n.startsWith("00")) n = `+${n.slice(2)}`;
  return /^\+[1-9]\d{6,14}$/.test(n) ? n : null;
}

/** Só os 3 últimos algarismos, para os logs. */
function maskNumber(n: string): string {
  return `…${n.slice(-3)}`;
}

export async function sendSms(to: string, body: string): Promise<boolean> {
  try {
    if (!smsConfigured()) {
      console.warn("[SMS] não configurado (CHECKOUT_SMS_PROVIDER=twilio + TWILIO_*): SMS não enviado");
      return false;
    }
    if (isPreviewDeployment()) {
      console.warn("[SMS] preview/DEV: SMS não enviado");
      return false;
    }
    const number = normalizeSmsNumber(to);
    if (!number) {
      console.warn("[SMS] número inválido ou sem indicativo internacional: SMS não enviado");
      return false;
    }
    const text = String(body ?? "").trim();
    if (!text || text.length > TWILIO_MAX_BODY) {
      console.warn(`[SMS] texto vazio ou com mais de ${TWILIO_MAX_BODY} caracteres: SMS não enviado`);
      return false;
    }

    const sid = process.env.TWILIO_ACCOUNT_SID!;
    const token = process.env.TWILIO_AUTH_TOKEN!;
    const from = process.env.TWILIO_FROM!.trim();
    const form = new URLSearchParams({ To: number, Body: text });
    if (/^MG[0-9a-f]{32}$/i.test(from)) form.set("MessagingServiceSid", from);
    else form.set("From", from);

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
    });
    const json: any = await res.json().catch(() => null);
    if (!res.ok || !json?.sid) {
      console.error(`[SMS] Twilio recusou (HTTP ${res.status}, código ${json?.code ?? "?"}) para ${maskNumber(number)}`);
      return false;
    }
    console.info(`[SMS] aceite pela Twilio (${json.sid}) para ${maskNumber(number)}`);
    return true;
  } catch (err: any) {
    // Timeout ou rede: a Twilio pode ter aceitado na mesma; o chamador trata
    // como não enviado (um SMS repetido é melhor do que um aviso em falta).
    console.error(`[SMS] falhou: ${err?.name === "TimeoutError" ? "timeout" : err?.message}`);
    return false;
  }
}

/* ────────────────────────────────────────────────────────────────
   S1 e S2 do pagamento em duas partes (texto em PAYPLAN_SMS_I18N).
   O prazo é o mesmo instante H do email E3/E3b, formatado no fuso de
   Lisboa; o S2 diz "amanhã" e por isso só sai na véspera de H.
   ──────────────────────────────────────────────────────────────── */

export interface BalanceSmsInput {
  phone: string | null | undefined;
  locale?: string | null;
  /** Nome da casa (opcional: sem ele, "a 2.ª parte da sua estadia"). */
  propertyName?: string | null;
  /** H: fim do prazo para pagar. */
  hardStopAt: Date;
  /** Link da página da 2.ª parte (balanceLinkUrl). */
  link: string;
  /** O "agora" que decide se o S2 ainda é verdade (testes). */
  now?: Date;
}

/**
 * Texto do S1 ("failed") ou do S2 ("lastCall") na língua do hóspede, ou
 * null quando não há texto verdadeiro: prazo inválido ou já passado, S2
 * fora da véspera de H, ou link fora da origem de produção (um link de
 * DEV nunca chega ao telemóvel de um hóspede).
 */
export function balanceSmsText(kind: "failed" | "lastCall", d: Omit<BalanceSmsInput, "phone">): string | null {
  const link = String(d.link ?? "").trim();
  const at = d.hardStopAt instanceof Date ? d.hardStopAt : new Date(d.hardStopAt as any);
  const now = d.now ?? new Date();
  if (!link.startsWith(`${CHECKOUT_EMAIL_ORIGIN}/`) || !Number.isFinite(at.getTime()) || at.getTime() <= now.getTime()) return null;
  if (kind === "lastCall" && lisbonDaysUntil(at, now) !== 1) return null;
  const lang = emailLang(d.locale);
  const S = PAYPLAN_SMS_I18N[lang];
  // Texto simples: a casa vai sem escapes HTML, mas sem quebras de linha.
  const house = sanitizePropertyName(String(d.propertyName ?? "")).replace(/[\r\n]+/g, " ").trim() || null;
  const time = formatLisbonTime(at, lang);
  return kind === "lastCall"
    ? S.lastCall(house, time, link)
    : S.failed(house, S.deadline(formatLisbonDay(at, lang, false), time), link);
}

async function sendBalanceSmsKind(kind: "failed" | "lastCall", d: BalanceSmsInput): Promise<boolean> {
  try {
    const text = balanceSmsText(kind, d);
    if (!text) {
      console.warn(`[SMS ${kind}] sem texto verdadeiro para enviar (prazo, véspera ou link): não enviado`);
      return false;
    }
    if (!d.phone) {
      console.warn(`[SMS ${kind}] sem telefone: não enviado`);
      return false;
    }
    return await sendSms(d.phone, text);
  } catch (err: any) {
    console.error(`[SMS ${kind}] falhou: ${err?.message}`);
    return false;
  }
}

/** S1: no dia da falha, com o E3. */
export function sendBalanceFailedSms(d: BalanceSmsInput): Promise<boolean> {
  return sendBalanceSmsKind("failed", d);
}

/** S2: na véspera de H, com o E3b. */
export function sendBalanceLastCallSms(d: BalanceSmsInput): Promise<boolean> {
  return sendBalanceSmsKind("lastCall", d);
}
