import { describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";
import { ensureOwnerEmailBodySchema } from "./schema";
const dialect = new MySqlDialect();
describe("additive reply storage migration", () => {
  it("adds only missing columns and serializes two initializations of the same database", async () => {
    const execute=vi.fn().mockResolvedValueOnce([[{COLUMN_NAME:'bodyText'}],[]]).mockResolvedValue([{affectedRows:0},[]]); const db={execute};
    await Promise.all([ensureOwnerEmailBodySchema(db),ensureOwnerEmailBodySchema(db)]);
    const statements=execute.mock.calls.map(([q])=>dialect.sqlToQuery(q).sql);
    expect(statements).toHaveLength(4); expect(statements.slice(1)).toEqual([
      'ALTER TABLE owner_email_messages ADD COLUMN replyNoteId bigint NULL',
      'ALTER TABLE owner_email_messages ADD COLUMN replyNextAttemptAt datetime(3) NULL',
      'ALTER TABLE owner_email_messages ADD COLUMN replyError varchar(64) NULL']);
    expect(statements.join(' ')).not.toMatch(/DROP|DELETE|UPDATE/);
  });
  it.each([false,true])("permits concurrent duplicate-column errors (wrapped=%s) but retries other failures", async wrapped => {
    const execute=vi.fn().mockResolvedValueOnce([[],[]]).mockRejectedValueOnce(Object.assign(new Error('duplicate'),wrapped ? {cause:{code:'ER_DUP_FIELDNAME'}} : {code:'ER_DUP_FIELDNAME'})).mockResolvedValue([{affectedRows:0},[]]);
    await expect(ensureOwnerEmailBodySchema({execute})).resolves.toBeUndefined();
    const retry=vi.fn().mockRejectedValueOnce(new Error('temporary')).mockResolvedValue([[{COLUMN_NAME:'bodyText'},{COLUMN_NAME:'replyNoteId'},{COLUMN_NAME:'replyNextAttemptAt'},{COLUMN_NAME:'replyError'}],[]]); const db={execute:retry};
    await expect(ensureOwnerEmailBodySchema(db)).rejects.toThrow('temporary'); await expect(ensureOwnerEmailBodySchema(db)).resolves.toBeUndefined();
  });
});
