/**
 * Pagamento em duas partes, Fase 2a: helpers de BD do motor da 2.ª parte
 * (server/db.ts; docs/pagamento_duas_partes.md, 2.4, 2.5, 3.1 e 5.2).
 *
 * Como em two-parts-migrations.test.ts, o drizzle verdadeiro corre sobre um
 * cliente mysql2 falso: o SQL verificado aqui é o que vai para produção.
 * O que se prova, transição a transição:
 * - o "WHERE status" de cada mudança de estado (quem pode passar a quê);
 * - que um claim repetido não pode ganhar: o estado que o SET escreve
 *   nunca está entre os que o WHERE aceita, e affectedRows 0 dá false;
 * - que todas as listas filtram por livemode e site_origin;
 * - que sem BD nada corre e que um erro de BD nunca vira "false".
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { checkoutScheduledPayments } from "../../drizzle/schema";
import type { BalanceScope } from "../db";

const fake = vi.hoisted(() => ({ query: vi.fn(), preview: vi.fn(() => false) }));
vi.mock("../lib/preview-isolation", () => ({ isPreviewDeployment: fake.preview }));
vi.mock("drizzle-orm/mysql2", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm/mysql2")>();
  return { ...actual, drizzle: () => actual.drizzle({ client: { query: fake.query } as any }) };
});

type Call = { sql: string; params: unknown[] };
const calls = (): Call[] => fake.query.mock.calls.map(([q, params]: any[]) => ({ sql: q.sql, params: params ?? [] }));
const ok = (affectedRows = 1) => [{ affectedRows, insertId: 0 }, undefined];
const rows = (...r: unknown[][]) => [r, []];

const T = "`checkout_scheduled_payments`";
const c = (name: string) => `${T}.\`${name}\``;
const LIVE: BalanceScope = { livemode: true, siteOrigin: "https://www.portugalactive.com" };
const TEST: BalanceScope = { livemode: false, siteOrigin: "https://dev.portugalactive.com" };
const SCOPE_SQL = `${c("livemode")} = ? and ${c("site_origin")} = ?`;

const NOW = new Date("2027-06-28T09:00:00Z");
const NOW_SQL = "2027-06-28 09:00:00.000";
const dt = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "");

/** Parte do SELECT a seguir ao FROM (a lista de colunas é a da tabela inteira). */
function afterFrom(call: Call): string {
  const marker = ` from ${T} `;
  const i = call.sql.indexOf(marker);
  expect(i).toBeGreaterThan(0);
  return call.sql.slice(i + marker.length);
}

/** Parâmetros do SET e do WHERE de um UPDATE. */
function splitUpdate(call: Call): { set: unknown[]; where: unknown[] } {
  const i = call.sql.indexOf(" where ");
  const setCount = (call.sql.slice(0, i).match(/\?/g) ?? []).length;
  return { set: call.params.slice(0, setCount), where: call.params.slice(setCount) };
}

/** Linha completa como o mysql2 a devolve (rowsAsArray, datetimes em texto UTC). */
function scheduledRow(values: Record<string, unknown>): unknown[] {
  return Object.keys(getTableColumns(checkoutScheduledPayments)).map((k) => (k in values ? values[k] : null));
}

let error: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "mysql://fake@localhost/pa");
  fake.query.mockReset();
  fake.preview.mockReset().mockReturnValue(false);
  error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ════════════════════════════════════════════════════════════════
   Scope: produção nunca vê linhas de teste, nem o contrário
   ════════════════════════════════════════════════════════════════ */

describe("todas as listas filtram por livemode e site_origin", () => {
  const listCalls: Array<[string, (db: typeof import("../db"), s: BalanceScope) => Promise<unknown>]> = [
    ["listDueScheduledPayments", (d, s) => d.listDueScheduledPayments(s, NOW)],
    ["listStuckCharging", (d, s) => d.listStuckCharging(s, NOW)],
    ["listScheduledForReminders", (d, s) => d.listScheduledForReminders(s, NOW)],
    ["listFailureNoticeCandidates", (d, s) => d.listFailureNoticeCandidates(s)],
    ["listHardStopDue", (d, s) => d.listHardStopDue(s, NOW)],
    ["listCancelling", (d, s) => d.listCancelling(s)],
    ["listPostChargeIncomplete", (d, s) => d.listPostChargeIncomplete(s)],
    ["listForReconciliation", (d, s) => d.listForReconciliation(s, { actionBefore: NOW, staleBefore: NOW })],
  ];

  it.each(listCalls)("%s começa o WHERE pelo scope", async (_name, run) => {
    const d = await import("../db");
    fake.query.mockResolvedValue(rows());
    await run(d, LIVE);
    await run(d, TEST);
    const [live, test] = calls();
    expect(afterFrom(live).startsWith(`where (${SCOPE_SQL} and `)).toBe(true);
    expect(live.params.slice(0, 2)).toEqual([true, LIVE.siteOrigin]);
    expect(test.params.slice(0, 2)).toEqual([false, TEST.siteOrigin]);
  });

  it.each(listCalls)("%s com scope mal formado lança sem tocar na BD", async (_name, run) => {
    const d = await import("../db");
    for (const bad of [{ livemode: true, siteOrigin: "" }, { livemode: "true", siteOrigin: "x" }, null]) {
      await expect(run(d, bad as any)).rejects.toThrow(/BalanceScope/);
    }
    expect(fake.query).not.toHaveBeenCalled();
  });

  it.each(listCalls)("%s: sem BD devolve []; erro de BD propaga", async (_name, run) => {
    const d = await import("../db");
    fake.query.mockRejectedValueOnce(new Error("boom"));
    await expect(run(d, LIVE)).rejects.toThrow();
    fake.preview.mockReturnValue(true);
    await expect(run(d, LIVE)).resolves.toEqual([]);
  });
});

/* ════════════════════════════════════════════════════════════════
   Cobrança
   ════════════════════════════════════════════════════════════════ */

describe("listDueScheduledPayments", () => {
  it("scheduled/retry vencidas, antes de H, sem pausa de ajuda, mais antigas primeiro", async () => {
    const { listDueScheduledPayments } = await import("../db");
    fake.query.mockResolvedValueOnce(rows());
    await listDueScheduledPayments(LIVE, NOW);
    const [q] = calls();
    expect(afterFrom(q)).toBe(
      `where (${SCOPE_SQL} and ${c("status")} in (?, ?) and ${c("next_attempt_at")} <= ? and ${c("hard_stop_at")} > ? ` +
        `and (${c("help_paused_until")} is null or ${c("help_paused_until")} <= ?)) ` +
        `order by ${c("next_attempt_at")} asc limit ?`,
    );
    expect(q.params).toEqual([true, LIVE.siteOrigin, "scheduled", "retry", NOW_SQL, NOW_SQL, NOW_SQL, 50]);
    // Nunca needs_action (só o hóspede) nem needs_review (humano)
    expect(q.params).not.toContain("needs_action");
    expect(q.params).not.toContain("needs_review");
  });
});

