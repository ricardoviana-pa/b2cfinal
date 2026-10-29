/**
 * Relatório do funil (scripts/checkout-funnel-report.ts): janela, rascunhos
 * repetidos e testes internos, sem base de dados.
 */
import { describe, expect, it } from "vitest";
import {
  DUPLICATE_DRAFT_WINDOW_MS,
  duplicateDraftIds,
  funnelCounts,
  funnelLine,
  funnelPair,
  funnelRowSets,
  funnelWindowStart,
  isDraftIntent,
  isInternalIntent,
  type FunnelRow,
} from "./checkout-funnel";

const MIN = 60_000;
const DAY = 86_400_000;
const T0 = Date.parse("2026-10-20T10:00:00Z");
let n = 0;
const row = (over: Partial<FunnelRow> & { at?: number } = {}): FunnelRow => {
  const { at, ...rest } = over;
  n += 1;
  return { id: `intent-${String(n).padStart(3, "0")}`, listingId: "casa-a", status: "draft", email: null,
    reception: null, paymentIntentId: null, createdAt: new Date(at ?? T0), ...rest };
};

describe("janela do relatório: nunca antes de 17 set 2026 (o DEV escrevia na tabela até 16 set)", () => {
  it("DAYS=60 a 29 out começaria a 30 ago: encurta para a meia-noite de Lisboa de 17 set", () => {
    const w = funnelWindowStart({ days: 60, now: new Date("2026-10-29T12:00:00Z") });
    expect(w).toEqual({ start: new Date("2026-09-16T23:00:00.000Z"), clamped: true, explicit: false });
  });
  it("uma janela toda depois de 17 set fica como pedida", () => {
    const now = new Date("2026-10-29T12:00:00Z");
    const w = funnelWindowStart({ days: 30, now });
    expect(w).toEqual({ start: new Date(now.getTime() - 30 * DAY), clamped: false, explicit: false });
  });
  it("SINCE explícito: essa data, à meia-noite de Lisboa, mesmo antes de 17 set", () => {
    expect(funnelWindowStart({ days: 60, since: "2026-10-01" })).toEqual({ start: new Date("2026-09-30T23:00:00.000Z"), clamped: false, explicit: true });
    expect(funnelWindowStart({ days: 60, since: "2026-08-01" }).start).toEqual(new Date("2026-07-31T23:00:00.000Z"));
    // Inverno (WET, UTC+0): a meia-noite de Lisboa é a meia-noite UTC.
    expect(funnelWindowStart({ days: 60, since: "2026-12-01" }).start).toEqual(new Date("2026-12-01T00:00:00.000Z"));
  });
  it("valores inválidos falham alto em vez de ler a tabela toda", () => {
    expect(() => funnelWindowStart({ days: 60, since: "01/10/2026" })).toThrow(/SINCE/);
    expect(() => funnelWindowStart({ days: Number.NaN })).toThrow(/DAYS/);
    expect(() => funnelWindowStart({ days: 0 })).toThrow(/DAYS/);
  });
});

describe("testes internos e rascunhos", () => {
  it("interno é o email da equipa ou de teste; sem email não se sabe", () => {
    expect(isInternalIntent({ email: "ana@portugalactive.com" })).toBe(true);
    expect(isInternalIntent({ email: "teste.checkout@gmail.com" })).toBe(true);
    expect(isInternalIntent({ email: "guest@example.org" })).toBe(true);
    expect(isInternalIntent({ email: "maria@gmail.com" })).toBe(false);
    expect(isInternalIntent({ email: null })).toBe(false);
  });
  it("rascunho = ainda sem email", () => {
    expect(isDraftIntent({ status: "draft", email: null })).toBe(true);
    expect(isDraftIntent({ status: "contact_captured", email: "maria@gmail.com" })).toBe(false);
    expect(isDraftIntent({ status: "payment_pending", email: "maria@gmail.com" })).toBe(false);
  });
});

