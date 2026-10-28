/**
 * Pagamento em duas partes, Fase 1: esquema, migrações de arranque e helpers
 * de BD (docs/pagamento_duas_partes.md, 5.2; critério da Fase 1 "migração
 * idempotente em dois boots consecutivos").
 *
 * As migrações correm contra um MySQL falso em memória que interpreta o DDL
 * (e recusa o que não percebe), para provar três coisas: o SQL declara
 * exatamente o que drizzle/schema.ts declara, um segundo arranque não falha
 * nem acrescenta nada, e o arranque só pára quando faltam colunas.
 *
 * Os helpers de server/db.ts correm com o drizzle verdadeiro sobre um
 * cliente mysql2 falso: o SQL e os erros embrulhados ("Failed query" com o
 * erro do driver em .cause) são os de produção.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { is, SQL } from "drizzle-orm";
import { getTableColumns } from "drizzle-orm";
import { getTableConfig, MySqlDialect, type AnyMySqlColumn, type MySqlTable } from "drizzle-orm/mysql-core";
import {
  bookingIntents,
  checkoutAdminActions,
  checkoutCardMandates,
  checkoutScheduledPayments,
  stripeWebhookEvents,
} from "../../drizzle/schema";
import { runTwoPartsMigrations, scheduleTwoPartsSchemaRetry, TwoPartsSchemaError, verifyTwoPartsColumns } from "./two-parts-migrations";

const fake = vi.hoisted(() => ({ query: vi.fn(), preview: vi.fn(() => false) }));
vi.mock("../lib/preview-isolation", () => ({ isPreviewDeployment: fake.preview }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: () => actual.drizzle({ client: { query: fake.query } as any }) };
});

/* ════════════════════════════════════════════════════════════════
   MySQL falso
   ════════════════════════════════════════════════════════════════ */

interface FakeColumn { type: string; notNull: boolean; default: string | null; onUpdate: string | null }
interface FakeIndex { unique: boolean; columns: string[] }
interface FakeTable { columns: Map<string, FakeColumn>; primaryKey: string[]; indexes: Map<string, FakeIndex> }

/** Colunas de booking_intents em produção antes da Fase 1 (o CREATE e os
 *  ALTER anteriores em server/_core/index.ts). */
const LEGACY_INTENT_COLUMNS = [
  "id", "listingId", "propertyName", "propertySlug", "destination", "guestyQuoteId", "checkIn",
  "checkOut", "guests", "ratePlanId", "ratePlanType", "email", "guestFirstName", "guestLastName",
  "guestPhone", "nif", "quote", "extras", "reception", "flex", "recovery_stage", "status", "locale",
  "reservationId", "confirmationCode", "createdAt", "updatedAt", "expiresAt", "recovery_optout",
  "payment_intent_id", "flex_gift_until", "concierge_alerted",
];

const NEW_INTENT_COLUMNS = [
  "payment_plan", "stripe_customer_id", "flex_gift_reason", "flex_gift_prev_flex",
  "flex_immediate_consent_at", "flex_consent_version",
];
const NEW_TABLES = ["checkout_scheduled_payments", "checkout_card_mandates", "stripe_webhook_events", "checkout_admin_actions"];
/** Colunas acrescentadas a checkout_scheduled_payments depois da Fase 1. */
const NEW_SCHEDULED_COLUMNS = ["guest_active_at", "claim_prev_status"];
const SCHEDULED_STEPS = NEW_SCHEDULED_COLUMNS.map((c) => `checkout_scheduled_payments.${c}`);

/** Erro como o drizzle o entrega: "Failed query" com o erro do MySQL em .cause. */
function driverError(sql: string, message: string) {
  return { message: `Failed query: ${sql.trim()}\nparams: `, cause: { message } };
}

