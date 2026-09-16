import { describe, expect, it } from "vitest";
import { canSendCheckoutRecovery, CHECKOUT_EMAIL_ORIGIN } from "./checkout-email";

const production = {
  CHECKOUT_RECOVERY: "true", SITE_URL: CHECKOUT_EMAIL_ORIGIN,
  NODE_ENV: "production", RENDER_GIT_BRANCH: "main",
};

describe("checkout recovery deployment boundary", () => {
  it("requires explicit production configuration", () => {
    expect(canSendCheckoutRecovery({})).toBe(false);
    expect(canSendCheckoutRecovery({ ...production, CHECKOUT_RECOVERY: undefined })).toBe(false);
    expect(canSendCheckoutRecovery({ ...production, SITE_URL: undefined })).toBe(false);
    expect(canSendCheckoutRecovery(production)).toBe(true);
  });
  it("honors the kill switch", () => {
    expect(canSendCheckoutRecovery({ ...production, CHECKOUT_RECOVERY: "false" })).toBe(false);
  });
  it("rejects DEV even if the opt-in switch or production URL is copied", () => {
    expect(canSendCheckoutRecovery({ ...production, SITE_URL: "https://dev.portugalactive.com" })).toBe(false);
    expect(canSendCheckoutRecovery({ ...production, RENDER_GIT_BRANCH: "dev" })).toBe(false);
    expect(canSendCheckoutRecovery({ ...production, NODE_ENV: "development" })).toBe(false);
  });
  it.each([
    "http://www.portugalactive.com", "https://www.portugalactive.com.evil.test",
    "https://user@www.portugalactive.com", "https://www.portugalactive.com/preview",
    "https://www.portugalactive.com/?preview=true", "not-a-url",
  ])("rejects non-production origins: %s", (SITE_URL) => {
    expect(canSendCheckoutRecovery({ ...production, SITE_URL })).toBe(false);
  });
  it("accepts the production apex and existing URL aliases", () => {
    expect(canSendCheckoutRecovery({ ...production, SITE_URL: "https://portugalactive.com/" })).toBe(true);
    expect(canSendCheckoutRecovery({ ...production, SITE_URL: undefined, APP_URL: CHECKOUT_EMAIL_ORIGIN })).toBe(true);
  });
});
