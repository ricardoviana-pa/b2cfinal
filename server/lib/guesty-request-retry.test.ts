import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Token vindo da "BD": o cliente nunca pede OAuth (quota de 3/24 h) nem
// escreve um token falso na pasta .cache local.
vi.mock("../db", () => ({
  getSetting: vi.fn(async () =>
    JSON.stringify({ token: "test-token", expiresAt: Date.now() + 3_600_000, refreshAt: Date.now() + 3_000_000 }),
  ),
  upsertSetting: vi.fn(async () => {}),
}));

// O CI corre com APP_ENV=preview, e aí o cliente recusa-se a falar com o
// Guesty antes de chegar à lógica de repetição que este ficheiro testa. O
// isolamento de previews tem os seus próprios testes (preview-isolation.test.ts).
vi.mock("./preview-isolation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./preview-isolation")>()),
  isPreviewDeployment: () => false,
}));

import { guestyClient, isAmbiguousGuestyFailure } from "./guesty";

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
const status = (code: number) => new Response(JSON.stringify({ error: code }), { status: code });

describe("guestyClient.request — pedidos financeiros não se repetem às cegas", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("um 500 num POST de pagamento sobe logo, marcado como ambíguo, sem segundo envio", async () => {
    fetchMock.mockResolvedValueOnce(status(500)).mockResolvedValue(ok());
    const err = await guestyClient
      .request("POST", "/v1/reservations/r1/payments", { body: { amount: 10 }, nonIdempotent: true })
      .catch((e) => e);
    expect(isAmbiguousGuestyFailure(err)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uma falha de rede num POST de pagamento também não se repete", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValue(ok());
    const err = await guestyClient
      .request("POST", "/v1/reservations/r1/payments", { body: { amount: 10 }, nonIdempotent: true })
      .catch((e) => e);
    expect(isAmbiguousGuestyFailure(err)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("um 429 é repetido mesmo num pedido financeiro: o Guesty não o processou", async () => {
    fetchMock.mockResolvedValueOnce(status(429)).mockResolvedValue(ok());
    await expect(
      guestyClient.request("POST", "/v1/reservations/r1/payments", { body: { amount: 10 }, nonIdempotent: true }),
    ).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("um 4xx num pedido financeiro não é ambíguo: o Guesty recusou", async () => {
    fetchMock.mockResolvedValueOnce(status(400));
    const err = await guestyClient
      .request("POST", "/v1/reservations/r1/payments", { body: { amount: 10 }, nonIdempotent: true })
      .catch((e) => e);
    expect(err?.status).toBe(400);
    expect(isAmbiguousGuestyFailure(err)).toBe(false);
  });

  it("leituras continuam a repetir em 5xx, como antes", async () => {
    fetchMock.mockResolvedValueOnce(status(503)).mockResolvedValue(ok());
    await expect(guestyClient.request("GET", "/v1/reservations/r1")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
