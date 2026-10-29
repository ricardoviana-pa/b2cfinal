import { describe, it, expect } from "vitest";
import {
  addDays,
  daysBetween,
  minLeadDaysForTwoParts,
  twoPartsEligibility,
  twoPartsSchedule,
  lisbonWallTimeToUtc,
  twoPartsInstants,
  splitTwoParts,
  inTwoPartsHoldout,
  readTwoPartsConfig,
  TWO_PARTS_BALANCE_ENGINE_READY,
  TWO_PARTS_RULES,
} from "./payment-plan";
import { isRecoveryHoldout } from "./recovery-funnel";

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

/* ════════════════════════════════════════════════════════════════
   Fase 1: instantes, divisão, grupo de controlo e configuração.
   ════════════════════════════════════════════════════════════════ */

/**
 * Oráculo independente: formata o instante no relógio de Lisboa (o sentido
 * inverso do que lisbonWallTimeToUtc faz), para provar que a hora de parede
 * que o hóspede lê no email é a hora da regra.
 */
function lisbonWall(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

const DAY_MS = 86_400_000;

describe("lisbonWallTimeToUtc — horas da regra em instantes UTC (spec 2.3)", () => {
  it("no inverno Lisboa está em UTC: 10:00 → 10:00Z", () => {
    expect(lisbonWallTimeToUtc("2027-01-15", 10, 0).toISOString()).toBe("2027-01-15T10:00:00.000Z");
    expect(lisbonWallTimeToUtc("2027-01-15", 12, 0).toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });

  it("no verão Lisboa está em UTC+1: 10:00 → 09:00Z", () => {
    expect(lisbonWallTimeToUtc("2027-07-15", 10, 0).toISOString()).toBe("2027-07-15T09:00:00.000Z");
    expect(lisbonWallTimeToUtc("2027-07-15", 12, 0).toISOString()).toBe("2027-07-15T11:00:00.000Z");
  });

  it("23:59 fica no próprio dia de Lisboa, mesmo quando em UTC já é outro dia ou não", () => {
    // Inverno: 23:59 de Lisboa é 23:59Z do mesmo dia.
    expect(lisbonWallTimeToUtc("2027-01-31", 23, 59).toISOString()).toBe("2027-01-31T23:59:00.000Z");
    // Verão: 23:59 de Lisboa é 22:59Z; se o desvio fosse lido ao contrário, D
    // passava para as 00:59 do dia seguinte e o hóspede ganhava uma hora que
    // a cláusula não promete.
    expect(lisbonWallTimeToUtc("2027-07-08", 23, 59).toISOString()).toBe("2027-07-08T22:59:00.000Z");
    // Passagem de ano e de mês.
    expect(lisbonWallTimeToUtc("2027-12-31", 23, 59).toISOString()).toBe("2027-12-31T23:59:00.000Z");
  });

  it("último domingo de março (28 mar 2027, o relógio salta das 01:00 para as 02:00)", () => {
    expect(lisbonWallTimeToUtc("2027-03-28", 10, 0).toISOString()).toBe("2027-03-28T09:00:00.000Z");
    expect(lisbonWallTimeToUtc("2027-03-28", 12, 0).toISOString()).toBe("2027-03-28T11:00:00.000Z");
    expect(lisbonWallTimeToUtc("2027-03-28", 23, 59).toISOString()).toBe("2027-03-28T22:59:00.000Z");
    // Antes do salto ainda é inverno; depois dele já é verão.
    expect(lisbonWallTimeToUtc("2027-03-28", 0, 30).toISOString()).toBe("2027-03-28T00:30:00.000Z");
    expect(lisbonWallTimeToUtc("2027-03-28", 3, 0).toISOString()).toBe("2027-03-28T02:00:00.000Z");
    // Véspera do salto: ainda inverno às 23:59.
    expect(lisbonWallTimeToUtc("2027-03-27", 23, 59).toISOString()).toBe("2027-03-27T23:59:00.000Z");
  });

  it("último domingo de outubro (31 out 2027, o relógio recua das 02:00 para a 01:00)", () => {
    expect(lisbonWallTimeToUtc("2027-10-31", 10, 0).toISOString()).toBe("2027-10-31T10:00:00.000Z");
    expect(lisbonWallTimeToUtc("2027-10-31", 12, 0).toISOString()).toBe("2027-10-31T12:00:00.000Z");
    expect(lisbonWallTimeToUtc("2027-10-31", 23, 59).toISOString()).toBe("2027-10-31T23:59:00.000Z");
    // Antes do recuo ainda é verão.
    expect(lisbonWallTimeToUtc("2027-10-31", 0, 30).toISOString()).toBe("2027-10-30T23:30:00.000Z");
    expect(lisbonWallTimeToUtc("2027-10-31", 3, 0).toISOString()).toBe("2027-10-31T03:00:00.000Z");
    // Véspera do recuo: ainda verão às 23:59.
    expect(lisbonWallTimeToUtc("2027-10-30", 23, 59).toISOString()).toBe("2027-10-30T22:59:00.000Z");
  });

  it("nos dias de mudança de 2026 e 2028 também (29 mar e 25 out 2026; 26 mar e 29 out 2028)", () => {
    expect(lisbonWallTimeToUtc("2026-03-29", 10, 0).toISOString()).toBe("2026-03-29T09:00:00.000Z");
    expect(lisbonWallTimeToUtc("2026-10-25", 10, 0).toISOString()).toBe("2026-10-25T10:00:00.000Z");
    expect(lisbonWallTimeToUtc("2028-03-26", 23, 59).toISOString()).toBe("2028-03-26T22:59:00.000Z");
    expect(lisbonWallTimeToUtc("2028-10-29", 12, 0).toISOString()).toBe("2028-10-29T12:00:00.000Z");
  });

  it("todos os dias de 2026 a 2028, as três horas da regra voltam a dar a mesma hora de parede", () => {
    // Prova exaustiva: um desvio errado num único dia (o do salto, tipicamente)
    // punha a cobrança uma hora fora do que o mandato diz.
    const falhas: string[] = [];
    for (let ymd = "2026-01-01"; ymd <= "2028-12-31"; ymd = addDays(ymd, 1)) {
      for (const [h, m] of [[10, 0], [12, 0], [23, 59]] as const) {
        const at = lisbonWallTimeToUtc(ymd, h, m);
        const esperado = `${ymd} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
        if (lisbonWall(at) !== esperado) falhas.push(`${esperado} → ${at.toISOString()}`);
        // Lisboa só conhece UTC+0 e UTC+1.
        const desvio = (Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10), h, m) - at.getTime()) / 60_000;
        if (desvio !== 0 && desvio !== 60) falhas.push(`${esperado}: desvio ${desvio}`);
      }
    }
    expect(falhas).toEqual([]);
  });

  it("data ilegível rebenta em vez de agendar uma cobrança numa data inventada", () => {
    expect(() => lisbonWallTimeToUtc("2027-02-30", 10, 0)).toThrow(/data inválida/);
    expect(() => lisbonWallTimeToUtc("2027-7-1", 10, 0)).toThrow(/data inválida/);
    expect(() => lisbonWallTimeToUtc("", 10, 0)).toThrow(/data inválida/);
  });
});

describe("twoPartsInstants — o calendário em instantes (spec 2.3)", () => {
  it("bate com o exemplo da especificação: moderate, check-in a 15 jul 2027 (verão)", () => {
    const i = twoPartsInstants(twoPartsSchedule("MODERATE", "2027-07-15")!);
    expect(i.freeCancelDeadlineAt.toISOString()).toBe("2027-07-08T22:59:00.000Z"); // 8 jul, 23:59 de Lisboa
    expect(i.chargeAt.toISOString()).toBe("2027-06-28T09:00:00.000Z"); // 28 jun, 10:00
    expect(i.retryAt.map((d) => d.toISOString())).toEqual([
      "2027-06-29T09:00:00.000Z", // 29 jun, 10:00
      "2027-07-01T09:00:00.000Z", // 1 jul, 10:00
    ]);
    expect(i.hardStopAt.toISOString()).toBe("2027-07-05T11:00:00.000Z"); // 5 jul, 12:00
  });

  it("no inverno as horas da regra coincidem com UTC", () => {
    const i = twoPartsInstants(twoPartsSchedule("moderate", "2027-01-25")!);
    expect(i.freeCancelDeadlineAt.toISOString()).toBe("2027-01-18T23:59:00.000Z");
    expect(i.chargeAt.toISOString()).toBe("2027-01-08T10:00:00.000Z");
    expect(i.retryAt.map((d) => d.toISOString())).toEqual(["2027-01-09T10:00:00.000Z", "2027-01-11T10:00:00.000Z"]);
    expect(i.hardStopAt.toISOString()).toBe("2027-01-15T12:00:00.000Z");
  });

  it("um calendário que atravessa o salto de março mistura os dois desvios, cada um no seu dia", () => {
    // C a 21 mar (inverno), H no próprio dia do salto (28 mar, já verão), D a 31 mar.
    const i = twoPartsInstants(twoPartsSchedule("moderate", "2027-04-07")!);
    expect(i.chargeAt.toISOString()).toBe("2027-03-21T10:00:00.000Z");
    expect(i.retryAt.map((d) => d.toISOString())).toEqual(["2027-03-22T10:00:00.000Z", "2027-03-24T10:00:00.000Z"]);
    expect(i.hardStopAt.toISOString()).toBe("2027-03-28T11:00:00.000Z");
    expect(i.freeCancelDeadlineAt.toISOString()).toBe("2027-03-31T22:59:00.000Z");
  });

  it("um calendário que atravessa o recuo de outubro também", () => {
    // C a 24 out (verão), H no próprio dia do recuo (31 out, já inverno), D a 3 nov.
    const i = twoPartsInstants(twoPartsSchedule("moderate", "2027-11-10")!);
    expect(i.chargeAt.toISOString()).toBe("2027-10-24T09:00:00.000Z");
    expect(i.retryAt.map((d) => d.toISOString())).toEqual(["2027-10-25T09:00:00.000Z", "2027-10-27T09:00:00.000Z"]);
    expect(i.hardStopAt.toISOString()).toBe("2027-10-31T12:00:00.000Z");
    expect(i.freeCancelDeadlineAt.toISOString()).toBe("2027-11-03T23:59:00.000Z");
  });

  it("para qualquer check-in de 2027 e qualquer política: C < retentativas < H < D, 7 dias de aviso e H antes de D", () => {
    const falhas: string[] = [];
    for (const code of ["moderate", "firm", "strict", "strict_60"]) {
      for (let t = "2027-01-01"; t <= "2027-12-31"; t = addDays(t, 1)) {
        const s = twoPartsSchedule(code, t)!;
        const i = twoPartsInstants(s);
        const linha = [i.chargeAt, ...i.retryAt, i.hardStopAt, i.freeCancelDeadlineAt].map((d) => d.getTime());
        if (!linha.every((v, k) => k === 0 || v > linha[k - 1])) falhas.push(`${code} ${t}: fora de ordem`);
        // Visa: pelo menos 7 dias entre o aviso de falha (enviado em C) e o cancelamento.
        if (i.hardStopAt.getTime() - i.chargeAt.getTime() < 7 * DAY_MS) falhas.push(`${code} ${t}: aviso < 7 dias`);
        // O cancelamento automático acontece com o hóspede ainda dentro do prazo gratuito.
        if (i.freeCancelDeadlineAt.getTime() - i.hardStopAt.getTime() < DAY_MS) falhas.push(`${code} ${t}: H colado a D`);
        if (lisbonWall(i.chargeAt) !== `${s.chargeDate} 10:00`) falhas.push(`${code} ${t}: C fora das 10:00`);
        if (lisbonWall(i.hardStopAt) !== `${s.hardStopDate} 12:00`) falhas.push(`${code} ${t}: H fora das 12:00`);
        if (lisbonWall(i.freeCancelDeadlineAt) !== `${s.freeCancelDeadline} 23:59`) falhas.push(`${code} ${t}: D fora das 23:59`);
      }
    }
    expect(falhas).toEqual([]);
  });
});

describe("splitTwoParts — divisão exata (spec 2.2)", () => {
  const sem = { receptionCents: 0, extrasCents: 0, flexCents: 0 };

  it("só a estadia se divide; receção, extras e Flex vão por inteiro na primeira parte", () => {
    expect(splitTwoParts({ stayCents: 250_000, receptionCents: 5_000, extrasCents: 12_000, flexCents: 23_000 })).toEqual({
      depositStayCents: 125_000,
      depositCents: 125_000 + 5_000 + 12_000 + 23_000,
      balanceCents: 125_000,
    });
  });

  it("metade arredondada ao euro para cima: o cêntimo a mais fica na primeira parte, nunca se perde", () => {
    // 1 001 € → metade 500,50 € → 501 € hoje, 500 € depois.
    expect(splitTwoParts({ stayCents: 100_100, ...sem })).toMatchObject({ depositStayCents: 50_100, balanceCents: 50_000 });
    // 2 500,01 € → metade 1 250,005 € → 1 251 € hoje, 1 249,01 € depois.
    expect(splitTwoParts({ stayCents: 250_001, ...sem })).toMatchObject({ depositStayCents: 125_100, balanceCents: 124_901 });
    // 1 234,57 € → metade 617,285 € → 618 € hoje, 616,57 € depois.
    expect(splitTwoParts({ stayCents: 123_457, ...sem })).toMatchObject({ depositStayCents: 61_800, balanceCents: 61_657 });
    // Metade já redonda não sobe: 2 000 € → 1 000 € + 1 000 €.
    expect(splitTwoParts({ stayCents: 200_000, ...sem })).toMatchObject({ depositStayCents: 100_000, balanceCents: 100_000 });
  });

  it("para qualquer estadia, a soma das duas partes é o total ao cêntimo e a 1.ª é a metade ao euro acima", () => {
    // Gerador determinístico (LCG): milhares de valores com cêntimos ímpares,
    // sem depender de Math.random para o teste ser reproduzível.
    let x = 20_261_027;
    const valores = [0, 1, 99, 100, 101, 150, 199, 200, 99_999, 100_000, 100_001, 100_050, 100_099, 100_100];
    for (let k = 0; k < 5_000; k++) {
      x = (x * 1_103_515_245 + 12_345) % 2_147_483_648;
      valores.push(x % 5_000_000);
    }
    const falhas: number[] = [];
    for (const stayCents of valores) {
      const extra = { receptionCents: 9_000, extrasCents: 12_345, flexCents: 23_000 };
      const s = splitTwoParts({ stayCents, ...extra });
      const meia = stayCents / 2;
      const ok =
        s.depositStayCents + s.balanceCents === stayCents &&
        s.depositCents - extra.receptionCents - extra.extrasCents - extra.flexCents + s.balanceCents === stayCents &&
        s.depositStayCents >= meia &&
        s.depositStayCents - meia < 100 &&
        s.balanceCents >= 0 &&
        // Ao euro, salvo quando a estadia inteira é menos de um euro.
        (s.depositStayCents % 100 === 0 || s.depositStayCents === stayCents) &&
        Number.isSafeInteger(s.depositCents) &&
        Number.isSafeInteger(s.balanceCents);
      if (!ok) falhas.push(stayCents);
    }
    expect(falhas).toEqual([]);
  });

  it("acima do mínimo de 1 000 € nenhuma parte fica abaixo de ~500 €", () => {
    const s = splitTwoParts({ stayCents: TWO_PARTS_RULES.minStayCents + 1, ...sem });
    expect(s.depositStayCents).toBe(50_100);
    expect(s.balanceCents).toBe(49_901);
  });

  it("estadia de 0 € ou abaixo de um euro: tudo hoje, segunda parte a zero (nunca negativa)", () => {
    expect(splitTwoParts({ stayCents: 0, receptionCents: 5_000, extrasCents: 1_000, flexCents: 0 })).toEqual({
      depositStayCents: 0,
      depositCents: 6_000,
      balanceCents: 0,
    });
    // Arredondar 0,005 € ao euro daria 1 € hoje e −0,99 € depois.
    expect(splitTwoParts({ stayCents: 1, ...sem })).toEqual({ depositStayCents: 1, depositCents: 1, balanceCents: 0 });
    expect(splitTwoParts({ stayCents: 99, ...sem })).toEqual({ depositStayCents: 99, depositCents: 99, balanceCents: 0 });
    expect(splitTwoParts({ stayCents: 150, ...sem })).toEqual({ depositStayCents: 100, depositCents: 100, balanceCents: 50 });
  });

  it.each([
    ["negativo", -1],
    ["NaN", NaN],
    ["com fração de cêntimo", 1_000.5],
    ["infinito", Infinity],
    ["acima do inteiro seguro", Number.MAX_SAFE_INTEGER + 1],
  ])("valor %s em qualquer componente rebenta em vez de cobrar um montante errado", (_nome, mau) => {
    const base = { stayCents: 250_000, receptionCents: 5_000, extrasCents: 0, flexCents: 0 };
    for (const campo of ["stayCents", "receptionCents", "extrasCents", "flexCents"] as const) {
      expect(() => splitTwoParts({ ...base, [campo]: mau })).toThrow(/valor inválido/);
    }
  });
});

describe("inTwoPartsHoldout — grupo de controlo determinístico (spec 2.1, 2.6)", () => {
  const ids = Array.from({ length: 10_000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);

  it("o mesmo intent cai sempre do mesmo lado", () => {
    const id = "b1f0cbcd-6881-4459-ae49-edf3b0c3cd19";
    const primeiro = inTwoPartsHoldout(id, 0.1);
    for (let k = 0; k < 5; k++) expect(inTwoPartsHoldout(id, 0.1)).toBe(primeiro);
    expect(ids.map((i) => inTwoPartsHoldout(i, 0.1))).toEqual(ids.map((i) => inTwoPartsHoldout(i, 0.1)));
  });

  it("0 (ou menos, ou NaN) não põe ninguém no controlo; 1 (ou mais) põe todos", () => {
    for (const f of [0, -0.1, NaN]) expect(ids.some((i) => inTwoPartsHoldout(i, f))).toBe(false);
    for (const f of [1, 1.5]) expect(ids.every((i) => inTwoPartsHoldout(i, f))).toBe(true);
  });

  it("perto de 10% em 10 000 intents", () => {
    const n = ids.filter((i) => inTwoPartsHoldout(i, 0.1)).length;
    expect(n / ids.length).toBeGreaterThan(0.09);
    expect(n / ids.length).toBeLessThan(0.11);
    const q = ids.filter((i) => inTwoPartsHoldout(i, 0.25)).length;
    expect(q / ids.length).toBeGreaterThan(0.23);
    expect(q / ids.length).toBeLessThan(0.27);
  });

  it("os grupos são encaixados: subir o holdout só acrescenta intents ao controlo, nunca os troca", () => {
    // Mudar CHECKOUT_TWO_PARTS_HOLDOUT a meio do piloto não pode tirar do
    // controlo quem já lá estava (o relatório recalcula o grupo pelo id).
    for (const id of ids) {
      if (inTwoPartsHoldout(id, 0.05)) expect(inTwoPartsHoldout(id, 0.1)).toBe(true);
      if (inTwoPartsHoldout(id, 0.1)) expect(inTwoPartsHoldout(id, 0.2)).toBe(true);
    }
  });

  it("é independente do grupo de controlo do funil de recuperação", () => {
    // Se fossem o mesmo grupo, os 10% sem duas partes seriam também os 10% sem
    // emails de recuperação e nenhuma das duas medições era limpa. Independentes,
    // a sobreposição esperada é 10% × 10% = 1% (≈ 100 em 10 000).
    const ambos = ids.filter((i) => inTwoPartsHoldout(i, 0.1) && isRecoveryHoldout(i)).length;
    expect(ambos).toBeGreaterThan(50);
    expect(ambos).toBeLessThan(200);
  });
});

describe("readTwoPartsConfig — configuração por env (spec 2.1, 2.6, 5.11)", () => {
  it("sem nada no env: desligado, tratado como live, sem grupo de controlo, mínimo 1 000 €, sem incentivo, sem avisos", () => {
    expect(readTwoPartsConfig({})).toEqual({
      enabled: false,
      livemode: true,
      engineReady: false,
      holdout: 0,
      minStayCents: 100_000,
      incentive: "none",
      warnings: [],
    });
  });

  it("a flag só liga com CHECKOUT_TWO_PARTS=true, como a CHECKOUT_V2", () => {
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true" }).enabled).toBe(true);
    for (const v of ["", "false", "1", "yes"]) expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS: v }).enabled).toBe(false);
  });

  it("livemode pela chave Stripe: sk_test_/rk_test_ é teste; live, desconhecida ou ausente conta como live", () => {
    expect(readTwoPartsConfig({ STRIPE_SECRET_KEY: "sk_test_51abc" }).livemode).toBe(false);
    expect(readTwoPartsConfig({ STRIPE_SECRET_KEY: "rk_test_51abc" }).livemode).toBe(false);
    expect(readTwoPartsConfig({ STRIPE_SECRET_KEY: "sk_live_51abc" }).livemode).toBe(true);
    expect(readTwoPartsConfig({ STRIPE_SECRET_KEY: "rk_live_51abc" }).livemode).toBe(true);
    // Na dúvida, fechado: uma chave publicável ou lixo nunca abre o modo de teste.
    expect(readTwoPartsConfig({ STRIPE_SECRET_KEY: "pk_test_51abc" }).livemode).toBe(true);
    expect(readTwoPartsConfig({ STRIPE_SECRET_KEY: "" }).livemode).toBe(true);
    expect(readTwoPartsConfig({}).livemode).toBe(true);
  });

  it("em live, duas partes só com o motor ligado (CHECKOUT_BALANCE): desligar o motor tira a opção", () => {
    // Ligado em produção a 28 out 2026 (decisão do Ricardo).
    expect(TWO_PARTS_BALANCE_ENGINE_READY).toBe(true);
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true", STRIPE_SECRET_KEY: "sk_live_x" }).engineReady).toBe(false);
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true", CHECKOUT_BALANCE: "false", STRIPE_SECRET_KEY: "sk_live_x" }).engineReady).toBe(false);
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS: "true", CHECKOUT_BALANCE: "true", STRIPE_SECRET_KEY: "sk_live_x" }).engineReady).toBe(true);
  });

  it("holdout aceita frações de 0 a 1; inválido fica 0 com aviso", () => {
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS_HOLDOUT: "0.2" })).toMatchObject({ holdout: 0.2, warnings: [] });
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS_HOLDOUT: "0" })).toMatchObject({ holdout: 0, warnings: [] });
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS_HOLDOUT: "1" })).toMatchObject({ holdout: 1, warnings: [] });
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS_HOLDOUT: "" })).toMatchObject({ holdout: 0, warnings: [] });
    for (const mau of ["abc", "1.5", "-0.1", "10%"]) {
      const c = readTwoPartsConfig({ CHECKOUT_TWO_PARTS_HOLDOUT: mau });
      expect(c.holdout).toBe(0);
      expect(c.warnings).toHaveLength(1);
      expect(c.warnings[0]).toMatch(/CHECKOUT_TWO_PARTS_HOLDOUT/);
    }
  });

  it("mínimo da estadia em cêntimos inteiros a partir de 100 €; inválido fica 1 000 € com aviso", () => {
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS_MIN_STAY_CENTS: "150000" })).toMatchObject({ minStayCents: 150_000, warnings: [] });
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS_MIN_STAY_CENTS: "10000" })).toMatchObject({ minStayCents: 10_000, warnings: [] });
    expect(readTwoPartsConfig({ CHECKOUT_TWO_PARTS_MIN_STAY_CENTS: "" })).toMatchObject({ minStayCents: 100_000, warnings: [] });
    // 1000 parece "1 000 €" mas são 10 €: recusado, é o engano típico de unidades.
    for (const mau of ["1000", "abc", "150000.5", "-150000"]) {
      const c = readTwoPartsConfig({ CHECKOUT_TWO_PARTS_MIN_STAY_CENTS: mau });
      expect(c.minStayCents).toBe(100_000);
      expect(c.warnings).toHaveLength(1);
      expect(c.warnings[0]).toMatch(/CHECKOUT_TWO_PARTS_MIN_STAY_CENTS/);
    }
  });

  it("incentivo: none por omissão (28 out 2026), flex só pedido, discount recusado (fica none) e desconhecido fica none, com aviso", () => {
    expect(readTwoPartsConfig({ FULL_PAYMENT_INCENTIVE: "flex" })).toMatchObject({ incentive: "flex", warnings: [] });
    expect(readTwoPartsConfig({ FULL_PAYMENT_INCENTIVE: " Flex " })).toMatchObject({ incentive: "flex", warnings: [] });
    expect(readTwoPartsConfig({ FULL_PAYMENT_INCENTIVE: "none" })).toMatchObject({ incentive: "none", warnings: [] });
    expect(readTwoPartsConfig({ FULL_PAYMENT_INCENTIVE: "" })).toMatchObject({ incentive: "none", warnings: [] });
    expect(readTwoPartsConfig({})).toMatchObject({ incentive: "none", warnings: [] });

    // Opção B fica fechada até o acerto do folio no Guesty estar provado: cair
    // para none (e não para flex) é a escolha que não muda o preço de ninguém.
    for (const v of ["discount", "DISCOUNT"]) {
      const c = readTwoPartsConfig({ FULL_PAYMENT_INCENTIVE: v });
      expect(c.incentive).toBe("none");
      expect(c.warnings).toHaveLength(1);
      expect(c.warnings[0]).toMatch(/FULL_PAYMENT_INCENTIVE=discount/);
    }

    const d = readTwoPartsConfig({ FULL_PAYMENT_INCENTIVE: "desconto" });
    expect(d.incentive).toBe("none");
    expect(d.warnings).toHaveLength(1);
    expect(d.warnings[0]).toMatch(/FULL_PAYMENT_INCENTIVE desconhecido/);
  });

  it("vários valores inválidos dão um aviso cada, para o log do arranque", () => {
    const c = readTwoPartsConfig({
      CHECKOUT_TWO_PARTS_HOLDOUT: "x",
      CHECKOUT_TWO_PARTS_MIN_STAY_CENTS: "y",
      FULL_PAYMENT_INCENTIVE: "discount",
    });
    expect(c.warnings).toHaveLength(3);
    expect(c).toMatchObject({ holdout: 0, minStayCents: 100_000, incentive: "none" });
  });
});
