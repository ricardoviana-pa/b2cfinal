import { describe, it, expect } from "vitest";
import {
  addDays,
  daysBetween,
  minLeadDaysForTwoParts,
  twoPartsEligibility,
  twoPartsSchedule,
} from "./payment-plan";

describe("twoPartsSchedule — datas por política (spec 2.3)", () => {
  it("bate com o exemplo da especificação: moderate, check-in a 15 jul 2027", () => {
    const s = twoPartsSchedule("MODERATE", "2027-07-15")!;
    expect(s.policyCode).toBe("moderate");
    expect(s.freeCancelDeadline).toBe("2027-07-08");
    expect(s.chargeDate).toBe("2027-06-28");
    expect(s.retryDates).toEqual(["2027-06-29", "2027-07-01"]);
    expect(s.hardStopDate).toBe("2027-07-05");
  });

  it.each([
    ["MODERATE", 7, 17, 10],
    ["FIRM", 14, 24, 17],
    ["STRICT", 30, 40, 33],
    ["STRICT_60", 60, 70, 63],
  ])("%s: D = T−%i, C = T−%i, H = T−%i", (code, d, c, h) => {
    const t = "2027-09-30";
    const s = twoPartsSchedule(code, t)!;
    expect(daysBetween(s.freeCancelDeadline, t)).toBe(d);
    expect(daysBetween(s.chargeDate, t)).toBe(c);
    expect(daysBetween(s.hardStopDate, t)).toBe(h);
  });

  it("H nunca passa a véspera do fim do cancelamento gratuito", () => {
    const s = twoPartsSchedule("moderate", "2027-07-15")!;
    expect(s.hardStopDate < s.freeCancelDeadline).toBe(true);
    expect(daysBetween(s.hardStopDate, s.freeCancelDeadline)).toBeGreaterThanOrEqual(1);
  });

  it("não reembolsável e código desconhecido não têm segunda parte", () => {
    expect(twoPartsSchedule("NON_REFUNDABLE", "2027-07-15")).toBeNull();
    expect(twoPartsSchedule("super_strict", "2027-07-15")).toBeNull();
    expect(twoPartsSchedule("flexible", "2027-07-15")).toBeNull();
    expect(twoPartsSchedule(undefined, "2027-07-15")).toBeNull();
    expect(twoPartsSchedule(["MODERATE", "FIRM"], "2027-07-15")).toBeNull();
  });

  it("data de check-in inválida devolve null em vez de inventar datas", () => {
    expect(twoPartsSchedule("moderate", "2027-02-30")).toBeNull();
    expect(twoPartsSchedule("moderate", "15/07/2027")).toBeNull();
  });

  it("atravessa fim de fevereiro em ano bissexto sem perder um dia", () => {
    const s = twoPartsSchedule("strict", "2028-03-10")!;
    expect(s.freeCancelDeadline).toBe("2028-02-09");
    expect(s.chargeDate).toBe("2028-01-30");
  });

  it("atravessa a mudança de hora de março sem deslizar", () => {
    const s = twoPartsSchedule("moderate", "2027-04-07")!;
    expect(s.chargeDate).toBe("2027-03-21");
    expect(addDays("2027-03-27", 2)).toBe("2027-03-29");
  });
});

describe("twoPartsEligibility — regras de produto (spec 2.1)", () => {
  const ok = { policy: "MODERATE", checkIn: "2027-07-15", stayCents: 250_000 };

  it("antecedência mínima por política: 27, 34, 50 e 80 dias", () => {
    expect(minLeadDaysForTwoParts("moderate")).toBe(27);
    expect(minLeadDaysForTwoParts("firm")).toBe(34);
    expect(minLeadDaysForTwoParts("strict")).toBe(50);
    expect(minLeadDaysForTwoParts("strict_60")).toBe(80);
  });

  it("no limite exato da antecedência é elegível; um dia depois já não", () => {
    const limite = addDays(ok.checkIn, -27);
    expect(twoPartsEligibility({ ...ok, bookingDate: limite }).eligible).toBe(true);
    const tarde = addDays(ok.checkIn, -26);
    const r = twoPartsEligibility({ ...ok, bookingDate: tarde });
    expect(r).toMatchObject({ eligible: false, reason: "lead_time" });
  });

  it("estadia de 1 000 € é elegível, de 999,99 € não", () => {
    const bookingDate = "2027-01-10";
    expect(twoPartsEligibility({ ...ok, bookingDate, stayCents: 100_000 }).eligible).toBe(true);
    expect(twoPartsEligibility({ ...ok, bookingDate, stayCents: 99_999 })).toMatchObject({
      eligible: false,
      reason: "min_stay",
    });
  });

  it("tarifa não reembolsável nunca é elegível, por mais antecedência que tenha", () => {
    expect(
      twoPartsEligibility({ policy: "NON_REFUNDABLE", checkIn: "2027-07-15", bookingDate: "2026-10-27", stayCents: 900_000 }),
    ).toMatchObject({ eligible: false, reason: "policy", schedule: null });
  });

  it("datas ilegíveis não rebentam", () => {
    expect(twoPartsEligibility({ ...ok, bookingDate: "ontem" })).toMatchObject({ eligible: false, reason: "invalid" });
    expect(twoPartsEligibility({ ...ok, bookingDate: "2027-01-10", stayCents: NaN })).toMatchObject({
      eligible: false,
      reason: "min_stay",
    });
  });
});