describe("claimScheduledPaymentForCharge", () => {
  it("sweep: repete o filtro da lista no WHERE e nunca reclama needs_action", async () => {
    const { claimScheduledPaymentForCharge } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await claimScheduledPaymentForCharge("sp-1", "sweep", NOW)).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`claim_prev_status\` = ${c("status")}, \`status\` = ?, \`attempts\` = ${c("attempts")} + 1, \`claimed_at\` = ?, \`claim_source\` = ? ` +
        `where (${c("id")} = ? and ${c("status")} in (?, ?) and ${c("hard_stop_at")} > ? and ${c("next_attempt_at")} <= ? ` +
        `and (${c("help_paused_until")} is null or ${c("help_paused_until")} <= ?))`,
    );
    expect(u.params).toEqual(["charging", NOW_SQL, "sweep", "sp-1", "scheduled", "retry", NOW_SQL, NOW_SQL, NOW_SQL]);
  });

  it("grava o estado de onde veio (claim_prev_status) ANTES de pôr charging no mesmo SET: o MySQL avalia da esquerda para a direita", async () => {
    // Regressão C4/C33: a libertação das presas volta a este estado. Com
    // `status` à esquerda, claim_prev_status leria 'charging'.
    const { claimScheduledPaymentForCharge } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    await claimScheduledPaymentForCharge("sp-1", "admin", NOW);
    const set = calls()[0].sql.split(" where ")[0];
    expect(set.indexOf("`claim_prev_status` = ")).toBeGreaterThan(0);
    expect(set.indexOf("`claim_prev_status` = ")).toBeLessThan(set.indexOf("`status` = ?"));
    expect(set).toContain(`\`claim_prev_status\` = ${c("status")}`);
  });

  it("webhook conta como automático (o mesmo WHERE do sweep)", async () => {
    const { claimScheduledPaymentForCharge } = await import("../db");
    fake.query.mockResolvedValue(ok(1));
    await claimScheduledPaymentForCharge("sp-1", "sweep", NOW);
    await claimScheduledPaymentForCharge("sp-1", "webhook", NOW);
    const [sweep, webhook] = calls();
    expect(webhook.sql).toBe(sweep.sql);
    expect(splitUpdate(webhook).where).toEqual(splitUpdate(sweep).where);
  });

  it("hóspede e admin: também de needs_action e antes da data marcada, nunca depois de H", async () => {
    const { claimScheduledPaymentForCharge } = await import("../db");
    fake.query.mockResolvedValue(ok(1));
    expect(await claimScheduledPaymentForCharge("sp-1", "guest", NOW)).toBe(true);
    expect(await claimScheduledPaymentForCharge("sp-1", "admin", NOW)).toBe(true);
    const [guest, admin] = calls();
    expect(guest.sql).toBe(
      `update ${T} set \`claim_prev_status\` = ${c("status")}, \`status\` = ?, \`attempts\` = ${c("attempts")} + 1, \`claimed_at\` = ?, \`claim_source\` = ? ` +
        `where (${c("id")} = ? and ${c("status")} in (?, ?, ?) and ${c("hard_stop_at")} > ?)`,
    );
    expect(guest.params).toEqual(["charging", NOW_SQL, "guest", "sp-1", "scheduled", "retry", "needs_action", NOW_SQL]);
    expect(admin.params[2]).toBe("admin");
  });

  it("um claim repetido não pode ganhar: charging nunca está no WHERE e affectedRows 0 dá false", async () => {
    const { claimScheduledPaymentForCharge } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await claimScheduledPaymentForCharge("sp-1", "sweep", NOW)).toBe(true);
    expect(await claimScheduledPaymentForCharge("sp-1", "guest", NOW)).toBe(false);
    for (const call of calls()) {
      const { set, where } = splitUpdate(call);
      expect(set[0]).toBe("charging");
      expect(where).not.toContain("charging");
      for (const terminal of ["succeeded", "paid_externally", "needs_review", "cancelling", "cancelled_unpaid", "cancelled_by_guest"]) {
        expect(where).not.toContain(terminal);
      }
    }
  });

  it("sem BD devolve false sem consultar; erro de BD propaga; origem inválida lança", async () => {
    const { claimScheduledPaymentForCharge } = await import("../db");
    fake.query.mockRejectedValueOnce(new Error("Lock wait timeout exceeded"));
    await expect(claimScheduledPaymentForCharge("sp-1", "sweep", NOW)).rejects.toThrow();
    await expect(claimScheduledPaymentForCharge("sp-1", "robot" as any, NOW)).rejects.toThrow(/claim_source/);
    fake.preview.mockReturnValue(true);
    expect(await claimScheduledPaymentForCharge("sp-1", "sweep", NOW)).toBe(false);
    expect(fake.query).toHaveBeenCalledTimes(1);
  });
});

describe("setBalancePaymentIntentId", () => {
  it("grava o PI só enquanto a linha está em charging", async () => {
    const { setBalancePaymentIntentId } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await setBalancePaymentIntentId("sp-1", "balancePaymentIntentId", "pi_bal")).toBe(true);
    expect(await setBalancePaymentIntentId("sp-1", "guestPaymentIntentId", "pi_guest")).toBe(false);
    const [bal, guest] = calls();
    expect(bal.sql).toBe(`update ${T} set \`balance_payment_intent_id\` = ? where (${c("id")} = ? and ${c("status")} = ?)`);
    expect(bal.params).toEqual(["pi_bal", "sp-1", "charging"]);
    expect(guest.sql).toBe(`update ${T} set \`guest_payment_intent_id\` = ? where (${c("id")} = ? and ${c("status")} = ?)`);
    expect(guest.params).toEqual(["pi_guest", "sp-1", "charging"]);
  });

  it("campo ou PI inválidos lançam", async () => {
    const { setBalancePaymentIntentId } = await import("../db");
    await expect(setBalancePaymentIntentId("sp-1", "depositPaymentIntentId" as any, "pi_x")).rejects.toThrow(/Campo/);
    await expect(setBalancePaymentIntentId("sp-1", "balancePaymentIntentId", "")).rejects.toThrow();
    expect(fake.query).not.toHaveBeenCalled();
  });
});

