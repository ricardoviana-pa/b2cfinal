import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { dbErrorSummary } from "./db-error-log";

/**
 * Revisão do PR #176: o checkoutNewsletterConsent corre em cada getIntent com
 * email e registava o erro do Drizzle inteiro, com o email do hóspede nos
 * parâmetros. Os logs do Render não podem ter dados pessoais.
 */
describe("dbErrorSummary: o erro da base de dados sem dados pessoais", () => {
  const email = "ana.silva+villa@example.com";

  it("um DrizzleQueryError real: o código do MySQL e a query com '?', nunca os parâmetros", () => {
    const cause = Object.assign(new Error("Too many connections"), { code: "ER_CON_COUNT_ERROR" });
    const err = new DrizzleQueryError(
      "select `id` from `leads` where (`leads`.`email` = ? and `leads`.`source` = ?) limit ?",
      [email, "newsletter-checkout", 1],
      cause,
    );
    expect(err.message).toContain(email); // a razão desta função
    const line = dbErrorSummary(err);
    expect(line).toBe("ER_CON_COUNT_ERROR: Failed query: select `id` from `leads` where (`leads`.`email` = ? and `leads`.`source` = ?) limit ?");
    expect(line).not.toContain("@");
    expect(line).not.toContain("newsletter-checkout");
  });

  it("um email citado na própria mensagem do MySQL também sai", () => {
    const err = Object.assign(new Error(`Duplicate entry '${email}' for key 'leads.email'`), { code: "ER_DUP_ENTRY" });
    expect(dbErrorSummary(err)).toBe("ER_DUP_ENTRY: Duplicate entry '[email]' for key 'leads.email'");
  });

  it("qualquer outra coisa vira uma linha curta", () => {
    expect(dbErrorSummary(new Error("connect ETIMEDOUT"))).toBe("connect ETIMEDOUT");
    expect(dbErrorSummary("boom\nsecond line")).toBe("boom");
    expect(dbErrorSummary(undefined)).toBe("unknown error");
    expect(dbErrorSummary(new Error("x".repeat(500))).length).toBe(200);
  });

  it("o checkoutNewsletterConsent regista só o resumo", () => {
    const db = fs.readFileSync(new URL("../db.ts", import.meta.url), "utf8");
    const fn = db.slice(db.indexOf("export async function checkoutNewsletterConsent"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    expect(body).toMatch(/console\.error\("\[Database\] checkoutNewsletterConsent failed:", dbErrorSummary\(error\)\);/);
    expect(body).not.toMatch(/console\.error\([^)]*, error\)/);
  });
});
