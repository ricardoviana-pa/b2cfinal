/**
 * Índices de leitura criados no arranque (idempotentes).
 *
 * A BD de produção é TiDB Cloud Serverless, cobrada por unidades de pedido
 * (RU): uma consulta sem índice lê a tabela inteira e paga cada linha. A 28 out
 * 2026 a quota mensal esgotou-se e a BD passou a recusar tudo. As maiores
 * fatias vinham de crons de 10 em 10 minutos que liam `booking_intents` e
 * `leads` inteiras (recuperação, settle, consentimento). Estes índices tornam
 * essas consultas em leituras de intervalo ou pontuais, sem mudar resultados.
 *
 * MySQL não tem CREATE INDEX IF NOT EXISTS: um "Duplicate key name" (1061)
 * quer dizer que já existe. Cada índice é independente: uma falha (BD em
 * baixo, tabela que ainda não existe) só fica no relatório e o arranque segue.
 */

export type Execute = (sql: string) => Promise<unknown>;

/** [tabela, nome do índice, colunas]. Só leitura: nenhum é UNIQUE. */
export const READ_INDEXES: ReadonlyArray<readonly [table: string, name: string, columns: readonly string[]]> = [
  // Irmãos da mesma estadia (listIntentsForRecoveryStay): o email está dentro
  // de lower(trim()), por isso o índice de email não serve.
  ["booking_intents", "idx_booking_intents_stay", ["listingId", "checkIn", "checkOut"]],
  // Filas da recuperação (createdAt nas duas) e o sweep de settle (updatedAt).
  ["booking_intents", "idx_booking_intents_created", ["createdAt"]],
  ["booking_intents", "idx_booking_intents_updated", ["updatedAt"]],
  // Consentimento de newsletter (hasNewsletterConsent e o EXISTS da fila 3/4).
  ["leads", "idx_leads_email_source", ["email", "source"]],
  // Limpeza das métricas com mais de 90 dias, no arranque.
  ["web_vitals", "idx_web_vitals_created", ["createdAt"]],
  // Webhook do Guesty: estado da viagem por reserva.
  ["customer_trips", "idx_customer_trips_reservation", ["guestyReservationId"]],
];

function errorText(err: unknown): string {
  const e = err as { message?: string; cause?: { message?: string } } | null;
  return `${e?.message ?? String(err)} ${e?.cause?.message ?? ""}`.trim();
}

function isDuplicateIndex(err: unknown): boolean {
  const e = err as { errno?: number; cause?: { errno?: number } } | null;
  return e?.errno === 1061 || e?.cause?.errno === 1061 || /duplicate key name|already exist/i.test(errorText(err));
}

export async function ensureReadIndexes(execute: Execute): Promise<{ added: string[]; existing: string[]; failed: Array<{ index: string; error: string }> }> {
  const report = { added: [] as string[], existing: [] as string[], failed: [] as Array<{ index: string; error: string }> };
  for (const [table, name, columns] of READ_INDEXES) {
    const cols = columns.map((c) => `\`${c}\``).join(", ");
    try {
      await execute(`CREATE INDEX \`${name}\` ON \`${table}\` (${cols})`);
      report.added.push(name);
    } catch (err) {
      if (isDuplicateIndex(err)) report.existing.push(name);
      else report.failed.push({ index: name, error: errorText(err).slice(0, 300) });
    }
  }
  return report;
}
