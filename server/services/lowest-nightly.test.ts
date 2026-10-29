/**
 * "Desde X €" das listagens (lowest-nightly.ts): o aquecimento em segundo
 * plano tem de chegar a TODAS as casas. A 28 out 2026, com a BD de produção
 * em baixo (quota do TiDB esgotada), as casas sem resultado (calendário vazio
 * ou sem datas livres) ocupavam sempre os mesmos 4 lugares de aquecimento e
 * as seguintes nunca ganhavam preço.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getCalendar: vi.fn(),
  quote: vi.fn(),
  getSetting: vi.fn(),
  getSettingsByKeys: vi.fn(),
  upsertSetting: vi.fn(),
}));

vi.mock("../lib/guesty", () => ({ guestyBEClient: { getCalendar: h.getCalendar } }));
vi.mock("./guesty", () => ({ getBackgroundLiveQuote: h.quote }));
vi.mock("./guesty-booking", () => ({ beQuotesUnderPressure: () => false }));
vi.mock("../db", () => ({ getSetting: h.getSetting, getSettingsByKeys: h.getSettingsByKeys, upsertSetting: h.upsertSetting }));

const ymd = (d: Date) => d.toISOString().slice(0, 10);
/** Dois dias livres a partir de amanhã (uma só janela de 2 noites, uma cotação). */
function oneWindow() {
  const t = Date.now();
  return [1, 2].map((k) => ({ date: ymd(new Date(t + k * 86_400_000)), status: "available", minNights: 2 }));
}

beforeEach(() => {
  vi.resetModules();
  for (const fn of Object.values(h)) fn.mockReset();
  // BD em baixo: nenhuma leitura do valor guardado funciona.
  h.getSetting.mockRejectedValue(new Error("usage quota exhausted"));
  h.getSettingsByKeys.mockRejectedValue(new Error("usage quota exhausted"));
  h.upsertSetting.mockRejectedValue(new Error("usage quota exhausted"));
});

describe("getLowestNightlyBatch: aquecimento em rotação", () => {
  it("casas sem resultado não voltam a ocupar os lugares: o pedido seguinte aquece as outras", async () => {
    const dead = ["d1", "d2", "d3", "d4"];
    const live = ["l1", "l2"];
    h.getCalendar.mockImplementation(async (id: string) => (dead.includes(id) ? [] : oneWindow()));
    h.quote.mockResolvedValue({ source: "live", pricing: { nightlyRate: 120 }, ratePlanOptions: [{ nightlyRate: 110 }] });

    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    const ids = [...dead, ...live];

    expect(await getLowestNightlyBatch(ids)).toEqual(Object.fromEntries(ids.map((id) => [id, null])));
    await vi.waitFor(() => expect(h.getCalendar).toHaveBeenCalledTimes(4));
    expect(h.getCalendar.mock.calls.map((c) => c[0])).toEqual(dead);

    // Antes: os mesmos d1–d4 outra vez, e l1/l2 nunca. Agora: l1 e l2.
    await getLowestNightlyBatch(ids);
    await vi.waitFor(() => expect(h.getCalendar).toHaveBeenCalledTimes(6));
    expect(h.getCalendar.mock.calls.slice(4).map((c) => c[0]).sort()).toEqual(live);

    // Os preços calculados ficam em memória e saem mesmo sem BD.
    await vi.waitFor(async () => {
      const out = await getLowestNightlyBatch(ids);
      expect(out).toMatchObject({ l1: 110, l2: 110, d1: null });
    }, { timeout: 5_000 });
  });

  it("uma casa já a calcular não é pedida outra vez", async () => {
    let release!: () => void;
    h.getCalendar.mockImplementation(() => new Promise((r) => { release = () => r([]); }));
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    await getLowestNightlyBatch(["a"]);
    await getLowestNightlyBatch(["a"]);
    expect(h.getCalendar).toHaveBeenCalledTimes(1);
    release();
  });
});

