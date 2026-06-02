import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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

describe("stripe-klarna service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_mock_key";
    process.env.STRIPE_KLARNA_WEBHOOK_SECRET = "whsec_mock_klarna_secret";
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("createKlarnaPaymentIntent", () => {
    it("calls stripe.paymentIntents.create with klarna payment method type", async () => {
      const { createKlarnaPaymentIntent } = await import("../stripe-klarna");
      const mockIntent = {
        id: "pi_test_klarna_123",
        client_secret: "pi_test_klarna_123_secret_abc",
        status: "requires_payment_method",
        amount: 5000,
        currency: "eur",
      };
      mockPaymentIntentCreate.mockResolvedValueOnce(mockIntent);

      const result = await createKlarnaPaymentIntent({
        amount: 5000,
        currency: "eur",
        metadata: { source: "website-klarna" },
      });

      expect(mockPaymentIntentCreate).toHaveBeenCalledOnce();
      expect(mockPaymentIntentCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 5000,
          currency: "eur",
          payment_method_types: ["klarna"],
          metadata: { source: "website-klarna" },
        })
      );
      expect(result).toEqual(mockIntent);
    });

    it("throws if STRIPE_SECRET_KEY is not set", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const { createKlarnaPaymentIntent } = await import("../stripe-klarna");
      await expect(
        createKlarnaPaymentIntent({ amount: 1000, currency: "eur" })
      ).rejects.toThrow(/STRIPE_SECRET_KEY/);
    });
  });

  describe("getPaymentIntent", () => {
    it("retrieves a payment intent by id", async () => {
      const { getPaymentIntent } = await import("../stripe-klarna");
      const mockIntent = { id: "pi_test_456", status: "succeeded" };
      mockPaymentIntentRetrieve.mockResolvedValueOnce(mockIntent);

      const result = await getPaymentIntent("pi_test_456");

      expect(mockPaymentIntentRetrieve).toHaveBeenCalledWith("pi_test_456");
      expect(result).toEqual(mockIntent);
    });

    it("throws if STRIPE_SECRET_KEY is not set", async () => {
      delete process.env.STRIPE_SECRET_KEY;
      const { getPaymentIntent } = await import("../stripe-klarna");
      await expect(getPaymentIntent("pi_test_456")).rejects.toThrow(/STRIPE_SECRET_KEY/);
    });
  });

  describe("constructStripeKlarnaWebhookEvent", () => {
    it("calls stripe.webhooks.constructEvent and returns the event", async () => {
      const { constructStripeKlarnaWebhookEvent } = await import("../stripe-klarna");
      const mockEvent = {
        id: "evt_test_klarna_789",
        type: "payment_intent.succeeded",
        data: { object: { id: "pi_test_klarna_123" } },
      };
      mockWebhooksConstructEvent.mockReturnValueOnce(mockEvent);

      const payload = Buffer.from(JSON.stringify(mockEvent));
      const sig = "t=123,v1=abc";
      const result = constructStripeKlarnaWebhookEvent(payload, sig);

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(payload, sig, "whsec_mock_klarna_secret");
      expect(result).toEqual(mockEvent);
    });

    it("throws if STRIPE_KLARNA_WEBHOOK_SECRET is not set", async () => {
      delete process.env.STRIPE_KLARNA_WEBHOOK_SECRET;
      const { constructStripeKlarnaWebhookEvent } = await import("../stripe-klarna");
      expect(() =>
        constructStripeKlarnaWebhookEvent(Buffer.from("{}"), "sig")
      ).toThrow(/STRIPE_KLARNA_WEBHOOK_SECRET/);
    });
  });
});
