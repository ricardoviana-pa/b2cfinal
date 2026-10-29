/**
 * PayPal e Klarna: o email com que o hóspede pagou passa a ser o do checkout
 * quando o corrigiu no passo 3 (o caminho completo, do regresso ao site e dos
 * webhooks, está em checkout-sandbox/wallet-confirmation.test.ts).
 */
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ getBookingIntent: vi.fn(), markBookingIntentPaid: vi.fn() }));
vi.mock("../db", () => db);
const emails = vi.hoisted(() => ({ fireCheckoutPaidEmails: vi.fn(async () => {}) }));
vi.mock("../routers/checkout", () => emails);

import { completeCheckoutIntent, paidEmailUpdate } from "./checkout-confirmation";

describe("paidEmailUpdate", () => {
  it("corrigido no passo 3: o do pagamento", () => {
    expect(paidEmailUpdate("guest@typo.invalid", "guest@checkout.invalid")).toBe("guest@checkout.invalid");
  });

  it("checkout sem email: o do pagamento", () => {
    expect(paidEmailUpdate(null, "guest@checkout.invalid")).toBe("guest@checkout.invalid");
    expect(paidEmailUpdate(undefined, "guest@checkout.invalid")).toBe("guest@checkout.invalid");
  });

  it("o mesmo com outras maiúsculas ou espaços: nada a gravar", () => {
    expect(paidEmailUpdate("Guest@Checkout.INVALID", "guest@checkout.invalid")).toBeNull();
    expect(paidEmailUpdate("guest@checkout.invalid", "  guest@checkout.invalid ")).toBeNull();
  });

  it("tira os espaços à volta do email do pagamento", () => {
    expect(paidEmailUpdate("guest@typo.invalid", " guest@checkout.invalid ")).toBe("guest@checkout.invalid");
  });

  it.each([[undefined], [null], [""], ["not-an-email"], [42], ["a@b"], [`${"x".repeat(320)}@checkout.invalid`]])(
    "email do pagamento ausente ou inválido (%s): fica o do checkout",
    (paid) => {
      expect(paidEmailUpdate("guest@checkout.invalid", paid)).toBeNull();
    },
  );
});

describe("completeCheckoutIntent com o email do pagamento", () => {
  const intent = { id: "intent-1", email: "guest@typo.invalid", status: "payment_pending", reservationId: null };

  it("grava o email do pagamento na transição para pago e os emails vão para ele", async () => {
    db.getBookingIntent.mockResolvedValueOnce({ ...intent });
    db.markBookingIntentPaid.mockResolvedValueOnce(true);
    await completeCheckoutIntent("intent-1", "res-1", "GY-1", undefined, { email: "guest@checkout.invalid" });
    expect(db.markBookingIntentPaid).toHaveBeenCalledWith("intent-1", "res-1", "GY-1", { email: "guest@checkout.invalid" });
    expect(emails.fireCheckoutPaidEmails).toHaveBeenCalledWith(
      expect.objectContaining({ email: "guest@checkout.invalid", status: "paid", reservationId: "res-1", confirmationCode: "GY-1" }),
      "intent-1",
      undefined,
    );
  });

  it("sem email do pagamento (cartão, sweep): nada muda no email", async () => {
    db.getBookingIntent.mockResolvedValueOnce({ ...intent });
    db.markBookingIntentPaid.mockResolvedValueOnce(true);
    await completeCheckoutIntent("intent-1", "res-1", "GY-1", { flexGift: false, at: 1 });
    expect(db.markBookingIntentPaid).toHaveBeenLastCalledWith("intent-1", "res-1", "GY-1", {});
    expect(emails.fireCheckoutPaidEmails).toHaveBeenLastCalledWith(
      expect.objectContaining({ email: "guest@typo.invalid" }),
      "intent-1",
      { flexGift: false, at: 1 },
    );
  });

  it("já pago por outro caminho: nem grava nem manda emails", async () => {
    emails.fireCheckoutPaidEmails.mockClear();
    db.getBookingIntent.mockResolvedValueOnce({ ...intent });
    db.markBookingIntentPaid.mockResolvedValueOnce(false);
    await completeCheckoutIntent("intent-1", "res-1", "GY-1", undefined, { email: "guest@checkout.invalid" });
    expect(emails.fireCheckoutPaidEmails).not.toHaveBeenCalled();
  });
});
