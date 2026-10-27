/**
 * Alertas de pagamento sem reserva: o texto tem de dizer a verdade sobre o
 * estado (reserva criada ou não, pagamento confirmado ou não) e o calendário
 * só avança quando o email sai mesmo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const stripe = {
  pi: null as any,
  failRetrieve: false,
  updates: [] as Array<Record<string, string>>,
};
vi.mock("./stripe-klarna", () => ({
  getPaymentIntent: vi.fn(async () => {
    if (stripe.failRetrieve) throw new Error("stripe down");
    return { ...stripe.pi, metadata: { ...stripe.pi.metadata } };
  }),
  updatePaymentIntentMetadata: vi.fn(async (_id: string, patch: Record<string, string>) => {
    stripe.updates.push(patch);
    Object.assign(stripe.pi.metadata, patch);
  }),
  findSucceededPaymentIntentByIntentId: vi.fn(),
  createPartialRefund: vi.fn(),
}));

let intentRow: any = {};
vi.mock("../db", () => ({
  getBookingIntent: vi.fn(async () => ({ ...intentRow })),
  updateBookingIntent: vi.fn(async () => true),
}));

const mail = { delivered: true, sent: [] as Array<{ subject: string; lines: string[] }> };
vi.mock("./transactional-email", () => ({
  sendOpsAlert: vi.fn(async (subject: string, lines: string[]) => {
    mail.sent.push({ subject, lines });
    return mail.delivered;
  }),
}));

import { alertFailedSettle } from "./checkout-card-charge";

let n = 0;
/** Cada teste usa um intent novo: o throttle em memória é por intent. */
function world(opts: { status?: string; metadata?: Record<string, string>; reservationId?: string | null } = {}) {
  n += 1;
  const intentId = `intent-alert-${n}`;
  intentRow = {
    id: intentId,
    propertyName: "T5-Aura",
    guestFirstName: "Daniel",
    email: "guest@example.com",
    checkIn: "2026-11-20",
    checkOut: "2026-11-26",
    quote: { total: 2524.07 },
    reservationId: opts.reservationId ?? null,
    createdAt: new Date(Date.now() - 60_000),
  };
  stripe.pi = {
    id: `pi_alert_${n}`,
    status: opts.status ?? "succeeded",
    created: Math.floor(Date.now() / 1000) - 60,
    metadata: { flow: "card_v2", intentId, ...(opts.metadata ?? {}) },
  };
  stripe.failRetrieve = false;
  stripe.updates = [];
  mail.delivered = true;
  mail.sent = [];
  return { intentId, piId: stripe.pi.id };
}

describe("alertFailedSettle", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sem reserva: 'PAGO SEM RESERVA', não voltar a cobrar, e o calendário avança", async () => {
    const { intentId, piId } = world();
    await alertFailedSettle(intentId, piId, "guesty 503", "sweep");
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].subject).toMatch(/^PAGO SEM RESERVA \(aviso 1 de 4\)/);
    expect(mail.sent[0].lines.join("\n")).toContain("NÃO voltar a cobrar");
    expect(stripe.updates[0]).toMatchObject({ settleAlerts: "1" });
  });

  it("com a reserva já criada: diz que existe e proíbe criar outra ou reembolsar", async () => {
    const { intentId, piId } = world({ metadata: { guestyReservationId: "res-9", guestyConfirmationCode: "GY-Huf4Lp8L" } });
    await alertFailedSettle(intentId, piId, "balanceDue unreadable", "webhook-card");
    const body = mail.sent[0].lines.join("\n");
    expect(mail.sent[0].subject).toContain("RESERVA CRIADA");
    expect(mail.sent[0].subject).toContain("GY-Huf4Lp8L");
    expect(body).toContain("JÁ EXISTE");
    expect(body).toContain("NÃO criar outra reserva, NÃO reembolsar");
    expect(body).not.toContain("NÃO ficou criada");
  });

  it("um PI que não foi pago não gera alerta nenhum", async () => {
    const { intentId, piId } = world({ status: "requires_payment_method" });
    await alertFailedSettle(intentId, piId, "x", "finalize");
    expect(mail.sent).toHaveLength(0);
  });

  it("com o Stripe ilegível, o alerta sai mas manda verificar antes de agir", async () => {
    const { intentId, piId } = world();
    stripe.failRetrieve = true;
    await alertFailedSettle(intentId, piId, "x", "sweep");
    expect(mail.sent[0].subject).toMatch(/^VERIFICAR NO STRIPE/);
    expect(stripe.updates).toHaveLength(0);
  });

  it("um email que não saiu não gasta o passo do calendário", async () => {
    const { intentId, piId } = world();
    mail.delivered = false;
    await alertFailedSettle(intentId, piId, "x", "sweep");
    expect(mail.sent).toHaveLength(1);
    expect(stripe.updates).toHaveLength(0);
  });

  it("um pagamento com mais de 47 h recebe o último aviso e fica marcado", async () => {
    const { intentId, piId } = world();
    stripe.pi.created = Math.floor((Date.now() - 47.5 * 3_600_000) / 1000);
    await alertFailedSettle(intentId, piId, "x", "sweep");
    expect(mail.sent[0].subject).toContain("ÚLTIMO AVISO");
    expect(stripe.updates[0]).toEqual({ settleAlertFinal: "1" });
  });
});