describe("resultado da tentativa", () => {
  it("markScheduledPaymentSucceeded: de scheduled, charging, retry ou needs_action; nunca de review nem finais", async () => {
    const { markScheduledPaymentSucceeded } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await markScheduledPaymentSucceeded("sp-1", "pi_bal", NOW)).toBe(true);
    expect(await markScheduledPaymentSucceeded("sp-1", "pi_bal", NOW)).toBe(false);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`status\` = ?, \`balance_payment_intent_id\` = ?, \`succeeded_at\` = ? ` +
        `where (${c("id")} = ? and ${c("status")} in (?, ?, ?, ?))`,
    );
    expect(u.params).toEqual(["succeeded", "pi_bal", NOW_SQL, "sp-1", "scheduled", "charging", "retry", "needs_action"]);
    expect(splitUpdate(u).where).not.toContain("succeeded");
    await expect(markScheduledPaymentSucceeded("sp-1", "", NOW)).rejects.toThrow();
  });

  it("markScheduledPaymentRetry: só de charging, com a próxima tentativa e os textos cortados", async () => {
    const { markScheduledPaymentRetry } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    const next = new Date("2027-06-29T09:00:00Z");
    expect(await markScheduledPaymentRetry("sp-1", { declineCode: "x".repeat(80), error: "é".repeat(600), nextAttemptAt: next })).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`next_attempt_at\` = ?, \`status\` = ?, \`last_decline_code\` = ?, \`last_error\` = ? ` +
        `where (${c("id")} = ? and ${c("status")} = ?)`,
    );
    expect(u.params[0]).toBe(dt(next));
    expect(u.params[1]).toBe("retry");
    expect(Array.from(u.params[2] as string)).toHaveLength(64);
    expect(Array.from(u.params[3] as string)).toHaveLength(500);
    expect(u.params.slice(4)).toEqual(["sp-1", "charging"]);
  });

  it("markScheduledPaymentNeedsAction: só de charging; códigos vazios ficam NULL", async () => {
    const { markScheduledPaymentNeedsAction } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await markScheduledPaymentNeedsAction("sp-1", { declineCode: "expired_card", error: "Your card has expired." })).toBe(true);
    expect(await markScheduledPaymentNeedsAction("sp-1", { declineCode: null, error: "" })).toBe(false);
    const [u, again] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`status\` = ?, \`last_decline_code\` = ?, \`last_error\` = ? where (${c("id")} = ? and ${c("status")} = ?)`,
    );
    expect(u.params).toEqual(["needs_action", "expired_card", "Your card has expired.", "sp-1", "charging"]);
    expect(again.params.slice(1, 3)).toEqual([null, null]);
  });

  it("releaseChargeClaim: só de charging, devolve ao estado pedido e desconta a tentativa sem passar de 0", async () => {
    const { releaseChargeClaim } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    const next = new Date("2027-06-28T10:00:00Z");
    expect(await releaseChargeClaim("sp-1", { toStatus: "retry", nextAttemptAt: next, error: "Stripe 503" })).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`next_attempt_at\` = ?, \`status\` = ?, \`attempts\` = GREATEST(${c("attempts")} - 1, 0), \`last_error\` = ? ` +
        `where (${c("id")} = ? and ${c("status")} = ?)`,
    );
    expect(u.params).toEqual([dt(next), "retry", "Stripe 503", "sp-1", "charging"]);
    await expect(releaseChargeClaim("sp-1", { toStatus: "succeeded" as any, nextAttemptAt: next, error: "x" })).rejects.toThrow();
    await expect(releaseChargeClaim("sp-1", { toStatus: "charging" as any, nextAttemptAt: next, error: "x" })).rejects.toThrow();
    expect(fake.query).toHaveBeenCalledTimes(1);
  });

  it("as transições de charging falham na repetição (o estado novo nunca é charging)", async () => {
    const d = await import("../db");
    fake.query.mockResolvedValue(ok(0));
    const next = new Date("2027-06-29T09:00:00Z");
    expect(await d.markScheduledPaymentRetry("sp-1", { declineCode: null, error: null, nextAttemptAt: next })).toBe(false);
    expect(await d.markScheduledPaymentNeedsAction("sp-1", { declineCode: null, error: null })).toBe(false);
    expect(await d.releaseChargeClaim("sp-1", { toStatus: "scheduled", nextAttemptAt: next, error: "x" })).toBe(false);
    for (const call of calls()) {
      const { set, where } = splitUpdate(call);
      expect(where).toEqual(["sp-1", "charging"]);
      expect(set).not.toContain("charging");
    }
  });

  it("transições sem BD devolvem false sem consultar", async () => {
    const d = await import("../db");
    fake.preview.mockReturnValue(true);
    const next = new Date("2027-06-29T09:00:00Z");
    expect(await d.setBalancePaymentIntentId("sp-1", "balancePaymentIntentId", "pi_1")).toBe(false);
    expect(await d.markScheduledPaymentSucceeded("sp-1", "pi_1", NOW)).toBe(false);
    expect(await d.markCancellingAsSucceeded("sp-1", "pi_1", NOW)).toBe(false);
    expect(await d.markScheduledPaymentRetry("sp-1", { declineCode: null, error: null, nextAttemptAt: next })).toBe(false);
    expect(await d.markScheduledPaymentNeedsAction("sp-1", { declineCode: null, error: null })).toBe(false);
    expect(await d.releaseChargeClaim("sp-1", { toStatus: "scheduled", nextAttemptAt: next, error: "x" })).toBe(false);
    expect(await d.markPaidExternally("sp-1", "TRF-1")).toBe(false);
    expect(await d.markNeedsReview("sp-1", "x", null)).toBe(false);
    expect(await d.claimReminderStage("sp-1", 0, 1)).toBe(false);
    expect(await d.claimFailureNoticeStage("sp-1", 0, 1)).toBe(false);
    expect(await d.claimScheduledPaymentForCancel("sp-1", ["retry"])).toBe(false);
    expect(await d.claimEffect("sp-1", "noteClaimedAt", NOW)).toBe(false);
    expect(await d.markGuestyBalanceRecorded("sp-1", NOW)).toBe(false);
    expect(await d.markGuestyCancelled("sp-1", NOW)).toBe(false);
    expect(await d.markRefund("sp-1", { refundId: "re_1", refundCents: 100, refundStatus: "succeeded" })).toBe(false);
    expect(await d.markCancelledUnpaid("sp-1", NOW)).toBe(false);
    expect(await d.markCancelledByGuest("sp-1", NOW)).toBe(false);
    expect(await d.applyReconciliation("sp-1", {
      guestyStatus: "confirmed", guestyCheckIn: null, guestyCheckOut: null, guestyListingId: null,
      guestyTotalCents: null, guestyTotalPaidCents: null, guestyPendingForeignCents: null,
    }, NOW)).toBe(false);
    expect(await d.markReconcileError("sp-1", "x")).toBe(false);
    expect(fake.query).not.toHaveBeenCalled();
  });
});

describe("listStuckCharging", () => {
  it("charging reclamadas antes do corte (ou sem claimed_at), mais antigas primeiro", async () => {
    const { listStuckCharging } = await import("../db");
    fake.query.mockResolvedValueOnce(rows());
    const cutoff = new Date("2027-06-28T08:30:00Z");
    await listStuckCharging(LIVE, cutoff);
    const [q] = calls();
    expect(afterFrom(q)).toBe(
      `where (${SCOPE_SQL} and ${c("status")} = ? and (${c("claimed_at")} is null or ${c("claimed_at")} < ?)) ` +
        `order by ${c("claimed_at")} asc`,
    );
    expect(q.params).toEqual([true, LIVE.siteOrigin, "charging", dt(cutoff)]);
  });
});

/* ════════════════════════════════════════════════════════════════
   Fora do caminho normal
   ════════════════════════════════════════════════════════════════ */

describe("markPaidExternally e markNeedsReview", () => {
  it("paid_externally: de scheduled, retry, needs_action ou needs_review; nunca a meio de uma cobrança", async () => {
    const { markPaidExternally } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await markPaidExternally("sp-1", "  TRF 2027-06-20 Millennium  ")).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`status\` = ?, \`paid_externally_ref\` = ? where (${c("id")} = ? and ${c("status")} in (?, ?, ?, ?))`,
    );
    expect(u.params).toEqual(["paid_externally", "TRF 2027-06-20 Millennium", "sp-1", "scheduled", "retry", "needs_action", "needs_review"]);
    expect(splitUpdate(u).where).not.toContain("charging");
    await expect(markPaidExternally("sp-1", "   ")).rejects.toThrow(/referência/);
  });

  it("needs_review: de scheduled, retry, needs_action ou charging; nunca de estados finais nem de needs_review", async () => {
    const { markNeedsReview } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(1));
    const due = new Date("2027-07-07T11:00:00Z");
    expect(await markNeedsReview("sp-1", "total alterado no Guesty", due)).toBe(true);
    expect(await markNeedsReview("sp-1", "", null)).toBe(true);
    const [u, noReason] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`status\` = ?, \`review_reason\` = ?, \`review_due_at\` = ? where (${c("id")} = ? and ${c("status")} in (?, ?, ?, ?))`,
    );
    expect(u.params).toEqual(["needs_review", "total alterado no Guesty", dt(due), "sp-1", "scheduled", "retry", "needs_action", "charging"]);
    expect(splitUpdate(u).where).not.toContain("needs_review");
    expect(noReason.params.slice(1, 3)).toEqual(["sem motivo indicado", null]);
  });
});

/* ════════════════════════════════════════════════════════════════
   Lembretes e avisos de falha
   ════════════════════════════════════════════════════════════════ */

