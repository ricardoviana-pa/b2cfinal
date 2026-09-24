/**
 * Relatório do funil de recuperação: quantas reservas os emails geram de facto.
 *
 * Compara a taxa de reserva de dois grupos de checkouts abandonados com email:
 *   - tratamento: recebem a sequência de 4 contactos
 *   - controlo (10%, isRecoveryHoldout): não recebem nenhum email
 * A diferença entre as duas taxas é o efeito real do funil.
 *
 * Corre onde houver DATABASE_URL de produção (Render → Shell):
 *   npm run report:recovery            # últimos 30 dias
 *   DAYS=90 npm run report:recovery
 */
import { and, gt, isNotNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { bookingIntents } from "../drizzle/schema";
import { isRecoveryHoldout } from "../server/services/recovery-funnel";

const DAYS = Number(process.env.DAYS || 30);

async function main() {
  const db = await getDb();
  if (!db) throw new Error("Sem base de dados (DATABASE_URL em falta ou ambiente de preview)");
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const rows = await db
    .select({
      id: bookingIntents.id,
      status: bookingIntents.status,
      stage: bookingIntents.recoveryStage,
      flexGiftUntil: bookingIntents.flexGiftUntil,
      flex: bookingIntents.flex,
      createdAt: bookingIntents.createdAt,
    })
    .from(bookingIntents)
    .where(and(isNotNull(bookingIntents.email), gt(bookingIntents.createdAt, since)));

  // Só checkouts que chegaram a ser abandonados o tempo suficiente para o 1.º contacto
  const eligible = rows.filter((r) => Date.now() - r.createdAt.getTime() > 3_600_000);
  const group = (holdout: boolean) => eligible.filter((r) => isRecoveryHoldout(r.id) === holdout);
  const rate = (xs: typeof eligible) => (xs.length ? xs.filter((r) => r.status === "paid").length / xs.length : 0);
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

  const treat = group(false);
  const ctrl = group(true);
  console.log(`\nFunil de recuperação · últimos ${DAYS} dias · ${eligible.length} checkouts com email\n`);
  console.log(`Tratamento (emails): ${treat.length} checkouts · ${treat.filter((r) => r.status === "paid").length} reservas · ${pct(rate(treat))}`);
  console.log(`Controlo (sem emails): ${ctrl.length} checkouts · ${ctrl.filter((r) => r.status === "paid").length} reservas · ${pct(rate(ctrl))}`);
  console.log(`Efeito estimado: ${((rate(treat) - rate(ctrl)) * 100).toFixed(1)} pontos percentuais`);
  if (ctrl.length < 50) console.log("Atenção: grupo de controlo ainda pequeno, o efeito não é fiável.");

  console.log("\nReservas por último contacto recebido (tratamento):");
  for (const st of [0, 1, 2, 3, 4]) {
    const xs = treat.filter((r) => (r.stage ?? 0) === st);
    console.log(`  contacto ${st}: ${xs.length} checkouts · ${xs.filter((r) => r.status === "paid").length} reservas`);
  }
  const gifted = treat.filter((r) => r.flexGiftUntil);
  console.log(`\nFlex oferecido: ${gifted.length} ofertas · ${gifted.filter((r) => r.status === "paid").length} reservas com a oferta`);
  process.exit(0);
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