describe("rascunhos repetidos: outro checkout da mesma casa nos 60 minutos seguintes", () => {
  it("o rascunho antigo sai, o checkout seguinte fica", () => {
    const old = row({ at: T0 });
    const next = row({ at: T0 + 20 * MIN, status: "contact_captured", email: "maria@gmail.com" });
    expect(duplicateDraftIds([next, old])).toEqual(new Set([old.id]));
  });
  it("dois rascunhos seguidos contam uma pessoa, não zero", () => {
    const a = row({ at: T0 });
    const b = row({ at: T0 + 5 * MIN });
    expect(duplicateDraftIds([a, b])).toEqual(new Set([a.id]));
  });
  it("uma série de cliques deixa só o último", () => {
    const xs = [0, 10, 30, 85].map((m) => row({ at: T0 + m * MIN }));
    // 0→10 e 10→30 repetidos; 30→85 já são 55 minutos: também; 85 é o último.
    expect(duplicateDraftIds(xs)).toEqual(new Set([xs[0].id, xs[1].id, xs[2].id]));
  });
  it("exatamente 60 minutos ainda conta; um minuto depois já não", () => {
    const a = row({ at: T0 });
    const b = row({ at: T0 + DUPLICATE_DRAFT_WINDOW_MS, status: "paid", email: "maria@gmail.com" });
    expect(duplicateDraftIds([a, b])).toEqual(new Set([a.id]));
    const c = row({ at: T0 });
    const d = row({ at: T0 + DUPLICATE_DRAFT_WINDOW_MS + MIN });
    expect(duplicateDraftIds([c, d]).size).toBe(0);
  });
  it("outra casa, ou um checkout ANTES do rascunho, não o torna repetido", () => {
    const before = row({ at: T0 - 10 * MIN, status: "contact_captured", email: "maria@gmail.com" });
    const draft = row({ at: T0 });
    const otherHome = row({ at: T0 + 5 * MIN, listingId: "casa-b" });
    expect(duplicateDraftIds([before, draft, otherHome]).size).toBe(0);
  });
  it("só os rascunhos saem: quem deixou email nunca é repetido", () => {
    const withEmail = row({ at: T0, status: "contact_captured", email: "maria@gmail.com" });
    const later = row({ at: T0 + 5 * MIN });
    expect(duplicateDraftIds([withEmail, later]).size).toBe(0);
  });
  it("empates no mesmo instante decidem-se pelo id: sai sempre um, nunca os dois", () => {
    const a = row({ at: T0, id: "intent-a" });
    const b = row({ at: T0, id: "intent-b" });
    expect(duplicateDraftIds([b, a])).toEqual(new Set(["intent-a"]));
  });
});

describe("os dois funis: em bruto e sem repetidos", () => {
  const now = T0 + 3 * DAY;
  it("internos fora dos dois; repetidos só fora do limpo; as últimas 24 h ficam de fora das taxas", () => {
    const repeated = row({ at: T0 });
    const kept = row({ at: T0 + 15 * MIN, status: "payment_pending", email: "maria@gmail.com", reception: { type: "self" } });
    const internalDraft = row({ at: T0 + DAY, listingId: "casa-b" });
    const internal = row({ at: T0 + DAY + 10 * MIN, listingId: "casa-b", status: "contact_captured", email: "qa@portugalactive.com" });
    const lone = row({ at: T0 + DAY, listingId: "casa-c" });
    // Recente (menos de 24 h): fora das taxas, mas torna o rascunho de casa-d repetido.
    const oldDraft = row({ at: now - 24.5 * 3_600_000, listingId: "casa-d" });
    const fresh = row({ at: now - 24.5 * 3_600_000 + 40 * MIN, listingId: "casa-d", status: "contact_captured", email: "joao@gmail.com" });
    const paid = row({ at: T0 + 2 * MIN, listingId: "casa-e", status: "paid", email: "rita@gmail.com", paymentIntentId: "pi_1" });
    const all = [repeated, kept, internalDraft, internal, lone, oldDraft, fresh, paid];
    const sets = funnelRowSets(all, { now });
    expect(sets.internal).toBe(1);
    expect(sets.raw.map((r) => r.id).sort()).toEqual([repeated, kept, internalDraft, lone, oldDraft, paid].map((r) => r.id).sort());
    expect(sets.clean.map((r) => r.id).sort()).toEqual([kept, lone, paid].map((r) => r.id).sort());
    expect(sets.duplicates).toBe(3);
    expect(funnelCounts(sets.raw)).toEqual({ intent: 6, email: 2, reception: 2, payment: 2, paid: 1 });
    expect(funnelCounts(sets.clean)).toEqual({ intent: 3, email: 2, reception: 2, payment: 2, paid: 1 });
  });

  it("a linha do relatório mantém o formato de sempre, e o par imprime os dois funis por segmento", () => {
    expect(funnelLine("Todos", { intent: 135, email: 55, reception: 48, payment: 42, paid: 20 })).toBe(
      "Todos                       135 → email   55 (41%) → receção   48 (87%) → pagamento   42 (88%) → pago  20 (48%)  | total 15%",
    );
    const raw = [row({ at: T0 }), row({ at: T0 + MIN, status: "paid", email: "rita@gmail.com" })];
    const lines = funnelPair("Todos", raw, raw.slice(1));
    expect(lines[0]).toBe("Todos");
    expect(lines[1]).toMatch(/^ {2}em bruto\s+2 → email {4}1 \(50%\)/);
    expect(lines[2]).toMatch(/^ {2}sem repetidos\s+1 → email {4}1 \(100%\)/);
    expect(funnelPair("PT", raw, raw, (r) => r.status === "paid")[1]).toMatch(/^ {2}em bruto\s+1 →/);
  });
});
