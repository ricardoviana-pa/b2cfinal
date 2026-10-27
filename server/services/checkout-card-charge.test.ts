import { describe, it, expect } from "vitest";
import { resolveRatePlanId } from "./checkout-card-charge";

/**
 * O plano tarifário é o que decide o preço que o Guesty atribui à reserva e a
 * política de cancelamento que o hóspede fica a ter. Enquanto o settle o leu de
 * dentro do snapshot `quote` — onde o Zod o apaga — foi sempre undefined, e
 * todas as reservas do checkout 2.0 nasceram no plano por omissão da listagem.
 */
describe("resolveRatePlanId", () => {
  it("lê a coluna do intent, que é onde o hóspede grava a escolha", () => {
    expect(resolveRatePlanId({ ratePlanId: "rp-flex" }, { total: 900 })).toBe("rp-flex");
  });

  it("regressão: o snapshot da quote não tem ratePlanId — não pode ser a única fonte", () => {
    // Exactamente a forma que o quoteSnapshotSchema deixa passar: ratePlanId
    // apenas dentro das opções, nunca no topo.
    const quote = {
      total: 1282.1,
      ratePlanOptions: [
        { ratePlanId: "rp-nr", name: "Non-refundable", total: 1153.89, nightlyRate: 0, cleaningFee: 0 },
        { ratePlanId: "rp-flex", name: "Flexible", total: 1282.1, nightlyRate: 0, cleaningFee: 0 },
      ],
    };
    // Sem a coluna preenchida, o plano certo é o que bate certo com o cobrado.
    expect(resolveRatePlanId({}, quote)).toBe("rp-flex");
    // E a coluna, quando existe, manda sempre.
    expect(resolveRatePlanId({ ratePlanId: "rp-nr" }, quote)).toBe("rp-nr");
  });

  it("não adivinha quando nenhuma opção bate com o total cobrado", () => {
    const quote = {
      total: 999,
      ratePlanOptions: [{ ratePlanId: "rp-flex", name: "Flexible", total: 1282.1, nightlyRate: 0, cleaningFee: 0 }],
    };
    // Melhor não mandar plano nenhum (e gritar no log) do que mandar o errado:
    // o plano errado muda a política de cancelamento do hóspede.
    expect(resolveRatePlanId({}, quote)).toBe("");
  });

  it("aguenta intents e quotes incompletos sem rebentar", () => {
    expect(resolveRatePlanId({}, {})).toBe("");
    expect(resolveRatePlanId(null, null)).toBe("");
    expect(resolveRatePlanId({}, { total: 100, ratePlanOptions: "nao-e-array" })).toBe("");
    expect(resolveRatePlanId({}, { total: NaN, ratePlanOptions: [{ ratePlanId: "x", total: NaN }] })).toBe("");
  });

  it("tolera cêntimos de arredondamento entre a opção e o total cotado", () => {
    const quote = {
      total: 1282.1,
      ratePlanOptions: [{ ratePlanId: "rp-flex", name: "Flexible", total: 1282.11, nightlyRate: 0, cleaningFee: 0 }],
    };
    expect(resolveRatePlanId({}, quote)).toBe("rp-flex");
  });
});

import {
  decideFolioReconciliation,
  settleAlertDecision,
  canRunCardSettleSweep,
  SETTLE_ALERT_SCHEDULE_MS,
  SETTLE_FINAL_ALERT_AGE_MS,
} from "./checkout-card-charge";

describe("decideFolioReconciliation — acerto do folio antes do registo", () => {
  it("Guesty abaixo do site e folio sem pagamentos: lança a diferença como fee", () => {
    expect(decideFolioReconciliation({ stayEur: 2524.07, balanceDue: 2300, totalPaid: 0, ourPaymentRecorded: false }))
      .toEqual({ action: "add-fee", delta: 224.07 });
  });

  it("Guesty acima do site: anota a divergência, não mexe no folio", () => {
    expect(decideFolioReconciliation({ stayEur: 2524.07, balanceDue: 2766.17, totalPaid: 0, ourPaymentRecorded: false }))
      .toEqual({ action: "price-gap", gap: 242.1 });
  });

  it("GY-Huf4Lp8L: com o pagamento já no folio nunca lança fee, por maior que pareça a diferença", () => {
    expect(decideFolioReconciliation({ stayEur: 2524.07, balanceDue: 242.1, totalPaid: 2524.07, ourPaymentRecorded: true }))
      .toEqual({ action: "none", reason: "already-paid" });
    // Mesmo que a nota do nosso registo não seja legível, o total pago chega.
    expect(decideFolioReconciliation({ stayEur: 2524.07, balanceDue: 242.1, totalPaid: 2524.07, ourPaymentRecorded: false }))
      .toEqual({ action: "none", reason: "already-paid" });
  });

  it("diferenças de arredondamento até 50 cêntimos não mexem em nada", () => {
    expect(decideFolioReconciliation({ stayEur: 1000, balanceDue: 999.6, totalPaid: 0, ourPaymentRecorded: false }))
      .toEqual({ action: "none", reason: "matches" });
    expect(decideFolioReconciliation({ stayEur: 1000, balanceDue: 1000.4, totalPaid: 0, ourPaymentRecorded: false }))
      .toEqual({ action: "none", reason: "matches" });
  });

  it("folio a zero sem pagamentos não gera fee nem divergência", () => {
    expect(decideFolioReconciliation({ stayEur: 1000, balanceDue: 0, totalPaid: 0, ourPaymentRecorded: false }))
      .toEqual({ action: "none", reason: "matches" });
  });
});

