import { describe, expect, it, vi } from "vitest";
import { ensureReadIndexes, READ_INDEXES } from "./db-indexes";

describe("ensureReadIndexes", () => {
  it("cria cada índice com o SQL certo; 'já existe' conta como existente; uma falha não trava os outros", async () => {
    const dup = Object.assign(new Error("Failed query"), { cause: Object.assign(new Error("Duplicate key name 'idx_leads_email_source'"), { errno: 1061 }) });
    const execute = vi.fn(async (sql: string) => {
      if (sql.includes("idx_leads_email_source")) throw dup;
      if (sql.includes("customer_trips")) throw new Error("Table 'pa.customer_trips' doesn't exist");
      return {};
    });
    const r = await ensureReadIndexes(execute);
    expect(execute).toHaveBeenCalledTimes(READ_INDEXES.length);
    expect(execute.mock.calls[0][0]).toBe("CREATE INDEX `idx_booking_intents_stay` ON `booking_intents` (`listingId`, `checkIn`, `checkOut`)");
    expect(r.existing).toEqual(["idx_leads_email_source"]);
    expect(r.failed).toEqual([{ index: "idx_customer_trips_reservation", error: expect.stringContaining("doesn't exist") }]);
    expect(r.added).toEqual([
      "idx_booking_intents_stay", "idx_booking_intents_created", "idx_booking_intents_updated", "idx_web_vitals_created",
    ]);
  });

  it("só índices de leitura: nenhum UNIQUE (um UNIQUE podia falhar ou mudar escritas)", () => {
    for (const [, name] of READ_INDEXES) expect(name).toMatch(/^idx_/);
  });
});
