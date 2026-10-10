import { describe, expect, it } from "vitest";
import {
  applyDayClick,
  buildRangeRules,
  dayRole,
  type DayRule,
  type RangeSelection,
} from "../client/src/lib/dateRangeSelection";

const TODAY = "2026-10-10";

/** Available every day from 10 Oct for 120 days, with overrides. */
function rules(overrides: Record<string, Partial<DayRule>> = {}, minNights = 2) {
  const days: DayRule[] = [];
  const d = new Date(TODAY + "T00:00:00Z");
  for (let i = 0; i < 120; i++) {
    const date = d.toISOString().slice(0, 10);
    days.push({ date, status: "available", ...overrides[date] });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return buildRangeRules(days, minNights, TODAY);
}

const sel = (checkIn: string, checkOut: string, phase: RangeSelection["phase"]): RangeSelection => ({ checkIn, checkOut, phase });

describe("escolher datas de raiz", () => {
  it("a entrada passa logo para a saída, e a saída fecha a escolha", () => {
    const r = rules();
    const a = applyDayClick(r, sel("", "", "check-in"), "2026-10-20")!;
    expect(a).toEqual({ checkIn: "2026-10-20", checkOut: "", phase: "check-out", done: false });
    const b = applyDayClick(r, a, "2026-10-25")!;
    expect(b).toEqual({ checkIn: "2026-10-20", checkOut: "2026-10-25", phase: "check-in", done: true });
  });

  it("dias passados, ocupados e fechados à entrada não começam estadia", () => {
    const r = rules({ "2026-10-15": { status: "booked" }, "2026-10-16": { cta: true } });
    const s = sel("", "", "check-in");
    expect(applyDayClick(r, s, "2026-10-09")).toBeNull();
    expect(applyDayClick(r, s, "2026-10-15")).toBeNull();
    expect(applyDayClick(r, s, "2026-10-16")).toBeNull();
  });
});

describe("mudar uma estadia já escolhida", () => {
  const r = rules();
  const chosen = sel("2026-10-20", "2026-10-25", "check-in");

  it("mudar só a entrada mantém a saída e NÃO dá a escolha por concluída", () => {
    const a = applyDayClick(r, chosen, "2026-10-21")!;
    expect(a).toEqual({ checkIn: "2026-10-21", checkOut: "2026-10-25", phase: "check-out", done: false });
  });

  it("alargar: nova entrada e logo a seguir nova saída — dois cliques, sem reabrir", () => {
    const a = applyDayClick(r, chosen, "2026-10-21")!;
    const b = applyDayClick(r, a, "2026-10-30")!;
    expect(b).toEqual({ checkIn: "2026-10-21", checkOut: "2026-10-30", phase: "check-in", done: true });
  });

  it("aberto pela saída, um clique muda só a saída", () => {
    const a = applyDayClick(r, { ...chosen, phase: "check-out" }, "2026-10-28")!;
    expect(a).toEqual({ checkIn: "2026-10-20", checkOut: "2026-10-28", phase: "check-in", done: true });
  });

  it("entrada depois da saída antiga limpa a saída", () => {
    const a = applyDayClick(r, chosen, "2026-11-02")!;
    expect(a).toEqual({ checkIn: "2026-11-02", checkOut: "", phase: "check-out", done: false });
  });

  it("entrada que deixaria a saída abaixo da estadia mínima limpa a saída", () => {
    const a = applyDayClick(r, chosen, "2026-10-24")!; // 1 noite < mínimo 2
    expect(a.checkOut).toBe("");
  });

  it("na fase da saída, um dia antes da entrada recomeça a estadia nesse dia", () => {
    const a = applyDayClick(r, sel("2026-10-20", "", "check-out"), "2026-10-18")!;
    expect(a).toEqual({ checkIn: "2026-10-18", checkOut: "", phase: "check-out", done: false });
  });
});

describe("noites ocupadas e regras do Guesty", () => {
  it("pode sair no dia em que entra a reserva seguinte (turnover)", () => {
    const r = rules({ "2026-10-24": { status: "booked" } });
    const s = sel("2026-10-20", "", "check-out");
    expect(dayRole(r, s, "2026-10-24")).toBe("check-out");
    expect(applyDayClick(r, s, "2026-10-24")?.done).toBe(true);
  });

  it("um dia livre depois da reserva seguinte começa uma estadia nova em vez de não fazer nada", () => {
    const r = rules({ "2026-10-24": { status: "booked" }, "2026-10-25": { status: "booked" } });
    const s = sel("2026-10-20", "", "check-out");
    expect(dayRole(r, s, "2026-10-27")).toBe("restart");
    expect(applyDayClick(r, s, "2026-10-27")).toEqual({ checkIn: "2026-10-27", checkOut: "", phase: "check-out", done: false });
  });

  it("dias abaixo da estadia mínima ficam desativados como saída", () => {
    const r = rules({ "2026-10-20": { minNights: 7 } });
    const s = sel("2026-10-20", "", "check-out");
    expect(dayRole(r, s, "2026-10-26")).toBe("disabled");
    expect(dayRole(r, s, "2026-10-27")).toBe("check-out");
  });

  it("dia fechado à saída não termina a estadia", () => {
    const r = rules({ "2026-10-25": { ctd: true } });
    expect(dayRole(r, sel("2026-10-20", "", "check-out"), "2026-10-25")).toBe("disabled");
  });

  it("na fase da saída, um dia antes da entrada fechado à entrada fica desativado", () => {
    const r = rules({ "2026-10-18": { cta: true } });
    expect(dayRole(r, sel("2026-10-20", "", "check-out"), "2026-10-18")).toBe("disabled");
  });

  it("mudar a entrada não guarda uma saída que atravessaria noites ocupadas", () => {
    const r = rules({ "2026-10-22": { status: "booked" } });
    const a = applyDayClick(r, sel("2026-10-23", "2026-10-28", "check-in"), "2026-10-19")!;
    expect(a.checkOut).toBe("");
  });

  it("fase da saída sem entrada comporta-se como fase da entrada", () => {
    const r = rules();
    const a = applyDayClick(r, sel("", "", "check-out"), "2026-10-20")!;
    expect(a).toEqual({ checkIn: "2026-10-20", checkOut: "", phase: "check-out", done: false });
  });
});