describe("lembretes E1/E2", () => {
  it("lista só scheduled com C no horizonte e lembretes por enviar", async () => {
    const { listScheduledForReminders } = await import("../db");
    fake.query.mockResolvedValueOnce(rows());
    const horizon = new Date("2027-07-06T09:00:00Z");
    await listScheduledForReminders(LIVE, horizon);
    const [q] = calls();
    expect(afterFrom(q)).toBe(
      `where (${SCOPE_SQL} and ${c("status")} = ? and ${c("charge_at")} <= ? and ${c("reminder_stage")} < ?) order by ${c("charge_at")} asc`,
    );
    expect(q.params).toEqual([true, LIVE.siteOrigin, "scheduled", dt(horizon), 2]);
  });

  it("claim do estágio: só do estágio esperado e com a linha ainda scheduled; a repetição falha", async () => {
    const { claimReminderStage } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await claimReminderStage("sp-1", 0, 1)).toBe(true);
    expect(await claimReminderStage("sp-1", 0, 1)).toBe(false);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`reminder_stage\` = ? where (${c("id")} = ? and ${c("reminder_stage")} = ? and ${c("status")} = ?)`,
    );
    expect(u.params).toEqual([1, "sp-1", 0, "scheduled"]);
    await expect(claimReminderStage("sp-1", 0.5, 1)).rejects.toThrow();
  });
});

describe("avisos de falha E3/E3b", () => {
  it("candidatas: retry/needs_action com estágio 0 ou 1, por ordem de H", async () => {
    const { listFailureNoticeCandidates } = await import("../db");
    fake.query.mockResolvedValueOnce(rows());
    await listFailureNoticeCandidates(LIVE);
    const [q] = calls();
    expect(afterFrom(q)).toBe(
      `where (${SCOPE_SQL} and ${c("status")} in (?, ?) and ${c("failure_notice_stage")} in (?, ?)) order by ${c("hard_stop_at")} asc`,
    );
    expect(q.params).toEqual([true, LIVE.siteOrigin, "retry", "needs_action", 0, 1]);
  });

  it("E3: o claim grava o envio e o H recalculado no mesmo UPDATE", async () => {
    const { claimFailureNoticeStage } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(1));
    const h = new Date("2027-07-05T11:00:00Z");
    expect(await claimFailureNoticeStage("sp-1", 0, 1, { failureNoticeSentAt: NOW, hardStopAt: h })).toBe(true);
    expect(await claimFailureNoticeStage("sp-1", 1, 2, {})).toBe(true);
    const [e3, e3b] = calls();
    expect(e3.sql).toBe(
      `update ${T} set \`hard_stop_at\` = ?, \`failure_notice_sent_at\` = ?, \`failure_notice_stage\` = ? ` +
        `where (${c("id")} = ? and ${c("failure_notice_stage")} = ? and ${c("status")} in (?, ?))`,
    );
    expect(e3.params).toEqual([dt(h), NOW_SQL, 1, "sp-1", 0, "retry", "needs_action"]);
    // E3b não mexe em H nem na data do aviso
    expect(e3b.sql).toBe(
      `update ${T} set \`failure_notice_stage\` = ? where (${c("id")} = ? and ${c("failure_notice_stage")} = ? and ${c("status")} in (?, ?))`,
    );
    expect(e3b.params).toEqual([2, "sp-1", 1, "retry", "needs_action"]);
  });
});

/* ════════════════════════════════════════════════════════════════
   Paragem dura e cancelamento
   ════════════════════════════════════════════════════════════════ */

/** Escudo do hóspede (C0/C8/C17): só guest_active_at, que nenhum claim do
 *  sweep ou do admin reescreve; NULL = sem escudo. */
const GUEST_SHIELD_SQL =
  `(${c("guest_active_at")} is null or ${c("guest_active_at")} <= ?)`;

describe("listHardStopDue", () => {
  it("por pagar com H vencido, exceto o hóspede a pagar na última hora (com os NULL a contar como 'não reclamada')", async () => {
    const { listHardStopDue } = await import("../db");
    fake.query.mockResolvedValueOnce(rows());
    await listHardStopDue(LIVE, NOW);
    const [q] = calls();
    expect(afterFrom(q)).toBe(
      `where (${SCOPE_SQL} and ${c("status")} in (?, ?, ?) and ${c("hard_stop_at")} <= ? and ${GUEST_SHIELD_SQL}) ` +
        `order by ${c("hard_stop_at")} asc`,
    );
    expect(q.params).toEqual([
      true, LIVE.siteOrigin, "scheduled", "retry", "needs_action", NOW_SQL, "2027-06-28 08:00:00.000",
    ]);
    expect(afterFrom(q)).not.toContain("claim_source");
    for (const never of ["needs_review", "paid_externally", "charging", "succeeded"]) expect(q.params).not.toContain(never);
  });
});

describe("claimScheduledPaymentForCancel", () => {
  it("→ cancelling a partir dos estados pedidos; a repetição falha", async () => {
    const { claimScheduledPaymentForCancel } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await claimScheduledPaymentForCancel("sp-1", ["retry", "needs_action", "retry"])).toBe(true);
    expect(await claimScheduledPaymentForCancel("sp-1", ["retry", "needs_action"])).toBe(false);
    const [u] = calls();
    expect(u.sql).toBe(`update ${T} set \`status\` = ? where (${c("id")} = ? and ${c("status")} in (?, ?))`);
    expect(u.params).toEqual(["cancelling", "sp-1", "retry", "needs_action"]);
  });

  it("com hardStopNow repete no WHERE a condição da paragem dura (H vencido, sem hóspede a pagar)", async () => {
    const { claimScheduledPaymentForCancel } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await claimScheduledPaymentForCancel("sp-1", ["retry", "needs_action"], { hardStopNow: NOW })).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`status\` = ? where (${c("id")} = ? and ${c("status")} in (?, ?) and ${c("hard_stop_at")} <= ? and ${GUEST_SHIELD_SQL})`,
    );
    expect(u.params).toEqual(["cancelling", "sp-1", "retry", "needs_action", NOW_SQL, "2027-06-28 08:00:00.000"]);
  });

  it("nunca a partir de charging nem de um cancelamento; lista vazia lança", async () => {
    const { claimScheduledPaymentForCancel } = await import("../db");
    for (const bad of ["charging", "cancelling", "cancelled_unpaid", "cancelled_by_guest"] as const) {
      await expect(claimScheduledPaymentForCancel("sp-1", ["retry", bad])).rejects.toThrow(/Nunca/);
    }
    await expect(claimScheduledPaymentForCancel("sp-1", [])).rejects.toThrow();
    expect(fake.query).not.toHaveBeenCalled();
  });

  it("o cancelamento do hóspede pode partir de uma linha já paga (succeeded)", async () => {
    const { claimScheduledPaymentForCancel } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await claimScheduledPaymentForCancel("sp-1", ["scheduled", "retry", "needs_action", "succeeded"])).toBe(true);
    expect(calls()[0].params).toEqual(["cancelling", "sp-1", "scheduled", "retry", "needs_action", "succeeded"]);
  });
});

describe("listCancelling", () => {
  it("lista as linhas em cancelling", async () => {
    const { listCancelling } = await import("../db");
    fake.query.mockResolvedValueOnce(rows());
    await listCancelling(LIVE);
    const [q] = calls();
    expect(afterFrom(q)).toBe(`where (${SCOPE_SQL} and ${c("status")} = ?) order by ${c("updated_at")} asc`);
    expect(q.params).toEqual([true, LIVE.siteOrigin, "cancelling"]);
  });
});

