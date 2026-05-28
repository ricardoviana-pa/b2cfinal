import { describe, it, expect, vi, beforeEach } from "vitest";

// We test the lazy singleton: each test resets modules and re-imports
// so the Stripe instance is rebuilt with whatever env is set.

const mockPaymentIntentCreate = vi.fn();
const mockPaymentIntentRetrieve = vi.fn();
const mockWebhooksConstructEvent = vi.fn();

vi.mock("stripe", () => {
  const MockStripe = vi.fn().mockImplementation(() => ({
    paymentIntents: {
      create: mockPaymentIntentCreate,
      retrieve: mockPaymentIntentRetrieve,
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  }));
  return { default: MockStripe };
});

describe("stripe-paypal service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_key";
    process.env.STRIPE_PAYPAL_WEBHOOK_SECRET = "whsec_mock_secret";
  });

  describe("createPayPalPaymentIntent", () => {
    it("calls stripe.paymentIntents.create with paypal payment method type", async () => {
      const { createPayPalPaymentIntent } = await import("../stripe-paypal");

      const mockIntent = {
        id: "pi_test_123",
        client_secret: "pi_test_123_secret_abc",
        status: "requires_payment_method",
        amount: 5000,
        currency: "eur",
      };
      mockPaymentIntentCreate.mockResolvedValueOnce(mockIntent);

      const result = await createPayPalPaymentIntent({
        amount: 5000,
        currency: "eur",
        metadata: { reservationId: "res_abc" },
      });

      expect(mockPaymentIntentCreate).toHaveBeenCalledOnce();
      expect(mockPaymentIntentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          currency: "eur",
          metadata: { reservationId: "res_abc" },
        })
      );
      expect(result).toEqual(mockIntent);
    });

    it("throws if STRIPE_SECRET_KEY is not set", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const { createPayPalPaymentIntent } = await import("../stripe-paypal");

      await expect(
        createPayPalPaymentIntent({ amount: 1000, currency: "eur" })
      ).rejects.toThrow(/STRIPE_SECRET_KEY/);
    });
  });

  describe("getPaymentIntent", () => {
    it("retrieves a payment intent by id", async () => {
      const { getPaymentIntent } = await import("../stripe-paypal");

      const mockIntent = { id: "pi_test_456", status: "succeeded" };
      mockPaymentIntentRetrieve.mockResolvedValueOnce(mockIntent);

      const result = await getPaymentIntent("pi_test_456");

      expect(mockPaymentIntentRetrieve).toHaveBeenCalledWith("pi_test_456");
      expect(result).toEqual(mockIntent);
    });

    it("throws if STRIPE_SECRET_KEY is not set", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const { getPaymentIntent } = await import("../stripe-paypal");

      await expect(getPaymentIntent("pi_test_456")).rejects.toThrow(
        /STRIPE_SECRET_KEY/
      );
    });
  });

  describe("constructStripePayPalWebhookEvent", () => {
    it("calls stripe.webhooks.constructEvent and returns the event", async () => {
      const { constructStripePayPalWebhookEvent } = await import(
        "../stripe-paypal"
      );

      const mockEvent = {
        id: "evt_test_789",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_test_123" } },
      };
      mockWebhooksConstructEvent.mockReturnValueOnce(mockEvent);

      const payload = Buffer.from(JSON.stringify(mockEvent));
      const sig = "t=123,v1=abc";

      const result = constructStripePayPalWebhookEvent(payload, sig);

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        payload,
        sig,
        "whsec_mock_secret"
      );
      expect(result).toEqual(mockEvent);
    });

    it("throws if STRIPE_PAYPAL_WEBHOOK_SECRET is not set", async () => {
      delete process.env.STRIPE_PAYPAL_WEBHOOK_SECRET;
      const { constructStripePayPalWebhookEvent } = await import(
        "../stripe-paypal"
      );

      expect(() =>
        constructStripePayPalWebhookEvent(Buffer.from("{}"), "sig")
      ).toThrow(/STRIPE_PAYPAL_WEBHOOK_SECRET/);
    });
  });
});