function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = "";
  for (const ch of body) {
    if (ch === "'") quoted = !quoted;
    if (!quoted) {
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if (ch === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

const TYPE = /^(varchar\(\d+\)|char\(\d+\)|int|tinyint|smallint|boolean|datetime|timestamp|json|enum\((?:'[a-z_]+',?)+\))/i;
const ATTRIBUTE = /^\s+(NOT NULL|NULL|DEFAULT ('[^']*'|\w+)|ON UPDATE (\w+))/i;

/** Interpreta uma definição de coluna; o que não perceber é erro de sintaxe,
 *  para uma gralha no DDL falhar aqui e não no arranque de produção. */
function parseColumn(sql: string, definition: string): [string, FakeColumn] {
  const m = /^`(\w+)`\s+([\s\S]*)$/.exec(definition.trim());
  const type = m ? TYPE.exec(m[2]) : null;
  if (!m || !type) throw driverError(sql, `You have an error in your SQL syntax near '${definition}'`);
  const column: FakeColumn = { type: type[0].toLowerCase(), notNull: false, default: null, onUpdate: null };
  let rest = m[2].slice(type[0].length);
  while (rest.trim()) {
    const a = ATTRIBUTE.exec(rest);
    if (!a) throw driverError(sql, `You have an error in your SQL syntax near '${rest.trim()}'`);
    if (/^NOT NULL$/i.test(a[1])) column.notNull = true;
    else if (a[2] !== undefined) column.default = a[2];
    else if (a[3] !== undefined) column.onUpdate = a[3];
    rest = rest.slice(a[0].length);
  }
  return [m[1], column];
}

function columnList(text: string): string[] {
  return text.split(",").map((c) => c.trim().replace(/`/g, ""));
}

function fakeMysql() {
  const tables = new Map<string, FakeTable>();
  const legacy = new Map<string, FakeColumn>(
    LEGACY_INTENT_COLUMNS.map((c) => [c, { type: "legacy", notNull: false, default: null, onUpdate: null }]),
  );
  tables.set("booking_intents", { columns: legacy, primaryKey: ["id"], indexes: new Map() });

  const execute = vi.fn(async (raw: string): Promise<unknown> => {
    const sql = raw.trim();

    const create = /^CREATE TABLE IF NOT EXISTS `(\w+)` \(([\s\S]*)\)$/.exec(sql);
    if (create) {
      const [, name, body] = create;
      // Como o MySQL: IF NOT EXISTS sobre uma tabela existente é um no-op
      // com a nota 1050 (warningStatus 1).
      if (tables.has(name)) return [{ affectedRows: 0, warningStatus: 1 }, undefined];
      const table: FakeTable = { columns: new Map(), primaryKey: [], indexes: new Map() };
      for (const part of splitTopLevel(body)) {
        const pk = /^PRIMARY KEY\s*\(([^)]*)\)$/i.exec(part);
        const idx = /^(UNIQUE )?INDEX `(\w+)` \(([^)]*)\)$/i.exec(part);
        if (pk) table.primaryKey = columnList(pk[1]);
        else if (idx) table.indexes.set(idx[2], { unique: !!idx[1], columns: columnList(idx[3]) });
        else {
          const [col, def] = parseColumn(sql, part);
          if (table.columns.has(col)) throw driverError(sql, `Duplicate column name '${col}'`);
          table.columns.set(col, def);
        }
      }
      for (const col of [...table.primaryKey, ...[...table.indexes.values()].flatMap((i) => i.columns)]) {
        if (!table.columns.has(col)) throw driverError(sql, `Key column '${col}' doesn't exist in table`);
      }
      tables.set(name, table);
      return [{ affectedRows: 0, warningStatus: 0 }, undefined];
    }

    const alter = /^ALTER TABLE `(\w+)` ADD COLUMN ([\s\S]+)$/.exec(sql);
    if (alter) {
      const table = tables.get(alter[1]);
      if (!table) throw driverError(sql, `Table 'pa.${alter[1]}' doesn't exist`);
      const [col, def] = parseColumn(sql, alter[2]);
      if (table.columns.has(col)) throw driverError(sql, `Duplicate column name '${col}'`);
      table.columns.set(col, def);
      return [{ affectedRows: 0, warningStatus: 0 }, undefined];
    }

    const select = /^SELECT ([\s\S]+) FROM `(\w+)` LIMIT 0$/.exec(sql);
    if (select) {
      const table = tables.get(select[2]);
      if (!table) throw driverError(sql, `Table 'pa.${select[2]}' doesn't exist`);
      for (const col of columnList(select[1])) {
        if (!table.columns.has(col)) throw driverError(sql, `Unknown column '${col}' in 'field list'`);
      }
      return [[], []];
    }

    throw new Error(`MySQL falso: instrução não suportada: ${sql.slice(0, 80)}`);
  });

  const snapshot = () =>
    JSON.parse(JSON.stringify([...tables].map(([name, t]) => [
      name,
      { columns: Object.fromEntries(t.columns), primaryKey: t.primaryKey, indexes: Object.fromEntries(t.indexes) },
    ])));

  return { tables, execute, snapshot };
}

/* ════════════════════════════════════════════════════════════════
   O que o drizzle declara, no mesmo formato
   ════════════════════════════════════════════════════════════════ */

const dialect = new MySqlDialect();

function expectedColumn(c: AnyMySqlColumn): FakeColumn {
  let def: string | null = null;
  if (c.hasDefault && c.default !== undefined) {
    if (is(c.default, SQL)) {
      expect(dialect.sqlToQuery(c.default).sql).toBe("(now())");
      def = "CURRENT_TIMESTAMP";
    } else if (typeof c.default === "string") def = `'${c.default}'`;
    else def = String(c.default);
  }
  return {
    type: c.getSQLType().toLowerCase(),
    notNull: c.notNull,
    default: def,
    onUpdate: (c as any).hasOnUpdateNow ? "CURRENT_TIMESTAMP" : null,
  };
}

function expectedTable(table: MySqlTable) {
  const config = getTableConfig(table);
  return {
    name: config.name,
    columns: Object.fromEntries(config.columns.map((c) => [c.name, expectedColumn(c)])),
    primaryKey: config.columns.filter((c) => c.primary).map((c) => c.name),
    indexes: Object.fromEntries(config.indexes.map((i) => [
      i.config.name,
      { unique: !!i.config.unique, columns: i.config.columns.map((c: any) => c.name) },
    ])),
  };
}

let warn: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   Migrações
   ════════════════════════════════════════════════════════════════ */

describe("runTwoPartsMigrations", () => {
  it("1.º arranque: acrescenta as seis colunas a booking_intents e cria as quatro tabelas", async () => {
    const db = fakeMysql();
    const report = await runTwoPartsMigrations(db.execute);
    expect(report).toEqual({
      added: [...NEW_INTENT_COLUMNS.map((c) => `booking_intents.${c}`), ...NEW_TABLES],
      // A tabela acabou de nascer com as colunas novas: o ALTER dá "duplicate
      // column" e conta como existente, nunca como falha.
      existing: SCHEDULED_STEPS,
      failed: [],
    });
    for (const t of NEW_TABLES) expect(db.tables.has(t)).toBe(true);
  });

  it("checkout_scheduled_payments já criada sem as colunas da ronda 2: o ALTER acrescenta-as como o drizzle as declara", async () => {
    const db = fakeMysql();
    await runTwoPartsMigrations(db.execute);
    // A tabela como a Fase 1 a deixou (sem as duas colunas); depois, um arranque novo.
    const table = db.tables.get("checkout_scheduled_payments")!;
    for (const c of NEW_SCHEDULED_COLUMNS) table.columns.delete(c);
    const report = await runTwoPartsMigrations(db.execute);
    expect(report.failed).toEqual([]);
    expect(report.added).toEqual(SCHEDULED_STEPS);
    const expected = expectedTable(checkoutScheduledPayments);
    for (const c of NEW_SCHEDULED_COLUMNS) {
      expect(table.columns.get(c), c).toEqual(expected.columns[c]);
      expect(expected.columns[c].notNull, `${c} tem de ser nullable (linhas antigas)`).toBe(false);
    }
    expect(Object.fromEntries(table.columns)).toEqual(expected.columns);
  });

  it("um ALTER das colunas novas de checkout_scheduled_payments que falha fica no relatório e não trava o resto", async () => {
    const db = fakeMysql();
    await runTwoPartsMigrations(db.execute);
    db.tables.get("checkout_scheduled_payments")!.columns.delete("guest_active_at");
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("ADD COLUMN `guest_active_at`")) throw driverError(sql, "Lock wait timeout exceeded");
      return db.execute(sql);
    });
    const report = await runTwoPartsMigrations(execute);
    expect(report.failed).toEqual([{ step: "checkout_scheduled_payments.guest_active_at", error: "Lock wait timeout exceeded" }]);
    expect(report.existing).toContain("checkout_scheduled_payments.claim_prev_status");
  });

  it("o SQL das tabelas novas declara exatamente o que drizzle/schema.ts declara", async () => {
    const db = fakeMysql();
    await runTwoPartsMigrations(db.execute);
    for (const table of [checkoutScheduledPayments, checkoutCardMandates, stripeWebhookEvents, checkoutAdminActions]) {
      const expected = expectedTable(table);
      const actual = db.tables.get(expected.name)!;
      expect(actual, expected.name).toBeDefined();
      expect(Object.fromEntries(actual.columns), expected.name).toEqual(expected.columns);
      expect(actual.primaryKey, expected.name).toEqual(expected.primaryKey);
      expect(Object.fromEntries(actual.indexes), expected.name).toEqual(expected.indexes);
    }
  });

  it("checkout_admin_actions (Fase 2c): o histórico do ecrã Saldos lê-se por linha de saldo", async () => {
    const db = fakeMysql();
    await runTwoPartsMigrations(db.execute);
    const actions = db.tables.get("checkout_admin_actions")!;
    expect(actions.primaryKey).toEqual(["id"]);
    // O detalhe de uma linha lista as ações dela: sem índice era um full scan
    // a cada abertura do detalhe.
    expect(actions.indexes.get("idx_checkout_admin_actions_schedule")).toEqual({ unique: false, columns: ["scheduled_payment_id"] });
    expect(actions.columns.get("scheduled_payment_id")).toMatchObject({ type: "varchar(36)", notNull: true });
    expect(actions.columns.get("details")).toMatchObject({ type: "json", notNull: false });
    expect(actions.columns.get("user_id")).toMatchObject({ type: "int", notNull: false });
  });

  it("as colunas novas de booking_intents batem com o drizzle e nenhuma coluna do drizzle fica por criar", async () => {
    const db = fakeMysql();
    await runTwoPartsMigrations(db.execute);
    const intents = db.tables.get("booking_intents")!;
    const expected = expectedTable(bookingIntents);
    for (const col of NEW_INTENT_COLUMNS) {
      expect(intents.columns.get(col), col).toEqual(expected.columns[col]);
    }
    // O select de getBookingIntent pede todas as colunas do drizzle: uma
    // coluna declarada sem migração partia todos os checkouts.
    const missing = Object.keys(expected.columns).filter((c) => !intents.columns.has(c));
    expect(missing).toEqual([]);
    expect([...intents.columns.keys()].filter((c) => !LEGACY_INTENT_COLUMNS.includes(c))).toEqual(NEW_INTENT_COLUMNS);
  });

  it("2.º arranque seguido: não falha e não acrescenta nada", async () => {
    const db = fakeMysql();
    await runTwoPartsMigrations(db.execute);
    const before = db.snapshot();

    const second = await runTwoPartsMigrations(db.execute);
    expect(second.added).toEqual([]);
    expect(second.failed).toEqual([]);
    expect(second.existing).toEqual([...NEW_INTENT_COLUMNS.map((c) => `booking_intents.${c}`), ...NEW_TABLES, ...SCHEDULED_STEPS]);
    expect(db.snapshot()).toEqual(before);
    await expect(verifyTwoPartsColumns(db.execute)).resolves.toBe(true);
  });

  it("um passo que falha não trava os outros e fica no relatório com o erro do MySQL", async () => {
    const db = fakeMysql();
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("`flex_gift_reason`")) {
        throw driverError(sql, "Lock wait timeout exceeded; try restarting transaction");
      }
      return db.execute(sql);
    });
    const report = await runTwoPartsMigrations(execute);
    expect(report.failed).toEqual([
      { step: "booking_intents.flex_gift_reason", error: "Lock wait timeout exceeded; try restarting transaction" },
    ]);
    expect(report.added).toContain("booking_intents.flex_consent_version");
    expect(report.added).toEqual(expect.arrayContaining(NEW_TABLES));
    expect(db.tables.get("booking_intents")!.columns.has("flex_gift_reason")).toBe(false);
  });

  it("um erro num CREATE TABLE nunca passa por tabela existente (o SQL embrulhado diz IF NOT EXISTS)", async () => {
    const db = fakeMysql();
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("CREATE TABLE IF NOT EXISTS `checkout_card_mandates`")) {
        throw driverError(sql, "CREATE command denied to user 'pa'@'%' for table 'checkout_card_mandates'");
      }
      return db.execute(sql);
    });
    const report = await runTwoPartsMigrations(execute);
    expect(report.existing).not.toContain("checkout_card_mandates");
    expect(report.failed).toEqual([
      {
        step: "checkout_card_mandates",
        error: "CREATE command denied to user 'pa'@'%' for table 'checkout_card_mandates'",
      },
    ]);
  });

  it("reconhece a coluna repetida também pelo código do driver (ER_DUP_FIELDNAME)", async () => {
    const execute = vi.fn(async (sql: string) => {
      if (sql.startsWith("ALTER")) throw { message: "Failed query", cause: { code: "ER_DUP_FIELDNAME", errno: 1060, message: "" } };
      return [{ warningStatus: 1 }, undefined];
    });
    const report = await runTwoPartsMigrations(execute);
    expect(report.failed).toEqual([]);
    expect(report.added).toEqual([]);
    expect(report.existing).toHaveLength(NEW_INTENT_COLUMNS.length + NEW_TABLES.length + NEW_SCHEDULED_COLUMNS.length);
  });
});