describe("markCancellingAsSucceeded", () => {
  it("só volta a succeeded se nada de irreversível foi reclamado no cancelamento", async () => {
    const { markCancellingAsSucceeded } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await markCancellingAsSucceeded("sp-1", "pi_bal", NOW)).toBe(true);
    expect(await markCancellingAsSucceeded("sp-1", "pi_bal", NOW)).toBe(false);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`status\` = ?, \`balance_payment_intent_id\` = ?, \`succeeded_at\` = ?, \`cancel_pis_claimed_at\` = ? ` +
        // succeeded_at IS NULL (C1): uma linha paga a cancelar nunca volta a succeeded.
        `where (${c("id")} = ? and ${c("status")} = ? and ${c("succeeded_at")} is null and ${c("guesty_cancel_claimed_at")} is null and ` +
        `${c("guesty_cancelled_at")} is null and ${c("refund_claimed_at")} is null and ${c("refund_id")} is null and ` +
        `${c("email_cancel_claimed_at")} is null)`,
    );
    expect(u.params).toEqual(["succeeded", "pi_bal", NOW_SQL, null, "sp-1", "cancelling"]);
    await expect(markCancellingAsSucceeded("sp-1", "", NOW)).rejects.toThrow();
  });
});

describe("ações do hóspede e marcas novas (ronda 2)", () => {
  it("setGuestPaymentIntent grava o PI e guest_active_at (o escudo de 60 min), só por pagar e antes de H", async () => {
    const { setGuestPaymentIntent } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await setGuestPaymentIntent("sp-1", "pi_g", NOW)).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`claimed_at\` = ?, \`claim_source\` = ?, \`guest_active_at\` = ?, \`guest_payment_intent_id\` = ? ` +
        `where (${c("id")} = ? and ${c("status")} in (?, ?, ?) and ${c("hard_stop_at")} > ?)`,
    );
    expect(u.params).toEqual([NOW_SQL, "guest", NOW_SQL, "pi_g", "sp-1", "scheduled", "retry", "needs_action", NOW_SQL]);
    await expect(setGuestPaymentIntent("sp-1", "", NOW)).rejects.toThrow();
  });

  it("markGuestActive (troca de cartão): só guest_active_at, por pagar e antes de H", async () => {
    const { markGuestActive } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await markGuestActive("sp-1", NOW)).toBe(true);
    expect(await markGuestActive("sp-1", NOW)).toBe(false);
    const [u] = calls();
    expect(u.sql).toBe(`update ${T} set \`guest_active_at\` = ? where (${c("id")} = ? and ${c("status")} in (?, ?, ?) and ${c("hard_stop_at")} > ?)`);
    expect(u.params).toEqual([NOW_SQL, "sp-1", "scheduled", "retry", "needs_action", NOW_SQL]);
  });

  it("markReviewAsSucceeded: needs_review → succeeded com o PI (C17), só de needs_review", async () => {
    const { markReviewAsSucceeded } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await markReviewAsSucceeded("sp-1", "pi_g", NOW)).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`status\` = ?, \`balance_payment_intent_id\` = ?, \`succeeded_at\` = ? ` +
        `where (${c("id")} = ? and ${c("status")} = ? and ${c("succeeded_at")} is null)`,
    );
    expect(u.params).toEqual(["succeeded", "pi_g", NOW_SQL, "sp-1", "needs_review"]);
    await expect(markReviewAsSucceeded("sp-1", "", NOW)).rejects.toThrow();
  });

  it("setSmsStage: grava o estágio do SMS enviado e só sobe", async () => {
    const { setSmsStage } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await setSmsStage("sp-1", 2)).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(`update ${T} set \`sms_stage\` = ? where (${c("id")} = ? and ${c("sms_stage")} < ?)`);
    expect(u.params).toEqual([2, "sp-1", 2]);
    await expect(setSmsStage("sp-1", 3 as any)).rejects.toThrow();
  });

  it("markRefundManual: só de um reembolso falhado para 'manual' (C26); nunca por cima de um feito, em curso ou nada", async () => {
    const { markRefundManual } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await markRefundManual("sp-1")).toBe(true);
    expect(await markRefundManual("sp-1")).toBe(false);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`refund_status\` = ? where (${c("id")} = ? and ${c("refund_status")} is not null and ${c("refund_status")} not in (?, ?, ?, ?))`,
    );
    expect(u.params).toEqual(["manual", "sp-1", "succeeded", "pending", "nothing", "manual"]);
  });

  describe("markRefundFailed (refund.failed da Stripe)", () => {
    const updates = () => calls().filter((x) => x.sql.startsWith("update"));

    it("1.ª falha: valor e id da falha, condicional ao que foi lido", async () => {
      const { markRefundFailed } = await import("../db");
      fake.query.mockResolvedValueOnce(rows(["re_A", 100_000, "succeeded"])).mockResolvedValueOnce(ok(1));
      expect(await markRefundFailed("sp-1", { refundId: "re_A", refundCents: 60_000 })).toBe("marked");
      const [u] = updates();
      expect(u.sql).toBe(
        `update ${T} set \`refund_id\` = ?, \`refund_cents\` = ?, \`refund_status\` = ? where (${c("id")} = ? and ${c("refund_id")} = ? and ${c("refund_status")} = ?)`,
      );
      expect(u.params).toEqual(["re_A", 60_000, "failed", "sp-1", "re_A", "succeeded"]);
    });

    it("2.ª falha (a outra parte): soma os valores e guarda os dois ids", async () => {
      const { markRefundFailed } = await import("../db");
      fake.query.mockResolvedValueOnce(rows(["re_A", 60_000, "failed"])).mockResolvedValueOnce(ok(1));
      expect(await markRefundFailed("sp-1", { refundId: "re_B", refundCents: 40_000 })).toBe("marked");
      expect(updates()[0].params.slice(0, 3)).toEqual(["re_A,re_B", 100_000, "failed"]);
    });

    it("evento repetido: nada muda, nem desfaz o 'manual' do CS", async () => {
      const { markRefundFailed } = await import("../db");
      fake.query.mockResolvedValueOnce(rows(["re_A,re_B", 100_000, "manual"])).mockResolvedValueOnce(rows(["re_A", 60_000, "failed"]));
      expect(await markRefundFailed("sp-1", { refundId: "re_A", refundCents: 60_000 })).toBe("unchanged");
      expect(await markRefundFailed("sp-1", { refundId: "re_A", refundCents: 60_000 })).toBe("unchanged");
      expect(updates()).toHaveLength(0);
    });

    it("falha nova depois do 'manual': reabre só com o valor novo", async () => {
      const { markRefundFailed } = await import("../db");
      fake.query.mockResolvedValueOnce(rows(["re_A", 60_000, "manual"])).mockResolvedValueOnce(ok(1));
      expect(await markRefundFailed("sp-1", { refundId: "re_C", refundCents: 10_000 })).toBe("marked");
      expect(updates()[0].params.slice(0, 3)).toEqual(["re_C", 10_000, "failed"]);
    });

    it("linha inexistente → missing; outra escrita pelo meio → conflict", async () => {
      const { markRefundFailed } = await import("../db");
      fake.query.mockResolvedValueOnce(rows()).mockResolvedValueOnce(rows([null, null, null])).mockResolvedValueOnce(ok(0));
      expect(await markRefundFailed("sp-x", { refundId: "re_A", refundCents: 1 })).toBe("missing");
      expect(await markRefundFailed("sp-1", { refundId: "re_A", refundCents: 1 })).toBe("conflict");
      expect(updates()[0].sql).toContain(`${c("refund_id")} is null and ${c("refund_status")} is null`);
    });

    it("sem BD lança (o webhook responde 500 e a Stripe reenvia)", async () => {
      const { markRefundFailed } = await import("../db");
      fake.preview.mockReturnValue(true);
      await expect(markRefundFailed("sp-1", { refundId: "re_A", refundCents: 1 })).rejects.toThrow(/BD/);
    });
  });

  it("sem BD devolvem false sem consultar", async () => {
    const d = await import("../db");
    fake.preview.mockReturnValue(true);
    expect(await d.markGuestActive("sp-1", NOW)).toBe(false);
    expect(await d.markReviewAsSucceeded("sp-1", "pi", NOW)).toBe(false);
    expect(await d.setSmsStage("sp-1", 1)).toBe(false);
    expect(await d.markRefundManual("sp-1")).toBe(false);
    expect(fake.query).not.toHaveBeenCalled();
  });
});

