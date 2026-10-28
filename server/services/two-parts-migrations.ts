/**
 * Pagamento em duas partes, Fase 1: migrações de arranque
 * (docs/pagamento_duas_partes.md, 5.2). Corre em server/_core/index.ts,
 * dentro do bloco idempotente das booking_intents, em todos os arranques.
 *
 * O SQL daqui tem de declarar exatamente o que drizzle/schema.ts declara
 * (nomes, tipos, NULL/NOT NULL, defaults e índices): o drizzle não cria nem
 * altera tabelas neste projeto, só lê o que este ficheiro deixou na BD. O
 * teste two-parts-migrations.test.ts compara os dois coluna a coluna.
 *
 * Sem dependências de propósito: recebe o executor (no arranque,
 * `(q) => db.execute(q)`) para poder ser testado com um MySQL falso.
 */

export type Execute = (sql: string) => Promise<unknown>;

export interface TwoPartsMigrationReport {
  added: string[];
  existing: string[];
  failed: Array<{ step: string; error: string }>;
}

/** Faltam colunas que o select de getBookingIntent pede: o arranque tem de
 *  parar antes do listen (server/_core/index.ts faz process.exit(1)). */
export class TwoPartsSchemaError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TwoPartsSchemaError";
  }
}

/** Colunas novas de booking_intents. Todas nullable ou com DEFAULT: os
 *  intents anteriores à Fase 1 ficam 'full' e sem dados novos, e o código
 *  antigo (que lista as colunas no select) continua a funcionar durante o
 *  deploy enquanto a instância nova acrescenta as colunas. */
const INTENT_COLUMNS: ReadonlyArray<readonly [column: string, definition: string]> = [
  ["payment_plan", "enum('full','two_parts') NOT NULL DEFAULT 'full'"],
  ["stripe_customer_id", "varchar(64) NULL"],
  ["flex_gift_reason", "varchar(32) NULL"],
  ["flex_gift_prev_flex", "boolean NULL"],
  ["flex_immediate_consent_at", "timestamp NULL"],
  ["flex_consent_version", "varchar(40) NULL"],
];

/** Colunas acrescentadas a checkout_scheduled_payments depois da Fase 1
 *  (Fase 2, ronda 2). Também estão no CREATE TABLE (instalações novas: aí o
 *  ALTER dá "duplicate column" e conta como existente); numa tabela já criada
 *  o ALTER acrescenta-as. Todas nullable: o código anterior lê a linha sem
 *  elas durante o deploy. */
const SCHEDULED_COLUMNS: ReadonlyArray<readonly [column: string, definition: string]> = [
  // Escudo "o hóspede está a pagar" (60 min), só escrito por ações do hóspede.
  ["guest_active_at", "datetime NULL"],
  // Estado de onde veio o claim da cobrança: a libertação das presas volta a ele.
  ["claim_prev_status", "varchar(16) NULL"],
];