describe("verifyTwoPartsColumns", () => {
  it("lança TwoPartsSchemaError quando falta uma coluna (Unknown column)", async () => {
    const db = fakeMysql(); // booking_intents ainda sem as colunas novas
    const err = await verifyTwoPartsColumns(db.execute).catch((e) => e);
    expect(err).toBeInstanceOf(TwoPartsSchemaError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TwoPartsSchemaError");
    expect(err.message).toMatch(/Unknown column 'payment_plan'/);
  });

  it("lança também quando só falta uma das seis (ALTER que falhou num arranque)", async () => {
    const db = fakeMysql();
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("ADD COLUMN `flex_consent_version`")) throw driverError(sql, "Lock wait timeout exceeded");
      return db.execute(sql);
    });
    await runTwoPartsMigrations(execute);
    await expect(verifyTwoPartsColumns(db.execute)).rejects.toThrow(/Unknown column 'flex_consent_version'/);
  });

  it("não lança com a BD em baixo (connect ECONNREFUSED): só regista", async () => {
    const execute = vi.fn(async (sql: string) => {
      throw { message: `Failed query: ${sql}\nparams: `, cause: { code: "ECONNREFUSED", message: "connect ECONNREFUSED 127.0.0.1:3306" } };
    });
    await expect(verifyTwoPartsColumns(execute)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("two-parts"), "connect ECONNREFUSED 127.0.0.1:3306");
  });

  it("depois da migração não lança e não lê linhas (LIMIT 0)", async () => {
    const db = fakeMysql();
    await runTwoPartsMigrations(db.execute);
    db.execute.mockClear();
    await expect(verifyTwoPartsColumns(db.execute)).resolves.toBe(true);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(db.execute.mock.calls[0][0]).toMatch(/^SELECT .* FROM `booking_intents` LIMIT 0$/);
  });
});

