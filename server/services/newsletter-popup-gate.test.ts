/**
 * The pop-up's eligibility rules live in shared/newsletterPopup.ts (pure), so
 * the "once per 30 days, never after subscribing" contract is tested here
 * without a DOM.
 */
import { describe, expect, it } from "vitest";
import {
  NL_POPUP_COOLDOWN_DAYS,
  hasEmailOrRecoveryUtm,
  isExcludedPath,
  isWithinCooldown,
  popupEligibility,
  type PopupEligibilityInput,
} from "@shared/newsletterPopup";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-05T12:00:00Z");
const base: PopupEligibilityInput = {
  enabled: true, locales: ["pt"], lang: "pt", path: "/homes/casa-x",
  subscribed: null, lastShownAt: null, skipSession: null, cookieChoice: "essential",
  visible: true, now: NOW,
};

describe("popup eligibility", () => {
  it("shows a first-time visitor on an eligible page once the cookie banner is closed", () => {
    expect(popupEligibility(base)).toEqual({ eligible: true });
    expect(popupEligibility({ ...base, cookieChoice: null })).toEqual({ eligible: false, reason: "cookie_banner" });
    expect(popupEligibility({ ...base, cookieChoice: "all" })).toEqual({ eligible: true });
  });
  it("shows once per 30 days: closing counts, the 31st day shows again", () => {
    expect(NL_POPUP_COOLDOWN_DAYS).toBe(30);
    expect(popupEligibility({ ...base, lastShownAt: String(NOW - 1000) })).toEqual({ eligible: false, reason: "cooldown" });
    expect(popupEligibility({ ...base, lastShownAt: String(NOW - 29 * DAY) })).toEqual({ eligible: false, reason: "cooldown" });
    expect(popupEligibility({ ...base, lastShownAt: String(NOW - 30 * DAY) })).toEqual({ eligible: true });
    expect(popupEligibility({ ...base, lastShownAt: String(NOW - 31 * DAY) })).toEqual({ eligible: true });
    expect(isWithinCooldown("garbage", NOW)).toBe(false);
    expect(isWithinCooldown(String(NOW - DAY), NOW, 2)).toBe(true);
    expect(isWithinCooldown(String(NOW - 3 * DAY), NOW, 2)).toBe(false);
  });
  it("never shows again after a subscription, from any surface", () => {
    expect(popupEligibility({ ...base, subscribed: "1" })).toEqual({ eligible: false, reason: "subscribed" });
    expect(popupEligibility({ ...base, subscribed: "1", lastShownAt: String(NOW - 90 * DAY) })).toEqual({ eligible: false, reason: "subscribed" });
  });
  it("respects the server switch and the reviewed languages", () => {
    expect(popupEligibility({ ...base, enabled: false })).toEqual({ eligible: false, reason: "disabled" });
    expect(popupEligibility({ ...base, lang: "es" })).toEqual({ eligible: false, reason: "locale" });
    expect(popupEligibility({ ...base, locales: ["pt", "es"], lang: "es" })).toEqual({ eligible: true });
  });
  it("stays out of the checkout, the account, the legal pages and its own confirmation page", () => {
    for (const path of ["/checkout/abc", "/booking/thank-you/1", "/login", "/account", "/admin/leads", "/legal/privacy", "/404", "/newsletter/confirmada"]) {
      expect(popupEligibility({ ...base, path })).toEqual({ eligible: false, reason: "path" });
      expect(isExcludedPath(path)).toBe(true);
    }
    for (const path of ["/", "/homes", "/homes/casa-x", "/blog/artigo", "/destinations/minho", "/checkouts-not-really"]) {
      expect(isExcludedPath(path)).toBe(false);
    }
  });
  it("skips visitors who arrived from one of our emails or the checkout recovery, for the whole session", () => {
    expect(hasEmailOrRecoveryUtm("?utm_source=email&utm_medium=email&utm_campaign=2026-10_o1_pt_x")).toBe(true);
    expect(hasEmailOrRecoveryUtm("?utm_source=Email")).toBe(true);
    expect(hasEmailOrRecoveryUtm("utm_medium=recovery")).toBe(true);
    expect(hasEmailOrRecoveryUtm("?utm_source=google&utm_medium=cpc")).toBe(false);
    expect(hasEmailOrRecoveryUtm("")).toBe(false);
    expect(popupEligibility({ ...base, skipSession: "1" })).toEqual({ eligible: false, reason: "utm" });
  });
  it("waits for a visible document", () => {
    expect(popupEligibility({ ...base, visible: false })).toEqual({ eligible: false, reason: "hidden" });
  });
});