const TABLES: ReadonlyArray<readonly [table: string, ddl: string]> = [
  [
    "checkout_scheduled_payments",
    `
      CREATE TABLE IF NOT EXISTS \`checkout_scheduled_payments\` (
        \`id\` varchar(36) NOT NULL,
        \`intent_id\` varchar(36) NOT NULL,
        \`livemode\` boolean NOT NULL,
        \`site_origin\` varchar(64) NOT NULL,
        \`reservation_id\` varchar(64) NOT NULL,
        \`confirmation_code\` varchar(64) NULL,
        \`listing_id\` varchar(64) NOT NULL,
        \`property_name\` varchar(255) NULL,
        \`check_in\` varchar(10) NOT NULL,
        \`check_out\` varchar(10) NOT NULL,
        \`email\` varchar(320) NULL,
        \`phone\` varchar(50) NULL,
        \`locale\` varchar(5) NULL,
        \`currency\` char(3) NOT NULL DEFAULT 'EUR',
        \`deposit_payment_intent_id\` varchar(64) NOT NULL,
        \`deposit_cents\` int NOT NULL,
        \`deposit_stay_cents\` int NOT NULL,
        \`balance_cents\` int NOT NULL,
        \`deposit_fiscal_lines\` json NULL,
        \`stripe_customer_id\` varchar(64) NOT NULL,
        \`payment_method_id\` varchar(64) NOT NULL,
        \`card_brand\` varchar(32) NULL,
        \`card_last4\` varchar(4) NULL,
        \`card_exp_month\` tinyint NULL,
        \`card_exp_year\` smallint NULL,
        \`policy_code\` varchar(20) NOT NULL,
        \`free_cancel_deadline\` datetime NOT NULL,
        \`charge_at\` datetime NOT NULL,
        \`hard_stop_at\` datetime NOT NULL,
        \`next_attempt_at\` datetime NOT NULL,
        \`claim_prev_status\` varchar(16) NULL,
        \`status\` enum('scheduled','charging','retry','needs_action','succeeded','paid_externally','needs_review','cancelling','cancelled_unpaid','cancelled_by_guest') NOT NULL DEFAULT 'scheduled',
        \`attempts\` tinyint NOT NULL DEFAULT 0,
        \`claimed_at\` datetime NULL,
        \`claim_source\` enum('sweep','guest','webhook','admin') NULL,
        \`guest_active_at\` datetime NULL,
        \`last_decline_code\` varchar(64) NULL,
        \`last_error\` varchar(500) NULL,
        \`balance_payment_intent_id\` varchar(64) NULL,
        \`guest_payment_intent_id\` varchar(64) NULL,
        \`succeeded_at\` datetime NULL,
        \`paid_externally_ref\` varchar(120) NULL,
        \`failure_notice_sent_at\` datetime NULL,
        \`failure_notice_stage\` tinyint NOT NULL DEFAULT 0,
        \`reminder_stage\` tinyint NOT NULL DEFAULT 0,
        \`sms_stage\` tinyint NOT NULL DEFAULT 0,
        \`help_paused_until\` datetime NULL,
        \`review_reason\` varchar(120) NULL,
        \`review_due_at\` datetime NULL,
        \`guesty_deposit_recorded_at\` datetime NULL,
        \`guesty_balance_claimed_at\` datetime NULL,
        \`guesty_balance_recorded_at\` datetime NULL,
        \`note_claimed_at\` datetime NULL,
        \`email_paid_claimed_at\` datetime NULL,
        \`invoice_claimed_at\` datetime NULL,
        \`cancel_pis_claimed_at\` datetime NULL,
        \`guesty_cancel_claimed_at\` datetime NULL,
        \`refund_claimed_at\` datetime NULL,
        \`credit_note_claimed_at\` datetime NULL,
        \`email_cancel_claimed_at\` datetime NULL,
        \`guesty_status\` varchar(32) NULL,
        \`guesty_check_in\` varchar(10) NULL,
        \`guesty_check_out\` varchar(10) NULL,
        \`guesty_listing_id\` varchar(64) NULL,
        \`guesty_total_cents\` int NULL,
        \`guesty_total_paid_cents\` int NULL,
        \`guesty_pending_foreign_cents\` int NULL,
        \`last_reconciled_at\` datetime NULL,
        \`last_reconcile_error\` varchar(500) NULL,
        \`invoice_services_ref\` varchar(64) NULL,
        \`invoice_stay_ref\` varchar(64) NULL,
        \`invoice_balance_ref\` varchar(64) NULL,
        \`credit_note_ref\` varchar(64) NULL,
        \`credit_note_due\` boolean NOT NULL DEFAULT false,
        \`guesty_cancelled_at\` datetime NULL,
        \`refund_id\` varchar(64) NULL,
        \`refund_cents\` int NULL,
        \`refund_status\` varchar(32) NULL,
        \`cancelled_at\` datetime NULL,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        UNIQUE INDEX \`uq_checkout_scheduled_payments_intent\` (\`intent_id\`),
        INDEX \`idx_checkout_scheduled_payments_due\` (\`livemode\`, \`status\`, \`next_attempt_at\`),
        INDEX \`idx_checkout_scheduled_payments_hard_stop\` (\`livemode\`, \`status\`, \`hard_stop_at\`),
        INDEX \`idx_checkout_scheduled_payments_charge\` (\`livemode\`, \`status\`, \`charge_at\`),
        INDEX \`idx_checkout_scheduled_payments_reservation\` (\`reservation_id\`)
      )
    `,
  ],
  [
    "checkout_card_mandates",
    `
      CREATE TABLE IF NOT EXISTS \`checkout_card_mandates\` (
        \`id\` varchar(36) NOT NULL,
        \`intent_id\` varchar(36) NOT NULL,
        \`payment_intent_id\` varchar(64) NULL,
        \`setup_intent_id\` varchar(64) NULL,
        \`scheduled_payment_id\` varchar(36) NULL,
        \`payment_method_id\` varchar(64) NULL,
        \`card_last4\` varchar(4) NULL,
        \`mandate_version\` varchar(40) NOT NULL,
        \`mandate_lang\` varchar(5) NOT NULL,
        \`mandate_text_hash\` char(64) NOT NULL,
        \`amount_later_cents\` int NOT NULL,
        \`charge_at\` datetime NOT NULL,
        \`accepted_at\` datetime NOT NULL,
        \`accepted_ip\` varchar(64) NULL,
        \`source\` enum('checkout','card_change') NOT NULL,
        \`superseded_at\` datetime NULL,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        UNIQUE INDEX \`uq_checkout_card_mandates_pi\` (\`payment_intent_id\`),
        INDEX \`idx_checkout_card_mandates_intent\` (\`intent_id\`),
        INDEX \`idx_checkout_card_mandates_schedule\` (\`scheduled_payment_id\`)
      )
    `,
  ],
  [
    "stripe_webhook_events",
    `
      CREATE TABLE IF NOT EXISTS \`stripe_webhook_events\` (
        \`event_id\` varchar(64) NOT NULL,
        \`type\` varchar(64) NOT NULL,
        \`livemode\` boolean NOT NULL,
        \`received_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`processed_at\` datetime NULL,
        \`last_error\` varchar(500) NULL,
        PRIMARY KEY(\`event_id\`)
      )
    `,
  ],
  [
    // Fase 2c: histórico das ações do CS no ecrã Saldos (quem fez o quê a
    // que linha). Tabela à parte, só com acrescentos: nunca se atualiza a
    // linha de saldo para registar uma ação.
    "checkout_admin_actions",
    `
      CREATE TABLE IF NOT EXISTS \`checkout_admin_actions\` (
        \`id\` varchar(36) NOT NULL,
        \`scheduled_payment_id\` varchar(36) NOT NULL,
        \`user_id\` int NULL,
        \`user_email\` varchar(320) NULL,
        \`action\` varchar(40) NOT NULL,
        \`details\` json NULL,
        \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(\`id\`),
        INDEX \`idx_checkout_admin_actions_schedule\` (\`scheduled_payment_id\`)
      )
    `,
  ],
];