describe("settleAlertDecision — calendário dos alertas de pago sem reserva", () => {
  const H = 60 * 60 * 1000;
  const created = 1_800_000_000_000;

  it("o primeiro alerta sai logo", () => {
    expect(settleAlertDecision({ now: created + 1000, firstAt: null, sent: 0, finalSent: false, paidAt: created }))
      .toBe("regular");
  });

  it("os seguintes só a +1 h, +6 h e +24 h do primeiro, e depois mais nenhum", () => {
    const first = created + 60_000;
    const at = (h: number, sent: number) =>
      settleAlertDecision({ now: first + h * H, firstAt: first, sent, finalSent: false, paidAt: created });
    expect(at(0.5, 1)).toBeNull();
    expect(at(1, 1)).toBe("regular");
    expect(at(5, 2)).toBeNull();
    expect(at(6, 2)).toBe("regular");
    expect(at(23, 3)).toBeNull();
    expect(at(24, 3)).toBe("regular");
    expect(at(30, 4)).toBeNull();
    expect(SETTLE_ALERT_SCHEDULE_MS).toHaveLength(4);
  });

  it("na última hora da janela de 48 h sai o último aviso, uma só vez", () => {
    const now = created + SETTLE_FINAL_ALERT_AGE_MS + 5 * 60_000;
    expect(settleAlertDecision({ now, firstAt: created, sent: 4, finalSent: false, paidAt: created })).toBe("final");
    expect(settleAlertDecision({ now, firstAt: created, sent: 4, finalSent: true, paidAt: created })).toBeNull();
  });

  it("depois do último aviso não volta a sair 'o sweep continua a tentar'", () => {
    const now = created + 30 * H;
    expect(settleAlertDecision({ now, firstAt: created, sent: 2, finalSent: true, paidAt: created })).toBeNull();
  });

  it("conta a partir do pagamento: um checkout de há 7 dias pago agora começa no aviso 1", () => {
    const paidNow = created + 7 * 24 * H;
    expect(settleAlertDecision({ now: paidNow + 60_000, firstAt: null, sent: 0, finalSent: false, paidAt: paidNow }))
      .toBe("regular");
  });
});

describe("canRunCardSettleSweep — o sweep só corre no serviço de produção", () => {
  const prod = { NODE_ENV: "production", RENDER_SERVICE_ID: "srv-d700n5fgi27c73f9bse0", RENDER_GIT_BRANCH: "main", SITE_URL: "https://www.portugalactive.com" };

  it("produção corre", () => {
    expect(canRunCardSettleSweep(prod as any)).toBe(true);
  });

  it("o DEV partilha a BD e não pode pegar em pagamentos reais", () => {
    expect(canRunCardSettleSweep({ ...prod, RENDER_GIT_BRANCH: "dev" } as any)).toBe(false);
    expect(canRunCardSettleSweep({ ...prod, RENDER_SERVICE_ID: "srv-outro" } as any)).toBe(false);
    expect(canRunCardSettleSweep({ ...prod, SITE_URL: "https://dev.portugalactive.com" } as any)).toBe(false);
  });

  it("desenvolvimento local e testes não correm", () => {
    expect(canRunCardSettleSweep({ NODE_ENV: "development" } as any)).toBe(false);
    expect(canRunCardSettleSweep({ NODE_ENV: "test" } as any)).toBe(false);
  });

  it("um npm start local em modo produção, mesmo com a BD real no .env.local, não corre", () => {
    expect(canRunCardSettleSweep({ NODE_ENV: "production", DATABASE_URL: "mysql://real" } as any)).toBe(false);
    expect(canRunCardSettleSweep({ NODE_ENV: "production", SITE_URL: "https://www.portugalactive.com" } as any)).toBe(false);
  });

  it("CARD_SETTLE_SWEEP=false desliga em produção sem deploy de código", () => {
    expect(canRunCardSettleSweep({ ...prod, CARD_SETTLE_SWEEP: "false" } as any)).toBe(false);
  });
});
