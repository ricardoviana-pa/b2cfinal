/**
 * Origem da visita de cada intent, na tabela booking_intent_origins.
 *
 * Tudo falha em silêncio (null / false): a origem nunca trava um intent, um
 * pagamento nem os emails. Sem base de dados (previews) não se guarda nada.
 * Cada registo sai 31 dias depois da última atualização (os toques valem 30,
 * e um intent pago já passou a origem para a nota e o email logo no
 * pagamento), numa limpeza periódica.
 */
import { eq, sql } from "drizzle-orm";
import { bookingIntentOrigins } from "../../drizzle/schema";
import { getDb } from "../db";
import { parseStoredVisitOrigin, type ServerVisitOrigin } from "./visit-origin";

export async function saveIntentOrigin(intentId: string, origin: ServerVisitOrigin): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db
      .insert(bookingIntentOrigins)
      .values({ intentId, origin })
      .onDuplicateKeyUpdate({ set: { origin } });
    return true;
  } catch (error: any) {
    console.warn(`[VisitOrigin] gravar falhou (intent ${intentId}):`, error?.message);
    return false;
  }
}

export async function getIntentOrigin(intentId: string): Promise<ServerVisitOrigin | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select({ origin: bookingIntentOrigins.origin })
      .from(bookingIntentOrigins)
      .where(eq(bookingIntentOrigins.intentId, intentId))
      .limit(1);
    return rows[0] ? parseStoredVisitOrigin(rows[0].origin) : null;
  } catch (error: any) {
    console.warn(`[VisitOrigin] ler falhou (intent ${intentId}):`, error?.message);
    return null;
  }
}

/** Dias de vida de um registo depois da última atualização. */
export const INTENT_ORIGIN_RETENTION_DAYS = 31;
const PURGE_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_PURGE_MS = 60 * 1000;

/** Apaga os registos com mais de 31 dias. Nunca lança. */
export async function purgeExpiredIntentOrigins(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db
      .delete(bookingIntentOrigins)
      .where(sql`${bookingIntentOrigins.updatedAt} < NOW() - INTERVAL ${sql.raw(String(INTENT_ORIGIN_RETENTION_DAYS))} DAY`);
    return true;
  } catch (error: any) {
    console.warn("[VisitOrigin] limpeza falhou:", error?.message);
    return false;
  }
}

let purgeStarted = false;

/**
 * Limpeza periódica, arrancada uma vez no boot: 1 minuto depois do arranque e
 * a cada 6 horas. Um processo que fique semanas no ar continua a apagar a
 * tempo (antes só se apagava no arranque).
 */
export function startIntentOriginPurge(): void {
  if (purgeStarted) return;
  purgeStarted = true;
  setTimeout(() => void purgeExpiredIntentOrigins(), FIRST_PURGE_MS).unref?.();
  setInterval(() => void purgeExpiredIntentOrigins(), PURGE_EVERY_MS).unref?.();
}