/** Texto do erro do driver. O drizzle embrulha o erro do MySQL num
 *  "Failed query: <SQL>" com o original em .cause: para o registo interessa
 *  o do MySQL, não o SQL de volta. */
function errorText(err: any): string {
  const text = err?.cause?.message || err?.message || String(err);
  return String(text).slice(0, 300);
}

function errorCodes(err: any): unknown[] {
  return [err?.code, err?.errno, err?.cause?.code, err?.cause?.errno];
}

/** ALTER ADD COLUMN repetido: ER_DUP_FIELDNAME (1060). Mesmo teste das
 *  outras colunas de booking_intents em index.ts, mais o código do driver. */
function isDuplicateColumnError(err: any): boolean {
  const codes = errorCodes(err);
  if (codes.includes("ER_DUP_FIELDNAME") || codes.includes(1060)) return true;
  return /duplicate column|exists/i.test(`${err?.message || ""} ${err?.cause?.message || ""}`);
}

/** ER_BAD_FIELD_ERROR (1054): "Unknown column 'x' in 'field list'". */
function isUnknownColumnError(err: any): boolean {
  const codes = errorCodes(err);
  if (codes.includes("ER_BAD_FIELD_ERROR") || codes.includes(1054)) return true;
  return /unknown column/i.test(`${err?.message || ""} ${err?.cause?.message || ""}`);
}

/** O CREATE TABLE IF NOT EXISTS sobre uma tabela que já existe não falha:
 *  deixa a nota 1050 e o mysql2 conta-a em warningStatus. Serve só para o
 *  registo dizer "criada" ou "já existia"; o esquema não depende disto. */
function tableAlreadyExisted(result: unknown): boolean {
  const header: any = Array.isArray(result) ? result[0] : result;
  return Number(header?.warningStatus ?? 0) > 0;
}

/**
 * Acrescenta as colunas novas de booking_intents, cria as tabelas do
 * pagamento em duas partes (TABLES) e acrescenta as colunas novas de
 * checkout_scheduled_payments (SCHEDULED_COLUMNS). Idempotente: corre em
 * todos os arranques. Cada passo no seu try, porque uma falha num (lock,
 * permissões) não pode deixar os outros por fazer; o relatório diz o que
 * ficou e o que falhou, e quem decide se o arranque continua é
 * verifyTwoPartsColumns.
 */