describe("getLowestNightlyBatch: leituras à BD (quota do TiDB)", () => {
  it("uma só consulta para a página, e o valor guardado serve as visitas seguintes sem voltar à BD", async () => {
    const fresh = Date.now() - 60_000;
    h.getSettingsByKeys.mockResolvedValue(new Map([
      ["lowest_nightly_a", `150@${fresh}`],
      ["lowest_nightly_b", `90@${fresh}`],
    ]));
    h.getCalendar.mockResolvedValue([]);
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["a", "b", "a"])).toEqual({ a: 150, b: 90 });
    expect(h.getSettingsByKeys).toHaveBeenCalledTimes(1);
    expect(h.getSettingsByKeys).toHaveBeenCalledWith(["lowest_nightly_a", "lowest_nightly_b"]);
    expect(await getLowestNightlyBatch(["a", "b"])).toEqual({ a: 150, b: 90 });
    expect(h.getSettingsByKeys).toHaveBeenCalledTimes(1);
    expect(h.getSetting).not.toHaveBeenCalled();
    // Frescos (menos de 8 h): nada a recalcular.
    expect(h.getCalendar).not.toHaveBeenCalled();
  });

  it("um valor guardado com mais de 8 h aparece na página e recalcula-se em segundo plano", async () => {
    h.getSettingsByKeys.mockResolvedValue(new Map([["lowest_nightly_a", `150@${Date.now() - 9 * 3_600_000}`]]));
    h.getCalendar.mockResolvedValue([]);
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["a"])).toEqual({ a: 150 });
    await vi.waitFor(() => expect(h.getCalendar).toHaveBeenCalledWith("a", expect.any(String), expect.any(String)));
  });

  it("uma casa tentada há pouco sem resultado não é recalculada em cada visita", async () => {
    h.getSettingsByKeys.mockResolvedValue(new Map());
    h.getCalendar.mockResolvedValue([]);
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["x"])).toEqual({ x: null });
    await vi.waitFor(() => expect(h.getCalendar).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(await getLowestNightlyBatch(["x"])).toEqual({ x: null });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.getCalendar).toHaveBeenCalledTimes(1);
  });

  it("um recálculo que falhou por um soluço da BD não esconde o preço guardado", async () => {
    // 1.º pedido: preço antigo (9 h) na BD; o recálculo não cota e a leitura
    // de recurso à BD falha → fica "sem preço" em memória.
    h.getSettingsByKeys.mockResolvedValueOnce(new Map([["lowest_nightly_a", `150@${Date.now() - 9 * 3_600_000}`]]));
    h.getCalendar.mockResolvedValue([]);
    h.getSetting.mockRejectedValue(new Error("connection reset"));
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["a"])).toEqual({ a: 150 });
    await vi.waitFor(() => expect(h.getSetting).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    // 2.º pedido, BD de volta: o preço guardado continua na página.
    h.getSettingsByKeys.mockResolvedValueOnce(new Map([["lowest_nightly_a", `150@${Date.now() - 9 * 3_600_000}`]]));
    expect(await getLowestNightlyBatch(["a"])).toEqual({ a: 150 });
  });

  it("BD em baixo: um preço antigo em memória continua na página", async () => {
    h.getSettingsByKeys.mockResolvedValueOnce(new Map([["lowest_nightly_a", `150@${Date.now() - 9 * 3_600_000}`]]));
    h.getCalendar.mockImplementation(() => new Promise(() => {})); // recálculo pendurado
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["a"])).toEqual({ a: 150 });
    h.getSettingsByKeys.mockRejectedValue(new Error("usage quota exhausted"));
    expect(await getLowestNightlyBatch(["a"])).toEqual({ a: 150 });
  });
});

