/**
 * Limpeza da origem da visita (booking_intent_origins): cada registo sai 31
 * dias depois da última atualização, numa limpeza periódica e não só no
 * arranque do processo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const fake = vi.hoisted(() => ({ getDb: vi.fn(), where: vi.fn() }));
vi.mock("../db", () => ({ getDb: fake.getDb }));

beforeEach(() => {
  vi.resetModules();
  fake.where.mockReset().mockResolvedValue([{ affectedRows: 0 }]);
  fake.getDb.mockReset().mockResolvedValue({ delete: vi.fn(() => ({ where: fake.where })) });
});
afterEach(() => { vi.useRealTimers(); });

describe("limpeza de booking_intent_origins", () => {
  it("apaga só o que tem mais de 31 dias desde a última atualização", async () => {
    const { purgeExpiredIntentOrigins } = await import("./visit-origin-store");
    expect(await purgeExpiredIntentOrigins()).toBe(true);
    const query = new MySqlDialect().sqlToQuery(fake.where.mock.calls[0][0]);
    expect(query.sql).toBe("`booking_intent_origins`.`updated_at` < NOW() - INTERVAL 31 DAY");
    expect(query.params).toEqual([]);
  });

  it("sem base de dados ou com erro não lança", async () => {
    const { purgeExpiredIntentOrigins } = await import("./visit-origin-store");
    fake.getDb.mockResolvedValueOnce(null);
    expect(await purgeExpiredIntentOrigins()).toBe(false);
    fake.where.mockRejectedValueOnce(new Error("table missing"));
    expect(await purgeExpiredIntentOrigins()).toBe(false);
  });

  it("corre 1 minuto depois do arranque e depois a cada 6 horas, arrancada uma só vez", async () => {
    vi.useFakeTimers();
    const { startIntentOriginPurge } = await import("./visit-origin-store");
    startIntentOriginPurge();
    startIntentOriginPurge();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fake.where).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(fake.where).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(fake.where).toHaveBeenCalledTimes(3);
  });
});