describe("claimEffect", () => {
  it("ganha com a coluna vazia ou com um claim anterior há mais de 30 min", async () => {
    const { claimEffect } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await claimEffect("sp-1", "guestyBalanceClaimedAt", NOW)).toBe(true);
    expect(await claimEffect("sp-1", "guestyBalanceClaimedAt", NOW)).toBe(false);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`guesty_balance_claimed_at\` = ? where (${c("id")} = ? and ` +
        `(${c("guesty_balance_claimed_at")} is null or ${c("guesty_balance_claimed_at")} < ?))`,
    );
    expect(u.params).toEqual([NOW_SQL, "sp-1", "2027-06-28 08:30:00.000"]);
  });

  it("staleMs à escolha; null (ou Infinity) = uma vez só", async () => {
    const { claimEffect } = await import("../db");
    fake.query.mockResolvedValue(ok(1));
    await claimEffect("sp-1", "refundClaimedAt", NOW, 60 * 60_000);
    await claimEffect("sp-1", "emailPaidClaimedAt", NOW, null);
    await claimEffect("sp-1", "emailCancelClaimedAt", NOW, Infinity);
    const [refund, once, inf] = calls();
    expect(refund.params).toEqual([NOW_SQL, "sp-1", "2027-06-28 08:00:00.000"]);
    expect(once.sql).toBe(`update ${T} set \`email_paid_claimed_at\` = ? where (${c("id")} = ? and ${c("email_paid_claimed_at")} is null)`);
    expect(once.params).toEqual([NOW_SQL, "sp-1"]);
    expect(inf.sql).toBe(`update ${T} set \`email_cancel_claimed_at\` = ? where (${c("id")} = ? and ${c("email_cancel_claimed_at")} is null)`);
  });

  it("cada coluna do contrato vai para a sua coluna SQL", async () => {
    const { claimEffect } = await import("../db");
    fake.query.mockResolvedValue(ok(1));
    const map = {
      guestyBalanceClaimedAt: "guesty_balance_claimed_at",
      noteClaimedAt: "note_claimed_at",
      emailPaidClaimedAt: "email_paid_claimed_at",
      cancelPisClaimedAt: "cancel_pis_claimed_at",
      guestyCancelClaimedAt: "guesty_cancel_claimed_at",
      refundClaimedAt: "refund_claimed_at",
      emailCancelClaimedAt: "email_cancel_claimed_at",
    } as const;
    for (const col of Object.keys(map) as Array<keyof typeof map>) await claimEffect("sp-1", col, NOW);
    expect(calls().map((q) => /^update `checkout_scheduled_payments` set `(\w+)` = \?/.exec(q.sql)?.[1])).toEqual(Object.values(map));
  });

  it("coluna fora da lista ou staleMs inválido lançam", async () => {
    const { claimEffect } = await import("../db");
    await expect(claimEffect("sp-1", "status" as any, NOW)).rejects.toThrow(/Coluna/);
    await expect(claimEffect("sp-1", "guestyDepositRecordedAt" as any, NOW)).rejects.toThrow(/Coluna/);
    await expect(claimEffect("sp-1", "noteClaimedAt", NOW, -1)).rejects.toThrow(/staleMs/);
    await expect(claimEffect("sp-1", "noteClaimedAt", NOW, Number.NaN)).rejects.toThrow(/staleMs/);
    expect(fake.query).not.toHaveBeenCalled();
  });
});

describe("marcas do Guesty, reembolso e fim do cancelamento", () => {
  it("registo do saldo e cancelamento no Guesty: o primeiro registo é o que vale", async () => {
    const { markGuestyBalanceRecorded, markGuestyCancelled } = await import("../db");
    fake.query.mockResolvedValue(ok(1));
    await markGuestyBalanceRecorded("sp-1", NOW);
    await markGuestyCancelled("sp-1", NOW);
    const [bal, cancel] = calls();
    expect(bal.sql).toBe(`update ${T} set \`guesty_balance_recorded_at\` = ? where (${c("id")} = ? and ${c("guesty_balance_recorded_at")} is null)`);
    expect(bal.params).toEqual([NOW_SQL, "sp-1"]);
    expect(cancel.sql).toBe(`update ${T} set \`guesty_cancelled_at\` = ? where (${c("id")} = ? and ${c("guesty_cancelled_at")} is null)`);
  });

  it("markRefund grava o reembolso; um 'nada a devolver' nunca apaga um reembolso já gravado", async () => {
    const { markRefund } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await markRefund("sp-1", { refundId: "re_1", refundCents: 126_200, refundStatus: "succeeded" })).toBe(true);
    expect(await markRefund("sp-1", { refundId: null, refundCents: 0, refundStatus: "nothing" })).toBe(false);
    const [real, nothing] = calls();
    expect(real.sql).toBe(`update ${T} set \`refund_id\` = ?, \`refund_cents\` = ?, \`refund_status\` = ? where ${c("id")} = ?`);
    expect(real.params).toEqual(["re_1", 126_200, "succeeded", "sp-1"]);
    expect(nothing.sql).toBe(
      `update ${T} set \`refund_id\` = ?, \`refund_cents\` = ?, \`refund_status\` = ? where (${c("id")} = ? and ${c("refund_id")} is null)`,
    );
    expect(nothing.params).toEqual([null, 0, "nothing", "sp-1"]);
    await expect(markRefund("sp-1", { refundId: "re_1", refundCents: 12.5, refundStatus: "succeeded" })).rejects.toThrow(/cêntimos/);
    await expect(markRefund("sp-1", { refundId: "re_1", refundCents: -1, refundStatus: "succeeded" })).rejects.toThrow(/cêntimos/);
  });

  it("estados finais só a partir de cancelling; a repetição falha", async () => {
    const { markCancelledUnpaid, markCancelledByGuest } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(1)).mockResolvedValueOnce(ok(0));
    expect(await markCancelledUnpaid("sp-1", NOW)).toBe(true);
    expect(await markCancelledByGuest("sp-2", NOW)).toBe(true);
    expect(await markCancelledUnpaid("sp-1", NOW)).toBe(false);
    const [unpaid, guest] = calls();
    expect(unpaid.sql).toBe(`update ${T} set \`status\` = ?, \`cancelled_at\` = ? where (${c("id")} = ? and ${c("status")} = ?)`);
    expect(unpaid.params).toEqual(["cancelled_unpaid", NOW_SQL, "sp-1", "cancelling"]);
    expect(guest.params).toEqual(["cancelled_by_guest", NOW_SQL, "sp-2", "cancelling"]);
  });
});

/* ════════════════════════════════════════════════════════════════
   Pós-cobrança e reconciliação
   ════════════════════════════════════════════════════════════════ */

describe("listPostChargeIncomplete", () => {
  it("succeeded com registo Guesty, nota ou E4 por fazer", async () => {
    const { listPostChargeIncomplete } = await import("../db");
    fake.query.mockResolvedValueOnce(rows());
    await listPostChargeIncomplete(LIVE);
    const [q] = calls();
    expect(afterFrom(q)).toBe(
      `where (${SCOPE_SQL} and ${c("status")} = ? and (${c("guesty_balance_recorded_at")} is null or ` +
        `${c("note_claimed_at")} is null or ${c("email_paid_claimed_at")} is null)) order by ${c("succeeded_at")} asc`,
    );
    expect(q.params).toEqual([true, LIVE.siteOrigin, "succeeded"]);
  });
});

