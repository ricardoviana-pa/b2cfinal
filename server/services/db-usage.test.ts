/**
 * Consultas que pesavam na quota do TiDB (28 out 2026): o SQL verdadeiro do
 * drizzle sobre um cliente mysql2 falso, como em balance-db.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({ query: vi.fn(), preview: vi.fn(() => false) }));
vi.mock("../lib/preview-isolation", () => ({ isPreviewDeployment: fake.preview }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: () => actual.drizzle({ client: { query: fake.query } as any }) };
});

const calls = () => fake.query.mock.calls.map(([q, params]: any[]) => ({ sql: q.sql as string, params: (params ?? []) as unknown[] }));
const rows = (...r: unknown[][]) => [r, []];

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fake@localhost/pa");
  fake.query.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("consultas da quota", () => {
  it("getSettingsByKeys: uma só consulta IN para a página inteira, só chave e valor", async () => {
    const { getSettingsByKeys } = await import("../db");
    fake.query.mockResolvedValueOnce(rows(["lowest_nightly_a", "150@1"], ["lowest_nightly_b", null]));
    const out = await getSettingsByKeys(["lowest_nightly_a", "lowest_nightly_b", "lowest_nightly_c"]);
    expect(out).toEqual(new Map([["lowest_nightly_a", "150@1"], ["lowest_nightly_b", null]]));
    const [q] = calls();
    expect(calls()).toHaveLength(1);
    expect(q.sql).toMatch(/^select `settingKey`, `settingValue` from `site_settings` where `site_settings`.`settingKey` in \(\?, \?, \?\)$/);
    expect(await getSettingsByKeys([])).toEqual(new Map());
    expect(calls()).toHaveLength(1);
  });

  it("listUnsettledCardIntents: só id e paymentIntentId (sem a cotação em JSON)", async () => {
    const { listUnsettledCardIntents } = await import("../db");
    fake.query.mockResolvedValueOnce(rows(["int-1", "pi_1"]));
    expect(await listUnsettledCardIntents()).toEqual([{ id: "int-1", paymentIntentId: "pi_1" }]);
    expect(calls()[0].sql).toMatch(/^select `id`, `payment_intent_id` from `booking_intents` where/);
  });

  it("listRecoveryCandidates: a fila dos contactos 1/2 tem limite de 9 dias em createdAt (intervalo no índice)", async () => {
    const { listRecoveryCandidates } = await import("../db");
    fake.query.mockResolvedValue(rows());
    await listRecoveryCandidates();
    const [early, late] = calls();
    const lowerBounds = (sql: string) => (sql.match(/`booking_intents`.`createdAt` > \?/g) ?? []).length;
    // Antes só havia o "> 48 h" dentro do OR do concierge; agora também o
    // limite de 9 dias fora do OR (o que o índice usa).
    expect(lowerBounds(early.sql)).toBe(2);
    expect(lowerBounds(late.sql)).toBe(1);
  });
});