/* ════════════════════════════════════════════════════════════════
   Helpers de server/db.ts
   ════════════════════════════════════════════════════════════════ */

type Call = { sql: string; params: unknown[] };
const calls = (): Call[] => fake.query.mock.calls.map(([q, params]: any[]) => ({ sql: q.sql, params }));
const ok = (affectedRows = 1) => [{ affectedRows, insertId: 0 }, undefined];
const rows = (...r: unknown[][]) => [r, []];
const dup = (key: string) =>
  Object.assign(new Error(`Duplicate entry 'x' for key '${key}'`), { code: "ER_DUP_ENTRY", errno: 1062 });

/** Linha completa de checkout_scheduled_payments como o mysql2 a devolve
 *  (rowsAsArray, datetimes como texto UTC). */
function scheduledRow(values: Record<string, unknown>): unknown[] {
  return Object.keys(getTableColumns(checkoutScheduledPayments)).map((k) => (k in values ? values[k] : null));
}

function scheduledInsert() {
  return {
    id: "sp-1",
    intentId: "intent-1",
    livemode: true,
    siteOrigin: "https://www.portugalactive.com",
    reservationId: "res-1",
    listingId: "lst-1",
    checkIn: "2027-07-15",
    checkOut: "2027-07-22",
    depositPaymentIntentId: "pi_dep",
    depositCents: 126_200,
    depositStayCents: 120_000,
    balanceCents: 120_000,
    stripeCustomerId: "cus_1",
    paymentMethodId: "pm_1",
    policyCode: "moderate",
    freeCancelDeadline: new Date("2027-06-15T22:59:00Z"),
    chargeAt: new Date("2027-06-16T09:00:00Z"),
    hardStopAt: new Date("2027-06-23T09:00:00Z"),
    nextAttemptAt: new Date("2027-06-16T09:00:00Z"),
  };
}

