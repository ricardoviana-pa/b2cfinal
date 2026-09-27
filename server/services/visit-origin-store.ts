/**
 * Origem da visita de cada intent, na tabela booking_intent_origins.
 *
 * Tudo falha em silêncio (null / false): a origem nunca trava um intent, um
 * pagamento nem os emails. Sem base de dados (previews) não se guarda nada.
 */
import { eq } from "drizzle-orm";
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