describe("computeLowestNightly: casas sem datas nos 90 dias", () => {
  it("procura até 12 meses: uma casa só livre na primavera também tem preço", async () => {
    h.getSettingsByKeys.mockResolvedValue(new Map());
    h.upsertSetting.mockResolvedValue(undefined);
    const t = Date.now();
    const days = Array.from({ length: 366 }, (_, k) => ({
      date: ymd(new Date(t + k * 86_400_000)),
      status: k >= 150 && k < 160 ? "available" : "unavailable",
      minNights: 2,
    }));
    h.getCalendar.mockResolvedValue(days);
    h.quote.mockResolvedValue({ source: "live", pricing: { nightlyRate: 300 }, ratePlanOptions: [] });
    const { getLowestNightly } = await import("./lowest-nightly");
    expect(await getLowestNightly("spring")).toMatchObject({ from: 300, source: "calendar" });
    const [, from, to] = h.getCalendar.mock.calls[0];
    expect((Date.parse(to) - Date.parse(from)) / 86_400_000).toBeGreaterThanOrEqual(364);
    expect(h.quote.mock.calls[0][1] >= days[150].date).toBe(true);
  });

  it("com datas nos 90 dias, as amostras ficam nos 90 dias (o 'desde' não muda de sentido)", async () => {
    h.getSettingsByKeys.mockResolvedValue(new Map());
    h.upsertSetting.mockResolvedValue(undefined);
    const t = Date.now();
    const days = Array.from({ length: 366 }, (_, k) => ({ date: ymd(new Date(t + k * 86_400_000)), status: k === 10 || k === 11 || k > 200 ? "available" : "unavailable", minNights: 2 }));
    h.getCalendar.mockResolvedValue(days);
    h.quote.mockResolvedValue({ source: "live", pricing: { nightlyRate: 200 }, ratePlanOptions: [] });
    const { getLowestNightly } = await import("./lowest-nightly");
    await getLowestNightly("near");
    expect(h.quote).toHaveBeenCalledTimes(1);
    expect(h.quote.mock.calls[0][1]).toBe(days[10].date);
  });
});

