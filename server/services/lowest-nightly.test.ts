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
  upsertSetting: vi.fn(),
}));

vi.mock("../lib/guesty", () => ({ guestyBEClient: { getCalendar: h.getCalendar } }));
vi.mock("./guesty", () => ({ getBackgroundLiveQuote: h.quote }));
vi.mock("./guesty-booking", () => ({ beQuotesUnderPressure: () => false }));
vi.mock("../db", () => ({ getSetting: h.getSetting, upsertSetting: h.upsertSetting }));

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