function mandateInsert() {
  return {
    id: "m-1",
    intentId: "intent-1",
    paymentIntentId: "pi_dep",
    mandateVersion: "2026-10-27.v1",
    mandateLang: "pt",
    mandateTextHash: "a".repeat(64),
    amountLaterCents: 120_000,
    chargeAt: new Date("2027-06-16T09:00:00Z"),
    acceptedAt: new Date("2026-10-27T15:00:00Z"),
    source: "checkout" as const,
  };
}

describe("helpers de BD do pagamento em duas partes", () => {
  beforeEach(() => {
    vi.stubEnv("DATABASE_URL", "mysql://fake@localhost/pa");
    fake.query.mockReset();
    fake.preview.mockReset().mockReturnValue(false);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("setIntentStripeCustomer", () => {
    it("grava só em intents não pagos e sem outro customer", async () => {
      const { setIntentStripeCustomer } = await import("../db");
      fake.query.mockResolvedValueOnce(ok(1));
      expect(await setIntentStripeCustomer("intent-1", "cus_1")).toBe(true);
      const [update] = calls();
      expect(update.sql).toBe(
        "update `booking_intents` set `stripe_customer_id` = ? where (`booking_intents`.`id` = ? and " +
          "`booking_intents`.`status` <> ? and (`booking_intents`.`stripe_customer_id` is null or " +
          "`booking_intents`.`stripe_customer_id` = ?))",
      );
      expect(update.params).toEqual(["cus_1", "intent-1", "paid", "cus_1"]);
    });

    it("affectedRows 0 com o mesmo id já gravado conta como gravado; com outro id não", async () => {
      const { setIntentStripeCustomer } = await import("../db");
      fake.query.mockResolvedValueOnce(ok(0)).mockResolvedValueOnce(rows(["cus_1"]));
      expect(await setIntentStripeCustomer("intent-1", "cus_1")).toBe(true);
      fake.query.mockResolvedValueOnce(ok(0)).mockResolvedValueOnce(rows(["cus_other"]));
      expect(await setIntentStripeCustomer("intent-1", "cus_1")).toBe(false);
      fake.query.mockResolvedValueOnce(ok(0)).mockResolvedValueOnce(rows());
      expect(await setIntentStripeCustomer("missing", "cus_1")).toBe(false);
    });

    it("sem BD ou com erro devolve false", async () => {
      const { setIntentStripeCustomer } = await import("../db");
      fake.preview.mockReturnValue(true);
      expect(await setIntentStripeCustomer("intent-1", "cus_1")).toBe(false);
      fake.preview.mockReturnValue(false);
      fake.query.mockRejectedValueOnce(new Error("boom"));
      expect(await setIntentStripeCustomer("intent-1", "cus_1")).toBe(false);
    });
  });

  describe("insertCardMandate e insertScheduledPayment", () => {
    it("inserem e devolvem 'inserted'; os instantes vão em UTC", async () => {
      const { insertCardMandate, insertScheduledPayment } = await import("../db");
      fake.query.mockResolvedValue(ok(1));
      expect(await insertCardMandate(mandateInsert())).toBe("inserted");
      expect(await insertScheduledPayment(scheduledInsert())).toBe("inserted");
      const [mandate, schedule] = calls();
      expect(mandate.sql).toMatch(/^insert into `checkout_card_mandates` /);
      expect(mandate.params).toContain("2027-06-16 09:00:00.000");
      expect(schedule.sql).toMatch(/^insert into `checkout_scheduled_payments` /);
      expect(schedule.params).toEqual(expect.arrayContaining([
        "2027-06-15 22:59:00.000", "2027-06-16 09:00:00.000", "2027-06-23 09:00:00.000",
      ]));
    });

    it("chave repetida (ER_DUP_ENTRY, embrulhado pelo drizzle) devolve 'exists'", async () => {
      const { insertCardMandate, insertScheduledPayment } = await import("../db");
      fake.query.mockRejectedValueOnce(dup("uq_checkout_card_mandates_pi"));
      expect(await insertCardMandate(mandateInsert())).toBe("exists");
      fake.query.mockRejectedValueOnce(dup("uq_checkout_scheduled_payments_intent"));
      expect(await insertScheduledPayment(scheduledInsert())).toBe("exists");
      // Só a mensagem, sem código (outro driver): também conta
      fake.query.mockRejectedValueOnce(new Error("Duplicate entry 'intent-1' for key 'uq_checkout_scheduled_payments_intent'"));
      expect(await insertScheduledPayment(scheduledInsert())).toBe("exists");
    });

    it("um parâmetro escrito pelo hóspede com 'Duplicate entry' não faz passar outra falha por 'exists'", async () => {
      const { insertScheduledPayment } = await import("../db");
      // O embrulho do drizzle repete os parâmetros na mensagem; o erro do
      // driver é outro (valor demasiado longo).
      fake.query.mockRejectedValueOnce(Object.assign(new Error("Data too long for column 'phone'"), { code: "ER_DATA_TOO_LONG" }));
      await expect(insertScheduledPayment({ ...scheduledInsert(), phone: "Duplicate entry x" } as any)).rejects.toThrow(/Failed query/);
    });

    it("outro erro ou BD indisponível lança (o settle falha e o sweep retoma)", async () => {
      const { insertCardMandate, insertScheduledPayment } = await import("../db");
      fake.query.mockRejectedValueOnce(Object.assign(new Error("Data too long for column 'card_last4'"), { code: "ER_DATA_TOO_LONG" }));
      await expect(insertScheduledPayment(scheduledInsert())).rejects.toThrow(/Failed query/);
      fake.query.mockRejectedValueOnce(new Error("Lock wait timeout exceeded"));
      await expect(insertCardMandate(mandateInsert())).rejects.toThrow();
      fake.preview.mockReturnValue(true);
      await expect(insertCardMandate(mandateInsert())).rejects.toThrow(/without database/);
      await expect(insertScheduledPayment(scheduledInsert())).rejects.toThrow(/without database/);
    });
  });

  describe("linkCardMandatesToSchedule", () => {
    it("liga só o mandato de checkout do PI pago, ainda por ligar, e nunca lança", async () => {
      const { linkCardMandatesToSchedule } = await import("../db");
      fake.query.mockResolvedValueOnce(ok(1));
      await linkCardMandatesToSchedule("intent-1", "pi_1", "sp-1", "pm_1", "4242");
      const [update] = calls();
      expect(update.sql).toBe(
        "update `checkout_card_mandates` set `scheduled_payment_id` = ?, `payment_method_id` = ?, `card_last4` = ? " +
          "where (`checkout_card_mandates`.`intent_id` = ? and `checkout_card_mandates`.`payment_intent_id` = ? " +
          "and `checkout_card_mandates`.`scheduled_payment_id` is null and `checkout_card_mandates`.`source` = ?)",
      );
      expect(update.params).toEqual(["sp-1", "pm_1", "4242", "intent-1", "pi_1", "checkout"]);

      fake.query.mockResolvedValueOnce(ok(1));
      await linkCardMandatesToSchedule("intent-1", "pi_1", "sp-1", "pm_1", null);
      expect(calls()[1].sql).not.toContain("card_last4");

      fake.query.mockRejectedValueOnce(new Error("boom"));
      await expect(linkCardMandatesToSchedule("intent-1", "pi_1", "sp-1", "pm_1", null)).resolves.toBeUndefined();
      fake.preview.mockReturnValue(true);
      await expect(linkCardMandatesToSchedule("intent-1", "pi_1", "sp-1", "pm_1", null)).resolves.toBeUndefined();
    });
  });

  describe("getScheduledPaymentByIntent", () => {
    it("lê a linha do intent com os instantes em UTC", async () => {
      const { getScheduledPaymentByIntent } = await import("../db");
      fake.query.mockResolvedValueOnce(rows(scheduledRow({
        id: "sp-1", intentId: "intent-1", livemode: 1, status: "scheduled",
        chargeAt: "2027-06-16 09:00:00", balanceCents: 120_000, creditNoteDue: 0,
      })));
      const row = await getScheduledPaymentByIntent("intent-1");
      expect(row).toMatchObject({
        id: "sp-1", livemode: true, status: "scheduled", balanceCents: 120_000, creditNoteDue: false,
        chargeAt: new Date("2027-06-16T09:00:00Z"),
      });
      expect(calls()[0].sql).toMatch(/where `checkout_scheduled_payments`.`intent_id` = \? limit \?$/);
      expect(calls()[0].params).toEqual(["intent-1", 1]);
    });

    it("sem linha ou sem BD devolve null; erro de BD propaga", async () => {
      const { getScheduledPaymentByIntent } = await import("../db");
      fake.query.mockResolvedValueOnce(rows());
      expect(await getScheduledPaymentByIntent("intent-1")).toBeNull();
      fake.query.mockRejectedValueOnce(new Error("boom"));
      await expect(getScheduledPaymentByIntent("intent-1")).rejects.toThrow();
      fake.preview.mockReturnValue(true);
      expect(await getScheduledPaymentByIntent("intent-1")).toBeNull();
    });
  });

  describe("webhooks Stripe", () => {
    const evt = { eventId: "evt_1", type: "payment_intent.succeeded", livemode: false };

    it("evento novo: insere e devolve fresh", async () => {
      const { recordStripeWebhookEvent } = await import("../db");
      fake.query.mockResolvedValueOnce(ok(1));
      expect(await recordStripeWebhookEvent(evt)).toEqual({ fresh: true, processed: false });
      expect(calls()[0].sql).toMatch(/^insert into `stripe_webhook_events` \(`event_id`, `type`, `livemode`, `received_at`, `processed_at`, `last_error`\)/);
      expect(calls()[0].params).toEqual(["evt_1", "payment_intent.succeeded", false]);
    });

    it("reentrega: lê processed_at", async () => {
      const { recordStripeWebhookEvent } = await import("../db");
      fake.query.mockRejectedValueOnce(dup("PRIMARY")).mockResolvedValueOnce(rows(["2026-10-27 15:00:00"]));
      expect(await recordStripeWebhookEvent(evt)).toEqual({ fresh: false, processed: true });
      fake.query.mockRejectedValueOnce(dup("PRIMARY")).mockResolvedValueOnce(rows([null]));
      expect(await recordStripeWebhookEvent(evt)).toEqual({ fresh: false, processed: false });
      expect(calls()[1].sql).toMatch(/^select `processed_at` from `stripe_webhook_events` where `stripe_webhook_events`.`event_id` = \?/);
    });

    it("fail-open: sem BD ou com erro devolve null", async () => {
      const { recordStripeWebhookEvent } = await import("../db");
      fake.query.mockRejectedValueOnce(new Error("Table 'pa.stripe_webhook_events' doesn't exist"));
      expect(await recordStripeWebhookEvent(evt)).toBeNull();
      fake.query.mockRejectedValueOnce(dup("PRIMARY")).mockRejectedValueOnce(new Error("boom"));
      expect(await recordStripeWebhookEvent(evt)).toBeNull();
      fake.preview.mockReturnValue(true);
      expect(await recordStripeWebhookEvent(evt)).toBeNull();
    });

    it("marcar processado e falhado nunca lança; o erro fica cortado a 500 caracteres", async () => {
      const { markStripeWebhookEventProcessed, markStripeWebhookEventFailed } = await import("../db");
      fake.query.mockResolvedValue(ok(1));
      await markStripeWebhookEventProcessed("evt_1");
      expect(calls()[0].sql).toBe(
        "update `stripe_webhook_events` set `processed_at` = ?, `last_error` = ? where `stripe_webhook_events`.`event_id` = ?",
      );
      expect(calls()[0].params[1]).toBeNull();
      expect(calls()[0].params[2]).toBe("evt_1");

      await markStripeWebhookEventFailed("evt_1", "é".repeat(400) + "😀".repeat(200));
      const stored = calls()[1].params[0] as string;
      expect(Array.from(stored)).toHaveLength(500);
      expect(stored.endsWith("😀")).toBe(true);
      expect(calls()[1].sql).toBe("update `stripe_webhook_events` set `last_error` = ? where `stripe_webhook_events`.`event_id` = ?");

      fake.query.mockRejectedValue(new Error("boom"));
      await expect(markStripeWebhookEventProcessed("evt_1")).resolves.toBeUndefined();
      await expect(markStripeWebhookEventFailed("evt_1", "x")).resolves.toBeUndefined();
      fake.preview.mockReturnValue(true);
      await expect(markStripeWebhookEventProcessed("evt_1")).resolves.toBeUndefined();
      await expect(markStripeWebhookEventFailed("evt_1", "x")).resolves.toBeUndefined();
      expect(error).toHaveBeenCalled();
    });
  });
});

describe("scheduleTwoPartsSchemaRetry: arranque com a BD em baixo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("quando a BD volta, migra, confirma o esquema e pára", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeMysql();
    let up = false;
    const getExecute = vi.fn(async () => (up ? db.execute : null));
    scheduleTwoPartsSchemaRetry(getExecute, { intervalMs: 1000, maxAttempts: 10 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(db.execute).not.toHaveBeenCalled();
    up = true;
    await vi.advanceTimersByTimeAsync(1000);
    await expect(verifyTwoPartsColumns(db.execute)).resolves.toBe(true);
    const calls = getExecute.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(getExecute.mock.calls.length).toBe(calls);
  });

  it("quando a BD volta e o esquema fica confirmado, corre onConfirmed uma vez (os índices de leitura)", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const db = fakeMysql();
    let up = false;
    const onConfirmed = vi.fn(async () => { throw new Error("index failed"); });
    scheduleTwoPartsSchemaRetry(async () => (up ? db.execute : null), { intervalMs: 1000, maxAttempts: 10, onConfirmed });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onConfirmed).not.toHaveBeenCalled();
    up = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(onConfirmed).toHaveBeenCalledOnce();
    expect(onConfirmed).toHaveBeenCalledWith(db.execute);
    await vi.advanceTimersByTimeAsync(5000);
    expect(onConfirmed).toHaveBeenCalledOnce();
  });

  it("colunas em falta depois de migrar: avisa uma vez e não mata o processo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const execute = vi.fn(async (sql: string) => {
      if (sql.startsWith("SELECT")) throw { message: "Failed query", cause: { code: "ER_BAD_FIELD_ERROR", message: "Unknown column 'payment_plan' in 'field list'" } };
      throw { message: "Failed query", cause: { message: "ALTER command denied to user" } };
    });
    const onSchemaMissing = vi.fn();
    const stop = scheduleTwoPartsSchemaRetry(async () => execute, { intervalMs: 1000, maxAttempts: 3, onSchemaMissing });
    await vi.advanceTimersByTimeAsync(5000);
    expect(onSchemaMissing).toHaveBeenCalledOnce();
    stop();
  });

  it("esgotadas as tentativas com a BD sempre em baixo, avisa", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onGiveUp = vi.fn();
    scheduleTwoPartsSchemaRetry(async () => null, { intervalMs: 1000, maxAttempts: 3, onGiveUp });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(onGiveUp).toHaveBeenCalledWith(3);
  });
});
