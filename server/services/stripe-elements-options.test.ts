import { describe, expect, it } from "vitest";
import { CHECKOUT_SETUP_FUTURE_USAGE } from "@shared/stripeSetupFutureUsage";
import { expressCheckoutElementsOptions } from "@/components/booking/stripeElementsOptions";

describe("Elements das wallets (Apple Pay / Google Pay)", () => {
  // A Stripe recusa o confirm quando o setupFutureUsage do Elements não é o
  // setup_future_usage do PaymentIntent; as wallets ficaram assim de 29 ago a
  // 29 out 2026 (o servidor cria sempre com CHECKOUT_SETUP_FUTURE_USAGE).
  it("espelha o setup_future_usage do PaymentIntent", () => {
    expect(CHECKOUT_SETUP_FUTURE_USAGE).toBe("off_session");
    expect(expressCheckoutElementsOptions(2700, "EUR", "pt")).toMatchObject({
      mode: "payment",
      amount: 270000,
      currency: "eur",
      locale: "pt",
      setupFutureUsage: CHECKOUT_SETUP_FUTURE_USAGE,
    });
  });

  it("arredonda ao cêntimo e usa eur sem moeda", () => {
    expect(expressCheckoutElementsOptions(1234.565, undefined, "en")).toMatchObject({ amount: 123457, currency: "eur" });
  });
});