describe("casas sem noites reserváveis em 12 meses (prices-availability-03)", () => {
  /** O ano inteiro, dia a dia (a Gerês Gateway: 365/365 "unavailable"). */
  const wholeYear = (status: (k: number) => string) => {
    const t = Date.now();
    return Array.from({ length: 366 }, (_, k) => ({ date: ymd(new Date(t + k * 86_400_000)), status: status(k), minNights: 2 }));
  };

  it("deixa de anunciar o 'desde' guardado: a casa fica sem preço e a BD guarda 'closed'", async () => {
    let stored = new Map([["lowest_nightly_geres", `411.25@${Date.now() - 9 * 3_600_000}`]]);
    h.getSettingsByKeys.mockImplementation(async () => stored);
    h.upsertSetting.mockImplementation(async (key: string, value: string) => { stored = new Map([[key, value]]); });
    h.getCalendar.mockResolvedValue(wholeYear(() => "unavailable"));
    const { getLowestNightlyBatch, getDisplayedLowestNightly } = await import("./lowest-nightly");
    // 1.º pedido: o valor antigo ainda sai enquanto se recalcula em segundo plano (como antes).
    expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: 411.25 });
    await vi.waitFor(() => expect(h.upsertSetting).toHaveBeenCalledWith("lowest_nightly_geres", expect.stringMatching(/^closed@\d+$/), "lowest_nightly"));
    // A seguir: sem preço, sem voltar à BD nem ao calendário.
    h.getSettingsByKeys.mockClear();
    expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: null });
    expect(await getDisplayedLowestNightly("geres")).toMatchObject({ from: null, source: "none" });
    expect(h.getSettingsByKeys).not.toHaveBeenCalled();
    expect(h.quote).not.toHaveBeenCalled();
    expect(h.getCalendar).toHaveBeenCalledTimes(1);
    // 31 min depois volta a ver o calendário; continua fechada → nada se escreve.
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(Date.now() + 31 * 60_000));
      expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: null });
      await vi.waitFor(() => expect(h.getCalendar).toHaveBeenCalledTimes(2));
      await new Promise((r) => setTimeout(r, 20));
      expect(h.upsertSetting).toHaveBeenCalledTimes(1);
      expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("depois de um restart, a marca 'closed' na BD não deixa o preço antigo voltar", async () => {
    h.getSettingsByKeys.mockResolvedValue(new Map([["lowest_nightly_geres", `closed@${Date.now() - 60_000}`]]));
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: null });
    expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: null });
    expect(h.getSettingsByKeys).toHaveBeenCalledTimes(1);
    expect(h.getCalendar).not.toHaveBeenCalled(); // visto fechado há 1 min: nada a recalcular
  });

  it("uma marca 'closed' antiga continua sem preço e volta a ver o calendário: se reabriu, o preço volta", async () => {
    h.getSettingsByKeys.mockResolvedValue(new Map([["lowest_nightly_geres", `closed@${Date.now() - 31 * 60_000}`]]));
    h.upsertSetting.mockResolvedValue(undefined);
    h.getCalendar.mockResolvedValue(wholeYear((k) => (k >= 30 && k < 40 ? "available" : "unavailable")));
    h.quote.mockResolvedValue({ source: "live", pricing: { nightlyRate: 380 }, ratePlanOptions: [{ nightlyRate: 360 }] });
    const { getLowestNightlyBatch } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: null });
    // Duas janelas livres = duas cotações, a 1 s uma da outra (ritmo do warm-up).
    await vi.waitFor(() => expect(h.upsertSetting).toHaveBeenCalledWith("lowest_nightly_geres", expect.stringMatching(/^360@\d+$/), "lowest_nightly"), { timeout: 5_000 });
    expect(await getLowestNightlyBatch(["geres"])).toEqual({ geres: 360 });
  });

  it("um calendário que falha, vem vazio ou curto não prova nada: fica o último preço guardado", async () => {
    const old = `150@${Date.now() - 9 * 3_600_000}`;
    h.getSettingsByKeys.mockResolvedValue(new Map([["lowest_nightly_a", old], ["lowest_nightly_b", old], ["lowest_nightly_c", old]]));
    h.getSetting.mockResolvedValue(old);
    h.upsertSetting.mockResolvedValue(undefined);
    h.getCalendar.mockImplementation(async (id: string) => {
      if (id === "a") throw new Error("BE 503");
      if (id === "b") return [];
      return wholeYear(() => "unavailable").slice(0, 60); // só 60 dias
    });
    const { getLowestNightlyBatch, getLowestNightly } = await import("./lowest-nightly");
    expect(await getLowestNightlyBatch(["a", "b", "c"])).toEqual({ a: 150, b: 150, c: 150 });
    for (const id of ["a", "b", "c"]) expect((await getLowestNightly(id)).from).toBe(150);
    expect(h.upsertSetting).not.toHaveBeenCalledWith(expect.anything(), expect.stringMatching(/^closed/), expect.anything());
  });

  it("uma noite livre solta no início da semana já não esconde uma estadia reservável dois dias depois", async () => {
    h.getSettingsByKeys.mockResolvedValue(new Map());
    h.upsertSetting.mockResolvedValue(undefined);
    // Dia 1 livre sozinho (mínimo 2), dias 3–4 livres: antes a semana era saltada.
    h.getCalendar.mockResolvedValue(wholeYear((k) => (k === 1 || k === 3 || k === 4 ? "available" : "unavailable")));
    h.quote.mockResolvedValue({ source: "live", pricing: { nightlyRate: 140 }, ratePlanOptions: [] });
    const { getLowestNightly } = await import("./lowest-nightly");
    expect(await getLowestNightly("sparse")).toMatchObject({ from: 140, source: "calendar" });
    expect(h.quote).toHaveBeenCalledTimes(1);
    expect(h.quote.mock.calls[0][1]).toBe(ymd(new Date(Date.now() + 3 * 86_400_000)));
  });
});