describe("reconciliação com o Guesty", () => {
  it("lista as abertas com ação próxima ou fotografia velha, as menos recentes primeiro", async () => {
    const { listForReconciliation } = await import("../db");
    fake.query.mockResolvedValue(rows());
    const actionBefore = new Date("2027-06-29T09:00:00Z");
    const staleBefore = new Date("2027-06-27T09:00:00Z");
    await listForReconciliation(LIVE, { actionBefore, staleBefore });
    await listForReconciliation(LIVE, { actionBefore, staleBefore, limit: 10 });
    const [q, limited] = calls();
    expect(afterFrom(q)).toBe(
      `where (${SCOPE_SQL} and ${c("status")} in (?, ?, ?, ?) and (${c("next_attempt_at")} <= ? or ${c("hard_stop_at")} <= ? ` +
        `or ${c("last_reconciled_at")} is null or ${c("last_reconciled_at")} < ?)) ` +
        `order by ${c("last_reconciled_at")} asc, ${c("next_attempt_at")} asc limit ?`,
    );
    expect(q.params).toEqual([
      true, LIVE.siteOrigin, "scheduled", "retry", "needs_action", "needs_review",
      dt(actionBefore), dt(actionBefore), dt(staleBefore), 100,
    ]);
    expect(limited.params.at(-1)).toBe(10);
  });

  it("applyReconciliation grava a fotografia válida e limpa o erro", async () => {
    const { applyReconciliation } = await import("../db");
    fake.query.mockResolvedValueOnce(ok(1));
    expect(await applyReconciliation("sp-1", {
      guestyStatus: "confirmed", guestyCheckIn: "2027-07-15", guestyCheckOut: "2027-07-22", guestyListingId: "lst-1",
      guestyTotalCents: 240_000.0000001, guestyTotalPaidCents: 120_000, guestyPendingForeignCents: 0, error: null,
    }, NOW)).toBe(true);
    const [u] = calls();
    expect(u.sql).toBe(
      `update ${T} set \`guesty_status\` = ?, \`guesty_check_in\` = ?, \`guesty_check_out\` = ?, \`guesty_listing_id\` = ?, ` +
        `\`guesty_total_cents\` = ?, \`guesty_total_paid_cents\` = ?, \`guesty_pending_foreign_cents\` = ?, ` +
        `\`last_reconciled_at\` = ?, \`last_reconcile_error\` = ? where ${c("id")} = ?`,
    );
    expect(u.params).toEqual(["confirmed", "2027-07-15", "2027-07-22", "lst-1", 240_000, 120_000, 0, NOW_SQL, null, "sp-1"]);
  });

  it("leitura falhada (error preenchido): só o erro, sem apagar a última fotografia nem refrescar last_reconciled_at", async () => {
    const { applyReconciliation, markReconcileError } = await import("../db");
    fake.query.mockResolvedValue(ok(1));
    expect(await applyReconciliation("sp-1", {
      guestyStatus: null, guestyCheckIn: null, guestyCheckOut: null, guestyListingId: null,
      guestyTotalCents: null, guestyTotalPaidCents: null, guestyPendingForeignCents: null, error: "leitura invalida",
    }, NOW)).toBe(true);
    expect(await markReconcileError("sp-1", "x".repeat(700))).toBe(true);
    const [failed, direct] = calls();
    expect(failed.sql).toBe(`update ${T} set \`last_reconcile_error\` = ? where ${c("id")} = ?`);
    expect(failed.params).toEqual(["leitura invalida", "sp-1"]);
    expect(Array.from(direct.params[0] as string)).toHaveLength(500);
  });

  it("um valor estragado (NaN) lança em vez de ficar gravado como leitura válida", async () => {
    const { applyReconciliation } = await import("../db");
    await expect(applyReconciliation("sp-1", {
      guestyStatus: "confirmed", guestyCheckIn: null, guestyCheckOut: null, guestyListingId: null,
      guestyTotalCents: Number.NaN, guestyTotalPaidCents: 0, guestyPendingForeignCents: 0,
    }, NOW)).rejects.toThrow(/guestyTotalCents/);
    expect(fake.query).not.toHaveBeenCalled();
  });
});

/* ════════════════════════════════════════════════════════════════
   Leituras por id e por PI
   ════════════════════════════════════════════════════════════════ */

