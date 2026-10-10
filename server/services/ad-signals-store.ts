/**
 * Sinais da Meta de cada intent, na tabela booking_intent_ad_signals.
 *
 * Só se grava com "Aceitar tudo" no site live (o browser só manda adSignals
 * nesse caso, client/src/lib/adSignals.ts). É a autorização que a CAPI
 * precisa: sem registo, meta-capi.ts não envia nada para o intent.
 * "Apenas essenciais" no checkout apaga o registo (checkout.setOrigin).
 *
 * Tudo falha em silêncio (null / false): nunca trava um intent, um pagamento
 * nem os emails. Sem base de dados (previews) não se guarda nada. Cada registo
 * sai 31 dias depois da última atualização, numa limpeza periódica.
 */
import { eq, sql } from "drizzle-orm";
import { bookingIntentAdSignals } from "../../drizzle/schema";
import { getDb } from "../db";

export type AdSignalsInput = { fbp?: string | null; fbc?: string | null };
export type StoredAdSignals = {
  fbp: string | null;
  fbc: string | null;
  userAgent: string | null;
  clientIp: string | null;
};

/** Formato dos cookies do pixel: fb.<subdomínio>.<ms>.<valor> */
const FB_COOKIE_RE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.-]{1,500}$/;

function cleanCookie(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length <= max && FB_COOKIE_RE.test(s) ? s : null;
}

/** IP do visitante atrás do Cloudflare e do proxy do Render. */
export function requestClientIp(headers: Record<string, unknown>): string | null {
  const pick = (h: unknown) => (Array.isArray(h) ? h[0] : h);
  const cf = pick(headers["cf-connecting-ip"]);
  const xff = pick(headers["x-forwarded-for"]);
  const raw = (typeof cf === "string" && cf) || (typeof xff === "string" && xff.split(",")[0]) || "";
  const ip = raw.trim();
  return /^[0-9a-fA-F:.]{3,64}$/.test(ip) ? ip : null;
}

export function requestUserAgent(headers: Record<string, unknown>): string | null {
  const ua = headers["user-agent"];
  return typeof ua === "string" && ua.trim() ? ua.trim().slice(0, 512) : null;
}

export async function saveAdSignals(
  intentId: string,
  input: AdSignalsInput,
  headers: Record<string, unknown>,
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    const row = {
      fbp: cleanCookie(input.fbp, 255),
      fbc: cleanCookie(input.fbc, 512),
      userAgent: requestUserAgent(headers),
      clientIp: requestClientIp(headers),
    };
    await db
      .insert(bookingIntentAdSignals)
      .values({ intentId, ...row })
      .onDuplicateKeyUpdate({
        // Um cookie que falte nesta chamada não apaga o que já se tinha
        set: {
          ...(row.fbp ? { fbp: row.fbp } : {}),
          ...(row.fbc ? { fbc: row.fbc } : {}),
          userAgent: row.userAgent,
          clientIp: row.clientIp,
        },
      });
    return true;
  } catch (error: any) {
    console.warn(`[AdSignals] gravar falhou (intent ${intentId}):`, error?.message);
    return false;
  }
}

export async function getAdSignals(intentId: string): Promise<StoredAdSignals | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select({
        fbp: bookingIntentAdSignals.fbp,
        fbc: bookingIntentAdSignals.fbc,
        userAgent: bookingIntentAdSignals.userAgent,
        clientIp: bookingIntentAdSignals.clientIp,
      })
      .from(bookingIntentAdSignals)
      .where(eq(bookingIntentAdSignals.intentId, intentId))
      .limit(1);
    return rows[0] ?? null;
  } catch (error: any) {
    console.warn(`[AdSignals] ler falhou (intent ${intentId}):`, error?.message);
    return null;
  }
}

export async function deleteAdSignals(intentId: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db.delete(bookingIntentAdSignals).where(eq(bookingIntentAdSignals.intentId, intentId));
    return true;
  } catch (error: any) {
    console.warn(`[AdSignals] apagar falhou (intent ${intentId}):`, error?.message);
    return false;
  }
}

export const AD_SIGNALS_RETENTION_DAYS = 31;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_PURGE_MS = 60 * 1000;

export async function purgeExpiredAdSignals(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db
      .delete(bookingIntentAdSignals)
      .where(sql`${bookingIntentAdSignals.updatedAt} < NOW() - INTERVAL ${sql.raw(String(AD_SIGNALS_RETENTION_DAYS))} DAY`);
    return true;
  } catch (error: any) {
    console.warn("[AdSignals] limpeza falhou:", error?.message);
    return false;
  }
}

let purgeStarted = false;
export function startAdSignalsPurge(): void {
  if (purgeStarted) return;
  purgeStarted = true;
  setTimeout(() => void purgeExpiredAdSignals(), FIRST_PURGE_MS).unref?.();
  setInterval(() => void purgeExpiredAdSignals(), PURGE_EVERY_MS).unref?.();
}
