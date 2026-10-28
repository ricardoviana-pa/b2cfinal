/**
 * Router da página do saldo (server/routers/balance.ts). Toda a lógica é do
 * motor (testada em services/checkout-balance.test.ts); aqui prova-se só o
 * que o router decide:
 * - regressão C7/C22: a vista é uma mutation (POST, token no corpo). Uma
 *   query do tRPC é um GET com o input, token incluído, na query string, que
 *   ia parar aos logs do Render e da Cloudflare a cada carregamento e polling.
 *   balance.get deixa de existir;
 * - regressão C14: finishCardChange passa ao motor o instante em que a página
 *   renderizou o texto da autorização (consentRenderedAt).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  guestBalanceView: vi.fn(),
  prepareGuestPayment: vi.fn(),
  startCardChange: vi.fn(),
  finishCardChange: vi.fn(),
  guestCancel: vi.fn(),
  guestHelp: vi.fn(),
  resendBalanceLink: vi.fn(),
  preview: vi.fn(() => false),
}));
vi.mock("../lib/preview-isolation", () => ({ isPreviewDeployment: m.preview }));
vi.mock("../services/checkout-balance", () => ({
  guestBalanceView: m.guestBalanceView,
  prepareGuestPayment: m.prepareGuestPayment,
  startCardChange: m.startCardChange,
  finishCardChange: m.finishCardChange,
  guestCancel: m.guestCancel,
  guestHelp: m.guestHelp,
  resendBalanceLink: m.resendBalanceLink,
}));
vi.mock("../services/ad-signals-store", () => ({ requestClientIp: () => "203.0.113.7" }));

import { balanceRouter } from "./balance";

const INTENT = "6f1c2b9e-4a3d-4c8e-9b7a-2d5e8f1a0c3b";
const TOKEN = "1783512000.ab12cd34ef56ab12cd34ef56ab12cd34";
const caller = () => balanceRouter.createCaller({ req: { headers: {} }, res: {}, user: null } as any);

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset();
  m.preview.mockReturnValue(false);
});

describe("balance router", () => {
  it("todas as procedures são mutations (POST): nenhuma leva o token na URL; balance.get já não existe", () => {
    const procedures = (balanceRouter as any)._def.procedures as Record<string, { _def: { type: string } }>;
    expect(procedures.view?._def.type).toBe("mutation");
    expect(procedures.get).toBeUndefined();
    for (const [name, p] of Object.entries(procedures)) expect(p._def.type, name).toBe("mutation");
  });

  it("view devolve a vista do motor com o mesmo input { intentId, token }", async () => {
    const view = { kind: "ok", status: "scheduled", refundCardsLast4: ["1881"], cardChangeConsent: null };
    m.guestBalanceView.mockResolvedValue(view);
    await expect(caller().view({ intentId: INTENT, token: TOKEN })).resolves.toEqual(view);
    expect(m.guestBalanceView).toHaveBeenCalledWith(INTENT, TOKEN);
  });

  it("view recusa um intentId que não é UUID ou um token curto, sem chamar o motor", async () => {
    await expect(caller().view({ intentId: "x", token: TOKEN })).rejects.toThrow();
    await expect(caller().view({ intentId: INTENT, token: "curto" })).rejects.toThrow();
    expect(m.guestBalanceView).not.toHaveBeenCalled();
  });

  it("finishCardChange passa consentRenderedAt e o IP ao motor", async () => {
    m.finishCardChange.mockResolvedValue({ ok: true, cardLast4: "5555", cardBrand: "visa" });
    await caller().finishCardChange({
      intentId: INTENT, token: TOKEN, setupIntentId: "seti_123", consent: true, consentRenderedAt: "2027-06-28T08:57:00.000Z",
    });
    expect(m.finishCardChange).toHaveBeenCalledWith(INTENT, TOKEN, {
      setupIntentId: "seti_123", consent: true, ip: "203.0.113.7", consentRenderedAt: "2027-06-28T08:57:00.000Z",
    });
  });

  it("finishCardChange sem consentRenderedAt continua a valer (o motor usa a hora do envio)", async () => {
    m.finishCardChange.mockResolvedValue({ ok: true, cardLast4: "5555", cardBrand: "visa" });
    await caller().finishCardChange({ intentId: INTENT, token: TOKEN, setupIntentId: "seti_123", consent: true });
    expect(m.finishCardChange).toHaveBeenCalledWith(INTENT, TOKEN, expect.objectContaining({ consentRenderedAt: undefined }));
  });

  it("resendLink responde sempre o mesmo, saia ou não o envio", async () => {
    m.resendBalanceLink.mockResolvedValueOnce({ ok: true, sent: false });
    await expect(caller().resendLink({ intentId: INTENT })).resolves.toEqual({ ok: true });
    m.resendBalanceLink.mockResolvedValueOnce({ ok: true, sent: true });
    await expect(caller().resendLink({ intentId: INTENT })).resolves.toEqual({ ok: true });
    // O público nunca força o travão de 10 min (só o admin).
    for (const call of m.resendBalanceLink.mock.calls) expect(call).toEqual([INTENT]);
  });
});