describe("getScheduledPaymentById e getScheduledPaymentByBalancePi", () => {
  it("por id, com os instantes em UTC", async () => {
    const { getScheduledPaymentById } = await import("../db");
    fake.query.mockResolvedValueOnce(rows(scheduledRow({
      id: "sp-1", livemode: 1, status: "retry", hardStopAt: "2027-07-05 11:00:00", creditNoteDue: 0, attempts: 2,
    })));
    const row = await getScheduledPaymentById("sp-1");
    expect(row).toMatchObject({ id: "sp-1", livemode: true, status: "retry", attempts: 2, hardStopAt: new Date("2027-07-05T11:00:00Z") });
    expect(afterFrom(calls()[0])).toBe(`where ${c("id")} = ? limit ?`);
    fake.query.mockResolvedValueOnce(rows());
    expect(await getScheduledPaymentById("missing")).toBeNull();
  });

  it("por PI: procura no PI do sweep e no do hóspede; duas linhas com o mesmo PI lança", async () => {
    const { getScheduledPaymentByBalancePi } = await import("../db");
    fake.query.mockResolvedValueOnce(rows(scheduledRow({ id: "sp-1", livemode: 1, creditNoteDue: 0 })));
    expect((await getScheduledPaymentByBalancePi("pi_bal"))?.id).toBe("sp-1");
    const [q] = calls();
    expect(afterFrom(q)).toBe(`where (${c("balance_payment_intent_id")} = ? or ${c("guest_payment_intent_id")} = ?) limit ?`);
    expect(q.params).toEqual(["pi_bal", "pi_bal", 2]);
    fake.query.mockResolvedValueOnce(rows(
      scheduledRow({ id: "sp-1", livemode: 1, creditNoteDue: 0 }),
      scheduledRow({ id: "sp-2", livemode: 1, creditNoteDue: 0 }),
    ));
    await expect(getScheduledPaymentByBalancePi("pi_bal")).rejects.toThrow(/mais de uma/);
    expect(await getScheduledPaymentByBalancePi("")).toBeNull();
  });

  it("sem BD devolvem null; erro de BD propaga", async () => {
    const { getScheduledPaymentById, getScheduledPaymentByBalancePi } = await import("../db");
    fake.query.mockRejectedValueOnce(new Error("boom"));
    await expect(getScheduledPaymentById("sp-1")).rejects.toThrow();
    fake.preview.mockReturnValue(true);
    expect(await getScheduledPaymentById("sp-1")).toBeNull();
    expect(await getScheduledPaymentByBalancePi("pi_1")).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════
   Digest
   ════════════════════════════════════════════════════════════════ */

describe("listBalanceDigest", () => {
  it("contagens por estado (todos os estados presentes, mesmo a 0) e as secções, todas no scope", async () => {
    const { listBalanceDigest } = await import("../db");
    fake.query
      .mockResolvedValueOnce(rows(["scheduled", 3], ["needs_review", 1]))
      .mockResolvedValueOnce(rows(scheduledRow({ id: "sp-up", livemode: 1, creditNoteDue: 0, status: "scheduled" })))
      .mockResolvedValue(rows());
    const digest = await listBalanceDigest(LIVE, NOW);
    expect(digest.counts).toEqual({
      scheduled: 3, charging: 0, retry: 0, needs_action: 0, succeeded: 0, paid_externally: 0,
      needs_review: 1, cancelling: 0, cancelled_unpaid: 0, cancelled_by_guest: 0,
    });
    expect(digest.upcoming7d.map((r) => r.id)).toEqual(["sp-up"]);

    const qs = calls();
    expect(qs).toHaveLength(9);
    for (const q of qs) expect(q.params.slice(0, 2)).toEqual([true, LIVE.siteOrigin]);
    expect(qs[0].sql).toBe(`select \`status\`, count(*) from ${T} where (${SCOPE_SQL}) group by ${c("status")}`);
    expect(afterFrom(qs[1])).toBe(`where (${SCOPE_SQL} and ${c("status")} = ? and ${c("charge_at")} <= ?) order by ${c("charge_at")} asc`);
    expect(qs[1].params).toEqual([true, LIVE.siteOrigin, "scheduled", "2027-07-05 09:00:00.000"]);
    expect(afterFrom(qs[2])).toBe(`where (${SCOPE_SQL} and ${c("status")} in (?, ?)) order by ${c("hard_stop_at")} asc`);
    expect(afterFrom(qs[3])).toBe(`where (${SCOPE_SQL} and ${c("status")} = ?) order by ${c("review_due_at")} asc`);
    expect(afterFrom(qs[4])).toBe(
      `where (${SCOPE_SQL} and ${c("status")} in (?, ?) and ${c("cancelled_at")} >= ?) order by ${c("cancelled_at")} desc`,
    );
    expect(qs[4].params).toEqual([true, LIVE.siteOrigin, "cancelled_unpaid", "cancelled_by_guest", "2027-06-27 09:00:00.000"]);
    expect(qs[5].params).toEqual([true, LIVE.siteOrigin, "succeeded"]);
    expect(qs[6].params).toEqual([true, LIVE.siteOrigin, "charging", "2027-06-28 08:30:00.000"]);
    expect(afterFrom(qs[7])).toBe(
      `where (${SCOPE_SQL} and ${c("status")} = ? and ${c("updated_at")} < (CURRENT_TIMESTAMP - INTERVAL 30 MINUTE)) ` +
        `order by ${c("updated_at")} asc`,
    );
    // C26: reembolsos falhados de qualquer estado e de qualquer data (sem
    // filtro de status nem de cancelled_at), fora dos resultados resolvidos.
    expect(afterFrom(qs[8])).toBe(
      `where (${SCOPE_SQL} and ${c("refund_status")} is not null and ${c("refund_status")} not in (?, ?, ?, ?)) ` +
        `order by ${c("cancelled_at")} asc`,
    );
    expect(qs[8].params).toEqual([true, LIVE.siteOrigin, "succeeded", "pending", "nothing", "manual"]);
    expect(digest.refundFailures).toEqual([]);
  });

  it("sem BD: digest vazio com todas as contagens a 0; erro de BD propaga (nunca 'nada a fazer' por engano)", async () => {
    const { listBalanceDigest } = await import("../db");
    fake.query.mockRejectedValueOnce(new Error("boom"));
    await expect(listBalanceDigest(LIVE, NOW)).rejects.toThrow();
    fake.preview.mockReturnValue(true);
    const digest = await listBalanceDigest(LIVE, NOW);
    expect(Object.values(digest.counts)).toHaveLength(10);
    expect(Object.values(digest.counts).every((n) => n === 0)).toBe(true);
    expect(digest).toMatchObject({
      upcoming7d: [], failing: [], review: [], cancelled24h: [], postChargeIncomplete: [], stuckCharging: [], stuckCancelling: [], refundFailures: [],
    });
  });
});

/* ════════════════════════════════════════════════════════════════
   Heartbeat do sweep (app_config)
   ════════════════════════════════════════════════════════════════ */

describe("heartbeat do sweep", () => {
  const INSERT =
    "INSERT INTO `app_config` (`k`, `v`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `v` = VALUES(`v`)";
  // Erro do driver; o drizzle embrulha-o num "Failed query" com ele em .cause.
  const noTable = () =>
    Object.assign(new Error("Table 'pa.app_config' doesn't exist"), { code: "ER_NO_SUCH_TABLE", errno: 1146 });

  it("grava balance_sweep_last_run_at em ISO; um sweep de teste escreve noutra chave", async () => {
    const { setBalanceHeartbeat } = await import("../db");
    fake.query.mockResolvedValue(ok(1));
    expect(await setBalanceHeartbeat(NOW)).toBe(true);
    expect(await setBalanceHeartbeat(NOW, LIVE)).toBe(true);
    expect(await setBalanceHeartbeat(NOW, TEST)).toBe(true);
    const [plain, live, test] = calls();
    expect(plain.sql).toBe(INSERT);
    expect(plain.params).toEqual(["balance_sweep_last_run_at", "2027-06-28T09:00:00.000Z"]);
    expect(live.params[0]).toBe("balance_sweep_last_run_at");
    expect(test.params[0]).toBe("balance_sweep_last_run_at_test");
  });

  it("sem a tabela app_config cria-a (o mesmo DDL do webhook) e grava", async () => {
    const { setBalanceHeartbeat } = await import("../db");
    fake.query.mockRejectedValueOnce(noTable()).mockResolvedValue(ok(1));
    expect(await setBalanceHeartbeat(NOW)).toBe(true);
    const [first, ddl, retry] = calls();
    expect(first.sql).toBe(INSERT);
    expect(ddl.sql).toBe(
      "CREATE TABLE IF NOT EXISTS `app_config` (`k` varchar(128) NOT NULL PRIMARY KEY, `v` text NOT NULL, " +
        "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)",
    );
    expect(retry.sql).toBe(INSERT);
  });

  it("nunca lança: outro erro, ou a criação falhada, devolvem false", async () => {
    const { setBalanceHeartbeat } = await import("../db");
    fake.query.mockRejectedValueOnce(new Error("Lock wait timeout exceeded"));
    expect(await setBalanceHeartbeat(NOW)).toBe(false);
    expect(fake.query).toHaveBeenCalledTimes(1);
    fake.query.mockRejectedValueOnce(noTable()).mockRejectedValueOnce(new Error("CREATE command denied"));
    expect(await setBalanceHeartbeat(NOW)).toBe(false);
    expect(error).toHaveBeenCalled();
    fake.preview.mockReturnValue(true);
    expect(await setBalanceHeartbeat(NOW)).toBe(false);
  });

  it("lê a última passagem; sem valor, valor ilegível, sem tabela, erro ou sem BD → null", async () => {
    const { getBalanceHeartbeat } = await import("../db");
    fake.query.mockResolvedValueOnce([[{ v: "2027-06-28T09:00:00.000Z" }], []]);
    expect(await getBalanceHeartbeat()).toEqual(NOW);
    const [q] = calls();
    expect(q.sql).toBe("SELECT `v` FROM `app_config` WHERE `k` = ? LIMIT 1");
    expect(q.params).toEqual(["balance_sweep_last_run_at"]);

    fake.query.mockResolvedValueOnce([[{ v: "2027-06-28T09:00:00.000Z" }], []]);
    await getBalanceHeartbeat(TEST);
    expect(calls()[1].params).toEqual(["balance_sweep_last_run_at_test"]);

    fake.query.mockResolvedValueOnce([[], []]);
    expect(await getBalanceHeartbeat()).toBeNull();
    fake.query.mockResolvedValueOnce([[{ v: "ontem" }], []]);
    expect(await getBalanceHeartbeat()).toBeNull();
    fake.query.mockRejectedValueOnce(noTable());
    expect(await getBalanceHeartbeat()).toBeNull();
    fake.query.mockRejectedValueOnce(new Error("boom"));
    expect(await getBalanceHeartbeat()).toBeNull();
    fake.preview.mockReturnValue(true);
    expect(await getBalanceHeartbeat()).toBeNull();
  });
});