export async function runTwoPartsMigrations(execute: Execute): Promise<TwoPartsMigrationReport> {
  const report: TwoPartsMigrationReport = { added: [], existing: [], failed: [] };

  for (const [column, definition] of INTENT_COLUMNS) {
    const step = `booking_intents.${column}`;
    try {
      await execute(`ALTER TABLE \`booking_intents\` ADD COLUMN \`${column}\` ${definition}`);
      report.added.push(step);
    } catch (err) {
      if (isDuplicateColumnError(err)) report.existing.push(step);
      else report.failed.push({ step, error: errorText(err) });
    }
  }

  for (const [table, ddl] of TABLES) {
    try {
      const result = await execute(ddl);
      (tableAlreadyExisted(result) ? report.existing : report.added).push(table);
    } catch (err) {
      // Aqui nenhum erro conta como "já existe": a mensagem do drizzle traz
      // o SQL, que diz IF NOT EXISTS, e o teste por /exists/ das colunas
      // deixava passar uma falha verdadeira (permissões, sintaxe).
      report.failed.push({ step: table, error: errorText(err) });
    }
  }

  // Depois das tabelas: numa instalação nova a tabela acabou de nascer com
  // estas colunas (o ALTER dá "duplicate column" e fica como existente).
  for (const [column, definition] of SCHEDULED_COLUMNS) {
    const step = `checkout_scheduled_payments.${column}`;
    try {
      await execute(`ALTER TABLE \`checkout_scheduled_payments\` ADD COLUMN \`${column}\` ${definition}`);
      report.added.push(step);
    } catch (err) {
      if (isDuplicateColumnError(err)) report.existing.push(step);
      else report.failed.push({ step, error: errorText(err) });
    }
  }

  return report;
}

/**
 * Confirma que booking_intents tem as colunas novas, com um SELECT que não
 * lê linhas. O drizzle lista todas as colunas do esquema no select de
 * getBookingIntent: se uma faltar, TODOS os checkouts partem, não só os de
 * duas partes. Só "Unknown column" lança (fail-closed, o arranque pára);
 * qualquer outro erro (BD em baixo, timeout) só fica registado, porque não
 * diz nada sobre o esquema e travar o arranque por isso deitava o site abaixo.
 */
export async function verifyTwoPartsColumns(execute: Execute): Promise<boolean> {
  const columns = INTENT_COLUMNS.map(([column]) => `\`${column}\``).join(", ");
  try {
    await execute(`SELECT ${columns} FROM \`booking_intents\` LIMIT 0`);
    return true;
  } catch (err) {
    if (isUnknownColumnError(err)) {
      throw new TwoPartsSchemaError(
        `booking_intents sem as colunas do pagamento em duas partes (${errorText(err)})`,
        { cause: err },
      );
    }
    console.warn("[Migration] two-parts: não foi possível verificar as colunas de booking_intents:", errorText(err));
    return false;
  }
}

/**
 * Rede para o arranque com a BD em baixo: o servidor abre o porto sem ter
 * corrido nem verificado as migrações e, quando a BD volta, o select de
 * getBookingIntent pede colunas que talvez não existam (todos os checkouts
 * partiam até ao próximo deploy). Repete migração e verificação até
 * confirmar o esquema. Se as colunas continuarem a faltar depois de migrar,
 * avisa (`onSchemaMissing`) em vez de matar o processo: o resto do site
 * funciona sem estas colunas, e um processo que morre a cada arranque
 * deitava-o todo abaixo. Devolve uma função para parar.
 */
export function scheduleTwoPartsSchemaRetry(
  getExecute: () => Promise<Execute | null>,
  opts: {
    intervalMs?: number;
    maxAttempts?: number;
    onSchemaMissing?: (err: TwoPartsSchemaError) => void;
    /** Esgotou as tentativas sem confirmar o esquema: alguém tem de olhar. */
    onGiveUp?: (attempts: number) => void;
  } = {},
): () => void {
  const intervalMs = opts.intervalMs ?? 60_000;
  // 12 h a um minuto: cobre uma falha longa da BD; depois disto, alerta.
  const maxAttempts = opts.maxAttempts ?? 720;
  let attempts = 0;
  let stopped = false;
  let warned = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  const tick = async () => {
    if (stopped) return;
    attempts += 1;
    try {
      const execute = await getExecute();
      if (execute) {
        const report = await runTwoPartsMigrations(execute);
        if (report.added.length || report.failed.length) {
          console.info(`[Migration] two-parts (nova tentativa ${attempts}): added=[${report.added.join(", ")}] failed=${report.failed.length}`);
        }
        if (await verifyTwoPartsColumns(execute)) {
          console.info(`[Migration] two-parts: esquema confirmado na tentativa ${attempts}`);
          return stop();
        }
      }
    } catch (err) {
      if (err instanceof TwoPartsSchemaError) {
        console.error(`[Migration] two-parts: ${err.message}`);
        if (!warned) {
          warned = true;
          opts.onSchemaMissing?.(err);
        }
      } else {
        console.warn(`[Migration] two-parts: nova tentativa ${attempts} falhou:`, errorText(err));
      }
    }
    if (attempts >= maxAttempts) {
      console.error(`[Migration] two-parts: esquema por confirmar ao fim de ${attempts} tentativas`);
      opts.onGiveUp?.(attempts);
      return stop();
    }
    timer = setTimeout(() => void tick(), intervalMs);
    (timer as any)?.unref?.();
  };
  timer = setTimeout(() => void tick(), intervalMs);
  (timer as any)?.unref?.();
  return stop;
}
